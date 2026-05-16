import { createSession, validateSessionInput } from "@/lib/sessions";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const result = validateSessionInput(payload);

  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  const session = createSession(result.input);
  const url = new URL(`/p/${session.slug}`, request.url);

  return Response.json(
    {
      slug: session.slug,
      url: url.toString(),
    },
    { status: 201 },
  );
}
