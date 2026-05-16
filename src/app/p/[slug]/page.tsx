import { getSession } from "@/lib/sessions";
import { connection } from "next/server";
import { notFound } from "next/navigation";

export default async function PartyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();

  const { slug } = await params;
  const session = getSession(slug);

  if (!session) {
    notFound();
  }

  return (
    <main className="page-frame">
      <section className="panel party-card">
        <p className="eyebrow">Party session</p>
        <h1 className="section-title">{session.partyName}</h1>
        <p className="subcopy">
          This is the shared party page. Guest actions and interactive features
          can plug in here next.
        </p>
      </section>
    </main>
  );
}
