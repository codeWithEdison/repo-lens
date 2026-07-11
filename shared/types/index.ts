/**
 * Shared domain types for RepoLens.
 *
 * These types are consumed by the frontend, the API server, and the worker.
 * They describe the stateless analysis model: every analysis lives only inside
 * a temporary filesystem workspace and is deleted after a retention period.
 */

export type RepositoryProvider = "github" | "gitlab" | "bitbucket" | "generic";

export interface RepositoryInput {
  /** Public clone URL (https). */
  url: string;
  /** Optional branch to analyze. Defaults to the repository default branch. */
  branch?: string;
  /**
   * Optional short-lived access token for private repositories.
   * NEVER persisted to metadata, progress, report, evidence, logs or exports.
   */
  accessToken?: string;
}

export type AnalysisStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "expired";

export type AnalysisStage =
  | "Queued"
  | "Preparing Workspace"
  | "Cloning Repositories"
  | "Reading Git History"
  | "Inspecting Project Structure"
  | "Analyzing Contributors"
  | "Detecting Features"
  | "Calculating Contribution"
  | "Generating Report"
  | "Generating Exports"
  | "Cleaning Temporary Repositories"
  | "Completed"
  | "Failed";

export type RepositoryStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

/** Public description of a repository stored in metadata (no secrets). */
export interface AnalysisMetadataRepository {
  name: string;
  provider: RepositoryProvider;
  url: string;
  branch?: string;
}

export interface AnalysisMetadata {
  analysisId: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  status: AnalysisStatus;
  repositories: AnalysisMetadataRepository[];
  reportReady: boolean;
  exportsReady: boolean;
  /** Present when status === "failed". */
  error?: AnalysisError | null;
}

export interface AnalysisError {
  code: string;
  message: string;
}

export interface RepositoryProgress {
  name: string;
  url: string;
  progress: number;
  status: RepositoryStatus;
  currentStage?: AnalysisStage;
}

export interface AnalysisProgress {
  analysisId: string;
  status: AnalysisStatus;
  overallProgress: number;
  currentStage: AnalysisStage;
  message: string;
  repositories: RepositoryProgress[];
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  error: AnalysisError | null;
}

export type LogLevel = "debug" | "info" | "warning" | "error";

export interface AnalysisLogEntry {
  timestamp: string;
  level: LogLevel;
  stage: AnalysisStage | string;
  message: string;
  repository?: string;
  durationMs?: number;
  details?: unknown;
}

/** A single normalized contributor across all analyzed repositories. */
export interface Contributor {
  id: string;
  name: string;
  /** Primary handle / login when known, otherwise a derived slug. */
  handle: string;
  emails: string[];
  aliases: string[];
  /** github login when detected. */
  login?: string;
  /** Confidence that the merged identity is correct (0..1). */
  identityConfidence: number;
  isBot: boolean;
  repositories: string[];
  commitCount: number;
  meaningfulCommitCount: number;
}

export interface RepositorySummary {
  name: string;
  provider: RepositoryProvider;
  url: string;
  defaultBranch: string;
  branchAnalyzed: string;
  commitCount: number;
  contributorCount: number;
  firstCommitAt: string | null;
  lastCommitAt: string | null;
  languages: LanguageStat[];
  frameworks: string[];
  tags: string[];
  hasTests: boolean;
  hasCi: boolean;
  hasDocker: boolean;
  hasDocs: boolean;
  fileCount: number;
}

export interface LanguageStat {
  name: string;
  /** Percentage 0..100 of analyzed source. */
  pct: number;
  files: number;
}

export interface FeatureContributor {
  contributorId: string;
  name: string;
  /** Relative contribution to the feature 0..100. */
  share: number;
  role: "primary" | "supporting";
}

export interface DetectedFeature {
  id: string;
  name: string;
  description: string;
  repositories: string[];
  files: string[];
  commits: string[];
  pullRequests: number[];
  firstActivityAt: string | null;
  lastActivityAt: string | null;
  primaryContributor: string | null;
  supportingContributors: string[];
  contributors: FeatureContributor[];
  complexity: "Low" | "Medium" | "High";
  /** Detection confidence 0..1. */
  confidence: number;
  evidenceRefs: string[];
}

export type ContributionMetricKey =
  | "featureOwnership"
  | "delivery"
  | "complexity"
  | "consistency"
  | "quality"
  | "architecture"
  | "review"
  | "maintenance";

export interface ContributionMetric {
  key: ContributionMetricKey;
  label: string;
  rawValue: number;
  normalizedValue: number;
  weight: number;
  weightedResult: number;
  confidence: number;
  explanation: string;
  evidence: string[];
}

export interface ContributionScore {
  contributorId: string;
  name: string;
  handle: string;
  metrics: ContributionMetric[];
  finalScore: number;
  /** Normalized so all contributors total 100. */
  contributionPct: number;
  featuresOwned: number;
  repositories: string[];
  confidence: number;
  explanation: string;
}

export interface ContributionTimelinePoint {
  period: string;
  /** contributorId -> normalized activity for the period. */
  values: Record<string, number>;
}

export interface TechnicalShareRecommendation {
  contributorId: string;
  name: string;
  sharePct: number;
  reason: string;
  confidence: number;
}

export interface TechnologySummary {
  languages: LanguageStat[];
  frameworks: string[];
  architecture: string;
  projectSize: string;
  modules: number;
  dependencies: number;
  complexity: string;
}

export interface ContributionReport {
  analysisId: string;
  generatedAt: string;
  repositories: RepositorySummary[];
  projectSummary: string;
  technologies: TechnologySummary;
  contributors: Contributor[];
  contributorRanking: ContributionScore[];
  detectedFeatures: DetectedFeature[];
  featureOwnership: DetectedFeature[];
  contributionTimeline: ContributionTimelinePoint[];
  contributionScores: ContributionScore[];
  technicalShareRecommendation: TechnicalShareRecommendation[];
  methodology: string;
  limitations: string[];
  warnings: string[];
}

export interface ContributionEvidence {
  analysisId: string;
  generatedAt: string;
  contributorAliases: Array<{
    contributorId: string;
    name: string;
    aliases: string[];
    emails: string[];
    identityConfidence: number;
  }>;
  referencedCommits: EvidenceCommit[];
  featureGrouping: Array<{
    featureId: string;
    reason: string;
    signals: string[];
    confidence: number;
  }>;
  ownershipEvidence: Array<{
    featureId: string;
    contributorId: string;
    reason: string;
  }>;
  complexityIndicators: string[];
  consistencyPeriods: Array<{
    contributorId: string;
    activePeriods: number;
    totalPeriods: number;
  }>;
  qualityIndicators: string[];
  excludedActivity: ExcludedActivity[];
  scoringCalculations: ContributionScore[];
  warnings: string[];
  limitations: string[];
}

export interface EvidenceCommit {
  hash: string;
  repository: string;
  author: string;
  date: string;
  message: string;
  filesChanged: number;
  included: boolean;
  exclusionReason?: string;
}

export interface ExcludedActivity {
  hash: string;
  repository: string;
  reason: string;
}
