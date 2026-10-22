#!/usr/bin/env node
// Creates the teacher account and resets a teacher's password, by writing KV
// records with Wrangler. Writes to local development data unless --remote is
// given, so trying it out can never touch real grades.
//
//   npm run teacher -- create --email ana@school.ph --name "Ana Reyes" --class "Grade 4 - Sampaguita" --school "..."
//   npm run teacher -- reset-password --email ana@school.ph
//   npm run teacher -- add-class --email ana@school.ph --class "Grade 5 - Narra" [--school "..."]
//   add --remote to write to Cloudflare, and --env dev for the development namespace
//
// The password is asked for without echoing, or read from TEACHER_PASSWORD.
// Needs Node 22.18 or later, which runs the shared .ts files directly.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { MIN_PASSWORD, addClassRecords, newTeacherRecords, withNewPassword } from "../src/admin.ts";
import { sha256Hex } from "../src/crypto.ts";
import { checkTeacher, key } from "../src/store.ts";

const USAGE = `Usage:
  npm run teacher -- create --email <email> --name <name> --class <class name> [--school <school>] [--remote] [--env dev]
  npm run teacher -- reset-password --email <email> [--remote] [--env dev]
  npm run teacher -- add-class --email <email> --class <class name> [--school <school>] [--remote] [--env dev]`;

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    email: { type: "string" },
    name: { type: "string" },
    class: { type: "string" },
    school: { type: "string" },
    remote: { type: "boolean", default: false },
    env: { type: "string" },
  },
});

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function wrangler(args) {
  const where = [opt.remote ? "--remote" : "--local", ...(opt.env ? ["--env", opt.env] : [])];
  return execFileSync("npx", ["wrangler", ...args, "--binding", "DATA", ...where], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

// A missing key reads as "Value not found" locally, but on Cloudflare Wrangler
// exits with a 404 error instead. Both mean the key does not exist.
function kvGet(k) {
  let out;
  try {
    out = wrangler(["kv", "key", "get", k, "--text"]).trim();
  } catch (e) {
    const msg = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    if (/404: Not Found|key not found|Value not found/i.test(msg)) return null;
    throw e;
  }
  return out === "" || out === "Value not found" ? null : out;
}

function kvPutAll(entries) {
  const dir = mkdtempSync(join(tmpdir(), "pgp-"));
  const file = join(dir, "entries.json");
  try {
    writeFileSync(file, JSON.stringify(entries), { mode: 0o600 });
    wrangler(["kv", "bulk", "put", file]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function askPassword() {
  if (process.env.TEACHER_PASSWORD) return process.env.TEACHER_PASSWORD;
  if (!process.stdin.isTTY) fail("Set TEACHER_PASSWORD, or run this in a terminal to type it.");
  const read = (prompt) => new Promise((resolve) => {
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    let s = "";
    const onData = (buf) => {
      for (const ch of buf.toString("utf8")) {
        if (ch === "\r" || ch === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(s);
        }
        if (ch === "\u0003") { process.stdout.write("\n"); process.exit(130); }
        if (ch === "\u007f") s = s.slice(0, -1); else s += ch;
      }
    };
    process.stdin.on("data", onData);
  });
  const a = await read(`Password (at least ${MIN_PASSWORD} characters): `);
  const b = await read("Type it again: ");
  if (a !== b) fail("The two passwords do not match.");
  return a;
}

function target() {
  return opt.remote ? `Cloudflare${opt.env ? ` (${opt.env})` : " (production)"}` : "local development data";
}

async function create() {
  if (!opt.email || !opt.name || !opt.class) fail(USAGE);
  const email = opt.email.trim().toLowerCase();
  if (kvGet(key.login(await sha256Hex(email)))) fail(`A teacher with ${email} already exists. Use reset-password instead.`);
  const password = await askPassword();
  const { teacher, cls, entries } = await newTeacherRecords({
    email, name: opt.name, password, className: opt.class, school: opt.school,
  });
  kvPutAll(entries);
  console.log(`Created ${teacher.name} <${teacher.email}> with class "${cls.name}" in ${target()}.`);
}

async function findTeacher() {
  if (!opt.email) fail(USAGE);
  const email = opt.email.trim().toLowerCase();
  const id = kvGet(key.login(await sha256Hex(email)));
  const raw = id ? kvGet(key.teacher(id)) : null;
  let teacher = null;
  try { teacher = raw ? checkTeacher(JSON.parse(raw)) : null; } catch { /* reported below */ }
  if (!teacher) fail(`No teacher with ${email} in ${target()}.`);
  return teacher;
}

async function resetPassword() {
  const teacher = await findTeacher();
  const password = await askPassword();
  kvPutAll([await withNewPassword(teacher, password)]);
  console.log(`Password reset for ${teacher.email} in ${target()}.`);
  console.log("Anyone already signed in on another device stays signed in until their session ends (12 hours at most).");
}

// Teachers can also add classes themselves with New class on the dashboard.
async function addClass() {
  if (!opt.class) fail(USAGE);
  const teacher = await findTeacher();
  const { cls, entries } = addClassRecords(teacher, opt.class, opt.school);
  kvPutAll(entries);
  console.log(`Added class "${cls.name}" for ${teacher.email} in ${target()}.`);
}

const commands = { create, "reset-password": resetPassword, "add-class": addClass };
const run = commands[positionals[0]];
if (!run) fail(USAGE);
try {
  await run();
} catch (e) {
  fail(e instanceof Error ? (e.stderr?.toString().trim() || e.message) : String(e));
}
