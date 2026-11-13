# BrandGuard: Round 3 submission

- Project link: https://brandguard-ruby.vercel.app/ (responded HTTP 200 when checked on 2026-11-13). The URL is reachable, but the deployed HTML does not yet expose the updated no-account demo entry from this repository. Redeploy this source before representing the sandbox as available at the project link.
- Source repository: https://github.com/monster2005mac-dex/brandguard
- Product PDF: [SUBMISSION.pdf](./SUBMISSION.pdf)
- Judge access in this source version: open `/login.html?demo=1` (or use **Explore demo · no account needed** after redeployment) and select Creator, Reviewer, or Admin. No shared password is published. Demo data and simulated approvals stay in the visitor's browser and are not production authentication or approval.

## 1. Complete feature list
- Email/password and Google sign-in; a verified, pre-provisioned Admin bootstraps the first workspace
- Invitation-only, email-bound membership with seven-day expiry and email verification
- Workspace-scoped profiles, brand packs, documents, events, and access rules
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
See "Architecture" in README.md. Static HTML/CSS/vanilla JS client with a pure shared rule engine (`assets/js/engine.js`); Firebase Auth and workspace-scoped Firestore data; trusted bootstrap/migration scripts; Vercel `/api/invitations` for hashed, expiring, email-bound membership; `/api/approve` (Firebase Admin, `sharp`) for server-verified approval; and `/api/gemini` as an authenticated proxy with an atomic Firestore rate limit. Server API keys never reach the browser.

## 3. Prior-round commitments and Round 3 status

The supplied Round 2 PDF names three commitments from the Round 1 plan and reports all three as built in Round 2:
1. **Source-cited explanations and confidence.** Findings show a source rule, explanation, severity and confidence. Round 3 added independent rule-support verification and a combined confidence score.
2. **Guideline-gap insights.** Accepts, edits and disputes are logged; Insights surfaces disputed rules, creator reasons and suggested clearer wording.
3. **Intent-preserving rewrites with a diff.** Suggested changes are shown as a diff and require a creator action. Gemini receives the creator's stated intent.

The Round 2 PDF separately listed further Round 3 work. The three additions described below are implemented, but the original PDF did not label them as a replacement set of three Round 2 commitments.

### Additional Round 3 improvements implemented
1. **Measured accuracy and qualifier-aware fact checks.** A 60-case labelled regression corpus reports precision and recall and is rerun against the current brand pack. Numeric checks handle common qualifiers and formats such as "over 40k", "about 50k", "1.2 lakh" and ranges. This is a regression set, not independent real-world certification.
2. **Image and visual review.** PNG/JPG upload, dominant-colour comparison with the Admin palette, WCAG contrast for a selected text/background pair, and an alt-text prompt. Logo-version, layout and OCR checks are not implemented: no OCR pipeline or labeled image-validation set was built, and presenting unvalidated text/contrast detection as dependable could give creators and reviewers false assurance. These checks remain roadmap work.
3. **Server-verified approval.** `/api/approve` verifies the ID token and reviewer role, reruns checks on the exact stored version, rechecks image identity and colors, rejects stale rules/findings and open high-severity items, and records a SHA-256 fingerprint. Direct client approval is denied by Firestore rules. Unit and emulator tests pass, but the live endpoint has not been verified against a deployment.

