import { TranscriptionClient } from "./transcription-client";

export default async function TranscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session } = await searchParams;

  return (
    <main className="party-frame">
      {session ? (
        <TranscriptionClient sessionSlug={session} />
      ) : (
        <p className="mic-hint">
          Missing session — use a link with ?session=your-party-slug
        </p>
      )}
    </main>
  );
}
