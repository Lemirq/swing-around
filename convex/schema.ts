import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sessions: defineTable({
    slug: v.string(),
    partyName: v.string(),
  }).index("by_slug", ["slug"]),

  profiles: defineTable({
    sessionId: v.id("sessions"),
    displayName: v.string(),
    bio: v.optional(v.string()),
    interests: v.optional(v.array(v.string())),
    xHandle: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),
    rawTranscript: v.optional(v.string()),
    metadata: v.optional(v.any()),
  }).index("by_sessionId", ["sessionId"]),
});
