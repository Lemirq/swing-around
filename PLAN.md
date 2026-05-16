# Swing Around — Full Product Plan

## Context

The transcript describes a people-matching platform for hackathons/events. Users arrive via a shared link (e.g. from an X post), provide input about themselves, get profiled via embeddings, and are matched with similar people. The current codebase is a basic "party session" scaffold — create a party, get a shareable link, see party details. **None of the core matching/profiling/graph features exist yet.**

### What's Already Built
- Next.js 16.2.6 + React 19 + Tailwind 4 app
- Landing page (`/`), create session form (`/create`), party detail page (`/p/[slug]`)
- In-memory session storage (Map) — no database
- API routes: `POST /api/sessions`, `GET /api/sessions/[slug]`
- Basic styling with CSS variables, glassmorphism cards

### What Needs to Be Built (from transcript)
The entire core product. The existing party scaffolding can be repurposed as the "event/session" container, but everything else is new.

---

## Architecture Overview

```
User arrives at /p/[slug] → Onboarding (text/voice input + social profiles)
    → Profile built via AI (embeddings generated)
    → Stored in DB with vector embeddings
    → Matching engine finds similar users in same session
    → UI: Split view — graph visualization + ranked match list
    → Can explore 2nd-degree connections, get warm intro paths
```

---

## Phase 1: Database & Data Model

**Goal:** Replace in-memory Map with persistent storage + vector support.

### Files to modify/create:
- `src/lib/db.ts` — Database client (Neon Postgres via Vercel Marketplace)
- `src/lib/sessions.ts` — Migrate from Map to DB
- Schema migration SQL

