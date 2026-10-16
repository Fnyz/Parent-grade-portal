// Parent page. The server sends one child's released quarters and nothing
// else; this page only arranges them. The code is typed into a form and is
// never put in the address bar.

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, ChevronLeft, Eye, ChevronRight, CircleAlert, Lock, Printer } from "lucide-react";
import { QUARTERS, fmt, isGrade, round1, yearAverage } from "../../shared/grades.ts";
import { ApiError, api, errorText } from "@/lib/api";
import { dateRange } from "@/lib/format";
import type { Report, ReportTerm } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AverageRing, Avatar, GradeBar } from "@/components/brand";
import { Page, TopBar } from "@/components/shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";

type Note = { text: string; kind: "error" | "ok" | "warn" } | null;

/** A teacher previewing one student: /?preview&class=…&student=… (IDs only, never a code). */
function previewTarget(): { cls: string; student: string } | null {
  const q = new URLSearchParams(location.search);
  const cls = q.get("class"), student = q.get("student");
  return q.has("preview") && cls && student ? { cls, student } : null;
}

export function ParentApp() {
  const [preview] = useState(previewTarget);
  const [state, setState] = useState<"loading" | "code" | "report" | "preview-error">("loading");
  const [report, setReport] = useState<Report | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [open, setOpen] = useState<string | null>(null);

  const signedOut = useCallback((n: Note = null) => {
    setReport(null);
    setOpen(null);
    setNote(n);
    setState("code");
    document.title = "Report Cards";
  }, []);

  const load = useCallback(async () => {
    if (preview) {
      try {
        setReport(await api<Report>("GET",
          `/api/teacher/class/${encodeURIComponent(preview.cls)}/students/${encodeURIComponent(preview.student)}/preview`));
        setState("report");
      } catch (e) {
        setNote({ text: e instanceof ApiError && e.status === 401
          ? "Sign in on the teacher page first, then press Preview again."
          : errorText(e), kind: "error" });
        setState("preview-error");
      }
      return;
    }
    try {
      setReport(await api<Report>("GET", "/api/parent/report"));
      setState("report");
    } catch (e) {
      if (e instanceof ApiError && e.code === "replaced") signedOut({ text: e.message, kind: "warn" });
      else if (e instanceof ApiError && e.status === 401) signedOut();
      else signedOut({ text: errorText(e), kind: "error" });
    }
  }, [signedOut, preview]);

  useEffect(() => { load(); }, [load]);

  // Back and forward move between the quarter list and one report card.
  useEffect(() => {
    const onPop = (e: PopStateEvent) => setOpen(e.state?.term ?? null);
    // A page restored from the back/forward cache asks the server again, so a
    // report card never reappears after Forget this phone.
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) { if (!preview) signedOut(); load(); } };
    window.addEventListener("popstate", onPop);
    window.addEventListener("pageshow", onShow);
    return () => { window.removeEventListener("popstate", onPop); window.removeEventListener("pageshow", onShow); };
  }, [load, signedOut, preview]);

  const openTerm = (id: string) => {
    history.pushState({ term: id }, "");
    setOpen(id);
    window.scrollTo(0, 0);
  };

  const forget = async () => {
    try { await api("POST", "/api/parent/forget", {}); } catch { /* the page forgets either way */ }
    history.replaceState(null, "");
    signedOut({ text: "This phone has forgotten the code.", kind: "ok" });
  };

  const term = open && report ? report.terms.find((t) => t.id === open) : undefined;

  return (
    <>
      {term ? (
        <header className="no-print bg-card border-b">
          <div className="mx-auto flex min-h-[60px] max-w-md items-center justify-between gap-3 px-3">
            <Button variant="ghost" className="h-11 text-[15px] font-semibold" onClick={() => history.back()}>
              <ChevronLeft className="size-5" /> All quarters
            </Button>
            <div className="flex items-center gap-1">
              <Button variant="outline" className="h-11" onClick={() => window.print()}><Printer /> Print or save PDF</Button>
              <ThemeToggle />
            </div>
          </div>
        </header>
      ) : (
        <TopBar right={report?.class.school ? <span className="text-muted-foreground truncate text-[13px]">{report.class.school}</span> : undefined} />
      )}
      {preview && <PreviewBanner name={report?.student.name} />}
      {state === "loading" && <Page narrow><p className="text-muted-foreground">Loading…</p></Page>}
      {state === "preview-error" && (
        <Page narrow className="flex flex-col gap-3">
          {note && <Message note={note} />}
          <a href="/teacher" className="text-primary text-sm font-semibold underline-offset-4 hover:underline">Go to the teacher page</a>
        </Page>
      )}
      {state === "code" && (
        <CodeScreen note={note} onOpened={(r) => {
          history.replaceState(null, "");
          setReport(r);
          setOpen(null);
          setState("report");
        }} />
      )}
      {state === "report" && report && (
        term
          ? <ReportCard report={report} term={term} />
          : <Overview report={report} onOpen={openTerm} onForget={preview ? undefined : forget} />
      )}
    </>
  );
}

