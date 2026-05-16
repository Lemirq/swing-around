import OpenAI from "openai";
import type { Enrichment } from "./composio";

export type BuildProfileInput = {
  fullName: string;
  transcript: string;
  enrichment: Enrichment;
  xHandle?: string;
  linkedinUrl?: string;
};

export type BuiltProfile = {
  markdown: string;
  tags: string[];
};

function slugifyTag(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function buildProfile(input: BuildProfileInput): Promise<BuiltProfile> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const openai = new OpenAI({ apiKey: openaiKey });

  const sources = [
    `Full name: ${input.fullName}`,
    input.xHandle ? `X/Twitter: ${input.xHandle}` : null,
    input.linkedinUrl ? `LinkedIn: ${input.linkedinUrl}` : null,
    "",
    "Voice intro transcript:",
    input.transcript.trim() || "(none provided)",
    "",
    "Web research:",
    input.enrichment.summary.trim() || "(none found)",
  ]
    .filter((line) => line !== null)
    .join("\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You build attendee profiles for an event people-matching app. Given a voice intro " +
          "and web research about one person, produce a JSON object with two fields:\n" +
          '- "markdown": a clean, factual profile in markdown — a short summary, what they are ' +
          "building/working on, their interests, and any relevant links.\n" +
          '- "interests": an array of 3-8 short lowercase interest/topic keywords for matching ' +
          '(e.g. "ai agents", "rust", "climate", "design").\n' +
          "Only use information present in the input. Do not invent facts.",
      },
      { role: "user", content: sources },
    ],
  });

  const raw = response.choices[0].message.content ?? "{}";
  let parsed: { markdown?: string; interests?: string[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  const interests = Array.isArray(parsed.interests) ? parsed.interests : [];
  const tags = [
    "person",
    ...interests.map(slugifyTag).filter(Boolean),
  ];

  const markdown =
    parsed.markdown?.trim() ||
    `# ${input.fullName}\n\n${input.transcript.trim() || "(no intro provided)"}`;

  return { markdown, tags };
}
