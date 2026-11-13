/* Server-verifies a submitted version and records an immutable approval fingerprint. */
const crypto = require('crypto');
const engine = require('../assets/js/engine.js');
const MAX_IMAGE_DATA_URL = 220000;
let firebaseApp;

function respond(res, status, body) { return res.status(status).json(body); }
function serviceApp() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Approval service is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON.');
  const { getApps, initializeApp, cert } = require('firebase-admin/app');
  if (firebaseApp) return firebaseApp;
  const apps = getApps();
  if (apps.length) firebaseApp = apps[0];
  else {
    const account = JSON.parse(raw);
    firebaseApp = initializeApp({ credential: cert(account), projectId: account.project_id });
  }
  return firebaseApp;
}
function sha(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : engine.canonicalJson(value)).digest('hex');
}
function openHigh(findings, disputed) {
  const counts = new Map();
  (Array.isArray(disputed) ? disputed : []).forEach((item) => {
    if (!item || typeof item.ruleId !== 'string' || typeof item.quote !== 'string' ||
        typeof item.reason !== 'string' || item.reason.trim().length < 3) return;
    const key = item.ruleId + '|' + item.quote.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return findings.filter((finding) => {
    if (finding.severity !== 'high') return false;
    const key = finding.ruleId + '|' + String(finding.quote || '').toLowerCase();
    const remaining = counts.get(key) || 0;
    if (remaining) {
      counts.set(key, remaining - 1);
      return false;
    }
    return true;
  });
}
async function dominantColors(dataUrl) {
  if (typeof dataUrl !== 'string' || dataUrl.length > MAX_IMAGE_DATA_URL) {
    throw approvalError(409, 'The attached image is too large. Reattach a smaller PNG or JPG.', 'invalid_image');
  }
  const match = dataUrl.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw approvalError(409, 'The attached image is not in the expected format. Reattach and resubmit.', 'invalid_image');
  const sharp = require('sharp');
  const buffer = Buffer.from(match[1], 'base64');
  if (buffer.length > 165000 || buffer.toString('base64') !== match[1]) {
    throw approvalError(409, 'The attached image is invalid or too large. Reattach and resubmit.', 'invalid_image');
  }
  const image = sharp(buffer, { limitInputPixels: 1280 * 1280, failOn: 'error' });
  const metadata = await image.metadata();
  if (metadata.format !== 'jpeg' || !metadata.width || !metadata.height ||
      metadata.width > 1280 || metadata.height > 1280 || metadata.width * metadata.height > 1280 * 1280) {
    throw approvalError(409, 'The image dimensions are invalid. Reattach and resubmit.', 'invalid_image');
  }
  const { data } = await image.flatten({ background: '#ffffff' })
    .resize(96, 96, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const bins = new Map();
  for (let i = 0; i < data.length; i += 12) {
    const r = data[i], g = data[i + 1], b = data[i + 2], key = [r >> 4, g >> 4, b >> 4].join(',');
    const bin = bins.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    bin.count++; bin.r += r; bin.g += g; bin.b += b; bins.set(key, bin);
  }
  return Array.from(bins.values()).sort((a, b) => b.count - a.count).slice(0, 5).map((bin) => {
    const hex = (n) => Math.round(n / bin.count).toString(16).padStart(2, '0');
    return '#'+hex(bin.r)+hex(bin.g)+hex(bin.b);
  });
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
  if (req.method === 'OPTIONS') return respond(res, 204, {});
  if (req.method !== 'POST') return respond(res, 405, { error: 'POST only', code: 'method_not_allowed' });
  let app;
  try { app = serviceApp(); }
  catch (error) {
    console.error('approval service configuration:', error.message);
    return respond(res, 503, { error: error.message, code: 'not_configured' });
  }

  let uid;
  try {
    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token) return respond(res, 401, { error: 'Sign in required.', code: 'unauthorized' });
    uid = (await require('firebase-admin/auth').getAuth(app).verifyIdToken(token, true)).uid;
  } catch (error) {
    return respond(res, 401, { error: 'Sign in again before approving.', code: 'unauthorized' });
  }

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch (error) { return respond(res, 400, { error: 'Request body must be valid JSON.', code: 'invalid_json' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return respond(res, 400, { error: 'A valid document and version are required.', code: 'invalid_request' });
  }
  const id = typeof body.docId === 'string' ? body.docId : '';
  const versionNumber = Number(body.version);
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id) || !Number.isInteger(versionNumber) || versionNumber < 1) {
    return respond(res, 400, { error: 'A valid document and version are required.', code: 'invalid_request' });
  }
  let db;
  try { db = require('firebase-admin/firestore').getFirestore(app); }
  catch (error) {
    console.error('approval Firestore initialization:', error.message);
    return respond(res, 503, { error: 'Approval database is unavailable.', code: 'not_configured' });
  }

  try {
    const result = await db.runTransaction(async (transaction) => {
      const docRef = db.collection('docs').doc(id);
      const userRef = db.collection('users').doc(uid);
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) throw approvalError(404, 'Document or workspace was not found.', 'not_found');
      const user = userSnap.data(), workspaceId = user.workspaceId;
      if (typeof workspaceId !== 'string' || !/^ws-[A-Za-z0-9_-]{1,128}$/.test(workspaceId)) {
        throw approvalError(403, 'Your account is not assigned to a valid workspace.', 'invalid_membership');
      }
      const rulesRef = db.collection('brandRules').doc(workspaceId);
      const [docSnap, rulesSnap] = await Promise.all([transaction.get(docRef), transaction.get(rulesRef)]);
      if (!docSnap.exists || !rulesSnap.exists) throw approvalError(404, 'Document or workspace was not found.', 'not_found');
      const doc = docSnap.data(), rules = rulesSnap.data();
      if (doc.workspaceId !== workspaceId) throw approvalError(404, 'Document or workspace was not found.', 'not_found');
      const ruleErrors = engine.validateRules(rules);
      if (ruleErrors.length) throw approvalError(409, 'The saved brand pack is invalid: '+ruleErrors[0], 'invalid_brand_pack');
      if (!['Reviewer', 'Admin'].includes(user.role)) throw approvalError(403, 'Only a Reviewer or Admin can approve.', 'forbidden');
      if (doc.owner === uid) throw approvalError(403, 'You cannot approve your own document.', 'self_approval');
      if (doc.status !== 'In review') throw approvalError(409, 'This document is no longer waiting for review.', 'stale_status');
      const versions = doc.versions || [];
      const version = versions[versions.length - 1];
      if (!version || version.n !== versionNumber) throw approvalError(409, 'A newer version exists. Reload the document and review it again.', 'stale_version');
      const summary = version.summary || {};
      if (!summary.rulesFingerprint || !summary.checkSnapshot) throw approvalError(409, 'This submission predates server verification. Ask the creator to save and resubmit it.', 'resubmit_required');
      if (summary.rulesFingerprint !== engine.fingerprint(rules)) throw approvalError(409, 'Brand rules changed after submission. Re-run the checks and resubmit.', 'stale_rules');

      const expectedChecks = engine.checkSnapshot(version.text, rules);
      if (engine.canonicalJson(summary.checkSnapshot) !== engine.canonicalJson(expectedChecks)) {
        throw approvalError(409, 'The submitted rule findings no longer match this version. Re-run the checks and resubmit.', 'stale_findings');
      }
      const expectedVisual = engine.visualSnapshot(doc.visual || null);
      if (engine.canonicalJson(summary.visualSnapshot || null) !== engine.canonicalJson(expectedVisual)) {
        throw approvalError(409, 'The attached image or its visual checks changed after submission. Recheck and resubmit.', 'stale_visual');
      }
      let verifiedVisual = doc.visual || null;
      if (doc.image) {
        const dataUrl = doc.image.dataUrl || '';
        if (sha(dataUrl) !== expectedVisual.imageHash) {
          throw approvalError(409, 'The attached image does not match the submitted image fingerprint. Reattach and resubmit.', 'image_changed');
        }
        if (body.visualConfirmed !== true) throw approvalError(400, 'The reviewer must inspect the attached image before approval.', 'visual_confirmation_required');
        const colors = await dominantColors(dataUrl);
        const claimedColors = expectedVisual.colors || [];
        if (colors.length !== claimedColors.length || colors.some((color) => !claimedColors.some((claimed) => engine.colorDistance(color, claimed) <= 12))) {
          throw approvalError(409, 'Image color analysis changed since submission. Reattach the image and rerun visual review.', 'stale_visual');
        }
        verifiedVisual = Object.assign({}, doc.visual, { colors });
      }
      const visualFindings = engine.visualChecks(verifiedVisual, rules);
      const blockers = openHigh(expectedChecks.concat(visualFindings), summary.disputedList);
      if (blockers.length) throw approvalError(409, blockers.length+' high-severity finding'+(blockers.length===1?' remains':'s remain')+' open.', 'blocking_findings');

      const versionHash = sha({ version: version.n, text: version.text, imageHash: expectedVisual && expectedVisual.imageHash });
      const rulesHash = sha(rules);
      const findingsHash = sha({ checks: expectedChecks, visual: visualFindings, disputed: summary.disputedList || [] });
      const approvedAt = new Date().toISOString();
      const audit = Array.isArray(doc.audit) ? doc.audit.slice() : [];
      audit.push({ at: approvedAt, who: user.name || user.role, what: 'Server-verified approval of version '+version.n+' · '+versionHash.slice(0,12) });
      transaction.update(docRef, {
        status: 'Approved',
        approval: { version: version.n, versionHash, rulesHash, findingsHash, approvedAt, approvedBy: uid, visualConfirmed: !!doc.image },
        audit
      });
      return { status: 'Approved', version: version.n, versionHash };
    });
    return respond(res, 200, result);
  } catch (error) {
    if (error.status) return respond(res, error.status, { error: error.message, code: error.code });
    console.error('server approval failed:', error.message);
    return respond(res, 500, { error: 'Approval could not be completed. Try again.', code: 'internal_error' });
  }
};

function approvalError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}
module.exports.dominantColors = dominantColors;
module.exports.openHigh = openHigh;
