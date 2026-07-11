/**
 * The staged analysis pipeline. Prioritizes a reliable, stateless architecture
 * and transparent, evidence-based analysis. Repository clones are always
 * deleted in a finally block, whether the analysis succeeds or fails.
 */

import type { SimpleGit } from "simple-git";
import { workspace } from "../services/workspace.js";
import { ProgressReporter } from "../utils/progressReporter.js";
import { cloneRepository, CloneError } from "../git/clone.js";
import { readHistory } from "../git/history.js";
import { analyzeStructure } from "../analyzers/structure.js";
import { classifyCommit } from "../analyzers/commitClassification.js";
import { normalizeContributors } from "../analyzers/contributors.js";
import { detectFeatures } from "../analyzers/features.js";
import { scoreContributions } from "../scoring/scoreEngine.js";
import { buildReport } from "../reports/reportBuilder.js";
import { buildEvidence } from "../reports/evidenceBuilder.js";
import { generateExports } from "../exports/index.js";
import { fetchGithubMetadata } from "../github/octokit.js";
import { safeRepositoryDirName } from "@shared/workspace/ids.js";
import { validateRepositoryUrl } from "@shared/git/repoUrl.js";
import { ERROR_CODES } from "@shared/constants/index.js";
import { env } from "../config/env.js";
import type { RepoJob, RepoAnalysis, ClassifiedCommit } from "../types.js";
import type { RepositorySummary, RepositoryProvider } from "@shared/types/index.js";

class CancelledError extends Error {
  constructor() {
    super("Analysis cancelled (workspace removed).");
    this.name = "CancelledError";
  }
}

export interface AnalysisJobPayload {
  analysisId: string;
  repositories: RepoJob[];
}

