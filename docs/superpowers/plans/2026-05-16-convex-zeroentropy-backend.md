# Convex + Zeroentropy Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Next.js API routes with a full Convex backend, and add Zeroentropy for profile embedding and vector similarity matching.

**Architecture:** Convex handles all structured data (sessions, profiles, matches) via type-safe queries/mutations/actions. A Convex internal action calls the Zeroentropy REST API to embed profiles and search for similar ones. Matches are cached back into Convex so the frontend gets live updates via `useQuery`. Next.js is a pure frontend — no API routes remain.

**Tech Stack:** Convex 1.39, Zeroentropy REST API, Next.js 16, React 19, TypeScript, ElevenLabs React SDK (`@elevenlabs/react`), AI SDK + `@ai-sdk/openai`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `convex/schema.ts` | Modify | Add `embeddingStatus` to profiles, add `matches` table |
| `convex/lib/zeroentropy.ts` | Create | Thin fetch wrapper for Zeroentropy add + query |
| `convex/matching.ts` | Create | `upsertMatch` (internal mutation), `getMatchesForProfile` and `getMatchesForSession` (queries) |
| `convex/profiles.ts` | Modify | Add `getById` (internal query), `patchEmbeddingStatus` (internal mutation), `embedAndMatch` (internal action); update `create` to set status + schedule action |
| `src/app/p/[slug]/voice-transcript.tsx` | Modify | Capture transcript + name, submit via Convex `profiles.create`, redirect to explore |
| `src/app/p/[slug]/explore/page.tsx` | Create | Live matches list using `useQuery(api.matching.getMatchesForProfile)` |
| `src/app/api/sessions/route.ts` | Delete | Replaced by Convex (already unused) |
| `src/app/api/sessions/[slug]/route.ts` | Delete | Replaced by Convex (already unused) |
| `src/app/api/sessions/[slug]/profiles/route.ts` | Delete | Replaced by Convex |
| `.env` | Modify | Add `NEXT_PUBLIC_CONVEX_URL`, `ZEROENTROPY_API_KEY` |

---

### Task 1: Extend Convex schema

**Files:**
- Modify: `convex/schema.ts`

- [ ] Replace `convex/schema.ts` entirely with:

```typescript
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
    rawTranscript: v.optional(v.string()),
    metadata: v.optional(v.any()),
    embeddingStatus: v.union(
      v.literal("pending"),
      v.literal("done"),
      v.literal("failed"),
    ),
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
```

- [ ] Run `bunx convex dev` (or `npx convex dev`) and confirm the schema pushes with no errors. Leave it running for the rest of the tasks.

- [ ] Commit:
```bash
git add convex/schema.ts
git commit -m "feat(convex): add embeddingStatus to profiles, add matches table"
```

---

### Task 2: Create Zeroentropy client helper

**Files:**
- Create: `convex/lib/zeroentropy.ts`

> **Before implementing:** Visit https://zeroentropy.dev/docs and verify the exact endpoint paths, request body field names, and response shape. The code below uses best-guess names — adjust any that differ.

- [ ] Create `convex/lib/zeroentropy.ts`:

```typescript
const BASE_URL = "https://api.zeroentropy.dev";

export type ZeroEntropyMatch = {
  documentId: string;
  score: number;
};

export async function addDocument(args: {
  apiKey: string;
  collection: string;
  documentId: string;
  content: string;
  metadata?: Record<string, string>;
}): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/documents/add`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      collection: args.collection,
      document_id: args.documentId,
      content: args.content,
      metadata: args.metadata ?? {},
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zeroentropy addDocument ${res.status}: ${text}`);
  }
}

export async function queryDocuments(args: {
  apiKey: string;
  collection: string;
  queryContent: string;
  topK: number;
  filter?: Record<string, string>;
}): Promise<ZeroEntropyMatch[]> {
  const res = await fetch(`${BASE_URL}/api/documents/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      collection: args.collection,
      query_content: args.queryContent,
      top_k: args.topK,
      filter: args.filter ?? {},
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zeroentropy queryDocuments ${res.status}: ${text}`);
  }
  const data = await res.json();
  // Adapt this line if the response shape differs (e.g. data.results, data.hits, etc.)
  const raw: Array<{ document_id: string; score: number }> =
    data.results ?? data;
  return raw.map((r) => ({ documentId: r.document_id, score: r.score }));
}
```

