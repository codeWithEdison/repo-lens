import { describe, it, expect, beforeAll, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { WorkspaceService } from "@shared/workspace/workspaceService.js";
import { generateAnalysisId } from "@shared/workspace/ids.js";
import { createInitialProgress } from "@shared/workspace/progress.js";
import type { AnalysisMetadata } from "@shared/types/index.js";

const ROOT = path.join(os.tmpdir(), `repolens-ws-${Date.now()}`);
const ws = new WorkspaceService(ROOT);

beforeAll(async () => {
  await ws.ensureRoot();
});

afterAll(async () => {
  await fs.rm(ROOT, { recursive: true, force: true });
});

function metadata(id: string): AnalysisMetadata {
  const now = new Date().toISOString();
  return {
    analysisId: id,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    status: "queued",
    repositories: [],
    reportReady: false,
    exportsReady: false,
    error: null,
  };
}

describe("WorkspaceService", () => {
  it("creates a workspace and reports existence", async () => {
    const id = generateAnalysisId();
    await ws.createWorkspace(id);
    expect(await ws.workspaceExists(id)).toBe(true);
  });

  it("writes and reads metadata atomically (round-trip)", async () => {
    const id = generateAnalysisId();
    await ws.createWorkspace(id);
    const md = metadata(id);
    await ws.writeMetadata(id, md);
    const read = await ws.readMetadata(id);
    expect(read?.analysisId).toBe(id);

    // No temp files should linger after atomic writes.
    const entries = await fs.readdir(ws.getWorkspacePath(id));
    expect(entries.some((e) => e.startsWith(".tmp-"))).toBe(false);
  });

  it("writes/reads progress and appends logs", async () => {
    const id = generateAnalysisId();
    await ws.createWorkspace(id);
    await ws.writeProgress(id, createInitialProgress(id, [{ name: "r", url: "u" }]));
    const p = await ws.readProgress(id);
    expect(p?.overallProgress).toBe(0);

    await ws.appendLog(id, {
      timestamp: new Date().toISOString(),
      level: "info",
      stage: "Queued",
      message: "hi",
    });
    await ws.appendLog(id, {
      timestamp: new Date().toISOString(),
      level: "info",
      stage: "Queued",
      message: "there",
    });
    const logs = await ws.readLogs(id);
    expect(logs.length).toBe(2);
  });

  it("deletes only the repositories directory", async () => {
    const id = generateAnalysisId();
    await ws.createWorkspace(id);
    await ws.createRepositoriesDir(id);
    const repoDir = ws.getRepositoryPath(id, "sample-0");
    await fs.mkdir(repoDir, { recursive: true });
    await fs.writeFile(path.join(repoDir, "file.txt"), "x");

    await ws.deleteRepositoriesDirectory(id);
    expect(await ws.workspaceExists(id)).toBe(true);
    await expect(fs.access(ws.getRepositoriesDir(id))).rejects.toThrow();
  });

  it("deletes the whole workspace and is idempotent", async () => {
    const id = generateAnalysisId();
    await ws.createWorkspace(id);
    await ws.deleteWorkspace(id);
    expect(await ws.workspaceExists(id)).toBe(false);
    await expect(ws.deleteWorkspace(id)).resolves.toBeUndefined();
  });

  it("lists only valid workspace ids", async () => {
    const id = generateAnalysisId();
    await ws.createWorkspace(id);
    await fs.mkdir(path.join(ROOT, "not-an-analysis"), { recursive: true });
    const ids = await ws.listWorkspaceIds();
    expect(ids).toContain(id);
    expect(ids).not.toContain("not-an-analysis");
  });

  it("rejects export access for invalid ids via path validation", () => {
    expect(() => ws.getWorkspacePath("../evil")).toThrow();
  });
});
