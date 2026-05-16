import { getSession } from "@/lib/sessions";
import { enrichProfile } from "@/lib/composio";
import { buildProfile } from "@/lib/profile";
import { putPage } from "@/lib/gbrain";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/sessions/[slug]/profiles">,
) {
  const { slug } = await context.params;
  const session = getSession(slug);

  if (!session) {
    return Response.json({ error: "Session not found." }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const data = payload as Record<string, unknown>;
  const fullName = clean(data.fullName);
  const transcript = clean(data.transcript);
  const xHandle = clean(data.xHandle) || undefined;
  const linkedinUrl = clean(data.linkedinUrl) || undefined;

  if (!fullName) {
    return Response.json({ error: "Full name is required." }, { status: 400 });
  }
  if (!transcript) {
    return Response.json(
      { error: "A voice intro is required." },
      { status: 400 },
    );
  }

  try {
    const enrichment = await enrichProfile({ fullName, xHandle, linkedinUrl });
    const { markdown, tags } = await buildProfile({
      fullName,
      transcript,
      enrichment,
      xHandle,
      linkedinUrl,
    });

    // Slug carries the session so each person is unique per event and a
    // re-submission updates the same gbrain page instead of duplicating.
    const pageSlug = `${slug}-${slugify(fullName)}`;
    await putPage({
      slug: pageSlug,
      tags: [...tags, `session:${slug}`, `name:${slugify(fullName)}`],
      content:
        `# ${fullName}\n\n${markdown}\n\n---\n` +
        `Event: ${session.partyName} (${slug})\n` +
        (xHandle ? `X: ${xHandle}\n` : "") +
        (linkedinUrl ? `LinkedIn: ${linkedinUrl}\n` : "") +
        `Raw intro: ${transcript}\n`,
    });

    return Response.json({ ok: true, name: fullName }, { status: 201 });
  } catch (error) {
    console.error("[profiles] failed to build profile:", error);
    return Response.json(
      { error: "Could not build your profile. Try again." },
      { status: 500 },
    );
  }
}
