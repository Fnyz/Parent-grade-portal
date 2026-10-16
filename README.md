# Parent Grade Portal

A small website where parents see their child's report cards, and advisers enter grades.

- **Parents** type the access code from a paper slip and see one child's released quarters,
  general averages and full report cards. No accounts, no passwords. The phone can remember
  the code, with a "Forget this phone" button for shared phones.
- **Teachers** sign in with email and password, manage one or more sections (classes), add
  students by hand or from a spreadsheet, enter grades in a grid that saves on its own, and choose
  when each quarter becomes visible to parents.

Everything runs on one free Cloudflare account: a Worker for the pages and API, KV for classes and
grades, a Durable Object for sessions and access codes, and the Rate Limiting binding for wrong
code guesses.

The plan, decisions and rules the build must follow are in [PLAN.md](PLAN.md). What has been done
and what is left is in [PROGRESS.md](PROGRESS.md).

## Requirements

- Node.js 22.18 or later (the setup script runs `.ts` files directly)
- npm
- A Cloudflare account, only for deploying

## Run it locally

```bash
npm install
cp .dev.vars.example .dev.vars        # then put a long random string in PARENT_SECRET
npm run teacher -- create --email you@school.ph --name "Your Name" --class "Grade 4 - Sampaguita"
npm run dev
```

- Teacher dashboard: http://localhost:5173/teacher
- Parent page: http://localhost:5173/

Add students on the teacher page. Each one gets an access code; use it on the parent page. A
quarter only shows to parents after you turn on **Visible to parents**.

Local data lives in `.wrangler/state` and never touches Cloudflare. Use Chrome or Firefox locally:
Safari may not keep the sign-in cookie on `http://localhost`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with the Worker, reloads on change |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Builds, then serves it with the real security headers |
| `npm test` | API and unit tests, run inside the Workers runtime |
| `npm run typecheck` | Type checks the Worker and the pages |
| `npm run teacher -- …` | Teacher accounts (below) |

## Teacher accounts

Teachers cannot sign themselves up. Create and manage accounts with the setup script:

```bash
npm run teacher -- create --email ana@school.ph --name "Ana Reyes" --class "Grade 4 - Sampaguita" --school "..."
npm run teacher -- reset-password --email ana@school.ph
npm run teacher -- add-class --email ana@school.ph --class "Grade 5 - Narra"
```

The password is asked for without showing it, or read from `TEACHER_PASSWORD`. The script writes
to local data unless you add `--remote` (production) or `--remote --env dev` (the development
namespace on Cloudflare). Teachers can also add and delete classes from the dashboard.

## Project layout

```
src/            The Worker: API routes and storage
  index.ts        Routing; every response gets the security headers
  teacher.ts      Teacher API: sign in, classes, students, quarters, grades, preview
  parent.ts       Parent API: code lookup, remembered phone, report
  gate.ts         Durable Object: sessions, access codes, class ownership
  store.ts        KV records, and checks on everything read back
  crypto.ts       Password hashing, signed tokens, access codes, IDs
  http.ts         Responses, cookies, Origin check, rate limits
  admin.ts        Builds records for new teachers and classes (script and API)
shared/grades.ts Grade calculation, used by the Worker and the pages
web/            The pages (React, Tailwind, shadcn/ui)
  parent/         Parent page
  teacher/        Teacher dashboard
  privacy/        Privacy notice (draft)
  components/     Shared pieces; ui/ holds the shadcn components
  lib/            API calls, theme, storage, formatting
index.html, teacher.html, privacy.html   Page entry points
public/         Copied as is: _headers (security headers), favicon, theme.js
scripts/teacher.mjs   Setup script for teacher accounts
test/           Tests
```

## Security rules worth knowing before changing code

These come from PLAN.md, "Rules that must hold", and the tests check most of them.

- The server decides what a parent sees: one child, and only quarters marked visible. Never send
  a whole class to the browser.
- Every teacher action checks the session, then that the teacher owns that class.
- Access codes never go in a web address, a log or a cookie. The parent's cookie holds a signed
  student ID and code version, so a new code signs out remembered phones at once.
- Database keys are built from generated IDs only, never from typed text, and everything read
  back from KV is checked before use.
- Wrong code guesses are limited with the Rate Limiting binding, not KV, so guessing cannot use
  up the free daily write limit.
- Every response sends `Cache-Control: no-store` and a strict content policy. No inline scripts
  and no third-party scripts or fonts: fonts and SheetJS are bundled and served from this site.

## Before the first deploy

Not done yet. See PLAN.md, Phase 1, and do not deploy real grades before Phase 0 approval.

1. Create the KV namespaces and put their IDs in `wrangler.jsonc`:
   ```bash
   npx wrangler kv namespace create DATA
   npx wrangler kv namespace create DATA --env dev
   ```
2. Set the parent token secret:
   ```bash
   npx wrangler secret put PARENT_SECRET
   ```
3. Build and deploy:
   ```bash
   npm run build
   npx wrangler deploy
   ```
4. Create the first teacher with `npm run teacher -- create … --remote`.

## Still open

- The grade formula in `shared/grades.ts` is a placeholder (a plain mean, rounded to one
  decimal). Replace it with the school's official formula once confirmed in writing, and add past
  report cards to `test/grades.test.ts`.
- The privacy notice wording needs the school head's approval.
- KV's free plan allows about 1,000 writes a day. Several full sections graded on the same day
  could get close; see PLAN.md, "Check the free limits".
