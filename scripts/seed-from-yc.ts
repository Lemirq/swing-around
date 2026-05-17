/**
 * Seed script: Parse yc_messages.json and push profiles into Convex.
 *
 * Usage: npx convex run seed:createSessionAndProfiles --args "$(node scripts/seed-from-yc.ts)"
 *
 * Or just run: npx tsx scripts/seed-from-yc.ts | pbcopy
 * Then paste as args to: npx convex run seed:createSessionAndProfiles
 */

import * as fs from "fs";
import * as path from "path";

interface YCUser {
  full_name: string;
  first_name: string;
  last_name: string;
  id: number;
  hnid: string;
  yc: boolean;
  byline_company?: { name: string; batch: string } | null;
}

interface YCMessage {
  id: number;
  content: string;
  user: YCUser;
  reactions?: Array<{ user: { id: number; name: string; current_company_name?: string | null } }>;
  thread_reply_users?: YCUser[];
}

interface ParsedProfile {
  displayName: string;
  bio?: string;
  interests?: string[];
  xHandle?: string;
  linkedinUrl?: string;
  githubHandle?: string;
  websiteUrl?: string;
  headline?: string;
  company?: string;
  title?: string;
  rawTranscript?: string;
}

const filePath = path.join(__dirname, "..", "yc_messages.json");
const raw = fs.readFileSync(filePath, "utf-8");
const data = JSON.parse(raw) as { messages: YCMessage[] };

// Extract unique people from message authors and their content
const peopleMap = new Map<number, ParsedProfile>();

for (const msg of data.messages) {
  const user = msg.user;
  // Skip the Y Combinator bot account
  if (user.full_name === "Y Combinator") continue;

  const existing = peopleMap.get(user.id);
  const content = msg.content;

  // Extract social links from message content
  const linkedinMatch = content.match(/linkedin\.com\/in\/([^\s>)]+)/);
  const xMatch = content.match(/(?:x\.com|twitter\.com)\/([^\s>)]+)/);
  const githubMatch = content.match(/github\.com\/([^\s>)]+)/);
  const websiteMatch = content.match(/https?:\/\/(?!.*(?:linkedin|github|x\.com|twitter))([^\s>)]+\.[^\s>)]+)/);

  if (existing) {
    // Append message content to raw transcript
    if (content && content.length > 5) {
      existing.rawTranscript = existing.rawTranscript
        ? `${existing.rawTranscript}\n${content}`
        : content;
    }
    // Fill in social links if found
    if (linkedinMatch && !existing.linkedinUrl) {
      existing.linkedinUrl = `https://www.linkedin.com/in/${linkedinMatch[1].replace(/[<>]/g, "")}`;
    }
    if (xMatch && !existing.xHandle) {
      existing.xHandle = xMatch[1].replace(/[<>]/g, "");
    }
    if (githubMatch && !existing.githubHandle) {
      existing.githubHandle = githubMatch[1].replace(/[<>]/g, "");
    }
    if (websiteMatch && !existing.websiteUrl) {
      const url = websiteMatch[0].replace(/[<>]/g, "");
      if (!url.includes("messages.ycombinator") && !url.includes("bookface")) {
        existing.websiteUrl = url;
      }
    }
    if (user.byline_company && !existing.company) {
      existing.company = `${user.byline_company.name} (${user.byline_company.batch})`;
    }
  } else {
    const profile: ParsedProfile = {
      displayName: user.full_name,
    };

    if (content && content.length > 5) {
      profile.rawTranscript = content;
    }
    if (linkedinMatch) {
      profile.linkedinUrl = `https://www.linkedin.com/in/${linkedinMatch[1].replace(/[<>]/g, "")}`;
    }
    if (xMatch) {
      profile.xHandle = xMatch[1].replace(/[<>]/g, "");
    }
    if (githubMatch) {
      profile.githubHandle = githubMatch[1].replace(/[<>]/g, "");
    }
    if (websiteMatch) {
      const url = websiteMatch[0].replace(/[<>]/g, "");
      if (!url.includes("messages.ycombinator") && !url.includes("bookface")) {
        profile.websiteUrl = url;
      }
    }
    if (user.byline_company) {
      profile.company = `${user.byline_company.name} (${user.byline_company.batch})`;
    }
    if (user.yc) {
      profile.headline = "YC Founder";
    }

    peopleMap.set(user.id, profile);
  }

  // Also extract people from reactions (they at least engaged)
  if (msg.reactions) {
    for (const reaction of msg.reactions) {
      if (!peopleMap.has(reaction.user.id)) {
        const rProfile: ParsedProfile = {
          displayName: reaction.user.name,
        };
        if (reaction.user.current_company_name) {
          rProfile.company = reaction.user.current_company_name;
        }
        peopleMap.set(reaction.user.id, rProfile);
      }
    }
  }

  // Extract thread reply users
  if (msg.thread_reply_users) {
    for (const replyUser of msg.thread_reply_users) {
      if (!peopleMap.has(replyUser.id) && replyUser.full_name !== "Y Combinator") {
        const rProfile: ParsedProfile = {
          displayName: replyUser.full_name,
        };
        if (replyUser.byline_company) {
          rProfile.company = `${replyUser.byline_company.name} (${replyUser.byline_company.batch})`;
        }
        peopleMap.set(replyUser.id, rProfile);
      }
    }
  }
}

const profiles = Array.from(peopleMap.values());

const output = {
  partyName: "GStack x GBrain Hackathon",
  slug: "yc-hackathon",
  profiles,
};

console.log(JSON.stringify(output, null, 2));
