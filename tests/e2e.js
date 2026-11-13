/* End-to-end checks with Playwright. Run: (cd site && python3 -m http.server 4173 &) && node tests/e2e.js
   Part A: local demo mode.  Part B: "live" mode against an in-memory fake of the Firebase SDK + mocked /api/gemini. */
const { chromium } = require('playwright');
const sharp = require('sharp');
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
  const visualPng=await sharp({create:{width:160,height:90,channels:3,background:'#0D4033'}}).png().toBuffer();
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
    await page.fill('#draft', 'We guarantee 100% results for students.');
    await page.waitForTimeout(600);
    const n = await page.locator('#findings .finding, #findings [id^=card-]').count();
    assert(n >= 2, 'entered draft should produce findings, got ' + n); ok('local: review page shows ' + n + ' findings on entered draft');
    await page.locator('#imageFile').setInputFiles({name:'creative.png',mimeType:'image/png',buffer:visualPng});
    await page.waitForSelector('#imageAlt');
    assert((await page.locator('text=V-03').count())>0); ok('local: image upload prompts for citable alt-text finding');
    await page.locator('[data-act="visualColor"]').first().click();
    await page.check('#imageHasText');
    assert((await page.locator('text=V-02').count())>0); ok('local: image with text runs a WCAG contrast check');
    await page.locator('#imageForeground').fill('#FFFFFF');
    await page.fill('#imageAlt','Green brand background');
    await page.waitForTimeout(300);
    assert.strictEqual(await page.locator('text=V-02').count(),0);
    assert.strictEqual(await page.locator('text=V-03').count(),0); ok('local: compliant contrast pair and alt text clear visual findings');
    // demo mode: each role is its own person, so a Reviewer can approve what a Creator submitted
    await page.goto(BASE + 'review.html'); await page.waitForSelector('#draft');
    await page.fill('#title', 'Demo approval fixture'); await page.fill('#draft', 'Welcome to our helpful online service.');
    await page.waitForTimeout(500);
    await page.click('[data-act="submit"]'); await page.waitForURL('**/workflow.html');
    await page.selectOption('#roleSel', 'Reviewer'); await page.waitForTimeout(300); await page.reload();
    await page.waitForSelector('.dcard');
    assert.strictEqual(await page.locator('#scrim.on').count(), 0, 'another role\'s selected document must not open a drawer');
    await page.locator('.dcard').filter({ hasText: 'Demo approval fixture' }).click();
    assert.strictEqual(await page.locator('[data-act="approve"]').isDisabled(), true, 'an attached image must be inspected first');
    await page.check('#visualConfirm');
    assert.strictEqual(await page.locator('[data-act="approve"]').isDisabled(), false);
    await page.click('[data-act="approve"]');
    await page.waitForSelector('text=Approved. This version is locked.'); ok('local: a Reviewer can approve what a Creator submitted');
    assert.strictEqual(await page.locator('#commentBox').count(), 0); ok('local: comments are closed on an approved version');
    for (const p of ['workflow', 'rules', 'insights', 'about', 'index']) { await page.goto(BASE + p + '.html'); await page.waitForTimeout(300); }
    ok('local: all pages load');
    assert.strictEqual(await page.locator('a[href="login.html?demo=1"]').count(),1);
    ok('local: landing page advertises the no-account demo');
    // admin rules page
    await page.goto(BASE + 'login.html'); await page.evaluate(() => { localStorage.removeItem('bg.user.v3'); });
    await page.goto(BASE + 'login.html'); await page.click('[data-role="Admin"]'); await page.waitForURL('**/rules.html');
    await page.waitForSelector('text=AI engine (Gemini)'); ok('local: admin sees AI engine panel');
    await page.fill('#visualPalette','#0D4033, #F5F1E8'); await page.click('[data-act="saveVisual"]');
    await page.waitForSelector('text=#0D4033'); ok('local: Admin can configure and save the visual brand palette');
    assert.strictEqual(await page.locator('text=Google Gemini API keys').count(), 0); ok('local: old shared-key panel is gone');
    assert.deepStrictEqual(errors, [], 'page errors: ' + errors.join('\n')); ok('local: no JS errors');
    await ctx.close();
  }

  /* ---------- B. live mode with fake Firebase ---------- */
  {
    const { ctx, errors } = await newCtx(browser, 'live');
    let geminiPosts = [];
    let invitation = null;
    const page = await ctx.newPage();
    await ctx.route('**/api/gemini', async r => {
      const req = r.request();
      if (req.method() === 'GET') return r.fulfill({ json: { configured: true, sharedRateLimit: true } });
      const body = JSON.parse(req.postData());
      geminiPosts.push({ auth: req.headers()['authorization'], body });
      if (/rule pack/.test(body.prompt)) return r.fulfill({ json: { text: JSON.stringify({ company: 'Acme Bank', guidelines: [{ title: 'No jargon', text: 'Avoid financial jargon in customer copy.' }], terms: [{ avoid: 'client', good: 'customer' }], facts: [{ subject: 'Branches', value: '120', noun: 'branches', owner: 'Ops' }], claims: [{ label: 'Award claim', words: ['award-winning', 'best bank'] }] }) } });
      if (/blind accuracy benchmark/.test(body.prompt)) return r.fulfill({ json: { text: JSON.stringify([{ caseId: 0, finding: { ruleId: 'G-01', quote: 'gonna', issue: 'The phrase is too casual for the tone rule.', confidence: 0.9 } }]) } });
      if (/independent brand-rule verifier/.test(body.prompt)) return r.fulfill({ json: { text: JSON.stringify([{ index: 0, supported: true, confidence: 0.9 }]) } });
      return r.fulfill({ json: { text: '[]' } });
    });
    await ctx.route('**/api/invitations', async r => {
      const body = JSON.parse(r.request().postData());
      if (body.action === 'create') {
        invitation = { token: 'A'.repeat(43), email: body.email.toLowerCase(), role: body.role };
        return r.fulfill({ status: 201, json: { url: '/login.html#invite=' + invitation.token, expiresAt: Date.now() + 7 * 86400000 } });
      }
      assert(invitation && body.token === invitation.token, 'acceptance must carry the issued invitation token');
      const account = await page.evaluate(() => JSON.parse(localStorage.getItem('fake.auth') || 'null'));
      assert(account && account.email.toLowerCase() === invitation.email, 'invitation must match the signed-in email');
      const profile = {
        name: body.name || account.displayName || account.email.split('@')[0],
        email: account.email,
        role: invitation.role,
        workspaceId: 'ws-u1',
        createdAt: new Date().toISOString(),
        photo: ''
      };
      await page.evaluate(({ uid, profile }) => {
        const db = JSON.parse(localStorage.getItem('fake.db') || '{}');
        db['users/' + uid] = profile;
        localStorage.setItem('fake.db', JSON.stringify(db));
      }, { uid: account.uid, profile });
      invitation = null;
      return r.fulfill({ json: { profile } });
    });
    await page.goto(BASE + 'login.html');
    await page.waitForSelector('[data-m="in"]');
    await page.evaluate(() => {
      const workspaceId = 'ws-u1';
      const rules = {
        company: 'Acme Bank', initialAdmin: 'u1',
        guidelines: [{ id: 'G-01', title: 'Professional tone', check: 'tone', text: 'Use a warm, professional voice without slang.' }],
        terms: [], facts: [], claims: [],
        visual: { palette: [], contrast: 4.5, paletteTolerance: 25 }
      };
      localStorage.setItem('fake.db', JSON.stringify({
        'workspaces/ws-u1': { name: 'Acme Bank', initialAdmin: 'u1', schemaVersion: 1 },
        'brandRules/ws-u1': rules,
        'users/u1': { name: 'Asha Admin', email: 'asha@acme.test', role: 'Admin', workspaceId, createdAt: new Date().toISOString() }
      }));
      localStorage.setItem('fake.accts', JSON.stringify({
        'asha@acme.test': { uid: 'u1', email: 'asha@acme.test', displayName: 'Asha Admin', emailVerified: true, pw: 'secret12' }
      }));
    });
    assert.strictEqual(await page.locator('[data-m="up"]').count(), 0); ok('live: open self-registration is hidden');
    await page.fill('#em', 'asha@acme.test'); await page.fill('#pw', 'secret12');
    await page.click('#go');
    await page.waitForURL('**/rules.html', { timeout: 8000 }); ok('live: provisioned workspace Admin lands on Rules');
    const bootstrap=await page.evaluate(()=>{
      const db=JSON.parse(localStorage.getItem('fake.db')||'{}');
      return {role:db['users/u1'].role,initialAdmin:db['brandRules/ws-u1'].initialAdmin,workspaceId:db['users/u1'].workspaceId};
    });
    assert.strictEqual(bootstrap.role,'Admin');
    assert.strictEqual(bootstrap.initialAdmin,'u1');
    assert.strictEqual(bootstrap.workspaceId,'ws-u1');
    ok('live: initial Admin is explicitly provisioned into a workspace');
    await page.waitForSelector('text=1 finding passed the relevance check'); ok('live: Admin sees Gemini benchmark metrics after its rule-support verification');
    await page.waitForSelector('text=Set up your brand pack');
    assert.strictEqual(await page.locator('[aria-label="First-run setup steps"]').count(), 1);
    ok('live: first Admin receives a three-step setup guide');
    assert((await page.textContent('body')).includes('Northwind') === false); ok('live: no fictional Northwind data in a real workspace');
    assert.strictEqual(await page.locator('text=Server AI connected').count(), 1); ok('live: server AI detected');
    // import guidelines via mocked AI
    fs.writeFileSync('/tmp/guide.txt', 'Acme Bank brand guide. '.repeat(10000));
    const [guideChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('[data-act="importDoc"]')
    ]);
    await guideChooser.setFiles('/tmp/guide.txt');
    await page.waitForSelector('text=Review what Gemini found');
    const importModal=await page.textContent('#modal');
    assert(importModal.includes('characters in 8 sections'));
    assert(importModal.includes('remaining text was not checked'));
    ok('live: long guideline import analyzes multiple sections and discloses its upper bound');
    assert(geminiPosts[0].auth === 'Bearer tok-u1'); ok('live: AI call carries the signed-in ID token');
    await page.click('[data-act="confirmImport"]');
    await page.waitForTimeout(300);
    await page.click('[data-t="terms"]'); assert((await page.textContent('#page')).includes('customer'));
    await page.click('[data-t="facts"]'); assert((await page.textContent('#page')).includes('120 branches')); ok('live: imported rules appear in the brand pack');
    await page.fill('#companyName', 'Acme Bank'); await page.click('[data-act="saveCompany"]');
    // Admin issues a scoped invitation; an uninvited account cannot join.
    await page.goto(BASE + 'rules.html');
    await page.waitForSelector('#inviteEmail');
    await page.fill('#inviteEmail','ben@acme.test'); await page.selectOption('#inviteRole','Creator');
    await page.click('[data-act="sendInvite"]'); await page.waitForSelector('#inviteLink');
    const inviteUrl=await page.inputValue('#inviteLink');
    ok('live: Admin creates an expiring workspace invitation link');
    await page.evaluate(() => { localStorage.removeItem('fake.auth'); localStorage.removeItem('bg.hint'); });
    await page.goto(new URL(inviteUrl, BASE).toString()); await page.waitForSelector('[data-m="up"]');
    await page.click('[data-m="up"]'); await page.fill('#nm', 'Ben Creator'); await page.fill('#em', 'ben@acme.test'); await page.fill('#pw', 'secret12'); await page.click('#go');
    await page.waitForSelector('text=Check your email and verify the address');
    await page.fill('#em', 'ben@acme.test'); await page.fill('#pw', 'secret12'); await page.click('#go');
    await page.waitForURL('**/workflow.html', { timeout: 8000 }); ok('live: verified invitee joins only the invited workspace as a Creator');
    const db = await page.evaluate(() => JSON.parse(localStorage.getItem('fake.db')));
    assert.strictEqual(db['users/u1'].role, 'Admin'); assert.strictEqual(db['users/u2'].role, 'Creator');
    assert.strictEqual(db['users/u2'].workspaceId, 'ws-u1'); ok('live: roles and tenant IDs stored correctly');
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
    await page.waitForSelector('#inviteEmail');
    await page.fill('#inviteEmail','cara@acme.test'); await page.selectOption('#inviteRole','Creator');
    await page.click('[data-act="sendInvite"]'); await page.waitForSelector('#inviteLink');
    const caraInvite=await page.inputValue('#inviteLink');
    await page.evaluate(() => { localStorage.removeItem('fake.auth'); localStorage.removeItem('bg.hint'); });
    await page.goto(new URL(caraInvite, BASE).toString()); await page.click('[data-m="up"]');
    await page.fill('#nm','Cara Creator'); await page.fill('#em','cara@acme.test'); await page.fill('#pw','secret12'); await page.click('#go');
    await page.waitForSelector('text=Check your email and verify the address');
    await page.fill('#em','cara@acme.test'); await page.fill('#pw','secret12'); await page.click('#go');
    await page.waitForURL('**/workflow.html');
    await page.goto(BASE + 'review.html'); await page.waitForSelector('#draft');
    await page.fill('#title','Round 3 approval fixture');
    await page.fill('#draft','Welcome to our helpful online service.');
    await page.click('[data-act="submit"]'); await page.waitForURL('**/workflow.html');
    ok('live: a separate Creator can submit a clean version for approval');
    let approvalRequest=null;
    await ctx.route('**/api/approve', async r => {
      approvalRequest=JSON.parse(r.request().postData());
      await r.fulfill({json:{status:'Approved',version:approvalRequest.version,versionHash:'a'.repeat(64)}});
    });
    await page.evaluate(() => { localStorage.removeItem('fake.auth'); localStorage.removeItem('bg.hint'); });
    await page.goto(BASE + 'login.html'); await page.waitForSelector('[data-m="in"]');
    await page.fill('#em','ben@acme.test'); await page.fill('#pw','secret12'); await page.click('#go');
    await page.waitForURL('**/workflow.html');
    await page.locator('.dcard').filter({hasText:'Round 3 approval fixture'}).click();
    await page.click('[data-act="approve"]');
    await page.waitForSelector('text=Server verified and approved version 1.');
    assert(approvalRequest&&approvalRequest.docId&&approvalRequest.version===1); ok('live: reviewer approval calls the server endpoint with the exact submitted version');
    assert.deepStrictEqual(errors, [], 'page errors: ' + errors.join('\n')); ok('live: no JS errors');
    await ctx.close();
  }

  /* ---------- C. configured Firebase failure must not become a local demo ---------- */
  {
    const ctx=await browser.newContext({viewport:{width:1280,height:900}});
    await ctx.route('**/assets/js/firebase-config.js',route=>route.fulfill({
      contentType:'text/javascript',
      body:'window.BG_CONFIG={firebase:{apiKey:"configured",projectId:"configured-project"}};'
    }));
    await ctx.route('**/www.gstatic.com/firebasejs/**',route=>route.abort());
    const page=await ctx.newPage();
    await page.goto(BASE+'login.html');
    await page.waitForSelector('text=Workspace unavailable');
    assert.strictEqual(await page.locator('[data-role]').count(),0);
    assert.strictEqual(await page.locator('a[href="login.html?demo=1"]').count(),1);
    ok('configured Firebase failures do not auto-switch, but offer an explicit local demo');
    await page.goto(BASE+'login.html?demo=1');
    await page.waitForSelector('[data-role="Creator"]');
    await page.click('[data-role="Creator"]');
    await page.waitForURL('**/workflow.html');
    await page.waitForSelector('#page');
    const demoState=await page.evaluate(() => ({mode:BG.store.mode,fakeAuth:localStorage.getItem('fake.auth')}));
    assert.strictEqual(demoState.mode, 'local');
    assert.strictEqual(demoState.fakeAuth, null);
    ok('public demo entry works without Firebase credentials and stays isolated in local storage');
    await ctx.close();
  }

  await browser.close();
  console.log(passed + ' passed');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
