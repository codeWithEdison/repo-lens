/**
 * Transparent contribution scoring engine.
 *
 * Produces normalized, weighted, evidence-backed scores per contributor. Every
 * metric records its raw value, normalized value, weight, weighted result,
 * confidence and a human-readable explanation. The final result is an
 * evidence-based estimate — not a mathematically absolute measurement.
 */

import type { RepoAnalysis } from "../types.js";
import type {
  ContributionScore,
  ContributionMetric,
  ContributionMetricKey,
  ContributionTimelinePoint,
  DetectedFeature,
  Contributor,
} from "@shared/types/index.js";
import { METRIC_LABELS, normalizeValues, toPercentages } from "@shared/scoring/index.js";
import { activeWeights } from "./weights.js";
import type { ContributorIndex } from "../analyzers/contributors.js";
import { meaningfulFiles } from "../analyzers/commitClassification.js";

interface Stats {
  meaningfulCommits: number;
  distinctFiles: Set<string>;
  activeWeeks: Set<string>;
  testCommits: number;
  infraCommits: number;
  coAuthoredInvolvement: number;
  maintenanceCommits: number;
  featuresOwned: number;
  featuresSupported: number;
  highComplexityOwned: number;
  repositories: Set<string>;
}

const TEST_RE = /(^|\/)(tests?|__tests__|spec)(\/|\.)|\.(test|spec)\.[jt]sx?$/i;
const INFRA_RE = /(dockerfile|docker-compose|\.github\/workflows|\.gitlab-ci|k8s|kubernetes|terraform|helm|\.tf$)/i;
const MAINTENANCE_RE = /\b(fix|bugfix|hotfix|refactor|cleanup|stabiliz|patch|revert)\b/i;

