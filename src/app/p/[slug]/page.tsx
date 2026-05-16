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

  const startsAt = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(session.startsAt));

  return (
    <main className="page-frame">
      <section className="panel party-card">
        <p className="eyebrow">Party session</p>
        <h1 className="section-title">{session.partyName}</h1>
        <p className="subcopy">
          This is the shared party page. Guest actions and interactive features
          can plug in here next.
        </p>

        <div className="party-meta">
          <div className="meta-tile">
            <span className="meta-label">Host</span>
            <span className="meta-value">{session.hostName}</span>
          </div>
          <div className="meta-tile">
            <span className="meta-label">When</span>
            <span className="meta-value">{startsAt}</span>
          </div>
          <div className="meta-tile">
            <span className="meta-label">Where</span>
            <span className="meta-value">{session.location}</span>
          </div>
          <div className="meta-tile">
            <span className="meta-label">Link ID</span>
            <span className="meta-value">{session.slug}</span>
          </div>
        </div>

        {session.note ? <p className="subcopy">{session.note}</p> : null}
      </section>
    </main>
  );
}
