import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const create = mutation({
  args: {
    partyName: v.string(),
  },
  handler: async (ctx, args) => {
    const slug = `party-${crypto.randomUUID().slice(0, 8)}`;
    const id = await ctx.db.insert("sessions", {
      slug,
      partyName: args.partyName,
    });
    return { id, slug };
  },
});

export const getBySlug = query({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    return session;
  },
});
