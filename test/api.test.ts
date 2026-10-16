// The Phase 2 checks from PLAN.md, run against the real Worker with fake data:
// no login is refused, a teacher cannot touch another teacher's class, a wrong
// code reveals nothing, and a hidden quarter never reaches a parent.

import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { getGrades } from "../src/store.ts";
import { classWithGrades, client, seedTeacher, signIn } from "./helpers.ts";

describe("every response", () => {
  it("sends no-store and a strict CSP", async () => {
    const r = await client().call("GET", "/api/parent/report");
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(r.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
  });

  it("refuses a change that did not come from this site", async () => {
    await seedTeacher();
    const r = await client().call("POST", "/api/login", { email: "ana@school.test", password: "x" },
      { Origin: "https://evil.test" });
    expect(r.status).toBe(403);
  });

  it("refuses a change with no Origin header", async () => {
    const c = client();
    const r = await c.call("POST", "/api/parent/forget", {}, { Origin: "" });
    expect(r.status).toBe(403);
  });
});

describe("teacher sign in", () => {
  it("signs in with the right password and sets a strict session cookie", async () => {
    await seedTeacher();
    const c = client();
    const r = await c.call("POST", "/api/login", { email: "  ANA@school.test ", password: "correct horse battery" });
    expect(r.status).toBe(200);
    const cookie = r.headers.get("Set-Cookie")!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect((await c.call("GET", "/api/teacher/me")).status).toBe(200);
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    await seedTeacher();
    const a = await client().call("POST", "/api/login", { email: "ana@school.test", password: "wrong password!" });
    const b = await client().call("POST", "/api/login", { email: "nobody@school.test", password: "wrong password!" });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(await a.json()).toEqual(await b.json());
  });

  it("signing out ends the session at once", async () => {
    await seedTeacher();
    const t = await signIn();
    const token = t.cookies.get("pgp_session")!;
    await t.call("POST", "/api/logout", {});
    t.cookies.set("pgp_session", token); // a copied cookie must not work either
    expect((await t.call("GET", "/api/teacher/me")).status).toBe(401);
  });
});

describe("no login is refused", () => {
  const paths: [string, string][] = [
    ["GET", "/api/teacher/me"],
    ["POST", "/api/teacher/classes"],
    ["GET", "/api/teacher/class/cls_aaaaaaaaaaaa"],
    ["PUT", "/api/teacher/class/cls_aaaaaaaaaaaa"],
    ["DELETE", "/api/teacher/class/cls_aaaaaaaaaaaa"],
    ["POST", "/api/teacher/class/cls_aaaaaaaaaaaa/students"],
    ["PATCH", "/api/teacher/class/cls_aaaaaaaaaaaa/students/stu_aaaaaaaaaaaa"],
    ["DELETE", "/api/teacher/class/cls_aaaaaaaaaaaa/students/stu_aaaaaaaaaaaa"],
    ["POST", "/api/teacher/class/cls_aaaaaaaaaaaa/students/stu_aaaaaaaaaaaa/code"],
    ["GET", "/api/teacher/class/cls_aaaaaaaaaaaa/students/stu_aaaaaaaaaaaa/preview"],
    ["POST", "/api/teacher/class/cls_aaaaaaaaaaaa/terms"],
    ["PATCH", "/api/teacher/class/cls_aaaaaaaaaaaa/terms/trm_aaaaaaaaaaaa"],
    ["DELETE", "/api/teacher/class/cls_aaaaaaaaaaaa/terms/trm_aaaaaaaaaaaa"],
    ["GET", "/api/teacher/class/cls_aaaaaaaaaaaa/terms/trm_aaaaaaaaaaaa/grades"],
    ["PUT", "/api/teacher/class/cls_aaaaaaaaaaaa/terms/trm_aaaaaaaaaaaa/grades"],
  ];
  for (const [m, p] of paths) {
    it(`${m} ${p.replace("/api/teacher", "")}`, async () => {
      const r = await client().call(m, p, m === "GET" || m === "DELETE" ? undefined : {});
      expect(r.status).toBe(401);
    });
  }

  it("refuses a forged session cookie", async () => {
    const c = client();
    c.cookies.set("pgp_session", "made-up-token");
    expect((await c.call("GET", "/api/teacher/me")).status).toBe(401);
  });
});

describe("a teacher cannot touch another teacher's class", () => {
  it("cannot read, change or grade it", async () => {
    const { cls, base, juan, term } = await classWithGrades();
    await seedTeacher("ben@school.test", "Grade 5 - Narra");
    const ben = await signIn("ben@school.test");
    const tries: [string, string, unknown?][] = [
      ["GET", base],
      ["PUT", base, { name: "Mine now" }],
      ["POST", `${base}/students`, { name: "Intruder" }],
      ["DELETE", `${base}/students/${juan.id}`],
      ["POST", `${base}/students/${juan.id}/code`, {}],
      ["PATCH", `${base}/terms/${term.id}`, { visible: true }],
      ["GET", `${base}/terms/${term.id}/grades`],
      ["PUT", `${base}/terms/${term.id}/grades`, { changes: { [juan.id]: {} } }],
    ];
    for (const [m, p, b] of tries) {
      const r = await ben.call(m, p, b);
      expect(r.status, `${m} ${p}`).toBe(404);
    }
    const rec = await getGrades(env.DATA, juan.id, term.id);
    expect(Object.values(rec.v).every((g) => g === 90)).toBe(true);
    const raw = JSON.parse((await env.DATA.get(`class:${cls.id}`))!);
    expect(raw.name).toBe("Grade 4 - Sampaguita");
    expect(raw.terms[0].visible).toBe(false);
  });
});

describe("teacher actions", () => {
  it("rejects grades outside 0 to 100 and anything that is not a number", async () => {
    const { t, base, juan, term, subjects } = await classWithGrades();
    for (const bad of [101, -1, "90", true, [90]]) {
      const r = await t.call("PUT", `${base}/terms/${term.id}/grades`, { changes: { [juan.id]: { [subjects[0].id]: bad } } });
      expect(r.status, String(bad)).toBe(400);
    }
  });

  it("writes only changed students and keeps a change history", async () => {
    const { t, base, juan, maria, term, subjects } = await classWithGrades();
    const r = await t.call("PUT", `${base}/terms/${term.id}/grades`, {
      changes: { [juan.id]: { [subjects[0].id]: 91 }, [maria.id]: { [subjects[0].id]: 80 } },
    });
    expect(await r.json()).toEqual({ ok: true, written: 1 });
    const rec = await getGrades(env.DATA, juan.id, term.id);
    expect(rec.v[subjects[0].id]).toBe(91);
    expect(rec.hist.at(-1)).toMatchObject({ s: subjects[0].id, from: 90, to: 91 });
  });

  it("clears a grade when sent null", async () => {
    const { t, base, juan, term, subjects } = await classWithGrades();
    await t.call("PUT", `${base}/terms/${term.id}/grades`, { changes: { [juan.id]: { [subjects[0].id]: null } } });
    const r = await t.call("GET", `${base}/terms/${term.id}/grades`);
    const { grades } = await r.json<any>();
    expect(grades[juan.id][subjects[0].id]).toBeUndefined();
  });

  it("gives each student a unique code in the XXXXX-XXXXX form", async () => {
    const { codes, juan, maria } = await classWithGrades();
    expect(codes[juan.id]).toMatch(/^[2-9A-HJKMNP-Z]{5}-[2-9A-HJKMNP-Z]{5}$/);
    expect(codes[juan.id]).not.toBe(codes[maria.id]);
  });

  it("skips a duplicate name instead of adding the student twice", async () => {
    const { t, base } = await classWithGrades();
    const r = await t.call("POST", `${base}/students`, { students: [{ name: "juan dela cruz" }, { name: "Pedro Penduko" }] });
    const v = await r.json<any>();
    expect(v.added).toHaveLength(1);
    expect(v.class.students).toHaveLength(3);
  });

  it("keeps subject names with dots and other symbols in values, not keys", async () => {
    const { t, base, juan, term } = await classWithGrades();
    let r = await t.call("PUT", base, { subjects: [{ name: "Math 4.1" }, { name: "Sci. & Tech." }] });
    expect(r.status).toBe(200);
    const { class: c } = await r.json<any>();
    r = await t.call("PUT", `${base}/terms/${term.id}/grades`, { changes: { [juan.id]: { [c.subjects[0].id]: 88 } } });
    expect(r.status).toBe(200);
    const rec = await getGrades(env.DATA, juan.id, term.id);
    expect(rec.v[c.subjects[0].id]).toBe(88);
  });

  it("refuses a school year that is not two consecutive years", async () => {
    const { t, base } = await classWithGrades();
    const r = await t.call("POST", `${base}/terms`, { year: "2026-2028", label: "Second Quarter" });
    expect(r.status).toBe(400);
  });

  it("removing a student stops their code working", async () => {
    const { t, base, juan, codes } = await classWithGrades();
    await t.call("DELETE", `${base}/students/${juan.id}`);
    const r = await client().call("POST", "/api/parent/lookup", { code: codes[juan.id] });
    expect(r.status).toBe(404);
  });
});

describe("a teacher with several sections", () => {
  it("adds a class that works at once and shows in her list", async () => {
    const { cls } = await seedTeacher();
    const t = await signIn();
    const r = await t.call("POST", "/api/teacher/classes", { name: "Grade 5 - Narra", school: "Test Elementary School" });
    expect(r.status).toBe(201);
    const v = await r.json<any>();
    expect(v.class.name).toBe("Grade 5 - Narra");
    expect(v.class.subjects.length).toBeGreaterThan(0);
    expect(v.class.students).toEqual([]);
    const me = await (await t.call("GET", "/api/teacher/me")).json<any>();
    expect(me.classes).toEqual([cls.id, v.class.id]);
    // Usable straight away, before any KV copy of her record could catch up.
    const s = await t.call("POST", `/api/teacher/class/${v.class.id}/students`, { name: "Liza Soberano" });
    expect(s.status).toBe(200);
  });

  it("keeps each class's students and codes separate", async () => {
    const { cls } = await seedTeacher();
    const t = await signIn();
    const other = await (await t.call("POST", "/api/teacher/classes", { name: "Grade 6 - Molave" })).json<any>();
    await t.call("POST", `/api/teacher/class/${cls.id}/students`, { name: "Juan Dela Cruz" });
    await t.call("POST", `/api/teacher/class/${other.class.id}/students`, { name: "Juan Dela Cruz" });
    const a = await (await t.call("GET", `/api/teacher/class/${cls.id}`)).json<any>();
    const b = await (await t.call("GET", `/api/teacher/class/${other.class.id}`)).json<any>();
    expect(a.class.students[0].id).not.toBe(b.class.students[0].id);
    expect(Object.values(a.codes)[0]).not.toBe(Object.values(b.codes)[0]);
  });

  it("refuses a duplicate class name and a blank one", async () => {
    await seedTeacher();
    const t = await signIn();
    expect((await t.call("POST", "/api/teacher/classes", { name: "grade 4 - sampaguita" })).status).toBe(409);
    expect((await t.call("POST", "/api/teacher/classes", { name: "  " })).status).toBe(400);
  });

  it("another teacher cannot open a class she added", async () => {
    await seedTeacher();
    const t = await signIn();
    const v = await (await t.call("POST", "/api/teacher/classes", { name: "Grade 2 - Ilang-ilang" })).json<any>();
    await seedTeacher("ben@school.test", "Grade 5 - Narra");
    const ben = await signIn("ben@school.test");
    expect((await ben.call("GET", `/api/teacher/class/${v.class.id}`)).status).toBe(404);
    expect((await (await ben.call("GET", "/api/teacher/me")).json<any>()).classes).not.toContain(v.class.id);
  });
});

describe("teacher preview of the parent page", () => {
  it("shows exactly what the family sees, and sets no parent cookie", async () => {
    const { t, base, juan, maria, term, codes } = await classWithGrades();
    let r = await t.call("GET", `${base}/students/${juan.id}/preview`);
    expect(r.status).toBe(200);
    expect(r.headers.get("Set-Cookie")).toBeNull();
    let v = await r.json<any>();
    expect(v.student.name).toBe("Juan Dela Cruz");
    expect(v.terms).toEqual([]); // hidden quarter: not shown, same as for the parent
    expect(v.held).toBe(1);

    await t.call("PATCH", `${base}/terms/${term.id}`, { visible: true });
    v = await (await t.call("GET", `${base}/students/${juan.id}/preview`)).json<any>();
    const parent = await (await client().call("POST", "/api/parent/lookup", { code: codes[juan.id] })).json<any>();
    expect(v).toEqual(parent);
    expect(JSON.stringify(v)).not.toContain(maria.name);
  });

  it("another teacher cannot preview her students", async () => {
    const { base, juan } = await classWithGrades();
    await seedTeacher("ben@school.test", "Grade 5 - Narra");
    const ben = await signIn("ben@school.test");
    expect((await ben.call("GET", `${base}/students/${juan.id}/preview`)).status).toBe(404);
  });
});

describe("deleting a class", () => {
  it("removes it from her list, stops its codes, and deletes its grades", async () => {
    const { t, base, cls, juan, term, codes } = await classWithGrades();
    await t.call("PATCH", `${base}/terms/${term.id}`, { visible: true });
    const parent = client();
    await parent.call("POST", "/api/parent/lookup", { code: codes[juan.id], remember: true });
    const other = await (await t.call("POST", "/api/teacher/classes", { name: "Grade 5 - Narra" })).json<any>();

    const r = await t.call("DELETE", base);
    expect(r.status).toBe(200);
    expect((await r.json<any>()).classes).toEqual([other.class.id]);
    expect((await (await t.call("GET", "/api/teacher/me")).json<any>()).classes).toEqual([other.class.id]);
    expect((await t.call("GET", base)).status).toBe(404);
    expect(await env.DATA.get(`class:${cls.id}`)).toBeNull();
    expect(await env.DATA.get(`grades:${juan.id}:${term.id}`)).toBeNull();

    expect((await client().call("POST", "/api/parent/lookup", { code: codes[juan.id] })).status).toBe(404);
    const again = await parent.call("GET", "/api/parent/report");
    expect(again.status).toBe(401);
    expect((await again.json<any>()).code).toBe("signed_out");
  });

  it("refuses to delete the last class", async () => {
    const { t, base } = await classWithGrades();
    expect((await t.call("DELETE", base)).status).toBe(400);
    expect((await t.call("GET", base)).status).toBe(200);
  });

  it("another teacher cannot delete it", async () => {
    const { base } = await classWithGrades();
    await seedTeacher("ben@school.test", "Grade 5 - Narra");
    const ben = await signIn("ben@school.test");
    await ben.call("POST", "/api/teacher/classes", { name: "Grade 6 - Molave" });
    expect((await ben.call("DELETE", base)).status).toBe(404);
  });
});

describe("a wrong code reveals nothing", () => {
  it("gives the same answer for a wrong code and a malformed one", async () => {
    await classWithGrades();
    const a = await client().call("POST", "/api/parent/lookup", { code: "ABCDE-FGHJK" });
    const b = await client().call("POST", "/api/parent/lookup", { code: "not a code" });
    expect(a.status).toBe(404);
    expect(b.status).toBe(404);
    const body = await a.json<any>();
    expect(body).toEqual(await b.json());
    expect(JSON.stringify(body)).not.toMatch(/Juan|Maria|Sampaguita/);
    expect(a.headers.get("Set-Cookie")).toBeNull();
  });

  it("blocks quick guessing from one visitor", async () => {
    const c = client();
    const statuses: number[] = [];
    for (let i = 0; i < 25; i++) statuses.push((await c.call("POST", "/api/parent/lookup", { code: "ABCDE-FGHJK" })).status);
    expect(statuses).toContain(429);
    // A parent on a different connection is not affected.
    expect((await client().call("POST", "/api/parent/lookup", { code: "ABCDE-FGHJK" })).status).toBe(404);
  });
});

describe("what a parent sees", () => {
  it("a hidden quarter never reaches a parent", async () => {
    const { codes, juan } = await classWithGrades();
    const r = await client().call("POST", "/api/parent/lookup", { code: codes[juan.id] });
    expect(r.status).toBe(200);
    const v = await r.json<any>();
    expect(v.student.name).toBe("Juan Dela Cruz");
    expect(v.terms).toEqual([]);
    expect(v.held).toBe(1);
    expect(JSON.stringify(v)).not.toContain("90");
  });

  it("shows a quarter once it is visible, with one child's data only", async () => {
    const { t, base, term, codes, juan, maria } = await classWithGrades();
    await t.call("PATCH", `${base}/terms/${term.id}`, { visible: true });
    const r = await client().call("POST", "/api/parent/lookup", { code: codes[juan.id].toLowerCase().replace("-", " ") });
    const v = await r.json<any>();
    expect(v.terms).toHaveLength(1);
    expect(v.terms[0].average).toBe(90);
    expect(v.held).toBe(0);
    const text = JSON.stringify(v);
    expect(text).not.toContain(maria.name);
    expect(text).not.toContain(maria.id);
    expect(text).not.toContain(codes[juan.id]); // the code itself is never echoed back
  });

  it("hiding a quarter again takes it away from a remembered phone", async () => {
    const { t, base, term, codes, juan } = await classWithGrades();
    await t.call("PATCH", `${base}/terms/${term.id}`, { visible: true });
    const p = client();
    await p.call("POST", "/api/parent/lookup", { code: codes[juan.id], remember: true });
    expect((await (await p.call("GET", "/api/parent/report")).json<any>()).terms).toHaveLength(1);
    await t.call("PATCH", `${base}/terms/${term.id}`, { visible: false });
    expect((await (await p.call("GET", "/api/parent/report")).json<any>()).terms).toHaveLength(0);
  });

  it("remembers the phone with a signed cookie that does not hold the code", async () => {
    const { codes, juan } = await classWithGrades();
    const p = client();
    const r = await p.call("POST", "/api/parent/lookup", { code: codes[juan.id], remember: true });
    const cookie = r.headers.get("Set-Cookie")!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Max-Age=\d+/);
    const [payload] = p.cookies.get("pgp_parent")!.split(".");
    expect(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).not.toContain(codes[juan.id]);
    expect((await p.call("GET", "/api/parent/report")).status).toBe(200);
  });

  it("refuses a tampered cookie", async () => {
    const { codes, juan, maria } = await classWithGrades();
    const p = client();
    await p.call("POST", "/api/parent/lookup", { code: codes[juan.id] });
    const [payload, sig] = p.cookies.get("pgp_parent")!.split(".");
    const forged = btoa(atob(payload.replace(/-/g, "+").replace(/_/g, "/")).replace(juan.id, maria.id))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    p.cookies.set("pgp_parent", `${forged}.${sig}`);
    expect((await p.call("GET", "/api/parent/report")).status).toBe(401);
  });

  it("reissuing a code stops the old one at once, including on a remembered phone", async () => {
    const { t, base, codes, juan } = await classWithGrades();
    const p = client();
    await p.call("POST", "/api/parent/lookup", { code: codes[juan.id], remember: true });
    const r = await t.call("POST", `${base}/students/${juan.id}/code`, {});
    const { code: fresh } = await r.json<any>();
    expect(fresh).not.toBe(codes[juan.id]);

    const again = await p.call("GET", "/api/parent/report");
    expect(again.status).toBe(401);
    expect((await again.json<any>()).code).toBe("replaced");
    expect(p.cookies.has("pgp_parent")).toBe(false);

    expect((await client().call("POST", "/api/parent/lookup", { code: codes[juan.id] })).status).toBe(404);
    expect((await client().call("POST", "/api/parent/lookup", { code: fresh })).status).toBe(200);
  });

  it("Forget this phone clears the cookie", async () => {
    const { codes, juan } = await classWithGrades();
    const p = client();
    await p.call("POST", "/api/parent/lookup", { code: codes[juan.id], remember: true });
    await p.call("POST", "/api/parent/forget", {});
    expect(p.cookies.has("pgp_parent")).toBe(false);
    expect((await p.call("GET", "/api/parent/report")).status).toBe(401);
  });
});
