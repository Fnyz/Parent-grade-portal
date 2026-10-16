import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Eye, FileSpreadsheet, KeyRound, Pencil, Printer, Trash2 } from "lucide-react";
import { ApiError, errorText } from "@/lib/api";
import { store } from "@/lib/storage";
import type { ClassView, Student } from "@/lib/types";
import { Avatar } from "@/components/brand";
import { useConfirm } from "@/components/confirm";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DRAFT, useClass } from "./context";
import { ImportPanel } from "./ImportPanel";
import { Slips } from "./slips";

export function StudentsTab() {
  const { view, setView, call, base } = useClass();
  const confirm = useConfirm();
  const c = view.class;
  const [name, setName] = useState("");
  const [no, setNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [importing, setImporting] = useState<File | null>(null);
  const [printing, setPrinting] = useState<Student[] | null>(null);
  const donePrinting = useCallback(() => setPrinting(null), []);

  const run = async (task: () => Promise<void>, done?: string) => {
    try {
      await task();
      if (done) toast.success(done);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) toast.error(errorText(e));
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Type the student's name."); return; }
    setBusy(true);
    await run(async () => {
      const v = await call<ClassView & { added: string[] }>("POST", `${base}/students`, { name, no });
      if (!v.added.length) throw new Error(`${name.trim()} is already in this class.`);
      setView(v);
      setName(""); setNo("");
      document.getElementById("st-name")?.focus();
    }, "Student added, with a new access code.");
    setBusy(false);
  };

  const reissue = async (s: Student) => {
    if (!(await confirm({
      title: `Give ${s.name} a new access code?`,
      body: <><p>The old code stops working at once, including on phones that remembered it.</p><p>Print a new slip for the family.</p></>,
      confirm: "Make a new code",
    }))) return;
    await run(async () => {
      const { code } = await call<{ code: string }>("POST", `${base}/students/${s.id}/code`, {});
      setView({ ...view, codes: { ...view.codes, [s.id]: code } });
    }, `${s.name} has a new code. The old one no longer works.`);
  };

  const remove = async (s: Student) => {
    if (!(await confirm({
      title: `Remove ${s.name}?`,
      body: "Their grades for every quarter are deleted and their access code stops working. This cannot be undone.",
      confirm: "Remove student", danger: true,
    }))) return;
    await run(async () => {
      setView(await call<ClassView>("DELETE", `${base}/students/${s.id}`));
      for (const k of store.keys(`${DRAFT}${c.id}:`)) {
        const d = store.get<{ edits?: Record<string, unknown> }>(k);
        if (d?.edits?.[s.id]) { delete d.edits[s.id]; store.set(k, d); }
      }
    }, `${s.name} was removed.`);
  };

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader><CardTitle>Add a student</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={add} noValidate className="grid items-end gap-3 sm:grid-cols-[2fr_1fr_auto]">
            <Field id="st-name" label="Full name">
              <Input id="st-name" value={name} maxLength={120} autoComplete="off" onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field id="st-no" label="LRN or student no. (optional)">
              <Input id="st-no" value={no} maxLength={40} autoComplete="off" onChange={(e) => setNo(e.target.value)} />
            </Field>
            <Button type="submit" disabled={busy} className="h-11">Add</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import, print or preview</CardTitle>
          <CardDescription>Import a spreadsheet with a Name column. Columns named after your subjects are read as grades. Preview shows exactly what a family sees.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            <input id="st-file" type="file" accept=".xlsx,.xls,.csv,.ods" hidden onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) setImporting(f);
            }} />
            <Button variant="outline" onClick={() => document.getElementById("st-file")?.click()}><FileSpreadsheet /> Import spreadsheet</Button>
            <Button variant="outline" disabled={!c.students.length} onClick={() => setPrinting(c.students)}><Printer /> Print all access slips</Button>
            <Button variant="outline" asChild>
              <a href="/" target="_blank" rel="noopener"><ExternalLink /> Open parent page</a>
            </Button>
          </div>
          {importing && <ImportPanel key={importing.name + importing.lastModified} file={importing} onClose={() => setImporting(null)} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Students ({c.students.length})</CardTitle>
          <CardDescription>Give each code to one family, in person. Never post codes in a group chat.</CardDescription>
        </CardHeader>
        <CardContent>
          {!c.students.length ? <p className="text-muted-foreground">No students yet.</p> : (
            <ul className="divide-y">
              {c.students.map((s) => editing === s.id
                ? <EditRow key={s.id} student={s} onDone={() => setEditing(null)} />
                : (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="flex min-w-40 items-start gap-3">
                    <Avatar name={s.name} className="mt-0.5" />
                    <div>
                      <div className="font-semibold">{s.name}</div>
                      {s.no && <div className="text-muted-foreground text-sm">{s.no}</div>}
                      <div className="flex items-center gap-1">
                        <span className="font-mono tracking-wider">{view.codes[s.id] ?? "—"}</span>
                        {view.codes[s.id] && <CopyCode code={view.codes[s.id]} name={s.name} />}
                      </div>
                    </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => setEditing(s.id)}><Pencil /> Edit</Button>
                      <Button size="sm" variant="outline" asChild>
                        <a href={previewUrl(c.id, s.id)} target="_blank" rel="noopener" aria-label={`Preview ${s.name}'s parent page`}>
                          <Eye /> Preview
                        </a>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setPrinting([s])}><Printer /> Slip</Button>
                      <Button size="sm" variant="outline" onClick={() => reissue(s)}><KeyRound /> New code</Button>
                      <Button size="sm" variant="outline" className="text-destructive" onClick={() => remove(s)}><Trash2 /> Remove</Button>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {printing && <Slips cls={c} codes={view.codes} students={printing} onDone={donePrinting} />}
    </div>
  );
}

/** The parent page in preview mode for one student. IDs only: the access code never goes in a web address. */
const previewUrl = (classId: string, studentId: string) =>
  `/?preview&class=${encodeURIComponent(classId)}&student=${encodeURIComponent(studentId)}`;

/** Copies an access code, so the teacher does not have to select it by hand. */
function CopyCode({ code, name }: { code: string; name: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Older browsers, or a page not served over HTTPS: copy through a hidden text box.
      const box = document.createElement("textarea");
      box.value = code;
      box.setAttribute("readonly", "");
      box.style.position = "fixed";
      box.style.opacity = "0";
      document.body.append(box);
      box.select();
      const ok = document.execCommand("copy");
      box.remove();
      if (!ok) { toast.error("Could not copy. Select the code and copy it instead."); return; }
    }
    setCopied(true);
    toast.success(`Copied ${name}'s code. Send it to that family only.`);
  };

  return (
    <Button type="button" variant="ghost" size="icon-sm" onClick={copy}
      aria-label={copied ? `Copied ${name}'s code` : `Copy ${name}'s code`} title="Copy code">
      {copied ? <Check className="text-success" /> : <Copy />}
    </Button>
  );
}

function EditRow({ student, onDone }: { student: Student; onDone: () => void }) {
  const { setView, call, base } = useClass();
  const [name, setName] = useState(student.name);
  const [no, setNo] = useState(student.no);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      setView(await call<ClassView>("PATCH", `${base}/students/${student.id}`, { name, no }));
      toast.success("Student updated.");
      onDone();
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="py-3">
      <form onSubmit={submit} noValidate className="grid items-end gap-3 sm:grid-cols-[2fr_1fr_auto]">
        <Field id={`e-name-${student.id}`} label="Full name">
          <Input id={`e-name-${student.id}`} value={name} maxLength={120} autoFocus onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field id={`e-no-${student.id}`} label="LRN or student no.">
          <Input id={`e-no-${student.id}`} value={no} maxLength={40} onChange={(e) => setNo(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={onDone}>Cancel</Button>
          <Button type="submit" className="h-11" disabled={busy}>Save</Button>
        </div>
      </form>
    </li>
  );
}
