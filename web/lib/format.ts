const dateFmt = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" });

export function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime()) ? "" : dateFmt.format(d);
}

export function dateRange(from: string, to: string): string {
  return [formatDate(from), formatDate(to)].filter(Boolean).join(" – ");
}

export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/** School years start in June. */
export function currentSchoolYear(): string {
  const d = new Date();
  const y = d.getMonth() >= 5 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${y + 1}`;
}
