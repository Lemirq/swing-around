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
