"use client";

import { useCallback, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

const AGENT_ID = "agent_3601krs5kq8mfnz9s57xcm9vd1yy";

function ElevenLabsInner({ sessionSlug }: { sessionSlug: string }) {
  const session = useQuery(api.sessions.getBySlug, { slug: sessionSlug });

  const [displayName, setDisplayName] = useState("");
  const [transcriptLines, setTranscriptLines] = useState<string[]>([]);
  const [submitState, setSubmitState] = useState<
    "idle" | "saving" | "done" | "error"
  >("idle");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const generateUploadUrl = useMutation(api.transcriptions.generateUploadUrl);
  const saveTranscription = useMutation(api.transcriptions.save);

  const conversation = useConversation({
    onMessage: ({ message, source }: { message: string; source: string }) => {
      if (message?.trim()) {
        const label = source === "user" ? "You" : "Agent";
        setTranscriptLines((prev) => [...prev, `${label}: ${message.trim()}`]);
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

  async function startAudioRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4",
      });
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
    } catch (err) {
      console.error("Failed to start audio recording:", err);
    }
  }

  function stopAudioRecording(): Promise<Blob | null> {
    const mediaRecorder = mediaRecorderRef.current;
    if (!mediaRecorder) return Promise.resolve(null);

    return new Promise((resolve) => {
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mediaRecorder.mimeType,
        });
        mediaRecorder.stream.getTracks().forEach((t) => t.stop());
        resolve(blob);
      };
      mediaRecorder.stop();
    });
  }

  const toggle = useCallback(async () => {
    if (isConnected) {
      conversation.endSession();
      await stopAudioRecording();
    } else {
      await startAudioRecording();
      conversation.startSession({
        agentId: AGENT_ID,
        connectionType: "websocket",
      });
    }
  }, [isConnected, conversation]);

  async function handleSave() {
    if (!session) return;
    const name = displayName.trim() || "Anonymous";
    const rawTranscript = transcriptLines.join("\n");

    setSubmitState("saving");
    try {
      let audioFileId: Id<"_storage"> | undefined;

      // Upload audio if we have chunks
      if (chunksRef.current.length > 0) {
        const audioBlob = new Blob(chunksRef.current, {
          type: mediaRecorderRef.current?.mimeType || "audio/webm",
        });
        const uploadUrl = await generateUploadUrl();
        const uploadRes = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": audioBlob.type },
          body: audioBlob,
        });
        if (uploadRes.ok) {
          const { storageId } = (await uploadRes.json()) as {
            storageId: Id<"_storage">;
          };
          audioFileId = storageId;
        }
      }

      await saveTranscription({
        sessionId: session._id,
        displayName: name,
        rawTranscript,
        audioFileId,
      });

      setSubmitState("done");
    } catch (err) {
      console.error(err);
      setSubmitState("error");
    }
  }

  if (session === undefined) {
    return <p className="mic-hint">Loading session...</p>;
  }
  if (session === null) {
    return <p className="mic-hint">Session not found. Check your link.</p>;
  }

  const state = isConnected ? "listening" : "idle";

  const hint = isConnecting
    ? "Connecting..."
    : isConnected
      ? conversation.isSpeaking
        ? "Agent speaking..."
        : "Listening..."
      : hasEnded
        ? "Conversation ended"
        : "Tap to start";

  return (
    <div className="mic-stage" data-state={state}>
      <div className="voice-panel">
        <div className="speaker-field">
          <label htmlFor="speakerName">Your Name</label>
          <input
            id="speakerName"
            name="speakerName"
            placeholder="What is your full name?"
            type="text"
            aria-label="Your full name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
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

      {transcriptLines.length > 0 && (
        <div className="mic-transcript">
          {transcriptLines.map((line, i) => (
            <p key={i} style={{ margin: "6px 0" }}>
              {line}
            </p>
          ))}
        </div>
      )}

      {hasEnded && submitState !== "done" && (
        <button
          className="primary-button"
          disabled={submitState === "saving"}
          onClick={handleSave}
          type="button"
        >
          {submitState === "saving"
            ? "Saving & matching..."
            : submitState === "error"
              ? "Error — try again"
              : "Save transcription"}
        </button>
      )}

      {submitState === "done" && (
        <p className="mic-hint" style={{ color: "var(--pine)" }}>
          Saved! You&rsquo;re in the mix.
        </p>
      )}

      <div
        style={{
          marginTop: "32px",
          maxWidth: "560px",
          background: "rgba(255,255,255,0.7)",
          border: "1px solid var(--line)",
          borderRadius: "18px",
          padding: "20px 24px",
          fontSize: "0.85rem",
          lineHeight: "1.7",
          color: "var(--muted)",
        }}
      >
        <ol style={{ paddingLeft: "18px", margin: 0 }}>
          <li>&ldquo;Hey! What&rsquo;s your name?&rdquo;</li>
          <li>
            &ldquo;Nice to meet you! Tell me a fun fact about yourself.&rdquo;
          </li>
          <li>
            &ldquo;Love it! So what are you looking to get out of being
            here?&rdquo;
          </li>
          <li>
            &ldquo;Last one — what can you give or offer to others while
            you&rsquo;re here?&rdquo;
          </li>
        </ol>
      </div>
    </div>
  );
}

export function ElevenLabsTranscriptionClient({
  sessionSlug,
}: {
  sessionSlug: string;
}) {
  return (
    <ConversationProvider>
      <ElevenLabsInner sessionSlug={sessionSlug} />
    </ConversationProvider>
  );
}
