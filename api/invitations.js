/* Workspace invitation issuance and atomic membership acceptance. */
'use strict';

const crypto = require('crypto');
let firebaseApp;

function response(res, status, body) { return res.status(status).json(body); }
function fail(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}
function app() {
  if (firebaseApp) return firebaseApp;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw fail(503, 'not_configured', 'Invitation service is not configured.');
  const { getApps, initializeApp, cert } = require('firebase-admin/app');
  const apps = getApps();
  if (apps.length) firebaseApp = apps[0];
  else {
    const account = JSON.parse(raw);
    firebaseApp = initializeApp({ credential: cert(account), projectId: account.project_id });
  }
  return firebaseApp;
}
function validWorkspaceId(value) { return typeof value === 'string' && /^ws-[A-Za-z0-9_-]{1,128}$/.test(value); }
function invitationRef(db, token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) throw fail(400, 'invalid_invitation', 'The invitation link is invalid.');
  const digest = crypto.createHash('sha256').update(token).digest('hex');
  return db.collection('invitations').doc(digest);
}
function appUrl(token) {
  const invitePath = '/login.html#invite=' + encodeURIComponent(token);
  const configuredOrigin = process.env.APP_ORIGIN;
  if (!configuredOrigin) return invitePath;
  let origin;
  try { origin = new URL(configuredOrigin); }
  catch (error) { throw fail(503, 'not_configured', 'APP_ORIGIN must be a valid HTTPS origin.'); }
  if (origin.protocol !== 'https:' && origin.hostname !== 'localhost') {
    throw fail(503, 'not_configured', 'APP_ORIGIN must use HTTPS.');
  }
  return new URL(invitePath, origin.origin).toString();
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
  if (req.method === 'OPTIONS') return response(res, 204, {});
  if (req.method !== 'POST') return response(res, 405, { error: 'POST only', code: 'method_not_allowed' });

  let firebase;
  let db;
  let actor;
  try {
    firebase = app();
    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token) throw fail(401, 'unauthorized', 'Sign in is required.');
    actor = await require('firebase-admin/auth').getAuth(firebase).verifyIdToken(token, true);
    db = require('firebase-admin/firestore').getFirestore(firebase);
  } catch (error) {
    if (error.status) return response(res, error.status, { error: error.message, code: error.code });
    console.error('Invitation authentication failed:', error.message);
    return response(res, 401, { error: 'Sign in again before using invitations.', code: 'unauthorized' });
  }

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch (error) { return response(res, 400, { error: 'Request body must be valid JSON.', code: 'invalid_json' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return response(res, 400, { error: 'An invitation action is required.', code: 'invalid_request' });
  }

  try {
    if (body.action === 'create') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const role = body.role;
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          !['Creator', 'Reviewer'].includes(role)) {
        throw fail(400, 'invalid_invitation', 'Enter a valid email address and choose Creator or Reviewer.');
      }
      const userSnap = await db.collection('users').doc(actor.uid).get();
      const user = userSnap.exists ? userSnap.data() : null;
      if (!user || user.role !== 'Admin' || !validWorkspaceId(user.workspaceId)) {
        throw fail(403, 'forbidden', 'Only a workspace Admin can invite people.');
      }
      const workspace = user.workspaceId;
      const [workspaceSnap, rulesSnap] = await Promise.all([
        db.collection('workspaces').doc(workspace).get(),
        db.collection('brandRules').doc(workspace).get()
      ]);
      if (!workspaceSnap.exists || !rulesSnap.exists) throw fail(409, 'workspace_unavailable', 'This workspace is not fully configured.');

      const inviteToken = crypto.randomBytes(32).toString('base64url');
      const invite = {
        email,
        role,
        workspaceId: workspace,
        createdBy: actor.uid,
        createdAt: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        acceptedAt: null
      };
      await invitationRef(db, inviteToken).create(invite);
      return response(res, 201, { url: appUrl(inviteToken), expiresAt: invite.expiresAt });
    }

    if (body.action === 'accept') {
      const ref = invitationRef(db, body.token);
      const userRef = db.collection('users').doc(actor.uid);
      const suppliedName = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
      const email = String(actor.email || '').trim().toLowerCase();
      if (!email || actor.email_verified !== true) throw fail(403, 'verified_email_required', 'Verify the invited email address before joining.');
      const profile = await db.runTransaction(async (transaction) => {
        const [inviteSnap, existingUserSnap] = await Promise.all([transaction.get(ref), transaction.get(userRef)]);
        if (existingUserSnap.exists) {
          const existing = existingUserSnap.data();
          if (existing.workspaceId) throw fail(409, 'already_member', 'This account already belongs to a workspace.');
        }
        if (!inviteSnap.exists) throw fail(404, 'invitation_not_found', 'This invitation has expired or was already used.');
        const invite = inviteSnap.data();
        if (invite.acceptedAt || !Number.isSafeInteger(invite.expiresAt) || invite.expiresAt <= Date.now()) {
          throw fail(410, 'invitation_expired', 'This invitation has expired or was already used. Ask an Admin for a new link.');
        }
        if (invite.email !== email) throw fail(403, 'invitation_email_mismatch', 'Sign in with the email address this invitation was sent to.');
        if (!validWorkspaceId(invite.workspaceId) || !['Creator', 'Reviewer'].includes(invite.role)) {
          throw fail(409, 'invalid_invitation', 'The invitation data is invalid.');
        }
        const workspaceRef = db.collection('workspaces').doc(invite.workspaceId);
        const rulesRef = db.collection('brandRules').doc(invite.workspaceId);
        const [workspaceSnap, rulesSnap] = await Promise.all([transaction.get(workspaceRef), transaction.get(rulesRef)]);
        if (!workspaceSnap.exists || !rulesSnap.exists) throw fail(409, 'workspace_unavailable', 'The invited workspace is no longer available.');
        const membership = {
          name: suppliedName || String(actor.name || email.split('@')[0]).slice(0, 120),
          email,
          role: invite.role,
          workspaceId: invite.workspaceId,
          createdAt: new Date().toISOString(),
          photo: ''
        };
        transaction.create(userRef, membership);
        transaction.update(ref, { acceptedAt: Date.now(), acceptedBy: actor.uid });
        return membership;
      });
      return response(res, 200, { profile });
    }
    return response(res, 400, { error: 'Unknown invitation action.', code: 'invalid_action' });
  } catch (error) {
    if (error.status) return response(res, error.status, { error: error.message, code: error.code });
    console.error('Invitation operation failed:', error.message);
    return response(res, 500, { error: 'The invitation could not be completed. Try again.', code: 'internal_error' });
  }
};

module.exports.invitationRef = invitationRef;
