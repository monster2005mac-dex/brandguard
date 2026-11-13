/* Copy the legacy singleton Firebase data into workspace-scoped records. */
'use strict';

const adminApp = require('firebase-admin/app');
const adminFirestore = require('firebase-admin/firestore');
const engine = require('../assets/js/engine.js');

async function main() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Set FIREBASE_SERVICE_ACCOUNT_JSON to a Firebase service-account JSON value.');
  const serviceAccount = JSON.parse(raw);
  const app = adminApp.initializeApp({
    credential: adminApp.cert(serviceAccount),
    projectId: serviceAccount.project_id
  });
  try {
    const db = adminFirestore.getFirestore(app);
    const [oldRulesSnap, usersSnap, docsSnap, eventsSnap] = await Promise.all([
      db.collection('brand').doc('rules').get(),
      db.collection('users').get(),
      db.collection('docs').get(),
      db.collection('events').get()
    ]);
    if (!oldRulesSnap.exists) throw new Error('No legacy brand/rules document was found.');
    const oldRules = oldRulesSnap.data();
    let adminUid = oldRules.initialAdmin;
    if (!adminUid) {
      const admins = usersSnap.docs.filter((doc) => doc.data().role === 'Admin');
      if (admins.length !== 1) throw new Error('Cannot identify exactly one legacy Admin; set initialAdmin or resolve roles before migration.');
      adminUid = admins[0].id;
    }
    if (!usersSnap.docs.some((doc) => doc.id === adminUid && doc.data().role === 'Admin')) {
      throw new Error('The initial Admin profile is missing or does not have the Admin role.');
    }
    const workspaceId = 'ws-' + adminUid;
    const rules = Object.assign({}, oldRules, { initialAdmin: adminUid });
    delete rules.gemini;
    delete rules.docs;
    const ruleErrors = engine.validateRules(rules);
    if (ruleErrors.length) throw new Error('Legacy brand pack must be reviewed before migration: ' + ruleErrors[0]);
    for (const doc of usersSnap.docs.concat(docsSnap.docs, eventsSnap.docs)) {
      const existingWorkspace = doc.data().workspaceId;
      if (existingWorkspace && existingWorkspace !== workspaceId) {
        throw new Error('Found mixed workspace data in the legacy collections; refusing to merge unrelated records.');
      }
    }

    const workspaceRef = db.collection('workspaces').doc(workspaceId);
    const rulesRef = db.collection('brandRules').doc(workspaceId);
    const workspaceSnap = await workspaceRef.get();
    if (workspaceSnap.exists && workspaceSnap.data().migrationState === 'complete') {
      throw new Error('This workspace migration is already complete.');
    }
    if (!workspaceSnap.exists) {
      await workspaceRef.create({
        name: rules.company,
        initialAdmin: adminUid,
        schemaVersion: 1,
        migrationState: 'in_progress',
        createdAt: new Date().toISOString()
      });
    }
    await rulesRef.set(rules);

    const writer = db.bulkWriter();
    usersSnap.docs.forEach((doc) => writer.set(doc.ref, Object.assign({}, doc.data(), { workspaceId })));
    docsSnap.docs.forEach((doc) => writer.set(
      db.collection('docs').doc(doc.id), Object.assign({}, doc.data(), { workspaceId })
    ));
    eventsSnap.docs.forEach((doc) => writer.set(
      db.collection('events').doc(doc.id), Object.assign({}, doc.data(), { workspaceId })
    ));
    await writer.close();
    await workspaceRef.update({ migrationState: 'complete', migratedAt: new Date().toISOString() });
    console.log('Migrated ' + usersSnap.size + ' users, ' + docsSnap.size + ' drafts, and ' +
      eventsSnap.size + ' events to ' + workspaceId + '. Legacy source records were retained.');
  } finally {
    await adminApp.deleteApp(app);
  }
}

main().catch((error) => {
  console.error('Workspace migration failed:', error.message);
  process.exitCode = 1;
});
