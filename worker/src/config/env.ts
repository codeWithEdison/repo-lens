/**
 * Validated environment configuration for the analysis worker.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";
import { DEFAULTS, DEFAULT_ALLOWED_GIT_HOSTS } from "@shared/constants/index.js";

// Load the repository-root .env regardless of process cwd so the worker shares
// configuration and the workspace with the API server.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
dotenv.config({ path: path.join(repoRoot, ".env") });

const csv = (value: string | undefined, fallback: string[]): string[] => {
  if (!value) return fallback;
  return value
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
};

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  REDIS_HOST: z.string().default("127.0.0.1"),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional().default(""),

  WORKSPACE_ROOT: z.string().default("./workspace"),
  ANALYSIS_RETENTION_HOURS: z.coerce.number().positive().default(DEFAULTS.analysisRetentionHours),
  CLEANUP_INTERVAL_MINUTES: z.coerce.number().positive().default(DEFAULTS.cleanupIntervalMinutes),
  STALE_ANALYSIS_HOURS: z.coerce.number().positive().default(DEFAULTS.staleAnalysisHours),

  ANALYSIS_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  MAX_REPOSITORIES_PER_ANALYSIS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULTS.maxRepositoriesPerAnalysis),
  MAX_REPOSITORY_SIZE_MB: z.coerce.number().positive().default(500),
  MAX_FILES_PER_REPOSITORY: z.coerce.number().int().positive().default(50000),
  MAX_ANALYSIS_DURATION_MINUTES: z.coerce.number().positive().default(30),
  GIT_CLONE_TIMEOUT_MINUTES: z.coerce.number().positive().default(10),
  GIT_CLONE_DEPTH: z.coerce.number().int().nonnegative().default(0),
  GIT_MAX_COMMITS: z.coerce.number().int().positive().default(5000),

  ALLOWED_GIT_HOSTS: z.string().optional(),
  ALLOW_PRIVATE_REPOSITORIES: bool,

  AI_PROVIDER: z.enum(["none", "openai-compatible"]).default("none"),
  AI_BASE_URL: z.string().optional().default(""),
  AI_API_KEY: z.string().optional().default(""),
  AI_MODEL: z.string().optional().default(""),

  GITHUB_TOKEN: z.string().optional().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid worker configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const raw = parsed.data;

const resolvedWorkspaceRoot = path.isAbsolute(raw.WORKSPACE_ROOT)
  ? raw.WORKSPACE_ROOT
  : path.resolve(repoRoot, raw.WORKSPACE_ROOT);

export const env = {
  ...raw,
  WORKSPACE_ROOT: resolvedWorkspaceRoot,
  isProduction: raw.NODE_ENV === "production",
  allowedGitHosts: csv(raw.ALLOWED_GIT_HOSTS, [...DEFAULT_ALLOWED_GIT_HOSTS]),
} as const;

export type Env = typeof env;
