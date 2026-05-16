# Convex + Zeroentropy Backend Design

**Date:** 2026-05-16  
**Status:** Approved

## Summary

Replace the in-memory `Map` session store and the planned Neon Postgres backend with Convex as the primary database and Zeroentropy for embedding generation and vector similarity search. Next.js becomes a pure frontend — no API routes. All backend logic lives in `convex/` functions.

---

## Architecture

Three layers:

1. **Next.js** — pure frontend. Pages use `useQuery`/`useMutation` from `convex/react`. No API routes.
2. **Convex** — schema, queries, mutations, and actions. Actions call out to Zeroentropy for embedding and similarity search.
3. **Zeroentropy** — vector index. Stores one embedding per profile, keyed by Convex profile `_id`, with `sessionId` as metadata for session-scoped filtering.

Existing `/api/sessions/` Next.js routes are deleted. `ConvexProvider` wraps the app in `layout.tsx`.

---

## Data Model

### `sessions` table (extend existing)
| Field | Type | Notes |
|-------|------|-------|
| slug | string | unique, indexed |
| partyName | string | |
| hostName | string | optional |
| location | string | optional |
| startsAt | number | optional, epoch ms |
| note | string | optional |

Index: `by_slug`

### `profiles` table (extend existing)
| Field | Type | Notes |
|-------|------|-------|
| sessionId | Id<"sessions"> | indexed |
| displayName | string | |
| bio | string | optional |
| interests | string[] | optional |
| xHandle | string | optional |
| linkedinUrl | string | optional |
| rawTranscript | string | optional |
| metadata | any | optional, social enrichment data |
| embeddingStatus | "pending" \| "done" \| "failed" | tracks async embed job |

Index: `by_sessionId`

### `matches` table (new)
| Field | Type | Notes |
|-------|------|-------|
| profileId | Id<"profiles"> | the profile whose matches these are |
| sessionId | Id<"sessions"> | for session-scoped graph queries |
| matchedProfileId | Id<"profiles"> | the matched person |
| score | number | cosine similarity 0–1 from Zeroentropy |
| reasons | string[] | AI-generated 1-line explanation of why they match |

Indexes: `by_profileId`, `by_sessionId`

---

## Convex Functions

### `convex/sessions.ts`
- `create` (mutation) — inserts session, returns `{ id, slug }`. No change from existing.
- `getBySlug` (query) — looks up by slug index. No change from existing.

### `convex/profiles.ts`
- `create` (mutation) — inserts profile with `embeddingStatus: "pending"`, then schedules `internal.profiles.embedAndMatch` via `ctx.scheduler.runAfter(0, ...)`. Returns profile `_id`.
- `listBySession` (query) — returns profiles by sessionId. No change from existing.
- `embedAndMatch` (internal action, `"use node"`) — builds a text blob from profile fields, calls Zeroentropy API to embed and store, queries Zeroentropy for top-K similar profiles filtered by `sessionId`, writes results to `matches` table, patches `embeddingStatus` to `"done"` (or `"failed"` on error).

### `convex/matching.ts` (new)
- `getMatchesForProfile` (query) — reads `matches` table filtered by `profileId`, joins matched profile documents, returns ranked list.
- `getMatchesForSession` (query) — all match edges for a session, used by the graph view.

---

## Zeroentropy Integration

- **Embed:** `POST /api/documents/add` with `{ collection, document_id, content, metadata: { sessionId } }`
- **Search:** `POST /api/documents/query` with `{ collection, query_content, top_k, filter: { sessionId } }`
- Collection name: `profiles` (one collection for all sessions, filtered by metadata)
- Document ID: Convex profile `_id` (stable, unique)
- Content: concatenated string of `displayName + bio + interests + rawTranscript`
- Auth: `ZEROENTROPY_API_KEY` env var

---

## Frontend Changes

| File | Change |
|------|--------|
| `src/app/layout.tsx` | Wrap with `ConvexProvider` using `NEXT_PUBLIC_CONVEX_URL` |
| `src/app/api/sessions/` | Delete entirely |
| `src/app/page.tsx` + session form | Replace `fetch('/api/sessions')` with `useMutation(api.sessions.create)` |
| `src/app/p/[slug]/page.tsx` | Use `useQuery(api.sessions.getBySlug, { slug })` |
| `src/app/p/[slug]/join/page.tsx` | New — onboarding form, calls `useMutation(api.profiles.create)` |
| `src/app/p/[slug]/explore/page.tsx` | New — calls `useQuery(api.matching.getMatchesForProfile, ...)`, live updates |

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_CONVEX_URL` | Convex deployment URL (client-side) |
| `CONVEX_DEPLOY_KEY` | Convex deploy key (CI/server) |
| `ZEROENTROPY_API_KEY` | Zeroentropy API auth |

---

## Embed + Match Flow

```
User submits profile
  → profiles.create mutation (sync, instant)
      → inserts profile with embeddingStatus: "pending"
      → schedules embedAndMatch action (runAfter 0ms)
  → action runs async
      → builds text content from profile fields
      → POST to Zeroentropy /api/documents/add
      → POST to Zeroentropy /api/documents/query (top 20, filtered by sessionId)
      → for each match: insert into matches table with score + reasons
      → patch profile embeddingStatus → "done"
  → all clients subscribed via useQuery(getMatchesForProfile) update live
```

---

## What Is Not In Scope

- Auth (no login system)
- Social enrichment via Composio (Phase 3 per PLAN.md, separate spec)
- Second-degree connection graph (Phase 6 per PLAN.md, separate spec)
- Session host dashboard
- AI-generated match reasons (initial implementation uses Zeroentropy score only; reasons field left empty for now)
