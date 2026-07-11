import { Queue } from "bullmq";
import { QUEUE_NAMES } from "@shared/constants/index.js";
import { redisConnectionOptions } from "./redis.js";

export interface AnalysisJobData {
  analysisId: string;
  /**
   * Repository connection info. Access tokens are passed through the queue to
   * the worker for cloning private repos, but are NEVER written to any file.
   */
  repositories: Array<{
    name: string;
    url: string;
    cleanUrl: string;
    provider: string;
    branch?: string;
    accessToken?: string;
  }>;
}

let analysisQueue: Queue<AnalysisJobData> | null = null;

export function getAnalysisQueue(): Queue<AnalysisJobData> {
  if (!analysisQueue) {
    analysisQueue = new Queue<AnalysisJobData>(QUEUE_NAMES.repositoryAnalysis, {
      connection: redisConnectionOptions,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 24 * 3600, count: 100 },
      },
    });
  }
  return analysisQueue;
}

export async function closeQueues(): Promise<void> {
  if (analysisQueue) {
    await analysisQueue.close().catch(() => undefined);
    analysisQueue = null;
  }
}
