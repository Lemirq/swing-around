import { ElevenLabsTranscriptionClient } from "./elevenlabs-client";

export default async function ElevenLabsTranscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session } = await searchParams;

  return (
    <main className="party-frame">
      {session ? (
        <ElevenLabsTranscriptionClient sessionSlug={session} />
      ) : (
        <p className="mic-hint">
          Missing session — use a link with ?session=your-party-slug
        </p>
      )}
    </main>
  );
}
