"use client";

import { useCallback, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useRouter } from "next/navigation";
import { Id } from "../../../../convex/_generated/dataModel";

const AGENT_ID = "agent_3601krs5kq8mfnz9s57xcm9vd1yy";

type Props = {
  slug: string;
  sessionId: Id<"sessions">;
};

function VoiceAgentInner({ slug, sessionId }: Props) {
  const router = useRouter();
  const createProfile = useMutation(api.profiles.create);

  const [transcriptLines, setTranscriptLines] = useState<string[]>([]);
  const [submitState, setSubmitState] = useState<
    "idle" | "submitting" | "done" | "error"
  >("idle");

  const nameInputRef = useRef<HTMLInputElement>(null);

  const conversation = useConversation({
    onMessage: ({ message, source }: { message: string; source: string }) => {
      if (source === "user" && message?.trim()) {
        setTranscriptLines((prev) => [...prev, message.trim()]);
      }
    },
    onError: (error: unknown) => {
      console.error("ElevenLabs error:", error);
    },
  });

  const isConnected = conversation.status === "connected";
  const isConnecting = conversation.status === "connecting";
  const hasEnded =
    conversation.status === "disconnected" && transcriptLines.length > 0;

  const toggle = useCallback(() => {
    if (isConnected) {
      conversation.endSession();
    } else {
      conversation.startSession({
        agentId: AGENT_ID,
        connectionType: "websocket",
      });
    }
  }, [isConnected, conversation]);

  async function handleSubmit() {
    const displayName = nameInputRef.current?.value.trim() ?? "";
    if (!displayName) {
      alert("Please enter your name before submitting.");
      return;
    }

    setSubmitState("submitting");
    try {
      const rawTranscript = transcriptLines.join("\n");
      const profileId = await createProfile({
        sessionId,
        displayName,
        rawTranscript,
      });
      setSubmitState("done");
      router.push(`/p/${slug}/explore?profileId=${profileId}`);
    } catch (err) {
      console.error("Profile creation failed:", err);
      setSubmitState("error");
    }
  }

  const state = isConnected ? "listening" : "idle";

  const hint = isConnecting
    ? "Connecting..."
    : isConnected
      ? conversation.isSpeaking
        ? "Agent speaking..."
        : "Listening..."
      : hasEnded
        ? "Conversation ended — submit your profile below"
        : "Tap to start";

  return (
    <div className="mic-stage" data-state={state}>
      <div className="voice-panel">
        <div className="speaker-field">
          <input
            ref={nameInputRef}
            id="speakerName"
            name="speakerName"
            placeholder="What is your full name?"
            type="text"
            aria-label="Your full name"
          />
        </div>

        <div className="mic-orb">
          <div className="mic-rings" aria-hidden="true">
            <div className="mic-ring mic-ring-1" />
            <div className="mic-ring mic-ring-2" />
            <div className="mic-ring mic-ring-3" />
          </div>

          <button
            aria-label={isConnected ? "End conversation" : "Start conversation"}
            className="mic-btn"
            disabled={isConnecting}
            onClick={toggle}
            type="button"
          >
            <svg
              className="mic-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 10a7 7 0 0 0 14 0" />
              <line x1="12" y1="17" x2="12" y2="22" />
              <line x1="8" y1="22" x2="16" y2="22" />
            </svg>
          </button>
        </div>
      </div>

      <p className="mic-hint">{hint}</p>

      {hasEnded && (
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
      )}
    </div>
  );
}

export function VoiceTranscript({ slug, sessionId }: Props) {
  return (
    <ConversationProvider>
      <VoiceAgentInner slug={slug} sessionId={sessionId} />
    </ConversationProvider>
  );
}
