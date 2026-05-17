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

    // Enrich with The Hog people research, then store in gbrain and match
    await ctx.runAction(internal.enrichment.enrichWithHog, {
      profileId: args.profileId,
      sessionId: args.sessionId,
    });
  },
});

/**
 * Enrich a profile using The Hog (thehog.ai) people research API.
 * Replaces the previous Exa-based enrichment.
 *
 * The Hog provides:
 *   POST /api/people/researches  — deep research on social identities
 *   POST /api/v1/people/search   — find & qualify people by query
 *   POST /api/people/enrich      — get verified contact info
 */
export const enrichWithHog = internalAction({
  args: {
    profileId: v.id("profiles"),
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    const hogApiKey = process.env.HOG_API_KEY;
    const HOG_BASE = "https://developer.thehog.ai";

    if (!hogApiKey) {
      console.warn("HOG_API_KEY not set, skipping Hog enrichment");
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

    const hogHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${hogApiKey}`,
    };

    try {
      // Step 1: If we have social handles, use The Hog's people research
      const identities: Array<{ platform: string; username: string }> = [];
      if (profile.linkedinUrl) {
        // Extract LinkedIn username from URL
        const match = profile.linkedinUrl.match(/linkedin\.com\/in\/([^/?]+)/);
        if (match) identities.push({ platform: "linkedin", username: match[1] });
      }
      if (profile.xHandle) {
        identities.push({ platform: "x", username: profile.xHandle.replace(/^@/, "") });
      }
      if (profile.githubHandle) {
        identities.push({ platform: "github", username: profile.githubHandle });
      }

      let hogResult: {
        fullName?: string;
        title?: string;
        companyName?: string;
        location?: string;
      } | null = null;
      const exaLinks: Array<{ url: string; title?: string; type?: string }> = [];

      if (identities.length > 0) {
        // Use The Hog people research for deep profile enrichment
        const researchRes = await fetch(`${HOG_BASE}/api/people/researches`, {
          method: "POST",
          headers: hogHeaders,
          body: JSON.stringify({ identities }),
        });

        if (researchRes.ok) {
          const researchData = await researchRes.json();

          // If async (202), poll for completion
          if (researchRes.status === 202 && researchData.pollUrl) {
            let pollResult = null;
            for (let attempt = 0; attempt < 10; attempt++) {
              await new Promise((r) => setTimeout(r, 3000));
              const pollRes = await fetch(`${HOG_BASE}${researchData.pollUrl}`, {
                headers: hogHeaders,
              });
              if (pollRes.ok) {
                const pollData = await pollRes.json();
                if (pollData.status === "succeeded") {
                  pollResult = pollData.result;
                  break;
                }
                if (pollData.status === "failed") break;
              }
            }
            if (pollResult) hogResult = pollResult;
          } else if (researchData.data) {
            hogResult = researchData.data;
          }
        } else {
          console.error("Hog research failed:", researchRes.status, await researchRes.text());
        }
      }

      // Step 2: Also do a people search by name to find more info
      const searchQuery = [
        profile.displayName,
        profile.extractedBio?.slice(0, 100),
        profile.extractedInterests?.slice(0, 3).join(" "),
      ].filter(Boolean).join(" ");

      const searchRes = await fetch(`${HOG_BASE}/api/v1/people/search`, {
        method: "POST",
        headers: hogHeaders,
        body: JSON.stringify({
          query: searchQuery,
          maxResults: 5,
        }),
      });

      let searchPeople: Array<{
        id?: string;
        fullName?: string;
        title?: string;
        companyName?: string;
        location?: string;
      }> = [];

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        searchPeople = searchData.data ?? [];
      } else {
        console.error("Hog people search failed:", searchRes.status);
      }

      // Step 3: Synthesize Hog results with LLM into structured profile data
      const hogContext = [
        hogResult ? `Research result: ${JSON.stringify(hogResult)}` : "",
        searchPeople.length > 0
          ? `People search results: ${JSON.stringify(searchPeople.slice(0, 3))}`
          : "",
      ].filter(Boolean).join("\n\n");

      if (hogContext) {
        const { output } = await generateText({
          model: openai("gpt-4o-mini"),
          output: Output.object({
            schema: z.object({
              headline: z.nullable(z.string()).describe("Professional headline, or null"),
              company: z.nullable(z.string()).describe("Current company/org, or null"),
              title: z.nullable(z.string()).describe("Job title or role, or null"),
              skills: z.nullable(z.array(z.string()).max(10)).describe("Professional skills, or null"),
              education: z.nullable(z.string()).describe("Education (school + degree), or null"),
              location: z.nullable(z.string()).describe("City or region, or null"),
              linkedinUrl: z.nullable(z.string()).describe("LinkedIn URL if found, or null"),
              githubHandle: z.nullable(z.string()).describe("GitHub username if found, or null"),
              xHandle: z.nullable(z.string()).describe("X handle (without @) if found, or null"),
              websiteUrl: z.nullable(z.string()).describe("Personal website if found, or null"),
              summary: z.string().describe("2-3 sentence summary of who this person is"),
            }),
          }),
          prompt: `Based on The Hog research results about "${profile.displayName}", extract their professional profile. Only include fields you're confident about.\n\nHog results:\n${hogContext}`,
        });

        if (output) {
          // Collect any discovered links
          if (output.linkedinUrl) exaLinks.push({ url: output.linkedinUrl, title: "LinkedIn", type: "linkedin" });
          if (output.githubHandle) exaLinks.push({ url: `https://github.com/${output.githubHandle}`, title: "GitHub", type: "github" });
          if (output.websiteUrl) exaLinks.push({ url: output.websiteUrl, title: "Website", type: "other" });

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
            exaLinks: exaLinks.length > 0 ? exaLinks : undefined,
          });
        }
      }
    } catch (err) {
      console.error("Hog enrichment failed:", err);
    }

    // Always proceed to gbrain embed and match
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
