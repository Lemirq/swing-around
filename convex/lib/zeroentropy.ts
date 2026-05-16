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
  // Adapt this line if the actual response shape differs
  const raw: Array<{ document_id: string; score: number }> =
    data.results ?? data;
  return raw.map((r) => {
    if (!r || typeof r.document_id !== "string" || typeof r.score !== "number") {
      throw new Error(`Unexpected Zeroentropy result shape: ${JSON.stringify(r)}`);
    }
    return { documentId: r.document_id, score: r.score };
  });
}
