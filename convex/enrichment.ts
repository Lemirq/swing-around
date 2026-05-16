"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { generateText, Output } from "ai";
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
          model: "openai/gpt-4o-mini",
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

    // Now trigger embed and match
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
        model: "openai/gpt-4o-mini",
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
