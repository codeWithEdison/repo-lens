/**
 * Safe repository cloning with simple-git.
 *
 * Security measures:
 *  - Re-validate the URL (SSRF / provider allowlist) before cloning.
 *  - Never run Git hooks (core.hooksPath=/dev/null) or repository scripts.
 *  - Disable interactive credential prompts (GIT_TERMINAL_PROMPT=0).
 *  - Pass all values as argument arrays / config (no shell concatenation).
 *  - Enforce a clone timeout and post-clone size / file-count limits.
 *  - Access tokens are sent via an http.extraHeader config value only and are
 *    never written to logs or the report.
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { simpleGit, type SimpleGit } from "simple-git";

import { env } from "../config/env.js";
import type { RepoJob } from "../types.js";
import { validateRepositoryUrl } from "@shared/git/repoUrl.js";

export class CloneError extends Error {
  constructor(
    public readonly code: "REPOSITORY_CLONE_FAILED" | "REPOSITORY_TOO_LARGE",
    message: string,
  ) {
    super(message);
    this.name = "CloneError";
  }
}

export interface CloneResult {
  repoPath: string;
  git: SimpleGit;
}

export async function cloneRepository(job: RepoJob, targetPath: string): Promise<CloneResult> {
  // Re-validate before any network / filesystem action.
  validateRepositoryUrl(job.cleanUrl, { allowedHosts: env.allowedGitHosts });

  await fsp.mkdir(path.dirname(targetPath), { recursive: true });

  const timeoutMs = env.GIT_CLONE_TIMEOUT_MINUTES * 60 * 1000;

  const git = simpleGit({
    timeout: { block: timeoutMs },
    // simple-git 3.x blocks several -c config overrides unless explicitly allowed.
    // These are set from trusted server config only — never from user input.
    unsafe: {
      allowUnsafeHooksPath: true,
      allowUnsafeCredentialHelper: true,
      allowUnsafeProtocolOverride: true,
    },
    config: [
      "core.hooksPath=/dev/null",
      "credential.helper=",
      "protocol.file.allow=never",
      "protocol.ext.allow=never",
    ],
  });

  const cloneArgs: string[] = ["--no-tags", "--config", "core.hooksPath=/dev/null"];

  if (env.GIT_CLONE_DEPTH > 0) {
    cloneArgs.push("--depth", String(env.GIT_CLONE_DEPTH), "--single-branch");
  }
  if (job.branch) {
    cloneArgs.push("--branch", job.branch, "--single-branch");
  }
  if (job.accessToken) {
    // Token travels as a request header, not embedded in the stored remote URL.
    cloneArgs.push("--config", `http.extraHeader=Authorization: Bearer ${job.accessToken}`);
  }

  const prevPrompt = process.env.GIT_TERMINAL_PROMPT;
  process.env.GIT_TERMINAL_PROMPT = "0";
  try {
    await git.clone(job.cleanUrl, targetPath, cloneArgs);
  } catch (err) {
    throw new CloneError(
      "REPOSITORY_CLONE_FAILED",
      `Failed to clone repository ${job.name}: ${(err as Error).message.replace(job.accessToken ?? "\u0000", "***")}`,
    );
  } finally {
    if (prevPrompt === undefined) delete process.env.GIT_TERMINAL_PROMPT;
    else process.env.GIT_TERMINAL_PROMPT = prevPrompt;
  }

  await enforceLimits(targetPath, job.name);

  const repoGit = simpleGit(targetPath, { timeout: { block: timeoutMs } });
  return { repoPath: targetPath, git: repoGit };
}

async function enforceLimits(repoPath: string, name: string): Promise<void> {
  const maxBytes = env.MAX_REPOSITORY_SIZE_MB * 1024 * 1024;
  let totalBytes = 0;
  let fileCount = 0;

  const walk = async (dir: string): Promise<void> => {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        fileCount++;
        try {
          const stat = await fsp.stat(full);
          totalBytes += stat.size;
        } catch {
          /* ignore */
        }
        if (fileCount > env.MAX_FILES_PER_REPOSITORY) {
          throw new CloneError(
            "REPOSITORY_TOO_LARGE",
            `Repository ${name} exceeds the maximum file count (${env.MAX_FILES_PER_REPOSITORY}).`,
          );
        }
        if (totalBytes > maxBytes) {
          throw new CloneError(
            "REPOSITORY_TOO_LARGE",
            `Repository ${name} exceeds the maximum size (${env.MAX_REPOSITORY_SIZE_MB} MB).`,
          );
        }
      }
    }
  };

  await walk(repoPath);
}
