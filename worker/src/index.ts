/**
 * RepoLens analysis worker.
 *
 * Consumes repository-analysis jobs from BullMQ, runs the staged pipeline, and
 * periodically cleans up expired workspaces. The filesystem is the source of
 * truth for progress/report data; Redis is only used for queue coordination.
 */

import { Worker, type Job } from "bullmq";
import { QUEUE_NAMES } from "@shared/constants/index.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { redisConnectionOptions, closeRedis } from "./config/redis.js";
import { workspace } from "./services/workspace.js";
import { runAnalysisJob, type AnalysisJobPayload } from "./jobs/analysisJob.js";
import { startCleanupScheduler, stopCleanupScheduler } from "./cleanup/cleanupService.js";
import { ERROR_CODES } from "@shared/constants/index.js";

async function main(): Promise<void> {
  await workspace.ensureRoot();

  const worker = new Worker<AnalysisJobPayload>(
    QUEUE_NAMES.repositoryAnalysis,
    async (job: Job<AnalysisJobPayload>) => {
      logger.info({ analysisId: job.data.analysisId }, "Processing analysis job");
      await runAnalysisJob(job.data);
    },
    {
      connection: redisConnectionOptions,
      concurrency: env.ANALYSIS_WORKER_CONCURRENCY,
      lockDuration: env.MAX_ANALYSIS_DURATION_MINUTES * 60 * 1000,
    },
  );

  worker.on("completed", (job) => {
    logger.info({ analysisId: job.data.analysisId }, "Analysis job completed");
  });

  worker.on("failed", (job, err) => {
    const analysisId = job?.data?.analysisId;
    logger.error({ analysisId, err }, "Analysis job failed");
    // Best-effort: ensure metadata reflects failure when no retries remain.
    if (analysisId && job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      void workspace
        .workspaceExists(analysisId)
        .then((exists) => {
          if (!exists) return;
          return workspace.updateMetadata(analysisId, {
            status: "failed",
            error: { code: ERROR_CODES.INTERNAL_ERROR, message: err.message },
          });
        })
        .catch(() => undefined);
    }
  });

  worker.on("stalled", (jobId) => {
    logger.warn({ jobId }, "Analysis job stalled");
  });

  worker.on("error", (err) => {
    logger.error({ err }, "Worker error");
  });

  logger.info(
    { concurrency: env.ANALYSIS_WORKER_CONCURRENCY, workspace: workspace.getRoot() },
    "RepoLens worker started",
  );

  startCleanupScheduler();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutting down worker");
    stopCleanupScheduler();
    await worker.close();
    await closeRedis();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "Fatal error starting worker");
  process.exit(1);
});
