const fs = require('fs');
const assert = require('assert');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { collection, deleteDoc, doc, getDoc, getDocs, runTransaction, setDoc, updateDoc } = require('firebase/firestore');

const projectId = 'brandguard-rules-test';
const profile = (uid, role) => ({ name: uid, email: uid+'@example.test', role, createdAt: new Date().toISOString() });
const version = (n, text) => ({ n, text, at: new Date().toISOString(), by: 'Creator', summary: {} });
const documentData = (id, owner, status, text) => ({
  id, owner, status, title: 'Example draft', type: 'Web page', intent: '',
  versions: [version(1, text)], comments: [], audit: []
});
const ok = (message) => console.log('ok  '+message);

async function createFirstAccount(db, uid) {
  const userRef = doc(db, 'users', uid);
  const rulesRef = doc(db, 'brand', 'rules');
  return runTransaction(db, async (transaction) => {
    const [userSnap, rulesSnap] = await Promise.all([transaction.get(userRef), transaction.get(rulesRef)]);
    if (userSnap.exists()) return userSnap.data();
    const user = profile(uid, rulesSnap.exists() ? 'Creator' : 'Admin');
    if (!rulesSnap.exists()) transaction.set(rulesRef, { company: uid+' company', initialAdmin: uid });
    transaction.set(userRef, user);
    return user;
  });
}

