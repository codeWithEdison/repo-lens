/**
 * Shared constants: error codes, workspace filenames, stage ordering and
 * default limits used by the API server, the worker and the frontend.
 */

import type { AnalysisStage } from "../types/index.js";

export const ERROR_CODES = {
  INVALID_REQUEST: "INVALID_REQUEST",
  INVALID_REPOSITORY_URL: "INVALID_REPOSITORY_URL",
  UNSUPPORTED_REPOSITORY_PROVIDER: "UNSUPPORTED_REPOSITORY_PROVIDER",
  TOO_MANY_REPOSITORIES: "TOO_MANY_REPOSITORIES",
  DUPLICATE_REPOSITORY: "DUPLICATE_REPOSITORY",
  ANALYSIS_NOT_FOUND: "ANALYSIS_NOT_FOUND",
  ANALYSIS_NOT_READY: "ANALYSIS_NOT_READY",
  ANALYSIS_FAILED: "ANALYSIS_FAILED",
  ANALYSIS_EXPIRED: "ANALYSIS_EXPIRED",
  EXPORT_NOT_READY: "EXPORT_NOT_READY",
  QUEUE_UNAVAILABLE: "QUEUE_UNAVAILABLE",
  REPOSITORY_CLONE_FAILED: "REPOSITORY_CLONE_FAILED",
  REPOSITORY_TOO_LARGE: "REPOSITORY_TOO_LARGE",
  PRIVATE_REPOSITORIES_DISABLED: "PRIVATE_REPOSITORIES_DISABLED",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Files that live inside every analysis workspace. */
export const WORKSPACE_FILES = {
  metadata: "metadata.json",
  progress: "progress.json",
  report: "report.json",
  evidence: "evidence.json",
  logs: "logs.json",
} as const;

export const WORKSPACE_DIRS = {
  repositories: "repositories",
  exports: "exports",
} as const;

export const EXPORT_FILES = {
  pdf: "report.pdf",
  csv: "report.csv",
  json: "report.json",
} as const;

/** Queue names shared between the producer (server) and consumer (worker). */
export const QUEUE_NAMES = {
  repositoryAnalysis: "repository-analysis",
  workspaceCleanup: "workspace-cleanup",
} as const;

export const ANALYSIS_ID_PREFIX = "analysis_";

/**
 * Ordered pipeline stages with the overall progress percentage reached at the
 * END of each stage. Progress is derived from real stage completion, never
 * from timers, and never moves backward.
 */
export const STAGE_PROGRESS: Array<{ stage: AnalysisStage; progress: number }> = [
  { stage: "Queued", progress: 0 },
  { stage: "Preparing Workspace", progress: 5 },
  { stage: "Cloning Repositories", progress: 25 },
  { stage: "Reading Git History", progress: 45 },
  { stage: "Inspecting Project Structure", progress: 60 },
  { stage: "Analyzing Contributors", progress: 70 },
  { stage: "Detecting Features", progress: 80 },
  { stage: "Calculating Contribution", progress: 88 },
  { stage: "Generating Report", progress: 93 },
  { stage: "Generating Exports", progress: 98 },
  { stage: "Cleaning Temporary Repositories", progress: 99 },
  { stage: "Completed", progress: 100 },
];

export function progressForStage(stage: AnalysisStage): number {
  const entry = STAGE_PROGRESS.find((s) => s.stage === stage);
  return entry ? entry.progress : 0;
}

export const DEFAULT_ALLOWED_GIT_HOSTS = [
  "github.com",
  "gitlab.com",
  "bitbucket.org",
] as const;

export const DEFAULTS = {
  maxRepositoriesPerAnalysis: 5,
  analysisRetentionHours: 24,
  cleanupIntervalMinutes: 60,
  staleAnalysisHours: 6,
} as const;
