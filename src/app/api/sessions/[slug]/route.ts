import { getSession } from "@/lib/sessions";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/sessions/[slug]">,
) {
  const { slug } = await context.params;
  const session = getSession(slug);

  if (!session) {
    return Response.json({ error: "Session not found." }, { status: 404 });
  }

  return Response.json({ session });
}
