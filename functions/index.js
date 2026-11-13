/* Optional Firebase Functions Gemini proxy; uses the same Firestore quota as the Vercel API. */
'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const WINDOW_MS = 60 * 1000;
const MAX_CALLS = 20;
const MAX_PROMPT_CHARS = 30000;

async function consumeSharedLimit(uid) {
  const db = admin.firestore();
  const ref = db.collection('aiRateLimits').doc(uid);
  const now = Date.now();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const hits = snapshot.exists && snapshot.data().hits;
    const recent = (Array.isArray(hits) ? hits : []).filter((hit) =>
      Number.isSafeInteger(hit) && hit <= now && now - hit < WINDOW_MS
    );
    if (recent.length >= MAX_CALLS) {
      const error = new Error('The shared per-user Gemini limit was reached. Wait a minute and try again.');
      error.code = 'rate_limited';
      throw error;
    }
    recent.push(now);
    transaction.set(ref, { hits: recent, expiresAt: new Date(now + WINDOW_MS) });
  });
}

exports.gemini = onRequest({
  secrets: [GEMINI_API_KEY],
  cors: process.env.APP_ORIGIN ? [process.env.APP_ORIGIN] : false,
  region: 'asia-south1',
  maxInstances: 5
}, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only', code: 'method_not_allowed' });
  if (typeof GEMINI_API_KEY.value() !== 'string' || !GEMINI_API_KEY.value()) {
    return res.status(503).json({ error: 'Gemini is not configured.', code: 'not_configured' });
  }
  const token = (req.get('Authorization') || '').match(/^Bearer\s+(.+)$/);
  if (!token) return res.status(401).json({ error: 'Sign in required.', code: 'unauthorized' });

  let user;
  try { user = await admin.auth().verifyIdToken(token[1].trim(), true); }
  catch (error) {
    console.error('Gemini authentication failed:', error.message);
    return res.status(401).json({ error: 'Sign in again before using the deep check.', code: 'unauthorized' });
  }

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      typeof body.prompt !== 'string' || !body.prompt.trim()) {
    return res.status(400).json({ error: 'A non-empty prompt is required.', code: 'invalid_request' });
  }
  if (body.prompt.length > MAX_PROMPT_CHARS) {
    return res.status(413).json({ error: 'The prompt is too large. Split it into smaller sections.', code: 'prompt_too_large' });
  }
  try { await consumeSharedLimit(user.uid); }
  catch (error) {
    if (error.code === 'rate_limited') return res.status(429).json({ error: error.message, code: error.code });
    console.error('Shared AI rate limit failed:', error.message);
    return res.status(503).json({ error: 'Shared AI rate limiting is unavailable. Try again later.', code: 'shared_limit_unavailable' });
  }

  try {
    const generationConfig = { temperature: 0.1, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } };
    if (body.json === true) generationConfig.responseMimeType = 'application/json';
    const upstream = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(MODEL) + ':generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY.value() },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: body.prompt }] }], generationConfig })
      }
    );
    if (!upstream.ok) {
      console.error('Gemini upstream request failed with status', upstream.status);
      return res.status(upstream.status === 429 ? 429 : 502).json({
        error: upstream.status === 429 ? 'Gemini is rate limited. Try again shortly.' : 'Gemini could not complete the request.',
        code: upstream.status === 429 ? 'upstream_rate_limited' : 'upstream_error'
      });
    }
    const data = await upstream.json();
    const text = ((data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [])
      .map((part) => typeof part.text === 'string' ? part.text : '').join('\n');
    if (!text) return res.status(502).json({ error: 'Gemini returned an empty response.', code: 'empty_response' });
    return res.json({ text });
  } catch (error) {
    console.error('Gemini request failed:', error.message);
    return res.status(502).json({ error: 'Gemini request failed. Try again.', code: 'upstream_error' });
  }
});