function weekKey(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "unknown";
  const year = d.getUTCFullYear();
  const firstDay = new Date(Date.UTC(year, 0, 1));
  const days = Math.floor((d.getTime() - firstDay.getTime()) / 86400000);
  const week = Math.floor(days / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export interface ScoringResult {
  scores: ContributionScore[];
  timeline: ContributionTimelinePoint[];
}

export function scoreContributions(
  analyses: RepoAnalysis[],
  features: DetectedFeature[],
  contributorIndex: ContributorIndex,
): ScoringResult {
  const humanContributors = contributorIndex.contributors.filter((c) => !c.isBot);
  const statsById = new Map<string, Stats>();
  const ensure = (id: string): Stats => {
    let s = statsById.get(id);
    if (!s) {
      s = {
        meaningfulCommits: 0,
        distinctFiles: new Set(),
        activeWeeks: new Set(),
        testCommits: 0,
        infraCommits: 0,
        coAuthoredInvolvement: 0,
        maintenanceCommits: 0,
        featuresOwned: 0,
        featuresSupported: 0,
        highComplexityOwned: 0,
        repositories: new Set(),
      };
      statsById.set(id, s);
    }
    return s;
  };

  const allWeeks = new Set<string>();

  for (const analysis of analyses) {
    for (const commit of analysis.commits) {
      if (!commit.classification.included) continue;
      const id = contributorIndex.emailToId.get(commit.author.email);
      if (!id) continue;
      const contributor = contributorIndex.byId.get(id);
      if (!contributor || contributor.isBot) continue;

      const s = ensure(id);
      s.meaningfulCommits += 1;
      s.repositories.add(analysis.summary.name);
      const wk = weekKey(commit.date);
      s.activeWeeks.add(wk);
      allWeeks.add(wk);

      const files = meaningfulFiles(commit);
      for (const f of files) s.distinctFiles.add(`${analysis.summary.name}/${f}`);
      if (files.some((f) => TEST_RE.test(f)) || TEST_RE.test(commit.message)) s.testCommits += 1;
      if (files.some((f) => INFRA_RE.test(f))) s.infraCommits += 1;
      if (MAINTENANCE_RE.test(commit.message)) s.maintenanceCommits += 1;

      for (const co of commit.coAuthors) {
        const coId = contributorIndex.emailToId.get(co.email);
        if (coId) ensure(coId).coAuthoredInvolvement += 1;
      }
      if (commit.coAuthors.length > 0) s.coAuthoredInvolvement += 1;
    }
  }

  for (const feature of features) {
    if (feature.primaryContributor) {
      const s = ensure(feature.primaryContributor);
      s.featuresOwned += 1;
      if (feature.complexity === "High") s.highComplexityOwned += 1;
    }
    for (const supporterId of feature.supportingContributors) {
      ensure(supporterId).featuresSupported += 1;
    }
  }

  const totalWeeks = Math.max(1, allWeeks.size);

  // Raw metric values per contributor.
  const rawByKey: Record<ContributionMetricKey, number[]> = {
    featureOwnership: [],
    delivery: [],
    complexity: [],
    consistency: [],
    quality: [],
    architecture: [],
    review: [],
    maintenance: [],
  };

  const ordered = humanContributors.filter((c) => statsById.has(c.id));

  for (const c of ordered) {
    const s = ensure(c.id);
    rawByKey.featureOwnership.push(s.featuresOwned + s.featuresSupported * 0.3);
    rawByKey.delivery.push(s.meaningfulCommits);
    rawByKey.complexity.push(s.distinctFiles.size + s.highComplexityOwned * 10);
    rawByKey.consistency.push(s.activeWeeks.size / totalWeeks);
    rawByKey.quality.push(s.testCommits);
    rawByKey.architecture.push(s.infraCommits);
    rawByKey.review.push(s.coAuthoredInvolvement);
    rawByKey.maintenance.push(s.maintenanceCommits);
  }

  const normByKey = {} as Record<ContributionMetricKey, number[]>;
  (Object.keys(rawByKey) as ContributionMetricKey[]).forEach((key) => {
    normByKey[key] = normalizeValues(rawByKey[key]);
  });

  const finalRaw: number[] = [];
  const scores: ContributionScore[] = ordered.map((c, i) => {
    const s = ensure(c.id);
    const metrics: ContributionMetric[] = (Object.keys(rawByKey) as ContributionMetricKey[]).map(
      (key) => {
        const weight = activeWeights[key];
        const normalized = normByKey[key][i] ?? 0;
        const weighted = normalized * weight;
        return {
          key,
          label: METRIC_LABELS[key],
          rawValue: round(rawByKey[key][i] ?? 0),
          normalizedValue: round(normalized),
          weight,
          weightedResult: round(weighted),
          confidence: c.identityConfidence,
          explanation: explain(key, s, c),
          evidence: evidenceFor(key, s),
        };
      },
    );
    const finalScore = metrics.reduce((sum, m) => sum + m.weightedResult, 0);
    finalRaw.push(finalScore);
    return {
      contributorId: c.id,
      name: c.name,
      handle: c.handle,
      metrics,
      finalScore: round(finalScore * 100),
      contributionPct: 0,
      featuresOwned: s.featuresOwned,
      repositories: [...s.repositories].sort(),
      confidence: c.identityConfidence,
      explanation: overallExplanation(c, s),
    };
  });

  const pcts = toPercentages(finalRaw);
  scores.forEach((score, i) => {
    score.contributionPct = pcts[i] ?? 0;
  });
  scores.sort((a, b) => b.contributionPct - a.contributionPct);

  const timeline = buildTimeline(analyses, contributorIndex, allWeeks);

  return { scores, timeline };
}

function buildTimeline(
  analyses: RepoAnalysis[],
  contributorIndex: ContributorIndex,
  allWeeks: Set<string>,
): ContributionTimelinePoint[] {
  const weeks = [...allWeeks].filter((w) => w !== "unknown").sort();
  const perWeek = new Map<string, Map<string, number>>();
  for (const w of weeks) perWeek.set(w, new Map());

  for (const analysis of analyses) {
    for (const commit of analysis.commits) {
      if (!commit.classification.included) continue;
      const id = contributorIndex.emailToId.get(commit.author.email);
      if (!id) continue;
      const contributor = contributorIndex.byId.get(id);
      if (!contributor || contributor.isBot) continue;
      const wk = weekKey(commit.date);
      const bucket = perWeek.get(wk);
      if (!bucket) continue;
      bucket.set(id, (bucket.get(id) ?? 0) + 1);
    }
  }

  return weeks.map((week) => ({
    period: week,
    values: Object.fromEntries(perWeek.get(week) ?? new Map()),
  }));
}

function explain(key: ContributionMetricKey, s: Stats, c: Contributor): string {
  switch (key) {
    case "featureOwnership":
      return `Owns ${s.featuresOwned} feature(s) and supports ${s.featuresSupported}.`;
    case "delivery":
      return `${s.meaningfulCommits} meaningful commit(s) after excluding low-signal activity.`;
    case "complexity":
      return `Touched ${s.distinctFiles.size} distinct source file(s); ${s.highComplexityOwned} high-complexity feature(s) owned.`;
    case "consistency":
      return `Active across ${s.activeWeeks.size} week(s).`;
    case "quality":
      return `${s.testCommits} commit(s) involving tests.`;
    case "architecture":
      return `${s.infraCommits} commit(s) touching infrastructure / CI / config.`;
    case "review":
      return `${s.coAuthoredInvolvement} co-authored / collaborative commit(s).`;
    case "maintenance":
      return `${s.maintenanceCommits} fix / refactor / stabilization commit(s).`;
    default:
      return `Contribution by ${c.name}.`;
  }
}

function evidenceFor(key: ContributionMetricKey, s: Stats): string[] {
  switch (key) {
    case "featureOwnership":
      return [`featuresOwned=${s.featuresOwned}`, `featuresSupported=${s.featuresSupported}`];
    case "delivery":
      return [`meaningfulCommits=${s.meaningfulCommits}`];
    case "complexity":
      return [`distinctFiles=${s.distinctFiles.size}`, `highComplexityOwned=${s.highComplexityOwned}`];
    case "consistency":
      return [`activeWeeks=${s.activeWeeks.size}`];
    case "quality":
      return [`testCommits=${s.testCommits}`];
    case "architecture":
      return [`infraCommits=${s.infraCommits}`];
    case "review":
      return [`coAuthored=${s.coAuthoredInvolvement}`];
    case "maintenance":
      return [`maintenanceCommits=${s.maintenanceCommits}`];
    default:
      return [];
  }
}

function overallExplanation(c: Contributor, s: Stats): string {
  const parts: string[] = [];
  if (s.featuresOwned > 0) parts.push(`owns ${s.featuresOwned} feature(s)`);
  if (s.meaningfulCommits > 0) parts.push(`${s.meaningfulCommits} meaningful commits`);
  if (s.testCommits > 0) parts.push(`contributes to testing`);
  if (s.infraCommits > 0) parts.push(`works on infrastructure`);
  const summary = parts.length ? parts.join(", ") : "limited detected activity";
  return `${c.name} — ${summary}. Identity confidence ${(c.identityConfidence * 100).toFixed(0)}%.`;
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
