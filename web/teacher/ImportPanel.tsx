// Spreadsheet import, read entirely in the teacher's browser. Nothing is
// saved until she has checked the preview.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { fmt, isGrade } from "../../shared/grades.ts";
import { ApiError, errorText } from "@/lib/api";
import { plural } from "@/lib/format";
import type { ClassRec, ClassView, Subject } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Field } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { useClass } from "./context";
import { latestTerm } from "./GradesTab";

interface Row { name: string; no: string; grades: Record<string, number>; bad: string[]; existing: boolean }
interface Parsed { rows: Row[]; subCols: { i: number; sub: Subject }[]; ignored: string[] }

const norm = (x: unknown) => String(x ?? "").replace(/\s+/g, " ").trim();
const NAME = /\bname\b|^learner$|^student$/i;
const NUMBER = /^(lrn|no\.?|#|student (no|number|id)|learner (no|reference|id))/i;

/** Finds the Name column, an optional student no. column, and subject columns. */
function parse(sheet: unknown[][], c: ClassRec): Parsed {
  const subjects = new Map(c.subjects.map((x) => [norm(x.name).toLowerCase(), x]));
  const head = sheet.findIndex((r) => r.slice(0, 20).some((v) => NAME.test(norm(v))));
  let nameCol = 0, noCol = -1;
  const subCols: Parsed["subCols"] = [];
  const ignored: string[] = [];
  if (head >= 0) {
    const r = sheet[head];
    nameCol = r.findIndex((v) => NAME.test(norm(v)));
    r.forEach((v, i) => {
      if (i === nameCol || !norm(v)) return;
      const sub = subjects.get(norm(v).toLowerCase());
      if (sub) subCols.push({ i, sub });
      else if (noCol < 0 && NUMBER.test(norm(v))) noCol = i;
      else ignored.push(norm(v));
    });
  }
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const r of sheet.slice(head + 1)) {
    const name = norm(r[nameCol]).slice(0, 120);
    if (!name || /^\d+(\.\d+)?$/.test(name) || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const grades: Record<string, number> = {};
    const bad: string[] = [];
    for (const { i, sub } of subCols) {
      const v = r[i];
      if (v === null || v === undefined || norm(v) === "") continue;
      const n = typeof v === "number" ? v : Number(norm(v));
      if (isGrade(n)) grades[sub.id] = Math.round(n * 100) / 100; else bad.push(sub.id);
    }
    const existing = c.students.some((x) => x.name.toLowerCase() === name.toLowerCase());
    rows.push({ name, no: noCol >= 0 ? norm(r[noCol]).slice(0, 40) : "", grades, bad, existing });
  }
  return { rows, subCols, ignored };
}

export function ImportPanel({ file, onClose }: { file: File; onClose: () => void }) {
  const { view, setView, call, base } = useClass();
  const c = view.class;
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [termId, setTermId] = useState(latestTerm(c.terms)?.id ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      if (file.size > 5_000_000) throw new Error("That file is larger than 5 MB. Save just the class list and try again.");
      // SheetJS loads only when a teacher imports, pinned to 0.20.3 from SheetJS's own CDN (see PLAN.md).
      const X = await import("xlsx");
      const wb = X.read(await file.arrayBuffer(), { type: "array" });
      const sheet = X.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, blankrows: false, defval: null });
      if (live) setParsed(parse(sheet, c));
    })().catch((e) => { if (live) setError(errorText(e) || "That file could not be read. Save it as .xlsx or .csv and try again."); });
    return () => { live = false; };
    // Parse once per file; the class is read as it was when the file was picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  if (error) return <p className="bg-fail/10 text-fail rounded-md p-3">{error}</p>;
  if (!parsed) return <p className="text-muted-foreground">Reading the spreadsheet…</p>;
  const { rows, subCols, ignored } = parsed;
  if (!rows.length) return <p className="bg-fail/10 text-fail rounded-md p-3">No names were found. Put the names in a column headed Name, one student per row.</p>;

  const fresh = rows.filter((r) => !r.existing);
  const graded = rows.filter((r) => Object.keys(r.grades).length);
  const bad = rows.filter((r) => r.bad.length);
  const withGrades = subCols.length > 0 && c.terms.length > 0 && graded.length > 0;

  const run = async () => {
    setBusy(true);
    try {
      let latest = view;
      if (fresh.length) {
        latest = await call<ClassView>("POST", `${base}/students`, { students: fresh.map(({ name, no }) => ({ name, no })) });
        setView(latest);
      }
      let n = 0;
      if (withGrades) {
        const changes: Record<string, Record<string, number>> = {};
        for (const r of graded) {
          const s = latest.class.students.find((x) => x.name.toLowerCase() === r.name.toLowerCase());
          if (s) { changes[s.id] = r.grades; n++; }
        }
        if (n) await call("PUT", `${base}/terms/${termId}/grades`, { changes });
      }
      toast.success(`Imported ${plural(fresh.length, "new student")}${n ? ` and grades for ${plural(n, "student")}` : ""}.`);
      onClose();
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="import-preview" className="grid gap-3 rounded-lg border p-4">
      <h3 className="font-semibold">Check before importing</h3>
      <p>{plural(rows.length, "name")} found: {fresh.length} new, {rows.length - fresh.length} already in the class.</p>
      {subCols.length
        ? <p>Grade columns: {subCols.map((x) => x.sub.name).join(", ")}.</p>
        : <p className="text-muted-foreground">No grade columns matched your subjects, so only names will be imported.</p>}
      {ignored.length > 0 && <p className="text-muted-foreground">Columns not used: {ignored.join(", ")}.</p>}
      {bad.length > 0 && <p className="bg-warning-soft text-warning rounded-md p-3 text-sm">{plural(bad.length, "student")} {bad.length === 1 ? "has" : "have"} grades that are not numbers from 0 to 100. Those cells are skipped.</p>}
      {subCols.length > 0 && !c.terms.length && <p className="bg-warning-soft text-warning rounded-md p-3 text-sm">Add a quarter first to import grades. Names can be imported now.</p>}
      {withGrades && (
        <Field id="imp-term" label="Put these grades in">
          <NativeSelect id="imp-term" value={termId} onChange={(e) => setTermId(e.target.value)}>
            {c.terms.map((t) => <option key={t.id} value={t.id}>{t.label}, {t.year}</option>)}
          </NativeSelect>
        </Field>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b">
              <th className="p-2 text-left font-medium">Name</th>
              <th className="p-2" />
              {subCols.map(({ sub }) => <th key={sub.id} className="p-2 text-right font-medium">{sub.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-b">
                <td className="p-2">{r.name}{r.no && <div className="text-muted-foreground text-xs">{r.no}</div>}</td>
                <td className="p-2"><Badge variant={r.existing ? "secondary" : "default"}>{r.existing ? "Already in class" : "New"}</Badge></td>
                {subCols.map(({ sub }) => (
                  <td key={sub.id} className={cn("p-2 text-right tabular-nums", r.bad.includes(sub.id) && "text-fail font-semibold")}>
                    {r.bad.includes(sub.id) ? "invalid" : fmt(r.grades[sub.id] ?? null)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={busy || (!fresh.length && !withGrades)} onClick={run}>
          Import {plural(fresh.length, "new student")}{withGrades ? ` and grades for ${plural(graded.length, "student")}` : ""}
        </Button>
      </div>
    </div>
  );
}
