# Security Specification — Kwahu Abetifi Palace GIS Land System

## 1. Data Invariants

1. **Identity Integrity**: Every user profile (`/users/{userId}`) can only be created by the authenticated user matching `userId` with initial role `'applicant'` (except the bootstrapped Super Admin email). Users cannot escalate their own role.
2. **PII Isolation**: Emails, phone numbers, physical addresses, and national ID references are isolated in `/users/{userId}/private/{docId}` and `/applications/{applicationId}/private/{docId}`, readable only by the owner or verified Palace staff.
3. **Double-Allocation Prevention**: An application cannot be created for a parcel whose status is `'Allocated'` or `'Disputed'`. A `LandAllocation` can only be created atomically alongside updating the target parcel from `'Available'` or `'Pending'` to `'Allocated'`.
4. **Approval Authority**: Only an authorized Approving Officer or Super Administrator may approve/reject applications or issue `LandAllocation` records.
5. **Terminal State Locking**: Once an application reaches `'Approved'` or `'Rejected'`, non-admin users cannot alter it.
6. **Temporal & Structural Integrity**: All `createdAt`, `updatedAt`, `submittedAt`, `approvalDate`, `recordedAt`, and `timestamp` fields must equal `request.time`. All document IDs are strictly bounded and regex-validated (`^[a-zA-Z0-9_\-]+$`).

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Self-Privilege Escalation**: Applicant attempts `create` on `/users/uid123` with `role: "super_admin"`. -> `PERMISSION_DENIED`.
2. **Role Update Tampering**: Applicant attempts `update` on `/users/uid123` changing `role` to `"approving_officer"`. -> `PERMISSION_DENIED`.
3. **Unverified Email Spoofing**: Unverified user (`email_verified: false`) claims admin email and attempts write to `/parcels/p1`. -> `PERMISSION_DENIED`.
4. **Shadow Field Injection**: Surveyor attempts `create` on `/parcels/p1` with extra ghost field `isBypassed: true`. -> `PERMISSION_DENIED`.
5. **ID Poisoning**: Attacker passes a 500-character or slash-containing document ID `/parcels/../../../admin`. -> `PERMISSION_DENIED`.
6. **Double-Allocation Bypass**: Applicant attempts `create` on `/applications/app99` targeting a parcel already marked `'Allocated'`. -> `PERMISSION_DENIED`.
7. **Orphaned Application**: Applicant creates `/applications/app99` referencing non-existent `parcelId: "missing_parcel"`. -> `PERMISSION_DENIED`.
8. **Unauthorized Approval**: Applicant attempts `update` on `/applications/app1` setting `status: "Approved"`. -> `PERMISSION_DENIED`.
9. **Terminal State Reversal**: User attempts `update` on an already `'Approved'` application changing `status` back to `'Submitted'`. -> `PERMISSION_DENIED`.
10. **PII Snooping**: User B attempts `get` on `/applications/app1/private/contact` belonging to User A. -> `PERMISSION_DENIED`.
11. **Client Timestamp Forgery**: User attempts `create` on `/applications/app1` with a backdated `submittedAt` timestamp instead of `request.time`. -> `PERMISSION_DENIED`.
12. **Blanket Collection Scraping**: Unprivileged user attempts `list` on `/auditLogs` or `/payments` without ownership filter. -> `PERMISSION_DENIED`.
