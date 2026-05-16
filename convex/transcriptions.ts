import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const save = mutation({
  args: {
    sessionId: v.id("sessions"),
    displayName: v.string(),
    rawTranscript: v.string(),
    audioFileId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args): Promise<Id<"transcriptions">> => {
    // Create a profile to trigger gbrain embedding + matching
    const profileId: Id<"profiles"> = await ctx.runMutation(
      api.profiles.create,
      {
        sessionId: args.sessionId,
        displayName: args.displayName,
        rawTranscript: args.rawTranscript,
      },
    );

    // Save the transcription record with audio file reference
    const id: Id<"transcriptions"> = await ctx.db.insert("transcriptions", {
      sessionId: args.sessionId,
      displayName: args.displayName,
      rawTranscript: args.rawTranscript,
      audioFileId: args.audioFileId,
      profileId,
    });

    return id;
  },
});
