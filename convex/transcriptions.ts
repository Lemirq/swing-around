import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const save = mutation({
  args: {
    displayName: v.string(),
    rawTranscript: v.string(),
    audioFileId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("transcriptions", {
      displayName: args.displayName,
      rawTranscript: args.rawTranscript,
      audioFileId: args.audioFileId,
    });
    return id;
  },
});
