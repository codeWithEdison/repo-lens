/**
 * Validated environment configuration for the API server.
 * Fails fast on startup when required settings are invalid.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";
import { DEFAULTS, DEFAULT_ALLOWED_GIT_HOSTS } from "@shared/constants/index.js";

// Always load the repository-root .env, regardless of the process cwd, so the
// API server and worker share the same configuration and workspace.
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
  SERVER_PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_ORIGIN: z.string().default("http://localhost:5173"),

  REDIS_HOST: z.string().default("127.0.0.1"),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional().default(""),

  WORKSPACE_ROOT: z.string().default("./workspace"),
  ANALYSIS_RETENTION_HOURS: z.coerce.number().positive().default(DEFAULTS.analysisRetentionHours),

  MAX_REPOSITORIES_PER_ANALYSIS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULTS.maxRepositoriesPerAnalysis),

  ANALYSIS_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),

  ALLOWED_GIT_HOSTS: z.string().optional(),
  ALLOW_PRIVATE_REPOSITORIES: bool,

  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().positive().default(15),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  MAX_REQUEST_BODY_KB: z.coerce.number().int().positive().default(64),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid server configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const raw = parsed.data;

// Resolve WORKSPACE_ROOT against the repo root when it is a relative path so all
// processes agree on the same absolute location.
const resolvedWorkspaceRoot = path.isAbsolute(raw.WORKSPACE_ROOT)
  ? raw.WORKSPACE_ROOT
  : path.resolve(repoRoot, raw.WORKSPACE_ROOT);

export const env = {
  ...raw,
  WORKSPACE_ROOT: resolvedWorkspaceRoot,
  isProduction: raw.NODE_ENV === "production",
  allowedGitHosts: csv(raw.ALLOWED_GIT_HOSTS, [...DEFAULT_ALLOWED_GIT_HOSTS]),
  corsOrigins: raw.FRONTEND_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean),
} as const;

export type Env = typeof env;
