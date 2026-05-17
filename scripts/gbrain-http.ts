/**
 * Thin HTTP wrapper around the gbrain CLI.
 * Convex actions call this server to store and search profiles.
 *
 * Endpoints:
 *   GET  /                     → health check
 *   POST /put/:slug          body: plain-text markdown  → stores page
 *   POST /tag/:slug/:tag     → tags page
 *   POST /query              body: { query, limit?, sessionId? } → returns matches
 */

import { spawn } from "child_process";

const PORT = 8009;
const GBRAIN = process.env.GBRAIN_BIN ?? "/Users/vs/.bun/bin/gbrain";

// Mutex to serialize gbrain CLI calls (PGLite only supports one connection at a time)
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const p = queue.then(fn, fn);
  queue = p.catch(() => {});
  return p;
}

function run(args: string[], stdin?: string): Promise<string> {
  return serialized(() =>
    new Promise((resolve, reject) => {
      const child = spawn(GBRAIN, args, { stdio: ["pipe", "pipe", "pipe"] });
      let out = "";
      let err = "";
      child.stdout.on("data", (d: Buffer) => (out += d.toString()));
      child.stderr.on("data", (d: Buffer) => (err += d.toString()));
      child.on("close", (code: number) =>
        code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || out.trim())),
      );
      if (stdin !== undefined) child.stdin.write(stdin);
      child.stdin.end();
    }),
  );
}

// Parse gbrain query output lines: "[score] slug -- preview"
function parseQueryOutput(raw: string): Array<{ slug: string; score: number; preview: string }> {
  const results: Array<{ slug: string; score: number; preview: string }> = [];
  let current: { slug: string; score: number; preview: string } | null = null;

  for (const line of raw.split("\n")) {
    const match = line.match(/^\[([0-9.]+)\]\s+(\S+)\s+--\s+(.*)/);
    if (match) {
      if (current) results.push(current);
      current = { score: parseFloat(match[1]), slug: match[2], preview: match[3] };
    } else if (current && line.trim()) {
      current.preview += " " + line.trim();
    }
  }
  if (current) results.push(current);
  return results;
}

const server = Bun.serve({
  port: PORT,
  async fetch(req: Request) {
    const url = new URL(req.url);
    const path = url.pathname;

    try {
      // GET / health check
      if (req.method === "GET" && (path === "/" || path === "")) {
        return new Response("gbrain online", { status: 200 });
      }

      // POST /put/:slug
      if (req.method === "POST" && path.startsWith("/put/")) {
        const slug = decodeURIComponent(path.slice(5));
        const content = await req.text();
        const result = await run(["put", slug, "--content", content]);
        return Response.json({ ok: true, slug, result: JSON.parse(result) });
      }

      // POST /tag/:slug/:tag
      if (req.method === "POST" && path.startsWith("/tag/")) {
        const parts = path.slice(5).split("/");
        const slug = decodeURIComponent(parts[0]);
        const tag = decodeURIComponent(parts[1]);
        await run(["tag", slug, tag]);
        return Response.json({ ok: true });
      }

      // POST /query  { query: string, limit?: number, sessionId?: string }
      if (req.method === "POST" && path === "/query") {
        const body = (await req.json()) as { query: string; limit?: number; sessionId?: string };
        const args = ["query", body.query, "--limit", String(body.limit ?? 20)];
        if (body.sessionId) args.push("--tag", `session:${body.sessionId}`);
        const raw = await run(args);
        return Response.json({ ok: true, results: parseQueryOutput(raw) });
      }

      return Response.json({ error: "Not found" }, { status: 404 });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return Response.json({ error: msg }, { status: 500 });
    }
  },
});

console.log(`gbrain HTTP server running on http://localhost:${PORT}`);
