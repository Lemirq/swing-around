import { ElevenLabsTranscriptionClient } from "./elevenlabs-client";

export default async function ElevenLabsTranscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session } = await searchParams;

  return (
    <main className="party-frame">
      <ElevenLabsTranscriptionClient sessionSlug={session} />
    </main>
  );
}
