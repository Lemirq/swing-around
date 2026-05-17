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
      .take(200);
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

export const retriggerMatch = mutation({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile) throw new Error("Profile not found");
    await ctx.db.patch(args.profileId, { embeddingStatus: "pending" });
    await ctx.scheduler.runAfter(0, internal.enrichment.extractProfile, {
      profileId: args.profileId,
      sessionId: profile.sessionId,
    });
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

export const patchExaEnrichment = internalMutation({
  args: {
    profileId: v.id("profiles"),
    headline: v.optional(v.string()),
    company: v.optional(v.string()),
    title: v.optional(v.string()),
    skills: v.optional(v.array(v.string())),
    education: v.optional(v.string()),
    location: v.optional(v.string()),
    xHandle: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),
    githubHandle: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    exaSummary: v.optional(v.string()),
    exaLinks: v.optional(
      v.array(
        v.object({
          url: v.string(),
          title: v.optional(v.string()),
          type: v.optional(v.string()),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const { profileId, ...fields } = args;
    // Only patch fields that are defined (don't overwrite existing data with undefined)
    const patch: Record<string, unknown> = { exaEnriched: true };
    for (const [key, val] of Object.entries(fields)) {
      if (val !== undefined) patch[key] = val;
    }
    await ctx.db.patch(profileId, patch);
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

/**
 * Store profile in GBrain and find matches using GBrain's semantic search.
 *
 * GBrain HTTP API (gbrain-http.ts):
 *   POST /put/:slug   — stores a page with content
 *   POST /tag/:slug/:tag — tags a page for filtered queries
 *   POST /query        — semantic search across stored pages
 *
 * This replaces the previous OpenAI embedding + Convex vector search approach.
 * GBrain handles both the embedding generation and the similarity search internally.
 */
export const embedAndMatch = internalAction({
  args: {
    profileId: v.id("profiles"),
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    const gbrainUrl = process.env.GBRAIN_URL;
    if (!gbrainUrl) throw new Error("GBRAIN_URL is not set");

    const profile = await ctx.runQuery(internal.profiles.getById, {
      profileId: args.profileId,
    });
    if (!profile) throw new Error(`Profile ${args.profileId} not found`);

    // Build rich content for gbrain to embed — prefer LLM-extracted data
    const parts = [
      `# ${profile.displayName}`,
      profile.headline ? `Headline: ${profile.headline}` : "",
      profile.extractedBio ?? profile.bio ?? "",
      profile.company ? `Company: ${profile.company}` : "",
      profile.title ? `Role: ${profile.title}` : "",
      profile.education ? `Education: ${profile.education}` : "",
      profile.location ? `Location: ${profile.location}` : "",
      (profile.extractedInterests ?? profile.interests)?.length
        ? `Interests: ${(profile.extractedInterests ?? profile.interests)!.join(", ")}`
        : "",
      (profile.skills)?.length
        ? `Skills: ${profile.skills.join(", ")}`
        : "",
      profile.exaSummary ? `Background: ${profile.exaSummary}` : "",
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
    const slug = args.profileId as string;
    const base = gbrainUrl.replace(/\/$/, "");

    try {
      // Step 1: Store the profile content in gbrain
      const putRes = await fetch(`${base}/put/${encodeURIComponent(slug)}`, {
        method: "POST",
        body: content,
      });
      if (!putRes.ok) {
        const body = await putRes.text();
        throw new Error(`gbrain PUT failed (${putRes.status}): ${body.slice(0, 200)}`);
      }

      // Step 2: Tag the profile with its session for scoped queries
      const tagRes = await fetch(`${base}/tag/${encodeURIComponent(slug)}/session:${args.sessionId}`, {
        method: "POST",
      });
      if (!tagRes.ok) {
        const body = await tagRes.text();
        throw new Error(`gbrain TAG failed (${tagRes.status}): ${body.slice(0, 200)}`);
      }

      // Step 3: Query gbrain for similar profiles in this session
      const queryRes = await fetch(`${base}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: content,
          sessionId: args.sessionId,
          limit: 20,
        }),
      });
      if (!queryRes.ok) {
        const body = await queryRes.text();
        throw new Error(`gbrain QUERY failed (${queryRes.status}): ${body.slice(0, 200)}`);
      }
      const queryData = (await queryRes.json()) as {
        ok: boolean;
        results: Array<{ slug: string; score: number; preview: string }>;
      };

      const matchResults: Array<{ matchedProfileId: Id<"profiles">; score: number }> = [];

      for (const result of queryData.results ?? []) {
        if (result.slug === slug) continue;
        const matchedProfileId = result.slug as Id<"profiles">;

        await ctx.runMutation(internal.matching.upsertMatch, {
          profileId: args.profileId,
          sessionId: args.sessionId,
          matchedProfileId,
          score: result.score,
        });

        // Write reverse so existing users see new joiners on their explore page
        await ctx.runMutation(internal.matching.upsertMatch, {
          profileId: matchedProfileId,
          sessionId: args.sessionId,
          matchedProfileId: args.profileId,
          score: result.score,
        });

        matchResults.push({ matchedProfileId, score: result.score });
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