- [ ] Commit:
```bash
git add convex/lib/zeroentropy.ts
git commit -m "feat(convex): add Zeroentropy REST client helper"
```

---

### Task 3: Create convex/matching.ts

**Files:**
- Create: `convex/matching.ts`

- [ ] Create `convex/matching.ts`:

```typescript
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

    // Join matched profile data
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
```

- [ ] Confirm `bunx convex dev` still shows no errors in the terminal.

- [ ] Commit:
```bash
git add convex/matching.ts
git commit -m "feat(convex): add matching queries and upsertMatch mutation"
```

---

### Task 4: Update convex/profiles.ts — add embedAndMatch pipeline

**Files:**
- Modify: `convex/profiles.ts`

- [ ] Replace `convex/profiles.ts` entirely with:

```typescript
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

    const profile: Awaited<ReturnType<typeof ctx.runQuery>> = await ctx.runQuery(
      internal.profiles.getById,
      { profileId: args.profileId },
    );
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
```

- [ ] Confirm `bunx convex dev` still shows no type errors.

- [ ] Commit:
```bash
git add convex/profiles.ts
git commit -m "feat(convex): add embedAndMatch action, wire create mutation to scheduler"
```

---

### Task 5: Add ZEROENTROPY_API_KEY to env

**Files:**
- Modify: `.env`
- Convex environment variables (via CLI)

- [ ] Add to `.env`:
```
ZEROENTROPY_API_KEY=<your key from zeroentropy.dev>
NEXT_PUBLIC_CONVEX_URL=<your convex deployment URL>
```

- [ ] Push the key to Convex so actions can read it:
```bash
bunx convex env set ZEROENTROPY_API_KEY <your key>
```

- [ ] Verify the key is set:
```bash
bunx convex env list
```
Expected: `ZEROENTROPY_API_KEY` appears in the list.

- [ ] Commit (`.env` is gitignored — only commit `.env.example` if it exists):
```bash
git add .env.example 2>/dev/null; git commit -m "chore: document ZEROENTROPY_API_KEY env var" || true
```

---

### Task 6: Update VoiceTranscript to submit profile via Convex

**Files:**
- Modify: `src/app/p/[slug]/voice-transcript.tsx`

The component needs to:
1. Accumulate a transcript from `onMessage` callbacks (user turns only)
2. After the conversation ends, show a submit button
3. Call `api.profiles.create` with the collected data
4. Redirect to `/p/[slug]/explore` on success

- [ ] Replace `src/app/p/[slug]/voice-transcript.tsx` entirely with:

