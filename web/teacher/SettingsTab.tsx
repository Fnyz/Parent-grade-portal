import { useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { isGrade } from "../../shared/grades.ts";
import { ApiError, errorText } from "@/lib/api";
import type { ClassView } from "@/lib/types";
import { useConfirm } from "@/components/confirm";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { plural } from "@/lib/format";
import { useClass } from "./context";

export function SettingsTab() {
  return <div className="grid gap-4"><Details /><Subjects /><DeleteClass /></div>;
}

function useSave() {
  const { setView, call, base } = useClass();
  return async (body: Record<string, unknown>, done: string): Promise<ClassView | null> => {
    try {
      const v = await call<ClassView>("PUT", base, body);
      setView(v);
      toast.success(done);
      return v;
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) toast.error(errorText(e));
      return null;
    }
  };
}

function Details() {
  const { view } = useClass();
  const save = useSave();
  const [name, setName] = useState(view.class.name);
  const [school, setSchool] = useState(view.class.school);
  const [pass, setPass] = useState(String(view.class.pass));
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = Number(pass);
    if (pass.trim() === "" || !isGrade(p)) { toast.error("The passing mark must be a number from 0 to 100."); return; }
    setBusy(true);
    await save({ name, school, pass: p }, "Class details saved.");
    setBusy(false);
  };

  return (
    <Card>
      <CardHeader><CardTitle>Class details</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate className="grid gap-3">
          <Field id="c-name" label="Class name"><Input id="c-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></Field>
          <Field id="c-school" label="School"><Input id="c-school" value={school} maxLength={120} onChange={(e) => setSchool(e.target.value)} /></Field>
          <Field id="c-pass" label="Passing mark" hint="Grades below this show in red to you and to parents.">
            <Input id="c-pass" value={pass} inputMode="decimal" className="max-w-32" onChange={(e) => setPass(e.target.value)} />
          </Field>
          <div><Button type="submit" disabled={busy}>Save details</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}

function Subjects() {
  const { view } = useClass();
  const confirm = useConfirm();
  const save = useSave();
  const [subs, setSubs] = useState(() => view.class.subjects.map((x) => ({ ...x, key: x.id })));
  const [busy, setBusy] = useState(false);

  const move = (i: number, d: number) => setSubs((s) => {
    const next = [...s];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    return next;
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const removed = view.class.subjects.filter((x) => !subs.some((y) => y.id === x.id));
    if (removed.length && !(await confirm({
      title: `Remove ${removed.map((x) => x.name).join(", ")}?`,
      body: `Grades already entered for ${removed.length === 1 ? "it" : "them"} will no longer show to you or to parents.`,
      confirm: "Remove", danger: true,
    }))) return;
    setBusy(true);
    const v = await save({ subjects: subs.map(({ id, name }) => ({ id: id || null, name })) }, "Subjects saved.");
    setBusy(false);
    // Take the server's ids, so new subjects keep theirs on the next save.
    if (v) setSubs(v.class.subjects.map((x) => ({ ...x, key: x.id })));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subjects</CardTitle>
        <CardDescription>One list for the whole class, used in every quarter. Write the names as they appear on the report card.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate className="grid gap-2">
          {subs.map((x, i) => (
            <div key={x.key} className="flex items-center gap-1.5">
              <Input value={x.name} maxLength={60} aria-label={`Subject ${i + 1}`} autoFocus={!x.id && i === subs.length - 1}
                onChange={(e) => setSubs((s) => s.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />
              <Button type="button" variant="ghost" size="icon" disabled={i === 0} aria-label={`Move ${x.name} up`} onClick={() => move(i, -1)}><ArrowUp /></Button>
              <Button type="button" variant="ghost" size="icon" disabled={i === subs.length - 1} aria-label={`Move ${x.name} down`} onClick={() => move(i, 1)}><ArrowDown /></Button>
              <Button type="button" variant="ghost" size="icon" className="text-destructive" aria-label={`Remove ${x.name}`} onClick={() => setSubs((s) => s.filter((_, j) => j !== i))}><X /></Button>
            </div>
          ))}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setSubs((s) => [...s, { id: "", name: "", key: crypto.randomUUID() }])}><Plus /> Add subject</Button>
            <Button type="submit" disabled={busy}>Save subjects</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** Permanent: the teacher types the class name to confirm. */
function DeleteClass() {
  const { view, call, base, classCount, onDeleted } = useClass();
  const c = view.class;
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const matches = typed.trim().toLowerCase() === c.name.trim().toLowerCase();
  const last = classCount <= 1;

  const remove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matches) return;
    setBusy(true);
    try {
      const { classes } = await call<{ classes: string[] }>("DELETE", base);
      setOpen(false);
      toast.success(`${c.name} was deleted.`);
      await onDeleted(c.id, classes);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>Delete this class</CardTitle>
        <CardDescription>
          {last
            ? "This is your only class. Add another class before you can delete this one."
            : "Deletes the class with all its students, grades and access codes. This cannot be undone."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); setTyped(""); }}>
          <DialogTrigger asChild>
            <Button variant="outline" className="text-destructive" disabled={last}><Trash2 /> Delete class</Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={remove} noValidate className="grid gap-4">
              <DialogHeader>
                <DialogTitle>Delete {c.name}?</DialogTitle>
                <DialogDescription asChild>
                  <div className="grid gap-2 text-left">
                    <p>This permanently deletes:</p>
                    <ul className="list-disc pl-5">
                      <li>{plural(c.students.length, "student")} and {c.students.length === 1 ? "their access code" : "their access codes"}. Codes stop working at once, even on phones that remembered them.</li>
                      <li>{c.terms.length ? `Every grade entered in its ${plural(c.terms.length, "quarter")}.` : "Its subjects and settings."}</li>
                    </ul>
                    <p>It cannot be undone.</p>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <Field id="del-name" label={<>Type <span className="font-semibold">{c.name}</span> to confirm</>}>
                <Input id="del-name" value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
              </Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" variant="destructive" disabled={!matches || busy}>
                  {busy ? "Deleting…" : "Delete class"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
