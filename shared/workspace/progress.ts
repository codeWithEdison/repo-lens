/**
 * Helpers for constructing and safely mutating progress objects.
 * Progress values never move backward and stay within 0..100.
 */

import type {
  AnalysisProgress,
  AnalysisStage,
  AnalysisStatus,
  RepositoryProgress,
  AnalysisError,
} from "../types/index.js";
import { clamp } from "../scoring/index.js";

export function createInitialProgress(
  analysisId: string,
  repositories: Array<{ name: string; url: string }>,
): AnalysisProgress {
  const now = new Date().toISOString();
  return {
    analysisId,
    status: "queued",
    overallProgress: 0,
    currentStage: "Queued",
    message: "Analysis queued and waiting for a worker.",
    repositories: repositories.map((r) => ({
      name: r.name,
      url: r.url,
      progress: 0,
      status: "queued",
    })),
    startedAt: null,
    updatedAt: now,
    completedAt: null,
    error: null,
  };
}

export interface ProgressUpdate {
  status?: AnalysisStatus;
  overallProgress?: number;
  currentStage?: AnalysisStage;
  message?: string;
  repositories?: RepositoryProgress[];
  startedAt?: string | null;
  completedAt?: string | null;
  error?: AnalysisError | null;
}

/** Merge an update into existing progress without regressing overallProgress. */
export function applyProgressUpdate(
  current: AnalysisProgress,
  update: ProgressUpdate,
): AnalysisProgress {
  const nextOverall =
    update.overallProgress !== undefined
      ? Math.max(current.overallProgress, clamp(update.overallProgress, 0, 100))
      : current.overallProgress;

  return {
    ...current,
    ...update,
    overallProgress: nextOverall,
    repositories: update.repositories ?? current.repositories,
    updatedAt: new Date().toISOString(),
  };
}
