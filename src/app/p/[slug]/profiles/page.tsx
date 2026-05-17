"use client";

import { Suspense, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useSearchParams, useParams } from "next/navigation";
import { Id } from "../../../../../convex/_generated/dataModel";

/* ── ShareButton ───────────────────────────────────────── */

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
      {copied ? "Link copied!" : "Share the link"}
    </button>
  );
}

/* ── InterestTags ──────────────────────────────────────── */

function InterestTags({ interests }: { interests: string[] }) {
  if (!interests.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginTop: "0.5rem" }}>
      {interests.map((tag) => (
        <span
          key={tag}
          style={{
            background: "rgba(0,0,0,0.12)",
            borderRadius: "999px",
            padding: "0.18rem 0.65rem",
            fontSize: "0.76rem",
            color: "rgba(0,0,0,0.85)",
          }}
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

/* ── SocialLinks ───────────────────────────────────────── */

function SocialLinks({ profile }: { profile: { xHandle?: string; linkedinUrl?: string; githubHandle?: string; websiteUrl?: string } }) {
  const links: Array<{ href: string; label: string; icon: string }> = [];

  if (profile.xHandle) {
    const handle = profile.xHandle.replace(/^@/, "");
    links.push({ href: `https://x.com/${handle}`, label: "X", icon: "\u{1D54F}" });
  }
  if (profile.linkedinUrl) {
    links.push({ href: profile.linkedinUrl, label: "LinkedIn", icon: "in" });
  }
  if (profile.githubHandle) {
    links.push({ href: `https://github.com/${profile.githubHandle}`, label: "GitHub", icon: "GH" });
  }
  if (profile.websiteUrl) {
    links.push({ href: profile.websiteUrl, label: "Website", icon: "\uD83D\uDD17" });
  }

  if (!links.length) return null;

  return (
    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.3rem",
            background: "rgba(0,0,0,0.08)",
            border: "1px solid rgba(0,0,0,0.15)",
            borderRadius: "0.4rem",
            padding: "0.25rem 0.6rem",
            fontSize: "0.8rem",
            color: "inherit",
            textDecoration: "none",
            opacity: 0.85,
          }}
        >
          <span>{link.icon}</span>
          <span>{link.label}</span>
        </a>
      ))}
    </div>
  );
}

/* ── MatchReasons ──────────────────────────────────────── */

