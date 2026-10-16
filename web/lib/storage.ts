// localStorage that never throws: private windows and blocked storage just forget.
export const store = {
  get<T = unknown>(k: string): T | null {
    try { const v = localStorage.getItem(k); return v === null ? null : (JSON.parse(v) as T); } catch { return null; }
  },
  set(k: string, v: unknown): boolean {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; }
  },
  del(k: string): void {
    try { localStorage.removeItem(k); } catch { /* nothing to do */ }
  },
  keys(prefix: string): string[] {
    try { return Object.keys(localStorage).filter((k) => k.startsWith(prefix)); } catch { return []; }
  },
};
