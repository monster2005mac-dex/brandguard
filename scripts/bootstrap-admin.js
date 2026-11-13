/* Create the first workspace membership for a Firebase Auth user. */
'use strict';

const adminApp = require('firebase-admin/app');
const adminAuth = require('firebase-admin/auth');
const adminFirestore = require('firebase-admin/firestore');
const engine = require('../assets/js/engine.js');

async function main() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const uid = process.env.BOOTSTRAP_ADMIN_UID;
  const workspaceName = (process.env.BOOTSTRAP_WORKSPACE_NAME || '').trim();
  if (!raw || !uid || !workspaceName || workspaceName.length > 120) {
    throw new Error('Set FIREBASE_SERVICE_ACCOUNT_JSON, BOOTSTRAP_ADMIN_UID, and BOOTSTRAP_WORKSPACE_NAME.');
  }
  const serviceAccount = JSON.parse(raw);
  const app = adminApp.initializeApp({
    credential: adminApp.cert(serviceAccount),
    projectId: serviceAccount.project_id
  });
  try {
  const authUser = await adminAuth.getAuth(app).getUser(uid);
  if (!authUser.email || !authUser.emailVerified) throw new Error('The bootstrap Admin must have a verified email address.');

  const workspaceId = 'ws-' + uid;
  const db = adminFirestore.getFirestore(app);
  const userRef = db.collection('users').doc(uid);
  const workspaceRef = db.collection('workspaces').doc(workspaceId);
  const rulesRef = db.collection('brandRules').doc(workspaceId);
  const now = new Date().toISOString();
  const rules = engine.templateRules(workspaceName);
  rules.initialAdmin = uid;
  const ruleErrors = engine.validateRules(rules);
  if (ruleErrors.length) throw new Error('Default brand pack failed validation: ' + ruleErrors[0]);

  await db.runTransaction(async (transaction) => {
    const [userSnap, workspaceSnap, rulesSnap] = await Promise.all([
      transaction.get(userRef), transaction.get(workspaceRef), transaction.get(rulesRef)
    ]);
    if (userSnap.exists || workspaceSnap.exists || rulesSnap.exists) {
      throw new Error('This account or workspace is already initialized. No data was changed.');
    }
    transaction.create(workspaceRef, { name: workspaceName, createdAt: now, initialAdmin: uid, schemaVersion: 1 });
    transaction.create(rulesRef, rules);
    transaction.create(userRef, {
      name: authUser.displayName || authUser.email.split('@')[0],
      email: authUser.email.toLowerCase(),
      role: 'Admin',
      workspaceId,
      createdAt: now,
      photo: authUser.photoURL || ''
    });
  });
  console.log('Created workspace ' + workspaceId + ' and its initial Admin.');
  } finally {
    await adminApp.deleteApp(app);
  }
}

main().catch((error) => {
  console.error('Workspace bootstrap failed:', error.message);
  process.exitCode = 1;
});
