import { Composio } from "@composio/core";
import OpenAI from "openai";

const COMPOSIO_USER_ID = process.env.COMPOSIO_USER_ID ?? "default";
// composio_search is Composio's built-in web-search toolkit (no OAuth needed).
// Override with COMPOSIO_TOOLKITS="composio_search,twitter,linkedin" once
// connected accounts exist for those services.
const TOOLKITS = (process.env.COMPOSIO_TOOLKITS ?? "composio_search")
  .split(",")
  .map((t) => t.trim())
  .filter(Boolean);

export type EnrichmentInput = {
  fullName: string;
  xHandle?: string;
  linkedinUrl?: string;
};

export type Enrichment = {
  summary: string;
};

const EMPTY: Enrichment = { summary: "" };

export async function enrichProfile(input: EnrichmentInput): Promise<Enrichment> {
  const composioKey = process.env.COMPOSIO_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!composioKey || !openaiKey) {
    return EMPTY;
  }

  try {
    const composio = new Composio({ apiKey: composioKey });
    const openai = new OpenAI({ apiKey: openaiKey });

    const tools = await composio.tools.get(COMPOSIO_USER_ID, {
      toolkits: TOOLKITS,
    });

    const target = [
      `Full name: ${input.fullName}`,
      input.xHandle ? `X/Twitter handle: ${input.xHandle}` : null,
      input.linkedinUrl ? `LinkedIn URL: ${input.linkedinUrl}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content:
          "You research people for an event-matching app. Use the available tools to find " +
          "public information about the person: what they build, their work, interests, and " +
          "notable projects. Then write a concise factual summary. If you find nothing, say so.",
      },
      { role: "user", content: `Research this person:\n${target}` },
    ];

    for (let step = 0; step < 4; step += 1) {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? "auto" : undefined,
      });

      const choice = response.choices[0].message;
      messages.push(choice);

      const toolCalls = (choice.tool_calls ?? []).filter(
        (call) => call.type === "function",
      );
      if (toolCalls.length === 0) {
        return { summary: choice.content?.trim() ?? "" };
      }

      for (const toolCall of toolCalls) {
        const result = await composio.provider.executeToolCall(
          COMPOSIO_USER_ID,
          toolCall,
        );
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: typeof result === "string" ? result : JSON.stringify(result),
        });
      }
    }

    return EMPTY;
  } catch (error) {
    console.error("[composio] enrichment failed:", error);
    return EMPTY;
  }
}