// ---------- code screen ----------

function CodeScreen({ note, onOpened }: { note: Note; onOpened: (r: Report) => void }) {
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Note>(note);

  useEffect(() => setMsg(note), [note]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.replace(/[^a-z0-9]/gi, "").length !== 10) {
      setMsg({ text: "The code has 10 letters and numbers, like ABCDE-FGH23.", kind: "error" });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<Report>("POST", "/api/parent/lookup", { code, remember });
      setCode("");
      onOpened(r);
    } catch (err) {
      setMsg({ text: errorText(err), kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page narrow className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-[32px] leading-[1.1] font-extrabold">See your child's report card</h1>
        <p className="text-muted-foreground text-base leading-relaxed">Type the access code printed on the slip from your child's adviser.</p>
      </div>

      <form onSubmit={submit} noValidate autoComplete="off" className="bg-card flex flex-col gap-4 rounded-[20px] border p-5">
        <div className="flex flex-col gap-2">
          <label htmlFor="code" className="text-sm font-semibold">Access code</label>
          <input
            id="code" value={code} onChange={(e) => setCode(e.target.value)}
            className="border-primary focus-visible:ring-accent h-16 rounded-[14px] border-2 bg-transparent px-4 text-center font-mono text-[26px] tracking-[0.18em] uppercase outline-none focus-visible:ring-4"
            inputMode="text" autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false}
            maxLength={20} placeholder="XXXXX-XXXXX" aria-describedby="code-help code-msg"
          />
          <span id="code-help" className="text-muted-foreground text-[13px]">10 letters and numbers. Capitals and the dash are optional.</span>
        </div>
        <div id="code-msg" role="alert">{msg && <Message note={msg} />}</div>
        <label className="bg-background flex cursor-pointer items-start gap-3 rounded-xl p-3">
          <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} className="mt-0.5 size-[22px]" />
          <span className="flex flex-col gap-0.5">
            <span className="text-[15px] font-semibold">Remember this phone</span>
            <span className="text-muted-foreground text-[13px]">Untick on a shared or borrowed phone.</span>
          </span>
        </label>
        <Button type="submit" disabled={busy} className="h-[54px] rounded-[14px] text-[17px] font-bold">
          {busy ? "Checking…" : <>View report card <ArrowRight className="size-5" /></>}
        </Button>
      </form>

      <details className="bg-card rounded-2xl border px-4 py-3.5" open>
        <summary className="cursor-pointer text-[15px] font-semibold">Where is my code?</summary>
        <div className="mt-3 flex items-center gap-3">
          <div aria-hidden="true" className="border-muted-foreground/50 bg-background flex h-[62px] w-24 flex-none flex-col gap-1.5 rounded-lg border-[1.5px] border-dashed p-2">
            <div className="bg-input h-1 w-3/5 rounded-sm" />
            <div className="bg-marigold h-2.5 w-[90%] rounded-[3px]" />
            <div className="bg-input h-1 w-3/4 rounded-sm" />
          </div>
          <p className="text-muted-foreground text-sm leading-snug">It is the large code on the paper slip. Lost it? Ask the adviser for a new one.</p>
        </div>
      </details>

      <a className="text-primary text-sm underline-offset-4 hover:underline" href="/privacy">How we handle your child's grades</a>
    </Page>
  );
}

function PreviewBanner({ name }: { name?: string }) {
  return (
    <div className="no-print bg-marigold text-[#0F1B2D]">
      <div className="mx-auto flex max-w-md flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 py-2.5 text-sm">
        <span className="flex items-center gap-2 font-semibold">
          <Eye className="size-4 flex-none" />
          {name ? `Teacher preview: what ${name}'s family sees` : "Teacher preview"}
        </span>
        <a href="/teacher" className="font-bold underline underline-offset-4">Back to dashboard</a>
      </div>
    </div>
  );
}

function Message({ note }: { note: NonNullable<Note> }) {
  return (
    <p className={cn("rounded-xl p-3 text-sm",
      note.kind === "error" && "bg-fail-soft text-fail",
      note.kind === "ok" && "bg-success-soft text-success",
      note.kind === "warn" && "bg-warning-soft text-warning")}>{note.text}</p>
  );
}

