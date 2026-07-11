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

/**
 * Turn raw git clone output into a concise, actionable message. The most common
 * failure is an authentication/not-found error on a private repository.
 */
function friendlyCloneMessage(raw: string, job: RepoJob): string {
  const lower = raw.toLowerCase();
  const hasToken = Boolean(job.accessToken);

  // No token supplied and git had to prompt → repo is private (or missing).
  if (!hasToken && (lower.includes("could not read username") || lower.includes("terminal prompts disabled"))) {
    return `Could not access "${job.name}". It appears to be private or does not exist. If it is private, add an access token with read permission (click "Private" on the home screen).`;
  }

  // Invalid / expired credentials (HTTP 401).
  if (
    lower.includes("authentication failed") ||
    lower.includes("invalid username or password") ||
    lower.includes("401")
  ) {
    return `Authentication failed for "${job.name}". The access token is invalid, expired, or malformed. Generate a new token and try again.`;
  }

  // Forbidden — usually SAML/SSO authorization or missing permission (HTTP 403).
  if (lower.includes("saml") || lower.includes("sso") || lower.includes("403") || lower.includes("access denied")) {
    return `Access to "${job.name}" was forbidden. If the organization uses SAML SSO, authorize the token for that org (fine-grained tokens may not support SSO — use a classic token with "repo" scope), or grant the token read access.`;
  }

  // Not found — for a token this almost always means the token can't see the
  // repo: wrong resource owner, repo not in the token's selected repositories,
  // missing Contents/Metadata read, or pending org approval (GitHub returns 404).
  if (lower.includes("not found") || lower.includes("could not read username") || lower.includes("terminal prompts disabled")) {
    if (hasToken) {
      return `Could not access "${job.name}". The token does not have access to this repository (GitHub returns "not found" in this case). Check: the repository URL is correct; the token's resource owner is the repo owner/org; the repository is included in the token's selected repositories; and it has Contents: Read + Metadata: Read. Org repos may also require the org to enable/approve fine-grained tokens.`;
    }
    return `Could not access "${job.name}". It appears to be private or does not exist. If it is private, add an access token with read permission.`;
  }

  if (lower.includes("timed out") || lower.includes("timeout")) {
    return `Cloning "${job.name}" timed out. The repository may be too large or the network too slow.`;
  }
  if (lower.includes("could not resolve host") || lower.includes("unable to access")) {
    return `Could not reach the git host for "${job.name}". Check the repository URL and network connectivity.`;
  }

  // Fall back to the first line of raw git output (already token-redacted).
  const firstLine = raw.split("\n").map((l) => l.trim()).filter(Boolean).pop() ?? raw.trim();
  return `Failed to clone "${job.name}": ${firstLine}`;
}

/**
 * Username to pair with a token for git-over-HTTPS Basic auth, per provider.
 *
 * "oauth2" is the most compatible username for GitHub (works with both classic
 * and fine-grained PATs — fine-grained tokens are NOT authenticated with the
 * "x-access-token" username and would be treated as anonymous, yielding a 404)
 * and for GitLab. Bitbucket expects "x-token-auth".
 */
function gitAuthUsername(provider: string): string {
  switch (provider) {
    case "bitbucket":
      return "x-token-auth";
    case "github":
    case "gitlab":
    default:
      return "oauth2";
  }
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
  let basicAuth: string | undefined;
  if (job.accessToken) {
    // Authenticate via an HTTP Basic header rather than embedding the token in
    // the remote URL (which would be written to .git/config on disk). GitHub,
    // GitLab and Bitbucket each expect a provider-specific username with the
    // token as the password.
    const username = gitAuthUsername(job.provider);
    basicAuth = Buffer.from(`${username}:${job.accessToken}`).toString("base64");
    cloneArgs.push("--config", `http.extraHeader=Authorization: Basic ${basicAuth}`);
  }

  const prevPrompt = process.env.GIT_TERMINAL_PROMPT;
  process.env.GIT_TERMINAL_PROMPT = "0";
  try {
    await git.clone(job.cleanUrl, targetPath, cloneArgs);
  } catch (err) {
    // Redact both the raw token and its base64 form from any surfaced message.
    let raw = (err as Error).message;
    if (job.accessToken) raw = raw.split(job.accessToken).join("***");
    if (basicAuth) raw = raw.split(basicAuth).join("***");
    throw new CloneError("REPOSITORY_CLONE_FAILED", friendlyCloneMessage(raw, job));
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
