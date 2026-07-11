/**
 * Preliminary feature detection using transparent heuristics.
 *
 * Related work is grouped using commit-message keywords and shared directory /
 * module names across meaningful (non-excluded) commits. Confidence reflects
 * the amount of supporting evidence; weak groups are labeled low-confidence
 * rather than asserted as certain.
 */

import type { RepoAnalysis } from "../types.js";
import type { DetectedFeature, FeatureContributor } from "@shared/types/index.js";
import { meaningfulFiles } from "./commitClassification.js";
import type { ContributorIndex } from "./contributors.js";

/** Known feature vocabulary: keyword regex -> canonical feature name. */
const VOCAB: Array<{ re: RegExp; name: string }> = [
  { re: /\b(auth|authentication|login|signin|signup|oauth|session|jwt)\b/i, name: "Authentication" },
  { re: /\b(payment|billing|invoice|subscription|checkout|stripe)\b/i, name: "Payments & Billing" },
  { re: /\b(notification|notify|email|push|sms)\b/i, name: "Notifications" },
  { re: /\b(dashboard|analytics|metrics|charts?)\b/i, name: "Dashboard & Analytics" },
  { re: /\b(search|indexing|elasticsearch|meilisearch)\b/i, name: "Search" },
  { re: /\b(reservation|booking|schedule)\b/i, name: "Reservations" },
  { re: /\b(report|reporting|export)\b/i, name: "Reporting" },
  { re: /\b(upload|file|storage|attachment|media)\b/i, name: "File Management" },
  { re: /\b(track|tracking|location|gps|vehicle)\b/i, name: "Tracking" },
  { re: /\b(api|endpoint|route|controller|graphql|rest)\b/i, name: "API Layer" },
  { re: /\b(admin|management|settings|config)\b/i, name: "Admin & Settings" },
  { re: /\b(test|testing|spec|e2e|coverage)\b/i, name: "Testing & Quality" },
  { re: /\b(ci|cd|pipeline|deploy|docker|infra|kubernetes|k8s)\b/i, name: "CI/CD & Infrastructure" },
  { re: /\b(ui|component|design|style|theme|layout)\b/i, name: "UI & Components" },
  { re: /\b(database|migration|schema|model|orm)\b/i, name: "Data Layer" },
];

const GENERIC_DIRS = new Set([
  "src",
  "lib",
  "app",
  "packages",
  "test",
  "tests",
  "__tests__",
  "spec",
  "public",
  "assets",
  "types",
  "utils",
  "common",
  "shared",
  "internal",
  "pkg",
  "cmd",
]);

interface Bucket {
  name: string;
  commits: Set<string>;
  files: Set<string>;
  repositories: Set<string>;
  contributorCommits: Map<string, number>;
  first: number;
  last: number;
  keywordHits: number;
  dirHits: number;
}

const MAX_FEATURES = 12;

