/* First-login provisioning for one explicitly configured, verified Admin account. */
'use strict';

const engine = require('../assets/js/engine.js');
const DEFAULT_INITIAL_ADMIN_EMAIL = 'admin@brand.co.in';
const DEFAULT_WORKSPACE_NAME = 'BrandGuard';
let firebaseApp;

function respond(res, status, body) { return res.status(status).json(body); }
function fail(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}
function serviceApp() {
  if (firebaseApp) return firebaseApp;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw fail(503, 'not_configured', 'Admin provisioning is not configured.');
  const { getApps, initializeApp, cert } = require('firebase-admin/app');
  const apps = getApps();
  if (apps.length) firebaseApp = apps[0];
  else {
    const account = JSON.parse(raw);
    firebaseApp = initializeApp({ credential: cert(account), projectId: account.project_id });
  }
  return firebaseApp;
}
function validWorkspaceId(value) {
  return typeof value === 'string' && /^ws-[A-Za-z0-9_-]{1,128}$/.test(value);
}

module.exports = async function handler(req, res) {
  const origin = process.env.APP_ORIGIN;
  if (origin && req.headers.origin === origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') return respond(res, 204, {});
  if (req.method !== 'POST') return respond(res, 405, { error: 'POST only', code: 'method_not_allowed' });

  const allowedEmail = String(process.env.INITIAL_ADMIN_EMAIL || DEFAULT_INITIAL_ADMIN_EMAIL).trim().toLowerCase();
  const workspaceName = String(process.env.BOOTSTRAP_WORKSPACE_NAME || DEFAULT_WORKSPACE_NAME).trim();
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return respond(res, 503, { error: 'First Admin provisioning is not configured.', code: 'not_configured' });
  }

  let firebase;
  try {
    firebase = serviceApp();
  } catch (error) {
    if (error.status) return respond(res, error.status, { error: error.message, code: error.code });
    console.error('First Admin service configuration failed:', error.message);
    return respond(res, 503, { error: 'First Admin provisioning is not configured correctly.', code: 'not_configured' });
  }

  let actor;
  try {
    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token) throw fail(401, 'unauthorized', 'Sign in is required.');
    actor = await require('firebase-admin/auth').getAuth(firebase).verifyIdToken(token, true);
  } catch (error) {
    if (error.status) return respond(res, error.status, { error: error.message, code: error.code });
    console.error('First Admin authentication failed:', error.message);
    return respond(res, 401, { error: 'Sign in again before setting up the workspace.', code: 'unauthorized' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(allowedEmail) ||
      String(actor.email || '').trim().toLowerCase() !== allowedEmail) {
    return respond(res, 404, { error: 'No initial Admin setup is available for this account.', code: 'not_initial_admin' });
  }
  if (actor.email_verified !== true) {
    return respond(res, 403, { error: 'Verify the configured Admin email before first sign-in.', code: 'verified_email_required' });
  }
  if (!workspaceName || workspaceName.length > 120) {
    return respond(res, 503, { error: 'First Admin workspace name is not configured.', code: 'not_configured' });
  }

  const uid = actor.uid;
  const workspaceId = 'ws-' + uid;
  if (!validWorkspaceId(workspaceId)) {
    return respond(res, 409, { error: 'The Admin account cannot be assigned a valid workspace ID.', code: 'invalid_workspace' });
  }

  try {
    const db = require('firebase-admin/firestore').getFirestore(firebase);
    const userRef = db.collection('users').doc(uid);
    const workspaceRef = db.collection('workspaces').doc(workspaceId);
    const rulesRef = db.collection('brandRules').doc(workspaceId);
    const claimRef = db.collection('system').doc('initialAdmin');
    const rules = engine.templateRules(workspaceName);
    rules.initialAdmin = uid;
    const ruleErrors = engine.validateRules(rules);
    if (ruleErrors.length) throw fail(503, 'invalid_default_rules', 'Default workspace rules failed validation.');
    const email = String(actor.email).trim().toLowerCase();
    const profile = {
      name: String(actor.name || email.split('@')[0]).slice(0, 120),
      email,
      role: 'Admin',
      workspaceId,
      createdAt: new Date().toISOString(),
      photo: typeof actor.picture === 'string' ? actor.picture : ''
    };

    const result = await db.runTransaction(async (transaction) => {
      const [userSnap, workspaceSnap, rulesSnap, claimSnap, anyWorkspaceSnap] = await Promise.all([
        transaction.get(userRef), transaction.get(workspaceRef), transaction.get(rulesRef),
        transaction.get(claimRef), transaction.get(db.collection('workspaces').limit(1))
      ]);
      if (claimSnap.exists && claimSnap.data().uid !== uid) {
        throw fail(409, 'workspace_conflict', 'The initial Admin has already been provisioned for another account. Nothing was changed.');
      }
      if (userSnap.exists) {
        const existing = userSnap.data();
        if (existing.role === 'Admin' && existing.workspaceId === workspaceId &&
            workspaceSnap.exists && rulesSnap.exists &&
            workspaceSnap.data().initialAdmin === uid && rulesSnap.data().initialAdmin === uid) {
          if (!claimSnap.exists) {
            transaction.create(claimRef, { uid, email, workspaceId, createdAt: profile.createdAt });
          }
          return { profile: existing, created: false };
        }
        throw fail(409, 'workspace_conflict', 'This account or workspace already has different data. Nothing was changed.');
      }

      if (workspaceSnap.exists || rulesSnap.exists) {
        if (!workspaceSnap.exists || !rulesSnap.exists ||
            workspaceSnap.data().initialAdmin !== uid || rulesSnap.data().initialAdmin !== uid) {
          throw fail(409, 'workspace_conflict', 'Workspace data already exists and does not match this Admin account. Nothing was changed.');
        }
        transaction.create(userRef, profile);
        if (!claimSnap.exists) transaction.create(claimRef, { uid, email, workspaceId, createdAt: profile.createdAt });
        return { profile, created: true };
      }
      if (anyWorkspaceSnap.docs.length) {
        throw fail(409, 'workspace_conflict', 'Workspace data already exists for another account. Nothing was changed.');
      }

      const now = profile.createdAt;
      transaction.create(workspaceRef, {
        name: workspaceName,
        createdAt: now,
        initialAdmin: uid,
        schemaVersion: 1
      });
      transaction.create(rulesRef, rules);
      transaction.create(userRef, profile);
      transaction.create(claimRef, { uid, email, workspaceId, createdAt: now });
      return { profile, created: true };
    });
    return respond(res, 200, result);
  } catch (error) {
    if (error.status) return respond(res, error.status, { error: error.message, code: error.code });
    console.error('First Admin provisioning failed:', error.message);
    return respond(res, 500, { error: 'The initial workspace could not be provisioned. Try again or contact the deployment owner.', code: 'provisioning_failed' });
  }
};
