import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalAction,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { addDocument, queryDocuments } from "./lib/zeroentropy";
import { Id } from "./_generated/dataModel";

export const create = mutation({
  args: {
    sessionId: v.id("sessions"),
    displayName: v.string(),
    bio: v.optional(v.string()),
    interests: v.optional(v.array(v.string())),
    xHandle: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),
    rawTranscript: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("profiles", {
      ...args,
      embeddingStatus: "pending",
    });
    await ctx.scheduler.runAfter(0, internal.profiles.embedAndMatch, {
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

export const embedAndMatch = internalAction({
  args: {
    profileId: v.id("profiles"),
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.ZEROENTROPY_API_KEY;
    if (!apiKey) throw new Error("ZEROENTROPY_API_KEY is not set");

    const profile = await ctx.runQuery(internal.profiles.getById, {
      profileId: args.profileId,
    });
    if (!profile) throw new Error(`Profile ${args.profileId} not found`);

    const content = [
      profile.displayName,
      profile.bio ?? "",
      (profile.interests ?? []).join(", "),
      profile.rawTranscript ?? "",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await addDocument({
        apiKey,
        collection: "profiles",
        documentId: args.profileId,
        content,
        metadata: { sessionId: args.sessionId },
      });

      const results = await queryDocuments({
        apiKey,
        collection: "profiles",
        queryContent: content,
        topK: 20,
        filter: { sessionId: args.sessionId },
      });

      for (const result of results) {
        if (result.documentId === args.profileId) continue;
        await ctx.runMutation(internal.matching.upsertMatch, {
          profileId: args.profileId,
          sessionId: args.sessionId,
          matchedProfileId: result.documentId as Id<"profiles">,
          score: result.score,
        });
      }

      await ctx.runMutation(internal.profiles.patchEmbeddingStatus, {
        profileId: args.profileId,
        status: "done",
      });
    } catch (err) {
      await ctx.runMutation(internal.profiles.patchEmbeddingStatus, {
        profileId: args.profileId,
        status: "failed",
      });
      throw err;
    }
  },
});
