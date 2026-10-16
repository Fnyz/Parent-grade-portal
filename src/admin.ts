// Builds the KV records for a new teacher, her first class, and any later
// classes. Used by
// scripts/teacher.mjs (written with Wrangler) and by the tests.

import { hashPassword, newId, sha256Hex } from "./crypto.ts";
import { type ClassRec, type Teacher, key } from "./store.ts";

export const DEFAULT_SUBJECTS = ["Filipino", "English", "Mathematics", "Science", "Araling Panlipunan", "MAPEH", "ESP"];
export const MIN_PASSWORD = 10;

export interface KvEntry { key: string; value: string }

export async function newTeacherRecords(opts: {
  email: string; name: string; password: string; className: string; school?: string;
}): Promise<{ teacher: Teacher; cls: ClassRec; entries: KvEntry[] }> {
  if (opts.password.length < MIN_PASSWORD) throw new Error(`Use a password of at least ${MIN_PASSWORD} characters.`);
  const email = opts.email.trim().toLowerCase();
  const teacher: Teacher = {
    id: newId("tch"),
    email,
    name: opts.name.trim(),
    pw: await hashPassword(opts.password),
    classes: [],
  };
  const cls = newClass(teacher.id, opts.className, opts.school);
  teacher.classes.push(cls.id);
  return {
    teacher,
    cls,
    entries: [
      { key: key.login(await sha256Hex(email)), value: teacher.id },
      { key: key.teacher(teacher.id), value: JSON.stringify(teacher) },
      { key: key.cls(cls.id), value: JSON.stringify(cls) },
    ],
  };
}

/** A new, empty class with the default subjects. */
export function newClass(teacherId: string, name: string, school = ""): ClassRec {
  return {
    id: newId("cls"),
    teacherId,
    name: name.trim(),
    school: school.trim(),
    pass: 75,
    subjects: DEFAULT_SUBJECTS.map((n) => ({ id: newId("sub"), name: n })),
    terms: [],
    students: [],
  };
}

/** Records that give an existing teacher one more class. */
export function addClassRecords(teacher: Teacher, name: string, school = ""): { cls: ClassRec; entries: KvEntry[] } {
  if (!name.trim()) throw new Error("Give the class a name.");
  const cls = newClass(teacher.id, name, school);
  return {
    cls,
    entries: [
      { key: key.cls(cls.id), value: JSON.stringify(cls) },
      { key: key.teacher(teacher.id), value: JSON.stringify({ ...teacher, classes: [...teacher.classes, cls.id] }) },
    ],
  };
}

export async function withNewPassword(teacher: Teacher, password: string): Promise<KvEntry> {
  if (password.length < MIN_PASSWORD) throw new Error(`Use a password of at least ${MIN_PASSWORD} characters.`);
  return { key: key.teacher(teacher.id), value: JSON.stringify({ ...teacher, pw: await hashPassword(password) }) };
}
