"use client";

import { FormEvent, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";

type CreateState =
  | { status: "idle" | "submitting"; error?: never; url?: never; copied?: never }
  | { status: "error"; error: string; url?: never; copied?: never }
  | { status: "success"; url: string; copied: boolean; error?: never };

export function SessionForm() {
  const [state, setState] = useState<CreateState>({ status: "idle" });
  const createSession = useMutation(api.sessions.create);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "submitting" });

    const formData = new FormData(event.currentTarget);
    const partyName = (formData.get("partyName") as string)?.trim();

    if (!partyName) {
      setState({ status: "error", error: "Party name is required." });
      return;
    }

    try {
      const { slug } = await createSession({ partyName });
      const url = `${window.location.origin}/p/${slug}`;
      setState({ status: "success", url, copied: false });
    } catch {
      setState({
        status: "error",
        error: "Could not create a party link. Try again.",
      });
    }
  }

  async function handleLinkClick() {
    if (state.status !== "success") return;

    const copied = await copyToClipboard(state.url);
    setState({ ...state, copied });

    if (copied) {
      window.setTimeout(() => {
        setState((current) =>
          current.status === "success" ? { ...current, copied: false } : current,
        );
      }, 1600);
    }
  }

  const isSuccess = state.status === "success";
  const buttonLabel =
    state.status === "submitting"
      ? "Creating..."
      : isSuccess
        ? state.copied
          ? "Copied!"
          : "Link - click to copy"
        : "Generate create link";

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

      <button
        className={`primary-button${isSuccess ? " link-ready" : ""}`}
        disabled={state.status === "submitting"}
        onClick={isSuccess ? handleLinkClick : undefined}
        type={isSuccess ? "button" : "submit"}
      >
        {!isSuccess ? <span aria-hidden="true">🍍</span> : null}
        {buttonLabel}
      </button>
    </form>
  );
}

async function copyToClipboard(value: string) {
  if (!navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
