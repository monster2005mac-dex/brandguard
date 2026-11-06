# BrandGuard

Pre-publication brand governance. Paste a draft, get findings that each cite the exact brand rule behind them, fix or dispute each one, and route the content through reviewer approval. CodeNexus India 2026, Round 2.

**Pages:** `index.html` (landing), `login.html`, `review.html`, `workflow.html`, `rules.html`, `insights.html`, `about.html`.
No build step. Plain HTML, CSS and JavaScript, so it also runs from a double-click.

## Run it in 10 seconds (local demo mode)
Open `index.html` in Chrome, click **Open the app**, pick a role. Data stays in your browser. This mode needs no setup and is fully tested.

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

## Deploy on Vercel

1. Push the project to GitHub.
2. Import the repository in Vercel and use the project root as the Vercel root directory.
3. Add these Vercel environment variables:
   - `GEMINI_API_KEY`: Google Gemini API key.
   - `GEMINI_MODEL`: optional; defaults to `gemini-2.5-flash`.
   - `FIREBASE_SERVICE_ACCOUNT_JSON`: the complete JSON for a Firebase service account.
4. Deploy. The static site is served from the project root and `/api/gemini` is served by the serverless function.

`FIREBASE_SERVICE_ACCOUNT_JSON` and `GEMINI_API_KEY` must be kept as Vercel secrets. Never put either value in `firebase-config.js`.

## Optional: server-side Gemini "Deep check"
Rule checks always work. For a hackathon, Admins can add Gemini keys on the Brand Rules page; all workspace users then share the active key. Browser keys are visible to web users and are not suitable for production. A server-side key can instead live in the Firebase Cloud Function (Blaze plan):
```
cd functions && npm install && cd ..
firebase functions:secrets:set GEMINI_API_KEY
firebase deploy --only functions
```
Paste the function URL into `aiEndpoint` in `assets/js/firebase-config.js`. Never put an API key in the front-end files.

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
assets/js/shell.js           sidebar, roles, toasts, drawer
assets/js/{review,workflow,rules,insights,about}.js
assets/js/firebase-config.js paste your Firebase keys here
firestore.rules firebase.json functions/
_previous_version/           earlier single-file build, kept for reference
```

## AI use disclosure
Powered by Google Gemini. The optional deep check sends the draft and the rule list to Gemini only when a person clicks it. The brand pack, facts and sample history are fictional.
