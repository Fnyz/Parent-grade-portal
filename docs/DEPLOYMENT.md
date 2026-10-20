# Deployment guide

How this project went from nothing to live on Cloudflare, and how to look after it afterwards.
Follow it in order to set the project up again on a new account, or hand it to the backup person.

The secrets are not in this file, by design: the Cloudflare API token and the two `PARENT_SECRET`
values live only in Cloudflare and GitHub.

## What we set up

| Item | Value |
| --- | --- |
| Cloudflare account | `Jezbusico@gmail.com's Account` |
| Account ID (not secret) | `e429264ccc1a6c17935d561937bade77` |
| `workers.dev` subdomain | `reportcard-ph` |
| Production Worker | `grades`, at https://grades.reportcard-ph.workers.dev |
| Dev Worker (fake data) | `grades-dev`, at https://grades-dev.reportcard-ph.workers.dev |
| Production KV namespace `DATA` | `55da82290c1945abb2604cf3f48e93ac` |
| Dev KV namespace `dev-DATA` | `95e04d2fbc6c4177966c264cd65eace6` |
| GitHub repository | https://github.com/Fnyz/Parent-grade-portal (public) |
| GitHub environments | `dev` (no approval), `production` (approval by Fnyz) |
| API token | `github-deploy-grades`, Edit Cloudflare Workers template, expires 2027-10-20 |

How a change reaches the live site:

```
push to main
  -> check: type check, tests, build
  -> deploy to dev (grades-dev)          automatic
  -> smoke test the live dev site        a failure stops here: production is never offered
  -> deploy to production (grades)       waits for your approval in GitHub
  -> smoke test the live production site
```

The smoke test (`scripts/smoke.mjs`) visits the live site and checks that the new version is
being served, the pages load, the security headers are there, and the API refuses signed-out
visitors, wrong codes and requests from other sites. It is read-only: it never signs in or writes
data.

Everything is on the free plans of Cloudflare and GitHub.

---

## Part 1: Cloudflare

### 1. Create the account

1. Sign up at https://dash.cloudflare.com/sign-up and verify the email.
2. Turn on two-factor authentication: profile icon (top right) > My Profile > Authentication.

> The plan recommends a school email so the school keeps access if the developer leaves. This
> account uses a personal Gmail. To fix that later, add a school email under
> **Manage account > Members** and give it admin rights.

### 2. Choose the `workers.dev` subdomain

Cloudflare gives every account a subdomain automatically (ours started as `jezbusico`). We changed
it to something not tied to a person or a school: **Compute > Workers & Pages**, then the
subdomain setting, and changed it to `reportcard-ph`. It is free.

- It covers the whole account: every Worker moves to the new name.
- The old address stops working with no redirect, so change it **before** handing out slips.
- The name must be unique across Cloudflare; lowercase letters, numbers and hyphens.

### 3. Name the Workers

Each address is `<worker name>.<subdomain>.workers.dev`. We shortened the Worker names in
`wrangler.jsonc` so parents have less to type:

```jsonc
"name": "grades",          // production, top of the file
...
"env": { "dev": { "name": "grades-dev", ... } }
```

Do this before step 5: secrets are attached to a Worker by its name.

### 4. Log Wrangler in on the computer

In the project folder (the prompt ends with `parent-grade-portal %`):

```bash
npx wrangler login     # a browser opens; click Allow
npx wrangler whoami    # shows the email and the Account ID
```

### 5. Create the two KV namespaces

```bash
npx wrangler kv namespace create DATA
npx wrangler kv namespace create DATA --env dev
```

Each prints an `id`. Wrangler offers to add it to `wrangler.jsonc` for you; we said yes.

What to check afterwards:

- The placeholders `REPLACE_WITH_PRODUCTION_KV_ID` and `REPLACE_WITH_DEV_KV_ID` are gone.
- Wrangler reformats the whole file when it edits it. That is layout only.
- If you answer **yes** to "connect to the remote resource instead of a local resource", it adds
  `"remote": true` to that binding. We removed it: with it, running the dev environment locally
  reads and writes the **real** dev data on Cloudflare.

### 6. Set `PARENT_SECRET` for each Worker

It signs the cookie that remembers a parent's phone. Use a different random value for each.

```bash
openssl rand -base64 48                          # copy the line it prints
npx wrangler secret put PARENT_SECRET            # production
openssl rand -base64 48                          # a NEW value
npx wrangler secret put PARENT_SECRET --env dev  # dev
```

- "There doesn't seem to be a Worker called grades. Do you want to create it?" answer **Y**.
  This creates an empty Worker that the first deploy fills in.
- The pasted value does not show on screen. That is normal.
- Check, names only, never values:
  ```bash
  npx wrangler secret list
  npx wrangler secret list --env dev
  ```
- No need to keep the values. If one is lost or leaks, set a new one; the only effect is that
  remembered phones must type their code again.

### 7. Create the API token for GitHub

1. **Manage account > Account API tokens > Create Token.** An account token belongs to the
   account, not a person, so deploys keep working if someone else takes over.
2. Choose the **Edit Cloudflare Workers** template. Not "Full account and zone access" or
   "Write all resources": far too much if the token leaked.
3. Account resources: your account. Zone resources: all zones from your account (the template
   asks; we use no zones).
4. Expiration: **1 year**. Put a reminder in the calendar about a month before.
5. **Create token**, copy it once, paste it straight into GitHub (part 2). Never into a chat,
   a file or a commit.

---

## Part 2: GitHub

### 8. Environments and secrets

**Settings > Environments**:

