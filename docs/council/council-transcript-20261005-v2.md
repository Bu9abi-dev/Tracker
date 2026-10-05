# LLM Council transcript — v2 plan (2026-10-05)

## Plan reviewed
# Plan v2 — real data, dynamic portfolios, statement upload + holdings

## Context (existing, deployed)
Next.js 16 App Router app on Vercel (free tier), single-user, password-protected (HMAC cookie), iPhone PWA. Data layer interface `DataSource { loadRaw(), addEntry() }` with a CSV source (sample data) and an Apps Script source (POST JSON with token in body, 60s cache, last-good fallback). Portfolios are currently a static TS config (`config/portfolios.ts`) with a type-level barrier: managed money (P2, the user's mother's) can never be in "Personal" (= P1 + P3). All financial math in lib/calculations.ts (TWR via chained Modified Dietz, drawdown on TWR index), 92 tests.

The user is NOT technical. They edit a Google Sheet by hand (no Google Form). Their real sheet:
- Tabs: "P1 (STOCKS ONLY IBKR)", "P2 HOUSE", "P3 Crypto (OKX)", plus "Dashboard" and a hidden test "Form Responses 1".
- Each portfolio tab: row 1 title, row 2 "Exchange Rate…", row 3 headers: Date | Invested (USD) | Value (USD) | P&L (USD) | P&L % | Invested (AED) | Value (AED) | P&L (AED) | Break-even ($) | Break-even (AED) | Notes. Data from row 4. Columns D–J are formulas PRE-FILLED down ~990 rows (so "append" must write into the first empty data row, not after the last used row, and must only set A, B, C, K).
- ~10 snapshot rows each (Apr–Oct 2026). Notes are free text (e.g. "ENDED P5, MERGED INTO P1, ADDED 2000 AED").

