# Maheep News Portal — Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Default Deny**: Every undocumented path under `/databases/{database}/documents` is denied (`allow read, write: if false`).
2. **Verified Admin Ownership for Ads Writes**: Creating, updating, or deleting `/ads/{adId}` requires `request.auth != null`, `request.auth.token.email_verified == true`, and verified admin identity (`maheepmedia@gmail.com` or `/admins/{uid}` record).
3. **Immutable Ownership & Timestamps**: `ownerUid`, `id`, and `createdAt` on `/ads/{adId}` cannot change after creation; `createdAt` and `updatedAt` must strictly equal `request.time`.
4. **Public Read Isolation**: Unauthenticated visitors may ONLY `get` or `list` `/ads/{adId}` documents where `resource.data.active == true`. Listing paused (`active == false`) or unfiltered ads requires verified bootstrap admin claims (zero `get()`/`exists()` inside `allow list`).
5. **Strict Schema & Bounds**: Every string field enforces `.size()` limits matching `firebase-blueprint.json`, `placement` and `language` are strict enums, `id` matches `^[a-zA-Z0-9_\-]+$`, and `start_date`/`end_date` match `^(|\d{4}-\d{2}-\d{2})$`.
6. **PII Isolation (`/admins/{uid}`)**: Admin records contain verified email addresses and are readable only by the matching user (`request.auth.uid == uid`) or verified bootstrap admin; `allow list` is permanently disabled (`false`); writes are limited strictly to verified bootstrap admin.
7. **Connection Probe Isolation (`/test/{docId}`)**: Only `get` on `docId == 'connection'` is allowed; `list` and all writes are denied.

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Unauthenticated Ad Create**: Anonymous client attempts `setDoc(doc(db, 'ads', 'ad-anon-1'), { ...validAd })`.
2. **Unverified Admin Email Spoof**: Signed-in user with `email: 'maheepmedia@gmail.com'` and `email_verified: false` attempts `create` on `/ads/ad-spoof-1`.
3. **Non-Admin User Ad Create**: Signed-in verified user `reader@example.com` (not bootstrap admin and not in `/admins`) attempts `create` on `/ads/ad-reader-1`.
4. **Shadow Field Injection ("Ghost Field")**: Admin attempts `create` on `/ads/ad-shadow-1` adding undeclared field `isSuperBanner: true`.
5. **Identity Spoofing on Create**: Admin attempts `create` on `/ads/ad-uid-spoof` setting `ownerUid: 'someone-else-uid'`.
6. **Document ID / Field ID Mismatch or Poisoning**: Admin attempts `create` on `/ads/bad$id/extra` or sets `id` != `adId` or >128 chars.
7. **Timestamp Forgery**: Admin attempts `create` or `update` on `/ads/ad-time-1` with client timestamp `createdAt: new Date(0)` instead of `serverTimestamp()`.
8. **Immutable Field Tampering on Update**: Admin attempts `update` modifying `ownerUid` or `createdAt` or `id`.
9. **Value Poisoning / Oversized String**: Admin attempts `update` setting `title` to a 500-character string (>200 max) or `placement: 'popup_spam'` (invalid enum).
10. **Unauthenticated Blanket List Query**: Public visitor calls `getDocs(collection(db, 'ads'))` without `where('active', '==', true)`.
11. **Paused Ad Direct Read by Visitor**: Public visitor calls `getDoc(doc(db, 'ads', 'paused-ad-id'))` where `active == false`.
12. **Self-Assigned Admin Escalation**: Non-admin user attempts `setDoc(doc(db, 'admins', request.auth.uid), { uid: request.auth.uid, email: 'attacker@evil.com', role: 'super_admin', ... })`.
