/**
 * Contributor identity normalization.
 *
 * The same person may commit under several names / emails. We merge identities
 * conservatively: always by identical email, and additionally by identical
 * full name (containing a space) to avoid false merges of common single-word
 * handles. Low-confidence merges are flagged rather than asserted.
 */

import { createHash } from "node:crypto";
import type { RepoAnalysis, GitIdentity } from "../types.js";
import type { Contributor } from "@shared/types/index.js";
import { isBotIdentity } from "./commitClassification.js";

interface IdentityAgg {
  emails: Set<string>;
  names: Set<string>;
  repos: Set<string>;
  commitCount: number;
  meaningfulCommitCount: number;
  isBot: boolean;
}

export interface ContributorIndex {
  contributors: Contributor[];
  /** email (lowercase) -> contributorId */
  emailToId: Map<string, string>;
  byId: Map<string, Contributor>;
}

export function normalizeContributors(analyses: RepoAnalysis[]): ContributorIndex {
  // Union-find over emails.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) && parent.get(root) !== root) root = parent.get(root)!;
    parent.set(x, root);
    return root;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const ensure = (email: string): void => {
    if (!parent.has(email)) parent.set(email, email);
  };

  const emailAgg = new Map<string, IdentityAgg>();
  const fullNameToEmail = new Map<string, string>();

  const record = (
    identity: GitIdentity,
    repo: string,
    meaningful: boolean,
    countCommit: boolean,
  ): void => {
    const email = identity.email || `${slug(identity.name)}@unknown.local`;
    ensure(email);
    let agg = emailAgg.get(email);
    if (!agg) {
      agg = {
        emails: new Set([email]),
        names: new Set(),
        repos: new Set(),
        commitCount: 0,
        meaningfulCommitCount: 0,
        isBot: false,
      };
      emailAgg.set(email, agg);
    }
    if (identity.name) agg.names.add(identity.name);
    agg.repos.add(repo);
    if (countCommit) agg.commitCount += 1;
    if (meaningful) agg.meaningfulCommitCount += 1;
    if (isBotIdentity(identity.name, email)) agg.isBot = true;

    // Merge by full name (contains a space) across differing emails.
    const fullName = identity.name.trim().toLowerCase();
    if (fullName.includes(" ")) {
      const existing = fullNameToEmail.get(fullName);
      if (existing && existing !== email) union(existing, email);
      else fullNameToEmail.set(fullName, email);
    }
  };

  for (const analysis of analyses) {
    for (const commit of analysis.commits) {
      const meaningful = commit.classification.included;
      record(commit.author, analysis.summary.name, meaningful, true);
      for (const co of commit.coAuthors) {
        record(co, analysis.summary.name, meaningful, false);
      }
    }
  }

  // Group emails by their union root.
  const groups = new Map<string, IdentityAgg>();
  for (const [email, agg] of emailAgg) {
    const root = find(email);
    let group = groups.get(root);
    if (!group) {
      group = {
        emails: new Set(),
        names: new Set(),
        repos: new Set(),
        commitCount: 0,
        meaningfulCommitCount: 0,
        isBot: false,
      };
      groups.set(root, group);
    }
    for (const e of agg.emails) group.emails.add(e);
    for (const n of agg.names) group.names.add(n);
    for (const r of agg.repos) group.repos.add(r);
    group.commitCount += agg.commitCount;
    group.meaningfulCommitCount += agg.meaningfulCommitCount;
    group.isBot = group.isBot || agg.isBot;
  }

  const contributors: Contributor[] = [];
  const emailToId = new Map<string, string>();
  const byId = new Map<string, Contributor>();

  for (const group of groups.values()) {
    const emails = [...group.emails];
    const names = [...group.names];
    const primaryName = names[0] ?? emails[0];
    const login = emails.map(extractGithubLogin).find((l): l is string => Boolean(l));
    const id = `c_${createHash("sha1").update(emails.sort().join("|")).digest("hex").slice(0, 12)}`;

    const mergedAcrossEmails = emails.length > 1;
    const identityConfidence = group.isBot ? 1 : mergedAcrossEmails ? 0.75 : 0.95;

    const contributor: Contributor = {
      id,
      name: primaryName,
      handle: login ?? slug(primaryName),
      emails,
      aliases: names,
      login,
      identityConfidence,
      isBot: group.isBot,
      repositories: [...group.repos].sort(),
      commitCount: group.commitCount,
      meaningfulCommitCount: group.meaningfulCommitCount,
    };
    contributors.push(contributor);
    byId.set(id, contributor);
    for (const e of emails) emailToId.set(e, id);
  }

  contributors.sort((a, b) => b.meaningfulCommitCount - a.meaningfulCommitCount);

  return { contributors, emailToId, byId };
}

export function extractGithubLogin(email: string): string | undefined {
  const m = email.match(/^(?:\d+\+)?([a-z0-9-]+)@users\.noreply\.github\.com$/i);
  return m ? m[1] : undefined;
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/@.*/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "contributor"
  );
}