### Round 2 declared gaps: current state
| Declared gap or Round 3 plan | Current state |
|---|---|
| Qualifier-aware fact matching and number formats | Implemented with regression tests; still pattern-based and may miss unusual wording. |
| AI verifier checks that a cited rule supports the finding | Implemented with an independent relevance check; unsupported results are dropped. |
| Combined confidence and labelled evaluation | Implemented with the 60-case regression corpus; no independent certification or confidence intervals. |
| Softer handling for descriptive absolutes such as "100% remote" | Fixed for an explicit list of descriptive terms. It is not a general language-understanding solution. |
| Better, context-aware rewrite templates | Improved for common guarantee, "gonna" and "wanna" constructions with subject/auxiliary-aware wording. When the subject cannot be inferred, the creator must write the replacement. Other exact-rule substitutions can still need grammar edits. |
| De-duplicated dispute counts per person | Implemented. Guideline-gap thresholds use distinct creator IDs per rule; repeat disputes from the same creator count once. The activity table still shows raw event totals. |
| Long-input chunking | Implemented. Gemini checks the full draft in sections; guideline import analyzes up to 192,000 characters in no more than eight ~26,000-character sections. Text and extracted-item caps are disclosed in the import preview. Deterministic checks still cover the full draft (up to the 20,000-character document cap). |
| Contrast and basic image review | Implemented for palette, selected-pair contrast and alt text. OCR, logo/version recognition and layout checks remain roadmap items because no validated recognition pipeline or labeled image set is available; automated findings would be unreliable without that validation. |
| Firestore emulator authorization tests | Completed locally (five test groups passed), including workspace boundaries; this does not verify the deployed Firebase project. |
| Server approval verification | Implemented and unit-tested; live Firebase/Vercel integration remains unverified because the listed deployment URL is unavailable. |
| Output escaping, schema validation and CSP | Brand-pack validation, Firestore allowlists/bounds, and CSP headers are implemented. Inline scripts are hash-allowlisted; inline styles remain allowed for existing style attributes. A complete output-escaping audit remains outstanding. |
| Invite-only sign-up | Implemented. A verified, pre-provisioned Admin bootstraps the initial workspace; Admin-issued seven-day invitations are email-bound and accepted transactionally after email verification. |
| Shared AI rate limit | Implemented with an atomic Firestore transaction shared across API instances: 20 requests per user per minute. Server AI fails closed if the service-account/rate-limit backend is unavailable. |
| Multi-workspace isolation | Implemented using workspace IDs on profiles, brand packs, documents, and events, with workspace-filtered client reads and Firestore authorization. Bootstrap and legacy migration scripts are included; cross-workspace administration is not. |
| Guided first-run Admin setup | Implemented as a three-step checklist on the empty brand-pack screen, using the existing company, import and visual-standard controls. There is no interactive wizard. |
| Structured user-testing evidence | Not available. The Round 2 PDF still contains `[ADD: ...]` placeholders in its feedback table; this submission does not claim user feedback that was not recorded. |
| Judge-accessible project and demo | The supplied Vercel URL responds HTTP 200, but the current deployed HTML does not expose the new demo entry. The repository source includes a no-account, local-only role demo; redeploy is needed before claiming judge access to that updated demo. Live Firebase membership and server approval were not verified. |

### Other reliability work implemented
Upload limits (8 MB, supported types, empty/scanned PDF messages), 20,000-character draft cap, explicit long-input warnings, duplicate-version guard, double-submit guard, visible save/role/reset failure messages, confirmation before demo reset, guided first-run checklist, workspace bootstrap/migration scripts, and local Firestore emulator coverage.

## 4. Testing details
- Verified locally:
  - `npm test`: 69 checks passed (engine/accuracy 27, Gemini/verifier and chunking 8, authenticated Gemini/rate limit 7, invitation API 9, CSP 11, server approval 7).
  - `npm run check`: passed JavaScript syntax checks.
  - `node tests/e2e.js`: 33 browser journey checks passed against local demo mode and mocked Firebase/API services, including the public demo entry, local-storage isolation, invited signup, long guideline import, tenant assignment, and approval request.
  - `npx --yes firebase-tools@14 emulators:exec --only firestore --project demo-brandguard "npm run test:rules"`: all five Firestore authorization test groups passed in the local emulator.
- Not yet verified: a staging approval journey against a deployed Firebase/Vercel project. The browser suite uses mocks and does not replace this check.

## 5. Product roadmap
1. Add OCR and sampled-region selection so image text and contrast can be checked without creator-selected colors; evaluate logo/version and layout safe-zone checks.
2. Expand the labelled evaluation set with independently reviewed brand examples and report confidence intervals by rule category.
3. Add Firebase Emulator CI and staging smoke tests for Firestore authorization and server-verified approvals.
4. Evaluate reusable approved assets, cross-workspace administration and CMS/Slack integrations after the reliability gaps above are addressed.