(async () => {
  const env = await initializeTestEnvironment({
    projectId,
    firestore: { host: '127.0.0.1', port: 8080, rules: fs.readFileSync('firestore.rules', 'utf8') }
  });
  try {
    await env.clearFirestore();
    const adminA = env.authenticatedContext('first-a').firestore();
    const adminB = env.authenticatedContext('first-b').firestore();
    const [first, second] = await Promise.all([createFirstAccount(adminA, 'first-a'), createFirstAccount(adminB, 'first-b')]);
    const profiles = [first, second];
    assert.strictEqual(profiles.filter((user) => user.role === 'Admin').length, 1);
    const initialAdmin = profiles.findIndex((user) => user.role === 'Admin') === 0 ? 'first-a' : 'first-b';
    const rulesDoc = await getDoc(doc(adminA, 'brand', 'rules'));
    assert.strictEqual(rulesDoc.data().initialAdmin, initialAdmin);
    ok('concurrent first sign-ups atomically create exactly one Admin');

    const creator = env.authenticatedContext('creator').firestore();
    const reviewer = env.authenticatedContext('reviewer').firestore();
    const admin = env.authenticatedContext(initialAdmin).firestore();
    await assertFails(setDoc(doc(creator, 'users', 'attacker'), profile('attacker', 'Admin')));
    await assertSucceeds(setDoc(doc(creator, 'users', 'creator'), profile('creator', 'Creator')));
    await assertFails(getDoc(doc(creator, 'users', initialAdmin)));
    await assertSucceeds(getDoc(doc(admin, 'users', 'creator')));
    await assertFails(updateDoc(doc(creator, 'users', 'creator'), { role: 'Admin' }));
    await assertSucceeds(updateDoc(doc(admin, 'users', 'creator'), { role: 'Reviewer' }));
    await assertFails(deleteDoc(doc(admin, 'brand', 'rules')));
    ok('user profile privacy, role protection, and bootstrap lock are enforced');

    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', 'creator'), profile('creator', 'Creator'));
      await setDoc(doc(db, 'users', 'reviewer'), profile('reviewer', 'Reviewer'));
      await setDoc(doc(db, 'docs', 'review-doc'), documentData('review-doc', 'creator', 'In review', 'A clean draft.'));
      await setDoc(doc(db, 'docs', 'draft-comment-doc'), documentData('draft-comment-doc', 'creator', 'Draft', 'A clean draft.'));
      await setDoc(doc(db, 'docs', 'changes-comment-doc'), documentData('changes-comment-doc', 'creator', 'Changes requested', 'A clean draft.'));
      const maxVersionDoc = documentData('max-version-doc', 'creator', 'Draft', 'Version 1');
      maxVersionDoc.versions = Array.from({ length: 99 }, (_, index) => version(index + 1, 'Version '+(index + 1)));
      await setDoc(doc(db, 'docs', 'max-version-doc'), maxVersionDoc);
    });
    const draftRef = doc(creator, 'docs', 'new-doc');
    await assertSucceeds(setDoc(draftRef, documentData('new-doc', 'creator', 'Draft', 'A clean draft.')));
    await assertSucceeds(setDoc(doc(creator, 'docs', 'max-text'), documentData('max-text', 'creator', 'Draft', 'x'.repeat(20000))));
    await assertFails(setDoc(doc(creator, 'docs', 'oversized-text'), documentData('oversized-text', 'creator', 'Draft', 'x'.repeat(20001))));
    const maxText = (await getDoc(doc(creator, 'docs', 'max-text'))).data();
    await assertSucceeds(updateDoc(doc(creator, 'docs', 'max-text'), {
      versions: maxText.versions.concat([version(2, 'x'.repeat(20000))]),
      audit: [{ at: new Date().toISOString(), who: 'Creator', what: 'Saved version 2' }]
    }));
    await assertSucceeds(updateDoc(doc(creator, 'docs', 'max-version-doc'), {
      versions: (await getDoc(doc(creator, 'docs', 'max-version-doc'))).data().versions.concat([version(100, 'Version 100')]),
      audit: [{ at: new Date().toISOString(), who: 'Creator', what: 'Saved version 100' }]
    }));
    await assertFails(setDoc(doc(creator, 'docs', 'bad-doc'), documentData('bad-doc', 'creator', 'Approved', 'A clean draft.')));
    await assertFails(updateDoc(doc(reviewer, 'docs', 'review-doc'), { title: 'Tampered title' }));
    await assertFails(updateDoc(doc(creator, 'docs', 'review-doc'), {
      status: 'In review',
      versions: [version(1, 'A rewritten draft.')],
      audit: [{ at: new Date().toISOString(), who: 'Creator', what: 'tampered' }]
    }));
    for (const id of ['draft-comment-doc', 'changes-comment-doc']) {
      await assertSucceeds(updateDoc(doc(creator, 'docs', id), {
        comments: [{ by: 'Creator', text: 'Added a note.', at: new Date().toISOString() }],
        audit: [{ at: new Date().toISOString(), who: 'Creator', what: 'Commented' }]
      }));
    }
    const existing = documentData('review-doc', 'creator', 'In review', 'A clean draft.');
    await assertSucceeds(updateDoc(doc(reviewer, 'docs', 'review-doc'), {
      comments: [{ by: 'Reviewer', text: 'Please clarify this.', at: new Date().toISOString() }],
      audit: [{ at: new Date().toISOString(), who: 'Reviewer', what: 'Commented' }]
    }));
    const afterReviewerComment = (await getDoc(doc(creator, 'docs', 'review-doc'))).data();
    await assertSucceeds(updateDoc(doc(creator, 'docs', 'review-doc'), {
      comments: afterReviewerComment.comments.concat([{ by: 'Creator', text: 'Clarified.', at: new Date().toISOString() }]),
      audit: afterReviewerComment.audit.concat([{ at: new Date().toISOString(), who: 'Creator', what: 'Commented' }])
    }));
    const afterCreatorComment = (await getDoc(doc(creator, 'docs', 'review-doc'))).data();
    await assertFails(updateDoc(doc(creator, 'docs', 'review-doc'), {
      comments: [afterCreatorComment.comments[1], afterCreatorComment.comments[0], { by: 'Creator', text: 'Inserted out of order.', at: new Date().toISOString() }],
      audit: afterCreatorComment.audit.concat([{ at: new Date().toISOString(), who: 'Creator', what: 'Commented' }])
    }));
    const beforeEdit = (await getDoc(doc(creator, 'docs', 'review-doc'))).data();
    await assertSucceeds(updateDoc(doc(reviewer, 'docs', 'review-doc'), {
      versions: beforeEdit.versions.concat([version(2, 'Reviewer edited the draft.')]),
      audit: beforeEdit.audit.concat([{ at: new Date().toISOString(), who: 'Reviewer', what: 'Committed edit' }])
    }));
    const beforeRequest = (await getDoc(doc(creator, 'docs', 'review-doc'))).data();
    await assertSucceeds(updateDoc(doc(reviewer, 'docs', 'review-doc'), {
      status: 'Changes requested',
      comments: beforeRequest.comments.concat([{ by: 'Reviewer', text: 'Please revise.', at: new Date().toISOString() }]),
      audit: beforeRequest.audit.concat([{ at: new Date().toISOString(), who: 'Reviewer', what: 'Requested changes' }])
    }));
    await assertFails(updateDoc(doc(reviewer, 'docs', 'review-doc'), {
      status: 'Approved',
      comments: existing.comments,
      audit: existing.audit
    }));
    ok('document owners and reviewers can only perform allowed workflow mutations');

    const event = { ruleId: 'G-01', category: 'Tone', outcome: 'disputed', at: new Date().toISOString(), uid: 'creator' };
    const events = collection(creator, 'events');
    const eventRef = doc(events, 'event-1');
    await assertSucceeds(setDoc(eventRef, event));
    await assertFails(updateDoc(eventRef, { outcome: 'accepted' }));
    await assertFails(deleteDoc(eventRef));
    await assertFails(setDoc(doc(events, 'spoofed-event'), Object.assign({}, event, { uid: 'reviewer' })));
    await assertSucceeds(getDocs(collection(admin, 'users')));
    ok('events are identity-bound and append-only');
    console.log('4 Firestore rules groups passed');
  } finally {
    await env.cleanup();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
