import { describe, it, expect, beforeAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import type { AnalysisMetadata } from "@shared/types/index.js";

const TMP_ROOT = path.join(os.tmpdir(), `repolens-cleanup-${Date.now()}`);

// Configure the workspace root before importing modules that read env.
process.env.WORKSPACE_ROOT = TMP_ROOT;
process.env.STALE_ANALYSIS_HOURS = "6";

function metadata(id: string, patch: Partial<AnalysisMetadata>): AnalysisMetadata {
  const now = new Date().toISOString();
  return {
    analysisId: id,
    createdAt: now,
    updatedAt: now,
    expiresAt: now,
    status: "completed",
    repositories: [],
    reportReady: true,
    exportsReady: true,
    error: null,
    ...patch,
  };
}

describe("cleanup expiration", () => {
  let workspace: typeof import("../src/services/workspace.js")["workspace"];
  let runCleanup: typeof import("../src/cleanup/cleanupService.js")["runCleanup"];
  let generateAnalysisId: typeof import("@shared/workspace/ids.js")["generateAnalysisId"];

  beforeAll(async () => {
    ({ workspace } = await import("../src/services/workspace.js"));
    ({ runCleanup } = await import("../src/cleanup/cleanupService.js"));
    ({ generateAnalysisId } = await import("@shared/workspace/ids.js"));
    await workspace.ensureRoot();
  });

  it("deletes expired, keeps fresh, removes stale in-progress", async () => {
    const now = Date.now();
    const hour = 3600 * 1000;

    const expired = generateAnalysisId();
    await workspace.createWorkspace(expired);
    await workspace.writeMetadata(
      expired,
      metadata(expired, { expiresAt: new Date(now - hour).toISOString() }),
    );

    const fresh = generateAnalysisId();
    await workspace.createWorkspace(fresh);
    await workspace.writeMetadata(
      fresh,
      metadata(fresh, { expiresAt: new Date(now + 24 * hour).toISOString() }),
    );

    const stale = generateAnalysisId();
    await workspace.createWorkspace(stale);
    await workspace.writeMetadata(
      stale,
      metadata(stale, {
        status: "running",
        expiresAt: new Date(now + 24 * hour).toISOString(),
        updatedAt: new Date(now - 12 * hour).toISOString(),
      }),
    );

    const summary = await runCleanup(now);

    expect(await workspace.workspaceExists(expired)).toBe(false);
    expect(await workspace.workspaceExists(fresh)).toBe(true);
    expect(await workspace.workspaceExists(stale)).toBe(false);
    expect(summary.deleted).toBeGreaterThanOrEqual(2);

    await fs.rm(TMP_ROOT, { recursive: true, force: true });
  });
});
