/**
 * Phase 0 / Phase 5 Security Verification Suite Specification for firestore.rules.
 * Documents the 12 Dirty Dozen adversarial payloads and expected PERMISSION_DENIED outcomes
 * for Firebase Rules Unit Testing (`@firebase/rules-unit-testing`).
 */

export interface SecurityTestCase {
  id: string;
  name: string;
  actor: 'anonymous' | 'unverified_admin_spoof' | 'verified_reader' | 'verified_admin';
  collectionPath: string;
  docId: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED' | 'ALLOW';
}

export const DIRTY_DOZEN_CASES: SecurityTestCase[] = [
  {
    id: 'DD-01',
    name: 'Unauthenticated client attempts to create an ad',
    actor: 'anonymous',
    collectionPath: 'ads',
    docId: 'ad-anon-01',
    operation: 'create',
    payload: { id: 'ad-anon-01', title: 'Unauthorized Ad', active: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-02',
    name: 'Email spoof with email_verified=false attempts to create an ad',
    actor: 'unverified_admin_spoof',
    collectionPath: 'ads',
    docId: 'ad-spoof-02',
    operation: 'create',
    payload: { id: 'ad-spoof-02', title: 'Spoofed Ad', active: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-03',
    name: 'Verified non-admin reader attempts to create an ad',
    actor: 'verified_reader',
    collectionPath: 'ads',
    docId: 'ad-reader-03',
    operation: 'create',
    payload: { id: 'ad-reader-03', title: 'Reader Ad', active: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-04',
    name: 'Shadow field injection (undeclared property isSuperBanner) on create',
    actor: 'verified_admin',
    collectionPath: 'ads',
    docId: 'ad-shadow-04',
    operation: 'create',
    payload: { id: 'ad-shadow-04', title: 'Shadow Ad', isSuperBanner: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-05',
    name: 'Identity spoofing: ownerUid does not match request.auth.uid',
    actor: 'verified_admin',
    collectionPath: 'ads',
    docId: 'ad-uid-05',
    operation: 'create',
    payload: { id: 'ad-uid-05', ownerUid: 'foreign-uid-999' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-06',
    name: 'Document ID mismatch or invalid characters (ID poisoning)',
    actor: 'verified_admin',
    collectionPath: 'ads',
    docId: 'bad$id!',
    operation: 'create',
    payload: { id: 'ad-valid-06' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-07',
    name: 'Client timestamp forgery instead of serverTimestamp()',
    actor: 'verified_admin',
    collectionPath: 'ads',
    docId: 'ad-time-07',
    operation: 'create',
    payload: { id: 'ad-time-07', createdAt: new Date(0).toISOString() },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-08',
    name: 'Immutable field modification (ownerUid/createdAt) during update',
    actor: 'verified_admin',
    collectionPath: 'ads',
    docId: 'ad-existing-08',
    operation: 'update',
    payload: { ownerUid: 'changed-uid' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-09',
    name: 'Value poisoning: oversized title (>200 chars) or invalid placement enum',
    actor: 'verified_admin',
    collectionPath: 'ads',
    docId: 'ad-existing-09',
    operation: 'update',
    payload: { title: 'A'.repeat(250), placement: 'popup_spam' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-10',
    name: 'Public visitor performs unfiltered collection list on ads',
    actor: 'anonymous',
    collectionPath: 'ads',
    docId: '*',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-11',
    name: 'Public visitor attempts direct get on paused (active=false) ad',
    actor: 'anonymous',
    collectionPath: 'ads',
    docId: 'paused-ad-11',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-12',
    name: 'Non-admin attempts self-assigned super_admin record creation',
    actor: 'verified_reader',
    collectionPath: 'admins',
    docId: 'reader-uid',
    operation: 'create',
    payload: { uid: 'reader-uid', email: 'reader@example.com', role: 'super_admin' },
    expected: 'PERMISSION_DENIED',
  },
];
