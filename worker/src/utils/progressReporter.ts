/**
 * ProgressReporter centralizes all progress.json + logs.json + metadata writes
 * during a pipeline run, ensuring progress never regresses and that the
 * workspace stays consistent.
 */

import { workspace } from "../services/workspace.js";
import { logger } from "../config/logger.js";
import { progressForStage } from "@shared/constants/index.js";
import {
  applyProgressUpdate,
  createInitialProgress,
} from "@shared/workspace/progress.js";
import type {
  AnalysisProgress,
  AnalysisStage,
  AnalysisStatus,
  AnalysisLogEntry,
  LogLevel,
  RepositoryProgress,
  AnalysisError,
} from "@shared/types/index.js";

export class ProgressReporter {
  private progress: AnalysisProgress | null = null;

  constructor(private readonly analysisId: string) {}

  async init(repositories: Array<{ name: string; url: string }>): Promise<void> {
    const existing = await workspace.readProgress(this.analysisId);
    this.progress =
      existing ?? createInitialProgress(this.analysisId, repositories);
    this.progress = applyProgressUpdate(this.progress, {
      status: "running",
      startedAt: this.progress.startedAt ?? new Date().toISOString(),
    });
    await this.flush();
  }

  private async flush(): Promise<void> {
    if (this.progress) {
      await workspace.writeProgress(this.analysisId, this.progress);
    }
  }

  getRepositories(): RepositoryProgress[] {
    return this.progress?.repositories ?? [];
  }

  async stage(stage: AnalysisStage, message: string): Promise<void> {
    if (!this.progress) return;
    this.progress = applyProgressUpdate(this.progress, {
      status: "running",
      currentStage: stage,
      message,
      overallProgress: progressForStage(stage),
    });
    await this.flush();
    await this.log("info", stage, message);
  }

  async setRepositoryProgress(
    name: string,
    update: Partial<RepositoryProgress>,
  ): Promise<void> {
    if (!this.progress) return;
    const repos = this.progress.repositories.map((r) =>
      r.name === name
        ? { ...r, ...update, progress: Math.max(r.progress, update.progress ?? r.progress) }
        : r,
    );
    this.progress = applyProgressUpdate(this.progress, { repositories: repos });
    await this.flush();
  }

  async complete(): Promise<void> {
    if (!this.progress) return;
    const repos = this.progress.repositories.map((r) => ({
      ...r,
      progress: r.status === "failed" ? r.progress : 100,
      status: r.status === "failed" ? r.status : ("completed" as const),
    }));
    this.progress = applyProgressUpdate(this.progress, {
      status: "completed",
      currentStage: "Completed",
      message: "Analysis complete. Report and exports are ready.",
      overallProgress: 100,
      completedAt: new Date().toISOString(),
      repositories: repos,
    });
    await this.flush();
    await this.log("info", "Completed", "Analysis completed successfully.");
  }

  async fail(error: AnalysisError): Promise<void> {
    if (!this.progress) {
      this.progress = createInitialProgress(this.analysisId, []);
    }
    this.progress = applyProgressUpdate(this.progress, {
      status: "failed",
      currentStage: "Failed",
      message: error.message,
      error,
      completedAt: new Date().toISOString(),
    });
    await this.flush();
    await this.log("error", "Failed", error.message, { code: error.code });
  }

  async log(
    level: LogLevel,
    stage: AnalysisStage | string,
    message: string,
    details?: unknown,
    repository?: string,
    durationMs?: number,
  ): Promise<void> {
    const entry: AnalysisLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      stage,
      message,
      repository,
      durationMs,
      details: details ?? null,
    };
    try {
      await workspace.appendLog(this.analysisId, entry);
    } catch (err) {
      logger.warn({ err, analysisId: this.analysisId }, "Failed to append log entry");
    }
    logger[level === "warning" ? "warn" : level](
      { analysisId: this.analysisId, stage, repository },
      message,
    );
  }

  currentStatus(): AnalysisStatus {
    return this.progress?.status ?? "queued";
  }
}
