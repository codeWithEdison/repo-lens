/**
 * Assembles the final ContributionReport from per-repository analyses, detected
 * features and scoring results. Supports multi-repository projects while
 * preserving per-repository evidence.
 */

import type { RepoAnalysis } from "../types.js";
import type {
  ContributionReport,
  DetectedFeature,
  LanguageStat,
  TechnologySummary,
  TechnicalShareRecommendation,
} from "@shared/types/index.js";
import type { ScoringResult } from "../scoring/scoreEngine.js";
import type { ContributorIndex } from "../analyzers/contributors.js";
import { getAIProvider } from "../ai/index.js";
import { activeMetricDefinitions } from "../scoring/weights.js";

export async function buildReport(
  analysisId: string,
  analyses: RepoAnalysis[],
  features: DetectedFeature[],
  scoring: ScoringResult,
  contributorIndex: ContributorIndex,
): Promise<ContributionReport> {
  const technologies = aggregateTechnologies(analyses);
  const ai = getAIProvider();

  const topContributors = scoring.scores.slice(0, 3).map((s) => ({
    name: s.name,
    contributionPct: s.contributionPct,
    featuresOwned: s.featuresOwned,
  }));

  const projectSummaryResult = await ai.summarizeProject({
    repositoryNames: analyses.map((a) => a.summary.name),
    topContributors,
    featureNames: features.map((f) => f.name),
    languages: technologies.languages.map((l) => l.name),
    frameworks: technologies.frameworks,
  });

  const technicalShareRecommendation: TechnicalShareRecommendation[] = scoring.scores.map((s) => ({
    contributorId: s.contributorId,
    name: s.name,
    sharePct: s.contributionPct,
    reason: s.explanation,
    confidence: s.confidence,
  }));

  const warnings = buildWarnings(analyses, features, scoring);

  return {
    analysisId,
    generatedAt: new Date().toISOString(),
    repositories: analyses.map((a) => a.summary),
    projectSummary: projectSummaryResult.summary,
    technologies,
    contributors: contributorIndex.contributors,
    contributorRanking: scoring.scores,
    detectedFeatures: features,
    featureOwnership: features,
    contributionTimeline: scoring.timeline,
    contributionScores: scoring.scores,
    technicalShareRecommendation,
    methodology: buildMethodology(),
    limitations: buildLimitations(),
    warnings,
  };
}

function aggregateTechnologies(analyses: RepoAnalysis[]): TechnologySummary {
  const langFiles = new Map<string, number>();
  const frameworks = new Set<string>();
  let totalFiles = 0;
  let totalDirs = 0;

  for (const a of analyses) {
    for (const l of a.summary.languages) {
      langFiles.set(l.name, (langFiles.get(l.name) ?? 0) + l.files);
    }
    for (const f of a.summary.frameworks) frameworks.add(f);
    totalFiles += a.summary.fileCount;
    totalDirs += a.structure.mainDirectories.length;
  }

  const totalLangFiles = [...langFiles.values()].reduce((s, v) => s + v, 0) || 1;
  const languages: LanguageStat[] = [...langFiles.entries()]
    .map(([name, files]) => ({
      name,
      files,
      pct: Math.round((files / totalLangFiles) * 1000) / 10,
    }))
    .sort((a, b) => b.files - a.files)
    .slice(0, 10);

  const architecture =
    analyses.length > 1
      ? `Multi-repository project (${analyses.length} repositories) analyzed as one project.`
      : "Single repository project.";

  return {
    languages,
    frameworks: [...frameworks],
    architecture,
    projectSize: `${totalFiles.toLocaleString()} files across ${analyses.length} repositor${analyses.length === 1 ? "y" : "ies"}`,
    modules: totalDirs,
    dependencies: frameworks.size,
    complexity: totalFiles > 5000 ? "High" : totalFiles > 1000 ? "Moderate" : "Low",
  };
}

function buildWarnings(
  analyses: RepoAnalysis[],
  features: DetectedFeature[],
  scoring: ScoringResult,
): string[] {
  const warnings: string[] = [];
  if (scoring.scores.length === 0) {
    warnings.push("No reliable contribution could be calculated from the available history.");
  }
  if (features.length === 0) {
    warnings.push("No preliminary features could be detected with sufficient confidence.");
  }
  for (const a of analyses) {
    if (a.summary.commitCount < 10) {
      warnings.push(`Repository "${a.summary.name}" has very little history (${a.summary.commitCount} commits); results are low-confidence.`);
    }
  }
  return warnings;
}

function buildMethodology(): string {
  const weights = activeMetricDefinitions
    .map((m) => `${m.label} ${(m.weight * 100).toFixed(0)}%`)
    .join(", ");
  return (
    "Contribution is estimated from Git history, structural analysis and heuristic feature " +
    "grouping. Low-signal activity (merge commits, bots, lockfile-only, generated files, " +
    "formatting-only and reverted changes) is excluded. Metrics are normalized, then combined " +
    `using the following weights: ${weights}. Commit count and lines of code are used only as ` +
    "evidence, never as the final score."
  );
}

function buildLimitations(): string[] {
  return [
    "Feature detection uses transparent heuristics and may miss or mislabel features.",
    "Contributor identities are merged conservatively and may still be imperfect.",
    "Pull-request and review data is only available when GitHub metadata could be fetched.",
    "Results are evidence-based estimates and should support human discussion, not replace it.",
  ];
}