export function detectFeatures(
  analyses: RepoAnalysis[],
  contributorIndex: ContributorIndex,
): DetectedFeature[] {
  const buckets = new Map<string, Bucket>();

  const bucketFor = (name: string): Bucket => {
    let b = buckets.get(name);
    if (!b) {
      b = {
        name,
        commits: new Set(),
        files: new Set(),
        repositories: new Set(),
        contributorCommits: new Map(),
        first: Number.POSITIVE_INFINITY,
        last: 0,
        keywordHits: 0,
        dirHits: 0,
      };
      buckets.set(name, b);
    }
    return b;
  };

  for (const analysis of analyses) {
    for (const commit of analysis.commits) {
      if (!commit.classification.included) continue;
      const contributorId = contributorIndex.emailToId.get(commit.author.email);
      if (!contributorId) continue;
      const files = meaningfulFiles(commit);
      const time = Date.parse(commit.date) || 0;

      const names = new Set<string>();

      // Keyword-derived features.
      for (const entry of VOCAB) {
        if (entry.re.test(commit.message)) names.add(entry.name);
      }

      // Directory / module derived features.
      for (const file of files) {
        const seg = featureSegment(file);
        if (seg) names.add(seg);
      }

      if (names.size === 0) continue;

      for (const name of names) {
        const bucket = bucketFor(name);
        bucket.commits.add(`${analysis.summary.name}:${commit.hash}`);
        bucket.repositories.add(analysis.summary.name);
        for (const f of files) bucket.files.add(`${analysis.summary.name}/${f}`);
        bucket.contributorCommits.set(
          contributorId,
          (bucket.contributorCommits.get(contributorId) ?? 0) + 1,
        );
        if (time) {
          bucket.first = Math.min(bucket.first, time);
          bucket.last = Math.max(bucket.last, time);
        }
        if (VOCAB.some((v) => v.name === name)) bucket.keywordHits += 1;
        else bucket.dirHits += 1;
      }
    }
  }

  const features = [...buckets.values()]
    .filter((b) => b.commits.size >= 2)
    .sort((a, b) => b.commits.size - a.commits.size)
    .slice(0, MAX_FEATURES)
    .map((bucket, idx) => toFeature(bucket, idx, contributorIndex));

  return features;
}

function toFeature(
  bucket: Bucket,
  index: number,
  contributorIndex: ContributorIndex,
): DetectedFeature {
  const sortedContribs = [...bucket.contributorCommits.entries()].sort(
    (a, b) => b[1] - a[1],
  );
  const totalContribCommits = sortedContribs.reduce((s, [, n]) => s + n, 0) || 1;

  const contributors: FeatureContributor[] = sortedContribs.map(([id, n], i) => ({
    contributorId: id,
    name: contributorIndex.byId.get(id)?.name ?? id,
    share: Math.round((n / totalContribCommits) * 1000) / 10,
    role: i === 0 ? "primary" : "supporting",
  }));

  const commitCount = bucket.commits.size;
  const fileCount = bucket.files.size;
  const complexity: DetectedFeature["complexity"] =
    fileCount > 40 || commitCount > 30 ? "High" : fileCount > 12 || commitCount > 10 ? "Medium" : "Low";

  // Confidence: keyword evidence + volume, capped at 0.9 (never certain).
  const volume = Math.min(1, commitCount / 20);
  const keywordSignal = bucket.keywordHits > 0 ? 0.5 : 0.3;
  const confidence = Math.min(0.9, Math.round((keywordSignal + volume * 0.4) * 100) / 100);

  return {
    id: `f_${index}_${slug(bucket.name)}`,
    name: bucket.name,
    description: `Work related to ${bucket.name.toLowerCase()} grouped from ${commitCount} commits across ${bucket.repositories.size} repositor${bucket.repositories.size === 1 ? "y" : "ies"}.`,
    repositories: [...bucket.repositories].sort(),
    files: [...bucket.files].slice(0, 100),
    commits: [...bucket.commits].slice(0, 200),
    pullRequests: [],
    firstActivityAt: bucket.first !== Number.POSITIVE_INFINITY ? new Date(bucket.first).toISOString() : null,
    lastActivityAt: bucket.last ? new Date(bucket.last).toISOString() : null,
    primaryContributor: contributors[0]?.contributorId ?? null,
    supportingContributors: contributors.slice(1).map((c) => c.contributorId),
    contributors,
    complexity,
    confidence,
    evidenceRefs: [...bucket.commits].slice(0, 20),
  };
}

/** Derive a meaningful feature name from a file path's directory segments. */
function featureSegment(file: string): string | null {
  const parts = file.split("/").filter(Boolean);
  for (const part of parts.slice(0, 3)) {
    const clean = part.toLowerCase();
    if (GENERIC_DIRS.has(clean)) continue;
    if (clean.includes(".")) continue; // filename
    if (clean.length < 3) continue;
    return titleCase(clean.replace(/[-_]+/g, " "));
  }
  return null;
}

function titleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
