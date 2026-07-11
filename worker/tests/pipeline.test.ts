import { describe, it, expect, beforeAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { simpleGit } from "simple-git";

import { readHistory } from "../src/git/history.js";
import { classifyCommit } from "../src/analyzers/commitClassification.js";
import { analyzeStructure } from "../src/analyzers/structure.js";
import { normalizeContributors } from "../src/analyzers/contributors.js";
import { detectFeatures } from "../src/analyzers/features.js";
import { scoreContributions } from "../src/scoring/scoreEngine.js";
import { buildReport } from "../src/reports/reportBuilder.js";
import { buildEvidence } from "../src/reports/evidenceBuilder.js";
import { buildCsv } from "../src/exports/csv.js";
import type { RepoAnalysis } from "../src/types.js";

const REPO = path.join(os.tmpdir(), `repolens-fixture-${Date.now()}`);

async function commitFile(
  git: ReturnType<typeof simpleGit>,
  file: string,
  content: string,
  message: string,
  author: string,
): Promise<void> {
  const full = path.join(REPO, file);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, "utf8");
  await git.add(".");
  await git.commit(message, undefined, { "--author": author });
}

describe("analysis pipeline (git fixture)", () => {
  let analysis: RepoAnalysis;

  beforeAll(async () => {
    await fs.mkdir(REPO, { recursive: true });
    const git = simpleGit(REPO);
    await git.init();
    await git.addConfig("user.name", "CI");
    await git.addConfig("user.email", "ci@test.local");
    await git.addConfig("commit.gpgsign", "false");
    await git.addConfig("init.defaultBranch", "main");

    await commitFile(
      git,
      "package.json",
      JSON.stringify({ name: "fixture", dependencies: { react: "^19.0.0" } }),
      "chore: init project",
      "Jane Dev <jane@example.com>",
    );
    await commitFile(
      git,
      "src/auth/login.ts",
      "export function login() { return true; }",
      "feat: add authentication login flow",
      "Jane Dev <jane@example.com>",
    );
    await commitFile(
      git,
      "src/auth/session.ts",
      "export function session() { return 'ok'; }",
      "feat: add authentication session handling",
      "Jane Dev <jane@example.com>",
    );
    await commitFile(
      git,
      "src/payments/checkout.ts",
      "export function checkout() { return 42; }",
      "feat: add payment checkout",
      "Bob Maker <bob@example.com>",
    );
    await commitFile(
      git,
      "src/payments/billing.test.ts",
      "test('billing', () => {});",
      "test: add billing tests",
      "Bob Maker <bob@example.com>",
    );

    const { commits, defaultBranch, branchAnalyzed } = await readHistory(simpleGit(REPO));
    const classified = commits.map(classifyCommit);
    const structure = await analyzeStructure(REPO);

    analysis = {
      job: { name: "fixture", url: "https://github.com/x/fixture", cleanUrl: "https://github.com/x/fixture.git", provider: "github" },
      summary: {
        name: "fixture",
        provider: "github",
        url: "https://github.com/x/fixture.git",
        defaultBranch,
        branchAnalyzed,
        commitCount: classified.length,
        contributorCount: new Set(classified.map((c) => c.author.email)).size,
        firstCommitAt: null,
        lastCommitAt: null,
        languages: structure.languages.map((l) => ({ name: l.name, files: l.files, pct: 0 })),
        frameworks: structure.frameworks,
        tags: [],
        hasTests: structure.hasTests,
        hasCi: structure.hasCi,
        hasDocker: structure.hasDocker,
        hasDocs: structure.hasDocs,
        fileCount: structure.fileCount,
      },
      commits: classified,
      structure,
      pullRequests: [],
      defaultBranch,
      branchAnalyzed,
    };
  }, 30000);

  it("extracts commits and detects React framework", () => {
    expect(analysis.commits.length).toBeGreaterThanOrEqual(5);
    expect(analysis.summary.frameworks).toContain("React");
  });

  it("normalizes two human contributors", () => {
    const index = normalizeContributors([analysis]);
    const humans = index.contributors.filter((c) => !c.isBot);
    expect(humans.length).toBe(2);
  });

  it("detects features and produces a report with normalized percentages", async () => {
    const index = normalizeContributors([analysis]);
    const features = detectFeatures([analysis], index);
    expect(features.length).toBeGreaterThan(0);

    const scoring = scoreContributions([analysis], features, index);
    const report = await buildReport("analysis_deadbeef", [analysis], features, scoring, index);

    expect(report.contributionScores.length).toBe(2);
    const total = report.contributionScores.reduce((s, r) => s + r.contributionPct, 0);
    expect(total).toBeCloseTo(100, 1);

    const evidence = buildEvidence("analysis_deadbeef", [analysis], report, index);
    expect(evidence.referencedCommits.length).toBeGreaterThan(0);

    const csv = buildCsv(report);
    expect(csv.split("\n")[0]).toContain("Contributor");
    expect(csv.split("\n").length).toBe(report.contributionScores.length + 1);
  });

  it("has no access tokens anywhere in the report", async () => {
    const index = normalizeContributors([analysis]);
    const features = detectFeatures([analysis], index);
    const scoring = scoreContributions([analysis], features, index);
    const report = await buildReport("analysis_deadbeef", [analysis], features, scoring, index);
    expect(JSON.stringify(report)).not.toContain("accessToken");
  });
});
