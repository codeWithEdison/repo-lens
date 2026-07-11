/**
 * AnalysisService — orchestrates the creation, retrieval and deletion of
 * analyses. It validates input, provisions the workspace, writes initial
 * metadata/progress and enqueues the analysis job. It never performs analysis
 * inside the HTTP request.
 */

import { workspace } from "./workspace.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { AppError } from "../errors/AppError.js";
import { getAnalysisQueue, type AnalysisJobData } from "../config/queue.js";
import { pingRedis } from "../config/redis.js";

import { createAnalysisSchema } from "@shared/schemas/index.js";
import {
  validateRepositoryUrl,
  normalizeForComparison,
  RepoUrlError,
} from "@shared/git/repoUrl.js";
import { generateAnalysisId } from "@shared/workspace/ids.js";
import { createInitialProgress } from "@shared/workspace/progress.js";
import { ERROR_CODES } from "@shared/constants/index.js";
import type {
  AnalysisMetadata,
  AnalysisMetadataRepository,
} from "@shared/types/index.js";
import type {
  CreateAnalysisResponse,
} from "@shared/contracts/index.js";

interface PreparedRepo {
  meta: AnalysisMetadataRepository;
  job: AnalysisJobData["repositories"][number];
}

export async function createAnalysis(rawBody: unknown): Promise<CreateAnalysisResponse> {
  const parsed = createAnalysisSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw AppError.badRequest("Invalid request payload.", parsed.error.flatten());
  }

  const { repositories } = parsed.data;

  if (repositories.length > env.MAX_REPOSITORIES_PER_ANALYSIS) {
    throw new AppError(
      400,
      ERROR_CODES.TOO_MANY_REPOSITORIES,
      `A maximum of ${env.MAX_REPOSITORIES_PER_ANALYSIS} repositories can be analyzed at once.`,
    );
  }

  const seen = new Set<string>();
  const usedDirNames = new Set<string>();
  const prepared: PreparedRepo[] = [];

  for (const repo of repositories) {
    const comparison = normalizeForComparison(repo.url);
    if (seen.has(comparison)) {
      throw new AppError(
        400,
        ERROR_CODES.DUPLICATE_REPOSITORY,
        `Duplicate repository URL: ${repo.url}`,
      );
    }
    seen.add(comparison);

    let validated;
    try {
      validated = validateRepositoryUrl(repo.url, { allowedHosts: env.allowedGitHosts });
    } catch (err) {
      if (err instanceof RepoUrlError) {
        const status = err.code === "UNSUPPORTED_REPOSITORY_PROVIDER" ? 400 : 400;
        throw new AppError(status, err.code, err.message);
      }
      throw err;
    }

    // Ensure a unique display name for progress readability.
    let name = validated.displayName;
    let suffix = 1;
    while (usedDirNames.has(name)) {
      name = `${validated.displayName} (${suffix++})`;
    }
    usedDirNames.add(name);

    prepared.push({
      meta: {
        name,
        provider: validated.provider,
        url: validated.cleanUrl,
        branch: repo.branch,
      },
      job: {
        name,
        url: validated.cleanUrl,
        cleanUrl: validated.cleanUrl,
        provider: validated.provider,
        branch: repo.branch,
        accessToken: repo.accessToken,
      },
    });
  }

  const redisUp = await pingRedis();
  if (!redisUp) {
    throw AppError.queueUnavailable();
  }

  const analysisId = generateAnalysisId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.ANALYSIS_RETENTION_HOURS * 3600 * 1000);

  await workspace.createWorkspace(analysisId);

  const metadata: AnalysisMetadata = {
    analysisId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    status: "queued",
    repositories: prepared.map((p) => p.meta),
    reportReady: false,
    exportsReady: false,
    error: null,
  };
  await workspace.writeMetadata(analysisId, metadata);

  await workspace.writeProgress(
    analysisId,
    createInitialProgress(
      analysisId,
      prepared.map((p) => ({ name: p.meta.name, url: p.meta.url })),
    ),
  );

  try {
    await getAnalysisQueue().add(
      "analyze",
      { analysisId, repositories: prepared.map((p) => p.job) },
      { jobId: analysisId },
    );
  } catch (err) {
    logger.error({ err, analysisId }, "Failed to enqueue analysis job");
    // Roll back the workspace so we don't leave an orphan that never runs.
    await workspace.deleteWorkspace(analysisId).catch(() => undefined);
    throw AppError.queueUnavailable("Failed to queue the analysis job.");
  }

  logger.info({ analysisId, repos: prepared.length }, "Analysis queued");

  return {
    analysisId,
    status: "queued",
    progressUrl: `/api/progress/${analysisId}`,
    reportUrl: `/api/report/${analysisId}`,
  };
}

/** Delete an analysis workspace and best-effort cancel a pending/running job. */
export async function deleteAnalysis(analysisId: string): Promise<void> {
  // Best effort: remove the queued/active job so the worker won't recreate
  // files. Only attempt this when Redis is reachable so deletion never hangs.
  if (await pingRedis()) {
    try {
      const queue = getAnalysisQueue();
      const job = await queue.getJob(analysisId);
      if (job) {
        // The worker checks workspace existence between stages; removing the job
        // and the workspace prevents it from recreating files.
        await job.remove().catch(() => undefined);
      }
    } catch (err) {
      logger.warn({ err, analysisId }, "Could not remove job during delete (continuing)");
    }
  }

  await workspace.deleteWorkspace(analysisId);
}
