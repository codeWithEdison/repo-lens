/**
 * NoopAIProvider — deterministic, template-based explanations generated from
 * evidence. Allows the entire application to function without an API key.
 */

import type {
  AIProvider,
  ProjectSummaryInput,
  ProjectSummaryResult,
  FeatureExplanationInput,
  FeatureExplanationResult,
  ContributionExplanationInput,
  ContributionExplanationResult,
} from "./provider.js";

export class NoopAIProvider implements AIProvider {
  readonly id = "none";

  async summarizeProject(input: ProjectSummaryInput): Promise<ProjectSummaryResult> {
    const repoCount = input.repositoryNames.length;
    const repoWord = repoCount === 1 ? "repository" : "repositories";
    const lead = input.topContributors[0];
    const second = input.topContributors[1];

    const parts: string[] = [];
    parts.push(
      `Across ${repoCount} ${repoWord} (${input.repositoryNames.join(", ")}), ` +
        `RepoLens detected ${input.featureNames.length} preliminary feature group(s).`,
    );
    if (lead) {
      parts.push(
        `${lead.name} shows the highest estimated technical contribution ` +
          `(~${lead.contributionPct}%), owning ${lead.featuresOwned} feature(s).`,
      );
    }
    if (second) {
      parts.push(
        `${second.name} follows with ~${second.contributionPct}% of estimated contribution.`,
      );
    }
    if (input.frameworks.length) {
      parts.push(`Primary technologies include ${input.frameworks.slice(0, 5).join(", ")}.`);
    }
    parts.push(
      "These figures are evidence-based estimates derived from commit history, " +
        "feature grouping and structural analysis — not absolute measurements.",
    );
    return { summary: parts.join(" ") };
  }

  async explainFeature(input: FeatureExplanationInput): Promise<FeatureExplanationResult> {
    const owner = input.primaryContributor ?? "an unidentified contributor";
    const support =
      input.supportingContributors.length > 0
        ? ` with support from ${input.supportingContributors.slice(0, 3).join(", ")}`
        : "";
    return {
      explanation:
        `${input.featureName} (${input.complexity.toLowerCase()} complexity) appears primarily owned by ` +
        `${owner}${support}, based on ${input.commitCount} related commit(s).`,
    };
  }

  async explainContribution(
    input: ContributionExplanationInput,
  ): Promise<ContributionExplanationResult> {
    const strengths = input.topMetrics
      .slice(0, 2)
      .map((m) => m.label.toLowerCase())
      .join(" and ");
    return {
      explanation:
        `${input.contributorName} accounts for an estimated ${input.contributionPct}% of technical ` +
        `contribution, owning ${input.featuresOwned} feature(s)` +
        (strengths ? `, with particular strength in ${strengths}.` : "."),
    };
  }
}
