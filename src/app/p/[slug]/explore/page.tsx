"use client";

import { Suspense, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useSearchParams, useParams } from "next/navigation";
import { Id } from "../../../../../convex/_generated/dataModel";

function ShareButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/p/${slug}` : `/p/${slug}`;

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={copy}
      style={{
        background: "var(--pine-green, #2d6a4f)",
        color: "#fff",
        border: "none",
        borderRadius: "0.5rem",
        padding: "0.55rem 1.2rem",
        fontSize: "0.9rem",
        cursor: "pointer",
        fontWeight: 600,
      }}
    >
      {copied ? "Link copied!" : "Share the link →"}
    </button>
  );
}

function InterestTags({ interests }: { interests: string[] }) {
  if (!interests.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginTop: "0.5rem" }}>
      {interests.map((tag) => (
        <span
          key={tag}
          style={{
            background: "rgba(255,255,255,0.12)",
            borderRadius: "999px",
            padding: "0.15rem 0.6rem",
            fontSize: "0.78rem",
          }}
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

function ExploreContent({ slug }: { slug: string }) {
  const searchParams = useSearchParams();
  const profileId = searchParams.get("profileId") as Id<"profiles"> | null;

  const profile = useQuery(
    api.profiles.getProfile,
    profileId ? { profileId } : "skip",
  );
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

  if (profile === undefined || matches === undefined) {
    return (
      <main className="page-frame">
        <p className="mic-hint">Finding your matches...</p>
      </main>
    );
  }

  if (profile?.embeddingStatus === "pending") {
    return (
      <main className="page-frame">
        <p className="mic-hint" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            style={{
              display: "inline-block",
              width: "0.7rem",
              height: "0.7rem",
              borderRadius: "50%",
              background: "currentColor",
              animation: "pulse 1.2s ease-in-out infinite",
              opacity: 0.7,
            }}
          />
          Matching you now…
        </p>
        <style>{`@keyframes pulse { 0%,100%{opacity:.3} 50%{opacity:1} }`}</style>
      </main>
    );
  }

  if (matches.length === 0) {
    return (
      <main className="page-frame" style={{ display: "flex", flexDirection: "column", gap: "1.2rem", alignItems: "flex-start" }}>
        <p className="mic-hint">
          You&apos;re the first one here — share the link so others can join!
        </p>
        <ShareButton slug={slug} />
      </main>
    );
  }

  const [top, ...rest] = matches;
  const topProfile = top.matchedProfile!;

  return (
    <main className="page-frame" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <h1 className="display-title" style={{ fontSize: "1.3rem", marginBottom: 0 }}>
        Your top match
      </h1>

      {/* Hero card */}
      <div
        className="panel"
        style={{
          padding: "1.4rem",
          border: "2px solid var(--pine-green, #2d6a4f)",
          borderRadius: "1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <span style={{ fontSize: "1.4rem", fontWeight: 700 }}>{topProfile.displayName}</span>
          <span
            style={{
              background: "var(--pine-green, #2d6a4f)",
              color: "#fff",
              borderRadius: "999px",
              padding: "0.2rem 0.7rem",
              fontSize: "0.85rem",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            {Math.round(top.score * 100)}% match
          </span>
        </div>
        {topProfile.bio && (
          <p style={{ margin: 0, opacity: 0.85, fontSize: "0.95rem", lineHeight: 1.5 }}>
            {topProfile.bio}
          </p>
        )}
        <InterestTags interests={topProfile.interests ?? []} />
      </div>

      {/* Secondary matches */}
      {rest.length > 0 && (
        <>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: 0, opacity: 0.7 }}>
            Other people you&apos;d vibe with
          </h2>
          <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {rest.map((match) => {
              const p = match.matchedProfile!;
              return (
                <li key={match._id} className="panel" style={{ padding: "1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <strong>{p.displayName}</strong>
                    <span style={{ opacity: 0.6, fontSize: "0.82rem" }}>
                      {Math.round(match.score * 100)}%
                    </span>
                  </div>
                  {p.bio && (
                    <p style={{ margin: "0.3rem 0 0", opacity: 0.75, fontSize: "0.87rem" }}>
                      {p.bio}
                    </p>
                  )}
                  <InterestTags interests={p.interests ?? []} />
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* Share CTA */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", paddingTop: "0.5rem" }}>
        <span style={{ fontSize: "0.85rem", opacity: 0.65 }}>Know someone else who should join?</span>
        <ShareButton slug={slug} />
      </div>
    </main>
  );
}

export default function ExplorePage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  return (
    <Suspense
      fallback={
        <main className="page-frame">
          <p className="mic-hint">Loading...</p>
        </main>
      }
    >
      <ExploreContent slug={slug} />
    </Suspense>
  );
}
