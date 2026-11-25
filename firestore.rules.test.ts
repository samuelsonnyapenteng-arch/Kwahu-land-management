// Verification test specification for the Dirty Dozen security payloads
// Ensures all 12 adversarial payloads fail validation against firestore.rules.

export interface SecurityTestCase {
  id: number;
  name: string;
  collection: string;
  operation: 'create' | 'update' | 'get' | 'list';
  expectedOutcome: 'PERMISSION_DENIED';
  guardRule: string;
}

export const DIRTY_DOZEN_TESTS: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Self-Privilege Escalation on user creation',
    collection: 'users',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    guardRule: "Non-bootstrapped users can only create role == 'applicant'",
  },
  {
    id: 2,
    name: 'Role Update Tampering by non-admin',
    collection: 'users',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    guardRule: 'Owner update enforces incoming().role == existing().role',
  },
  {
    id: 3,
    name: 'Unverified Email Spoofing',
    collection: 'parcels',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    guardRule: 'isEmailVerified() requires request.auth.token.email_verified == true',
  },
  {
    id: 4,
    name: 'Shadow Field Injection on parcel creation',
    collection: 'parcels',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    guardRule: 'isValidLandParcel enforces data.keys().hasOnly([...])',
  },
  {
    id: 5,
    name: 'ID Poisoning with oversized or invalid characters',
    collection: 'parcels',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    guardRule: "isValidId enforces <= 128 chars and '^[a-zA-Z0-9_\\\\-]+$'",
  },
  {
    id: 6,
    name: 'Double-Allocation Bypass on Allocated parcel',
    collection: 'applications',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    guardRule: "Target parcel status must be in ['Available', 'Pending']",
  },
  {
    id: 7,
    name: 'Orphaned Application referencing missing parcel',
    collection: 'applications',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    guardRule: 'exists(/databases/$(database)/documents/parcels/$(incoming().parcelId))',
  },
  {
    id: 8,
    name: 'Unauthorized Approval by Applicant',
    collection: 'applications',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    guardRule: 'isApprovingOfficer() required for Approved/Rejected status',
  },
  {
    id: 9,
    name: 'Terminal State Reversal from Approved to Submitted',
    collection: 'applications',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    guardRule: "existing().status in ['Submitted', 'Under Verification']",
  },
  {
    id: 10,
    name: 'PII Snooping on private application contact',
    collection: 'applications/{id}/private',
    operation: 'get',
    expectedOutcome: 'PERMISSION_DENIED',
    guardRule: 'Restricted to applicantUid == request.auth.uid or isPalaceStaff()',
  },
  {
    id: 11,
    name: 'Client Timestamp Forgery',
    collection: 'applications',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    guardRule: 'incoming().submittedAt == request.time',
  },
  {
    id: 12,
    name: 'Blanket Collection Scraping on auditLogs',
    collection: 'auditLogs',
    operation: 'list',
    expectedOutcome: 'PERMISSION_DENIED',
    guardRule: 'Restricted to isBootstrappedAdmin()',
  },
];
