import { spawn } from "node:child_process";

const GBRAIN_BIN = process.env.GBRAIN_BIN ?? "gbrain";

type GbrainResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
};

function runGbrain(args: string[], stdin?: string): Promise<GbrainResult> {
  return new Promise((resolve) => {
    const child = spawn(GBRAIN_BIN, args, { stdio: ["pipe", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));

    child.on("error", (err) => {
      resolve({ ok: false, stdout, stderr: stderr || String(err) });
    });

    child.on("close", (code) => {
      resolve({ ok: code === 0, stdout, stderr });
    });

    if (stdin !== undefined) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}

export type PutPageInput = {
  slug: string;
  tags: string[];
  content: string;
};

// Writes (or overwrites) a page, then attaches tags. Re-calling with the same
// slug updates the existing page — that is how a person stays unique per event.
export async function putPage({ slug, tags, content }: PutPageInput) {
  const put = await runGbrain(["put", slug], content);
  if (!put.ok) {
    throw new Error(
      `gbrain put failed: ${put.stderr.trim() || "unknown error"}`,
    );
  }

  for (const tag of tags) {
    if (tag) {
      await runGbrain(["tag", slug, tag]);
    }
  }

  return slug;
}

export async function searchPages(query: string) {
  const result = await runGbrain(["search", query]);

  if (!result.ok) {
    throw new Error(
      `gbrain search failed: ${result.stderr.trim() || "unknown error"}`,
    );
  }

  return result.stdout.trim();
}

export async function getPage(slug: string) {
  const result = await runGbrain(["get", slug]);
  return result.ok ? result.stdout.trim() : null;
}
