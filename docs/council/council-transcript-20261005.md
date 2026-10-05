# LLM Council transcript — architecture review (2026-10-05)

## Question
Review the architecture plan below before coding: is the financial math, security model, data layer and hard-rule enforcement sound? What should change?

## Plan reviewed
# Architecture plan — personal portfolio dashboard

## Context
Single user (owner), checks mostly on iPhone. Replaces the dashboard/charts tab of a Google Sheet; the Sheet (fed by a Google Form) stays the source of truth. Private financial data. Vercel free tier. Stack fixed: Next.js App Router + TS + Tailwind + Recharts + Vitest.

Portfolios: P1 Active trading (IBKR; P5 merged into it Aug 2026), P2 Mother's house (managed, NOT owner's money), P3 Crypto DCA (OKX), P4 Real estate (planned, no data), P5 Retirement (archived).
Hard rules: P2 never combined with personal; Personal = P1 + P3 only. Deposits are not gains. TWR is the headline %, simple return also shown. USD/AED fixed 3.67 with global toggle. No cross-portfolio math except the explicit Personal view.

Data: one CSV per portfolio (Date, Invested (USD), Value (USD), Notes). Snapshots ~weekly. Invested is cumulative net capital, so the flow for a period = invested[i] - invested[i-1]. Dates may be Excel serials.

## File structure
```
config/portfolios.ts        # id, name, status(active|planned|archived), ownership(personal|managed), includeInPersonal, source key, notes
data/p1.csv … p5.csv        # sample data (Phase 1)
lib/
  calculations.ts           # ALL financial math, pure functions, no I/O
  calculations.test.ts
  format.ts                 # DD MMM YYYY, 12h time, currency (USD/AED)
  data/
    types.ts                # Snapshot, DataIssue, PortfolioData, DataSource interface
    clean.ts (+ test)       # parse numbers ("USD", "$", commas), Excel serial dates, DD/MM/YYYY; skip rows w/o date; flag suspicious rows
    csv-source.ts           # reads /data via fs (Phase 1)
    apps-script-source.ts   # fetch Apps Script JSON with token (Phase 2), server-only
    index.ts                # getDataSource() picks by env DATA_SOURCE; getPortfolio(id), getPersonal()
  auth.ts                   # HMAC-signed session cookie (Web Crypto, works in middleware)
middleware.ts               # redirect to /login unless valid cookie; exempt manifest/icons/login
app/
  layout.tsx, manifest.ts, globals.css (CSS-variable tokens, light/dark)
  login/ (page + server action)
  (dashboard)/
    layout.tsx              # header (currency toggle, theme), bottom tab bar on mobile / top nav desktop
    page.tsx                # Overview: Personal KPIs, P2 separate section, allocation donut (Personal only), Personal value chart, data issues
    portfolios/page.tsx     # list incl. planned/archived
    p/[id]/page.tsx         # KPIs, Invested vs Value (deposit dots), P&L over time, drawdown chart, history table
    journal/page.tsx        # notes timeline, filter by portfolio + search (client)
    add/page.tsx            # form -> server action -> DataSource.addEntry -> Apps Script doPost; revalidateTag
components/                 # KpiCard, Money (client, reads currency context), charts/*, BottomNav, DataIssuesPanel
apps-script/Code.gs, appsscript.json
public/icons/*.png          # PWA + apple-touch icons
```