## New requirements
1. Show real data (connect live Sheet).
2. Add more portfolios in the future — from the app (user can't edit code).
3. Upload account statements (IBKR stocks, OKX crypto, P2's broker), with a free-text prompt ("this is for portfolio A"), extract holdings, and on each portfolio page show current holdings, amounts, profitability, and allocation per sector.
4. User chose Google Gemini free tier for extraction (informed that free-tier inputs may be used by Google to improve products). Claude API / Pro usage not possible (Pro doesn't cover API).

## Proposed architecture
**Google Sheet is the database**, via the existing Apps Script web app (bound to the sheet). New tabs auto-created by the script on first use:
- `Portfolios` (registry): id, name, shortName, description, status (active|planned|archived), ownership (personal|managed), includeInPersonal (bool), tab (sheet tab name), color, managedFor. Seeded once with P1/P2/P3 (P2 managed), P4 planned, P5 archived.
- `Holdings`: statementId, portfolioId, asOf, symbol, name, assetType (stock|etf|crypto|cash|other), sector, quantity, currency, price, marketValueUsd, costBasisUsd (nullable), unrealizedPnlUsd (nullable).
- `Statements`: id, portfolioId, uploadedAt, fileName, mimeType, driveFileId, driveUrl, statementDate, prompt, holdingsCount, totalValueUsd.
- Uploaded files saved to a Drive folder "Portfolio Statements" (DriveApp; new OAuth scope → user re-authorizes once).

**Apps Script API (POST, token in body)** gains actions: `listPortfolios`, `createPortfolio` (adds registry row + creates a new tab copying the P1 layout: title, rate row, headers, formulas), `listHoldings` (latest statement per portfolio), `saveStatement` (file base64 → Drive, rows → Holdings/Statements, under LockService, idempotent by id), `list` now finds the header row automatically (scans first 10 rows for "Date") and `add` writes to the first empty data row preserving formulas.

**Portfolios become dynamic**: registry from the sheet merged over the static defaults (CSV mode keeps static config). Validation at load: managed ⇒ includeInPersonal forced false + data issue; archived/planned ⇒ not in Personal; duplicate ids rejected. New portfolios default to NOT in Personal (user opts in), and the create form asks "Is this your money?" — "No (managed for someone)" makes it managed. Tests: Personal invariant to managed data, normalisation rules.

**Statement flow** (new "Upload" page):
1. Pick portfolio (dropdown) + file (PDF, CSV, PNG/JPG; ≤ 4 MB to fit Vercel's request limit) + optional prompt.
2. Server action → Gemini REST `generateContent` (model from env, default gemini-2.5-flash) with the file inline (base64), a system instruction, the user's prompt, and `responseMimeType: application/json` + `responseSchema` → { statementDate, baseCurrency, holdings[], cash, totalValue, warnings[] }. Gemini also assigns a GICS-style sector (Crypto/Cash for those).
3. **Review screen**: editable table (sector dropdown, numbers editable), totals vs latest snapshot value shown, warnings shown. Nothing is saved until the user taps Confirm.
4. Confirm → Apps Script saveStatement (file to Drive + rows). Latest statement per portfolio = current holdings.
- Values normalised to USD (AED via 3.67; other currencies: trust statement base-currency values; flag if missing).
- Validation server-side: numbers finite, sums sanity-checked vs reported total (flag mismatch > 2%).

**Portfolio page additions**: Holdings table (symbol, name, qty, value, weight, unrealized P&L $/%), sector allocation donut + list, "as of {statementDate} · from {fileName}" with Drive link. Holdings math (weights, sector sums, P&L %) in lib/calculations.ts with tests. Personal overview gets a combined sector allocation (Personal portfolios only; never managed).

**Env**: GEMINI_API_KEY (server-only), GEMINI_MODEL (optional). next.config serverActions.bodySizeLimit = "4mb".

**Rollout for a non-technical user**: I write the updated Code.gs; they paste it into Extensions → Apps Script, run `generateToken`, deploy as web app, paste 3 values into Vercel (DATA_SOURCE, APPS_SCRIPT_URL, APPS_SCRIPT_TOKEN) + GEMINI_API_KEY from Google AI Studio. Guided step-by-step with screenshots.

## Open questions for the council
- Is the Sheet-as-database (registry/holdings/statements tabs + Drive) the right call vs. a Vercel-hosted DB (Neon/Upstash/Blob)?
- Is AI extraction with a mandatory review step safe enough for money data? Any better approach for IBKR/OKX (structured CSV exports)?
- Does making portfolios dynamic weaken the P2 hard rule? How to keep it airtight?
- Anything that will break for a non-technical user (setup, re-authorization, limits)?

# Anonymized council responses (v2 plan)

**Response A:**
Written by someone who knows the system; the non-technical owner can't follow it. (1) Setup is the real failure point: ~12 steps across 4 products; Apps Script's "unverified app" warning alone will stop them; screenshots go stale; someone probably has to do it with them on a call. (2) Nobody says what the owner sees when things break (stale Apps Script deploy after code edits, Gemini free-tier limit) — need plain-language errors. (3) "managed" as a sheet-editable flag is fragile — the owner will hand-edit it. A wrong dropdown pick puts mom's holdings into a personal portfolio and the review screen won't catch it. Sending mom's statements to Google's free tier (may train) is a privacy decision for a third person who never agreed. (4) Review-before-save assumes the reviewer can spot errors; show the statement alongside extracted rows; better, parse IBKR/OKX CSV exports in code, Gemini only for the broker with no export. (5) Undefined jargon. Verdict: live sheet first, then CSV import, AI upload last and not for mom's account.

**Response B:**
Buildable, but rollout fails for a non-technical owner and the riskiest piece is first. (1) Do setup on one screen-share/call. (2) Skip Drive scope in v1 — store only extracted rows; PDFs are the most sensitive data and Drive adds re-authorization for no clear gain. (3) Phase A: live sheet (header scan, write first empty row only A,B,C,K) → confirm numbers on phone; Phase B dynamic portfolios; Phase C upload/extraction. (4) Test one real IBKR PDF on Gemini before building the review UI; scanned PDFs/images hardest. (5) Parse IBKR/OKX CSVs deterministically; Gemini only for mom's broker. (6) Hard block: Confirm disabled if extracted total differs from reported total > 2%. (7) Make "managed" immutable, never toggled in UI; compute Personal from ids, not a sheet flag. (8) 4MB limit will reject many multi-page PDFs.

**Response C:**
Wrong question. Owner wants accurate numbers at a glance. (1) Holdings/sectors/statements are a different product (analyzer) bolted onto a tracker; ship live data first and live with it a month. (2) "Add portfolios from the app" happens ~twice a year; cut it, keep static config — the P2 barrier stays type-level and airtight. Dynamic registry is the biggest risk to the one invariant that matters. (3) Gemini free tier with training on financial statements is a privacy decision made for cost; IBKR/OKX have CSV exports — parse deterministically; review screens protect against typos, not trust fatigue. (4) Setup (Drive re-auth, redeploy, 4 env vars) is the actual failure mode. Smallest right thing: connect the sheet, CSV-import holdings for IBKR and OKX, defer Drive, Gemini and dynamic portfolios.

**Response D:**
Four holes. (1) Gemini free tier may train on inputs; mom's statements are third-party data she never consented to share; rate limits and model deprecations will silently break it. (2) AI extraction is the wrong primary path — LLMs misread columns, drop rows, invent sectors; 2% mismatch check is far too loose; require per-row reconciliation (qty × price ≈ value) and block Confirm on failure; review screen is theater for a non-technical user. (3) P2 guarantee now depends on a sheet-editable runtime flag; make managed immutable once set; Personal = ownership 'personal' only, never trust includeInPersonal for managed; test that no managed id appears in any Personal aggregate including sector allocation. (4) Setup will defeat the owner (unverified app warning, Drive scope, redeploy gives new URL). Apps Script quotas/6-min limits; sheet is a fragile DB; hand edits can corrupt Holdings/Statements tabs. Verdict: sheet read path + CSV-first import.

**Response E:**
The statement-to-holdings pipeline is the real product. (1) Holdings can prefill the snapshot Value from the latest statement total — removes hand-typing errors and makes snapshots auditable. (2) Statement history → holdings-over-time diffs, contribution by sector/position, realized vs unrealized P&L. (3) A clean read-only P2 report to show the mother. (4) Prefer structured exports: IBKR Flex/Activity CSV and OKX CSV parse deterministically; Gemini only for the odd broker — keeps 2 of 3 accounts away from Google's free tier; "broker adapter" pattern. (5) Cheap wins: concentration alerts ("tech is 62% of Personal"), combined Personal sector view, currency exposure, camera capture. Build the structured-CSV path first.

# Mapping: A=Outsider, B=Executor, C=First Principles, D=Contrarian, E=Expansionist
# Owner's explicit requests: add portfolios from the app in future; upload statements with a prompt; extract holdings, amounts, profitability, sector allocation per portfolio; chose Gemini FREE after being told free-tier inputs may be used by Google.

R1: Strongest B (phased, test real IBKR PDF first, hard-block Confirm, managed immutable, Personal from ids, 4MB, drop Drive). D close 2nd. Blind spot E (features, ignores setup/P2/privacy). Missed: Vercel function timeouts vs slow Gemini; Apps Script redeploy URL changes; backup/recovery; formula injection from extracted text; FX/non-USD holdings; reconcile statement totals with snapshots; nobody proposed excluding P2 from AI upload.
R2 (owner-intent focus): Strongest B — only one keeping all three owner requests and sequencing them. Blind spot C — overrides explicit requests (cut dynamic portfolios, defer Gemini) though owner can't edit code so static config blocks them; A lesser offender ("not for mom's account"). Missed: Gemini free tier region availability (owner likely in UAE); base64 +33% vs 4MB; key rotation; sheet backup; REDACT account numbers/names before upload; holdings go stale between uploads; auth on new upload endpoints.
R3 (technical accuracy): Strongest B; Vercel 4.5MB cap real, base64 +33% → ~3MB effective file. D close 2nd. Blind spot E. Missed: edit Apps Script → "Manage deployments → New version" keeps URL, "New deployment" changes it; Anyone-access + token is the only protection; Gemini free-tier quotas/models change — don't hard-code model; IBKR CSVs are multi-section, Flex needs setup, OKX exports are trade/funding history not holdings — "deterministic CSV" not trivial; no sheet backup; no audit trail for AI values.
R4 (P2 + financial correctness): Strongest D (managed immutable, Personal = ownership personal only, test no managed id in ANY Personal aggregate incl. sector, per-row qty×price≈value). Missed: holdings keyed by user-picked portfolioId — a mis-selected dropdown contaminates; verify account number/name on the statement against the chosen portfolio; which is authoritative — snapshot Value vs statement total; nullable cost basis → partial P&L must be explicit; fixed sector taxonomy; weights on which total; double counting in combined sector view.
R5 (iPhone UX): Strongest B. Blind spot E. Missed: iOS file pickers (Files/Photos), HEIC photos; how statements reach the phone; Gemini 10–60s → loading state, timeout, plain-words 429; wide editable table unusable at 390px → card list; clear success/duplicate feedback on re-upload; snapshot vs holdings totals will visibly disagree — explain.

# Chairman verdict (summary)
- Keep all three owner requests (live Sheet, add portfolios from the app, statement upload with Gemini) and sequence them: live Sheet → dynamic portfolios → upload.
- "Managed" is immutable (no UI toggle); Personal counts only ownership = personal portfolios, in every aggregate including sector allocation; tests for it.
- Don't store statement files in Drive in v1 (avoids a new permission scope and the most sensitive data); keep the file name.
- Statement-to-portfolio identity check (broker + last 4 of account), extra confirmation when the target is managed (P2).
- Hard gates on AI extraction: per-row quantity × price ≈ value, total reconciliation, Confirm disabled until resolved; fixed sector list; explicit partial P&L when cost basis is missing; sanitize text written to the Sheet.
- Plain-language errors for limits (file size ~4 MB, Gemini 429/timeouts/region), model in an env var, "New version" redeploys keep the URL.
- Authority rule: snapshots drive performance; statements drive holdings and sectors; show both totals with an explanation.
- Mobile-first review as cards; HEIC and iOS pickers.
- Defer extras (alerts, diffs, CSV adapters).
