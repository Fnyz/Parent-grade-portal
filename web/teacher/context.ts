import { createContext, useContext } from "react";
import type { ClassView } from "@/lib/types";

export interface ClassCtx {
  view: ClassView;
  /** Replace the class with the server's latest copy. */
  setView: (v: ClassView) => void;
  /** API call that sends the teacher back to sign in when the session has ended. */
  call: <T = unknown>(method: string, path: string, body?: unknown) => Promise<T>;
  base: string;
  /** How many classes this teacher has. */
  classCount: number;
  /** After a class is deleted: drop it from the picker and open another. */
  onDeleted: (id: string, remaining: string[]) => Promise<void>;
}

export const Ctx = createContext<ClassCtx | null>(null);

export function useClass(): ClassCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useClass outside a class");
  return c;
}

export const DRAFT = "pgp-draft:";
