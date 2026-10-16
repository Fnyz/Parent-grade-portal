// Grade calculation, shared by the server and both pages so every average
// on screen comes from the same code.
//
// PENDING (plan, Phase 0): replace the plain mean and one-decimal rounding
// below with the school's official formula once it is confirmed in writing,
// then add the real past report cards to test/grades.test.ts.

export const QUARTERS = ["First Quarter", "Second Quarter", "Third Quarter", "Fourth Quarter"];

/** A grade the system accepts: a finite number from 0 to 100. */
export function isGrade(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;
}

/** Round half up to one decimal, without floating point surprises (84.25 -> 84.3). */
export function round1(x: number): number {
  return Math.round((x + Number.EPSILON) * 10) / 10;
}

function mean(values: readonly unknown[]): number | null {
  const v = values.filter(isGrade);
  if (!v.length) return null;
  return round1(v.reduce((a, b) => a + b, 0) / v.length);
}

/** General average for one quarter, from that quarter's subject grades. */
export function quarterAverage(grades: readonly unknown[]): number | null {
  return mean(grades);
}

/** Average across the quarters released so far in one school year. */
export function yearAverage(quarterAverages: readonly unknown[]): number | null {
  return mean(quarterAverages);
}

/** How a grade or average is printed. */
export function fmt(n: unknown): string {
  return isGrade(n) ? n.toFixed(1) : "—";
}
