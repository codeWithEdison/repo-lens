import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";
import { ERROR_CODES } from "@shared/constants/index.js";
import type { ApiErrorResponse } from "@shared/contracts/index.js";

const body: ApiErrorResponse = {
  error: {
    code: ERROR_CODES.RATE_LIMITED,
    message: "Too many requests. Please slow down and try again later.",
    details: null,
  },
};

export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: body,
});

/** Stricter limit for the expensive create-analysis endpoint. */
export const createAnalysisRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: Math.max(5, Math.floor(env.RATE_LIMIT_MAX / 5)),
  standardHeaders: true,
  legacyHeaders: false,
  message: body,
});
