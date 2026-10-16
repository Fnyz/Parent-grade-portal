// Teacher routes. Every action checks the session, then that this teacher
// owns the class it touches.

import { gate } from "./gate.ts";
import { HttpError, allowAttempt, body, clearCookie, json, readCookie, setCookie, text } from "./http.ts";
import { newId, sha256Hex, verifyPassword } from "./crypto.ts";
import {
  type ClassRec, type GradeRec, type Teacher, HISTORY_LIMIT, deleteGrades, getClass, getGrades,
  getTeacher, getTeacherIdByEmailHash, isId, key, putClass, putGrades, sortTerms,
} from "./store.ts";
import { newClass } from "./admin.ts";
import { report } from "./parent.ts";
import { QUARTERS, isGrade } from "../shared/grades.ts";

export const SESSION_COOKIE = "pgp_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_STUDENTS = 80;
const MAX_SUBJECTS = 30;
const MAX_CLASSES = 12;

// ---------- sign in ----------

export async function login(req: Request, env: Env): Promise<Response> {
  await allowAttempt(req, env);
  const b = await body(req);
  const email = text(b.email, "Email", 254).toLowerCase();
  const password = typeof b.password === "string" ? b.password : "";
  const fail = new HttpError(401, "That email and password do not match.");
  const id = await getTeacherIdByEmailHash(env.DATA, await sha256Hex(email));
  const teacher = id ? await getTeacher(env.DATA, id) : null;
  if (!teacher || !password || !(await verifyPassword(password, teacher.pw))) throw fail;
  const token = await gate(env).createSession(teacher.id, SESSION_TTL_MS);
  return json({ ok: true }, 200, {
    "Set-Cookie": setCookie(SESSION_COOKIE, token, { maxAge: SESSION_TTL_MS / 1000 }),
  });
}

export async function logout(req: Request, env: Env): Promise<Response> {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await gate(env).endSession(token);
  return json({ ok: true }, 200, { "Set-Cookie": clearCookie(SESSION_COOKIE) });
}

async function signedIn(req: Request, env: Env): Promise<Teacher> {
  const token = readCookie(req, SESSION_COOKIE);
  const id = token ? await gate(env).getSession(token) : null;
  const teacher = id ? await getTeacher(env.DATA, id) : null;
  if (!teacher) throw new HttpError(401, "Please sign in.", "signed_out");
  return teacher;
}

// The class record says who owns it; the system sets teacherId and nothing
// typed can change it. Checking it there, rather than in the teacher's list,
// means a class added a moment ago works at once.
// A deleted class is refused at once, even while KV may still hold a copy.
async function ownedClass(env: Env, teacher: Teacher, classId: string): Promise<ClassRec> {
  const [c, removed] = await Promise.all([getClass(env.DATA, classId), gate(env).isRemoved(classId)]);
  if (!c || removed || c.teacherId !== teacher.id) throw new HttpError(404, "That class was not found.");
  return c;
}

/** Every class this teacher owns: the first from KV, later ones from the Durable Object. */
async function classIds(env: Env, teacher: Teacher): Promise<string[]> {
  return gate(env).classList(teacher.id, teacher.classes);
}

function findStudent(c: ClassRec, id: string) {
  const s = c.students.find((x) => x.id === id);
  if (!s) throw new HttpError(404, "That student was not found.");
  return s;
}
function findTerm(c: ClassRec, id: string) {
  const t = c.terms.find((x) => x.id === id);
  if (!t) throw new HttpError(404, "That quarter was not found.");
  return t;
}

async function classView(env: Env, c: ClassRec) {
  return { class: c, codes: await gate(env).codesForClass(c.id) };
}

// ---------- routes ----------

type Handler = (req: Request, env: Env, t: Teacher, p: string[]) => Promise<Response>;

