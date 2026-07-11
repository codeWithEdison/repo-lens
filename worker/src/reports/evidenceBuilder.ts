/**
 * Builds evidence.json — enough information to explain every report conclusion.
 * Never includes access tokens or sensitive environment values.
 */

import type { RepoAnalysis } from "../types.js";
import type {
  ContributionEvidence,
  ContributionReport,
  EvidenceCommit,
  ExcludedActivity,
} from "@shared/types/index.js";
import type { ContributorIndex } from "../analyzers/contributors.js";

const MAX_COMMITS_IN_EVIDENCE = 2000;

export function buildEvidence(
  analysisId: string,
  analyses: RepoAnalysis[],
  report: ContributionReport,
  contributorIndex: ContributorIndex,
): ContributionEvidence {
  const referencedCommits: EvidenceCommit[] = [];
  const excludedActivity: ExcludedActivity[] = [];

  for (const analysis of analyses) {
    for (const commit of analysis.commits) {
      if (referencedCommits.length < MAX_COMMITS_IN_EVIDENCE) {
        referencedCommits.push({
          hash: commit.hash,
          repository: analysis.summary.name,
          author: commit.author.name,
          date: commit.date,
          message: firstLine(commit.message),
          filesChanged: commit.files.length,
          included: commit.classification.included,
          exclusionReason: commit.classification.reason,
        });
      }
      if (!commit.classification.included && excludedActivity.length < MAX_COMMITS_IN_EVIDENCE) {
        excludedActivity.push({
          hash: commit.hash,
          repository: analysis.summary.name,
          reason: commit.classification.reason ?? "Excluded",
        });
      }
    }
  }

  const consistencyPeriods = report.contributionScores.map((s) => {
    const activeWeeks = s.metrics.find((m) => m.key === "consistency");
    const total = report.contributionTimeline.length || 1;
    return {
      contributorId: s.contributorId,
      activePeriods: Math.round((activeWeeks?.normalizedValue ?? 0) * total),
      totalPeriods: total,
    };
  });

  return {
    analysisId,
    generatedAt: new Date().toISOString(),
    contributorAliases: contributorIndex.contributors.map((c) => ({
      contributorId: c.id,
      name: c.name,
      aliases: c.aliases,
      emails: c.emails,
      identityConfidence: c.identityConfidence,
    })),
    referencedCommits,
    featureGrouping: report.detectedFeatures.map((f) => ({
      featureId: f.id,
      reason: f.description,
      signals: f.evidenceRefs,
      confidence: f.confidence,
    })),
    ownershipEvidence: report.detectedFeatures
      .filter((f) => f.primaryContributor)
      .map((f) => ({
        featureId: f.id,
        contributorId: f.primaryContributor as string,
        reason: `Highest number of related commits among contributors to ${f.name}.`,
      })),
    complexityIndicators: report.detectedFeatures.map(
      (f) => `${f.name}: ${f.complexity} complexity (${f.files.length} files, ${f.commits.length} commits).`,
    ),
    consistencyPeriods,
    qualityIndicators: analyses.map(
      (a) => `${a.summary.name}: tests=${a.summary.hasTests}, ci=${a.summary.hasCi}, docs=${a.summary.hasDocs}.`,
    ),
    excludedActivity,
    scoringCalculations: report.contributionScores,
    warnings: report.warnings,
    limitations: report.limitations,
  };
}

function firstLine(message: string): string {
  return message.split("\n")[0].slice(0, 200);
}
