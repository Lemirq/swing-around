import Link from "next/link";

export default function PartyNotFound() {
  return (
    <main className="page-frame">
      <section className="panel party-card">
        <p className="eyebrow">Missing link</p>
        <h1 className="section-title">That party link is not here.</h1>
        <p className="subcopy">
          In this dev version, links are stored in memory and disappear whenever
          the server restarts.
        </p>
        <Link href="/create" className="primary-button">
          Create a new party link
        </Link>
      </section>
    </main>
  );
}
