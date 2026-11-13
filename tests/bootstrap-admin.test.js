/* Tests for verified, allowlisted first-login Admin provisioning. */
const assert = require('assert');
const Module = require('module');

const app = {};
const records = new Map();
const actors = {
  'admin-token': { uid: 'first-admin', email: 'admin@brand.co.in', email_verified: true, name: 'Initial Admin' },
  'unverified-token': { uid: 'unverified', email: 'admin@brand.co.in', email_verified: false },
  'other-token': { uid: 'other', email: 'other@brand.co.in', email_verified: true },
  'recreated-token': { uid: 'recreated', email: 'admin@brand.co.in', email_verified: true }
};

function key(ref) { return ref.name + '/' + ref.id; }
function reference(name, id) { return { name, id }; }
const db = {
  collection(name) {
    return {
      doc(id) { return reference(name, id); },
      limit(count) { return { name, query: true, count }; }
    };
  },
  async runTransaction(work) {
    const writes = [];
    const transaction = {
      async get(ref) {
        if (ref.query) {
          const docs = Array.from(records.entries()).filter(([path]) => path.startsWith(ref.name + '/'))
            .slice(0, ref.count).map(([path, value]) => ({
              id: path.slice(ref.name.length + 1), exists: true, data: () => value
            }));
          return { docs };
        }
        const value = records.get(key(ref));
        return { exists: value !== undefined, data: () => value };
      },
      create(ref, value) { writes.push([ref, value]); }
    };
    const result = await work(transaction);
    writes.forEach(([ref, value]) => {
      if (records.has(key(ref))) throw new Error('already exists');
      records.set(key(ref), value);
    });
    return result;
  }
};

const originalLoad = Module._load;
const originalEnv = {
  FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  INITIAL_ADMIN_EMAIL: process.env.INITIAL_ADMIN_EMAIL,
  BOOTSTRAP_WORKSPACE_NAME: process.env.BOOTSTRAP_WORKSPACE_NAME,
  APP_ORIGIN: process.env.APP_ORIGIN
};
Module._load = function(request, parent, isMain) {
  if (request === 'firebase-admin/app') return { getApps: () => [app], initializeApp: () => app, cert: value => value };
  if (request === 'firebase-admin/auth') {
    return { getAuth: () => ({ verifyIdToken: async token => actors[token] || (() => { throw new Error('bad token'); })() }) };
  }
  if (request === 'firebase-admin/firestore') return { getFirestore: () => db };
  return originalLoad.call(this, request, parent, isMain);
};
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{"project_id":"test"}';
process.env.INITIAL_ADMIN_EMAIL = ' Admin@Brand.co.in ';
process.env.BOOTSTRAP_WORKSPACE_NAME = 'BrandGuard';
process.env.APP_ORIGIN = 'https://brandguard.test';
const handler = require('../api/bootstrap-admin.js');

async function request(token) {
  const res = {
    statusCode: 0, body: null, headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
  await handler({ method: 'POST', headers: token ? { authorization: 'Bearer ' + token } : {} }, res);
  return res;
}

(async () => {
  try {
    const unauthenticated = await request();
    assert.strictEqual(unauthenticated.statusCode, 401);

    const unverified = await request('unverified-token');
    assert.strictEqual(unverified.statusCode, 403);
    assert.strictEqual(records.size, 0);

    const nonAdmin = await request('other-token');
    assert.strictEqual(nonAdmin.statusCode, 404);
    assert.strictEqual(records.size, 0);

    const configuredEmail = process.env.INITIAL_ADMIN_EMAIL;
    delete process.env.INITIAL_ADMIN_EMAIL;
    const provisioningDisabled = await request('admin-token');
    process.env.INITIAL_ADMIN_EMAIL = configuredEmail;
    assert.strictEqual(provisioningDisabled.statusCode, 404);
    assert.strictEqual(provisioningDisabled.body.code, 'not_initial_admin');
    assert.strictEqual(records.size, 0);

    const created = await request('admin-token');
    assert.strictEqual(created.statusCode, 200);
    assert.strictEqual(created.body.created, true);
    assert.strictEqual(created.body.profile.role, 'Admin');
    assert.strictEqual(created.body.profile.workspaceId, 'ws-first-admin');
    assert(records.has('workspaces/ws-first-admin'));
    assert(records.has('brandRules/ws-first-admin'));

    const repeated = await request('admin-token');
    assert.strictEqual(repeated.statusCode, 200);
    assert.strictEqual(repeated.body.created, false);

    const recreatedAccount = await request('recreated-token');
    assert.strictEqual(recreatedAccount.statusCode, 409);
    assert.strictEqual(recreatedAccount.body.code, 'workspace_conflict');
    assert.strictEqual(records.has('users/recreated'), false);

    records.delete('users/first-admin');
    const repaired = await request('admin-token');
    assert.strictEqual(repaired.statusCode, 200);
    assert.strictEqual(repaired.body.created, true);
    assert.strictEqual(records.get('users/first-admin').workspaceId, 'ws-first-admin');

    records.delete('users/first-admin');
    records.set('workspaces/ws-first-admin', { initialAdmin: 'different-admin' });
    const conflict = await request('admin-token');
    assert.strictEqual(conflict.statusCode, 409);
    assert.strictEqual(conflict.body.code, 'workspace_conflict');
    assert.strictEqual(records.has('users/first-admin'), false);

    console.log('9 passed');
  } finally {
    Module._load = originalLoad;
    Object.keys(originalEnv).forEach(name => {
      if (originalEnv[name] === undefined) delete process.env[name];
      else process.env[name] = originalEnv[name];
    });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
