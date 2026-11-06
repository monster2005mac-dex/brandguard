const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

function json(res, status, body) {
  res.status(status).json(body);
}

function initializeFirebase() {
  if (getApps().length) return;
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccount) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured');
  }
  initializeApp({
    credential: cert(JSON.parse(serviceAccount))
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return json(res, 503, { error: 'Gemini server configuration is missing' });

  try {
    initializeFirebase();
    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token) return json(res, 401, { error: 'Firebase authentication required' });
    await getAuth().verifyIdToken(token);
  } catch (error) {
    console.error('Gemini authentication configuration error', error.message);
    return json(res, 401, { error: 'Firebase authentication failed' });
  }

  const prompt = String(req.body && req.body.prompt || '').slice(0, 20000);
  if (!prompt) return json(res, 400, { error: 'Prompt is required' });

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 3000 }
      })
    });
    if (!upstream.ok) {
      const body = await upstream.text();
      console.error('Gemini upstream error', upstream.status, body.slice(0, 500));
      return json(res, 502, { error: 'Gemini upstream error', status: upstream.status });
    }
    const data = await upstream.json();
    const text = ((data.candidates && data.candidates[0] &&
      data.candidates[0].content && data.candidates[0].content.parts) || [])
      .map((part) => part.text || '')
      .join('\n');
    if (!text) return json(res, 502, { error: 'Gemini returned an empty response' });
    return json(res, 200, { text });
  } catch (error) {
    console.error('Gemini request failed', error);
    return json(res, 502, { error: 'Gemini request failed' });
  }
};
