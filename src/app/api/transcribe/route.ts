import { experimental_transcribe as transcribe } from "ai";
import { openai } from "@ai-sdk/openai";

export async function POST(request: Request) {
  const formData = await request.formData();
  const audio = formData.get("audio");

  if (!audio || !(audio instanceof Blob)) {
    return Response.json({ error: "No audio file provided." }, { status: 400 });
  }

  const arrayBuffer = await audio.arrayBuffer();

  const result = await transcribe({
    model: openai.transcription("whisper-1"),
    audio: new Uint8Array(arrayBuffer),
  });

  return Response.json({
    text: result.text,
    segments: result.segments,
    language: result.language,
    durationInSeconds: result.durationInSeconds,
  });
}
