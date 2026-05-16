import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalAction,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

export const create = mutation({
  args: {
    sessionId: v.id("sessions"),
    displayName: v.string(),
    bio: v.optional(v.string()),
    interests: v.optional(v.array(v.string())),
    xHandle: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),
    githubHandle: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    rawTranscript: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("profiles", {
      ...args,
      embeddingStatus: "pending",
    });
    await ctx.scheduler.runAfter(0, internal.enrichment.extractProfile, {
      profileId: id,
      sessionId: args.sessionId,
    });
    return id;
  },
});

export const listBySession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("profiles")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .take(100);
  },
});

export const getProfile = query({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.profileId);
  },
});

export const getById = internalQuery({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.profileId);
  },
});

export const patchEmbeddingStatus = internalMutation({
  args: {
    profileId: v.id("profiles"),
    status: v.union(
      v.literal("pending"),
      v.literal("done"),
      v.literal("failed"),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.profileId, { embeddingStatus: args.status });
  },
});

export const patchExtracted = internalMutation({
  args: {
    profileId: v.id("profiles"),
    extractedBio: v.string(),
    extractedInterests: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.profileId, {
      extractedBio: args.extractedBio,
      extractedInterests: args.extractedInterests,
    });
  },
});

export const patchEmbedding = internalMutation({
  args: {
    profileId: v.id("profiles"),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.profileId, { embedding: args.embedding });
  },
});

export const embedAndMatch = internalAction({
  args: {
    profileId: v.id("profiles"),
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.runQuery(internal.profiles.getById, {
      profileId: args.profileId,
    });
    if (!profile) throw new Error(`Profile ${args.profileId} not found`);

    // Prefer LLM-extracted data over raw transcript for better embeddings
    const parts = [
      `# ${profile.displayName}`,
      profile.extractedBio ?? profile.bio ?? "",
      (profile.extractedInterests ?? profile.interests)?.length
        ? `Interests: ${(profile.extractedInterests ?? profile.interests)!.join(", ")}`
        : "",
      profile.rawTranscript ?? "",
    ].filter(Boolean);

    if (parts.length <= 1) {
      await ctx.runMutation(internal.profiles.patchEmbeddingStatus, {
        profileId: args.profileId,
        status: "failed",
      });
      return;
    }

    const content = parts.join("\n\n");

    try {
      // Generate embedding via OpenAI
      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) throw new Error("OPENAI_API_KEY is not set");

      const embeddingRes = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: content,
        }),
      });
      const embeddingData = (await embeddingRes.json()) as {
        data: Array<{ embedding: number[] }>;
      };
      const embedding = embeddingData.data[0].embedding;

      // Store embedding on profile
      await ctx.runMutation(internal.profiles.patchEmbedding, {
        profileId: args.profileId,
        embedding,
      });

      // Search for similar profiles in the same session
      const results = await ctx.vectorSearch("profiles", "by_embedding", {
        vector: embedding,
        limit: 20,
        filter: (q) => q.eq("sessionId", args.sessionId),
      });

      const matchResults: Array<{ matchedProfileId: Id<"profiles">; score: number }> = [];

      for (const result of results) {
        if (result._id === args.profileId) continue;
        const matchedProfileId = result._id;

        await ctx.runMutation(internal.matching.upsertMatch, {
          profileId: args.profileId,
          sessionId: args.sessionId,
          matchedProfileId,
          score: result._score,
        });

        // Write reverse so existing users see new joiners on their explore page
        await ctx.runMutation(internal.matching.upsertMatch, {
          profileId: matchedProfileId,
          sessionId: args.sessionId,
          matchedProfileId: args.profileId,
          score: result._score,
        });

        matchResults.push({ matchedProfileId, score: result._score });
      }

      await ctx.runMutation(internal.profiles.patchEmbeddingStatus, {
        profileId: args.profileId,
        status: "done",
      });

      // Generate match reasons for top 5 matches
      const top5 = matchResults
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      for (const match of top5) {
        const matchDoc = await ctx.runQuery(internal.matching.getMatchDoc, {
          profileId: args.profileId,
          matchedProfileId: match.matchedProfileId,
        });
        if (matchDoc) {
          await ctx.scheduler.runAfter(0, internal.enrichment.generateMatchReasons, {
            profileId: args.profileId,
            matchedProfileId: match.matchedProfileId,
            matchId: matchDoc._id,
          });
        }
      }
    } catch (err) {
      await ctx.runMutation(internal.profiles.patchEmbeddingStatus, {
        profileId: args.profileId,
        status: "failed",
      });
      throw err;
    }
  },
});
