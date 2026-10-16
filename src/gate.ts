// One Durable Object holds sessions, access codes, and which classes each
// teacher owns. It is strongly consistent, so signing out, reissuing a code
// and adding a class take effect at once, unlike KV where a record can keep
// answering with its old value for about a minute.

import { DurableObject } from "cloudflare:workers";
import { newAccessCode, sha256Hex, randomToken } from "./crypto.ts";

export interface CodeHit { studentId: string; classId: string; version: number }

export class Gate extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, teacher_id TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS students (
        student_id TEXT PRIMARY KEY, class_id TEXT NOT NULL, code TEXT NOT NULL UNIQUE, version INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS classes (
        class_id TEXT PRIMARY KEY, teacher_id TEXT NOT NULL, added INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS removed_classes (
        class_id TEXT PRIMARY KEY, removed INTEGER NOT NULL);
    `);
  }

  // ---------- teacher sessions ----------

  async createSession(teacherId: string, ttlMs: number): Promise<string> {
    const now = Date.now();
    this.sql.exec("DELETE FROM sessions WHERE expires < ?", now);
    const token = randomToken(32);
    this.sql.exec("INSERT INTO sessions VALUES (?, ?, ?)", await sha256Hex(token), teacherId, now + ttlMs);
    return token;
  }

  async getSession(token: string): Promise<string | null> {
    const h = await sha256Hex(token);
    const row = this.sql.exec<{ teacher_id: string; expires: number }>(
      "SELECT teacher_id, expires FROM sessions WHERE token_hash = ?", h).toArray()[0];
    if (!row) return null;
    if (row.expires < Date.now()) {
      this.sql.exec("DELETE FROM sessions WHERE token_hash = ?", h);
      return null;
    }
    return row.teacher_id;
  }

  async endSession(token: string): Promise<void> {
    this.sql.exec("DELETE FROM sessions WHERE token_hash = ?", await sha256Hex(token));
  }

  async endAllSessions(teacherId: string): Promise<void> {
    this.sql.exec("DELETE FROM sessions WHERE teacher_id = ?", teacherId);
  }

  // ---------- classes ----------
  // Classes added from the dashboard. The first class, made by
  // scripts/teacher.mjs, is listed in the teacher's KV record instead.

  addClass(teacherId: string, classId: string): void {
    this.sql.exec("INSERT OR IGNORE INTO classes VALUES (?, ?, ?)", classId, teacherId, Date.now());
  }

  /** The teacher's classes: those in her KV record, then those added since, minus deleted ones. */
  classList(teacherId: string, fromKv: string[]): string[] {
    const added = this.sql.exec<{ class_id: string }>(
      "SELECT class_id FROM classes WHERE teacher_id = ? ORDER BY added", teacherId).toArray().map((r) => r.class_id);
    return [...new Set([...fromKv, ...added])].filter((id) => !this.isRemoved(id));
  }

  isRemoved(classId: string): boolean {
    return this.sql.exec("SELECT 1 FROM removed_classes WHERE class_id = ?", classId).toArray().length > 0;
  }

  /** Deletes a class here at once: it leaves the list and its access codes stop working. */
  removeClass(classId: string): void {
    this.sql.exec("INSERT OR IGNORE INTO removed_classes VALUES (?, ?)", classId, Date.now());
    this.sql.exec("DELETE FROM classes WHERE class_id = ?", classId);
    this.sql.exec("DELETE FROM students WHERE class_id = ?", classId);
  }

  // ---------- access codes ----------

  /** Gives a student a new code. The old one stops working at once. */
  issueCode(studentId: string, classId: string): { code: string; version: number } {
    const prev = this.sql.exec<{ version: number }>(
      "SELECT version FROM students WHERE student_id = ?", studentId).toArray()[0];
    const version = (prev?.version ?? 0) + 1;
    for (;;) {
      const code = newAccessCode();
      const taken = this.sql.exec("SELECT 1 FROM students WHERE code = ?", code).toArray().length > 0;
      if (taken) continue;
      this.sql.exec(
        `INSERT INTO students VALUES (?, ?, ?, ?)
         ON CONFLICT(student_id) DO UPDATE SET class_id = excluded.class_id, code = excluded.code, version = excluded.version`,
        studentId, classId, code, version);
      return { code, version };
    }
  }

  lookupCode(code: string): CodeHit | null {
    const row = this.sql.exec<{ student_id: string; class_id: string; version: number }>(
      "SELECT student_id, class_id, version FROM students WHERE code = ?", code).toArray()[0];
    return row ? { studentId: row.student_id, classId: row.class_id, version: row.version } : null;
  }

  currentVersion(studentId: string): number | null {
    const row = this.sql.exec<{ version: number }>(
      "SELECT version FROM students WHERE student_id = ?", studentId).toArray()[0];
    return row ? row.version : null;
  }

  codesForClass(classId: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const r of this.sql.exec<{ student_id: string; code: string }>(
      "SELECT student_id, code FROM students WHERE class_id = ?", classId)) out[r.student_id] = r.code;
    return out;
  }

  removeStudent(studentId: string): void {
    this.sql.exec("DELETE FROM students WHERE student_id = ?", studentId);
  }
}

export function gate(env: Env): DurableObjectStub<Gate> {
  return env.GATE.get(env.GATE.idFromName("school"));
}
