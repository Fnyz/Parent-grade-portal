import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { QUARTERS } from "../../shared/grades.ts";
import { ApiError, errorText } from "@/lib/api";
import { currentSchoolYear } from "@/lib/format";
import { store } from "@/lib/storage";
import type { ClassView, Term } from "@/lib/types";
import { useConfirm } from "@/components/confirm";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { DRAFT, useClass } from "./context";

export function QuartersTab() {
  const { view, setView, call, base } = useClass();
  const c = view.class;
  const [year, setYear] = useState(currentSchoolYear);
  const used = c.terms.filter((t) => t.year === year).map((t) => t.label);
  const [label, setLabel] = useState(() => QUARTERS.find((q) => !used.includes(q)) ?? QUARTERS[0]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      setView(await call<ClassView>("POST", `${base}/terms`, { year: year.trim(), label, from, to }));
      toast.success(`${label} ${year.trim()} added. It stays hidden from parents until you turn on Visible to parents.`);
      const next = QUARTERS[QUARTERS.indexOf(label) + 1];
      if (next) setLabel(next);
      setFrom(""); setTo("");
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const years = [...new Set(c.terms.map((t) => t.year))].sort().reverse();

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader><CardTitle>Add a quarter</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={add} noValidate className="grid gap-3 sm:grid-cols-2">
            <Field id="q-year" label="School year">
              <Input id="q-year" value={year} inputMode="numeric" placeholder="2026-2027" maxLength={9} onChange={(e) => setYear(e.target.value)} />
            </Field>
            <Field id="q-label" label="Quarter">
              <NativeSelect id="q-label" value={label} onChange={(e) => setLabel(e.target.value)}>
                {QUARTERS.map((q) => <option key={q} value={q}>{q}</option>)}
              </NativeSelect>
            </Field>
            <Field id="q-from" label="Starts (optional)">
              <Input id="q-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field id="q-to" label="Ends (optional)">
              <Input id="q-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
            <div className="sm:col-span-2"><Button type="submit" disabled={busy}>Add quarter</Button></div>
          </form>
        </CardContent>
      </Card>

      {years.map((y) => (
        <Card key={y}>
          <CardHeader><CardTitle>School year {y}</CardTitle></CardHeader>
          <CardContent className="divide-y">
            {c.terms.filter((t) => t.year === y).map((t) => <TermRow key={t.id} term={t} />)}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TermRow({ term: t }: { term: Term }) {
  const { view, setView, call, base } = useClass();
  const confirm = useConfirm();
  const [from, setFrom] = useState(t.from);
  const [to, setTo] = useState(t.to);

  const patch = async (body: Record<string, unknown>, done: string) => {
    try {
      setView(await call<ClassView>("PATCH", `${base}/terms/${t.id}`, body));
      toast.success(done);
      return true;
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) toast.error(errorText(e));
      return false;
    }
  };

  const saveDates = async (f: string, tt: string) => {
    if (!(await patch({ from: f, to: tt }, `${t.label} dates saved.`))) { setFrom(t.from); setTo(t.to); }
  };

  const setVisible = async (on: boolean) => {
    if (on && !(await confirm({ title: `Show ${t.label} ${t.year} to parents?`, body: "Parents will see these grades now.", confirm: "Show to parents" }))) return;
    await patch({ visible: on }, on ? `${t.label} is now visible to parents.` : `${t.label} is hidden from parents.`);
  };

  const remove = async () => {
    if (!(await confirm({
      title: `Delete ${t.label} ${t.year}?`,
      body: "Every grade entered for it is deleted. This cannot be undone.",
      confirm: "Delete quarter", danger: true,
    }))) return;
    try {
      setView(await call<ClassView>("DELETE", `${base}/terms/${t.id}`));
      store.del(`${DRAFT}${view.class.id}:${t.id}`);
      toast.success(`${t.label} ${t.year} was deleted.`);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) toast.error(errorText(e));
    }
  };

  return (
    <div className="term-row grid gap-3 py-4 first:pt-0 last:pb-0">
      <h3 className="font-semibold">{t.label}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`f-${t.id}`} label="Starts">
          <Input id={`f-${t.id}`} type="date" value={from} onChange={(e) => { setFrom(e.target.value); saveDates(e.target.value, to); }} />
        </Field>
        <Field id={`t-${t.id}`} label="Ends">
          <Input id={`t-${t.id}`} type="date" value={to} onChange={(e) => { setTo(e.target.value); saveDates(from, e.target.value); }} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-3 font-medium">
          <Switch checked={t.visible} onCheckedChange={setVisible} />
          Visible to parents
        </label>
        <Button variant="outline" size="sm" className="text-destructive" onClick={remove}><Trash2 /> Delete quarter</Button>
      </div>
    </div>
  );
}
