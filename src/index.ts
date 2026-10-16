import { HttpError, checkOrigin, json, secure } from "./http.ts";
import { login, logout, teacherRoute } from "./teacher.ts";
import { current, forget, lookup } from "./parent.ts";

export { Gate } from "./gate.ts";

async function route(req: Request, env: Env, url: URL): Promise<Response> {
  checkOrigin(req, url);
  const p = url.pathname;
  const m = req.method;
  if (p === "/api/login" && m === "POST") return login(req, env);
  if (p === "/api/logout" && m === "POST") return logout(req, env);
  if (p === "/api/parent/lookup" && m === "POST") return lookup(req, env);
  if (p === "/api/parent/report" && m === "GET") return current(req, env);
  if (p === "/api/parent/forget" && m === "POST") return forget();
  if (p.startsWith("/api/teacher/")) return teacherRoute(req, env, url);
  throw new HttpError(404, "Not found.");
}

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    try {
      return secure(await route(req, env, url));
    } catch (e) {
      if (e instanceof HttpError) return secure(json({ error: e.message, code: e.code }, e.status));
      console.error(e);
      return secure(json({ error: "Something went wrong. Try again in a moment." }, 500));
    }
  },
} satisfies ExportedHandler<Env>;
