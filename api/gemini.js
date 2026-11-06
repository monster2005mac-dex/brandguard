/* Vercel serverless function: server-side Gemini proxy.
   - The Gemini key lives only in the GEMINI_API_KEY environment variable. It never reaches the browser.
   - Only signed-in Firebase users can call it. The ID token is verified in one of two ways:
       a) FIREBASE_SERVICE_ACCOUNT_JSON set  -> firebase-admin verifies it (strongest)
       b) otherwise FIREBASE_API_KEY (the public web API key) -> Google's accounts:lookup endpoint verifies it
   - Each user is limited to a handful of calls per minute.
   GET returns {configured:boolean} so the app can show whether the deep check is available. */

const WINDOW_MS = 60 * 1000;
const MAX_CALLS = 8;
const hits = new Map(); // uid -> timestamps (per warm instance; good enough for a hackathon, use Redis for scale)

function send(res, status, body) { res.status(status).json(body); }

async function verifyToken(token) {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (sa) {
    const { initializeApp, cert, getApps } = require('firebase-admin/app');
    const { getAuth } = require('firebase-admin/auth');
    if (!getApps().length) {
      const parsed = JSON.parse(sa);
      initializeApp({ credential: cert(parsed), projectId: parsed.project_id });
    }
    const decoded = await getAuth().verifyIdToken(token);
    return decoded.uid;
  }
  const webKey = process.env.FIREBASE_API_KEY;
  if (!webKey) throw new Error('Set FIREBASE_API_KEY (or FIREBASE_SERVICE_ACCOUNT_JSON) in the Vercel environment');
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(webKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token })
  });
  if (!r.ok) throw new Error('Token rejected');
  const j = await r.json();
  const user = j.users && j.users[0];
  if (!user || !user.localId) throw new Error('No user for token');
  return user.localId;
}

module.exports = async function handler(req, res) {
  const origin = process.env.APP_ORIGIN;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return send(res, 204, {});
  const key = process.env.GEMINI_API_KEY;
  if (req.method === 'GET') return send(res, 200, { configured: !!key, model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' });
  if (req.method !== 'POST') return send(res, 405, { error: 'GET or POST only' });
  if (!key) return send(res, 503, { error: 'GEMINI_API_KEY is not set on the server' });

  let uid;
  try {
    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token) return send(res, 401, { error: 'Sign in required' });
    uid = await verifyToken(token);
  } catch (error) {
    console.error('auth failed:', error.message);
    return send(res, 401, { error: 'Sign in required' });
  }

  const now = Date.now();
  const recent = (hits.get(uid) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_CALLS) return send(res, 429, { error: 'Too many requests. Wait a minute.' });
  recent.push(now);
  hits.set(uid, recent);

  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
  const prompt = String(body.prompt || '').slice(0, 30000);
  if (!prompt) return send(res, 400, { error: 'Prompt is required' });

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const generationConfig = { temperature: 0.1, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } };
  if (body.json) generationConfig.responseMimeType = 'application/json';

  try {
    const upstream = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig })
      }
    );
    if (!upstream.ok) {
      console.error('Gemini upstream', upstream.status, (await upstream.text()).slice(0, 400));
      return send(res, upstream.status === 429 ? 429 : 502, { error: 'Gemini upstream error', status: upstream.status });
    }
    const data = await upstream.json();
    const text = ((data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [])
      .map((p) => p.text || '').join('\n');
    if (!text) return send(res, 502, { error: 'Gemini returned an empty response' });
    return send(res, 200, { text });
  } catch (error) {
    console.error('Gemini request failed', error.message);
    return send(res, 502, { error: 'Gemini request failed' });
  }
};

function safeJson(s) { try { return JSON.parse(s); } catch (e) { return {}; } }
