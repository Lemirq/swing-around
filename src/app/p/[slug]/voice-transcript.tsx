"use client";

import { useEffect, useRef, useState } from "react";

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export function VoiceTranscript() {
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSupported] = useState(() => {
    if (typeof window === "undefined") return true;
    return Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
  });
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let finalText = "";
      let liveText = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          finalText += `${text} `;
        } else {
          liveText += text;
        }
      }

      if (finalText) {
        setTranscript((c) => `${c}${finalText}`.trimStart());
      }
      setInterimTranscript(liveText);
    };

    recognition.onerror = (event) => {
      setError(
        event.error === "not-allowed"
          ? "Microphone access was blocked."
          : "Voice capture stopped. Try again.",
      );
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript("");
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, []);

  function toggle() {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      setError("");
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch {
        setError("Voice capture is already starting. Try again in a moment.");
      }
    }
  }

  const visibleTranscript = [transcript, interimTranscript].filter(Boolean).join(" ");
  const state = isListening ? "listening" : "idle";

  return (
    <div className="mic-stage" data-state={state}>
      <div className="voice-panel">
        <div className="speaker-field">
          <input
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
            aria-label={isListening ? "Stop recording" : "Start recording"}
            className="mic-btn"
            disabled={!isSupported}
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

      {error ? (
        <p className="mic-error" role="alert">
          {error}
        </p>
      ) : (
        <p className="mic-hint">
          {isListening ? "Listening…" : isSupported ? "Tap to speak" : "Not supported in this browser"}
        </p>
      )}

      {visibleTranscript ? (
        <p className="mic-transcript" aria-live="polite">
          {transcript}
          {interimTranscript ? (
            <span className="mic-interim"> {interimTranscript}</span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

