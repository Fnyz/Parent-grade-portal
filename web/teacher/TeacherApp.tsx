// Teacher dashboard. Every change goes to the server, which checks the
// session and that this teacher owns the class it touches.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, LogOut, Plus } from "lucide-react";
import { toast } from "sonner";
import { ApiError, api, errorText } from "@/lib/api";
import { store } from "@/lib/storage";
import type { ClassView, Me } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar, Logo } from "@/components/brand";
import { ConfirmProvider } from "@/components/confirm";
import { ThemeToggle } from "@/components/theme-toggle";
import { Field } from "@/components/field";
import { Page, TopBar } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Toaster } from "@/components/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Ctx, DRAFT } from "./context";
import { NewClass } from "./NewClass";
import { GradesTab } from "./GradesTab";
import { StudentsTab } from "./StudentsTab";
import { QuartersTab } from "./QuartersTab";
import { SettingsTab } from "./SettingsTab";

const TABS = ["grades", "students", "quarters", "settings"] as const;
type Tab = (typeof TABS)[number];
interface ClassInfo { id: string; name: string; count: number }

export function TeacherApp() {
  const [state, setState] = useState<"loading" | "signin" | "app">("loading");
  const [note, setNote] = useState<{ text: string; ok?: boolean } | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [view, setView] = useState<ClassView | null>(null);
  const [tab, setTab] = useState<Tab>(() => {
    const t = store.get<Tab>("pgp-tab");
    return t && TABS.includes(t) ? t : "grades";
  });

  const toSignIn = useCallback((text?: string, ok?: boolean) => {
    setNote(text ? { text, ok } : null);
    setState("signin");
  }, []);

  const call = useCallback(async <T,>(method: string, path: string, body?: unknown): Promise<T> => {
    try {
      return await api<T>(method, path, body);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        toSignIn("Your session ended. Sign in again; unsaved grades are kept on this phone.");
      }
      throw e;
    }
  }, [toSignIn]);

  const openClass = useCallback(async (id: string) => {
    setView(await call<ClassView>("GET", `/api/teacher/class/${id}`));
    store.set("pgp-class", id);
  }, [call]);

  const start = useCallback(async () => {
    const m = await api<Me>("GET", "/api/teacher/me");
    if (!m.classes.length) {
      toSignIn("Your account has no class yet. Ask the person who set up this site to add one.");
      return;
    }
    setMe(m);
    // Names and sizes for the class list. A class that cannot be read is left out.
    const views = await Promise.all(m.classes.map((id) => api<ClassView>("GET", `/api/teacher/class/${id}`).catch(() => null)));
    setClasses(views.filter((v): v is ClassView => !!v).map((v) => ({ id: v.class.id, name: v.class.name, count: v.class.students.length })));
    const last = store.get<string>("pgp-class");
    await openClass(last && m.classes.includes(last) ? last : m.classes[0]);
    setState("app");
  }, [openClass, toSignIn]);

  useEffect(() => {
    start().catch((e) => {
      if (e instanceof ApiError && e.status === 401) toSignIn();
      else toSignIn(errorText(e));
    });
  }, [start, toSignIn]);

  useEffect(() => {
    if (!view) return;
    document.title = `${view.class.name} · Teacher`;
    // Keep the class list in step with renames and new or removed students.
    setClasses((cs) => cs.map((c) => (c.id === view.class.id ? { ...c, name: view.class.name, count: view.class.students.length } : c)));
  }, [view]);

  const chooseTab = (v: Tab) => { setTab(v); store.set("pgp-tab", v); };

  const choose = (id: string) => {
    if (id !== view?.class.id) openClass(id).catch((err) => toast.error(errorText(err)));
  };

  const added = (v: ClassView) => {
    setClasses((cs) => [...cs, { id: v.class.id, name: v.class.name, count: 0 }]);
    setView(v);
    store.set("pgp-class", v.class.id);
    chooseTab("students");
  };

  const deleted = useCallback(async (id: string, remaining: string[]) => {
    setClasses((cs) => cs.filter((c) => c.id !== id));
    for (const k of store.keys(`${DRAFT}${id}:`)) store.del(k);
    store.del(`pgp-term:${id}`);
    await openClass(remaining[0]);
    setTab("grades");
    store.set("pgp-tab", "grades");
  }, [openClass]);

  const signOut = async () => {
    // Unsaved grades stay on this phone as a draft; GradesTab saves what it can as it closes.
    setState("signin");
    try { await api("POST", "/api/logout", {}); } catch { /* signed out here either way */ }
    setView(null);
    toSignIn("Signed out.", true);
  };

  const ctx = useMemo(() => view && {
    view,
    setView,
    call,
    base: `/api/teacher/class/${view.class.id}`,
    classCount: classes.length,
    onDeleted: deleted,
  }, [view, call, classes.length, deleted]);

  const newClass = (onDark: boolean, className?: string) => (
    <NewClass school={view?.class.school ?? ""} onCreated={added} onSignedOut={() => toSignIn("Your session ended. Sign in again.")}>
      <Button type="button" variant="outline" className={cn(onDark
        ? "border-ink-2 hover:bg-ink-2 h-11 justify-start border-dashed bg-transparent text-[#D6DEEC] hover:text-white"
        : "", className)}>
        <Plus /> New class
      </Button>
    </NewClass>
  );

  return (
    <ConfirmProvider>
      {state === "loading" && <><TopBar /><Page><p className="text-muted-foreground">Loading…</p></Page></>}
      {state === "signin" && <><TopBar /><SignIn note={note} onSignedIn={() => start().catch((e) => toSignIn(errorText(e)))} /></>}
      {state === "app" && ctx && (
        <Ctx.Provider value={ctx}>
          <div className="lg:flex lg:min-h-screen">
            {/* Computer: a sidebar with every class. */}
            <aside className="no-print bg-ink hidden w-64 flex-none flex-col gap-6 px-4 py-5 text-white lg:flex">
              <div className="px-1.5"><Logo onDark subtitle="Teacher" /></div>
              <nav aria-label="Classes" className="flex flex-col gap-1">
                <span className="px-2 pb-1.5 text-xs font-bold tracking-widest text-[#8F9BB2] uppercase">My classes</span>
                {classes.map((c) => (
                  <button key={c.id} type="button" onClick={() => choose(c.id)} aria-current={c.id === ctx.view.class.id ? "page" : undefined}
                    className={cn("flex min-h-11 items-center justify-between gap-2 rounded-[10px] px-2.5 text-left text-sm font-semibold transition-colors",
                      c.id === ctx.view.class.id ? "bg-ink-2" : "hover:bg-ink-2/60")}>
                    <span className="truncate">{c.name}</span>
                    <span className="bg-ink-2 rounded-full px-2 py-0.5 text-xs font-bold text-[#D6DEEC]">{c.count}</span>
                  </button>
                ))}
                <div className="mt-1.5 grid">{newClass(true)}</div>
              </nav>
              <a href="/" target="_blank" rel="noopener"
                className="hover:bg-ink-2 flex min-h-11 items-center gap-2 rounded-[10px] px-2.5 text-sm font-semibold text-[#D6DEEC] hover:text-white">
                <ExternalLink className="size-4" /> Open parent page
              </a>
              <div className="border-ink-2 mt-auto flex items-center gap-2.5 border-t px-2 pt-3">
                <Avatar name={me?.name || "Teacher"} tint="var(--primary)" className="text-white" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold">{me?.name}</span>
                  <span className="text-ink-muted truncate text-xs">{me?.email}</span>
                </div>
                <Button variant="ghost" size="icon" aria-label="Sign out" onClick={signOut}
                  className="hover:bg-ink-2 text-[#D6DEEC] hover:text-white"><LogOut /></Button>
              </div>
              <ThemeToggle onDark showLabel className="-mt-3 justify-start self-start" />
            </aside>

            {/* Phone and tablet: a dark header with the class picker. */}
            <header className="no-print bg-ink flex flex-col gap-3 px-4 pt-3.5 pb-4 text-white lg:hidden">
              <div className="flex items-center justify-between gap-3">
                <Logo onDark subtitle={me?.name} />
                <div className="flex items-center gap-1">
                  <ThemeToggle onDark />
                  <Button variant="ghost" size="sm" onClick={signOut} className="hover:bg-ink-2 h-10 text-[#D6DEEC] hover:text-white"><LogOut /> Sign out</Button>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <label htmlFor="class-select" className="sr-only">Class</label>
                  <NativeSelect id="class-select" value={ctx.view.class.id} onChange={(e) => choose(e.target.value)}
                    className="border-ink-2 bg-ink-2/60 font-display h-11 rounded-xl text-[17px] font-bold text-white">
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </NativeSelect>
                </div>
                {newClass(true, "w-auto border-solid")}
              </div>
            </header>

            <main className="min-w-0 flex-1 px-4 pt-5 pb-12 sm:px-6 lg:px-8 lg:pt-7">
              <div className="mx-auto max-w-6xl">
                {/* Keyed by class, so switching sections starts every tab fresh. */}
                <Tabs key={ctx.view.class.id} value={tab} onValueChange={(v) => chooseTab(v as Tab)} className="gap-5">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="hidden flex-col gap-1 lg:flex">
                      {ctx.view.class.school && <span className="text-muted-foreground text-sm">{ctx.view.class.school}</span>}
                      <h1 className="font-display text-[32px] leading-tight font-extrabold">{ctx.view.class.name}</h1>
                    </div>
                    <TabsList className="bg-secondary h-12 w-full rounded-xl p-1 sm:w-auto">
                      {(["grades", "students", "quarters", "settings"] as const).map((t) => (
                        <TabsTrigger key={t} value={t}
                          className="data-[state=active]:bg-card h-10 rounded-[9px] px-4 text-sm font-semibold capitalize data-[state=active]:font-bold data-[state=active]:shadow-sm">
                          {t}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>
                  <TabsContent value="grades"><GradesTab goTo={chooseTab} /></TabsContent>
                  <TabsContent value="students"><StudentsTab /></TabsContent>
                  <TabsContent value="quarters"><QuartersTab /></TabsContent>
                  <TabsContent value="settings"><SettingsTab /></TabsContent>
                </Tabs>
              </div>
            </main>
          </div>
        </Ctx.Provider>
      )}
      <Toaster position="top-center" richColors closeButton />
    </ConfirmProvider>
  );
}

function SignIn({ note, onSignedIn }: { note: { text: string; ok?: boolean } | null; onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(note);

  useEffect(() => setMsg(note), [note]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) { setMsg({ text: "Type your email and password." }); return; }
    setBusy(true);
    try {
      await api("POST", "/api/login", { email: email.trim(), password });
      setPassword("");
      onSignedIn();
    } catch (err) {
      setMsg({ text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page narrow className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="bg-marigold-soft text-warning self-start rounded-full px-2.5 py-1 text-[13px] font-bold tracking-wider uppercase">For teachers</span>
        <h1 className="font-display text-[32px] leading-[1.1] font-extrabold">Sign in to your classes</h1>
      </div>
      <form onSubmit={submit} noValidate className="bg-card flex flex-col gap-4 rounded-[20px] border p-5">
        <Field id="email" label="Email">
          <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field id="password" label="Password">
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div role="alert">
          {msg && <p className={cn("rounded-xl p-3 text-sm", msg.ok ? "bg-success-soft text-success" : "bg-fail-soft text-fail")}>{msg.text}</p>}
        </div>
        <Button type="submit" className="h-[52px] rounded-[14px] text-base font-bold" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
      </form>
      <p className="text-muted-foreground text-sm">Forgot your password? Ask the person who set up this site to reset it.</p>
    </Page>
  );
}
