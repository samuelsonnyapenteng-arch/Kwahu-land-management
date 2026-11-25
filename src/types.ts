import type { Timestamp } from 'firebase/firestore';

export type UserRole =
  | 'super_admin'
  | 'palace_admin'
  | 'surveyor'
  | 'approving_officer'
  | 'applicant';

export type ParcelStatus = 'Available' | 'Pending' | 'Allocated' | 'Disputed';

export type LandUseType = 'Residential' | 'Commercial' | 'Agricultural' | 'Civic';

export type ApplicationStatus =
  | 'Submitted'
  | 'Under Verification'
  | 'Approved'
  | 'Rejected';

export type DocumentType =
  | 'Survey Plan'
  | 'Site Plan'
  | 'Palace Allocation Note'
  | 'Boundary Verification'
  | 'Other';

export type AppModule = 'map' | 'registry' | 'applications' | 'tracking' | 'admin';

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  role: UserRole;
  department?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface UserPrivateInfo {
  uid: string;
  email: string;
  phone?: string;
  updatedAt?: Timestamp;
}

export interface LandParcel {
  id: string;
  parcelCode: string;
  title: string;
  zone: string;
  landUse: LandUseType;
  areaSqm: number;
  areaAcres: number;
  centroidLat: number;
  centroidLng: number;
  coordinates: LatLngPoint[];
  status: ParcelStatus;
  surveyPlanRef?: string;
  customaryFeeGhs: number;
  notes?: string;
  isPublicCadastre: boolean;
  createdByUid: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ParcelDocument {
  id: string;
  parcelId: string;
  parcelCode: string;
  documentType: DocumentType;
  referenceNo: string;
  fileName: string;
  summary?: string;
  verifiedBy?: string;
  isPublicCadastre: boolean;
  uploadedByUid: string;
  uploadedAt?: Timestamp;
}

export interface LandApplication {
  id: string;
  applicationCode: string;
  parcelId: string;
  parcelCode: string;
  parcelZone: string;
  applicantUid: string;
  applicantName: string;
  purpose: string;
  proposedDevelopment?: string;
  status: ApplicationStatus;
  reviewerNotes?: string;
  reviewedByName?: string;
  submittedAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ApplicationContact {
  applicantUid: string;
  applicantEmail: string;
  applicantPhone: string;
  nationalIdRef?: string;
  applicantAddress?: string;
  updatedAt?: Timestamp;
}

export interface LandAllocation {
  id: string;
  allocationCode: string;
  applicationId: string;
  parcelId: string;
  parcelCode: string;
  applicantUid: string;
  applicantName: string;
  approvedByUid: string;
  approvedByName: string;
  approvalDate?: Timestamp;
  customaryFeeGhs: number;
  paymentStatus: 'Unpaid' | 'Partial' | 'Paid';
  status: 'Active' | 'Revoked' | 'Transferred';
}

export interface AllocationPayment {
  id: string;
  allocationId: string;
  parcelId: string;
  parcelCode: string;
  applicantUid: string;
  applicantName: string;
  amountGhs: number;
  paymentStatus: 'Pending' | 'Partial' | 'Paid';
  receiptRef: string;
  recordedByUid: string;
  recordedAt?: Timestamp;
}

export interface ParcelTrackingEvent {
  id: string;
  parcelId: string;
  parcelCode: string;
  eventType:
    | 'Registered'
    | 'Boundary Updated'
    | 'Application Submitted'
    | 'Verification Started'
    | 'Allocated'
    | 'Rejected'
    | 'Status Changed'
    | 'Payment Recorded'
    | 'Document Attached';
  summary: string;
  previousStatus?: string;
  newStatus?: string;
  actorUid: string;
  actorName: string;
  isPublicCadastre: boolean;
  timestamp?: Timestamp;
}

export interface AuditLog {
  id: string;
  userUid: string;
  userName: string;
  userRole: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  timestamp?: Timestamp;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Administrator',
  palace_admin: 'Palace Land Administrator',
  surveyor: 'Surveyor / GIS Officer',
  approving_officer: 'Palace Approving Officer',
  applicant: 'Applicant',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  super_admin: 'Full system control, user role governance, and registry oversight',
  palace_admin: 'Manage land records, verify applications, and record customary payments',
  surveyor: 'Digitize parcel boundaries, register plots, and attach survey plans',
  approving_officer: 'Review verified claims and grant or reject customary allocations',
  applicant: 'Browse available parcels, submit land requests, and track application status',
};

export const ABETIFI_ZONES = [
  'Adonten Quarter',
  'Nkwatia Road Ridge',
  'Abetifi College Enclave',
  'Abetifi Old Town',
  'Hweehwee Valley',
  'Presby Ridge North',
] as const;

export const PARCEL_STATUS_STYLE: Record<
  ParcelStatus,
  { stroke: string; fill: string; text: string; bg: string; border: string }
> = {
  Available: {
    stroke: '#15803D',
    fill: '#22C55E',
    text: 'text-emerald-800',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
  },
  Pending: {
    stroke: '#B45309',
    fill: '#F59E0B',
    text: 'text-amber-800',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
  },
  Allocated: {
    stroke: '#1D4ED8',
    fill: '#3B82F6',
    text: 'text-blue-800',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
  },
  Disputed: {
    stroke: '#B91C1C',
    fill: '#EF4444',
    text: 'text-red-800',
    bg: 'bg-red-50',
    border: 'border-red-200',
  },
};
