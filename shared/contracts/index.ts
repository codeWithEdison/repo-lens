/**
 * API request/response contracts shared between frontend and backend.
 */

import type { AnalysisStatus, RepositoryInput } from "../types/index.js";
import type { ErrorCode } from "../constants/index.js";

export interface CreateAnalysisRequest {
  repositories: RepositoryInput[];
}

export interface CreateAnalysisResponse {
  analysisId: string;
  status: AnalysisStatus;
  progressUrl: string;
  reportUrl: string;
}

export interface DeleteAnalysisResponse {
  analysisId: string;
  deleted: boolean;
}

export interface ApiErrorResponse {
  error: {
    code: ErrorCode | string;
    message: string;
    details: unknown | null;
  };
}

/** Server-Sent Event payload names used by the progress stream. */
export const SSE_EVENTS = {
  progress: "progress",
  heartbeat: "heartbeat",
  done: "done",
  error: "error",
} as const;
