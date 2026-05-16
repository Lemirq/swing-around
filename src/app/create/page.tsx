import { SessionForm } from "./session-form";

export default function CreatePage() {
  return (
    <main className="page-frame">
      <section className="setup-grid">
        <div>
          <p className="eyebrow">Create the session</p>
          <h1 className="section-title">Give the party a home base.</h1>
          <p className="subcopy">
            Add the basic details now. The generated link will become the place
            guests use for everything else we build next.
          </p>
        </div>
        <SessionForm />
      </section>
    </main>
  );
}
