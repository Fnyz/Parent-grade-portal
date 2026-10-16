// Small pieces checked on their own: what comes back from the database,
// access codes, passwords and signed tokens.

import { describe, expect, it } from "vitest";
import { checkClass, checkGrades } from "../src/store.ts";
import {
  CODE_ALPHABET, hashPassword, newAccessCode, newId, normaliseCode, readToken, signToken, verifyPassword,
} from "../src/crypto.ts";
import { newTeacherRecords, withNewPassword } from "../src/admin.ts";

describe("records read back from the database are checked", () => {
  const cls = {
    id: "cls_aaaaaaaaaaaa", teacherId: "tch_aaaaaaaaaaaa", name: "G4", school: "S", pass: "75",
    subjects: { 0: { id: "sub_aaaaaaaaaaaa", name: "Math" }, 1: { id: "bad key", name: "x" } },
    terms: [
      { id: "trm_bbbbbbbbbbbb", year: "2026-2027", label: "Second Quarter", visible: "true" },
      { id: "trm_aaaaaaaaaaaa", year: "2026-2027", label: "First Quarter", visible: true },
      { id: "trm_cccccccccccc", year: "2026-2027", label: "Fifth Quarter" },
    ],
  };

  it("turns numbers stored as text into numbers", () => {
    expect(checkClass(cls)!.pass).toBe(75);
  });

  it("accepts lists that came back as objects, and drops bad entries", () => {
    expect(checkClass(cls)!.subjects).toEqual([{ id: "sub_aaaaaaaaaaaa", name: "Math" }]);
  });

  it("fills in missing fields and keeps only true as visible", () => {
    const c = checkClass(cls)!;
    expect(c.students).toEqual([]);
    expect(c.terms.map((t) => [t.label, t.visible])).toEqual([["First Quarter", true], ["Second Quarter", false]]);
  });

  it("rejects a record with no valid id", () => {
    expect(checkClass({ ...cls, id: "class:../x" })).toBeNull();
    expect(checkClass("nonsense")).toBeNull();
  });

  it("keeps only grades from 0 to 100", () => {
    const g = checkGrades({ v: { sub_aaaaaaaaaaaa: "88", sub_bbbbbbbbbbbb: 101, sub_cccccccccccc: -1, nope: 90 }, hist: null });
    expect(g).toEqual({ v: { sub_aaaaaaaaaaaa: 88 }, hist: [] });
  });
});

describe("access codes", () => {
  it("uses only the no-look-alike alphabet", () => {
    for (const ch of "0O1IL") expect(CODE_ALPHABET).not.toContain(ch);
    for (let i = 0; i < 200; i++) {
      const c = newAccessCode();
      expect(c).toMatch(/^.{5}-.{5}$/);
      for (const ch of c.replace("-", "")) expect(CODE_ALPHABET).toContain(ch);
    }
  });

  it("tidies what a parent types", () => {
    expect(normaliseCode(" abcde fghjk ")).toBe("ABCDE-FGHJK");
    expect(normaliseCode("ABCDE—FGHJK")).toBe("ABCDE-FGHJK");
    expect(normaliseCode("ABCDE-FGHJ0")).toBeNull(); // zero is never in a code
    expect(normaliseCode("ABCD")).toBeNull();
    expect(normaliseCode(12345)).toBeNull();
  });

  it("makes ids that are safe inside keys", () => {
    expect(newId("stu")).toMatch(/^stu_[a-z0-9]{12}$/);
  });
});

describe("passwords and tokens", () => {
  it("verifies the right password only", async () => {
    const rec = await hashPassword("a long enough password");
    expect(rec.iter).toBe(100_000);
    expect(await verifyPassword("a long enough password", rec)).toBe(true);
    expect(await verifyPassword("a long enough passwore", rec)).toBe(false);
  });

  it("rejects a token signed with another secret", async () => {
    const t = await signToken("one", { s: 1 });
    expect(await readToken("one", t)).toEqual({ s: 1 });
    expect(await readToken("two", t)).toBeNull();
    expect(await readToken("one", "garbage")).toBeNull();
  });

  it("refuses short passwords when creating or resetting a teacher", async () => {
    await expect(newTeacherRecords({ email: "a@b.c", name: "A", password: "short", className: "G4" })).rejects.toThrow();
    const { teacher } = await newTeacherRecords({ email: "A@B.c ", name: "A", password: "long enough!", className: "G4" });
    expect(teacher.email).toBe("a@b.c");
    await expect(withNewPassword(teacher, "short")).rejects.toThrow();
  });
});
