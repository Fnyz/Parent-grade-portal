// Parent routes. The server decides what a parent sees: one child, and only
// the quarters the teacher has released. The browser never receives the class.

import { gate } from "./gate.ts";
import { HttpError, allowAttempt, body, clearCookie, json, readCookie, setCookie } from "./http.ts";
import { normaliseCode, readToken, signToken } from "./crypto.ts";
import { getClass, getGrades, isId } from "./store.ts";
import { quarterAverage } from "../shared/grades.ts";

export const PARENT_COOKIE = "pgp_parent";
const REMEMBER_SECONDS = 300 * 24 * 60 * 60; // about one school year
const VISIT_MS = 12 * 60 * 60 * 1000;
const NO_MATCH = "That code does not match. Check the slip and try again.";

interface ParentToken { s: string; c: string; v: number; e: number }

function asToken(x: unknown): ParentToken | null {
  const o = x as Record<string, unknown> | null;
  if (!o || !isId(o.s) || !isId(o.c) || typeof o.v !== "number" || typeof o.e !== "number") return null;
  return { s: o.s, c: o.c, v: o.v, e: o.e };
}

/** What one family sees. Also used by the teacher's preview, so both always match. */
export async function report(env: Env, studentId: string, classId: string) {
  const c = await getClass(env.DATA, classId);
  const student = c?.students.find((s) => s.id === studentId);
  if (!c || !student) return null;
  const all = await Promise.all(c.terms.map(async (t) => ({ t, g: await getGrades(env.DATA, studentId, t.id) })));
  const withGrades = all.filter(({ g }) => Object.keys(g.v).length > 0);
  const shown = withGrades.filter(({ t }) => t.visible);
  return {
    student: { name: student.name },
    class: { name: c.name, school: c.school, pass: c.pass },
    terms: shown.map(({ t, g }) => {
      const grades = c.subjects.map((s) => ({ subject: s.name, grade: g.v[s.id] ?? null }));
      return {
        id: t.id, year: t.year, label: t.label, from: t.from, to: t.to,
        grades,
        average: quarterAverage(grades.map((x) => x.grade)),
      };
    }),
    held: withGrades.length - shown.length,
  };
}

export async function lookup(req: Request, env: Env): Promise<Response> {
  await allowAttempt(req, env);
  const b = await body(req);
  const code = normaliseCode(b.code);
  const hit = code ? await gate(env).lookupCode(code) : null;
  if (!hit) throw new HttpError(404, NO_MATCH, "no_match");
  const data = await report(env, hit.studentId, hit.classId);
  if (!data) throw new HttpError(404, NO_MATCH, "no_match");
  const remember = b.remember === true;
  const exp = Date.now() + (remember ? REMEMBER_SECONDS * 1000 : VISIT_MS);
  const token = await signToken(env.PARENT_SECRET, { s: hit.studentId, c: hit.classId, v: hit.version, e: exp });
  return json(data, 200, {
    "Set-Cookie": setCookie(PARENT_COOKIE, token, { sameSite: "Strict", maxAge: remember ? REMEMBER_SECONDS : undefined }),
  });
}

export async function current(req: Request, env: Env): Promise<Response> {
  const raw = readCookie(req, PARENT_COOKIE);
  const tok = raw ? asToken(await readToken(env.PARENT_SECRET, raw)) : null;
  const signedOut = (msg: string, code: string) =>
    json({ error: msg, code }, 401, { "Set-Cookie": clearCookie(PARENT_COOKIE) });
  if (!tok || tok.e < Date.now()) return signedOut("Type your access code.", "signed_out");
  const version = await gate(env).currentVersion(tok.s);
  // No code at all: the student or the whole class was removed.
  if (version === null) return signedOut("Type your access code.", "signed_out");
  if (version !== tok.v) {
    return signedOut("This phone was signed out because the access code was replaced. Type the new code from the adviser.", "replaced");
  }
  const data = await report(env, tok.s, tok.c);
  if (!data) return signedOut("Type your access code.", "signed_out");
  return json(data);
}

export async function forget(): Promise<Response> {
  return json({ ok: true }, 200, { "Set-Cookie": clearCookie(PARENT_COOKIE) });
}
