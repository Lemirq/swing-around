"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useRouter } from "next/navigation";
import { Id } from "../../../../convex/_generated/dataModel";
import { ConversationProvider, useConversation } from "@elevenlabs/react";

type Props = {
  slug: string;
  sessionId: Id<"sessions">;
};

const AGENT_ID = "agent_3601krs5kq8mfnz9s57xcm9vd1yy";

export function VoiceTranscript({ slug, sessionId }: Props) {
  return (
    <ConversationProvider>
      <VoiceTranscriptInner slug={slug} sessionId={sessionId} />
    </ConversationProvider>
  );
}

function VoiceTranscriptInner({ slug, sessionId }: Props) {
  const router = useRouter();
  const createProfile = useMutation(api.profiles.create);
  const [submitState, setSubmitState] = useState<
    "idle" | "submitting" | "done" | "error"
  >("idle");
  const [displayName, setDisplayName] = useState("");
  const [conversationStarted, setConversationStarted] = useState(false);
  const transcriptRef = useRef<string[]>([]);

  const handleDisconnect = useCallback(async () => {
    if (submitState !== "idle") return;
    const rawTranscript = transcriptRef.current.join("\n");
    if (!rawTranscript) return;

    setSubmitState("submitting");
    try {
      const profileId = await createProfile({
        sessionId,
        displayName,
        rawTranscript,
      });
      setSubmitState("done");
      router.push(`/p/${slug}/profiles?profileId=${profileId}`);
    } catch (err) {
      console.error("Profile creation failed:", err);
      setSubmitState("error");
    }
  }, [submitState, displayName, sessionId, slug, createProfile, router]);

  const conversation = useConversation({
    onMessage: (props: { message: string; source: string }) => {
      if (props.message?.trim()) {
        const label = props.source === "user" ? "User" : "Agent";
        transcriptRef.current.push(`${label}: ${props.message.trim()}`);
      }
    },
    onDisconnect: () => {
      handleDisconnect();
    },
  });

  const handleStart = () => {
    if (!displayName.trim()) {
      alert("Please enter your name first.");
      return;
    }
    setConversationStarted(true);
    conversation.startSession({
      agentId: AGENT_ID,
      connectionType: "websocket",
    });
  };

  const handleStop = () => {
    conversation.endSession();
  };

  async function handleSampleSubmit() {
    setSubmitState("submitting");
    try {
      const profileId = await createProfile({
        sessionId,
        displayName: "Vihaan Sharma",
        rawTranscript:
          "My name is Vihaan. I'm really into full-stack development and AI engineering. I'm really into fintech as well and I'm looking for founders in the crypto space. One fun fact about me is that I can stand on three pinkies.",
      });
      setSubmitState("done");
      router.push(`/p/${slug}/profiles?profileId=${profileId}`);
    } catch (err) {
      console.error("Profile creation failed:", err);
      setSubmitState("error");
    }
  }

  const isConnected = conversation.status === "connected";
  const isConnecting = conversation.status === "connecting";

  return (
    <div
      className="mic-stage"
      data-state={isConnected ? "active" : "idle"}
    >
      <div className="voice-panel">
        <div className="field">
          <label htmlFor="name">Full Name</label>
          <input
            id="name"
            placeholder="Jane Smith"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={conversationStarted}
          />
        </div>

        {!conversationStarted && (
          <p style={{ fontSize: "0.85rem", opacity: 0.7, textAlign: "center", margin: "1rem 0 0.5rem" }}>
            Enter your name, then tap the mic to start talking
          </p>
        )}

        <div className="mic-orb">
          <div className="mic-rings" data-active={isConnected} />
          <button
            className="mic-btn"
            onClick={isConnected ? handleStop : handleStart}
            disabled={
              isConnecting ||
              submitState === "submitting" ||
              submitState === "done"
            }
            type="button"
          >
            <span className="mic-icon">
              {isConnected ? "⏹" : "🎙"}
            </span>
          </button>
        </div>

        {isConnected && conversation.isSpeaking && (
          <p style={{ fontSize: "0.8rem", opacity: 0.6, textAlign: "center" }}>
            Agent is speaking...
          </p>
        )}
        {isConnected && conversation.isListening && (
          <p style={{ fontSize: "0.8rem", opacity: 0.6, textAlign: "center" }}>
            Listening...
          </p>
        )}

        {submitState === "submitting" && (
          <p style={{ fontSize: "0.85rem", textAlign: "center", marginTop: "1rem" }}>
            Saving profile...
          </p>
        )}
        {submitState === "error" && (
          <p style={{ fontSize: "0.85rem", textAlign: "center", marginTop: "1rem", color: "#f87171" }}>
            Error saving profile. Please try again.
          </p>
        )}

        <button
          type="button"
          disabled={submitState === "submitting" || submitState === "done"}
          onClick={handleSampleSubmit}
          style={{
            width: "100%",
            marginTop: "1.5rem",
            padding: "0.5rem",
            fontSize: "0.8rem",
            opacity: 0.6,
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: "0.4rem",
            color: "inherit",
            cursor: "pointer",
          }}
        >
          Quick test (Vihaan sample)
        </button>
      </div>
    </div>
  );
}
