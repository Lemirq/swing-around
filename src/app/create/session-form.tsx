"use client";

import { FormEvent, useState } from "react";

type CreateState =
  | { status: "idle" | "submitting"; error?: never; url?: never }
  | { status: "error"; error: string; url?: never }
  | { status: "success"; url: string; error?: never };

export function SessionForm() {
  const [state, setState] = useState<CreateState>({ status: "idle" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "submitting" });

    const formData = new FormData(event.currentTarget);
    const payload = {
      partyName: formData.get("partyName"),
      hostName: formData.get("hostName"),
      location: formData.get("location"),
      startsAt: formData.get("startsAt"),
      note: formData.get("note"),
    };

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const body = (await response.json()) as { error?: string; url?: string };

      if (!response.ok || !body.url) {
        setState({
          status: "error",
          error: body.error ?? "Could not create a party link.",
        });
        return;
      }

      setState({ status: "success", url: body.url });
    } catch {
      setState({
        status: "error",
        error: "Could not reach the session API. Try again.",
      });
    }
  }

  async function copyLink() {
    if (state.status !== "success") {
      return;
    }

    await navigator.clipboard.writeText(state.url);
  }

  return (
    <form className="panel form-stack" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="partyName">Party name</label>
        <input
          id="partyName"
          name="partyName"
          placeholder="Rooftop pineapple hour"
          required
        />
      </div>

      <div className="field">
        <label htmlFor="hostName">Host name</label>
        <input id="hostName" name="hostName" placeholder="Sai" required />
      </div>

      <div className="field">
        <label htmlFor="location">Location</label>
        <input
          id="location"
          name="location"
          placeholder="Back patio, house, or venue"
          required
        />
      </div>

      <div className="field">
        <label htmlFor="startsAt">Date and time</label>
        <input id="startsAt" name="startsAt" type="datetime-local" required />
      </div>

      <div className="field">
        <label htmlFor="note">Optional note</label>
        <textarea
          id="note"
          name="note"
          placeholder="Dress code, parking, entry notes, or anything guests should know."
        />
      </div>

      {state.status === "error" ? (
        <p className="message error" role="alert">
          {state.error}
        </p>
      ) : null}

      <button className="primary-button" disabled={state.status === "submitting"}>
        {state.status === "submitting" ? "Creating..." : "Generate unique link"}
      </button>

      {state.status === "success" ? (
        <div className="result-card" aria-live="polite">
          <strong>Your party link is ready.</strong>
          <a className="share-link" href={state.url}>
            {state.url}
          </a>
          <button className="secondary-button" type="button" onClick={copyLink}>
            Copy link
          </button>
        </div>
      ) : null}
    </form>
  );
}
