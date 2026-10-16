// The grade grid. Saves after a pause in typing or on the button, never on
// every keystroke, to stay inside the KV write limit. Unsaved grades are kept
// on this phone as a draft so a dropped connection does not lose them.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown } from "lucide-react";
import { fmt, isGrade, quarterAverage } from "../../shared/grades.ts";
import { ApiError, errorText } from "@/lib/api";
import { plural } from "@/lib/format";
import { store } from "@/lib/storage";
import type { ClassView, GradeEdits, GradeTable, Term } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/confirm";
import { Avatar } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { DRAFT, useClass } from "./context";

const AUTOSAVE_MS = 4000;
const termKey = (classId: string) => `pgp-term:${classId}`;

export function latestTerm(terms: Term[]): Term | undefined {
  const today = new Date().toISOString().slice(0, 10);
  const started = terms.filter((t) => !t.from || t.from <= today);
  return (started.length ? started : terms).at(-1);
}

export function GradesTab({ goTo }: { goTo: (tab: "students" | "quarters") => void }) {
  const { view } = useClass();
  const c = view.class;
  const [termId, setTermId] = useState<string | null>(() => {
    const saved = store.get<string>(termKey(c.id));
    return c.terms.some((t) => t.id === saved) ? saved : latestTerm(c.terms)?.id ?? null;
  });

  if (!c.terms.length) {
    return <Empty title="Add a quarter first" text="Grades are entered per quarter. Add the school year and quarter you are grading." action="Add a quarter" onClick={() => goTo("quarters")} />;
  }
  if (!c.students.length) {
    return <Empty title="Add students first" text="Add students one at a time, or import a spreadsheet of names." action="Add students" onClick={() => goTo("students")} />;
  }
  const term = c.terms.find((t) => t.id === termId) ?? latestTerm(c.terms)!;
  return (
    <Grid
      key={term.id}
      term={term}
      onTerm={(id) => { store.set(termKey(c.id), id); setTermId(id); }}
    />
  );
}

function Empty({ title, text, action, onClick }: { title: string; text: string; action: string; onClick: () => void }) {
  return (
    <Card>
      <CardContent className="grid gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p>{text}</p>
        <div><Button onClick={onClick}>{action}</Button></div>
      </CardContent>
    </Card>
  );
}

type Status = { text: string; kind: "ok" | "dirty" | "error" | "busy" };