## Key decisions
1. **Units**: all math in USD on the server; currency conversion happens only at display time via one `convert()` (×3.67) in a client `<Money>` component reading a global currency context (persisted in cookie so SSR matches).
2. **TWR**: chain sub-period returns between consecutive snapshots. Per-period return uses Modified Dietz with flow assumed mid-period: r = (V_i − V_{i−1} − F_i) / (V_{i−1} + 0.5·F_i). First period: r_0 = V_0/I_0 − 1 (treat first invested as starting capital). TWR = Π(1+r) − 1. Periods with non-positive denominator are skipped and flagged.
3. **Change since last snapshot** = market change only: (V_i − V_{i−1}) − F_i, % = r_i. Deposits never show as gains.
4. **Drawdown** computed on the TWR wealth index (not on raw value), so deposits don't hide drawdowns and withdrawals don't fake them. Max and current drawdown.
5. **Break-even**: when value < invested, need (invested − value) $, i.e. (I−V)/V % gain.
6. **Best/worst week** = best/worst sub-period return r_i (with date and market $ change).
7. **Personal combined (P1+P3)**: union of snapshot dates; each portfolio forward-filled to its last known snapshot on/before that date (only after its first snapshot); sum invested and value; then run the same metrics on the combined series. Membership comes from config `includeInPersonal` and is guarded: a runtime assertion + unit test that any `ownership: 'managed'` portfolio (P2) can never be included.
8. **Cleaning**: strip "USD"/"$"/commas/whitespace; Excel serial → ISO date; rows missing a date are skipped AND reported; flagged-but-kept issues: duplicate dates (last one wins), out-of-order (sorted), negative numbers, value=0 with invested>0, |market move| > 50% in one period, invested change w/o note, future dates, unparseable numbers (row skipped). Issues shown in a "Data issues" panel.
9. **Data layer** behind a `DataSource` interface { listSnapshots(portfolioId), addEntry(entry) } so it can move to a DB. CSV source is read-only. Apps Script source uses fetch with `next: { revalidate: 60, tags: ['sheet'] }`, token from env `APPS_SCRIPT_TOKEN`, never shipped to the browser (`server-only`).
10. **Apps Script**: web app deployed "execute as me, anyone with link"; doGet returns all portfolios as JSON; doPost appends a row; token checked against Script Properties (Apps Script can't read headers, so token goes in query param / POST body — only the server calls it). LockService around appends.
11. **Auth**: single password `DASHBOARD_PASSWORD`; login server action does a constant-time compare, sets httpOnly, Secure, SameSite=Lax cookie containing an HMAC-signed expiry (secret `SESSION_SECRET`), 30 days. Middleware verifies on every route. `noindex` headers. Small delay on failed attempts.
12. **PWA**: app/manifest.ts (display: standalone), apple-touch-icon, appleWebApp meta, viewport-fit=cover + safe-area padding for the bottom tab bar. No service worker / offline caching (private data, always fresh).
13. **Design** (ui-ux-pro-max): Minimalism & Swiss style, zinc monochrome + one blue accent, green/red reserved for P&L direction only, CSS-variable tokens for light/dark (system default + manual override), Inter with tabular numbers, 44px+ tap targets, bottom nav ≤5 tabs (Overview, Portfolios, Journal, Add).
14. **Tests**: Vitest for calculations (TWR with deposits+withdrawals, drawdown, AED, break-even, personal aggregation, P2 exclusion) and cleaning.

## Commit plan
scaffold → config+data+cleaning → calculations+tests → auth+PWA → UI pages → Apps Script + Phase 2 source + add form → README → PR.

# Anonymized council responses

**Response A:**
Buildable, but fix before Monday or you ship wrong numbers. (1) Auth: Apps Script token in query string lands in Google logs — make reads POST-body only too. A login sleep does nothing on serverless; rate-limit; long passphrase; rotate SESSION_SECRET; logout. Don't trust middleware alone (CVE-2025-29927 class) — re-verify cookie in the data layer. Cache-Control: no-store on authenticated responses. (2) Add a hard test that getPersonal() output never changes when P2 data changes; never put P2 in the donut or shared chart axis. (3) TWR first period r0 = V0/I0 − 1 is wrong when snapshots start mid-life; treat first snapshot as base (index 1.0, no return), else first row with invested≠value invents a gain. (4) Flag when |F| is large relative to V_{i−1}. Flag (not skip) "invested change w/o note". (5) Personal forward-fill: filled dates show 0% return, diluting volatility/drawdown; compute Personal TWR by chaining each portfolio's own periods weighted by prior value; summed approach mishandles flows on different dates. (6) P5→P1 merge in Aug 2026 will appear as fake deposit/gain — handle explicitly with a transfer marker. (7) Golden-file test with hand-calculated TWR. (8) Apps Script should return raw values and ISO dates.

**Response B:**
Cold read. (1) Data contract ambiguous: withdrawal = negative delta, but a mistyped Invested in a Google Form silently becomes fake gains/losses; >50% flag only catches big ones. Not stated whether Value is recorded before/after the deposit; mid-period Dietz assumes timing the data can't confirm — define it. (2) r0 = V0/I0 − 1 is a hidden bug; state how the P5 merge appears in the data. (3) Personal forward-fill: week-old crypto value combined with fresh one fabricates noise. Flag staleness or restrict to common dates. (4) Skipped periods (non-positive denominator) silently break the chain — show it in the headline. (5) doGet returns ALL portfolios incl. P2 to the server; add form, journal, overview are all places the rule can leak — test every aggregate view. (6) Token in query string ends up in logs; "small delay" is not rate limiting on serverless; use long random password; sample CSVs must never contain real numbers if repo is public. (7) Jargon (P1–P5, Phase 1/2) unexplained. Write down exact CSV semantics and a hand-computed TWR fixture with a worked P5-merge example.

**Response C:**
Not sound yet. Math: (1) Mid-period Dietz on weekly snapshots is an approximation; fine for DCA, not for active trading with big deposits; pick explicit weights and test against a known answer. (2) flow = Δinvested: typos/restated rows create phantom flows treated as non-gains; invested change w/o note should be flagged prominently. (3) r0 = V0/I0 − 1 fabricates a return on mid-life import. (4) Skipping non-positive-denominator periods breaks the chain silently; show "TWR unreliable". (5) Forward-filling Personal is the real danger: stale P3 creates flat segment then jump, misattributed; compute Personal TWR from weighted component sub-period returns or only on dates with fresh snapshots (tolerance window). (6) Drawdown inherits all of this. Security: token in URL → logs; single password + 30-day cookie + no rate limit is weak — use Vercel KV/Upstash and lockout; HMAC cookie has no revocation — add session version; re-check auth in server actions and data fetches (middleware bypass CVEs); Add form needs CSRF consideration and input validation to avoid formula injection into the Sheet. Hard rules: use type-level separation (branded PersonalPortfolioId) and a test. Currency conversion at one boundary. Show stale-data timestamp. Reconcile against the Sheet's own totals.

**Response D:**
Plan is sound; biggest upside is a correct performance engine. (1) Make Personal the product; add P4 appraised valuation into net worth but excluded from TWR/drawdown. (2) Benchmarking: compare TWR vs SPY/BTC with the same cash flows ("what if I'd DCA'd the same dollars into VOO"). (3) Contribution-to-return attribution P1 vs P3. (4) Rolling returns: 4w, 12w, YTD, since inception — read better on phone than one number. (5) Put P2 behind its own route + read-only password so the mother gets a statement page; makes the hard rule structural. (6) Goals/projection line. (7) Weekly Apps Script email digest. Main limit: token in query string → move to POST body.

**Response E:**
Solving the wrong problem in two places. (1) Snapshot-only data can't support real TWR; needs a dated cash-flow ledger (deposit, withdrawal, dividend, fee) separate from valuations — add a Flows tab, or at minimum label "approximate TWR, weekly Dietz". (2) invested-change = flow fails for OKX internal swaps and the P5→P1 merge (fake deposit or fake gain) — need explicit transfer/merge event type. (3) Personal forward-fill gives wrong returns; build Personal flow ledger as union, value only on dates both have a snapshot; document combined drawdown as its own calc. (4) P2 rule via config flag — one typo breaks it; make P2 structurally unreachable from getPersonal(), separate type so it fails to compile. (5) Security: POST body for reads and writes, rotate token, keep Sheet unshared; real rate limit; Vercel Deployment Protection as a second layer; verify server-action origin check. (6) Vercel free has no persistent storage for rate limiting — Upstash or lockout cookie. Test TWR against a hand-computed spreadsheet.

# Mapping: A=Executor, B=Outsider, C=Contrarian, D=Expansionist, E=First Principles Thinker

# Peer reviews
R1: Strongest C (covers math+security+hard rules; weighted component returns or fresh-snapshot dates; session revocation, re-check auth outside middleware, formula injection, branded P2 types, reconcile vs Sheet). Blind spot D (calls plan sound, feature creep; P2 read-only password adds attack surface). All missed: flow timing; dividends/fees not modelled; Apps Script cold start/quotas; no backup/export; no fail-closed behaviour when Apps Script fetch fails; iOS PWA cookie isolation untested.
R2 (math focus): Strongest E (root cause; flow ledger or honest "approximate" label; transfer event type; common-dates valuation; compile-time P2 barrier). r0 critique is CORRECT; A's fix (first snapshot = base, no return) right. Forward-fill critique right in direction but overstated: summed series is still a valid value series; real defect is staleness (filled date shows 0%, flow lands a period late); A is wrong that summing "mishandles flows" — Dietz is additive when valuation dates align; E's common-dates fix cleaner than A's weighted chaining. Blind spot D. Missed: Apps Script latency/downtime; PWA cookie; Dubai timezone & Excel serials; backup; cache keys leaking P2; sample CSVs real data?
R3 (scope focus): Strongest C, A close second. Parts of C over-engineered for one user (Vercel KV lockout, CSRF, session versioning) — long random password + cheap lockout cookie is enough. Blind spot D (feature creep; P4 in net worth nudges against Personal=P1+P3). Missed: free-tier ops (quota, cold start, 10s fn limit); personal data in repo; timezones; fallback to last cached data with age; PWA cookie; AED toggle must apply to chart axes too; build order: TWR core first.
R4 (security focus): Strongest C. Blind spot D. Missed: "anyone" Apps Script URL is publicly callable — long random token is the only defence and Apps Script can't rate-limit; server actions are public POST endpoints that must authenticate themselves (Next checks Origin); Data Cache/revalidateTag could serve cached private response if page not dynamic; PWA cookie theft has no remote logout; sample CSVs with real data; Excel serial timezone handling.
R5 (iPhone/data-entry focus): Strongest A (most concrete correct fixes), E close second. Blind spot D, B second weakest. Missed: mistyped cumulative Invested on phone → phantom flow; let the user enter the deposit amount and compute cumulative instead; Add page vs Google Form — which is canonical; idempotency on double-tap; loading/error/offline states, "last updated" display; iOS standalone PWA doesn't share Safari cookies (log in again after install); password autofill; Recharts touch + 390px readability; Apps Script versioning/quota.

# Chairman verdict

## Where the Council Agrees
- TWR first-period rule (r0 = V0/I0 − 1) is a bug: a mid-life start invents a gain. Treat the first snapshot as the base (index 1.0, no return).
- Forward-filling Personal is the biggest math risk: stale P3 values create flat-then-jump segments and late flows, corrupting Personal TWR and drawdown.
- The Apps Script token must not travel in the query string. Use POST bodies for reads and writes.
- "Small delay on failed login" does nothing on serverless. Use a long random password and real protection.
- P2 exclusion via config flag + runtime assert is too weak. Make it structural (types, tests).
- Invested-change-as-flow breaks on typos and the P5→P1 merge. These need flags or a transfer marker.
- TWR needs a hand-computed golden fixture. Skipped periods must be visible, not silent.

## Where the Council Clashes
- Personal fix: weighted chaining of component returns (Executor) vs valuing only on common/fresh dates (First Principles). Chairman sides with common/fresh dates.
- Flow ledger: a separate Flows tab is cleaner but changes the user's data model, so it's optional. Label TWR as approximate meanwhile.
- Security depth: KV/Upstash rate limiting and session versioning are over-engineering for one user. A long random password is enough, but server actions and data fetches must re-verify auth themselves.
- The Expansionist's features (benchmarks, goals, P2 statement page with its own password, P4 in net worth) are feature creep. Rejected.

## Blind Spots the Council Caught
- A mistyped cumulative Invested on a phone creates a phantom flow. Let the Add form take a deposit amount and compute cumulative Invested.
- Middleware-only auth is bypassable (CVE-2025-29927 class). Re-verify in the data layer and server actions.
- The "anyone" Apps Script URL is public and can't rate-limit, so a long random token is the only defence.
- Cached private responses can leak. Use no-store.
- No fail-closed behaviour when Apps Script is slow or down. Show "last updated" and serve last-good data with its age.
- iOS home-screen apps don't share Safari cookies, so the user must log in once inside the installed app.
- Sample CSVs must be synthetic. The AED toggle must apply to chart axes. Handle Dubai timezone and Excel serials. Make the Add form idempotent, and sanitise Sheet writes against formula injection.

## The Recommendation
1. TWR: first snapshot is the base. Document the timing assumption, label the figure as weekly Modified Dietz, show "unreliable" when a period is skipped, and flag large flows.
2. Personal: only value on dates where P1 and P3 both have a snapshot within a tolerance window. Show staleness.
3. P2 barrier: a type-level PersonalPortfolioId, plus a test that Personal is invariant to P2 data. Keep P2 out of the donut and shared axes.
4. Transfer marker for the P5→P1 merge. Make "invested change without a note" a prominent flag.
5. Auth: long random password, logout, rotatable SESSION_SECRET (rotating it logs every session out), re-verify in data layer and server actions, Cache-Control: no-store.
6. Apps Script: POST-body token, raw values and ISO dates, sanitise writes.
7. Resilience: show "last updated" and serve last-good data on failure.
8. Add form: deposit helper that computes cumulative Invested; idempotent submission.
9. Hygiene: synthetic CSVs, timezone handling, AED on chart axes, golden TWR fixture including a merge.
10. Optional later: a Flows ledger tab.

## The One Thing to Do First
Hand-calculate a golden TWR fixture (first-snapshot base, deposits, a withdrawal, a P5-merge transfer, a stale-P3 Personal case), write the tests, then build calculations.ts against them.
