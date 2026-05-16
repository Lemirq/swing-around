import Link from "next/link";

export default function Home() {
  return (
    <main className="page-frame">
      <section className="hero">
        <div>
          <p className="eyebrow">Party links without the group chat chaos</p>
          <h1 className="display-title">Make one link for the night.</h1>
        </div>
        <p className="subcopy">
          Create a unique session link for your party, share it with the room,
          and plug in the interactive stuff later.
        </p>
        <Link href="/create" className="primary-button">
          <span aria-hidden="true">🍍</span>
          Generate Create Link
        </Link>
      </section>
    </main>
  );
}
