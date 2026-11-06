/* Optional: lets the Gemini deep check use a server-side key.
   The Google AI API key stays on the server as a secret and is never sent to the browser.
   Only signed-in Firebase users can call it, and each user is limited to a few calls per minute.

   Deploy:
     firebase functions:secrets:set GEMINI_API_KEY
     firebase deploy --only functions
   Then paste the function URL into aiEndpoint in assets/js/firebase-config.js.

   STATUS: written to the documented APIs but not run against live services during the hackathon build. */
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const hits = new Map(); // uid -> timestamps, in-memory (per instance) rate limit

exports.gemini = onRequest({ secrets: [GEMINI_API_KEY], cors: true, region: 'asia-south1', maxInstances: 5 }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const token = (req.get('Authorization') || '').replace('Bearer ', '');
    const user = await admin.auth().verifyIdToken(token);
    const now = Date.now();
    const recent = (hits.get(user.uid) || []).filter((t) => now - t < 60000);
    if (recent.length >= 6) return res.status(429).json({ error: 'Too many requests' });
    recent.push(now); hits.set(user.uid, recent);

    const prompt = String((req.body && req.body.prompt) || '').slice(0, 20000);
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(MODEL) + ':generateContent?key=' + encodeURIComponent(GEMINI_API_KEY.value());
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 3000 }
      })
    });
    if (!r.ok) return res.status(502).json({ error: 'Upstream error', status: r.status });
    const data = await r.json();
    const text = ((data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || []).map((b) => b.text || '').join('\n');
    return res.json({ text });
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
});
