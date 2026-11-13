# BrandGuard

Pre-publication brand governance. Check copy and creative against cited brand rules, resolve or dispute findings, and route exact versions through verified review and approval.

**Pages:** `index.html` (landing), `login.html`, `review.html`, `workflow.html`, `rules.html`, `insights.html`, `about.html`.
No build step. Plain HTML, CSS and JavaScript, so it also runs from a double-click.

## Run locally
Requirements: Node.js 20+ and npm.

```sh
npm install
npm test
npm run check
npm start
```

Open http://localhost:4173. Local demo data stays in this browser; use **Login** to choose a demo role. No Firebase credentials or Gemini key are needed for deterministic checks.

## Turn on Firebase (real accounts, shared data, real-time)
For all Round 3 server features, deploy the site/API on Vercel with Firebase as the auth/database backend. A Firebase Hosting-only deployment does not provide `/api/approve`.
1. Go to https://console.firebase.google.com and create a project.
2. **Build > Authentication > Get started.** Enable **Email/Password** and **Google**.
3. **Build > Firestore Database > Create database** (production mode, region `asia-south1` is a good fit for India).
4. **Project settings > Your apps > Web (`</>`).** Register an app and copy the config object.
5. Paste the values into `assets/js/firebase-config.js` (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`).
6. Publish the security rules: `npm i -g firebase-tools`, `firebase login`, `firebase init` (choose existing project; Hosting + Firestore; do not overwrite `firebase.json` or `firestore.rules`), then `firebase deploy --only firestore:rules`.
7. For a static-only preview, you can deploy Firebase Hosting with `firebase deploy --only hosting`. That does not include `/api/approve`; use the Vercel setup below for the complete Round 3 server features.

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
   - `FIREBASE_SERVICE_ACCOUNT_JSON`: a Firebase service-account JSON value. The approval endpoint uses Firebase Admin to verify reviewer roles, read the current document and rules, and commit the approval transaction. Keep this secret in Vercel only; never commit it.
   - `FIREBASE_API_KEY`: the same public web `apiKey` from `firebase-config.js`; used by the Gemini endpoint to verify ID tokens when no service account is configured there.
   - Optional: `GEMINI_MODEL` (default `gemini-2.5-flash`), `APP_ORIGIN` (only needed if the API is called from another domain).
3. Deploy, then add the Vercel domain in Firebase **Authentication > Settings > Authorized domains**.
4. Publish the security rules: `firebase deploy --only firestore:rules`. They deny direct client writes of `Approved` status.
5. Open the site and **sign up first**: the first account becomes the workspace Admin. Everyone after is a Creator; promote Reviewers from **Brand rules > Team**.
6. On **Brand rules**, click **Test connection**, then **Import from guidelines document**.

Nothing secret is stored in Firestore or sent to the browser. The old shared "Gemini keys" feature was removed.

## Optional: Firebase Cloud Function instead of Vercel
`functions/` contains an optional Gemini proxy (Blaze plan): `firebase functions:secrets:set GEMINI_API_KEY && firebase deploy --only functions`, then put its URL in `aiEndpoint`. Server-verified approval still requires the Vercel `/api/approve` endpoint.

## Round 3 improvements
- **Measured accuracy:** Admins see precision and recall from 60 labelled drafts; results are recalculated for the current brand pack. When Gemini is configured, the same cases are evaluated through Gemini and the rule-support verifier. The built-in corpus is a regression set, not an independent real-world accuracy certification.
- **Visual review:** Admins configure up to 10 approved palette colors and WCAG AA minimum contrast. Creators can attach a PNG/JPG; the browser samples dominant colors, checks palette distance, prompts for alt text, and checks a selected text/background color pair. The reviewer sees the exact attached image and must explicitly confirm visual inspection before approval. Image color sampling is independently repeated on the server.
- **Server-verified approval:** Vercel verifies the Firebase ID token and reviewer role, loads the current Firestore version and brand pack, reruns the deterministic engine, rechecks image identity and dominant colors, rejects stale rules/findings or open high-severity issues, then writes an approval fingerprint and audit entry. Clients cannot directly set `Approved` in Firestore rules.

Numeric fact checks understand common qualifiers and formats such as "over 40k", "about 50k", "1.2 lakh", ranges and a trailing plus.

Gemini findings must cite a real rule ID and quote text from the draft, then pass an independent check that the cited rule actually supports the finding. The displayed confidence combines Gemini's confidence with the rule-support check and their agreement. Unsupported findings are dropped and counted. AI never edits or approves; a person does.

Run the unit and verifier tests with `npm test`.
For the browser suite, start `npm start` in one terminal and run `node tests/e2e.js` in another.

## Verification and current limits
- `npm test` runs deterministic engine/accuracy, Gemini-verifier, and server-approval tests.
- `node tests/e2e.js` exercises browser flows using an in-memory Firebase mock; it does not replace a live Firebase/Vercel integration test.
- `npm run check` checks JavaScript syntax. Firestore rules should be deployed and tested against the project's Firebase emulator before a production launch.
- Gemini metrics depend on the configured model and network; no live Gemini key is included.
- Image analysis is a practical dominant-color sample, not logo recognition, OCR-based text detection, or full-image design review. The creator selects the foreground/background pair for contrast evaluation, and the reviewer confirms they inspected the creative.
- Approval requires `FIREBASE_SERVICE_ACCOUNT_JSON` on the Vercel deployment. If that secret or the `/api/approve` endpoint is unavailable, the document is not approved.
- Browser demo roles and local data are for evaluation only; production identity and authorization require Firebase configuration.

## Completed product features
- Firebase email/password and Google sign-in; first workspace account becomes Admin, and later accounts start as Creators.
- Admin-managed Reviewer/Admin roles, brand guidelines, terminology, approved facts, claims evidence, palette, and contrast threshold.
- JSON brand-pack import/export; PDF/DOCX/TXT guideline import with Gemini draft rules reviewed before saving.
- Draft paste/import, live deterministic checks, cited findings, suggested fixes, manual edits and disputes, readiness scoring, version history, and saved submissions.
- Creator/reviewer workflow, passage comments, reviewer text edits, change requests, audit trail, review-report export, and approved-text copy.
- Image attachment, dominant-color comparison, WCAG contrast check for a selected color pair, and alt-text prompt.
- Server-verified Firebase approval with exact version/rule/findings checks and a stored approval fingerprint.
- Insights for recurring finding categories, recent trends, expired facts, and frequently disputed rules.
- Responsive interface, profile photos, and light/dark themes.

## Architecture
The static HTML/CSS/vanilla-JavaScript client uses a pure shared rule engine for deterministic text and visual checks. Firebase Authentication identifies users; Cloud Firestore stores the brand pack, versions, comments, and audit data, with Firestore rules restricting role changes and preventing direct client approvals. The Vercel `/api/approve` endpoint verifies Firebase ID tokens with Firebase Admin, rechecks the exact stored version and current brand rules, re-samples attached image colors with `sharp`, and writes the approval plus SHA-256 fingerprints. `/api/gemini` is a separate authenticated serverless proxy; its API key stays in the server environment. The browser-only demo mode uses local storage and is not a substitute for Firebase server-side authorization.

## Post-event roadmap
1. Add OCR and sampled-region selection so image text/background colors can be detected instead of selected by the creator.
2. Expand the labelled evaluation set with independently reviewed real brand examples and report confidence intervals by rule category.
3. Add Firebase Emulator CI coverage for Firestore authorization, plus deployment smoke tests against a staging Firebase/Vercel project.
4. Evaluate logo/layout checks, reusable approved assets, and multi-workspace administration after the three Round 3 commitments are stable.

## Folder
```
index.html login.html review.html workflow.html rules.html insights.html about.html
assets/css/styles.css        design system (light and dark)
assets/css/3d.css            v5 "Seal Chamber" 3D layer: tokens, hero scene, cube, photo cards, workspace polish
assets/js/motion.js         motion helpers: button ripple, card light, entrance sequence, ring and number reveals
assets/css/motion.css        motion layer (disabled under prefers-reduced-motion)
assets/js/fx.js              tilt, parallax, rotating rule cube, count-up, photo loader (progressive enhancement)
assets/img/                  optional: drop creator.jpg, reviewer.jpg, admin.jpg, cta.jpg, login.jpg to use your own photos
assets/js/engine.js          shared deterministic rule engine, accuracy benchmark and visual checks
assets/js/store.js           local + Firebase data store and auth
assets/js/ai.js              optional Gemini layer
assets/js/visual.js          image compression and dominant-color sampling
assets/js/nav-auth.js        landing nav: Login before sign-in, profile photo after, straight to the workspace
assets/js/shell.js           sidebar, roles, profile photo, toasts, drawer
assets/js/{review,workflow,rules,insights,about}.js
assets/js/firebase-config.js paste your Firebase keys here
firestore.rules firebase.json api/approve.js functions/
```

## AI use disclosure
Powered by Google Gemini. The optional deep check sends the draft and the rule list to Gemini only when a person clicks it. The brand pack, facts and sample history are fictional.

## Known limits
- Firestore rules and the Vercel endpoint have not been tested against a live Firebase project or emulator here. Follow [DEMO.md](./DEMO.md) and run an emulator/staging approval journey before production.
- Fact checking is pattern-based and may miss unusual wording or formats. Image review checks sampled palette colors and a creator-selected contrast pair; it does not perform OCR, logo matching, or full layout review.
- Per-user rate limit is per warm serverless instance.

## Interface motion
One staggered entrance when a workspace page first loads, then motion that responds to actions: button press and ripple, cursor-following card light, readiness ring sweep, springy toasts, drawer and modal, jump highlights, and smooth light/dark switch. All of it is switched off for visitors who prefer reduced motion.
## Reliability behaviour (Round 3)
- Saving twice with no changes does not create a duplicate version; the user is told nothing changed.
- Submit is guarded against double-clicks and against re-submitting a draft already in review.
- Failed saves, role changes and resets show an explanation instead of failing silently; the draft stays in the browser.
- Demo reset asks for confirmation.

## Submission document
See [SUBMISSION.md](./SUBMISSION.md) for the feature list, architecture summary, improvements, testing details and roadmap.
