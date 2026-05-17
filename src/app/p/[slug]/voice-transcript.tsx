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

  async function handleSampleSubmit() {
    setSubmitState("submitting");
    try {
      const profileId = await createProfile({
        sessionId,
        displayName: "Vihaan Sharma",
        rawTranscript: "My name is Vihaan. I'm really into full-stack development and AI engineering. I'm really into fintech as well and I'm looking for founders in the crypto space. One fun fact about me is that I can stand on three pinkies.",
        xHandle: "vhaanca",
        linkedinUrl: "https://www.linkedin.com/in/vs190/",
        websiteUrl: "https://vhaan.me",
      });
      setSubmitState("done");
      router.push(`/p/${slug}/explore?profileId=${profileId}`);
    } catch (err) {
      console.error("Profile creation failed:", err);
      setSubmitState("error");
    }
  }

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
      <div className="voice-panel">
        <div className="field">
          <label htmlFor="name">Full Name</label>
          <input
            ref={nameRef}
            id="name"
            placeholder="Jane Smith"
            type="text"
          />
        </div>

        <div className="field">
          <label htmlFor="bio">About You</label>
          <textarea
            ref={bioRef}
            id="bio"
            placeholder="Tell us about yourself — interests, skills, what you're looking for..."
            rows={4}
          />
        </div>

        <div className="form-divider" />

        <p className="form-section-label">Your Links</p>

        <div className="field">
          <label htmlFor="x">X / Twitter</label>
          <input ref={xHandleRef} id="x" placeholder="@handle" type="text" />
        </div>

        <div className="field">
          <label htmlFor="linkedin">LinkedIn</label>
          <input
            ref={linkedinRef}
            id="linkedin"
            placeholder="linkedin.com/in/you"
            type="url"
          />
        </div>

        <div className="field">
          <label htmlFor="github">GitHub</label>
          <input
            ref={githubRef}
            id="github"
            placeholder="username"
            type="text"
          />
        </div>

        <div className="field">
          <label htmlFor="website">Website</label>
          <input
            ref={websiteRef}
            id="website"
            placeholder="yoursite.com"
            type="url"
          />
        </div>

        <button
          className="primary-button"
          disabled={submitState === "submitting" || submitState === "done"}
          onClick={handleSubmit}
          type="button"
          style={{ width: "100%", marginTop: "8px" }}
        >
          {submitState === "submitting"
            ? "Saving profile..."
            : submitState === "error"
              ? "Error — try again"
              : "Submit my profile"}
        </button>

        <button
          type="button"
          disabled={submitState === "submitting" || submitState === "done"}
          onClick={handleSampleSubmit}
          style={{ width: "100%", marginTop: "4px", padding: "0.5rem", fontSize: "0.8rem", opacity: 0.6, background: "transparent", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "0.4rem", color: "inherit", cursor: "pointer" }}
        >
          Quick test (Vihaan sample)
        </button>
      </div>
    </div>
  );
}