```tsx
"use client";

import { useCallback, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useRouter } from "next/navigation";
import { Id } from "../../../../convex/_generated/dataModel";

const AGENT_ID = "agent_3601krs5kq8mfnz9s57xcm9vd1yy";

type Props = {
  slug: string;
  sessionId: Id<"sessions">;
};

function VoiceAgentInner({ slug, sessionId }: Props) {
  const router = useRouter();
  const createProfile = useMutation(api.profiles.create);

  const [transcriptLines, setTranscriptLines] = useState<string[]>([]);
  const [submitState, setSubmitState] = useState<
    "idle" | "submitting" | "done" | "error"
  >("idle");

  const conversation = useConversation({
    onMessage: ({ message, source }) => {
      if (source === "user" && message?.trim()) {
        setTranscriptLines((prev) => [...prev, message.trim()]);
      }
    },
    onError: (error) => {
      console.error("ElevenLabs error:", error);
    },
  });

  const isConnected = conversation.status === "connected";
  const isConnecting = conversation.status === "connecting";
  const hasEnded =
    conversation.status === "disconnected" && transcriptLines.length > 0;

  const toggle = useCallback(() => {
    if (isConnected) {
      conversation.endSession();
    } else {
      conversation.startSession({
        agentId: AGENT_ID,
        connectionType: "websocket",
      });
    }
  }, [isConnected, conversation]);

  async function handleSubmit() {
    const nameInput = document.getElementById("speakerName") as HTMLInputElement | null;
    const displayName = nameInput?.value.trim() ?? "";
    if (!displayName) {
      alert("Please enter your name before submitting.");
      return;
    }

    setSubmitState("submitting");
    try {
      const rawTranscript = transcriptLines.join("\n");
      const profileId = await createProfile({
        sessionId,
        displayName,
        rawTranscript,
      });
      setSubmitState("done");
      router.push(`/p/${slug}/explore?profileId=${profileId}`);
    } catch (err) {
      console.error("Profile creation failed:", err);
      setSubmitState("error");
    }
  }

  const state = isConnected ? "listening" : "idle";

  const hint = isConnecting
    ? "Connecting..."
    : isConnected
      ? conversation.isSpeaking
        ? "Agent speaking..."
        : "Listening..."
      : hasEnded
        ? "Conversation ended — submit your profile below"
        : "Tap to start";

  return (
    <div className="mic-stage" data-state={state}>
      <div className="voice-panel">
        <div className="speaker-field">
          <input
            id="speakerName"
            name="speakerName"
            placeholder="What is your full name?"
            type="text"
            aria-label="Your full name"
          />
        </div>

        <div className="mic-orb">
          <div className="mic-rings" aria-hidden="true">
            <div className="mic-ring mic-ring-1" />
            <div className="mic-ring mic-ring-2" />
            <div className="mic-ring mic-ring-3" />
          </div>

          <button
            aria-label={isConnected ? "End conversation" : "Start conversation"}
            className="mic-btn"
            disabled={isConnecting}
            onClick={toggle}
            type="button"
          >
            <svg
              className="mic-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 10a7 7 0 0 0 14 0" />
              <line x1="12" y1="17" x2="12" y2="22" />
              <line x1="8" y1="22" x2="16" y2="22" />
            </svg>
          </button>
        </div>
      </div>

      <p className="mic-hint">{hint}</p>

      {hasEnded && (
        <button
          className="primary-button"
          disabled={submitState === "submitting" || submitState === "done"}
          onClick={handleSubmit}
          type="button"
        >
          {submitState === "submitting"
            ? "Saving profile..."
            : submitState === "error"
              ? "Error — try again"
              : "Submit my profile"}
        </button>
      )}
    </div>
  );
}

export function VoiceTranscript({ slug, sessionId }: Props) {
  return (
    <ConversationProvider>
      <VoiceAgentInner slug={slug} sessionId={sessionId} />
    </ConversationProvider>
  );
}
```

- [ ] Update `src/app/p/[slug]/page.tsx` to pass `sessionId` to `VoiceTranscript`. Replace the file:

```tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useParams } from "next/navigation";
import { VoiceTranscript } from "./voice-transcript";

export default function PartyPage() {
  const { slug } = useParams<{ slug: string }>();
  const session = useQuery(api.sessions.getBySlug, { slug });

  if (session === undefined) {
    return (
      <main className="party-frame">
        <p className="mic-hint">Loading...</p>
      </main>
    );
  }

  if (session === null) {
    return (
      <main className="party-frame">
        <p className="mic-error">Session not found.</p>
      </main>
    );
  }

  return (
    <main className="party-frame">
      <p className="party-name">{session.partyName}</p>
      <VoiceTranscript slug={slug} sessionId={session._id} />
    </main>
  );
}
```

- [ ] Run `bunx next dev` and visit `/p/<any-slug>` (create a session first from `/`). Verify the voice panel renders, the conversation can start and stop, and the "Submit my profile" button appears after ending.

- [ ] Commit:
```bash
git add "src/app/p/[slug]/voice-transcript.tsx" "src/app/p/[slug]/page.tsx"
git commit -m "feat: wire VoiceTranscript to submit profile via Convex on conversation end"
```

---

### Task 7: Create explore page — live matches view

**Files:**
- Create: `src/app/p/[slug]/explore/page.tsx`

- [ ] Create the directory:
```bash
mkdir -p "src/app/p/[slug]/explore"
```

- [ ] Create `src/app/p/[slug]/explore/page.tsx`:

```tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useParams, useSearchParams } from "next/navigation";
import { Id } from "../../../../../convex/_generated/dataModel";

export default function ExplorePage() {
  const { slug } = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const profileId = searchParams.get("profileId") as Id<"profiles"> | null;

  const matches = useQuery(
    api.matching.getMatchesForProfile,
    profileId ? { profileId } : "skip",
  );

  if (!profileId) {
    return (
      <main className="page-frame">
        <p className="mic-error">No profile ID. Go back and submit your intro.</p>
      </main>
    );
  }

  if (matches === undefined) {
    return (
      <main className="page-frame">
        <p className="mic-hint">Finding your matches...</p>
      </main>
    );
  }

  if (matches.length === 0) {
    return (
      <main className="page-frame">
        <p className="mic-hint">
          You&apos;re the first one here — share the link so others can join!
        </p>
      </main>
    );
  }

  return (
    <main className="page-frame">
      <h1 className="display-title" style={{ fontSize: "1.5rem" }}>
        Your matches
      </h1>
      <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: "1rem" }}>
        {matches.map((match) => (
          <li key={match._id} className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <strong>{match.matchedProfile?.displayName ?? "Unknown"}</strong>
              <span style={{ opacity: 0.6, fontSize: "0.85rem" }}>
                {Math.round(match.score * 100)}% match
              </span>
            </div>
            {match.matchedProfile?.bio && (
              <p style={{ margin: "0.4rem 0 0", opacity: 0.8, fontSize: "0.9rem" }}>
                {match.matchedProfile.bio}
              </p>
            )}
            {match.matchedProfile?.interests && match.matchedProfile.interests.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginTop: "0.5rem" }}>
                {match.matchedProfile.interests.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      background: "rgba(255,255,255,0.1)",
                      borderRadius: "999px",
                      padding: "0.15rem 0.6rem",
                      fontSize: "0.78rem",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] Commit:
```bash
git add "src/app/p/[slug]/explore/page.tsx" "src/app/p/[slug]/voice-transcript.tsx"
git commit -m "feat: add live explore/matches page, pass profileId in redirect"
```

---

### Task 8: Delete dead API routes and lib files

**Files:**
- Delete: `src/app/api/sessions/route.ts`
- Delete: `src/app/api/sessions/[slug]/route.ts`
- Delete: `src/app/api/sessions/[slug]/profiles/route.ts`
- Delete: `src/lib/sessions.ts` (in-memory Map — fully replaced by Convex)
- Delete: `src/lib/gbrain.ts` (replaced by Zeroentropy)

- [ ] Delete the files:
```bash
rm src/app/api/sessions/route.ts
rm "src/app/api/sessions/[slug]/route.ts"
rm "src/app/api/sessions/[slug]/profiles/route.ts"
rmdir "src/app/api/sessions/[slug]" src/app/api/sessions src/app/api 2>/dev/null || true
rm src/lib/sessions.ts
rm src/lib/gbrain.ts
```

- [ ] Run `bunx next build` and fix any import errors that surface. Expected: the build should pass with no references to the deleted files.

- [ ] Commit:
```bash
git add -A
git commit -m "chore: delete Next.js API routes and in-memory session/gbrain libs"
```

---

### Task 9: End-to-end smoke test

- [ ] Start dev server: `bunx next dev`

- [ ] Visit `http://localhost:3000`, create a session (e.g. "Test Party"), copy the link.

- [ ] Open the link (`/p/<slug>`), enter a name, start + end the voice conversation, click "Submit my profile". Confirm you land on `/p/<slug>/explore?profileId=<id>`.

- [ ] Open a second browser tab, visit the same session link, enter a different name, submit a profile with a different intro.

- [ ] In the first tab, confirm the matches list updates live (no reload needed) and the second person appears.

- [ ] Check the Convex dashboard (https://dashboard.convex.dev) → your deployment → Data → `matches` table. Confirm rows exist with scores.

- [ ] Commit a final checkpoint:
```bash
git add -A
git commit -m "chore: verify e2e smoke test passes, Convex+Zeroentropy pipeline live"
```
