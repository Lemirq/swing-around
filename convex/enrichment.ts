"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

export const extractProfile = internalAction({
  args: {
    profileId: v.id("profiles"),
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.runQuery(internal.profiles.getById, {
      profileId: args.profileId,
    });
    if (!profile) throw new Error(`Profile ${args.profileId} not found`);

    const transcript = profile.rawTranscript;
    if (transcript && transcript.length > 50) {
      try {
        const { output } = await generateText({
          model: openai("gpt-4o-mini"),
          output: Output.object({
            schema: z.object({
              bio: z.string().describe("A concise 1-2 sentence bio of this person based on what they shared"),
              interests: z.array(z.string()).min(1).max(8).describe("3-8 keyword interest tags"),
            }),
          }),
          prompt: `Extract a short bio and interest tags from this networking conversation transcript.\n\nName: ${profile.displayName}\n\nTranscript:\n${transcript}`,
        });

        if (output) {
          await ctx.runMutation(internal.profiles.patchExtracted, {
            profileId: args.profileId,
            extractedBio: output.bio,
            extractedInterests: output.interests,
          });
        }
      } catch (err) {
        console.error("Profile extraction failed:", err);
      }
    }

    // Enrich with Exa research, then embed and match
    await ctx.runAction(internal.enrichment.enrichWithExa, {
      profileId: args.profileId,
      sessionId: args.sessionId,
    });
  },
});

export const enrichWithExa = internalAction({
  args: {
    profileId: v.id("profiles"),
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    const exaApiKey = process.env.EXA_API_KEY;

    if (!exaApiKey) {
      console.warn("EXA_API_KEY not set, skipping Exa enrichment");
      await ctx.runAction(internal.profiles.embedAndMatch, {
        profileId: args.profileId,
        sessionId: args.sessionId,
      });
      return;
    }

    const profile = await ctx.runQuery(internal.profiles.getById, {
      profileId: args.profileId,
    });
    if (!profile) {
      await ctx.runAction(internal.profiles.embedAndMatch, {
        profileId: args.profileId,
        sessionId: args.sessionId,
      });
      return;
    }

    // Build search query from what we know about the person
    const nameParts = [profile.displayName];
    if (profile.extractedBio) nameParts.push(profile.extractedBio);
    if (profile.extractedInterests?.length) {
      nameParts.push(profile.extractedInterests.slice(0, 3).join(" "));
    }
    const searchQuery = nameParts.join(" ");

    try {
      // Search Exa for this person
      const exaRes = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": exaApiKey,
        },
        body: JSON.stringify({
          query: searchQuery,
          numResults: 10,
          type: "neural",
          useAutoprompt: true,
          contents: {
            text: { maxCharacters: 500 },
          },
        }),
      });

      if (!exaRes.ok) {
        console.error("Exa search failed:", exaRes.status, await exaRes.text());
        await ctx.runAction(internal.profiles.embedAndMatch, {
          profileId: args.profileId,
          sessionId: args.sessionId,
        });
        return;
      }

      const exaData = (await exaRes.json()) as {
        results: Array<{
          url: string;
          title: string;
          text?: string;
        }>;
      };

      const results = exaData.results ?? [];

      // Collect links with type classification
      const exaLinks: Array<{ url: string; title?: string; type?: string }> = [];
      for (const r of results) {
        let type = "other";
        const url = r.url.toLowerCase();
        if (url.includes("linkedin.com")) type = "linkedin";
        else if (url.includes("github.com")) type = "github";
        else if (url.includes("twitter.com") || url.includes("x.com"))
          type = "twitter";
        else if (
          url.includes("medium.com") ||
          url.includes("substack.com") ||
          url.includes("dev.to")
        )
          type = "blog";
        exaLinks.push({ url: r.url, title: r.title, type });
      }

      // Use LLM to synthesize Exa results into structured profile data
      const resultsText = results
        .map((r) => `[${r.title}](${r.url})\n${r.text ?? ""}`)
        .join("\n\n");

      const { output } = await generateText({
        model: openai("gpt-4o-mini"),
        output: Output.object({
          schema: z.object({
            headline: z
              .nullable(z.string())
              .describe("Professional headline like on LinkedIn, or null if unknown"),
            company: z.nullable(z.string()).describe("Current company/org, or null if unknown"),
            title: z.nullable(z.string()).describe("Current job title or role, or null if unknown"),
            skills: z
              .nullable(z.array(z.string()).max(10))
              .describe("Technical or professional skills, or null if unknown"),
            education: z
              .nullable(z.string())
              .describe("Most notable education (school + degree), or null if unknown"),
            location: z.nullable(z.string()).describe("City or region, or null if unknown"),
            linkedinUrl: z.nullable(z.string()).describe("LinkedIn profile URL if found, or null"),
            githubHandle: z
              .nullable(z.string())
              .describe("GitHub username if found, or null"),
            xHandle: z
              .nullable(z.string())
              .describe("Twitter/X handle if found (without @), or null"),
            websiteUrl: z.nullable(z.string()).describe("Personal website URL if found, or null"),
            summary: z
              .string()
              .describe(
                "2-3 sentence summary of who this person is based on search results",
              ),
          }),
        }),
        prompt: `Based on these search results about "${profile.displayName}", extract their professional profile info. Only include fields you're confident about. If results don't clearly match this person, return minimal data with null for unknown fields.\n\nSearch results:\n${resultsText}`,
      });

      if (output) {
        await ctx.runMutation(internal.profiles.patchExaEnrichment, {
          profileId: args.profileId,
          headline: output.headline ?? undefined,
          company: output.company ?? undefined,
          title: output.title ?? undefined,
          skills: output.skills ?? undefined,
          education: output.education ?? undefined,
          location: output.location ?? undefined,
          linkedinUrl: output.linkedinUrl ?? undefined,
          githubHandle: output.githubHandle ?? undefined,
          xHandle: output.xHandle ?? undefined,
          websiteUrl: output.websiteUrl ?? undefined,
          exaSummary: output.summary ?? undefined,
          exaLinks,
        });
      }
    } catch (err) {
      console.error("Exa enrichment failed:", err);
    }

    // Always proceed to embed and match regardless of Exa success
    await ctx.runAction(internal.profiles.embedAndMatch, {
      profileId: args.profileId,
      sessionId: args.sessionId,
    });
  },
});

