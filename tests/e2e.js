/* End-to-end checks with Playwright. Run: (cd site && python3 -m http.server 4173 &) && node tests/e2e.js
   Part A: local demo mode.  Part B: "live" mode against an in-memory fake of the Firebase SDK + mocked /api/gemini. */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), assert = require('assert');
const BASE = process.env.BASE || 'http://localhost:4173/';
const fake = fs.readFileSync(path.join(__dirname, 'fake-firebase.js'), 'utf8');
let passed = 0;
const ok = (m) => { passed++; console.log('ok  ' + m); };

async function newCtx(browser, mode) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  if (mode === 'local') {
    await ctx.route('**/assets/js/firebase-config.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.BG_CONFIG={firebase:{apiKey:"",projectId:""},aiEndpoint:"/api/gemini"};' }));
  } else {
    await ctx.route('**/www.gstatic.com/firebasejs/**', r => r.fulfill({ contentType: 'text/javascript', body: r.request().url().includes('app-compat') ? fake : '' }));
  }
  ctx.on('page', p => p.on('pageerror', e => errors.push(p.url() + ' ' + e.message)));
  return { ctx, errors };
}

(async () => {
  const browser = await chromium.launch();

  /* ---------- A. local demo ---------- */
  {
    const { ctx, errors } = await newCtx(browser, 'local');
    const page = await ctx.newPage();
    await page.goto(BASE + 'login.html');
    await page.click('[data-role="Creator"]');
    await page.waitForURL('**/workflow.html');
    await page.goto(BASE + 'review.html');
    await page.waitForSelector('#findings');
    const n = await page.locator('#findings .finding, #findings [id^=card-]').count();
    assert(n >= 5, 'sample draft should produce findings, got ' + n); ok('local: review page shows ' + n + ' findings on sample draft');
    for (const p of ['workflow', 'rules', 'insights', 'about', 'index']) { await page.goto(BASE + p + '.html'); await page.waitForTimeout(300); }
    ok('local: all pages load');
    // admin rules page
    await page.goto(BASE + 'login.html'); await page.evaluate(() => { localStorage.removeItem('bg.user.v3'); });
    await page.goto(BASE + 'login.html'); await page.click('[data-role="Admin"]'); await page.waitForURL('**/rules.html');
    await page.waitForSelector('text=AI engine (Gemini)'); ok('local: admin sees AI engine panel');
    assert.strictEqual(await page.locator('text=Google Gemini API keys').count(), 0); ok('local: old shared-key panel is gone');
    assert.deepStrictEqual(errors, [], 'page errors: ' + errors.join('\n')); ok('local: no JS errors');
    await ctx.close();
  }

  /* ---------- B. live mode with fake Firebase ---------- */
  {
    const { ctx, errors } = await newCtx(browser, 'live');
    let geminiPosts = [];
    await ctx.route('**/api/gemini', async r => {
      const req = r.request();
      if (req.method() === 'GET') return r.fulfill({ json: { configured: true } });
      const body = JSON.parse(req.postData());
      geminiPosts.push({ auth: req.headers()['authorization'], body });
      if (/rule pack/.test(body.prompt)) return r.fulfill({ json: { text: JSON.stringify({ company: 'Acme Bank', guidelines: [{ title: 'No jargon', text: 'Avoid financial jargon in customer copy.' }], terms: [{ avoid: 'client', good: 'customer' }], facts: [{ subject: 'Branches', value: '120', noun: 'branches', owner: 'Ops' }], claims: [{ label: 'Award claim', words: ['award-winning', 'best bank'] }] }) } });
      return r.fulfill({ json: { text: '[]' } });
    });
    const page = await ctx.newPage();
    await page.goto(BASE + 'login.html');
    await page.click('[data-m="up"]');
    await page.fill('#nm', 'Asha Admin'); await page.fill('#em', 'asha@acme.test'); await page.fill('#pw', 'secret12');
    assert.strictEqual(await page.locator('#rl').count(), 0); ok('live: sign-up has no role picker');
    await page.click('#go');
    await page.waitForURL('**/rules.html', { timeout: 8000 }); ok('live: first account lands on Rules as Admin');
    await page.waitForSelector('text=Set up your brand pack');
    assert((await page.textContent('body')).includes('Northwind') === false); ok('live: no fictional Northwind data in a real workspace');
    assert.strictEqual(await page.locator('text=Server AI connected').count(), 1); ok('live: server AI detected');
    // import guidelines via mocked AI
    fs.writeFileSync('/tmp/guide.txt', 'Acme Bank brand guide. '.repeat(20));
    await page.setInputFiles('#guideFile', '/tmp/guide.txt');
    await page.waitForSelector('text=Review what Gemini found');
    assert(geminiPosts[0].auth === 'Bearer tok-u1'); ok('live: AI call carries the signed-in ID token');
    await page.click('[data-act="confirmImport"]');
    await page.waitForTimeout(300);
    await page.click('[data-t="terms"]'); assert((await page.textContent('#page')).includes('customer'));
    await page.click('[data-t="facts"]'); assert((await page.textContent('#page')).includes('120 branches')); ok('live: imported rules appear in the brand pack');
    await page.fill('#companyName', 'Acme Bank'); await page.click('[data-act="saveCompany"]');
    // sign out, second user becomes Creator
    await page.evaluate(() => { localStorage.removeItem('fake.auth'); localStorage.removeItem('bg.hint'); });
    await page.goto(BASE + 'login.html'); await page.waitForSelector('[data-m="up"]');
    await page.click('[data-m="up"]'); await page.fill('#nm', 'Ben Creator'); await page.fill('#em', 'ben@acme.test'); await page.fill('#pw', 'secret12'); await page.click('#go');
    await page.waitForURL('**/workflow.html', { timeout: 8000 }); ok('live: second account is a Creator');
    const db = await page.evaluate(() => JSON.parse(localStorage.getItem('fake.db')));
    assert.strictEqual(db['users/u1'].role, 'Admin'); assert.strictEqual(db['users/u2'].role, 'Creator'); ok('live: roles stored correctly (Admin, Creator)');
    // creator: review catches a wrong fact from the imported pack
    await page.goto(BASE + 'review.html'); await page.waitForSelector('#draft');
    await page.fill('#draft', 'Our client base spans 300 branches nationwide.');
    await page.waitForTimeout(600);
    const txt = await page.textContent('#findings');
    assert(/F-01/.test(txt) && /T-02|customer/.test(txt)); ok('live: creator draft checked against the imported company pack (fact + term)');
    // creator cannot reach rules page content as admin
    await page.goto(BASE + 'rules.html'); await page.waitForSelector('#page');
    assert.strictEqual(await page.locator('[data-act="importDoc"]').count(), 0); assert.strictEqual(await page.locator('text=Team').count() === 0, true); ok('live: creator sees no admin controls');
    // admin promotes Ben to Reviewer
    await page.evaluate(() => { localStorage.removeItem('fake.auth'); localStorage.removeItem('bg.hint'); });
    await page.goto(BASE + 'login.html'); await page.waitForSelector('[data-m="in"]');
    await page.fill('#em', 'asha@acme.test'); await page.fill('#pw', 'secret12'); await page.click('#go');
    await page.waitForURL('**/rules.html'); await page.waitForSelector('select[data-act="setRole"]');
    await page.selectOption('select[data-uid="u2"]', 'Reviewer'); await page.waitForTimeout(400);
    const db2 = await page.evaluate(() => JSON.parse(localStorage.getItem('fake.db')));
    assert.strictEqual(db2['users/u2'].role, 'Reviewer'); ok('live: Admin promotes a user to Reviewer');
    assert.deepStrictEqual(errors, [], 'page errors: ' + errors.join('\n')); ok('live: no JS errors');
    await ctx.close();
  }
  await browser.close();
  console.log(passed + ' passed');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
