import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sessions: defineTable({
    slug: v.string(),
    partyName: v.string(),
    hostName: v.optional(v.string()),
    location: v.optional(v.string()),
    startsAt: v.optional(v.number()),
    note: v.optional(v.string()),
  }).index("by_slug", ["slug"]),

  profiles: defineTable({
    sessionId: v.id("sessions"),
    displayName: v.string(),
    bio: v.optional(v.string()),
    interests: v.optional(v.array(v.string())),
    xHandle: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),
    githubHandle: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    rawTranscript: v.optional(v.string()),
    extractedBio: v.optional(v.string()),
    extractedInterests: v.optional(v.array(v.string())),
    metadata: v.optional(v.any()),
    embeddingStatus: v.union(
      v.literal("pending"),
      v.literal("done"),
      v.literal("failed"),
    ),
  }).index("by_sessionId", ["sessionId"]),

  transcriptions: defineTable({
    sessionId: v.optional(v.id("sessions")),
    displayName: v.string(),
    rawTranscript: v.string(),
    audioFileId: v.optional(v.id("_storage")),
    profileId: v.optional(v.id("profiles")),
  }).index("by_sessionId", ["sessionId"]),

  matches: defineTable({
    profileId: v.id("profiles"),
    sessionId: v.id("sessions"),
    matchedProfileId: v.id("profiles"),
    score: v.number(),
    reasons: v.array(v.string()),
  })
    .index("by_profileId", ["profileId"])
    .index("by_sessionId", ["sessionId"])
    .index("by_profileId_and_matchedProfileId", ["profileId", "matchedProfileId"]),
});
