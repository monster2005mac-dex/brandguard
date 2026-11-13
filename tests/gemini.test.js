/* Tests for the authenticated Gemini endpoint and its shared Firestore quota. */
const assert = require('assert');
const Module = require('module');

const app = {};
const records = new Map();
const db = {
  collection(name) {
    return {
      doc(id) { return { name, id }; }
    };
  },
  async runTransaction(work) {
    const writes = [];
    const transaction = {
      async get(ref) {
        const value = records.get(ref.name + '/' + ref.id);
        return { exists: value !== undefined, data: () => value };
      },
      set(ref, value) { writes.push([ref.name + '/' + ref.id, value]); }
    };
    const result = await work(transaction);
    writes.forEach(([key, value]) => records.set(key, value));
    return result;
  }
};
const originalLoad = Module._load;
const originalFetch = global.fetch;
const originalEnv = {
  FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  FIREBASE_API_KEY: process.env.FIREBASE_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY
};
Module._load = function(request, parent, isMain) {
  if (request === 'firebase-admin/app') return { getApps: () => [app], initializeApp: () => app, cert: value => value };
  if (request === 'firebase-admin/auth') return { getAuth: () => ({ verifyIdToken: async token => ({ uid: token.slice(4) }) }) };
  if (request === 'firebase-admin/firestore') return { getFirestore: () => db };
  return originalLoad.call(this, request, parent, isMain);
};
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{"project_id":"test"}';
process.env.GEMINI_API_KEY = 'test-key';
global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '[]' }] } }] }) });

function request(handler, uid, body) {
  const res = {
    statusCode: 0,
    body: null,
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
  return handler({
    method: 'POST',
    headers: { authorization: 'Bearer tok-' + uid },
    body: body === undefined ? { prompt: 'test', json: true } : body
  }, res).then(() => res);
}

(async () => {
  try {
    let handler = require('../api/gemini.js');
    const configured = {
      statusCode: 0, body: null, setHeader() {},
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; }
    };
    await handler({ method: 'GET', headers: {} }, configured);
    assert.strictEqual(configured.body.configured, true);
    assert.strictEqual(configured.body.sharedRateLimit, true);

    const invalid = await request(handler, 'user-a', '{');
    assert.strictEqual(invalid.statusCode, 400);
    assert.strictEqual(invalid.body.code, 'invalid_json');
    const oversized = await request(handler, 'user-a', { prompt: 'x'.repeat(30001) });
    assert.strictEqual(oversized.statusCode, 413);

    for (let i = 0; i < 20; i++) {
      const response = await request(handler, 'user-a');
      assert.strictEqual(response.statusCode, 200);
      assert.deepStrictEqual(response.body, { text: '[]' });
    }

    delete require.cache[require.resolve('../api/gemini.js')];
    handler = require('../api/gemini.js');
    const twentyFirst = await request(handler, 'user-a');
    assert.strictEqual(twentyFirst.statusCode, 429);
    assert.strictEqual(twentyFirst.body.code, 'rate_limited');
    const otherUser = await request(handler, 'user-b');
    assert.strictEqual(otherUser.statusCode, 200);

    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const unconfigured = await request(handler, 'user-c');
    assert.strictEqual(unconfigured.statusCode, 503);
    assert.strictEqual(unconfigured.body.code, 'shared_limit_unavailable');
    console.log('7 passed');
  } finally {
    Module._load = originalLoad;
    global.fetch = originalFetch;
    Object.keys(originalEnv).forEach(key => {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
