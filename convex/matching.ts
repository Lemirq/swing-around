import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";

export const upsertMatch = internalMutation({
  args: {
    profileId: v.id("profiles"),
    sessionId: v.id("sessions"),
    matchedProfileId: v.id("profiles"),
    score: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("matches")
      .withIndex("by_profileId_and_matchedProfileId", (q) =>
        q.eq("profileId", args.profileId).eq("matchedProfileId", args.matchedProfileId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { score: args.score });
    } else {
      await ctx.db.insert("matches", {
        profileId: args.profileId,
        sessionId: args.sessionId,
        matchedProfileId: args.matchedProfileId,
        score: args.score,
        reasons: [],
      });
    }
  },
});

export const getMatchesForProfile = query({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, args) => {
    const matches = await ctx.db
      .query("matches")
      .withIndex("by_profileId", (q) => q.eq("profileId", args.profileId))
      .order("desc")
      .take(50);

    const enriched = await Promise.all(
      matches.map(async (match) => {
        const profile = await ctx.db.get(match.matchedProfileId);
        return { ...match, matchedProfile: profile };
      }),
    );

    return enriched
      .filter((m) => m.matchedProfile !== null)
      .sort((a, b) => b.score - a.score);
  },
});

export const getMatchesForSession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("matches")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .take(200);
  },
});

export const getMatchDoc = internalQuery({
  args: {
    profileId: v.id("profiles"),
    matchedProfileId: v.id("profiles"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("matches")
      .withIndex("by_profileId_and_matchedProfileId", (q) =>
        q.eq("profileId", args.profileId).eq("matchedProfileId", args.matchedProfileId),
      )
      .unique();
  },
});

export const patchReasons = internalMutation({
  args: {
    matchId: v.id("matches"),
    reasons: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.matchId, { reasons: args.reasons });
  },
});
