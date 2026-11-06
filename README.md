# BrandGuard

Pre-publication brand governance. Paste a draft, get findings that each cite the exact brand rule behind them, fix or dispute each one, and route the content through reviewer approval. CodeNexus India 2026, Round 2.

**Pages:** `index.html` (landing), `login.html`, `review.html`, `workflow.html`, `rules.html`, `insights.html`, `about.html`.
No build step. Plain HTML, CSS and JavaScript, so it also runs from a double-click.

## Run it in 10 seconds (local demo mode)
Open `index.html` in Chrome, click **Login**, pick a role. Data stays in your browser. This mode needs no setup and is fully tested.

## Turn on Firebase (real accounts, shared data, real-time)
1. Go to https://console.firebase.google.com and create a project.
2. **Build > Authentication > Get started.** Enable **Email/Password** and **Google**.
3. **Build > Firestore Database > Create database** (production mode, region `asia-south1` is a good fit for India).
4. **Project settings > Your apps > Web (`</>`).** Register an app and copy the config object.
5. Paste the values into `assets/js/firebase-config.js` (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`).
6. Publish the security rules: `npm i -g firebase-tools`, `firebase login`, `firebase init` (choose existing project; Hosting + Firestore; do not overwrite `firebase.json` or `firestore.rules`), then `firebase deploy --only firestore:rules`.
7. Deploy the site: `firebase deploy --only hosting`. Your live link is printed. In Authentication > Settings > Authorized domains, make sure that domain is listed.

The first person to sign in seeds the demo brand pack into Firestore. Sign up with different emails and roles to see shared, real-time workflow between users.

### What Firebase is used for
| Service | Used for |
|---|---|
| Authentication | Email/password and Google sign-in |
| Firestore `users` | Name and role per account |
| Firestore `brand/rules` | The brand pack (admins write) |
| Firestore `docs` | Content, versions, comments, audit trail |
| Firestore `events` | Append-only log that powers Insights |
| Security rules | Only Reviewer or Admin can approve; only Admin can edit rules; events cannot be changed |

## Deploy on Vercel (recommended: gives you the server-side Gemini key)

1. Push the project to GitHub, import it in Vercel (root directory = project root, no build command).
2. Add environment variables:
   - `GEMINI_API_KEY`: your Google AI Studio key (secret, server only).
   - `FIREBASE_API_KEY`: the same public web `apiKey` from `firebase-config.js`. The function uses it to verify the caller's ID token. (Alternative: `FIREBASE_SERVICE_ACCOUNT_JSON` for firebase-admin verification.)
   - Optional: `GEMINI_MODEL` (default `gemini-2.5-flash`), `APP_ORIGIN` (only needed if the API is called from another domain).
3. Deploy, then add the Vercel domain in Firebase **Authentication > Settings > Authorized domains**.
4. Publish the security rules: `firebase deploy --only firestore:rules`.
5. Open the site and **sign up first**: the first account becomes the workspace Admin. Everyone after is a Creator; promote Reviewers from **Brand rules > Team**.
6. On **Brand rules**, click **Test connection**, then **Import from guidelines document**.

Nothing secret is stored in Firestore or sent to the browser. The old shared "Gemini keys" feature was removed.

## Optional: Firebase Cloud Function instead of Vercel
`functions/` contains an equivalent proxy (Blaze plan): `firebase functions:secrets:set GEMINI_API_KEY && firebase deploy --only functions`, then put its URL in `aiEndpoint`.

## How reliability is handled
Exact rules (terms, facts, claims, accessibility, tone) run in the browser. Gemini findings pass a verifier: each must cite a rule ID that exists and quote text that is really in the draft, or it is dropped. The screen reports how many were dropped. AI never edits or approves; a person does.

## What was validated, and what was not
- Tested in a real browser (Playwright): every page, the full creator-to-reviewer flow, role limits, rule editing, dark mode, phone width with no horizontal scroll, opening from `file://`.
- Firebase code paths tested against an in-memory fake of the Firebase SDK (sign-up, seeding, shared saves, role change, approval, sign-out).
## Current build
- The deterministic rule engine, local demo workflow, brand-pack tools, document import, review report export, and responsive UI are implemented.
- Firebase code paths and Firestore rules are written for the documented APIs. They must be live-tested with a real project before production use.
- The deep check was not run here (it needs a valid Gemini key).

## Known limits (be honest with judges)
- The role switcher is a demo feature. In production, roles would be set by an admin or custom claims, not by the user. The rules file says so.
- Rule patterns for admin-added facts assume "number + noun" (for example "300 instructors").
- Image analysis is roadmap work. PDF/DOCX import extracts text for review; layout and image-analysis checks are separate.
- The demo role switcher deliberately models roles in-browser. Firebase live mode must assign production roles through account administration or custom claims.

## Folder
```
index.html login.html review.html workflow.html rules.html insights.html about.html
assets/css/styles.css        design system (light and dark)
assets/js/engine.js          rule engine, brand pack, diff, score (pure functions)
assets/js/store.js           local + Firebase data store and auth
assets/js/ai.js              optional Gemini layer
assets/js/nav-auth.js        landing nav: Login before sign-in, profile photo after, straight to the workspace
assets/js/shell.js           sidebar, roles, profile photo, toasts, drawer
assets/js/{review,workflow,rules,insights,about}.js
assets/js/firebase-config.js paste your Firebase keys here
firestore.rules firebase.json functions/
_previous_version/           earlier single-file build, kept for reference
```

## AI use disclosure
Powered by Google Gemini. The optional deep check sends the draft and the rule list to Gemini only when a person clicks it. The brand pack, facts and sample history are fictional.

## v4 changes
- Landing nav shows **Login** when signed out. When signed in it shows your photo (or initial) and name, and clicking it goes straight to your workspace (Admin to Brand rules, everyone else to Workshop). It paints instantly from a small local hint (`bg.hint`) and Firebase confirms in the background.
- `login.html` skips itself when you are already signed in, waits for the account to load before redirecting, and has show/hide password, forgot password, and busy states.
- App pages show a skeleton while Firebase starts instead of a blank "Loading" line.
- Profile photo: Google photo is used automatically; anyone can upload their own (stored as a 160px JPEG on their `users` document) from the profile panel.
- Landing: mobile menu, FAQ, scroll reveal, skip link, favicon, share tags, 404 page. Sign out returns to the website.
- `firestore.rules`: owners can no longer set their own content to Approved or Changes requested; only Reviewer/Admin can. **Redeploy rules:** `firebase deploy --only firestore:rules`.

## v5: "real use" changes
- **Real roles.** The first account becomes Admin. Roles are changed only by an Admin (Brand rules > Team) and enforced by `firestore.rules`. No self-promotion, no hardcoded admin email.
- **Separation of duties.** Nobody can approve a document they own (enforced in the database rules). Editing an approved document sends it back to Draft.
- **No fake data in a live workspace.** It starts with the generic checks only. "Load sample brand pack" is available to Admins for demos.
- **AI import of brand guidelines.** Upload a PDF/DOCX/TXT; Gemini drafts guidelines, terms, approved facts and risky-claim types; the Admin reviews before anything is saved.
- **Gemini key stays on the server** (`/api/gemini`, verified Firebase ID token, per-user rate limit). A personal key can still be pasted for local demos, kept only in that browser.
- **Tests:** `node tests/engine.test.js` (rule engine) and `node tests/e2e.js` (Playwright; needs `python3 -m http.server 4173` running). The e2e live-mode tests use an in-memory fake of the Firebase SDK.

## Still honest limits
- Security rules and the Vercel function were written to the documented APIs but have not been run against your live Firebase project from here. Do the 10-minute checklist in `DEMO.md` before presenting.
- Rule patterns for facts assume "number + noun". Image/layout analysis is roadmap.
- Per-user rate limit is per warm serverless instance.