### Schema:
```sql
-- Sessions (events/hackathons)
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  host_name TEXT NOT NULL,
  location TEXT,
  starts_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Users/Profiles within a session
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  bio TEXT,                        -- raw text input from user
  interests TEXT[],                -- extracted interests
  x_handle TEXT,                   -- Twitter/X username
  linkedin_url TEXT,               -- LinkedIn profile URL
  raw_input TEXT,                  -- original voice transcript or text
  embedding vector(1536),          -- profile embedding for matching
  metadata JSONB DEFAULT '{}',     -- flexible store for scraped social data
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Matches (precomputed or cached)
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  profile_a UUID REFERENCES profiles(id) ON DELETE CASCADE,
  profile_b UUID REFERENCES profiles(id) ON DELETE CASCADE,
  similarity FLOAT NOT NULL,       -- cosine similarity score
  match_reasons TEXT[],            -- why they matched (shared interests, etc.)
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(profile_a, profile_b)
);

-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;
CREATE INDEX ON profiles USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

### Tasks:
1. Provision Neon Postgres via `vercel integration add neon`
2. Enable pgvector extension
3. Create migration runner or use raw SQL via Neon MCP
4. Rewrite `src/lib/sessions.ts` to use Neon client
5. Update existing API routes to use DB

---

## Phase 2: User Onboarding Flow

**Goal:** When someone visits `/p/[slug]`, they can join the session by providing info about themselves.

### New pages/components:
- `src/app/p/[slug]/join/page.tsx` — Onboarding page
- `src/components/onboarding-form.tsx` — Multi-step form (client component)
- `src/components/voice-input.tsx` — Voice recording → text (Web Speech API or Whisper)

### Onboarding steps:
1. **Name + quick bio** (text input)
2. **Voice or text pitch** — "Tell us about yourself, what you're building, what you're interested in" (optional voice with transcription, or just text)
3. **Social profiles** — X handle, LinkedIn URL (optional)
4. **Submit** → Profile gets created, embeddings generated, redirected to matches view

### API routes:
- `POST /api/sessions/[slug]/profiles` — Create a profile in a session
- `GET /api/sessions/[slug]/profiles` — List all profiles in a session
- `GET /api/sessions/[slug]/profiles/[id]` — Get a single profile

### Voice transcription approach:
- Use browser's Web Speech API (SpeechRecognition) for real-time transcription — zero cost, no API key needed
- Fallback: simple text area

---

## Phase 3: Profile Enrichment via Social Data

**Goal:** Scrape/fetch social profiles to build a richer user profile.

### Integrations:
- **Composio** — Used to pull structured data from X and LinkedIn profiles
  - Need: `COMPOSIO_API_KEY` env var
  - Fetch: recent posts/tweets, bio, interests, connections
- **Happenstance API** — If available, additional professional/interest data
  - Need: `HAPPENSTANCE_API_KEY` env var

### Files:
- `src/lib/composio.ts` — Composio client wrapper
- `src/lib/enrichment.ts` — Orchestrates social data fetching, merges into profile metadata

### Flow:
1. User submits X handle and/or LinkedIn URL
2. Background job (via `waitUntil`) fetches social data
3. Social data merged into `profiles.metadata` JSONB
4. Profile re-embedded with enriched data

---

## Phase 4: Embedding & Matching Engine

**Goal:** Generate embeddings for each user profile and compute matches.

### Approach:
- Use AI SDK with AI Gateway for embeddings (`text-embedding-3-small` or similar via gateway)
- Build embedding from: bio + voice transcript + interests + social data summary
- Store as `vector(1536)` in pgvector
- Match via cosine similarity query against other profiles in same session

### Files:
- `src/lib/embeddings.ts` — Generate embeddings via AI SDK
- `src/lib/matching.ts` — Query similar profiles, compute match reasons

### Matching logic:
```
1. On profile creation → generate embedding
2. Query: SELECT * FROM profiles WHERE session_id = ? ORDER BY embedding <=> $input_embedding LIMIT 20
3. For top matches, compute "match reasons" by comparing interests arrays, shared topics from social data
4. Store in matches table for fast retrieval
```

### Match reasons extraction:
- Compare `interests[]` arrays for overlap
- Use LLM (via AI SDK + AI Gateway) to generate a 1-sentence explanation of why two people should connect
- Example: "You're both building AI developer tools and interested in graph databases"

### API routes:
- `GET /api/sessions/[slug]/profiles/[id]/matches` — Get matches for a profile
- Recompute matches when new profiles join (via `waitUntil`)

---

## Phase 5: Graph + List UI (Main Experience)

**Goal:** Split-view UI — interactive graph on one half, ranked match list on the other. Similar to Epicurus.

### Pages:
- `src/app/p/[slug]/explore/page.tsx` — Main explore/matches view (after onboarding)

### Components:
- `src/components/match-list.tsx` — Ranked list of matches with similarity %, reasons, connect buttons
- `src/components/connection-graph.tsx` — Force-directed graph visualization
- `src/components/profile-card.tsx` — Expandable card for a matched user
- `src/components/graph-controls.tsx` — Search, filter, zoom controls

### Graph visualization:
- Use **D3.js force-directed graph** or **@react-force-graph** (react-force-graph-2d)
- Nodes = users in the session
- Edges = match strength (thicker = higher similarity)
- Clicking a node highlights their connections, greys out everything else
- Search/filter to find specific people or interests

### List view:
- Sorted by match similarity (highest first)
- Each card shows: name, bio snippet, match %, top match reasons
- "Connect" button → links to their X/LinkedIn profiles
- Filter by interest tags

### Layout:
- Desktop: 50/50 split (graph left, list right) — like Epicurus
- Mobile: Tabs (graph tab / list tab)
- Graph greys out non-connected nodes when you select someone

---

## Phase 6: Second-Degree Connections & Warm Intros

**Goal:** Show not just direct matches but 2nd-degree connections — "connect with X because they know Y who knows Z."

### Logic:
- From a user's top matches, look at *their* top matches
- If User A → User B (high match) and User B → User C (high match), surface C to A as a 2nd-degree connection
- Display path: "You → [Person B] → [Person C]"

### UI additions:
- Tab or toggle on match list: "Direct Matches" / "Extended Network"
- Graph shows 2nd-degree nodes in a lighter color
- "Get warm intro" CTA that explains the connection path

### Files:
- Extend `src/lib/matching.ts` with `getSecondDegreeMatches()`
- `src/components/network-path.tsx` — Shows the connection chain

---

## Phase 7: Polish & Launch Features

### Landing page pivot:
- Update `/` to explain the product: "Find your people at any event"
- Show how it works: 1) Host creates a session 2) Share the link 3) Everyone joins & gets matched

### Session host dashboard:
- `src/app/p/[slug]/dashboard/page.tsx` — Host can see all participants, engagement stats

### Marketing-ready features:
- Shareable match cards (OG image generation for "I matched with X at [event]")
- "Like this tweet to see who shares your interests" flow — link in X post goes to `/p/[slug]/join`

---

## Dependency Summary

### NPM packages to add:
- `@neondatabase/serverless` — Neon Postgres client
- `ai` + `@ai-sdk/openai` — AI SDK for embeddings + match reason generation
- `react-force-graph-2d` — Graph visualization (or `d3` directly)
- Composio SDK (TBD — check their npm package)

### Environment variables needed:
- `DATABASE_URL` / `POSTGRES_URL` — From Neon Marketplace integration
- `AI_GATEWAY_API_KEY` — For embeddings + LLM via Vercel AI Gateway
- `COMPOSIO_API_KEY` — For social profile enrichment
- `HAPPENSTANCE_API_KEY` — For additional profile data (if available)

### Key files to modify:
- `src/lib/sessions.ts` — Rewrite for DB
- `src/app/p/[slug]/page.tsx` — Becomes session landing → redirect to join or explore
- `src/app/page.tsx` — Update landing copy

### Key files to create:
- `src/lib/db.ts` — Database client
- `src/lib/embeddings.ts` — Embedding generation
- `src/lib/matching.ts` — Match computation
- `src/lib/composio.ts` — Social enrichment
- `src/lib/enrichment.ts` — Enrichment orchestration
- `src/app/p/[slug]/join/page.tsx` — Onboarding
- `src/app/p/[slug]/explore/page.tsx` — Main matches view
- `src/components/onboarding-form.tsx`
- `src/components/voice-input.tsx`
- `src/components/match-list.tsx`
- `src/components/connection-graph.tsx`
- `src/components/profile-card.tsx`

---

## Verification Plan

After each phase:
1. **Phase 1:** Run `SELECT * FROM sessions` / `profiles` via Neon MCP to verify schema. Hit existing API routes and confirm they read/write from DB.
2. **Phase 2:** Visit `/p/[slug]`, go through onboarding flow, verify profile appears in DB.
3. **Phase 3:** Submit a profile with an X handle, verify enrichment data lands in `metadata` JSONB.
4. **Phase 4:** Create 3+ profiles in a session, verify embeddings exist and `/matches` endpoint returns ranked results with reasons.
5. **Phase 5:** Open explore page, verify graph renders with nodes/edges, list shows ranked matches, clicking a node filters the graph.
6. **Phase 6:** With 5+ profiles, verify 2nd-degree connections appear and path is displayed.
7. **Phase 7:** Full end-to-end: create session → share link → 3 users join → all see matches → graph works → can click through to social profiles.

Run `npm run build` after each phase to catch type errors. Run `npm run dev` and manually test flows.
