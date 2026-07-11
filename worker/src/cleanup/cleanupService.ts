/**
 * Automatic workspace cleanup.
 *
 * Periodically scans the workspace root and deletes expired analyses. Actively
 * running analyses are preserved unless they exceed a separate stale timeout.
 * Orphaned / incomplete workspaces older than the stale threshold are removed.
 */

import fsp from "node:fs/promises";
import { workspace } from "../services/workspace.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

export interface CleanupSummary {
  scanned: number;
  deleted: number;
  errors: number;
}

export async function runCleanup(now: number = Date.now()): Promise<CleanupSummary> {
  const summary: CleanupSummary = { scanned: 0, deleted: 0, errors: 0 };
  const staleMs = env.STALE_ANALYSIS_HOURS * 3600 * 1000;

  let ids: string[];
  try {
    ids = await workspace.listWorkspaceIds();
  } catch (err) {
    logger.error({ err }, "Cleanup: failed to list workspaces");
    return summary;
  }

  for (const id of ids) {
    summary.scanned++;
    try {
      const shouldDelete = await isExpired(id, now, staleMs);
      if (shouldDelete) {
        await workspace.deleteWorkspace(id);
        summary.deleted++;
        logger.info({ analysisId: id }, "Cleanup: deleted expired workspace");
      }
    } catch (err) {
      summary.errors++;
      logger.warn({ err, analysisId: id }, "Cleanup: failed to process workspace (continuing)");
    }
  }

  if (summary.deleted > 0 || summary.errors > 0) {
    logger.info(summary, "Cleanup run complete");
  }
  return summary;
}

async function isExpired(id: string, now: number, staleMs: number): Promise<boolean> {
  const metadata = await workspace.readMetadata(id);

  if (!metadata) {
    // Orphaned / incomplete workspace: delete if older than the stale threshold.
    const dirMtime = await workspaceMtime(id);
    return dirMtime !== null && now - dirMtime > staleMs;
  }

  const expiresAt = new Date(metadata.expiresAt).getTime();
  if (!Number.isNaN(expiresAt) && expiresAt < now) {
    return true;
  }

  // Stuck running/queued analyses that stopped updating.
  if (metadata.status === "running" || metadata.status === "queued") {
    const updatedAt = new Date(metadata.updatedAt).getTime();
    if (!Number.isNaN(updatedAt) && now - updatedAt > staleMs) {
      logger.warn({ analysisId: id }, "Cleanup: removing stale in-progress analysis");
      return true;
    }
  }

  return false;
}

async function workspaceMtime(id: string): Promise<number | null> {
  try {
    const stat = await fsp.stat(workspace.getWorkspacePath(id));
    return stat.mtimeMs;
  } catch {
    return null;
  }
}

let timer: NodeJS.Timeout | null = null;

export function startCleanupScheduler(): void {
  const intervalMs = env.CLEANUP_INTERVAL_MINUTES * 60 * 1000;
  // Run once shortly after boot, then on the configured interval.
  setTimeout(() => void runCleanup(), 10000);
  timer = setInterval(() => void runCleanup(), intervalMs);
  logger.info({ intervalMinutes: env.CLEANUP_INTERVAL_MINUTES }, "Cleanup scheduler started");
}

export function stopCleanupScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
