/* Authenticated Gemini proxy with a Firestore-backed, cross-instance per-user limit. */
'use strict';

const WINDOW_MS = 60 * 1000;
const MAX_CALLS = 20;
const MAX_PROMPT_CHARS = 30000;
let firebaseApp;

function send(res, status, body) { return res.status(status).json(body); }

function serviceApp() {
  if (firebaseApp) return firebaseApp;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw serviceError('shared_limit_unavailable', 'Shared AI rate limiting is not configured.');
  const { getApps, initializeApp, cert } = require('firebase-admin/app');
  const apps = getApps();
  if (apps.length) firebaseApp = apps[0];
  else {
    const account = JSON.parse(raw);
    firebaseApp = initializeApp({ credential: cert(account), projectId: account.project_id });
  }
  return firebaseApp;
}

async function verifyToken(token) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const app = serviceApp();
    return require('firebase-admin/auth').getAuth(app).verifyIdToken(token).then((decoded) => decoded.uid);
  }
  const webKey = process.env.FIREBASE_API_KEY;
  if (!webKey) throw new Error('Firebase token verification is not configured.');
  const response = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(webKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token })
  });
  if (!response.ok) throw new Error('Token rejected.');
  const body = await response.json();
  const user = body.users && body.users[0];
  if (!user || typeof user.localId !== 'string') throw new Error('Token has no user.');
  return user.localId;
}

async function consumeSharedLimit(uid, now) {
  const app = serviceApp();
  const db = require('firebase-admin/firestore').getFirestore(app);
  const ref = db.collection('aiRateLimits').doc(uid);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const previous = snapshot.exists && snapshot.data().hits;
    const recent = (Array.isArray(previous) ? previous : []).filter((hit) =>
      Number.isSafeInteger(hit) && hit <= now && now - hit < WINDOW_MS
    );
    if (recent.length >= MAX_CALLS) throw serviceError('rate_limited', 'Too many requests. Wait a minute.');
    recent.push(now);
    transaction.set(ref, { hits: recent, expiresAt: new Date(now + WINDOW_MS) });
  });
}

async function callGemini(prompt, json, apiKey, model) {
  const generationConfig = { temperature: 0.1, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } };
  if (json) generationConfig.responseMimeType = 'application/json';
  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig })
    }
  );
  if (!response.ok) {
    console.error('Gemini upstream request failed with status', response.status);
    throw serviceError(response.status === 429 ? 'upstream_rate_limited' : 'upstream_error',
      response.status === 429 ? 'Gemini is rate limited. Try again shortly.' : 'Gemini could not complete the request.');
  }
  const body = await response.json();
  const text = ((body.candidates && body.candidates[0] && body.candidates[0].content && body.candidates[0].content.parts) || [])
    .map((part) => typeof part.text === 'string' ? part.text : '').join('\n');
  if (!text) throw serviceError('empty_response', 'Gemini returned an empty response.');
  return text;
}

module.exports = async function handler(req, res) {
  const origin = process.env.APP_ORIGIN;
  if (origin && req.headers.origin === origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') return send(res, 204, {});

  const apiKey = process.env.GEMINI_API_KEY;
  const sharedLimitConfigured = !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (req.method === 'GET') {
    return send(res, 200, {
      configured: !!apiKey && sharedLimitConfigured,
      sharedRateLimit: sharedLimitConfigured,
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash'
    });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only', code: 'method_not_allowed' });
  if (!apiKey) return send(res, 503, { error: 'The server AI key is not configured.', code: 'not_configured' });
  if (!sharedLimitConfigured) {
    return send(res, 503, { error: 'Shared AI rate limiting is not configured.', code: 'shared_limit_unavailable' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (error) {
    return send(res, 400, { error: 'Request body must be valid JSON.', code: 'invalid_json' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      typeof body.prompt !== 'string' || !body.prompt.trim()) {
    return send(res, 400, { error: 'A non-empty prompt is required.', code: 'invalid_request' });
  }
  if (body.prompt.length > MAX_PROMPT_CHARS) {
    return send(res, 413, { error: 'The prompt is too large. Split it into smaller sections.', code: 'prompt_too_large' });
  }

  let uid;
  try {
    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token) return send(res, 401, { error: 'Sign in required.', code: 'unauthorized' });
    uid = await verifyToken(token);
  } catch (error) {
    console.error('Gemini authentication failed:', error.message);
    return send(res, 401, { error: 'Sign in again before using the deep check.', code: 'unauthorized' });
  }

  try {
    await consumeSharedLimit(uid, Date.now());
  } catch (error) {
    if (error.code === 'rate_limited') return send(res, 429, { error: error.message, code: error.code });
    console.error('Shared AI rate limit failed:', error.message);
    return send(res, 503, { error: 'Shared AI rate limiting is unavailable. Try again later.', code: 'shared_limit_unavailable' });
  }

  try {
    const text = await callGemini(body.prompt, body.json === true, apiKey, process.env.GEMINI_MODEL || 'gemini-2.5-flash');
    return send(res, 200, { text });
  } catch (error) {
    if (error.code === 'upstream_rate_limited') return send(res, 429, { error: error.message, code: error.code });
    if (error.code === 'empty_response') return send(res, 502, { error: error.message, code: error.code });
    console.error('Gemini request failed:', error.message);
    return send(res, 502, { error: 'Gemini request failed. Try again.', code: 'upstream_error' });
  }
};

function serviceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

module.exports.consumeSharedLimit = consumeSharedLimit;
