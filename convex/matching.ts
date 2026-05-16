import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

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

    return enriched.filter((m) => m.matchedProfile !== null);
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
