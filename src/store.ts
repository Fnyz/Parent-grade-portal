// KV records. Keys are built from generated IDs only. Everything read back is
// checked before use: the prototype broke on numbers stored as text, lists
// returned as objects, and missing fields.

import type { PasswordRecord } from "./crypto.ts";
import { QUARTERS, isGrade } from "../shared/grades.ts";

export interface Teacher {
  id: string;
  email: string;
  name: string;
  pw: PasswordRecord;
  classes: string[];
}

export interface Subject { id: string; name: string }
export interface Student { id: string; name: string; no: string }
export interface Term {
  id: string;
  year: string;
  label: string;
  from: string;
  to: string;
  visible: boolean;
}
export interface ClassRec {
  id: string;
  teacherId: string;
  name: string;
  school: string;
  pass: number;
  subjects: Subject[];
  terms: Term[];
  students: Student[];
}
export interface GradeChange { s: string; from: number | null; to: number | null; at: number }
export interface GradeRec { v: Record<string, number>; hist: GradeChange[] }

export const HISTORY_LIMIT = 100;

export const key = {
  login: (emailHash: string) => `login:${emailHash}`,
  teacher: (id: string) => `teacher:${id}`,
  cls: (id: string) => `class:${id}`,
  grades: (studentId: string, termId: string) => `grades:${studentId}:${termId}`,
};

// ---------- checks ----------

const ID = /^[a-z]+_[a-z0-9]{6,32}$/;
export const isId = (x: unknown): x is string => typeof x === "string" && ID.test(x);

function list(x: unknown): unknown[] {
  if (Array.isArray(x)) return x;
  if (x && typeof x === "object") return Object.values(x);
  return [];
}
function str(x: unknown, max = 200): string {
  return typeof x === "string" ? x.slice(0, max) : typeof x === "number" ? String(x).slice(0, max) : "";
}
function obj(x: unknown): Record<string, unknown> | null {
  return x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}
function num(x: unknown): number | null {
  const n = typeof x === "number" ? x : typeof x === "string" && x.trim() !== "" ? Number(x) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function checkTeacher(raw: unknown): Teacher | null {
  const o = obj(raw);
  const pw = obj(o?.pw);
  if (!o || !isId(o.id) || !pw) return null;
  const iter = num(pw.iter);
  if (typeof pw.salt !== "string" || typeof pw.hash !== "string" || !iter) return null;
  return {
    id: o.id,
    email: str(o.email, 254),
    name: str(o.name, 120),
    pw: { salt: pw.salt, hash: pw.hash, iter },
    classes: list(o.classes).filter(isId),
  };
}

export function checkClass(raw: unknown): ClassRec | null {
  const o = obj(raw);
  if (!o || !isId(o.id) || !isId(o.teacherId)) return null;
  const pass = num(o.pass);
  const subjects = list(o.subjects).map(obj).filter((s): s is Record<string, unknown> => !!s && isId(s.id) && !!str(s.name))
    .map((s) => ({ id: s.id as string, name: str(s.name, 60) }));
  const students = list(o.students).map(obj).filter((s): s is Record<string, unknown> => !!s && isId(s.id) && !!str(s.name))
    .map((s) => ({ id: s.id as string, name: str(s.name, 120), no: str(s.no, 40) }));
  const terms = list(o.terms).map(obj).filter((t): t is Record<string, unknown> => !!t && isId(t.id) && QUARTERS.includes(str(t.label)))
    .map((t) => ({
      id: t.id as string,
      year: str(t.year, 9),
      label: str(t.label),
      from: str(t.from, 10),
      to: str(t.to, 10),
      visible: t.visible === true,
    }));
  sortTerms(terms);
  return {
    id: o.id,
    teacherId: o.teacherId,
    name: str(o.name, 80),
    school: str(o.school, 120),
    pass: pass !== null && pass >= 0 && pass <= 100 ? pass : 75,
    subjects,
    terms,
    students,
  };
}

export function checkGrades(raw: unknown): GradeRec {
  const o = obj(raw);
  const v: Record<string, number> = {};
  const vo = obj(o?.v);
  if (vo) for (const [k, x] of Object.entries(vo)) {
    const n = num(x);
    if (isId(k) && n !== null && isGrade(n)) v[k] = n;
  }
  const hist = list(o?.hist).map(obj).filter((h): h is Record<string, unknown> => !!h && isId(h.s))
    .map((h) => ({ s: h.s as string, from: num(h.from), to: num(h.to), at: num(h.at) ?? 0 }))
    .slice(-HISTORY_LIMIT);
  return { v, hist };
}

export function sortTerms(terms: Term[]): void {
  terms.sort((a, b) => (a.year === b.year ? QUARTERS.indexOf(a.label) - QUARTERS.indexOf(b.label) : a.year < b.year ? -1 : 1));
}

// ---------- reads and writes ----------

async function getJson(kv: KVNamespace, k: string): Promise<unknown> {
  const raw = await kv.get(k);
  if (raw === null) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function getTeacher(kv: KVNamespace, id: string): Promise<Teacher | null> {
  return checkTeacher(await getJson(kv, key.teacher(id)));
}
export async function getTeacherIdByEmailHash(kv: KVNamespace, h: string): Promise<string | null> {
  const id = await kv.get(key.login(h));
  return isId(id) ? id : null;
}
export async function getClass(kv: KVNamespace, id: string): Promise<ClassRec | null> {
  return isId(id) ? checkClass(await getJson(kv, key.cls(id))) : null;
}
export async function putClass(kv: KVNamespace, c: ClassRec): Promise<void> {
  await kv.put(key.cls(c.id), JSON.stringify(c));
}
export async function getGrades(kv: KVNamespace, studentId: string, termId: string): Promise<GradeRec> {
  return checkGrades(await getJson(kv, key.grades(studentId, termId)));
}
export async function putGrades(kv: KVNamespace, studentId: string, termId: string, g: GradeRec): Promise<void> {
  await kv.put(key.grades(studentId, termId), JSON.stringify(g));
}
export async function deleteGrades(kv: KVNamespace, studentId: string, termId: string): Promise<void> {
  await kv.delete(key.grades(studentId, termId));
}