1. **New environment** `dev`. Under **Environment secrets** add:
   - `CLOUDFLARE_API_TOKEN`: the token from step 7
   - `CLOUDFLARE_ACCOUNT_ID`: `e429264ccc1a6c17935d561937bade77`
2. **New environment** `production`:
   - Tick **Required reviewers**, add **Fnyz**, and click **Save protection rules**. Easy to
     miss; without it, production deploys without asking.
   - The same two secrets, same values.

Names must match exactly: `dev`, `production`, and the secret names in capitals with underscores.

On the free plan, required reviewers only work on **public** repositories. This one is public:
anyone can read the code and docs, but not the secrets.

### 9. The workflows

Already in the repository:

- `.github/workflows/ci.yml`: type check, tests and build on every pull request and every push to
  a branch other than `main`.
- `.github/workflows/deploy.yml`: on push to `main`, the same checks, then dev and its smoke test,
  then production after approval and its smoke test. It stops with a clear error if
  `wrangler.jsonc` still has KV placeholders. Each run links to the site it deployed.

They use `npx wrangler deploy` with the two secrets, and actions pinned to exact commits.

---

## Part 3: First deploy

### 10. Commit and push

```bash
git add .github wrangler.jsonc README.md PROGRESS.md
git commit -m "Add CI/CD and Cloudflare deploy config"
git push origin main
```

In VS Code's commit box, type only the message, not the `git commit -m` command.

### 11. Watch it and approve production

1. GitHub > **Actions** > the newest **Deploy** run.
2. **check / Type check, test, build** (about 30 s), then **Deploy to dev** (about 20 s).
3. **Deploy to production** pauses with "Fnyz requested your review". Click
   **Review deployments**, tick **production**, **Approve and deploy**.

Our first run (2026-10-20, commit `06e6ea1`): checks passed (65 tests, 1 skipped on purpose), dev
deployed in 19 seconds, production waited for approval and was then approved. Both sites passed
every smoke check.

### 12. Check the live sites

Open https://grades-dev.reportcard-ph.workers.dev and https://grades.reportcard-ph.workers.dev:
both show the parent code screen. The pipeline now runs the smoke test after every deploy; to run
it yourself:

```bash
npm run smoke -- https://grades.reportcard-ph.workers.dev
```

Or by hand with `curl`:

```bash
B=https://grades.reportcard-ph.workers.dev
curl -sI $B/ | grep -i content-security             # the security headers are there
curl -s $B/api/teacher/me                           # {"error":"Please sign in.",...}
curl -s -X POST -H "Content-Type: application/json" -H "Origin: $B" \
  -d '{"code":"ABCDE-FGHJK"}' $B/api/parent/lookup  # "That code does not match..."
```

The last one also proves the Durable Object and the rate limiter work on Cloudflare.

### 13. Create the teacher accounts

Teachers cannot sign up themselves. From the project folder:

```bash
# dev, for testing with fake data
npm run teacher -- create --email you@school.ph --name "Your Name" --class "Grade 4 - Sampaguita" --remote --env dev

# production, for the real adviser
npm run teacher -- create --email adviser@school.ph --name "Adviser Name" --class "Grade 4 - Sampaguita" --school "School name" --remote
```

The password is typed without showing. Then sign in at `/teacher` on that site.

> No real grades go into production until the school head approves in writing
> (PLAN.md, Phase 0).

---

## Day to day

### Ship a change

Push to `main` (or merge a pull request into it), then approve production in the Actions tab.
To check first without deploying:

```bash
npm run typecheck && npm test && npm run build
CLOUDFLARE_ENV=dev npm run build && npx wrangler deploy --dry-run   # what dev would get
```

Build first, then dry-run with no `--env`: the build already chose the environment. Running
`npx wrangler deploy --dry-run --env dev` on its own fails with
"The `assets` property ... is missing the required `directory` property".

### Redeploy without a code change

Actions > **Deploy** > **Run workflow** > branch `main`.

### Roll back a bad deploy

```bash
npx wrangler deployments list              # recent versions of production
npx wrangler rollback                      # back to the previous version
npx wrangler rollback --env dev            # the same for dev
```

Rolling back changes the code only; the data in KV stays as it is. Then fix the problem and push
again.

### Replace the API token (yearly, or if it leaks)

1. Cloudflare: Account API tokens > create a new one the same way (step 7).
2. GitHub: in **both** environments, edit `CLOUDFLARE_API_TOKEN` and paste the new one.
3. Cloudflare: delete the old token.

When it expires without being replaced, deploys fail with an authentication error.

### Reset a teacher's password

```bash
npm run teacher -- reset-password --email adviser@school.ph --remote
```

Devices already signed in stay signed in until their session ends (12 hours at most).

---

## Problems we hit

| Symptom | Cause | Fix |
| --- | --- | --- |
| `assets ... missing the required directory property` | Dry-run on the source config | Build first, then `npx wrangler deploy --dry-run` |
| Dev binding had `"remote": true` | Answered yes to "connect to remote resource" | Removed it from `wrangler.jsonc` |
| `Worker "grades-dev" (env: dev) not found` | Dev secret not set yet | `npx wrangler secret put PARENT_SECRET --env dev`, answer Y |
| Production had no approval rule | **Save protection rules** not clicked | Tick Required reviewers again and save |
| `gh` cannot list secrets (403) | The `gh` login is another account (FDC-Jez-NC-Web) | Check secrets in the browser as Fnyz; pushes use SSH and are fine |
| Commit message was the whole `git commit -m ...` line | Command pasted into VS Code's commit box | Type only the message next time |
| "ubuntu-latest will migrate to Ubuntu 26" notice | GitHub updating its runners | Nothing to do |