// ---------- overview ----------

function Overview({ report, onOpen, onForget }: { report: Report; onOpen: (id: string) => void; onForget?: () => void }) {
  const years = [...new Set(report.terms.map((t) => t.year))].sort().reverse();
  const [picked, setPicked] = useState(years[0] ?? "");
  const year = years.includes(picked) ? picked : years[0];
  const pass = report.class.pass;
  const inYear = report.terms.filter((t) => t.year === year);
  const ya = yearAverage(inYear.map((t) => t.average));
  const latest = inYear.at(-1);

  useEffect(() => { document.title = `${report.student.name} · Report Cards`; }, [report.student.name]);

  return (
    <Page narrow className="flex flex-col gap-4">
      <section className="bg-ink flex flex-col gap-[18px] rounded-[20px] p-[22px] text-white">
        <div className="flex items-center gap-3.5">
          <Avatar name={report.student.name} tint="var(--marigold)" className="font-display size-[52px] text-xl font-extrabold" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="font-display text-[22px] leading-tight font-bold">{report.student.name}</span>
            <span className="text-ink-muted text-sm">{report.class.name}</span>
          </div>
        </div>
        {year ? (
          <div className="flex items-center gap-[18px]">
            <AverageRing value={ya} label={`General average ${fmt(ya)} out of 100`} />
            <div className="flex flex-col gap-1.5">
              <span className="text-ink-muted text-[13px] font-semibold tracking-wider uppercase">General average</span>
              <span className="text-[15px] leading-snug">
                {inYear.length < QUARTERS.length ? `So far: ${inYear.length} of ${QUARTERS.length} quarters released` : `All ${QUARTERS.length} quarters, ${year}`}
              </span>
              {isGrade(ya) && (
                <span className={cn("self-start rounded-full px-2.5 py-1 text-[13px] font-semibold",
                  ya < pass ? "bg-[#5B1F1A] text-[#FFD7D2]" : "bg-[#1F5B3F] text-[#CDEFD9]")}>
                  {ya < pass ? "Below" : "Passing"} · mark is {pass}
                </span>
              )}
            </div>
          </div>
        ) : (
          <p className="text-ink-muted">{report.held
            ? "Your child's adviser has entered grades but has not released them yet. They usually appear on report card distribution day."
            : "Report cards appear here once your child's adviser releases them."}</p>
        )}
      </section>

      {years.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="year" className="text-sm font-semibold">School year</label>
          <NativeSelect id="year" value={year} onChange={(e) => setPicked(e.target.value)} className="bg-card h-12 rounded-xl">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </NativeSelect>
        </div>
      )}

      {year && (
        <section className="flex flex-col gap-2.5">
          <h2 className="font-display mt-1 text-[19px] font-bold">Quarters{years.length === 1 ? ` · ${year}` : ""}</h2>
          {QUARTERS.map((label, i) => {
            const t = inYear.find((x) => x.label === label);
            if (!t) {
              return (
                <div key={label} className="text-muted-foreground flex items-center gap-3.5 rounded-2xl border border-dashed border-[#CBD2DE] p-4">
                  <div className="bg-secondary flex size-11 flex-none items-center justify-center rounded-xl"><Lock className="size-[18px]" /></div>
                  <div className="flex flex-col">
                    <span className="text-base font-semibold">{label}</span>
                    <span className="text-[13px]">Not yet released</span>
                  </div>
                </div>
              );
            }
            return (
              <button key={label} type="button" onClick={() => onOpen(t.id)}
                className="bg-card hover:border-primary/40 flex min-h-11 items-center gap-3.5 rounded-2xl border p-4 text-left transition-colors">
                <div className="bg-accent text-primary font-display flex size-11 flex-none items-center justify-center rounded-xl text-base font-extrabold">Q{i + 1}</div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-base font-bold">{label}</span>
                  <span className="text-muted-foreground text-[13px]">{dateRange(t.from, t.to) || "View report card"}</span>
                </div>
                <span className={cn("font-display text-[22px] font-extrabold tabular-nums", below(t.average, pass) && "text-fail")}>{fmt(t.average)}</span>
                <ChevronRight className="text-muted-foreground size-[18px]" />
              </button>
            );
          })}
          {report.held > 0 && <p className="bg-accent text-accent-foreground rounded-xl p-3 text-sm">Some quarters have grades that are not released yet.</p>}
        </section>
      )}

      {latest && (
        <section className="bg-card flex flex-col gap-3 rounded-2xl border p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-display text-[17px] font-bold">Latest quarter by subject</h2>
            <span className="text-muted-foreground text-[13px]">{latest.label}</span>
          </div>
          {latest.grades.map((g) => (
            <div key={g.subject} className="grid grid-cols-[112px_minmax(0,1fr)_44px] items-center gap-2.5">
              <span className="truncate text-sm">{g.subject}</span>
              <GradeBar value={g.grade} pass={pass} />
              <span className={cn("text-right text-sm font-bold tabular-nums", below(g.grade, pass) && "text-fail")}>{fmt(g.grade)}</span>
            </div>
          ))}
          <button type="button" onClick={() => onOpen(latest.id)} className="text-primary self-start text-sm font-semibold underline-offset-4 hover:underline">
            Open full report card
          </button>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <a className="text-primary text-sm underline-offset-4 hover:underline" href="/privacy">How we handle your child's grades</a>
        {onForget && <Button variant="outline" className="h-11 rounded-xl" onClick={onForget}>Forget this phone</Button>}
      </div>
    </Page>
  );
}

// ---------- one report card ----------

function ReportCard({ report, term }: { report: Report; term: ReportTerm }) {
  const pass = report.class.pass;
  const sameYear = report.terms.filter((t) => t.year === term.year);
  const prev = sameYear[sameYear.indexOf(term) - 1];
  const change = prev && isGrade(prev.average) && isGrade(term.average) ? round1(term.average - prev.average) : null;
  const belowCount = term.grades.filter((g) => below(g.grade, pass)).length;

  return (
    <Page narrow className="flex flex-col gap-4">
      <section className="bg-card print-plain overflow-hidden rounded-[20px] border">
        <div className="flex flex-col gap-1 border-b p-5">
          <span className="text-primary text-[13px] font-bold tracking-wider uppercase">Report card</span>
          <h1 className="font-display text-[26px] leading-tight font-extrabold">{term.label}</h1>
          <span className="text-muted-foreground text-sm">School year {term.year}{term.from || term.to ? ` · ${dateRange(term.from, term.to)}` : ""}</span>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <span className="bg-background rounded-full px-2.5 py-1 text-[13px] font-semibold">{report.student.name}</span>
            <span className="bg-background rounded-full px-2.5 py-1 text-[13px] font-semibold">{report.class.name}</span>
          </div>
        </div>

        <div className="bg-ink flex items-center justify-between px-5 py-[18px] text-white">
          <div className="flex flex-col gap-0.5">
            <span className="text-ink-muted text-[13px] font-semibold tracking-wider uppercase">General average</span>
            {change !== null && (
              <span className="text-ink-muted text-sm">
                {change === 0 ? `Same as ${prev.label}` : `${change > 0 ? "Up" : "Down"} ${Math.abs(change).toFixed(1)} from ${prev.label}`}
              </span>
            )}
          </div>
          <span className={cn("font-display text-[40px] font-extrabold tabular-nums", below(term.average, pass) ? "text-[#FFB4AB]" : "text-marigold")}>{fmt(term.average)}</span>
        </div>

        <table className="w-full border-collapse text-base">
          <caption className="sr-only">{term.label} grades by subject</caption>
          <thead>
            <tr className="text-muted-foreground border-b text-[13px]">
              <th scope="col" className="px-5 py-3 text-left font-semibold">Subject</th>
              <th scope="col" className="px-5 py-3 text-right font-semibold">Grade</th>
            </tr>
          </thead>
          <tbody>
            {term.grades.map((g) => (
              <tr key={g.subject} className="border-b last:border-b-0">
                <td className="px-5 py-3">
                  <div className="flex flex-col gap-1.5">
                    <span>{g.subject}</span>
                    <GradeBar value={g.grade} pass={pass} className="h-1.5" />
                  </div>
                </td>
                <td className={cn("w-[70px] px-5 py-3 text-right font-bold tabular-nums", below(g.grade, pass) && "text-fail")}>
                  {fmt(g.grade)}{below(g.grade, pass) && <span className="sr-only"> (below passing)</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {belowCount > 0 && (
          <div className="bg-fail-soft text-fail flex items-center gap-2.5 px-5 py-3.5 text-sm leading-snug">
            <CircleAlert className="size-[18px] flex-none" />
            <span>{belowCount === 1 ? "1 subject is" : `${belowCount} subjects are`} below the passing mark of {pass}. Talk with the adviser if you have questions.</span>
          </div>
        )}
      </section>
      <p className="text-muted-foreground text-[13px] leading-normal">Grades as recorded by the class adviser. The printed report card from school is the official copy.</p>
    </Page>
  );
}

const below = (n: unknown, pass: number) => isGrade(n) && n < pass;
