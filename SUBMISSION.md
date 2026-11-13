# BrandGuard: Round 3 submission

- Live project link: Not deployed or verified from this environment; configure Firebase and deploy to Vercel before submitting.
- Source repository: https://github.com/monster2005mac-dex/brandguard

## 1. Complete feature list
- Email/password and Google sign-in; first account becomes Admin, later accounts are Creators
- Admin-managed roles (Creator, Reviewer, Admin), enforced by Firestore rules
- Brand pack: guidelines, terminology, approved facts with owner and expiry, claims needing evidence, palette, contrast threshold; JSON import/export
- PDF/DOCX/TXT guideline import with Gemini-drafted rules that an Admin reviews before saving
- Draft paste/import, live deterministic checks, cited findings, suggested fixes, manual edits, disputes with reasons, readiness score
- Optional Gemini deep check; findings must cite a real rule and quote the draft, then pass an independent rule-support check, otherwise they are dropped and counted
- Image attachment: dominant-colour palette check, WCAG contrast check, alt-text prompt
- Version history, passage comments, reviewer edits, change requests, audit trail, review-report export, approved-text copy
- Separation of duties: nobody approves their own document
- Server-verified approval with a stored SHA-256 fingerprint
- Insights: recurring findings, trends, expired facts, frequently disputed rules
- Light/dark themes, responsive layout, profile photos

## 2. Technical architecture and implementation summary
See "Architecture" in README.md. Static HTML/CSS/vanilla JS client with a pure shared rule engine (`assets/js/engine.js`); Firebase Auth and Firestore for identity and data; Vercel serverless `/api/approve` (Firebase Admin, `sharp`) for approval and `/api/gemini` as an authenticated proxy so the API key never reaches the browser.

## 3. Improvements completed after Round 2

### The three committed improvements (named in Round 2)
1. **Measured accuracy you can trust.** 60 labelled drafts run against the rule engine and verifier; precision and recall shown to the Admin and re-run when the brand pack changes. Includes (a) fact checks that understand qualifiers and formats ("over 40,000", "about 50k", "1.2 lakh", ranges), (b) a second-pass check that the cited rule supports each Gemini finding, (c) a combined confidence score replacing fixed labels. Note: the labelled set is a regression corpus, not independent certification.
2. **Image and visual review.** PNG/JPG upload; dominant-colour comparison with the Admin-defined palette; WCAG AA contrast on a selected text/background pair; alt-text prompt; every finding cites a rule ID. Not included, as declared in Round 2: logo-version and layout checks.
3. **Server-verified approvals.** `/api/approve` verifies the ID token and reviewer role, reruns the rule engine on the exact stored version, rechecks the image, rejects stale rules or findings and open high-severity items, and stores a SHA-256 fingerprint. Clients cannot set `Approved` directly.

### Round 2 "does not work yet" items: status
| Declared issue | Status |
|---|---|
| Fact check pattern-based, qualifiers misread | Improved by Improvement 1(a); still pattern-based |
| "Super Bowl" flagged as slang | Fixed, with test |
| HTML link URL flagged as bare URL | Fixed, with test |
| Markdown image "!" counted as exclamation | Not reproduced on the current engine |
| "Ready to submit" shown at 90 with a high item | Fixed (covered by an existing test) |
| Approval counts only trusted from the browser | Fixed by Improvement 3 |
| "100% remote" flagged high | Fixed for descriptive uses (remote, online, organic and similar), with test; "100% results" still flagged. Some rewrites remain mechanical |
| Verifier checks rule exists, not that it applies | Fixed by Improvement 1(b) |
| Deep check reads only the first 6,000 characters | Limit kept; the screen now says so when a draft is longer. Exact checks cover the whole draft |
| Output escaping / schema validation / CSP | Output escaping is used in the reviewed UI surfaces but has not been exhaustively audited. Firestore profile/document/event writes now have allowlists and size/type bounds; nested brand-pack validation is not exhaustive. A Content-Security-Policy is still not configured. |
| Open sign-up, first account becomes Admin | Unchanged by design |
| AI rate limit per serverless instance | Unchanged |
| Firestore rules not tested in the emulator | Added local emulator tests for bootstrap concurrency, roles, document mutation boundaries, and append-only events; not tested against the deployed Firebase project |
| One workspace per deployment | Unchanged |

### Other Round 3 reliability work
Upload limits (8 MB, supported types, empty or scanned PDF message), 20,000-character draft cap, deep-check truncation notice, duplicate-version guard, double-submit guard, visible failure messages for save/role/reset, confirmation before demo reset, README clean-up.

## 4. Testing details
- `npm test`: 33 automated checks (engine and accuracy 24, Gemini verifier 2, server approval 7), all passing at time of writing
- `npm run check`: JavaScript syntax check of client and API
- `node tests/e2e.js`: browser journeys against an in-memory Firebase mock
- `npx --yes firebase-tools@14 emulators:exec --only firestore --project demo-brandguard "npm run test:rules"`: Firestore rule authorization tests
- Manual journey to run on the deployed site: sign up (Admin) -> import guidelines -> second account (Creator) writes a draft, fixes/disputes findings, submits -> Admin/Reviewer approves -> check Insights
- Not yet done: a staging approval journey against the deployed Firebase/Vercel project

## 5. Product roadmap
See "Post-event roadmap" in README.md: OCR and region selection for images, a larger independently labelled evaluation set, emulator CI for Firestore rules and staging smoke tests, logo/layout checks, multi-workspace administration.