const routes: [string, RegExp, Handler][] = [
  ["GET", /^\/api\/teacher\/me$/, async (_r, env, t) =>
    json({ name: t.name, email: t.email, classes: await classIds(env, t) })],

  // A teacher who advises several sections keeps each one as its own class.
  ["POST", /^\/api\/teacher\/classes$/, async (req, env, t) => {
    const b = await body(req);
    const name = text(b.name, "Class name", 80);
    const school = text(b.school, "School name", 120, false);
    const ids = await classIds(env, t);
    if (ids.length >= MAX_CLASSES) throw new HttpError(400, `One account can hold ${MAX_CLASSES} classes.`);
    const others = await Promise.all(ids.map((id) => getClass(env.DATA, id)));
    if (others.some((c) => c?.name.toLowerCase() === name.toLowerCase())) throw new HttpError(409, `You already have a class called ${name}.`);
    const c = newClass(t.id, name, school);
    await putClass(env.DATA, c);
    await gate(env).addClass(t.id, c.id);
    return json(await classView(env, c), 201);
  }],

  // Deletes a section with its students, grades and access codes. The last
  // class cannot be deleted, so the account always has somewhere to work.
  ["DELETE", /^\/api\/teacher\/class\/([^/]+)$/, async (_r, env, t, [cid]) => {
    const c = await ownedClass(env, t, cid);
    const ids = await classIds(env, t);
    if (ids.length <= 1) throw new HttpError(400, "Keep at least one class. Add another class before deleting this one.");
    await gate(env).removeClass(c.id);
    await Promise.all(c.students.flatMap((s) => c.terms.map((term) => deleteGrades(env.DATA, s.id, term.id))));
    await env.DATA.delete(key.cls(c.id));
    return json({ ok: true, classes: ids.filter((id) => id !== c.id) });
  }],

  ["GET", /^\/api\/teacher\/class\/([^/]+)$/, async (_r, env, t, [cid]) =>
    json(await classView(env, await ownedClass(env, t, cid)))],

  ["PUT", /^\/api\/teacher\/class\/([^/]+)$/, async (req, env, t, [cid]) => {
    const c = await ownedClass(env, t, cid);
    const b = await body(req);
    if (b.name !== undefined) c.name = text(b.name, "Class name", 80);
    if (b.school !== undefined) c.school = text(b.school, "School name", 120, false);
    if (b.pass !== undefined) {
      if (!isGrade(b.pass)) throw new HttpError(400, "The passing mark must be a number from 0 to 100.");
      c.pass = b.pass as number;
    }
    if (b.subjects !== undefined) {
      if (!Array.isArray(b.subjects) || !b.subjects.length) throw new HttpError(400, "Keep at least one subject.");
      if (b.subjects.length > MAX_SUBJECTS) throw new HttpError(400, `Use ${MAX_SUBJECTS} subjects or fewer.`);
      const seen = new Set<string>();
      c.subjects = b.subjects.map((s: unknown) => {
        const o = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
        const name = text(o.name, "Subject name", 60);
        if (seen.has(name.toLowerCase())) throw new HttpError(400, `${name} is listed twice.`);
        seen.add(name.toLowerCase());
        const id = isId(o.id) && c.subjects.some((x) => x.id === o.id) ? o.id : newId("sub");
        return { id, name };
      });
    }
    await putClass(env.DATA, c);
    return json(await classView(env, c));
  }],

  ["POST", /^\/api\/teacher\/class\/([^/]+)\/students$/, async (req, env, t, [cid]) => {
    const c = await ownedClass(env, t, cid);
    const b = await body(req);
    const rows = Array.isArray(b.students) ? b.students : [b];
    const g = gate(env);
    const added: string[] = [];
    for (const r of rows) {
      const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
      const name = text(o.name, "Name", 120);
      const no = text(o.no, "Student no.", 40, false);
      if (c.students.some((s) => s.name.toLowerCase() === name.toLowerCase())) continue;
      if (c.students.length >= MAX_STUDENTS) throw new HttpError(400, `A class can hold ${MAX_STUDENTS} students.`);
      const id = newId("stu");
      c.students.push({ id, name, no });
      await g.issueCode(id, c.id);
      added.push(id);
    }
    if (added.length) await putClass(env.DATA, c);
    return json({ ...(await classView(env, c)), added });
  }],

  ["PATCH", /^\/api\/teacher\/class\/([^/]+)\/students\/([^/]+)$/, async (req, env, t, [cid, sid]) => {
    const c = await ownedClass(env, t, cid);
    const s = findStudent(c, sid);
    const b = await body(req);
    if (b.name !== undefined) s.name = text(b.name, "Name", 120);
    if (b.no !== undefined) s.no = text(b.no, "Student no.", 40, false);
    await putClass(env.DATA, c);
    return json(await classView(env, c));
  }],

  ["DELETE", /^\/api\/teacher\/class\/([^/]+)\/students\/([^/]+)$/, async (_req, env, t, [cid, sid]) => {
    const c = await ownedClass(env, t, cid);
    findStudent(c, sid);
    c.students = c.students.filter((s) => s.id !== sid);
    await gate(env).removeStudent(sid);
    await putClass(env.DATA, c);
    await Promise.all(c.terms.map((term) => deleteGrades(env.DATA, sid, term.id)));
    return json(await classView(env, c));
  }],

  // Shows the teacher exactly what this student's family sees, built by the
  // same code as the parent page. Sets no parent cookie and needs no code.
  ["GET", /^\/api\/teacher\/class\/([^/]+)\/students\/([^/]+)\/preview$/, async (_req, env, t, [cid, sid]) => {
    const c = await ownedClass(env, t, cid);
    findStudent(c, sid);
    const data = await report(env, sid, c.id);
    if (!data) throw new HttpError(404, "That student was not found.");
    return json(data);
  }],

  ["POST", /^\/api\/teacher\/class\/([^/]+)\/students\/([^/]+)\/code$/, async (_req, env, t, [cid, sid]) => {
    const c = await ownedClass(env, t, cid);
    findStudent(c, sid);
    const { code } = await gate(env).issueCode(sid, c.id);
    return json({ code });
  }],

  ["POST", /^\/api\/teacher\/class\/([^/]+)\/terms$/, async (req, env, t, [cid]) => {
    const c = await ownedClass(env, t, cid);
    const b = await body(req);
    const year = text(b.year, "School year", 9);
    if (!/^\d{4}-\d{4}$/.test(year) || +year.slice(5) !== +year.slice(0, 4) + 1) {
      throw new HttpError(400, "Write the school year as 2026-2027.");
    }
    const label = text(b.label, "Quarter", 20);
    if (!QUARTERS.includes(label)) throw new HttpError(400, "Pick a quarter from the list.");
    if (c.terms.some((x) => x.year === year && x.label === label)) throw new HttpError(409, "That quarter already exists.");
    const { from, to } = dates(b.from, b.to);
    const term = { id: newId("trm"), year, label, from, to, visible: false };
    c.terms.push(term);
    sortTerms(c.terms);
    await putClass(env.DATA, c);
    return json({ ...(await classView(env, c)), added: term.id });
  }],

  ["PATCH", /^\/api\/teacher\/class\/([^/]+)\/terms\/([^/]+)$/, async (req, env, t, [cid, tid]) => {
    const c = await ownedClass(env, t, cid);
    const term = findTerm(c, tid);
    const b = await body(req);
    if (b.visible !== undefined) {
      if (typeof b.visible !== "boolean") throw new HttpError(400, "Visible must be true or false.");
      term.visible = b.visible;
    }
    if (b.from !== undefined || b.to !== undefined) Object.assign(term, dates(b.from ?? term.from, b.to ?? term.to));
    await putClass(env.DATA, c);
    return json(await classView(env, c));
  }],

  ["DELETE", /^\/api\/teacher\/class\/([^/]+)\/terms\/([^/]+)$/, async (_req, env, t, [cid, tid]) => {
    const c = await ownedClass(env, t, cid);
    findTerm(c, tid);
    if (c.terms.length === 1) throw new HttpError(400, "Keep at least one quarter.");
    c.terms = c.terms.filter((x) => x.id !== tid);
    await putClass(env.DATA, c);
    await Promise.all(c.students.map((s) => deleteGrades(env.DATA, s.id, tid)));
    return json(await classView(env, c));
  }],

  ["GET", /^\/api\/teacher\/class\/([^/]+)\/terms\/([^/]+)\/grades$/, async (_req, env, t, [cid, tid]) => {
    const c = await ownedClass(env, t, cid);
    findTerm(c, tid);
    const recs = await Promise.all(c.students.map((s) => getGrades(env.DATA, s.id, tid)));
    const grades: Record<string, Record<string, number>> = {};
    c.students.forEach((s, i) => { grades[s.id] = recs[i].v; });
    return json({ grades });
  }],

  // Writes only the students whose grades changed, one record each, to stay
  // inside the KV free plan's daily write limit.
  ["PUT", /^\/api\/teacher\/class\/([^/]+)\/terms\/([^/]+)\/grades$/, async (req, env, t, [cid, tid]) => {
    const c = await ownedClass(env, t, cid);
    findTerm(c, tid);
    const b = await body(req);
    const changes = b.changes && typeof b.changes === "object" && !Array.isArray(b.changes)
      ? (b.changes as Record<string, unknown>) : null;
    if (!changes) throw new HttpError(400, "No grades were sent.");
    const subjectIds = new Set(c.subjects.map((s) => s.id));
    const plan: [string, Record<string, number | null>][] = [];
    for (const [sid, row] of Object.entries(changes)) {
      findStudent(c, sid);
      if (!row || typeof row !== "object" || Array.isArray(row)) throw new HttpError(400, "The grades could not be read.");
      const clean: Record<string, number | null> = {};
      for (const [subId, v] of Object.entries(row as Record<string, unknown>)) {
        if (!subjectIds.has(subId)) throw new HttpError(400, "One of the subjects no longer exists. Reload the page.");
        if (v !== null && !isGrade(v)) throw new HttpError(400, "Grades must be numbers from 0 to 100.");
        clean[subId] = v as number | null;
      }
      plan.push([sid, clean]);
    }
    const now = Date.now();
    let written = 0;
    await Promise.all(plan.map(async ([sid, row]) => {
      const rec: GradeRec = await getGrades(env.DATA, sid, tid);
      let changed = false;
      for (const [subId, to] of Object.entries(row)) {
        const from = rec.v[subId] ?? null;
        if (from === to) continue;
        if (to === null) delete rec.v[subId]; else rec.v[subId] = to;
        rec.hist.push({ s: subId, from, to, at: now });
        changed = true;
      }
      if (!changed) return;
      rec.hist = rec.hist.slice(-HISTORY_LIMIT);
      await putGrades(env.DATA, sid, tid, rec);
      written++;
    }));
    return json({ ok: true, written });
  }],
];

function dates(fromV: unknown, toV: unknown): { from: string; to: string } {
  const d = (v: unknown, field: string) => {
    const s = text(v ?? "", field, 10, false);
    if (s && (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s)))) throw new HttpError(400, `${field} is not a valid date.`);
    return s;
  };
  const from = d(fromV, "Start date"), to = d(toV, "End date");
  if (from && to && from > to) throw new HttpError(400, "The end date is before the start date.");
  return { from, to };
}

export async function teacherRoute(req: Request, env: Env, url: URL): Promise<Response> {
  for (const [method, re, handler] of routes) {
    const m = url.pathname.match(re);
    if (!m) continue;
    if (req.method !== method) continue;
    const teacher = await signedIn(req, env);
    return handler(req, env, teacher, m.slice(1).map(decodeURIComponent));
  }
  throw new HttpError(404, "Not found.");
}