function MatchReasons({ reasons }: { reasons: string[] }) {
  if (!reasons.length) return null;
  return (
    <div style={{ marginTop: "0.5rem" }}>
      <span style={{ fontSize: "0.72rem", opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>
        Why you&apos;d vibe
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem", marginTop: "0.25rem" }}>
        {reasons.map((reason, i) => (
          <span key={i} style={{ fontSize: "0.82rem", opacity: 0.85 }}>
            &bull; {reason}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── ProfilesContent ───────────────────────────────────── */

function ProfilesContent({ slug }: { slug: string }) {
  const searchParams = useSearchParams();
  const profileId = searchParams.get("profileId") as Id<"profiles"> | null;
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const retriggerMatch = useMutation(api.profiles.retriggerMatch);

  const profile = useQuery(
    api.profiles.getProfile,
    profileId ? { profileId } : "skip",
  );
  const matches = useQuery(
    api.matching.getMatchesForProfile,
    profileId ? { profileId } : "skip",
  );

  async function handleRefresh() {
    if (!profileId || refreshing) return;
    setRefreshing(true);
    try {
      await retriggerMatch({ profileId });
    } catch (err) {
      console.error("Refresh failed:", err);
    }
    setTimeout(() => setRefreshing(false), 3000);
  }

  /* ── No profileId ── */
  if (!profileId) {
    return (
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "120px 24px", textAlign: "center" }}>
        <p style={{ color: "rgba(0,0,0,0.6)", fontSize: "0.95rem" }}>
          No profile ID found. Go back and submit your intro first.
        </p>
      </main>
    );
  }

  /* ── Loading state ── */
  if (profile === undefined || matches === undefined) {
    return (
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "120px 24px", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.6rem" }}>
          <span
            style={{
              display: "inline-block",
              width: "0.6rem",
              height: "0.6rem",
              borderRadius: "50%",
              background: "var(--pine-green, #2d6a4f)",
              animation: "pulse 1.2s ease-in-out infinite",
            }}
          />
          <span style={{ color: "rgba(0,0,0,0.7)", fontSize: "0.95rem" }}>Loading your matches...</span>
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:.3} 50%{opacity:1} }`}</style>
      </main>
    );
  }

  /* ── Pending embedding ── */
  if (profile?.embeddingStatus === "pending") {
    return (
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "120px 24px", textAlign: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              border: "3px solid rgba(0,0,0,0.15)",
              borderTopColor: "var(--pine-green, #2d6a4f)",
              animation: "spin 1s linear infinite",
            }}
          />
          <p style={{ color: "rgba(0,0,0,0.8)", fontSize: "1.05rem", fontWeight: 600, margin: 0 }}>
            Finding your matches...
          </p>
          <p style={{ color: "rgba(0,0,0,0.5)", fontSize: "0.85rem", margin: 0, maxWidth: 320 }}>
            We&apos;re analyzing your profile to find the best connections. This usually takes a few seconds.
          </p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </main>
    );
  }

  /* ── No matches ── */
  if (matches.length === 0) {
    return (
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "120px 24px", textAlign: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
          <span style={{ fontSize: "2.5rem" }}>&#x1F331;</span>
          <p style={{ color: "rgba(0,0,0,0.85)", fontSize: "1.1rem", fontWeight: 600, margin: 0 }}>
            You&apos;re the first one here — share the link!
          </p>
          <p style={{ color: "rgba(0,0,0,0.5)", fontSize: "0.88rem", margin: 0, maxWidth: 360 }}>
            Once others join, we&apos;ll match you with people you&apos;d vibe with.
          </p>
          <div style={{ marginTop: "0.5rem" }}>
            <ShareButton slug={slug} />
          </div>
        </div>
      </main>
    );
  }

  /* ── Has matches: two-column layout ── */
  return (
    <main
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 380px",
        minHeight: "100vh",
        maxWidth: 1200,
        margin: "0 auto",
        gap: 0,
      }}
    >
      {/* ── Left: main content ── */}
      <div
        style={{
          padding: "3rem 2.5rem 2rem 2rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "1.8rem",
              fontWeight: 800,
              margin: 0,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
            }}
          >
            Your matches
          </h1>
          {profile && (
            <p style={{ color: "rgba(0,0,0,0.6)", fontSize: "0.95rem", margin: "0.5rem 0 0" }}>
              Hey {profile.displayName.split(" ")[0]} — we found{" "}
              <strong style={{ color: "var(--pine-green, #2d6a4f)" }}>{matches.length}</strong>{" "}
              {matches.length === 1 ? "person" : "people"} you&apos;d vibe with
            </p>
          )}
        </div>

        {/* Selected match detail or own profile */}
        {(() => {
          if (selectedMatchId) {
            const selected = matches.find((m) => m._id === selectedMatchId);
            if (!selected || !selected.matchedProfile) return null;
            const p = selected.matchedProfile;
            return (
              <div
                style={{
                  background: "rgba(0,0,0,0.06)",
                  borderRadius: "1rem",
                  padding: "1.8rem",
                  border: "1px solid rgba(0,0,0,0.1)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <h2 style={{ fontSize: "1.3rem", fontWeight: 700, margin: 0 }}>{p.displayName}</h2>
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
                    {Math.round(selected.score * 100)}% match
                  </span>
                </div>
                {(p.extractedBio || p.bio) && (
                  <p style={{ margin: 0, opacity: 0.85, fontSize: "0.95rem", lineHeight: 1.55 }}>
                    {p.extractedBio || p.bio}
                  </p>
                )}
                <InterestTags interests={p.extractedInterests ?? p.interests ?? []} />
                <MatchReasons reasons={selected.reasons} />
                <SocialLinks profile={p} />
              </div>
            );
          }

          // Default: show own profile
          if (!profile) return null;
          return (
            <div
              style={{
                background: "rgba(0,0,0,0.06)",
                borderRadius: "1rem",
                padding: "1.8rem",
                border: "1px solid rgba(0,0,0,0.1)",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <span style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.5, fontWeight: 600 }}>Your profile</span>
                  <h2 style={{ fontSize: "1.3rem", fontWeight: 700, margin: "0.25rem 0 0" }}>{profile.displayName}</h2>
                </div>
              </div>
              {(profile.extractedBio || profile.bio) && (
                <p style={{ margin: 0, opacity: 0.85, fontSize: "0.95rem", lineHeight: 1.55 }}>
                  {profile.extractedBio || profile.bio}
                </p>
              )}
              <InterestTags interests={profile.extractedInterests ?? profile.interests ?? []} />
              <SocialLinks profile={profile} />
            </div>
          );
        })()}

        {/* Refresh matches button */}
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            background: "rgba(0,0,0,0.08)",
            border: "1px solid rgba(0,0,0,0.15)",
            borderRadius: "0.5rem",
            padding: "0.5rem 1rem",
            fontSize: "0.85rem",
            color: "inherit",
            cursor: refreshing ? "default" : "pointer",
            opacity: refreshing ? 0.5 : 0.7,
            alignSelf: "flex-start",
          }}
        >
          {refreshing ? "Refreshing..." : "Refresh matches"}
        </button>

        {/* Share CTA */}
        <div
          style={{
            marginTop: "auto",
            paddingTop: "2rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          <span style={{ color: "rgba(0,0,0,0.45)", fontSize: "0.85rem" }}>
            Know someone who should join?
          </span>
          <ShareButton slug={slug} />
        </div>
      </div>

      {/* ── Right: matches sidebar ── */}
      <aside
        style={{
          borderLeft: "1px solid rgba(0,0,0,0.08)",
          padding: "2rem 1.25rem",
          overflowY: "auto",
          maxHeight: "100vh",
          position: "sticky",
          top: 0,
        }}
      >
        <h2
          style={{
            fontSize: "0.78rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "rgba(0,0,0,0.5)",
            margin: "0 0 1rem 0.25rem",
          }}
        >
          Matches ({matches.length})
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {matches.map((match) => {
            const p = match.matchedProfile;
            if (!p) return null;
            const isSelected = selectedMatchId === match._id;
            return (
              <button
                key={match._id}
                onClick={() => setSelectedMatchId(isSelected ? null : match._id)}
                style={{
                  background: isSelected
                    ? "rgba(45,106,79,0.2)"
                    : "rgba(0,0,0,0.05)",
                  border: isSelected
                    ? "1px solid var(--pine-green, #2d6a4f)"
                    : "1px solid rgba(0,0,0,0.08)",
                  borderRadius: "0.75rem",
                  padding: "0.9rem 1rem",
                  cursor: "pointer",
                  textAlign: "left",
                  color: "inherit",
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.35rem",
                  transition: "background 0.15s, border-color 0.15s",
                }}
              >
                {/* Name + score */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                  <span style={{ fontSize: "0.92rem", fontWeight: 700 }}>{p.displayName}</span>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: "var(--pine-green, #2d6a4f)",
                      background: "rgba(45,106,79,0.15)",
                      borderRadius: "999px",
                      padding: "0.1rem 0.5rem",
                    }}
                  >
                    {Math.round(match.score * 100)}%
                  </span>
                </div>

                {/* Bio preview */}
                {(p.extractedBio || p.bio) && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.8rem",
                      opacity: 0.65,
                      lineHeight: 1.4,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {p.extractedBio || p.bio}
                  </p>
                )}

                {/* Tags (first 3) */}
                {(() => {
                  const tags = p.extractedInterests ?? p.interests ?? [];
                  if (!tags.length) return null;
                  return (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem", marginTop: "0.15rem" }}>
                      {tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          style={{
                            background: "rgba(0,0,0,0.1)",
                            borderRadius: "999px",
                            padding: "0.1rem 0.5rem",
                            fontSize: "0.68rem",
                            color: "rgba(0,0,0,0.7)",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                      {tags.length > 3 && (
                        <span style={{ fontSize: "0.68rem", opacity: 0.4 }}>+{tags.length - 3}</span>
                      )}
                    </div>
                  );
                })()}

                {/* Reasons preview (first reason) */}
                {match.reasons.length > 0 && (
                  <span style={{ fontSize: "0.73rem", opacity: 0.5, fontStyle: "italic", marginTop: "0.1rem" }}>
                    &ldquo;{match.reasons[0]}&rdquo;
                  </span>
                )}

                {/* Social icons row */}
                {(p.xHandle || p.linkedinUrl || p.githubHandle || p.websiteUrl) && (
                  <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.2rem" }}>
                    {p.xHandle && (
                      <span style={{ fontSize: "0.7rem", opacity: 0.4 }}>{"\u{1D54F}"}</span>
                    )}
                    {p.linkedinUrl && (
                      <span style={{ fontSize: "0.7rem", opacity: 0.4 }}>in</span>
                    )}
                    {p.githubHandle && (
                      <span style={{ fontSize: "0.7rem", opacity: 0.4 }}>GH</span>
                    )}
                    {p.websiteUrl && (
                      <span style={{ fontSize: "0.7rem", opacity: 0.4 }}>{"\uD83D\uDD17"}</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Responsive override for mobile */}
      <style>{`
        @media (max-width: 768px) {
          main {
            grid-template-columns: 1fr !important;
          }
          aside {
            border-left: none !important;
            border-top: 1px solid rgba(0,0,0,0.08);
            position: static !important;
            max-height: none !important;
          }
        }
      `}</style>
    </main>
  );
}

/* ── Page export with Suspense ─────────────────────────── */

export default function ProfilesPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  return (
    <Suspense
      fallback={
        <main style={{ maxWidth: 960, margin: "0 auto", padding: "120px 24px", textAlign: "center" }}>
          <p style={{ color: "rgba(0,0,0,0.6)", fontSize: "0.95rem" }}>Loading...</p>
        </main>
      }
    >
      <ProfilesContent slug={slug} />
    </Suspense>
  );
}
