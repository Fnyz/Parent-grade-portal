// Grade calculation. The plan requires these to reproduce real past report
// cards exactly. Until the school confirms its formula in writing (Phase 0),
// these cover the placeholder: a plain mean rounded half up to one decimal.
//
// PENDING: add 3 to 5 real past report cards, names removed, as cases in
// PAST_CARDS below. Each must match the paper card to the last digit.

import { describe, expect, it } from "vitest";
import { fmt, isGrade, quarterAverage, round1, yearAverage } from "../shared/grades.ts";

const PAST_CARDS: { grades: number[]; average: number }[] = [];

describe("grades", () => {
  it("accepts numbers from 0 to 100 only", () => {
    expect([0, 75, 100, 89.5].every(isGrade)).toBe(true);
    expect([-1, 101, NaN, Infinity, "90", null].some(isGrade)).toBe(false);
  });

  it("rounds half up without floating point surprises", () => {
    expect(round1(84.25)).toBe(84.3);
    expect(round1(84.249)).toBe(84.2);
    expect(round1(89.95)).toBe(90);
    expect(round1(79.45)).toBe(79.5);
  });

  it("averages only the grades that are there", () => {
    expect(quarterAverage([90, 80, null, undefined])).toBe(85);
    expect(quarterAverage([])).toBeNull();
    expect(quarterAverage([null])).toBeNull();
  });

  it("averages the quarters released so far", () => {
    expect(yearAverage([88.3, 90.1])).toBe(89.2);
  });

  it("prints a dash for a missing grade", () => {
    expect(fmt(null)).toBe("—");
    expect(fmt(90)).toBe("90.0");
  });

  it.skipIf(PAST_CARDS.length === 0)("matches the past report cards exactly", () => {
    for (const card of PAST_CARDS) expect(quarterAverage(card.grades)).toBe(card.average);
  });
});
