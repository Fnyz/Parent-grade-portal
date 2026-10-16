// Responses, cookies and request checks shared by every route.

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export const SECURITY_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000",
};

export function json(body: unknown, status = 200, extra: HeadersInit = {}): Response {
  const h = new Headers(extra);
  h.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers: h });
}

export function secure(res: Response): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  return out;
}

export function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("Cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=") || null;
  }
  return null;
}

export function setCookie(name: string, value: string, opts: { maxAge?: number; sameSite?: "Strict" | "Lax" } = {}): string {
  let c = `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=${opts.sameSite ?? "Strict"}`;
  if (opts.maxAge !== undefined) c += `; Max-Age=${opts.maxAge}`;
  return c;
}

export function clearCookie(name: string): string {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

/** Refuses requests that change data unless they come from this site. */
export function checkOrigin(req: Request, url: URL): void {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("Origin");
  if (origin !== url.origin) throw new HttpError(403, "This request did not come from this site.");
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  if (!(req.headers.get("Content-Type") ?? "").includes("application/json")) {
    throw new HttpError(415, "Send the request as JSON.");
  }
  const text = await req.text();
  if (text.length > 512_000) throw new HttpError(413, "That request is too large.");
  try {
    const v = JSON.parse(text);
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch { /* fall through */ }
  throw new HttpError(400, "The request could not be read.");
}

/** A short piece of typed text: trimmed, single line, within a length limit. */
export function text(v: unknown, field: string, max: number, required = true): string {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  if (required && !s) throw new HttpError(400, `${field} is required.`);
  if (s.length > max) throw new HttpError(400, `${field} must be ${max} characters or fewer.`);
  return s;
}

/** Each code or password attempt counts against this visitor and the whole site. */
export async function allowAttempt(req: Request, env: Env): Promise<void> {
  const visitor = req.headers.get("CF-Connecting-IP") ?? "unknown";
  const [mine, all] = await Promise.all([
    env.TRIES_PER_VISITOR.limit({ key: visitor }),
    env.TRIES_SITE_WIDE.limit({ key: "site" }),
  ]);
  if (!mine.success || !all.success) {
    throw new HttpError(429, "Too many tries. Wait a minute, then try again.", "too_many");
  }
}