export async function runAnalysisJob(payload: AnalysisJobPayload): Promise<void> {
  const { analysisId, repositories } = payload;
  const reporter = new ProgressReporter(analysisId);

  const ensureNotCancelled = async (): Promise<void> => {
    if (!(await workspace.workspaceExists(analysisId))) {
      throw new CancelledError();
    }
  };

  await ensureNotCancelled();
  await reporter.init(repositories.map((r) => ({ name: r.name, url: r.url })));

  try {
    // Stage 1: Prepare Workspace
    await ensureNotCancelled();
    await reporter.stage("Preparing Workspace", "Preparing isolated analysis workspace.");
    await workspace.createRepositoriesDir(analysisId);
    await workspace.updateMetadata(analysisId, { status: "running" });

    // Stage 2: Clone Repositories
    await ensureNotCancelled();
    await reporter.stage("Cloning Repositories", "Cloning repositories (no scripts are executed).");
    const cloned: Array<{ job: RepoJob; repoPath: string; git: SimpleGit }> = [];
    const cloneFailures: string[] = [];
    for (let i = 0; i < repositories.length; i++) {
      const job = repositories[i];
      await ensureNotCancelled();
      await reporter.setRepositoryProgress(job.name, {
        status: "running",
        currentStage: "Cloning Repositories",
        progress: 10,
      });
      const dirName = safeRepositoryDirName(job.name, i);
      const target = workspace.getRepositoryPath(analysisId, dirName);
      try {
        const { repoPath, git } = await cloneRepository(job, target);
        cloned.push({ job, repoPath, git });
        await reporter.setRepositoryProgress(job.name, { progress: 30 });
        await reporter.log("info", "Cloning Repositories", `Cloned ${job.name}`, null, job.name);
      } catch (err) {
        if (err instanceof CloneError) {
          await reporter.setRepositoryProgress(job.name, { status: "failed", progress: 0 });
          await reporter.log("error", "Cloning Repositories", err.message, { code: err.code }, job.name);
          cloneFailures.push(err.message);
          // Continue with other repositories rather than failing the whole run.
          continue;
        }
        throw err;
      }
    }

    if (cloned.length === 0) {
      // Surface the specific, actionable reason (auth/private, not found, etc.)
      // instead of a generic message so the UI can guide the user.
      const detail =
        cloneFailures.length === 1
          ? cloneFailures[0]
          : cloneFailures.join(" ");
      throw new AnalysisError(
        ERROR_CODES.REPOSITORY_CLONE_FAILED,
        detail || "No repositories could be cloned.",
      );
    }

    // Stages 3-6 per repository: history, metadata, structure.
    const analyses: RepoAnalysis[] = [];

    await ensureNotCancelled();
    await reporter.stage("Reading Git History", "Reading commit history and changed files.");
    const historyByRepo = new Map<string, { commits: ClassifiedCommit[]; defaultBranch: string; branchAnalyzed: string }>();
    for (const entry of cloned) {
      await ensureNotCancelled();
      const { commits, defaultBranch, branchAnalyzed } = await readHistory(entry.git);
      const classified = commits.map(classifyCommit);
      historyByRepo.set(entry.job.name, { commits: classified, defaultBranch, branchAnalyzed });
      await reporter.setRepositoryProgress(entry.job.name, { progress: 55 });
    }

    await ensureNotCancelled();
    await reporter.stage("Inspecting Project Structure", "Inspecting project structure and languages.");
    for (const entry of cloned) {
      await ensureNotCancelled();
      const structure = await analyzeStructure(entry.repoPath);
      const history = historyByRepo.get(entry.job.name)!;

      // Optional GitHub enrichment.
      let ghTags: string[] = [];
      let ghPulls: RepoAnalysis["pullRequests"] = [];
      if (entry.job.provider === "github") {
        const parsed = validateRepositoryUrl(entry.job.cleanUrl, { allowedHosts: env.allowedGitHosts });
        const gh = await fetchGithubMetadata(parsed.owner, parsed.name, entry.job.accessToken);
        ghTags = gh.tags;
        ghPulls = gh.pullRequests;
        if (gh.defaultBranch) history.defaultBranch = gh.defaultBranch;
      }

      const dates = history.commits
        .map((c) => Date.parse(c.date))
        .filter((n) => !Number.isNaN(n))
        .sort((a, b) => a - b);
      const authors = new Set(history.commits.map((c) => c.author.email));

      const summary: RepositorySummary = {
        name: entry.job.name,
        provider: (entry.job.provider as RepositoryProvider) ?? "generic",
        url: entry.job.cleanUrl,
        defaultBranch: history.defaultBranch,
        branchAnalyzed: history.branchAnalyzed,
        commitCount: history.commits.length,
        contributorCount: authors.size,
        firstCommitAt: dates.length ? new Date(dates[0]).toISOString() : null,
        lastCommitAt: dates.length ? new Date(dates[dates.length - 1]).toISOString() : null,
        languages: structure.languages.map((l) => ({ name: l.name, files: l.files, pct: 0 })),
        frameworks: structure.frameworks,
        tags: ghTags,
        hasTests: structure.hasTests,
        hasCi: structure.hasCi,
        hasDocker: structure.hasDocker,
        hasDocs: structure.hasDocs,
        fileCount: structure.fileCount,
      };
      // Fill per-repo language percentages.
      const totalLangFiles = summary.languages.reduce((s, l) => s + l.files, 0) || 1;
      summary.languages = summary.languages.map((l) => ({
        ...l,
        pct: Math.round((l.files / totalLangFiles) * 1000) / 10,
      }));

      analyses.push({
        job: entry.job,
        summary,
        commits: history.commits,
        structure,
        pullRequests: ghPulls,
        defaultBranch: history.defaultBranch,
        branchAnalyzed: history.branchAnalyzed,
      });
      await reporter.setRepositoryProgress(entry.job.name, { progress: 75 });
    }

    // Stage 4: Contributors
    await ensureNotCancelled();
    await reporter.stage("Analyzing Contributors", "Normalizing contributor identities across repositories.");
    const contributorIndex = normalizeContributors(analyses);
    await reporter.log(
      "info",
      "Analyzing Contributors",
      `Identified ${contributorIndex.contributors.length} contributor identities.`,
    );

    // Stage 7: Features
    await ensureNotCancelled();
    await reporter.stage("Detecting Features", "Grouping related work into preliminary features.");
    const features = detectFeatures(analyses, contributorIndex);
    await reporter.log("info", "Detecting Features", `Detected ${features.length} preliminary feature group(s).`);

    // Stage 8: Contribution
    await ensureNotCancelled();
    await reporter.stage("Calculating Contribution", "Calculating evidence-based contribution estimates.");
    const scoring = scoreContributions(analyses, features, contributorIndex);

    // Stage 9: Report
    await ensureNotCancelled();
    await reporter.stage("Generating Report", "Assembling the contribution report.");
    const report = await buildReport(analysisId, analyses, features, scoring, contributorIndex);
    await workspace.writeReport(analysisId, report);

    // Stage 10: Evidence
    const evidence = buildEvidence(analysisId, analyses, report, contributorIndex);
    await workspace.writeEvidence(analysisId, evidence);
    await workspace.updateMetadata(analysisId, { reportReady: true });

    // Stage 11: Exports
    await ensureNotCancelled();
    await reporter.stage("Generating Exports", "Generating PDF, CSV and JSON exports.");
    await generateExports(analysisId, report);
    await workspace.updateMetadata(analysisId, { exportsReady: true });

    // Stage 12: Cleanup handled in finally. Mark completion.
    await reporter.stage("Cleaning Temporary Repositories", "Removing cloned repositories.");
    await reporter.complete();
    await workspace.updateMetadata(analysisId, { status: "completed" });
  } catch (err) {
    if (err instanceof CancelledError) {
      return;
    }
    const analysisErr = err instanceof AnalysisError ? err : null;
    const code = analysisErr?.code ?? ERROR_CODES.INTERNAL_ERROR;
    const message = (err as Error)?.message ?? "Analysis failed unexpectedly.";
    // Only write failure state if the workspace still exists.
    if (await workspace.workspaceExists(analysisId)) {
      await reporter.fail({ code, message });
      await workspace.updateMetadata(analysisId, { status: "failed", error: { code, message } });
    }
    throw err;
  } finally {
    // Always delete cloned repositories, success or failure.
    try {
      if (await workspace.workspaceExists(analysisId)) {
        await workspace.deleteRepositoriesDirectory(analysisId);
        await reporter.log("info", "Cleaning Temporary Repositories", "Deleted cloned repositories.");
      }
    } catch (cleanupErr) {
      await reporter
        .log("warning", "Cleaning Temporary Repositories", "Failed to delete cloned repositories.", {
          error: (cleanupErr as Error).message,
        })
        .catch(() => undefined);
    }
  }
}

class AnalysisError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AnalysisError";
  }
}
