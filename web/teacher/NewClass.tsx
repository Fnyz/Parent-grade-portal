// Adds a section. Each class keeps its own students, subjects, quarters and
// access codes; the teacher switches between them with the class picker.

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ApiError, api, errorText } from "@/lib/api";
import type { ClassView } from "@/lib/types";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** `children` is the button that opens it, so each place can style its own. */
export function NewClass({ school, onCreated, onSignedOut, children }: {
  school: string; onCreated: (v: ClassView) => void; onSignedOut: () => void; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sch, setSch] = useState(school);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Give the class a name, like Grade 5 - Narra."); return; }
    setBusy(true);
    setError(null);
    try {
      const v = await api<ClassView>("POST", "/api/teacher/classes", { name, school: sch });
      setOpen(false);
      setName("");
      onCreated(v);
      toast.success(`${v.class.name} added. Add its students next.`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { setOpen(false); onSignedOut(); return; }
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setSch(school); setError(null); } }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add a class</DialogTitle>
            <DialogDescription>
              One class per section. It starts with the usual subjects, which you can change in Settings.
            </DialogDescription>
          </DialogHeader>
          <Field id="nc-name" label="Class name">
            <Input id="nc-name" value={name} maxLength={80} autoComplete="off" placeholder="Grade 5 - Narra"
              onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field id="nc-school" label="School">
            <Input id="nc-school" value={sch} maxLength={120} onChange={(e) => setSch(e.target.value)} />
          </Field>
          {error && <p role="alert" className="bg-fail/10 text-fail rounded-md p-3 text-sm">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add class"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
