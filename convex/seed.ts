import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

export const createSessionAndProfiles = internalAction({
  args: {
    partyName: v.string(),
    slug: v.string(),
    profiles: v.array(
      v.object({
        displayName: v.string(),
        bio: v.optional(v.string()),
        interests: v.optional(v.array(v.string())),
        xHandle: v.optional(v.string()),
        linkedinUrl: v.optional(v.string()),
        githubHandle: v.optional(v.string()),
        websiteUrl: v.optional(v.string()),
        headline: v.optional(v.string()),
        company: v.optional(v.string()),
        title: v.optional(v.string()),
        location: v.optional(v.string()),
        rawTranscript: v.optional(v.string()),
      }),
    ),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ sessionId: Id<"sessions">; slug: string; profileCount: number }> => {
    const sessionId = await ctx.runMutation(internal.seed.insertSession, {
      partyName: args.partyName,
      slug: args.slug,
    });

    const profileIds: string[] = [];
    for (const profile of args.profiles) {
      const profileId = await ctx.runMutation(internal.seed.insertProfile, {
        sessionId,
        ...profile,
      });
      profileIds.push(profileId);
    }

    // Kick off enrichment for each profile
    for (const profileId of profileIds) {
      await ctx.scheduler.runAfter(0, internal.enrichment.extractProfile, {
        profileId: profileId as Id<"profiles">,
        sessionId,
      });
    }

    return { sessionId, slug: args.slug, profileCount: profileIds.length };
  },
});

export const retryFailed = internalAction({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args): Promise<{ retried: number }> => {
    const profiles = await ctx.runQuery(internal.seed.getFailedProfiles, {
      sessionId: args.sessionId,
    });
    for (const p of profiles) {
      await ctx.runMutation(internal.profiles.patchEmbeddingStatus, {
        profileId: p._id,
        status: "pending",
      });
      await ctx.scheduler.runAfter(0, internal.enrichment.enrichWithHog, {
        profileId: p._id,
        sessionId: args.sessionId,
      });
    }
    return { retried: profiles.length };
  },
});

export const retryPending = internalAction({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args): Promise<{ retried: number }> => {
    const profiles = await ctx.runQuery(internal.seed.getPendingProfiles, {
      sessionId: args.sessionId,
    });
    for (const p of profiles) {
      await ctx.scheduler.runAfter(0, internal.enrichment.enrichWithHog, {
        profileId: p._id,
        sessionId: args.sessionId,
      });
    }
    return { retried: profiles.length };
  },
});

export const getFailedProfiles = internalQuery({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("profiles")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .take(200);
    return all.filter((p) => p.embeddingStatus === "failed");
  },
});

export const getPendingProfiles = internalQuery({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("profiles")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .take(200);
    return all.filter((p) => p.embeddingStatus === "pending");
  },
});

export const insertSession = internalMutation({
  args: {
    partyName: v.string(),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (existing) return existing._id;

    return await ctx.db.insert("sessions", {
      slug: args.slug,
      partyName: args.partyName,
    });
  },
});

export const insertProfile = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    displayName: v.string(),
    bio: v.optional(v.string()),
    interests: v.optional(v.array(v.string())),
    xHandle: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),
    githubHandle: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    headline: v.optional(v.string()),
    company: v.optional(v.string()),
    title: v.optional(v.string()),
    location: v.optional(v.string()),
    rawTranscript: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("profiles", {
      sessionId: args.sessionId,
      displayName: args.displayName,
      bio: args.bio,
      interests: args.interests,
      xHandle: args.xHandle,
      linkedinUrl: args.linkedinUrl,
      githubHandle: args.githubHandle,
      websiteUrl: args.websiteUrl,
      headline: args.headline,
      company: args.company,
      title: args.title,
      location: args.location,
      rawTranscript: args.rawTranscript,
      embeddingStatus: "pending",
    });
  },
});
