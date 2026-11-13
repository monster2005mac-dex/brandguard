/* Keep the static inline-script hashes and hosting security headers in sync. */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const hashes = new Set();
let blocks = 0;

for (const name of fs.readdirSync(root).filter(name => name.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(root, name), 'utf8');
  const scripts = /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script\s*>/gi;
  for (const match of html.matchAll(scripts)) {
    blocks++;
    const digest = crypto.createHash('sha256').update(match[1]).digest('base64');
    hashes.add("'sha256-" + digest + "'");
  }
}

const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const firebase = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
const vercelPolicy = vercel.headers[0].headers.find(header => header.key === 'Content-Security-Policy').value;
const firebasePolicy = firebase.hosting.headers[0].headers.find(header => header.key === 'Content-Security-Policy').value;
for (const hash of hashes) {
  assert(vercelPolicy.includes(hash), 'Vercel CSP is missing inline script hash ' + hash);
  assert(firebasePolicy.includes(hash), 'Firebase CSP is missing inline script hash ' + hash);
}
for (const policy of [vercelPolicy, firebasePolicy]) {
  const scriptPolicy = policy.split(';').map(part => part.trim()).find(part => part.startsWith('script-src '));
  assert(scriptPolicy, 'script-src must be explicitly configured');
  assert(!scriptPolicy.includes("'unsafe-inline'"), 'inline JavaScript must be hash-authorized, not globally enabled');
  assert(policy.includes("object-src 'none'") && policy.includes("frame-ancestors 'none'"));
}
assert(blocks > 0, 'expected to find inline scripts');
console.log(blocks + ' inline script blocks protected by CSP hashes');
