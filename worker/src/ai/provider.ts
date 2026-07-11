/**
 * AI provider abstraction. The application must run fully without any AI API
 * key (NoopAIProvider). Only bounded, structured, secret-free summaries are
 * ever sent to an external provider.
 */

export interface ProjectSummaryInput {
  repositoryNames: string[];
  topContributors: Array<{ name: string; contributionPct: number; featuresOwned: number }>;
  featureNames: string[];
  languages: string[];
  frameworks: string[];
}

export interface ProjectSummaryResult {
  summary: string;
}

export interface FeatureExplanationInput {
  featureName: string;
  primaryContributor: string | null;
  supportingContributors: string[];
  complexity: string;
  commitCount: number;
}

export interface FeatureExplanationResult {
  explanation: string;
}

export interface ContributionExplanationInput {
  contributorName: string;
  contributionPct: number;
  featuresOwned: number;
  topMetrics: Array<{ label: string; normalizedValue: number }>;
}

export interface ContributionExplanationResult {
  explanation: string;
}

export interface AIProvider {
  readonly id: string;
  summarizeProject(input: ProjectSummaryInput): Promise<ProjectSummaryResult>;
  explainFeature(input: FeatureExplanationInput): Promise<FeatureExplanationResult>;
  explainContribution(
    input: ContributionExplanationInput,
  ): Promise<ContributionExplanationResult>;
}
