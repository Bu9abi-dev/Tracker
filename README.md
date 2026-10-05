# Portfolio Dashboard

A private, password-protected dashboard for my investment portfolios. It replaces the dashboard and chart tabs of my Google Sheet; the Sheet (fed by my Google Form) stays the source of truth. It's built for iPhone: you add it to the home screen and it opens full-screen like an app.

Built with Next.js (App Router), TypeScript, Tailwind CSS, Recharts and Vitest. It deploys to Vercel's free tier.

- **Overview**: Personal (P1 + P3) KPIs, a combined value chart and an allocation donut. P2 has its own separate section.
- **Portfolio pages**: KPIs, invested vs value (deposits marked), P&L over time, drawdown, and the full history with notes.
- **Journal**: every note from every portfolio on one timeline, filterable and searchable.
- **Add entry**: a mobile form that writes a new snapshot to the Google Sheet (Phase 2).
- **Data issues**: rows that were skipped or look suspicious are listed, never silently dropped.

> The CSVs in `/data` are **synthetic sample data**, generated for development. Don't commit real numbers if this repository is public.

---

## Contents

1. [Setup](#setup)
2. [Environment variables](#environment-variables)
3. [Portfolios config](#portfolios-config)
4. [Data format](#data-format)
5. [How the numbers are calculated](#how-the-numbers-are-calculated)
6. [Deploy the Apps Script (Phase 2)](#deploy-the-apps-script-phase-2)
7. [Deploy to Vercel](#deploy-to-vercel)
8. [Add it to your iPhone home screen](#add-it-to-your-iphone-home-screen)
9. [Security](#security)
10. [Project structure](#project-structure)

---

## Setup

Requires Node.js 20.9 or later.

```bash
npm install
cp .env.example .env.local      # then fill in the values (see below)
npm run dev                     # http://localhost:3000
```

Generate the two secrets:

```bash
openssl rand -base64 24   # DASHBOARD_PASSWORD (or pick a long passphrase)
openssl rand -base64 32   # SESSION_SECRET
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm test` | Runs the Vitest unit tests (calculations, cleaning, auth, data layer) |
| `npm run typecheck` | Generates route types and runs `tsc` |
| `npm run build` | Production build |
| `node scripts/generate-icons.mjs` | Regenerates the app icons in `public/icons` |

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DASHBOARD_PASSWORD` | yes | The single login password. At least 12 characters; use a long random one. |
| `SESSION_SECRET` | yes | 32+ random characters used to sign the session cookie. Changing it signs out every device. |
| `DATA_SOURCE` | no | `csv` (default, Phase 1: reads `/data`) or `apps-script` (Phase 2: live Google Sheet). |
| `APPS_SCRIPT_URL` | Phase 2 | The Apps Script web app URL (ends in `/exec`). |
| `APPS_SCRIPT_TOKEN` | Phase 2 | The secret token from the Apps Script (see below). |

None of these use the `NEXT_PUBLIC_` prefix, so none of them are ever sent to the browser.

## Portfolios config

Portfolios are defined in [`config/portfolios.ts`](config/portfolios.ts). To add a portfolio, rename one or archive one, edit that file.

| Id | Portfolio | Status | In Personal |
| --- | --- | --- | --- |
| P1 | Flexible / Active Trading (IBKR) | active | ✅ |
| P2 | Mother's House Portfolio (managed for my mother) | active | ❌ never |
| P3 | Crypto DCA (OKX) | active | ✅ |
| P4 | Real Estate | planned | — |
| P5 | Retirement (merged into P1, Aug 2026) | archived | — |

**Personal = P1 + P3 only.** P2 is `ownership: "managed"`, and three separate checks keep it out of Personal:

1. **Types**: managed portfolios have `includeInPersonal: false` as a literal type, so setting it to `true` doesn't compile.
2. **Runtime**: `assertConfig()` throws at startup if a managed, planned or archived portfolio is put in Personal.
3. **Tests**: these confirm that Personal is exactly P1 + P3, and that changing P2's data never changes any Personal number.

## Data format

There's one CSV per portfolio (`data/p1.csv` …) or one sheet tab per portfolio, with these columns:

```
Date,Invested (USD),Value (USD),Notes
```

- **One row is one snapshot**, usually weekly.
- **Invested** is cumulative net capital. When it goes up between two rows, that's a deposit; when it goes down, that's a withdrawal.
- **Value** is the market value on that date.
- **Notes** is free text. If a capital change is money moved between portfolios (like the P5 → P1 merge), put the word **"Transfer"** (or "merged") in the note. It then shows as a transfer instead of a deposit or withdrawal.

Cleaning on import (`lib/data/clean.ts`):

| Input | What happens |
| --- | --- |
| `21,450.32 USD`, `$1,000`, `(250)` | Parsed as numbers |
| Excel/Sheets serial dates (`45660`) | Converted (days since 1899-12-30) |
| `2025-01-03`, `03/01/2025` (day first), `03 Jan 2025` | Parsed as calendar dates |
| Missing date | Row skipped, listed in **Data issues** |
| Unparseable number, future date, negative value, an amount in AED | Row skipped, listed |
| Duplicate date | One row kept, listed |
| Market move over 50% in one period, a large capital change with no note, value 0 with capital in | Row kept, flagged for review |

## How the numbers are calculated

All financial maths is in [`lib/calculations.ts`](lib/calculations.ts) and covered by [`lib/calculations.test.ts`](lib/calculations.test.ts), which includes a hand-computed golden example. Everything is calculated in USD. AED is applied only for display, at the fixed rate **1 USD = 3.67 AED**.

- **Flow** for a period = `invested[i] − invested[i−1]`. Deposits raise invested and value by the same amount, so they are never counted as gains.
- **P&L** = value − invested.
- **Simple return** = (value − invested) ÷ invested.
- **Time-weighted return (TWR)**, the headline %, chains each period's return so that the timing and size of deposits and withdrawals don't count as performance. Each period uses Modified Dietz, with the flow assumed to land mid-period. That's the best assumption when all we know is that the money arrived somewhere between two snapshots:

  ```
  r = (V_end − V_start − flow) / (V_start + 0.5 × flow)
  TWR = (1 + r₁)(1 + r₂)…(1 + rₙ) − 1
  ```

  The first snapshot is the starting point (index 1.0). It has no return of its own, because any gain it already carries happened before tracking began. That gain still shows up in simple return. A period that can't be measured (for example, everything was withdrawn) is skipped, and the TWR is marked **approx.**
- **Since last snapshot** = the market change only: (value change − flow) in $, and that period's r in %.
- **Drawdown** is measured on the TWR growth index, not on raw value. A deposit can't hide a fall, and a withdrawal can't fake one. The app shows both the maximum drawdown and the current drawdown from peak.
- **Break-even** (shown only when in loss) = invested − value, and the % gain needed from the current value.
- **Best and worst week** are the highest and lowest single-period returns.
- **Personal (P1 + P3)** uses the dates from both portfolios. A date is only used if each portfolio has a snapshot within the 7 days before it. Stale values are never carried forward into returns. When P3 first appears in the combined series it enters at its first value, so that isn't counted as a gain. If a portfolio falls more than 7 days behind, the dashboard says so.

## Deploy the Apps Script (Phase 2)

The script turns your Google Sheet into a small private JSON API that only the dashboard's server can call.

1. **Prepare the sheet.** The script supports two layouts. Set `CONFIG.MODE` at the top of `Code.gs` to match yours:
   - `"tabs"` (default): one tab per portfolio, named `P1`, `P2`, `P3`… (edit `CONFIG.TABS` to use other names). Each tab has a header row with `Date`, `Invested`, `Value` and `Notes`.
   - `"responses"`: one sheet, e.g. your Google Form's `Form Responses 1`, with `Date`, `Portfolio`, `Invested`, `Value` and `Notes` columns. Each Portfolio answer must start with the id, e.g. `P1 — Active Trading`.
2. In the Google Sheet, open **Extensions → Apps Script**.
3. Replace the contents of `Code.gs` with [`apps-script/Code.gs`](apps-script/Code.gs). Optionally, enable *Project Settings → Show "appsscript.json"* and paste in [`apps-script/appsscript.json`](apps-script/appsscript.json).
4. **Create the token.** Choose `generateToken` in the function dropdown and click **Run**. Approve the permissions; it only accesses this spreadsheet. A dialog shows the new token, which is saved in *Project Settings → Script properties* as `API_TOKEN`. Copy it. Running `generateToken` again rotates the token.
5. **Deploy.** Choose **Deploy → New deployment → Web app**, with:
   - *Execute as*: **Me**
   - *Who has access*: **Anyone** (this is required so Vercel can call it without a Google login; the token is what protects it)
6. Copy the web app URL (it ends in `/exec`).
7. Set these in Vercel (or `.env.local`): `DATA_SOURCE=apps-script`, `APPS_SCRIPT_URL=<url>`, `APPS_SCRIPT_TOKEN=<token>`.

After editing the script later, use **Deploy → Manage deployments → Edit → Version: New version**. That keeps the same URL.

How it works:
- **Reads and writes are both POST requests**, with the token in the JSON body. The token never appears in a URL, so it can't leak through access logs. A GET returns nothing.
- Dates are returned as `YYYY-MM-DD` in the spreadsheet's time zone. Numbers are returned raw, and the dashboard cleans them and flags problems.
- Adding an entry is **idempotent**: a double tap or a retry with the same submission id is ignored for 6 hours. Appends run under a lock, and notes that start with `=`, `+`, `-` or `@` are escaped so they can't become formulas.
- The dashboard caches Sheet data for 60 seconds. If the Sheet is slow or down, it shows the last good copy with a warning instead of an empty page.

## Deploy to Vercel

1. Push this repository to GitHub. Keep it **private**.
2. In Vercel, choose **Add New → Project**, import the repo, and keep the defaults (it detects Next.js).
3. Under **Settings → Environment Variables**, add `DASHBOARD_PASSWORD` and `SESSION_SECRET`, plus the Phase 2 variables when you're ready.
4. Deploy. Every push to `main` redeploys.
5. Optional: Vercel's free **Deployment Protection** (Vercel Authentication) adds a second login layer for preview deployments.

## Add it to your iPhone home screen

1. Open your Vercel URL in **Safari** on the iPhone.
2. Tap the **Share** button, then **Add to Home Screen**, then **Add**.
3. Open **Portfolio** from the home screen. It runs full-screen without Safari's toolbars.
4. **Sign in once inside the installed app.** iOS keeps a separate cookie store for home-screen apps, so a login in Safari doesn't carry over. Let iCloud Keychain save the password. The session lasts 30 days.

## Security

This is private financial data, so:

- Every route goes through `proxy.ts`. The data loader and the server actions also re-check the session, so even a proxy bypass can't read or write data.
- The session cookie is `httpOnly`, `Secure` in production, `SameSite=Lax`, and HMAC-signed with an expiry. Its key is derived from both `SESSION_SECRET` and the password, so changing either one signs out every device. That's the remote logout if a phone is lost.
- The password must be at least 12 characters and is compared in constant time. Failed logins are throttled per server instance. Serverless instances don't share memory, so the real protection is a long random password.
- Every page and API response has `Cache-Control: private, no-store`, `X-Robots-Tag: noindex` and `X-Frame-Options: DENY`. There's no service worker or offline cache, so no financial data is stored on the device.
- The Apps Script token lives only in server-side environment variables and travels in POST bodies.

## Project structure

```
config/portfolios.ts        portfolio registry (add/archive here)
data/*.csv                  synthetic sample data (Phase 1)
lib/calculations.ts         all financial maths (+ tests)
lib/data/                   swappable data layer
  types.ts                    DataSource interface — implement it to move to a database
  clean.ts                    parsing, cleaning, data-issue detection (+ tests)
  csv-source.ts               Phase 1
  apps-script-source.ts       Phase 2 (+ tests)
  index.ts                    picks the source from DATA_SOURCE, cleans, requires a session
lib/portfolio.ts            view models: per portfolio, Personal (P1+P3), journal (+ tests)
lib/session.ts, lib/auth.ts session tokens, login throttling, requireSession
proxy.ts                    route protection
app/(app)/                  Overview, portfolios, /p/[id], journal, add, settings
app/login/                  sign-in page and actions
apps-script/                Google Apps Script web app
components/                 UI, charts (Recharts), currency toggle
docs/council/               architecture review notes (llm-council)
```

To move to a database later, write a new `DataSource` in `lib/data/` that implements `loadRaw()` and `addEntry()`, and select it in `lib/data/index.ts`. Cleaning, calculations and the UI don't need to change.

### Design

The visual direction comes from the `ui-ux-pro-max` skill: Minimalism and Swiss style, a zinc monochrome palette with one blue accent, and green/red used only for P&L direction. It uses the native system font (SF Pro on iPhone), tabular figures, 44pt+ tap targets, a bottom tab bar that respects safe areas, light/dark/system themes, and reduced-motion support. Dates are shown as `DD MMM YYYY` and times on a 12-hour clock in Asia/Dubai.
