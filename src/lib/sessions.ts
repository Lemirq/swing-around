export type PartySessionInput = {
  partyName: string;
};

export type PartySession = PartySessionInput & {
  slug: string;
  createdAt: string;
};

type SessionStore = Map<string, PartySession>;

const globalForSessions = globalThis as typeof globalThis & {
  partySessions?: SessionStore;
};

const sessions = globalForSessions.partySessions ?? new Map<string, PartySession>();

if (!globalForSessions.partySessions) {
  globalForSessions.partySessions = sessions;
}

export function createSession(input: PartySessionInput) {
  const slug = createUniqueSlug();
  const session: PartySession = {
    ...input,
    slug,
    createdAt: new Date().toISOString(),
  };

  sessions.set(slug, session);
  return session;
}

export function getSession(slug: string) {
  return sessions.get(slug);
}

export function validateSessionInput(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return { error: "Send party details as a JSON object." };
  }

  const data = payload as Partial<Record<keyof PartySessionInput, unknown>>;
  const partyName = clean(data.partyName);

  if (!partyName) {
    return {
      error: "Party name is required.",
    };
  }

  return {
    input: {
      partyName,
    },
  };
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function createUniqueSlug() {
  for (let attempts = 0; attempts < 8; attempts += 1) {
    const slug = `party-${crypto.randomUUID().slice(0, 8)}`;

    if (!sessions.has(slug)) {
      return slug;
    }
  }

  return `party-${Date.now().toString(36)}`;
}
