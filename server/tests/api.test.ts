import { describe, it, expect, beforeAll, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import request from "supertest";
import type { Express } from "express";
import type { AnalysisMetadata, ContributionReport } from "@shared/types/index.js";

const ROOT = path.join(os.tmpdir(), `repolens-api-${Date.now()}`);
process.env.WORKSPACE_ROOT = ROOT;
process.env.RATE_LIMIT_MAX = "1000";

let app: Express;
let ws: import("@shared/workspace/workspaceService.js").WorkspaceService;
let generateAnalysisId: typeof import("@shared/workspace/ids.js")["generateAnalysisId"];

beforeAll(async () => {
  const { createApp } = await import("../src/app.js");
  const { WorkspaceService } = await import("@shared/workspace/workspaceService.js");
  ({ generateAnalysisId } = await import("@shared/workspace/ids.js"));
  app = createApp();
  ws = new WorkspaceService(ROOT);
  await ws.ensureRoot();
});

afterAll(async () => {
  await fs.rm(ROOT, { recursive: true, force: true });
});

function completedMetadata(id: string): AnalysisMetadata {
  const now = new Date().toISOString();
  return {
    analysisId: id,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    status: "completed",
    repositories: [{ name: "x/y", provider: "github", url: "https://github.com/x/y.git" }],
    reportReady: true,
    exportsReady: true,
    error: null,
  };
}

function minimalReport(id: string): ContributionReport {
  return {
    analysisId: id,
    generatedAt: new Date().toISOString(),
    repositories: [],
    projectSummary: "summary",
    technologies: {
      languages: [],
      frameworks: [],
      architecture: "single repo",
      projectSize: "0 files",
      modules: 0,
      dependencies: 0,
      complexity: "Low",
    },
    contributors: [],
    contributorRanking: [],
    detectedFeatures: [],
    featureOwnership: [],
    contributionTimeline: [],
    contributionScores: [],
    technicalShareRecommendation: [],
    methodology: "m",
    limitations: [],
    warnings: [],
  };
}

describe("API validation", () => {
  it("rejects an invalid body", async () => {
    const res = await request(app).post("/api/analyses").send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_REQUEST");
  });

  it("rejects too many repositories", async () => {
    const repositories = Array.from({ length: 6 }, (_, i) => ({
      url: `https://github.com/org/repo${i}`,
    }));
    const res = await request(app).post("/api/analyses").send({ repositories });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("TOO_MANY_REPOSITORIES");
  });

  it("rejects duplicate repositories", async () => {
    const res = await request(app)
      .post("/api/analyses")
      .send({
        repositories: [
          { url: "https://github.com/org/repo" },
          { url: "https://github.com/org/repo.git" },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("DUPLICATE_REPOSITORY");
  });

  it("rejects invalid repository URLs", async () => {
    const res = await request(app)
      .post("/api/analyses")
      .send({ repositories: [{ url: "http://localhost/a/b" }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_REPOSITORY_URL");
  });
});

describe("API lifecycle", () => {
  it("returns 400 for an invalid analysis id", async () => {
    const res = await request(app).get("/api/progress/not-valid");
    expect(res.status).toBe(400);
  });

  it("returns 404 for a missing analysis", async () => {
    const id = generateAnalysisId();
    const res = await request(app).get(`/api/progress/${id}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ANALYSIS_NOT_FOUND");
  });

  it("returns 404 for a missing report", async () => {
    const id = generateAnalysisId();
    const res = await request(app).get(`/api/report/${id}`);
    expect(res.status).toBe(404);
  });

  it("delete is idempotent for a missing analysis", async () => {
    const id = generateAnalysisId();
    const res = await request(app).delete(`/api/analysis/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(false);
  });

  it("serves report, export and deletes a completed analysis", async () => {
    const id = generateAnalysisId();
    await ws.createWorkspace(id);
    await ws.writeMetadata(id, completedMetadata(id));
    await ws.writeReport(id, minimalReport(id));
    await ws.writeExport(id, "json", JSON.stringify(minimalReport(id)));

    const report = await request(app).get(`/api/report/${id}`);
    expect(report.status).toBe(200);
    expect(report.body.analysisId).toBe(id);

    const exportRes = await request(app).get(`/api/export/json/${id}`);
    expect(exportRes.status).toBe(200);
    expect(exportRes.headers["content-type"]).toContain("application/json");

    const del = await request(app).delete(`/api/analysis/${id}`);
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(true);

    const after = await request(app).get(`/api/report/${id}`);
    expect(after.status).toBe(404);
  });

  it("returns 202 while a report is still generating", async () => {
    const id = generateAnalysisId();
    await ws.createWorkspace(id);
    await ws.writeMetadata(id, { ...completedMetadata(id), status: "running", reportReady: false });
    const res = await request(app).get(`/api/report/${id}`);
    expect(res.status).toBe(202);
  });
});
