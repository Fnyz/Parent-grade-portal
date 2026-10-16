// Shared setup for the API tests: a teacher in KV, a signed-in session, and
// requests that look like they came from the site itself.

import { exports } from "cloudflare:workers";
import { env } from "cloudflare:test";
import { newTeacherRecords } from "../src/admin.ts";

export const ORIGIN = "https://portal.test";
export const PASSWORD = "correct horse battery";

let visitor = 0;

/** Each test gets its own visitor address so per-visitor limits don't leak between tests. */
export function newVisitor(): string {
  visitor++;
  return `203.0.113.${visitor % 250}:${visitor}`;
}

export interface Client {
  ip: string;
  cookies: Map<string, string>;
  call(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<Response>;
}

export function client(ip = newVisitor()): Client {
  const cookies = new Map<string, string>();
  return {
    ip,
    cookies,
    async call(method, path, body, headers = {}) {
      const h = new Headers({ "CF-Connecting-IP": ip, ...headers });
      if (method !== "GET" && !("Origin" in headers)) h.set("Origin", ORIGIN);
      if (body !== undefined) h.set("Content-Type", "application/json");
      if (cookies.size) h.set("Cookie", [...cookies].map(([k, v]) => `${k}=${v}`).join("; "));
      const res = await exports.default.fetch(new Request(ORIGIN + path, {
        method, headers: h, body: body === undefined ? undefined : JSON.stringify(body),
      }));
      for (const line of res.headers.getSetCookie()) {
        const [pair] = line.split(";");
        const [k, ...v] = pair.split("=");
        const value = v.join("=");
        if (!value || /Max-Age=0/.test(line)) cookies.delete(k); else cookies.set(k, value);
      }
      return res;
    },
  };
}

export async function seedTeacher(email = "ana@school.test", className = "Grade 4 - Sampaguita") {
  const { teacher, cls, entries } = await newTeacherRecords({
    email, name: "Ana Reyes", password: PASSWORD, className, school: "Test Elementary School",
  });
  for (const e of entries) await env.DATA.put(e.key, e.value);
  return { teacher, cls };
}

export async function signIn(email = "ana@school.test"): Promise<Client> {
  const c = client();
  const r = await c.call("POST", "/api/login", { email, password: PASSWORD });
  if (r.status !== 200) throw new Error(`sign in failed: ${r.status} ${await r.text()}`);
  return c;
}

/** A teacher with one class, two students, one quarter and grades for both. */
export async function classWithGrades() {
  const { teacher, cls } = await seedTeacher();
  const t = await signIn();
  const base = `/api/teacher/class/${cls.id}`;
  let r = await t.call("POST", `${base}/students`, { students: [{ name: "Juan Dela Cruz" }, { name: "Maria Santos" }] });
  let v = await r.json<any>();
  const [juan, maria] = v.class.students;
  r = await t.call("POST", `${base}/terms`, { year: "2026-2027", label: "First Quarter", from: "2026-06-15", to: "2026-08-21" });
  v = await r.json<any>();
  const term = v.class.terms[0];
  const subjects = v.class.subjects as { id: string; name: string }[];
  const row = (n: number) => Object.fromEntries(subjects.map((s) => [s.id, n]));
  r = await t.call("PUT", `${base}/terms/${term.id}/grades`, { changes: { [juan.id]: row(90), [maria.id]: row(80) } });
  if (r.status !== 200) throw new Error(await r.text());
  return { teacher, cls, t, base, juan, maria, term, subjects, codes: v.codes as Record<string, string> };
}
