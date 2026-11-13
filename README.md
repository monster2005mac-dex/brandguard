# BrandGuard

Pre-publication brand governance. Check copy and creative against cited brand rules, resolve or dispute findings, and route exact versions through verified review and approval.

**Pages:** `index.html` (landing), `login.html`, `review.html`, `workflow.html`, `rules.html`, `insights.html`, `about.html`.
No build step. Plain HTML, CSS and JavaScript. Node.js 20+ and Python 3 are used by the local commands.

## Run locally
Requirements: Node.js 20+ and npm.

```sh
npm install
npm test
npm run check
npm start
```

Open http://localhost:4173. Demo Creator, Reviewer, and Admin are separate local accounts with isolated data in this browser. No Firebase credentials or Gemini key are needed for deterministic checks. Real accounts are invitation-only.

## Public demo access
The project URL is [brandguard-ruby.vercel.app](https://brandguard-ruby.vercel.app/). The URL responded successfully when checked, but the currently deployed HTML does not yet expose the updated no-account demo entry. The repository source provides that entry: after redeploying this version, choose **Explore demo · no account needed** from the landing page or open `/login.html?demo=1`. Select Creator, Reviewer, or Admin; no email or password is shared or required.

Each demo role has an isolated local sandbox: changes stay in that browser and do not reach Firebase, other demo roles, other visitors, or the production workspace. Demo roles cannot collaborate on the same draft; use real Firebase accounts for a shared Creator/Reviewer workflow. Demo actions are not server-verified production approvals. A **Sign in to a workspace** control returns to Firebase login. Explicit demo selection is required; a Firebase startup failure never silently switches modes. No shared production credentials are published.

## Turn on Firebase (real accounts, shared data, real-time)
For all Round 3 server features, deploy the site/API on Vercel with Firebase as the auth/database backend. Firebase Hosting alone does not provide `/api/approve` or `/api/invitations`.
1. Go to https://console.firebase.google.com and create a project.
2. **Build > Authentication > Get started.** Enable **Email/Password** and **Google**.
3. **Build > Firestore Database > Create database** (production mode, region `asia-south1` is a good fit for India).
4. **Project settings > Your apps > Web (`</>`).** Register an app and copy the config object.
5. Paste the values into `assets/js/firebase-config.js` (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`).
6. Publish the security rules: `npm i -g firebase-tools`, `firebase login`, `firebase init` (choose existing project; Hosting + Firestore; do not overwrite `firebase.json` or `firestore.rules`), then `firebase deploy --only firestore:rules`.
7. For a static-only preview, you can deploy Firebase Hosting with `firebase deploy --only hosting`. That does not include `/api/approve`; use the Vercel setup below for the complete Round 3 server features.

#### Create the first workspace Admin

Self-registration is disabled. Create the first Firebase Authentication user in the Firebase console, verify the email address, then bootstrap the workspace once from a trusted local shell. Set `FIREBASE_SERVICE_ACCOUNT_JSON`, `BOOTSTRAP_ADMIN_UID` (the Auth user's UID), and `BOOTSTRAP_WORKSPACE_NAME` in that shell and run:

```sh
npm run bootstrap:admin
```

The script creates `workspaces/{workspaceId}`, `brandRules/{workspaceId}`, and the Admin's `users/{uid}` profile in a transaction. Never put the service-account JSON in the repository or browser config. The Admin signs in and issues invitation links from **Brand rules > Team**; invitees must use the matching email address and verify it before joining. Admins can promote members to Reviewer.

Production sign-up is invitation-only: an Auth account alone is not a workspace membership. To join, use the Admin-issued invite link, create the Auth account with the invited email, verify that email, and return through the invite link to accept it. If sign-in succeeds but workspace loading fails, check that `users/{uid}` exists with a valid `Creator`, `Reviewer`, or `Admin` role and a `workspaceId` matching existing `workspaces/{workspaceId}` and `brandRules/{workspaceId}` documents. Workspace IDs must use the `ws-…` format. Invitation acceptance also requires the Vercel `FIREBASE_SERVICE_ACCOUNT_JSON` setting.

For an existing deployment with the legacy `brand/rules` singleton, back up Firestore first, then set `FIREBASE_SERVICE_ACCOUNT_JSON` and run `npm run migrate:workspace`. The migration refuses mixed-workspace data and retains the legacy source document.

### What Firebase is used for
| Service | Used for |
|---|---|
| Authentication | Email/password and Google sign-in |
| Firestore `users/{uid}` | Private profile, role, and workspace membership |
| Firestore `workspaces/{workspaceId}` | Workspace metadata |
| Firestore `brandRules/{workspaceId}` | Workspace brand pack (admins write) |
| Firestore `docs` | Workspace-scoped content, versions, comments, and audit trail |
| Firestore `events` | Workspace-scoped append-only Insights log |
| Firestore `invitations` | Server-only hashed invitation tokens |
| Firestore `aiRateLimits/{uid}` | Shared, atomic per-user Gemini request window |
| Security rules | Workspace membership boundaries; direct client approval and invitation writes are blocked |

## Deploy on Vercel (recommended: gives you the server-side Gemini key)

1. Push the project to GitHub, import it in Vercel (root directory = project root, no build command).
2. Add environment variables:
   - `GEMINI_API_KEY`: your Google AI Studio key (secret, server only).
   - `FIREBASE_SERVICE_ACCOUNT_JSON`: a Firebase service-account JSON value. Required by server-verified approvals, invitations, and shared AI rate limiting. Keep it in Vercel only; never commit it.
   - `GEMINI_MODEL` (optional; default `gemini-2.5-flash`).
   - `APP_ORIGIN` (optional; set only when the API is called from another domain).
3. Deploy, then add the Vercel domain in Firebase **Authentication > Settings > Authorized domains**.
4. Publish the security rules: `firebase deploy --only firestore:rules`. They deny direct client writes of `Approved` status.
5. Create and bootstrap the initial Admin as described above, then sign in. The Admin issues invitations from **Brand rules > Team**; public sign-up is disabled.
6. On **Brand rules**, click **Test connection**, then **Import from guidelines document**.

Nothing secret is stored in Firestore or sent to the browser. The old shared "Gemini keys" feature was removed.

## Optional: Firebase Cloud Function instead of Vercel
`functions/` contains an optional Gemini proxy (Blaze plan) and uses the function's default Firebase Admin credentials for the shared Firestore quota. Set `GEMINI_API_KEY` with `firebase functions:secrets:set GEMINI_API_KEY` and deploy with `firebase deploy --only functions`; put the function URL in `aiEndpoint`. Server-verified approval and invitation issuance still require the Vercel API.

## Round 3 improvements
- **Measured accuracy:** Admins see precision and recall from 60 labelled drafts; results are recalculated for the current brand pack. When Gemini is configured, the same cases are evaluated through Gemini and the rule-support verifier. The built-in corpus is a regression set, not an independent real-world accuracy certification.
- **Visual review:** Admins configure up to 10 approved palette colors and WCAG AA minimum contrast. Creators can attach a PNG/JPG; the browser samples dominant colors, checks palette distance, prompts for alt text, and checks a selected text/background color pair. The reviewer sees the exact attached image and must explicitly confirm visual inspection before approval. Image color sampling is independently repeated on the server.
- **Server-verified approval:** Vercel verifies the Firebase ID token and reviewer role, loads the current Firestore version and brand pack, reruns the deterministic engine, rechecks image identity and dominant colors, rejects stale rules/findings or open high-severity issues, then writes an approval fingerprint and audit entry. Clients cannot directly set `Approved` in Firestore rules.

Numeric fact checks understand common qualifiers and formats such as "over 40k", "about 50k", "1.2 lakh", ranges and a trailing plus.

Gemini findings must cite a real rule ID and quote text from the draft, then pass an independent check that the cited rule actually supports the finding. The displayed confidence combines Gemini's confidence with the rule-support check and their agreement. Unsupported findings are dropped and counted. AI never edits or approves; a person does.

Run the unit, verifier, and approval tests with `npm test`.
For the browser suite, start `npm start` in one terminal and run `node tests/e2e.js` in another.
For Firestore authorization tests, run `npx --yes firebase-tools@14 emulators:exec --only firestore --project demo-brandguard "npm run test:rules"`.

## Verification and current limits
- `npm test` runs deterministic engine/accuracy, Gemini chunking and rate-limit, invitation, CSP, and server-approval tests.
- `node tests/e2e.js` exercises browser flows using an in-memory Firebase mock; it does not replace a live Firebase/Vercel integration test.
- `npm run test:rules` exercises first-Admin concurrency, role boundaries, document update permissions, and append-only event rules in the Firestore emulator.
- The rules suite also verifies valid 20,000-character drafts and the 100th-version append, plus comments by owners in Draft and Changes requested states.
- `npm run check` checks JavaScript syntax. The emulator suite does not replace a staging approval journey against the actual Firebase/Vercel project.
- Gemini metrics depend on the configured model and network; no live Gemini key is included.
- Image analysis is a practical dominant-color sample, not logo recognition, OCR-based text detection, or full-image design review. No OCR pipeline or labeled image-validation set is included; unvalidated text/contrast detection could create false assurance. The creator selects the foreground/background pair for contrast evaluation, and the reviewer confirms they inspected the creative.
- Approval requires `FIREBASE_SERVICE_ACCOUNT_JSON` on the Vercel deployment. If that secret or the `/api/approve` endpoint is unavailable, the document is not approved.
- Browser demo roles and local data are for evaluation only; production identity and authorization require Firebase configuration.
- Documents are capped at 20,000 characters, 100 versions, and a conservative Firestore payload size; export the review report and continue in a new document when a document reaches its limit.
- Gemini draft review chunks the full draft into sections. Guideline import analyzes up to 192,000 characters in no more than eight sections of about 26,000 characters each; any unprocessed text or extracted-item cap is disclosed in the preview. The shared Firestore-backed limit is 20 AI requests per user per minute.

## Completed product features
- Firebase email/password and Google sign-in; a verified, pre-provisioned first Admin bootstraps the workspace, then verified, invited members join the assigned workspace.
- Admin-managed Reviewer/Admin roles, brand guidelines, terminology, approved facts, claims evidence, palette, and contrast threshold.
- JSON brand-pack import/export; PDF/DOCX/TXT guideline import with Gemini draft rules reviewed before saving.
- Draft paste/import, live deterministic checks, cited findings, suggested fixes, manual edits and disputes, readiness scoring, version history, and saved submissions.
- Creator/reviewer workflow, passage comments, reviewer text edits, change requests, audit trail, review-report export, and approved-text copy.
- Image attachment, dominant-color comparison, WCAG contrast check for a selected color pair, and alt-text prompt.
- Server-verified Firebase approval with exact version/rule/findings checks and a stored approval fingerprint.
- Insights for recurring finding categories, recent trends, expired facts, and frequently disputed rules.
- Responsive interface, profile photos, and light/dark themes.

## Architecture
The static HTML/CSS/vanilla-JavaScript client uses a pure shared rule engine for deterministic text and visual checks. Firebase Authentication identifies users; Firestore stores workspace membership, brand packs, versions, comments, and audit data. Firestore rules enforce workspace boundaries, restrict role changes, and prevent direct client approvals or invitation writes. A trusted bootstrap script provisions the initial Admin; `/api/invitations` issues hashed, expiring, email-bound invites and accepts them transactionally. The Vercel `/api/approve` endpoint verifies Firebase ID tokens with Firebase Admin, rechecks the exact stored version and workspace brand rules, re-samples attached image colors with `sharp`, and writes the approval plus SHA-256 fingerprints. `/api/gemini` is an authenticated serverless proxy with a shared Firestore rate limit; its API key stays in the server environment. The browser-only demo mode uses local storage and is not a substitute for Firebase server-side authorization.

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
- Firestore rules passed the local emulator suite on 2026-11-13, but have not been verified against the deployed Firebase project; the Vercel approval endpoint has not been tested against a live deployment. Follow [DEMO.md](./DEMO.md) and run a staging approval journey before production.
- Fact checking is pattern-based and may miss unusual wording or formats. Image review checks sampled palette colors and a creator-selected contrast pair; it does not perform OCR, logo matching, or full layout review.
- Gemini checks each section of the full draft; guideline extraction is capped at 192,000 characters and at 50 guidelines/terms/facts or 30 claims in the preview. Both flows explicitly report when content or extracted items remain unchecked.
- OCR, logo/version recognition, and automatic layout/contrast-region analysis are not implemented. Contrast currently uses a creator-selected foreground/background pair.
- Each workspace is isolated by its workspace ID in profiles, brand packs, documents, events, and Firestore rules. There is no cross-workspace administration interface.
- The shared AI quota uses Firestore and fails closed if its service-account configuration is unavailable. Nested brand-pack validation and CSP are implemented, but a full output-escaping audit remains outstanding.
- Guideline-gap thresholds count distinct creators per rule; repeat disputes from one creator do not inflate the signal. Common rewrite templates use subject context, but other deterministic substitutions can still need grammar edits. The Round 2 feedback table had placeholders; structured user-testing results are not available.

## Interface motion
One staggered entrance when a workspace page first loads, then motion that responds to actions: button press and ripple, cursor-following card light, readiness ring sweep, springy toasts, drawer and modal, jump highlights, and smooth light/dark switch. All of it is switched off for visitors who prefer reduced motion.
## Reliability behaviour (Round 3)
- Saving twice with no changes does not create a duplicate version; the user is told nothing changed.
- Submit is guarded against double-clicks and against re-submitting a draft already in review.
- Failed saves, role changes and resets show an explanation instead of failing silently; the draft stays in the browser.
- Demo reset asks for confirmation.

## Submission document
See [SUBMISSION.md](./SUBMISSION.md) for the feature list, architecture summary, improvements, testing details and roadmap. The PDF version is [SUBMISSION.pdf](./SUBMISSION.pdf).
