import { SessionForm } from "./create/session-form";

export default function Home() {
  return (
    <main className="page-frame">
      <section className="hero" id="make-link">
        <h1 className="display-title">Increase your surface area of luck.</h1>
        <p className="subcopy">
          Name the event, generate the link, and share it with the room.
        </p>
        <div className="home-form-card">
          <SessionForm />
        </div>
      </section>
    </main>
  );
}
