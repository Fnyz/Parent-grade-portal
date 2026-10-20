#!/usr/bin/env node
// Smoke test for a deployed site: the pages load, the security headers are
// there, and the API answers the way it should when nobody is signed in.
// Read-only: it never signs in, never writes data, and sends one wrong code
// (well under the guess limit).
//
//   npm run smoke -- https://grades-dev.reportcard-ph.workers.dev
//   npm run smoke -- <url> --expect-html dist/client/index.html
//
// --expect-html waits (up to about a minute) until the live page matches the
// one just built, so the checks run against the new version, not the old one.

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: { "expect-html": { type: "string" } },
});
const base = (positionals[0] ?? "").replace(/\/+$/, "");
if (!/^https?:\/\//.test(base)) {
  console.error("Usage: npm run smoke -- <site url> [--expect-html dist/client/index.html]");
  process.exit(2);
}

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${!ok && detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
}
const get = (path, init) => fetch(base + path, { redirect: "manual", ...init });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The pages' script names change with every build, so matching them proves
// the new version is the one being served.
const scripts = (html) => [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]).sort().join(" ");

if (opt["expect-html"]) {
  const want = scripts(readFileSync(opt["expect-html"], "utf8"));
  let got = "";
  for (let i = 0; i < 12; i++) {
    try { got = scripts(await (await get("/")).text()); } catch { got = ""; }
    if (got === want) break;
    await sleep(5000);
  }
  check("the new version is live", got === want, `expected ${want}, got ${got || "nothing"}`);
}

// Pages
for (const [path, type] of [["/", "text/html"], ["/teacher", "text/html"], ["/privacy", "text/html"], ["/theme.js", "javascript"]]) {
  const r = await get(path);
  check(`GET ${path} loads`, r.status === 200 && (r.headers.get("content-type") ?? "").includes(type),
    `${r.status} ${r.headers.get("content-type")}`);
}

// Security headers on a page
{
  const r = await get("/");
  const csp = r.headers.get("content-security-policy") ?? "";
  check("pages are never cached", r.headers.get("cache-control") === "no-store", r.headers.get("cache-control") ?? "missing");
  check("pages allow scripts from this site only", /script-src 'self'(;|$)/.test(csp), csp || "missing");
  check("pages cannot be framed", csp.includes("frame-ancestors 'none'"), csp || "missing");
  check("HTTPS is enforced", (r.headers.get("strict-transport-security") ?? "").includes("max-age="), "missing");
}

// API, signed out
async function api(name, path, init, status, code) {
  const r = await get(path, init);
  let body = null;
  try { body = await r.json(); } catch { /* not JSON */ }
  check(name, r.status === status && (!code || body?.code === code), `${r.status} ${JSON.stringify(body)}`);
  return r;
}
const me = await api("teacher API refuses a signed-out visitor", "/api/teacher/me", {}, 401, "signed_out");
check("API responses are never cached", me.headers.get("cache-control") === "no-store", me.headers.get("cache-control") ?? "missing");
await api("parent report needs a code first", "/api/parent/report", {}, 401, "signed_out");
await api("a wrong code is refused", "/api/parent/lookup", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: base },
  body: JSON.stringify({ code: "ABCDE-FGHJK" }),
}, 404, "no_match");
await api("a request from another site is refused", "/api/parent/lookup", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "https://example.com" },
  body: JSON.stringify({ code: "ABCDE-FGHJK" }),
}, 403);
await api("an unknown API path is 404", "/api/nope", {}, 404);

console.log(failed ? `\n${failed} check(s) failed on ${base}` : `\nAll checks passed on ${base}`);
process.exit(failed ? 1 : 0);