export const generateMatchReasons = internalAction({
  args: {
    profileId: v.id("profiles"),
    matchedProfileId: v.id("profiles"),
    matchId: v.id("matches"),
  },
  handler: async (ctx, args) => {
    const [profileA, profileB] = await Promise.all([
      ctx.runQuery(internal.profiles.getById, { profileId: args.profileId }),
      ctx.runQuery(internal.profiles.getById, { profileId: args.matchedProfileId }),
    ]);
    if (!profileA || !profileB) return;

    const describe = (p: typeof profileA) => {
      const bio = p!.extractedBio || p!.bio || "";
      const interests = (p!.extractedInterests || p!.interests || []).join(", ");
      return `Name: ${p!.displayName}\nBio: ${bio}\nInterests: ${interests}`;
    };

    try {
      const { output } = await generateText({
        model: openai("gpt-4o-mini"),
        output: Output.object({
          schema: z.object({
            reasons: z.array(z.string()).min(1).max(3).describe("2-3 short, specific reasons these people should connect"),
          }),
        }),
        prompt: `Given these two people at a networking event, generate 2-3 short specific reasons they should connect. Be concrete about shared interests or complementary skills.\n\nPerson A:\n${describe(profileA)}\n\nPerson B:\n${describe(profileB)}`,
      });

      if (output) {
        await ctx.runMutation(internal.matching.patchReasons, {
          matchId: args.matchId,
          reasons: output.reasons,
        });
      }
    } catch (err) {
      console.error("Match reason generation failed:", err);
    }
  },
});
