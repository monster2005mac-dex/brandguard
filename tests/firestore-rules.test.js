const fs = require('fs');
const assert = require('assert');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { collection, deleteDoc, doc, getDoc, getDocs, query, runTransaction, setDoc, updateDoc, where } = require('firebase/firestore');

const projectId = 'brandguard-rules-test';
const workspaceA = 'ws-a';
const workspaceB = 'ws-b';
const profile = (uid, role, workspaceId) => ({
  name: uid, email: uid+'@example.test', role, workspaceId, createdAt: new Date().toISOString()
});
const brandPack = (company, initialAdmin) => ({
  company, initialAdmin, guidelines: [], terms: [], facts: [], claims: [],
  visual: { palette: [], contrast: 4.5, paletteTolerance: 25 }
});
const version = (n, text) => ({ n, text, at: new Date().toISOString(), by: 'Creator', summary: {} });
const documentData = (id, owner, workspaceId, status, text) => ({
  id, owner, workspaceId, status, title: 'Example draft', type: 'Web page', intent: '',
  versions: [version(1, text)], comments: [], audit: []
});
const ok = (message) => console.log('ok  '+message);

(async () => {
  const env = await initializeTestEnvironment({
    projectId,
    firestore: { host: '127.0.0.1', port: 8080, rules: fs.readFileSync('firestore.rules', 'utf8') }
  });
  try {
    await env.clearFirestore();
    const adminA = env.authenticatedContext('admin-a').firestore();
    const creatorA = env.authenticatedContext('creator-a').firestore();
    const reviewerA = env.authenticatedContext('reviewer-a').firestore();
    const adminB = env.authenticatedContext('admin-b').firestore();
    const creatorB = env.authenticatedContext('creator-b').firestore();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await Promise.all([
        setDoc(doc(db, 'workspaces', workspaceA), { name: 'Workspace A', initialAdmin: 'admin-a', schemaVersion: 1 }),
        setDoc(doc(db, 'workspaces', workspaceB), { name: 'Workspace B', initialAdmin: 'admin-b', schemaVersion: 1 }),
        setDoc(doc(db, 'brandRules', workspaceA), brandPack('Workspace A', 'admin-a')),
        setDoc(doc(db, 'brandRules', workspaceB), brandPack('Workspace B', 'admin-b')),
        setDoc(doc(db, 'users', 'admin-a'), profile('admin-a', 'Admin', workspaceA)),
        setDoc(doc(db, 'users', 'creator-a'), profile('creator-a', 'Creator', workspaceA)),
        setDoc(doc(db, 'users', 'reviewer-a'), profile('reviewer-a', 'Reviewer', workspaceA)),
        setDoc(doc(db, 'users', 'admin-b'), profile('admin-b', 'Admin', workspaceB)),
        setDoc(doc(db, 'users', 'creator-b'), profile('creator-b', 'Creator', workspaceB)),
        setDoc(doc(db, 'docs', 'review-doc'), documentData('review-doc', 'creator-a', workspaceA, 'In review', 'A clean draft.')),
        setDoc(doc(db, 'docs', 'draft-comment-doc'), documentData('draft-comment-doc', 'creator-a', workspaceA, 'Draft', 'A clean draft.')),
        setDoc(doc(db, 'docs', 'changes-comment-doc'), documentData('changes-comment-doc', 'creator-a', workspaceA, 'Changes requested', 'A clean draft.'))
      ]);
      const maxVersionDoc = documentData('max-version-doc', 'creator-a', workspaceA, 'Draft', 'Version 1');
      maxVersionDoc.versions = Array.from({ length: 99 }, (_, index) => version(index + 1, 'Version '+(index + 1)));
      await setDoc(doc(db, 'docs', 'max-version-doc'), maxVersionDoc);
    });

    await assertSucceeds(getDoc(doc(creatorA, 'users', 'creator-a')));
    await assertFails(getDoc(doc(creatorA, 'users', 'creator-b')));
    await assertFails(setDoc(doc(creatorA, 'users', 'attacker'), profile('attacker', 'Admin', workspaceA)));
    await assertSucceeds(getDocs(query(collection(adminA, 'users'), where('workspaceId', '==', workspaceA))));
    await assertFails(getDocs(collection(adminA, 'users')));
    await assertSucceeds(updateDoc(doc(adminA, 'users', 'creator-a'), { role: 'Reviewer' }));
    await assertFails(updateDoc(doc(adminA, 'users', 'creator-b'), { role: 'Reviewer' }));
    await assertFails(updateDoc(doc(creatorA, 'users', 'creator-a'), { workspaceId: workspaceB }));
    ok('profiles are private, role changes are Admin-only, and user queries are workspace-scoped');

    await assertSucceeds(getDoc(doc(creatorA, 'brandRules', workspaceA)));
    await assertFails(getDoc(doc(creatorA, 'brandRules', workspaceB)));
    await assertSucceeds(getDoc(doc(creatorA, 'workspaces', workspaceA)));
    await assertFails(getDoc(doc(creatorA, 'workspaces', workspaceB)));
    await assertSucceeds(updateDoc(doc(adminA, 'brandRules', workspaceA), { company: 'Updated A' }));
    await assertFails(updateDoc(doc(adminA, 'brandRules', workspaceB), { company: 'Hijacked' }));
    await assertFails(updateDoc(doc(creatorA, 'brandRules', workspaceA), { company: 'Hijacked' }));
    await assertFails(deleteDoc(doc(adminA, 'brandRules', workspaceA)));
    ok('workspace and brand-pack access cannot cross tenant boundaries');

    await assertSucceeds(setDoc(doc(creatorA, 'docs', 'new-doc'), documentData('new-doc', 'creator-a', workspaceA, 'Draft', 'A clean draft.')));
    await assertFails(setDoc(doc(creatorA, 'docs', 'foreign-doc'), documentData('foreign-doc', 'creator-a', workspaceB, 'Draft', 'A clean draft.')));
    await assertFails(setDoc(doc(creatorA, 'docs', 'spoofed-owner'), documentData('spoofed-owner', 'creator-b', workspaceA, 'Draft', 'A clean draft.')));
    await assertSucceeds(setDoc(doc(creatorA, 'docs', 'max-text'), documentData('max-text', 'creator-a', workspaceA, 'Draft', 'x'.repeat(20000))));
    await assertFails(setDoc(doc(creatorA, 'docs', 'oversized-text'), documentData('oversized-text', 'creator-a', workspaceA, 'Draft', 'x'.repeat(20001))));
    await assertFails(getDoc(doc(creatorB, 'docs', 'review-doc')));
    await assertFails(getDocs(query(collection(creatorA, 'docs'), where('workspaceId', '==', workspaceB))));
    await assertSucceeds(getDocs(query(collection(creatorA, 'docs'), where('workspaceId', '==', workspaceA), where('owner', '==', 'creator-a'))));
    const maxText = (await getDoc(doc(creatorA, 'docs', 'max-text'))).data();
    await assertSucceeds(updateDoc(doc(creatorA, 'docs', 'max-text'), {
      versions: maxText.versions.concat([version(2, 'x'.repeat(20000))]),
      audit: [{ at: new Date().toISOString(), who: 'Creator', what: 'Saved version 2' }]
    }));
    await assertSucceeds(updateDoc(doc(creatorA, 'docs', 'max-version-doc'), {
      versions: (await getDoc(doc(creatorA, 'docs', 'max-version-doc'))).data().versions.concat([version(100, 'Version 100')]),
      audit: [{ at: new Date().toISOString(), who: 'Creator', what: 'Saved version 100' }]
    }));
    await assertFails(setDoc(doc(creatorA, 'docs', 'bad-doc'), documentData('bad-doc', 'creator-a', workspaceA, 'Approved', 'A clean draft.')));
    await assertFails(updateDoc(doc(adminB, 'docs', 'review-doc'), { title: 'Tampered title' }));
    await assertFails(updateDoc(doc(creatorA, 'docs', 'review-doc'), {
      status: 'In review',
      versions: [version(1, 'A rewritten draft.')],
      audit: [{ at: new Date().toISOString(), who: 'Creator', what: 'tampered' }]
    }));
    for (const id of ['draft-comment-doc', 'changes-comment-doc']) {
      await assertSucceeds(updateDoc(doc(creatorA, 'docs', id), {
        comments: [{ by: 'Creator', text: 'Added a note.', at: new Date().toISOString() }],
        audit: [{ at: new Date().toISOString(), who: 'Creator', what: 'Commented' }]
      }));
    }
    await assertSucceeds(updateDoc(doc(reviewerA, 'docs', 'review-doc'), {
      comments: [{ by: 'Reviewer', text: 'Please clarify this.', at: new Date().toISOString() }],
      audit: [{ at: new Date().toISOString(), who: 'Reviewer', what: 'Commented' }]
    }));
    let updated = (await getDoc(doc(creatorA, 'docs', 'review-doc'))).data();
    await assertSucceeds(updateDoc(doc(creatorA, 'docs', 'review-doc'), {
      comments: updated.comments.concat([{ by: 'Creator', text: 'Clarified.', at: new Date().toISOString() }]),
      audit: updated.audit.concat([{ at: new Date().toISOString(), who: 'Creator', what: 'Commented' }])
    }));
    updated = (await getDoc(doc(creatorA, 'docs', 'review-doc'))).data();
    await assertFails(updateDoc(doc(creatorA, 'docs', 'review-doc'), {
      comments: [updated.comments[1], updated.comments[0], { by: 'Creator', text: 'Inserted out of order.', at: new Date().toISOString() }],
      audit: updated.audit.concat([{ at: new Date().toISOString(), who: 'Creator', what: 'Commented' }])
    }));
    const beforeEdit = (await getDoc(doc(creatorA, 'docs', 'review-doc'))).data();
    await assertSucceeds(updateDoc(doc(reviewerA, 'docs', 'review-doc'), {
      versions: beforeEdit.versions.concat([version(2, 'Reviewer edited the draft.')]),
      audit: beforeEdit.audit.concat([{ at: new Date().toISOString(), who: 'Reviewer', what: 'Committed edit' }])
    }));
    const beforeRequest = (await getDoc(doc(creatorA, 'docs', 'review-doc'))).data();
    await assertSucceeds(updateDoc(doc(reviewerA, 'docs', 'review-doc'), {
      status: 'Changes requested',
      comments: beforeRequest.comments.concat([{ by: 'Reviewer', text: 'Please revise.', at: new Date().toISOString() }]),
      audit: beforeRequest.audit.concat([{ at: new Date().toISOString(), who: 'Reviewer', what: 'Requested changes' }])
    }));
    await assertFails(updateDoc(doc(reviewerA, 'docs', 'review-doc'), {
      status: 'Approved',
      comments: beforeRequest.comments,
      audit: beforeRequest.audit
    }));
    ok('document workflow is scoped and only allowed owner/reviewer mutations succeed');

    const event = { workspaceId: workspaceA, ruleId: 'G-01', category: 'Tone', outcome: 'disputed', at: new Date().toISOString(), uid: 'creator-a' };
    const eventRef = doc(collection(creatorA, 'events'), 'event-1');
    await assertSucceeds(setDoc(eventRef, event));
    await assertFails(setDoc(doc(creatorA, 'events', 'spoofed-workspace'), Object.assign({}, event, { workspaceId: workspaceB })));
    await assertFails(setDoc(doc(creatorA, 'events', 'spoofed-user'), Object.assign({}, event, { uid: 'reviewer-a' })));
    await assertFails(updateDoc(eventRef, { outcome: 'accepted' }));
    await assertFails(deleteDoc(eventRef));
    await assertSucceeds(getDocs(query(collection(creatorA, 'events'), where('workspaceId', '==', workspaceA))));
    await assertFails(getDocs(collection(creatorA, 'events')));
    await assertFails(getDoc(doc(creatorA, 'invitations', 'secret')));
    await assertFails(setDoc(doc(creatorA, 'invitations', 'forged'), { role: 'Admin' }));
    ok('events remain identity-bound, append-only, and tenant-scoped; invitations are server-only');
    console.log('5 Firestore rules groups passed');
  } finally {
    await env.cleanup();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
