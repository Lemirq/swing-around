"use client";

import { useCallback } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";

const AGENT_ID = "agent_3601krs5kq8mfnz9s57xcm9vd1yy";

function VoiceAgentInner() {
  const conversation = useConversation({
    onError: (error) => {
      console.error("ElevenLabs error:", error);
    },
  });

  const isConnected = conversation.status === "connected";
  const isConnecting = conversation.status === "connecting";

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

  const state = isConnected ? "listening" : "idle";

  const hint = isConnecting
    ? "Connecting..."
    : isConnected
      ? conversation.isSpeaking
        ? "Agent speaking..."
        : "Listening..."
      : "Tap to start";

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
    </div>
  );
}

export function VoiceTranscript() {
  return (
    <ConversationProvider>
      <VoiceAgentInner />
    </ConversationProvider>
  );
}
