"use client";

import { FormEvent, useState } from "react";

type CreateState =
  | { status: "idle" | "submitting"; error?: never; url?: never }
  | { status: "error"; error: string; url?: never }
  | { status: "success"; url: string; copied: boolean; error?: never };

export function SessionForm() {
  const [state, setState] = useState<CreateState>({ status: "idle" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "submitting" });

    const formData = new FormData(event.currentTarget);
    const payload = {
      partyName: formData.get("partyName"),
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

      const copied = await copyToClipboard(body.url);
      setState({ status: "success", url: body.url, copied });
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

    const copied = await copyToClipboard(state.url);
    setState({ ...state, copied });
  }

  function closePopup() {
    setState({ status: "idle" });
  }

  return (
    <form className="panel form-stack compact-form" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="partyName">Event title</label>
        <input
          id="partyName"
          name="partyName"
          placeholder="Rooftop pineapple hour"
          required
        />
      </div>

      {state.status === "error" ? (
        <p className="message error" role="alert">
          {state.error}
        </p>
      ) : null}

      <button className="primary-button" disabled={state.status === "submitting"}>
        <span aria-hidden="true">🍍</span>
        {state.status === "submitting" ? "Creating..." : "Generate create link"}
      </button>

      {state.status === "success" ? (
        <div className="popup-backdrop" role="presentation">
          <div
            aria-labelledby="party-link-title"
            aria-modal="true"
            className="popup-card"
            role="dialog"
          >
            <div className="popup-icon" aria-hidden="true">
              🍍
            </div>
            <p className="eyebrow">Link generated</p>
            <h2 id="party-link-title" className="popup-title">
              {state.copied ? "Copied to clipboard." : "Your link is ready."}
            </h2>
            <p className="popup-copy">
              {state.copied
                ? "Paste it anywhere and send it to the group."
                : "Your browser blocked auto-copy, but you can copy it here."}
            </p>
            <a className="share-link" href={state.url}>
              {state.url}
            </a>
            <div className="popup-actions">
              <a className="primary-button" href={state.url}>
                Open link
              </a>
              <button className="secondary-button" type="button" onClick={copyLink}>
                Copy again
              </button>
              <button className="ghost-button" type="button" onClick={closePopup}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}

async function copyToClipboard(value: string) {
  if (!navigator.clipboard) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
