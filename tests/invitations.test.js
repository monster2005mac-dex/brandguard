/* Tests for invitation authorization, expiry, email binding, replay, and workspace assignment. */
const assert = require('assert');
const crypto = require('crypto');
const Module = require('module');

const app = {};
const records = new Map([
  ['users/admin-a', { role: 'Admin', workspaceId: 'ws-a' }],
  ['users/creator-a', { role: 'Creator', workspaceId: 'ws-a' }],
  ['users/member-b', { role: 'Creator', workspaceId: 'ws-b' }],
  ['workspaces/ws-a', { name: 'Workspace A' }],
  ['brandRules/ws-a', { company: 'Workspace A' }],
  ['workspaces/ws-b', { name: 'Workspace B' }],
  ['brandRules/ws-b', { company: 'Workspace B' }]
]);
const actors = {
  'admin-token': { uid: 'admin-a', email: 'admin@a.test', email_verified: true },
  'creator-token': { uid: 'creator-a', email: 'creator@a.test', email_verified: true },
  'invitee-token': { uid: 'invitee-a', email: 'ben@acme.test', email_verified: true },
  'expired-token': { uid: 'expired-user', email: 'ben@acme.test', email_verified: true },
  'unverified-token': { uid: 'unverified', email: 'ben@acme.test', email_verified: false },
  'mismatch-token': { uid: 'mismatch', email: 'other@acme.test', email_verified: true },
  'member-token': { uid: 'member-b', email: 'member@b.test', email_verified: true }
};

function key(ref) { return ref.name + '/' + ref.id; }
function reference(name, id) {
  return {
    name,
    id,
    async get() {
      const value = records.get(key(this));
      return { exists: value !== undefined, data: () => value };
    },
    async create(value) {
      if (records.has(key(this))) throw new Error('already exists');
      records.set(key(this), value);
    }
  };
}
const db = {
  collection(name) { return { doc(id) { return reference(name, id); } }; },
  async runTransaction(work) {
    const writes = [];
    const transaction = {
      async get(ref) {
        const value = records.get(key(ref));
        return { exists: value !== undefined, data: () => value };
      },
      create(ref, value) { writes.push(['create', ref, value]); },
      update(ref, value) { writes.push(['update', ref, value]); }
    };
    const result = await work(transaction);
    writes.forEach(([type, ref, value]) => {
      if (type === 'create') {
        if (records.has(key(ref))) throw new Error('already exists');
        records.set(key(ref), value);
      } else {
        records.set(key(ref), Object.assign({}, records.get(key(ref)), value));
      }
    });
    return result;
  }
};

const originalLoad = Module._load;
const originalEnv = {
  FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
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
process.env.APP_ORIGIN = 'https://brandguard.test';
const handler = require('../api/invitations.js');

async function request(action, token, body) {
  const res = {
    statusCode: 0,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
  await handler({
    method: 'POST',
    headers: token ? { authorization: 'Bearer ' + token } : {},
    body: body === undefined ? action : body
  }, res);
  return res;
}

(async () => {
  try {
    const unauthenticated = await request({ action: 'create', email: 'ben@acme.test', role: 'Creator' });
    assert.strictEqual(unauthenticated.statusCode, 401);

    const forbidden = await request({ action: 'create', email: 'ben@acme.test', role: 'Creator' }, 'creator-token');
    assert.strictEqual(forbidden.statusCode, 403);

    const invalid = await request({ action: 'create', email: 'not-an-email', role: 'Admin' }, 'admin-token');
    assert.strictEqual(invalid.statusCode, 400);

    const created = await request({ action: 'create', email: ' Ben@Acme.test ', role: 'Creator' }, 'admin-token');
    assert.strictEqual(created.statusCode, 201);
    const inviteUrl = new URL(created.body.url);
    const inviteToken = new URLSearchParams(inviteUrl.hash.slice(1)).get('invite');
    assert.strictEqual(inviteUrl.origin, 'https://brandguard.test');
    assert.match(inviteToken, /^[A-Za-z0-9_-]{40,50}$/);
    const invitationRef = require('../api/invitations.js').invitationRef;
    const inviteRecord = records.get('invitations/' + invitationRef(db, inviteToken).id);
    assert.strictEqual(inviteRecord.email, 'ben@acme.test');
    assert.strictEqual(inviteRecord.workspaceId, 'ws-a');
    assert.strictEqual(inviteRecord.role, 'Creator');
    assert.strictEqual(inviteRecord.expiresAt - inviteRecord.createdAt, 7 * 24 * 60 * 60 * 1000);

    const mismatch = await request({ action: 'accept', token: inviteToken }, 'mismatch-token');
    assert.strictEqual(mismatch.statusCode, 403);
    assert.strictEqual(mismatch.body.code, 'invitation_email_mismatch');
    assert.strictEqual(records.has('users/mismatch'), false);

    const unverified = await request({ action: 'accept', token: inviteToken }, 'unverified-token');
    assert.strictEqual(unverified.statusCode, 403);
    assert.strictEqual(unverified.body.code, 'verified_email_required');

    const accepted = await request({
      action: 'accept', token: inviteToken, name: 'Ben', workspaceId: 'ws-b', role: 'Admin'
    }, 'invitee-token');
    assert.strictEqual(accepted.statusCode, 200);
    assert.strictEqual(accepted.body.profile.workspaceId, 'ws-a');
    assert.strictEqual(accepted.body.profile.role, 'Creator');
    assert.strictEqual(records.get('users/invitee-a').workspaceId, 'ws-a');

    const replay = await request({ action: 'accept', token: inviteToken }, 'invitee-token');
    assert.strictEqual(replay.statusCode, 409);
    assert.strictEqual(replay.body.code, 'already_member');

    const expiredToken = 'E'.repeat(43);
    const expiredRef = invitationRef(db, expiredToken);
    records.set(key(expiredRef), {
      email: 'ben@acme.test', role: 'Creator', workspaceId: 'ws-a', createdBy: 'admin-a',
      createdAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
      expiresAt: Date.now() - 1, acceptedAt: null
    });
    const expired = await request({ action: 'accept', token: expiredToken }, 'expired-token');
    assert.strictEqual(expired.statusCode, 410);
    assert.strictEqual(expired.body.code, 'invitation_expired');

    const otherWorkspaceToken = 'W'.repeat(43);
    const otherWorkspaceRef = invitationRef(db, otherWorkspaceToken);
    records.set(key(otherWorkspaceRef), {
      email: 'member@b.test', role: 'Reviewer', workspaceId: 'ws-a', createdBy: 'admin-a',
      createdAt: Date.now(), expiresAt: Date.now() + 60000, acceptedAt: null
    });
    const existingMember = await request({ action: 'accept', token: otherWorkspaceToken }, 'member-token');
    assert.strictEqual(existingMember.statusCode, 409);
    assert.strictEqual(existingMember.body.code, 'already_member');
    assert.strictEqual(records.get('users/member-b').workspaceId, 'ws-b');

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
