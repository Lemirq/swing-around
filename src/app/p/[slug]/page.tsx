"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useParams } from "next/navigation";
import { VoiceTranscript } from "./voice-transcript";

export default function PartyPage() {
  const { slug } = useParams<{ slug: string }>();
  const session = useQuery(api.sessions.getBySlug, { slug });

  if (session === undefined) {
    return (
      <main className="party-frame">
        <p className="mic-hint">Loading...</p>
      </main>
    );
  }

  if (session === null) {
    return (
      <main className="party-frame">
        <p className="mic-error">Session not found.</p>
      </main>
    );
  }

  return (
    <main className="party-frame">
      <p className="party-name">{session.partyName}</p>
      <VoiceTranscript slug={slug} />
    </main>
  );
}
