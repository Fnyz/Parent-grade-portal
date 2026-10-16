import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Ask { title: string; body?: ReactNode; confirm: string; danger?: boolean }
type ConfirmFn = (ask: Ask) => Promise<boolean>;

const Ctx = createContext<ConfirmFn>(async () => false);

/** `await confirm({...})` resolves true when the person agrees. */
export const useConfirm = () => useContext(Ctx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [ask, setAsk] = useState<Ask | null>(null);
  const resolve = useRef<(ok: boolean) => void>(() => {});
  const confirm = useCallback<ConfirmFn>((a) => new Promise((r) => { resolve.current = r; setAsk(a); }), []);
  const close = (ok: boolean) => { resolve.current(ok); setAsk(null); };
  return (
    <Ctx.Provider value={confirm}>
      {children}
      <AlertDialog open={!!ask} onOpenChange={(open) => { if (!open) close(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ask?.title}</AlertDialogTitle>
            {ask?.body ? <AlertDialogDescription asChild><div className="grid gap-2">{ask.body}</div></AlertDialogDescription> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => close(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant={ask?.danger ? "destructive" : "default"} onClick={() => close(true)}>
              {ask?.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Ctx.Provider>
  );
}
