"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";

export function TranscriptionClient() {
  const [displayName, setDisplayName] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [submitState, setSubmitState] = useState<
    "idle" | "transcribing" | "saving" | "done" | "error"
  >("idle");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const generateUploadUrl = useMutation(api.transcriptions.generateUploadUrl);
  const saveTranscription = useMutation(api.transcriptions.save);

  async function startRecording() {
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
    setIsRecording(true);
  }

  async function stopRecording() {
    const mediaRecorder = mediaRecorderRef.current;
    if (!mediaRecorder) return;

    return new Promise<Blob>((resolve) => {
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mediaRecorder.mimeType,
        });
        mediaRecorder.stream.getTracks().forEach((t) => t.stop());
        resolve(blob);
      };
      mediaRecorder.stop();
      setIsRecording(false);
    });
  }

  async function handleToggle() {
    if (isRecording) {
      const audioBlob = await stopRecording();
      if (!audioBlob) return;

      setSubmitState("transcribing");

      try {
        // Transcribe with OpenAI via our API route
        const formData = new FormData();
        formData.append("audio", audioBlob, "recording.webm");
        const res = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) throw new Error("Transcription failed");
        const { text } = await res.json();
        setTranscript(text);

        // Upload audio to Convex storage
        setSubmitState("saving");
        const uploadUrl = await generateUploadUrl();
        const uploadRes = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": audioBlob.type },
          body: audioBlob,
        });
        if (!uploadRes.ok) throw new Error("Audio upload failed");
        const { storageId } = await uploadRes.json();

        // Save to Convex DB
        await saveTranscription({
          displayName: displayName.trim() || "Anonymous",
          rawTranscript: text,
          audioFileId: storageId,
        });

        setSubmitState("done");
      } catch (err) {
        console.error(err);
        setSubmitState("error");
      }
    } else {
      await startRecording();
    }
  }

  const state = isRecording ? "listening" : "idle";

  const hint =
    submitState === "transcribing"
      ? "Transcribing..."
      : submitState === "saving"
        ? "Saving..."
        : submitState === "done"
          ? "Saved!"
          : submitState === "error"
            ? "Something went wrong"
            : isRecording
              ? "Recording... tap to stop"
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
            aria-label={isRecording ? "Stop recording" : "Start recording"}
            className="mic-btn"
            disabled={submitState === "transcribing" || submitState === "saving"}
            onClick={handleToggle}
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

      {transcript && (
        <div className="mic-transcript">
          <p>{transcript}</p>
        </div>
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
