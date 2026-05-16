"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useRouter } from "next/navigation";
import { Id } from "../../../../convex/_generated/dataModel";

type Props = {
  slug: string;
  sessionId: Id<"sessions">;
};

export function VoiceTranscript({ slug, sessionId }: Props) {
  const router = useRouter();
  const createProfile = useMutation(api.profiles.create);
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "done" | "error">("idle");

  const nameRef = useRef<HTMLInputElement>(null);
  const bioRef = useRef<HTMLTextAreaElement>(null);
  const xHandleRef = useRef<HTMLInputElement>(null);
  const linkedinRef = useRef<HTMLInputElement>(null);
  const githubRef = useRef<HTMLInputElement>(null);
  const websiteRef = useRef<HTMLInputElement>(null);

  async function handleSubmit() {
    const displayName = nameRef.current?.value.trim() ?? "";
    if (!displayName) {
      alert("Please enter your name.");
      return;
    }
    const rawTranscript = bioRef.current?.value.trim() || undefined;
    if (!rawTranscript) {
      alert("Please tell us about yourself.");
      return;
    }

    setSubmitState("submitting");
    try {
      const profileId = await createProfile({
        sessionId,
        displayName,
        rawTranscript,
        xHandle: xHandleRef.current?.value.trim() || undefined,
        linkedinUrl: linkedinRef.current?.value.trim() || undefined,
        githubHandle: githubRef.current?.value.trim() || undefined,
        websiteUrl: websiteRef.current?.value.trim() || undefined,
      });
      setSubmitState("done");
      router.push(`/p/${slug}/explore?profileId=${profileId}`);
    } catch (err) {
      console.error("Profile creation failed:", err);
      setSubmitState("error");
    }
  }

  return (
    <div className="mic-stage" data-state="idle">
      <div className="voice-panel" style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%" }}>
        <input
          ref={nameRef}
          placeholder="Your full name"
          type="text"
          aria-label="Your full name"
        />
        <textarea
          ref={bioRef}
          placeholder="Tell us about yourself — interests, skills, what you're looking for..."
          rows={4}
          aria-label="About you"
          style={{ fontSize: "0.9rem", resize: "vertical" }}
        />

        <p style={{ fontSize: "0.85rem", opacity: 0.7, margin: 0 }}>
          Add your links so matches can connect with you
        </p>
        <input ref={xHandleRef} placeholder="X / Twitter handle (e.g. @you)" type="text" style={{ fontSize: "0.9rem" }} />
        <input ref={linkedinRef} placeholder="LinkedIn URL" type="url" style={{ fontSize: "0.9rem" }} />
        <input ref={githubRef} placeholder="GitHub username" type="text" style={{ fontSize: "0.9rem" }} />
        <input ref={websiteRef} placeholder="Website URL" type="url" style={{ fontSize: "0.9rem" }} />

        <button
          className="primary-button"
          disabled={submitState === "submitting" || submitState === "done"}
          onClick={handleSubmit}
          type="button"
        >
          {submitState === "submitting"
            ? "Saving profile..."
            : submitState === "error"
              ? "Error — try again"
              : "Submit my profile"}
        </button>
      </div>
    </div>
  );
}
