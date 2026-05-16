import { getSession } from "@/lib/sessions";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { VoiceTranscript } from "./voice-transcript";

export default async function PartyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();

  const { slug } = await params;
  const session = getSession(slug);

  if (!session) {
    notFound();
  }

  return (
    <main className="party-frame">
      <p className="party-name">{session.partyName}</p>
      <VoiceTranscript />
    </main>
  );
}