function Grid({ term, onTerm }: { term: Term; onTerm: (id: string) => void }) {
  const { view, setView, call, base } = useClass();
  const confirm = useConfirm();
  const c = view.class;
  const draftKey = `${DRAFT}${c.id}:${term.id}`;

  const [saved, setSaved] = useState<GradeTable | null>(null);
  const [edits, setEdits] = useState<GradeEdits>({});
  const [raw, setRaw] = useState<Record<string, string>>({}); // what is typed in a cell that is not valid
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Refs let the timer and the unmount save see the latest values.
  const editsRef = useRef(edits); editsRef.current = edits;
  const rawRef = useRef(raw); rawRef.current = raw;
  const savingRef = useRef(false);

  const invalid = Object.keys(raw).length;
  const count = Object.values(edits).reduce((n, row) => n + Object.keys(row).length, 0);
  const dirty = count > 0;

  // Load this quarter's grades, then lay any draft from this phone on top.
  useEffect(() => {
    let live = true;
    call<{ grades: GradeTable }>("GET", `${base}/terms/${term.id}/grades`).then(({ grades }) => {
      if (!live) return;
      const restored: GradeEdits = {};
      const draft = store.get<{ edits?: GradeEdits }>(draftKey);
      const ids = new Set(c.students.map((s) => s.id));
      const subs = new Set(c.subjects.map((s) => s.id));
      for (const [sid, row] of Object.entries(draft?.edits ?? {})) {
        if (!ids.has(sid) || !row) continue;
        for (const [sub, v] of Object.entries(row)) {
          if (!subs.has(sub) || !(v === null || isGrade(v)) || (grades[sid]?.[sub] ?? null) === v) continue;
          (restored[sid] ??= {})[sub] = v;
        }
      }
      const n = Object.values(restored).reduce((k, row) => k + Object.keys(row).length, 0);
      if (n) toast.warning(`Restored ${plural(n, "unsaved grade")} from this phone. They save shortly.`);
      else store.del(draftKey);
      setSaved(grades);
      setEdits(restored);
    }).catch((e) => { if (live && !(e instanceof ApiError && e.status === 401)) setLoadError(errorText(e)); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term.id]);

  const save = useCallback(async () => {
    const sent = editsRef.current;
    if (savingRef.current || !Object.keys(sent).length || Object.keys(rawRef.current).length) return;
    savingRef.current = true;
    setSaving(true);
    setFailed(null);
    try {
      await call("PUT", `${base}/terms/${term.id}/grades`, { changes: sent });
      // Fold what was sent into the saved copy; keep anything typed meanwhile.
      setSaved((prev) => {
        const next: GradeTable = { ...prev };
        for (const [sid, row] of Object.entries(sent)) {
          next[sid] = { ...next[sid] };
          for (const [sub, v] of Object.entries(row)) { if (v === null) delete next[sid][sub]; else next[sid][sub] = v; }
        }
        return next;
      });
      setEdits((cur) => {
        const left: GradeEdits = {};
        for (const [sid, row] of Object.entries(cur)) {
          for (const [sub, v] of Object.entries(row)) if (sent[sid]?.[sub] !== v) (left[sid] ??= {})[sub] = v;
        }
        if (Object.keys(left).length) store.set(draftKey, { edits: left, at: Date.now() }); else store.del(draftKey);
        return left;
      });
      setLastSaved(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [call, base, term.id, draftKey]);

  // Save after a pause in typing.
  useEffect(() => {
    if (!dirty || invalid || saving) return;
    const t = setTimeout(save, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [edits, dirty, invalid, saving, save]);

  // Leaving the tab or quarter saves what can be saved; the draft keeps the rest.
  const saveRef = useRef(save); saveRef.current = save;
  useEffect(() => () => { saveRef.current(); }, []);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (Object.keys(editsRef.current).length || savingRef.current) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const value = useCallback((sid: string, sub: string): number | null =>
    edits[sid] && sub in edits[sid] ? edits[sid][sub] : saved?.[sid]?.[sub] ?? null, [edits, saved]);

  const onCell = (sid: string, sub: string, text: string) => {
    const k = `${sid}:${sub}`;
    const t = text.trim();
    const n = t === "" ? null : Number(t);
    const ok = t === "" || isGrade(n);
    setRaw((r) => {
      const next = { ...r };
      if (ok) delete next[k]; else next[k] = text;
      return next;
    });
    if (!ok) return;
    setEdits((cur) => {
      const next = { ...cur, [sid]: { ...cur[sid] } };
      if (n === (saved?.[sid]?.[sub] ?? null)) delete next[sid][sub]; else next[sid][sub] = n;
      if (!Object.keys(next[sid]).length) delete next[sid];
      if (Object.keys(next).length) store.set(draftKey, { edits: next, at: Date.now() }); else store.del(draftKey);
      return next;
    });
  };

  const averages = useMemo(() => {
    const rows = Object.fromEntries(c.students.map((s) => [s.id, quarterAverage(c.subjects.map((x) => value(s.id, x.id)))]));
    const cols = Object.fromEntries(c.subjects.map((x) => [x.id, quarterAverage(c.students.map((s) => value(s.id, x.id)))]));
    return { rows, cols, all: quarterAverage(Object.values(rows)) };
  }, [c.students, c.subjects, value]);

  const status: Status = saving ? { text: "Saving…", kind: "busy" }
    : failed ? { text: `Not saved: ${failed} Your grades are kept on this phone.`, kind: "error" }
    : invalid ? { text: `${plural(invalid, "grade")} must be a number from 0 to 100. Fix ${invalid === 1 ? "it" : "them"} to save.`, kind: "error" }
    : dirty ? { text: `${plural(count, "unsaved change")}. Saving shortly…`, kind: "dirty" }
    : { text: lastSaved ? `Saved at ${lastSaved}. ${term.visible ? "Parents can see these grades." : "Hidden from parents."}` : "All grades saved.", kind: "ok" };

  const switchTerm = async (id: string) => {
    if (invalid && !(await confirm({ title: "Leave this quarter?", body: "Some grades are not valid and will not be saved.", confirm: "Leave" }))) return;
    onTerm(id);
  };

  const setVisible = async (on: boolean) => {
    if (on && !(await confirm({
      title: `Show ${term.label} to parents?`,
      body: `Parents of all ${plural(c.students.length, "student")} will see ${term.label} ${term.year} grades now.`,
      confirm: "Show to parents",
    }))) return;
    try {
      if (on && dirty) await save();
      setView(await call<ClassView>("PATCH", `${base}/terms/${term.id}`, { visible: on }));
      toast.success(on ? `${term.label} is now visible to parents.` : `${term.label} is hidden from parents again.`);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) toast.error(errorText(e));
    }
  };

  const years = [...new Set(c.terms.map((t) => t.year))].sort().reverse();
  const pass = c.pass;

  /** Enter moves down the column, like a spreadsheet. */
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>, sub: string) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const inputs = [...document.querySelectorAll<HTMLInputElement>(`input[data-sub="${sub}"]`)].filter((i) => i.offsetParent !== null);
    const next = inputs[inputs.indexOf(e.currentTarget) + 1];
    if (next) { next.focus(); next.select(); } else e.currentTarget.blur();
  };

  // Summary for the tiles: how much is entered, the class average, and who is below passing.
  const totalCells = c.students.length * c.subjects.length;
  const entered = c.students.reduce((n, s) => n + c.subjects.filter((x) => value(s.id, x.id) !== null).length, 0);
  const belowCount = c.students.filter((s) => below(averages.rows[s.id], pass)).length;
  const withoutCode = c.students.filter((s) => !view.codes[s.id]).length;
  const missingFor = (sid: string) => c.subjects.filter((x) => value(sid, x.id) === null).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Students" value={String(c.students.length)} note={withoutCode
          ? `${withoutCode} without an access code` : "All have access codes"} />
        <Tile label="Grades entered" value={<>{entered} <span className="text-muted-foreground text-base font-semibold">/ {totalCells}</span></>}>
          <div className="bg-muted h-2 overflow-hidden rounded-full" role="progressbar" aria-label="Grades entered"
            aria-valuemin={0} aria-valuemax={totalCells} aria-valuenow={entered}>
            <div className="bg-primary h-full rounded-full transition-[width]" style={{ width: `${totalCells ? (entered / totalCells) * 100 : 0}%` }} />
          </div>
        </Tile>
        <Tile label="Class average" value={fmt(averages.all)} note={`${term.label} so far`} />
        <Tile label="Below passing" value={String(belowCount)} note={`Students under ${pass}`} danger={belowCount > 0} />
      </div>

      <section className="bg-card flex flex-col overflow-clip rounded-[20px] border">
        <div className="flex flex-wrap items-center justify-between gap-3.5 border-b px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <label htmlFor="g-year" className="sr-only">School year</label>
            <NativeSelect id="g-year" value={term.year} className="w-36 font-semibold"
              onChange={(e) => switchTerm(c.terms.filter((t) => t.year === e.target.value).at(-1)!.id)}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </NativeSelect>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quarter">
              {c.terms.filter((t) => t.year === term.year).map((t) => (
                <button key={t.id} type="button" aria-pressed={t.id === term.id} onClick={() => t.id !== term.id && switchTerm(t.id)}
                  className={cn("h-10 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition-colors",
                    t.id === term.id ? "bg-marigold font-bold text-[#0F1B2D]" : "border hover:bg-secondary")}>
                  {t.label.replace(" Quarter", "")} · {t.visible ? "Released" : "Hidden"}
                </button>
              ))}
            </div>
          </div>
          <label className={cn("flex cursor-pointer items-center gap-3 rounded-full py-2 pr-4 pl-2",
            term.visible ? "bg-success-soft text-success" : "bg-marigold-soft text-warning")}>
            <Switch checked={term.visible} onCheckedChange={setVisible} aria-label="Visible to parents" />
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-bold">{term.visible ? "Visible to parents" : "Hidden from parents"}</span>
              <span className="text-xs">{term.visible ? "Saves reach parents within a minute" : "Turn on at report card distribution"}</span>
            </span>
          </label>
        </div>

        {loadError && <p className="bg-fail-soft text-fail m-4 rounded-xl p-3">{loadError}</p>}
        {!saved && !loadError && <p className="text-muted-foreground p-5">Loading grades…</p>}

        {saved && (
          <>
            {/* Phone: one card per student. Students with every grade in fold away. */}
            <div className="flex flex-col gap-3 p-3 md:hidden">
              {c.students.map((s) => (
                <StudentCard key={s.id} name={s.name} missing={missingFor(s.id)} total={c.subjects.length}
                  avg={averages.rows[s.id]} pass={pass}>
                  {c.subjects.map((x) => (
                    <div key={x.id} className="flex items-center justify-between gap-3 px-4 py-1.5">
                      <label htmlFor={`m-${s.id}-${x.id}`} className="text-muted-foreground text-[15px]">{x.name}</label>
                      <Cell id={`m-${s.id}-${x.id}`} sid={s.id} sub={x.id} label={`${s.name}, ${x.name}`} value={value(s.id, x.id)}
                        raw={raw[`${s.id}:${x.id}`]} pass={pass} onChange={onCell} onKey={onKey} big />
                    </div>
                  ))}
                </StudentCard>
              ))}
            </div>

            {/* Tablet and computer: a grid */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] border-collapse text-[15px]">
                <thead>
                  <tr className="bg-background/60 text-muted-foreground text-[13px]">
                    <th scope="col" className="px-5 py-3 text-left font-semibold">Student</th>
                    {c.subjects.map((x) => <th key={x.id} scope="col" className="px-1.5 py-3 text-center font-semibold">{x.name}</th>)}
                    <th scope="col" className="px-5 py-3 text-right font-semibold">Average</th>
                  </tr>
                </thead>
                <tbody>
                  {c.students.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={s.name} />
                          <span className="font-semibold whitespace-nowrap">{s.name}</span>
                        </div>
                      </td>
                      {c.subjects.map((x) => (
                        <td key={x.id} className="p-1.5 text-center">
                          <Cell sid={s.id} sub={x.id} label={`${s.name}, ${x.name}`} value={value(s.id, x.id)} raw={raw[`${s.id}:${x.id}`]}
                            pass={pass} onChange={onCell} onKey={onKey} />
                        </td>
                      ))}
                      <td className="px-5 py-2.5 text-right"><AvgPill value={averages.rows[s.id]} pass={pass} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-semibold">
                    <td className="px-5 py-3">Class average</td>
                    {c.subjects.map((x) => <td key={x.id} className="px-1.5 py-3 text-center tabular-nums">{fmt(averages.cols[x.id])}</td>)}
                    <td className="px-5 py-3 text-right tabular-nums">{fmt(averages.all)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}

        <div className="bg-card/95 sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3.5 backdrop-blur sm:px-5">
          <span role="status" id="g-status" className={cn("flex items-center gap-2 text-sm font-semibold",
            status.kind === "ok" && "text-success",
            status.kind === "busy" && "text-muted-foreground",
            status.kind === "dirty" && "text-warning",
            status.kind === "error" && "text-fail")}>
            {status.kind === "ok" && <Check className="size-[18px] flex-none" />}
            {status.text}
          </span>
          <Button onClick={save} disabled={saving || !dirty || invalid > 0} className="h-11 rounded-xl px-5 font-bold">Save grades</Button>
        </div>
      </section>
    </div>
  );
}

function Tile({ label, value, note, danger, children }: {
  label: string; value: React.ReactNode; note?: string; danger?: boolean; children?: React.ReactNode;
}) {
  return (
    <div className="bg-card flex flex-col gap-1.5 rounded-2xl border p-4">
      <span className="text-muted-foreground text-[13px] font-semibold">{label}</span>
      <span className={cn("font-display text-[28px] leading-none font-extrabold tabular-nums", danger && "text-fail")}>{value}</span>
      {children}
      {note && <span className="text-muted-foreground text-[13px]">{note}</span>}
    </div>
  );
}

function AvgPill({ value, pass }: { value: number | null; pass: number }) {
  return (
    <span className={cn("inline-block min-w-14 rounded-full px-2.5 py-1.5 text-center font-extrabold tabular-nums",
      below(value, pass) ? "bg-fail-soft text-fail" : "bg-accent text-accent-foreground")}>{fmt(value)}</span>
  );
}

function StudentCard({ name, missing, total, avg, pass, children }: {
  name: string; missing: number; total: number; avg: number | null; pass: number; children: React.ReactNode;
}) {
  // Open while grades are missing; a finished student folds away until tapped.
  const [open, setOpen] = useState(missing > 0);
  return (
    <section className="bg-card overflow-hidden rounded-[18px] border">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className={cn("flex w-full items-center gap-3 px-4 py-3.5 text-left", open && "border-b")}>
        <Avatar name={name} className="size-10 text-sm" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-base font-bold">{name}</span>
          <span className={cn("text-[13px] font-semibold", missing ? "text-warning" : "text-success")}>
            {missing ? `${missing} ${missing === 1 ? "grade" : "grades"} missing` : `All ${total} grades in`}
          </span>
        </span>
        <AvgPill value={avg} pass={pass} />
        <ChevronDown className={cn("text-muted-foreground size-[18px] transition-transform", open && "rotate-180")} />
      </button>
      {/* Hidden, not removed, so typed grades and Enter-to-next keep working. */}
      <div hidden={!open} className="py-2">{children}</div>
    </section>
  );
}

function Cell({ id, sid, sub, label, value, raw, pass, onChange, onKey, big }: {
  id?: string; sid: string; sub: string; label: string; value: number | null; raw: string | undefined; pass: number;
  onChange: (sid: string, sub: string, text: string) => void;
  onKey: (e: React.KeyboardEvent<HTMLInputElement>, sub: string) => void;
  big?: boolean;
}) {
  const bad = raw !== undefined;
  // Keep exactly what is being typed ("8", "85.") until it is a whole grade.
  const [text, setText] = useState(value === null ? "" : String(value));
  const shown = bad ? raw : (text.trim() === "" ? null : Number(text)) === value ? text : value === null ? "" : String(value);
  const missing = !bad && value === null;
  const low = !bad && below(value, pass);
  return (
    <input
      id={id}
      type="text" inputMode="decimal" autoComplete="off" placeholder="—"
      data-sid={sid} data-sub={sub} aria-label={label} aria-invalid={bad}
      title={bad ? "Type a grade from 0 to 100" : undefined}
      value={shown}
      onChange={(e) => { setText(e.target.value); onChange(sid, sub, e.target.value); }}
      onKeyDown={(e) => onKey(e, sub)}
      className={cn(
        "rounded-[10px] border text-center font-semibold tabular-nums outline-none transition-colors",
        "focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-[3px]",
        big ? "h-11 w-[84px] rounded-xl border-[1.5px] text-[17px] font-bold" : "h-10 w-16 text-[15px]",
        "border-input bg-card",
        missing && "border-missing bg-missing-soft",
        low && "border-fail/40 bg-fail-soft text-fail",
        bad && "border-fail bg-fail-soft text-fail",
      )}
    />
  );
}

const below = (n: unknown, pass: number) => isGrade(n) && n < pass;
