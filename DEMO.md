# BrandGuard: hackathon runbook

## 1. Go-live checklist (do this the day before, 15 min)
1. Firebase console: Authentication → enable Email/Password + Google. Firestore → create database.
2. `firebase deploy --only firestore:rules`
3. Vercel: import repo, set `GEMINI_API_KEY` and `FIREBASE_API_KEY`, deploy.
4. Firebase → Authentication → Settings → Authorized domains: add your `*.vercel.app` domain.
5. Open the site, **sign up first** with your own email (you become Admin).
6. Brand rules → **Test connection** (should say Gemini replied). If not: check the env vars, redeploy.
7. Create two more accounts in other browsers/incognito (Creator, and one you promote to Reviewer).
8. Do the full demo below once. Keep the sample guidelines file handy (any 1-2 page brand guide as PDF/DOCX).

## 2. 3-minute demo script
1. **Problem (20s).** "Brand mistakes ship because guidelines live in a PDF nobody checks. Fixing it after publish costs trust."
2. **Admin (40s).** Brand rules → *Import from guidelines document*. Upload the PDF. Show Gemini's draft rules → confirm. "Every rule gets an ID, an owner and an expiry date."
3. **Creator (60s).** Review → paste a draft. Point at findings: each cites a rule ID and exact quote, with confidence. Accept one, edit one, **dispute** one with a reason. Click *Deep check with Gemini*; show "N passed source verification, M dropped". "AI proposes, a person decides. Findings that cite no real rule or quote not in the draft are thrown away."
4. **Reviewer (30s).** Workflow → open the submitted doc: version diff, audit trail, approve. Show that a creator cannot approve their own content.
5. **Insights (20s).** Disputes pile up on one rule → "Guideline gap" → *Suggest clearer wording*. "The system improves the guidelines, not just the content."
6. **Close (10s).** Real auth, role-enforced database rules, server-side AI key, audit trail.

## 3. Questions judges will ask
- *Why not just ask ChatGPT?* No source rule, no expiry/ownership of facts, no approval trail, no way to learn which rules are unclear.
- *Hallucinations?* Exact rules are deterministic. AI findings must cite a real rule ID and quote text that exists, or they are dropped and counted.
- *Security?* Roles and approvals enforced in Firestore rules; Gemini key server-side; ID-token-gated, rate-limited endpoint; append-only event log.
- *Data privacy?* Draft + rule list go to Gemini only when a person clicks a button.
- *What's next?* Image/layout checks, Slack/CMS plug-ins, multilingual rules, evidence file uploads.
