import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  calculateCentroid,
  calculatePolygonAreaSqm,
  findOverlappingParcel,
  sqmToAcres,
} from './gis';
import { SEED_ABETIFI_PARCELS } from './seedData';
import type {
  AllocationPayment,
  DocumentType,
  LandAllocation,
  LandApplication,
  LandParcel,
  LandUseType,
  LatLngPoint,
  ParcelStatus,
  UserProfile,
  UserRole,
} from '../types';

function makeSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

function clampStr(value: string, maxLen: number): string {
  return value.trim().slice(0, maxLen);
}

export async function syncUserOnSignIn(firebaseUser: User): Promise<UserProfile> {
  const userRef = doc(db, 'users', firebaseUser.uid);
  const privateRef = doc(db, 'users', firebaseUser.uid, 'private', 'info');
  const isBootstrapped =
    firebaseUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL &&
    firebaseUser.emailVerified;

  try {
    const snap = await getDoc(userRef);
    let profile: UserProfile;

    if (!snap.exists()) {
      const initialRole: UserRole = isBootstrapped ? 'super_admin' : 'applicant';
      const newProfile = {
        uid: firebaseUser.uid,
        displayName: clampStr(
          firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Palace User',
          120
        ),
        role: initialRole,
        department: isBootstrapped ? 'Ahenfie Lands Secretariat' : 'Public Applicant',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(userRef, newProfile);
      profile = {
        uid: newProfile.uid,
        displayName: newProfile.displayName,
        role: newProfile.role,
        department: newProfile.department,
      };
    } else {
      const data = snap.data();
      profile = {
        uid: data.uid,
        displayName: data.displayName,
        role: isBootstrapped ? 'super_admin' : (data.role as UserRole),
        department: data.department,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    }

    await setDoc(
      privateRef,
      {
        uid: firebaseUser.uid,
        email: clampStr(firebaseUser.email || 'no-email@local', 200),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return profile;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${firebaseUser.uid}`);
  }
}

export async function seedInitialCadastreIfEmpty(actor: UserProfile): Promise<boolean> {
  if (!['super_admin', 'palace_admin', 'surveyor'].includes(actor.role)) {
    return false;
  }

  try {
    const existingSnap = await getDocs(
      query(collection(db, 'parcels'), where('isPublicCadastre', '==', true), limit(1))
    );
    if (!existingSnap.empty) {
      return false;
    }

    const batch = writeBatch(db);
    for (const spec of SEED_ABETIFI_PARCELS) {
      const areaSqm = calculatePolygonAreaSqm(spec.coordinates);
      const areaAcres = sqmToAcres(areaSqm);
      const centroid = calculateCentroid(spec.coordinates);
      const parcelRef = doc(db, 'parcels', spec.docId);

      batch.set(parcelRef, {
        parcelCode: spec.parcelCode,
        title: spec.title,
        zone: spec.zone,
        landUse: spec.landUse,
        areaSqm,
        areaAcres,
        centroidLat: centroid.lat,
        centroidLng: centroid.lng,
        coordinates: spec.coordinates,
        status: spec.status,
        surveyPlanRef: spec.surveyPlanRef,
        customaryFeeGhs: spec.customaryFeeGhs,
        notes: spec.notes,
        isPublicCadastre: true,
        createdByUid: actor.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const docRef = doc(db, 'documents', `doc-${spec.docId}`);
      batch.set(docRef, {
        parcelId: spec.docId,
        parcelCode: spec.parcelCode,
        documentType: 'Survey Plan',
        referenceNo: spec.surveyPlanRef,
        fileName: `${spec.parcelCode}_Cadastral_Plan.pdf`,
        summary: `Verified Kwahu Abetifi survey plan for ${spec.title} (${areaAcres.toFixed(3)} acres).`,
        verifiedBy: 'Palace Survey Unit',
        isPublicCadastre: true,
        uploadedByUid: actor.uid,
        uploadedAt: serverTimestamp(),
      });

      const historyRef = doc(db, 'parcelHistory', `hist-${spec.docId}`);
      batch.set(historyRef, {
        parcelId: spec.docId,
        parcelCode: spec.parcelCode,
        eventType: 'Registered',
        summary: `Parcel ${spec.parcelCode} digitized in ${spec.zone} with status ${spec.status}.`,
        newStatus: spec.status,
        actorUid: actor.uid,
        actorName: actor.displayName,
        isPublicCadastre: true,
        timestamp: serverTimestamp(),
      });
    }

    const auditRef = doc(db, 'auditLogs', makeSafeId('audit'));
    batch.set(auditRef, {
      userUid: actor.uid,
      userName: actor.displayName,
      userRole: actor.role,
      action: 'Initialized Baseline Cadastre',
      entityType: 'parcels',
      entityId: 'seed-cadastre',
      details: `Loaded ${SEED_ABETIFI_PARCELS.length} baseline Abetifi Palace land parcels into the GIS registry.`,
      timestamp: serverTimestamp(),
    });

    await batch.commit();
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'parcels');
  }
}

export interface RegisterParcelInput {
  parcelCode: string;
  title: string;
  zone: string;
  landUse: LandUseType;
  coordinates: LatLngPoint[];
  status: ParcelStatus;
  surveyPlanRef?: string;
  customaryFeeGhs: number;
  notes?: string;
  documentFileName?: string;
}

export async function registerParcel(
  input: RegisterParcelInput,
  existingParcels: LandParcel[],
  actor: UserProfile
): Promise<string> {
  const normalizedCode = clampStr(input.parcelCode.toUpperCase().replace(/[^A-Z0-9-]/g, '-'), 32);
  if (normalizedCode.length < 3) {
    throw new Error('Parcel Code must be at least 3 alphanumeric characters.');
  }
  if (input.coordinates.length < 3) {
    throw new Error('At least 3 boundary coordinate vertices are required to form a parcel polygon.');
  }
  if (existingParcels.some((p) => p.parcelCode.toUpperCase() === normalizedCode)) {
    throw new Error(`Parcel Code ${normalizedCode} already exists in the registry.`);
  }

  const overlap = findOverlappingParcel(input.coordinates, existingParcels);
  if (overlap) {
    throw new Error(
      `Boundary overlaps existing parcel ${overlap.parcelCode} (${overlap.title}). Adjust vertices to prevent double allocation.`
    );
  }

  const areaSqm = calculatePolygonAreaSqm(input.coordinates);
  if (areaSqm <= 0) {
    throw new Error('Calculated parcel area must be greater than 0 sq. meters.');
  }
  const areaAcres = sqmToAcres(areaSqm);
  const centroid = calculateCentroid(input.coordinates);
  const parcelId = makeSafeId(`parcel-${normalizedCode.toLowerCase()}`);

  const batch = writeBatch(db);
  const parcelRef = doc(db, 'parcels', parcelId);
  batch.set(parcelRef, {
    parcelCode: normalizedCode,
    title: clampStr(input.title, 160),
    zone: clampStr(input.zone, 120),
    landUse: input.landUse,
    areaSqm,
    areaAcres,
    centroidLat: centroid.lat,
    centroidLng: centroid.lng,
    coordinates: input.coordinates.slice(0, 50),
    status: input.status,
    surveyPlanRef: input.surveyPlanRef ? clampStr(input.surveyPlanRef, 80) : '',
    customaryFeeGhs: Math.max(0, Number(input.customaryFeeGhs) || 0),
    notes: input.notes ? clampStr(input.notes, 1000) : '',
    isPublicCadastre: true,
    createdByUid: actor.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (input.surveyPlanRef || input.documentFileName) {
    const docRef = doc(db, 'documents', makeSafeId('doc'));
    batch.set(docRef, {
      parcelId,
      parcelCode: normalizedCode,
      documentType: 'Survey Plan',
      referenceNo: clampStr(input.surveyPlanRef || `SP-${normalizedCode}`, 80),
      fileName: clampStr(input.documentFileName || `${normalizedCode}_Survey_Plan.pdf`, 160),
      summary: `Initial survey plan registered for ${clampStr(input.title, 120)}.`,
      verifiedBy: actor.displayName,
      isPublicCadastre: true,
      uploadedByUid: actor.uid,
      uploadedAt: serverTimestamp(),
    });
  }

  batch.set(doc(db, 'parcelHistory', makeSafeId('hist')), {
    parcelId,
    parcelCode: normalizedCode,
    eventType: 'Registered',
    summary: `Registered ${normalizedCode} (${areaAcres.toFixed(3)} ac) in ${clampStr(input.zone, 120)}.`,
    newStatus: input.status,
    actorUid: actor.uid,
    actorName: actor.displayName,
    isPublicCadastre: true,
    timestamp: serverTimestamp(),
  });

  batch.set(doc(db, 'auditLogs', makeSafeId('audit')), {
    userUid: actor.uid,
    userName: actor.displayName,
    userRole: actor.role,
    action: 'Registered Land Parcel',
    entityType: 'parcel',
    entityId: parcelId,
    details: `Registered ${normalizedCode} (${areaSqm} sqm) in ${clampStr(input.zone, 120)}.`,
    timestamp: serverTimestamp(),
  });

  try {
    await batch.commit();
    return parcelId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `parcels/${parcelId}`);
  }
}

export async function updateParcelStatusOrNotes(
  parcel: LandParcel,
  nextStatus: ParcelStatus,
  notes: string,
  actor: UserProfile
): Promise<void> {
  if (parcel.status === 'Allocated' && actor.role !== 'super_admin') {
    throw new Error('Only Super Administrator may modify the status of an already allocated parcel.');
  }

  const batch = writeBatch(db);
  batch.update(doc(db, 'parcels', parcel.id), {
    status: nextStatus,
    notes: clampStr(notes, 1000),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'parcelHistory', makeSafeId('hist')), {
    parcelId: parcel.id,
    parcelCode: parcel.parcelCode,
    eventType: 'Status Changed',
    summary: `Parcel status updated from ${parcel.status} to ${nextStatus}.`,
    previousStatus: parcel.status,
    newStatus: nextStatus,
    actorUid: actor.uid,
    actorName: actor.displayName,
    isPublicCadastre: true,
    timestamp: serverTimestamp(),
  });

  batch.set(doc(db, 'auditLogs', makeSafeId('audit')), {
    userUid: actor.uid,
    userName: actor.displayName,
    userRole: actor.role,
    action: 'Updated Parcel Status',
    entityType: 'parcel',
    entityId: parcel.id,
    details: `${parcel.parcelCode} status changed from ${parcel.status} to ${nextStatus}.`,
    timestamp: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `parcels/${parcel.id}`);
  }
}

export async function attachParcelDocument(
  parcel: LandParcel,
  docData: {
    documentType: DocumentType;
    referenceNo: string;
    fileName: string;
    summary?: string;
  },
  actor: UserProfile
): Promise<void> {
  const batch = writeBatch(db);
  const docId = makeSafeId('doc');

  batch.set(doc(db, 'documents', docId), {
    parcelId: parcel.id,
    parcelCode: parcel.parcelCode,
    documentType: docData.documentType,
    referenceNo: clampStr(docData.referenceNo, 80),
    fileName: clampStr(docData.fileName, 160),
    summary: docData.summary ? clampStr(docData.summary, 600) : '',
    verifiedBy: actor.displayName,
    isPublicCadastre: true,
    uploadedByUid: actor.uid,
    uploadedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'parcelHistory', makeSafeId('hist')), {
    parcelId: parcel.id,
    parcelCode: parcel.parcelCode,
    eventType: 'Document Attached',
    summary: `Attached ${docData.documentType} (${clampStr(docData.referenceNo, 80)}).`,
    actorUid: actor.uid,
    actorName: actor.displayName,
    isPublicCadastre: true,
    timestamp: serverTimestamp(),
  });

  batch.set(doc(db, 'auditLogs', makeSafeId('audit')), {
    userUid: actor.uid,
    userName: actor.displayName,
    userRole: actor.role,
    action: 'Attached Parcel Document',
    entityType: 'document',
    entityId: docId,
    details: `Linked ${docData.documentType} (${clampStr(docData.referenceNo, 80)}) to ${parcel.parcelCode}.`,
    timestamp: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `documents/${docId}`);
  }
}

export interface SubmitApplicationInput {
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  nationalIdRef?: string;
  applicantAddress?: string;
  purpose: string;
  proposedDevelopment?: string;
}

export async function submitLandApplication(
  parcel: LandParcel,
  input: SubmitApplicationInput,
  actor: UserProfile
): Promise<string> {
  if (parcel.status === 'Allocated' || parcel.status === 'Disputed') {
    throw new Error(
      `Parcel ${parcel.parcelCode} is ${parcel.status} and cannot accept new applications.`
    );
  }

  const appId = makeSafeId('app');
  const appCode = `APP-${new Date().getFullYear()}-${String(Math.floor(100 + Math.random() * 900))}`;

  const batch = writeBatch(db);
  batch.set(doc(db, 'applications', appId), {
    applicationCode: appCode,
    parcelId: parcel.id,
    parcelCode: parcel.parcelCode,
    parcelZone: parcel.zone,
    applicantUid: actor.uid,
    applicantName: clampStr(input.applicantName, 120),
    purpose: clampStr(input.purpose, 200),
    proposedDevelopment: input.proposedDevelopment
      ? clampStr(input.proposedDevelopment, 800)
      : '',
    status: 'Submitted',
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'applications', appId, 'private', 'contact'), {
    applicantUid: actor.uid,
    applicantEmail: clampStr(input.applicantEmail, 200),
    applicantPhone: clampStr(input.applicantPhone, 40),
    nationalIdRef: input.nationalIdRef ? clampStr(input.nationalIdRef, 64) : '',
    applicantAddress: input.applicantAddress ? clampStr(input.applicantAddress, 240) : '',
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'parcelHistory', makeSafeId('hist')), {
    parcelId: parcel.id,
    parcelCode: parcel.parcelCode,
    eventType: 'Application Submitted',
    summary: `Application ${appCode} submitted by ${clampStr(input.applicantName, 80)}.`,
    actorUid: actor.uid,
    actorName: actor.displayName,
    isPublicCadastre: true,
    timestamp: serverTimestamp(),
  });

  batch.set(doc(db, 'auditLogs', makeSafeId('audit')), {
    userUid: actor.uid,
    userName: actor.displayName,
    userRole: actor.role,
    action: 'Submitted Land Application',
    entityType: 'application',
    entityId: appId,
    details: `${appCode} submitted for parcel ${parcel.parcelCode}.`,
    timestamp: serverTimestamp(),
  });

  try {
    await batch.commit();
    return appCode;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `applications/${appId}`);
  }
}

export async function startApplicationVerification(
  application: LandApplication,
  parcel: LandParcel,
  reviewerNotes: string,
  actor: UserProfile
): Promise<void> {
  if (parcel.status === 'Allocated' || parcel.status === 'Disputed') {
    throw new Error(`Parcel ${parcel.parcelCode} is ${parcel.status} and cannot be verified for allocation.`);
  }

  const batch = writeBatch(db);
  batch.update(doc(db, 'applications', application.id), {
    status: 'Under Verification',
    reviewerNotes: clampStr(reviewerNotes || 'Boundary & claim verification initiated.', 800),
    reviewedByName: actor.displayName,
    updatedAt: serverTimestamp(),
  });

  if (parcel.status === 'Available') {
    batch.update(doc(db, 'parcels', parcel.id), {
      status: 'Pending',
      updatedAt: serverTimestamp(),
    });
  }

  batch.set(doc(db, 'parcelHistory', makeSafeId('hist')), {
    parcelId: parcel.id,
    parcelCode: parcel.parcelCode,
    eventType: 'Verification Started',
    summary: `Application ${application.applicationCode} moved to Under Verification.`,
    previousStatus: parcel.status,
    newStatus: 'Pending',
    actorUid: actor.uid,
    actorName: actor.displayName,
    isPublicCadastre: true,
    timestamp: serverTimestamp(),
  });

  batch.set(doc(db, 'auditLogs', makeSafeId('audit')), {
    userUid: actor.uid,
    userName: actor.displayName,
    userRole: actor.role,
    action: 'Started Application Verification',
    entityType: 'application',
    entityId: application.id,
    details: `Placed ${application.applicationCode} (${parcel.parcelCode}) under Palace verification.`,
    timestamp: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `applications/${application.id}`);
  }
}

export async function approveApplicationAndAllocate(
  application: LandApplication,
  parcel: LandParcel,
  customaryFeeGhs: number,
  reviewerNotes: string,
  actor: UserProfile
): Promise<string> {
  const allocationId = makeSafeId('alloc');
  const allocationCode = `ALC-${new Date().getFullYear()}-${String(Math.floor(100 + Math.random() * 900))}`;

  try {
    await runTransaction(db, async (tx) => {
      const parcelRef = doc(db, 'parcels', parcel.id);
      const parcelSnap = await tx.get(parcelRef);
      if (!parcelSnap.exists()) {
        throw new Error('Target parcel record no longer exists.');
      }
      const latestStatus = parcelSnap.data().status as ParcelStatus;
      if (latestStatus === 'Allocated' || latestStatus === 'Disputed') {
        throw new Error(
          `Allocation blocked: Parcel ${parcel.parcelCode} is already ${latestStatus}. Double allocation is prohibited.`
        );
      }

      tx.update(doc(db, 'applications', application.id), {
        status: 'Approved',
        reviewerNotes: clampStr(reviewerNotes || 'Approved by Palace Authority.', 800),
        reviewedByName: actor.displayName,
        updatedAt: serverTimestamp(),
      });

      tx.update(parcelRef, {
        status: 'Allocated',
        updatedAt: serverTimestamp(),
      });

      tx.set(doc(db, 'allocations', allocationId), {
        allocationCode,
        applicationId: application.id,
        parcelId: parcel.id,
        parcelCode: parcel.parcelCode,
        applicantUid: application.applicantUid,
        applicantName: application.applicantName,
        approvedByUid: actor.uid,
        approvedByName: actor.displayName,
        approvalDate: serverTimestamp(),
        customaryFeeGhs: Math.max(0, Number(customaryFeeGhs) || parcel.customaryFeeGhs),
        paymentStatus: 'Unpaid',
        status: 'Active',
      });

      tx.set(doc(db, 'parcelHistory', makeSafeId('hist')), {
        parcelId: parcel.id,
        parcelCode: parcel.parcelCode,
        eventType: 'Allocated',
        summary: `Parcel ${parcel.parcelCode} allocated to ${application.applicantName} (${allocationCode}).`,
        previousStatus: latestStatus,
        newStatus: 'Allocated',
        actorUid: actor.uid,
        actorName: actor.displayName,
        isPublicCadastre: true,
        timestamp: serverTimestamp(),
      });

      tx.set(doc(db, 'auditLogs', makeSafeId('audit')), {
        userUid: actor.uid,
        userName: actor.displayName,
        userRole: actor.role,
        action: 'Approved Land Allocation',
        entityType: 'allocation',
        entityId: allocationId,
        details: `Approved ${application.applicationCode} and allocated ${parcel.parcelCode} to ${application.applicantName}.`,
        timestamp: serverTimestamp(),
      });
    });

    return allocationCode;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Allocation blocked:')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `allocations/${allocationId}`);
  }
}

export async function rejectApplication(
  application: LandApplication,
  parcel: LandParcel,
  reviewerNotes: string,
  releaseParcelIfPending: boolean,
  actor: UserProfile
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'applications', application.id), {
    status: 'Rejected',
    reviewerNotes: clampStr(reviewerNotes || 'Application declined following Palace review.', 800),
    reviewedByName: actor.displayName,
    updatedAt: serverTimestamp(),
  });

  const nextParcelStatus =
    releaseParcelIfPending && parcel.status === 'Pending' ? 'Available' : parcel.status;

  if (releaseParcelIfPending && parcel.status === 'Pending') {
    batch.update(doc(db, 'parcels', parcel.id), {
      status: 'Available',
      updatedAt: serverTimestamp(),
    });
  }

  batch.set(doc(db, 'parcelHistory', makeSafeId('hist')), {
    parcelId: parcel.id,
    parcelCode: parcel.parcelCode,
    eventType: 'Rejected',
    summary: `Application ${application.applicationCode} declined.`,
    previousStatus: parcel.status,
    newStatus: nextParcelStatus,
    actorUid: actor.uid,
    actorName: actor.displayName,
    isPublicCadastre: true,
    timestamp: serverTimestamp(),
  });

  batch.set(doc(db, 'auditLogs', makeSafeId('audit')), {
    userUid: actor.uid,
    userName: actor.displayName,
    userRole: actor.role,
    action: 'Rejected Land Application',
    entityType: 'application',
    entityId: application.id,
    details: `Declined ${application.applicationCode} for parcel ${parcel.parcelCode}.`,
    timestamp: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `applications/${application.id}`);
  }
}

export async function recordAllocationPayment(
  allocation: LandAllocation,
  amountGhs: number,
  paymentStatus: AllocationPayment['paymentStatus'],
  receiptRef: string,
  actor: UserProfile
): Promise<void> {
  const paymentId = makeSafeId('pay');
  const allocPaymentStatus: LandAllocation['paymentStatus'] =
    paymentStatus === 'Paid' ? 'Paid' : paymentStatus === 'Partial' ? 'Partial' : 'Unpaid';

  const batch = writeBatch(db);
  batch.set(doc(db, 'payments', paymentId), {
    allocationId: allocation.id,
    parcelId: allocation.parcelId,
    parcelCode: allocation.parcelCode,
    applicantUid: allocation.applicantUid,
    applicantName: allocation.applicantName,
    amountGhs: Math.max(0, Number(amountGhs) || 0),
    paymentStatus,
    receiptRef: clampStr(receiptRef, 80),
    recordedByUid: actor.uid,
    recordedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'allocations', allocation.id), {
    paymentStatus: allocPaymentStatus,
  });

  batch.set(doc(db, 'parcelHistory', makeSafeId('hist')), {
    parcelId: allocation.parcelId,
    parcelCode: allocation.parcelCode,
    eventType: 'Payment Recorded',
    summary: `Recorded GHS ${Number(amountGhs).toLocaleString()} (${paymentStatus}) · Ref ${clampStr(receiptRef, 40)}.`,
    actorUid: actor.uid,
    actorName: actor.displayName,
    isPublicCadastre: true,
    timestamp: serverTimestamp(),
  });

  batch.set(doc(db, 'auditLogs', makeSafeId('audit')), {
    userUid: actor.uid,
    userName: actor.displayName,
    userRole: actor.role,
    action: 'Recorded Customary Payment',
    entityType: 'payment',
    entityId: paymentId,
    details: `Recorded GHS ${amountGhs} (${paymentStatus}) for ${allocation.allocationCode}.`,
    timestamp: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `payments/${paymentId}`);
  }
}

export async function updateUserRole(
  targetUser: UserProfile,
  newRole: UserRole,
  department: string,
  actor: UserProfile
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', targetUser.uid), {
    role: newRole,
    department: clampStr(department || 'Palace Secretariat', 120),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'auditLogs', makeSafeId('audit')), {
    userUid: actor.uid,
    userName: actor.displayName,
    userRole: actor.role,
    action: 'Updated User Role',
    entityType: 'user',
    entityId: targetUser.uid,
    details: `Changed ${targetUser.displayName} role from ${targetUser.role} to ${newRole}.`,
    timestamp: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${targetUser.uid}`);
  }
}
