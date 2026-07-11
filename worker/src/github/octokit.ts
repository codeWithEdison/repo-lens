/**
 * Optional GitHub metadata enrichment via Octokit. Best-effort: any failure
 * (rate limits, private repo without token, network) degrades gracefully and
 * the pipeline continues using Git data only.
 */

import { Octokit } from "@octokit/rest";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import type { PullRequestInfo } from "../types.js";

export interface GithubMetadata {
  defaultBranch?: string;
  tags: string[];
  releases: number;
  languages: Record<string, number>;
  pullRequests: PullRequestInfo[];
}

const EMPTY: GithubMetadata = {
  tags: [],
  releases: 0,
  languages: {},
  pullRequests: [],
};

export async function fetchGithubMetadata(
  owner: string,
  repo: string,
  token?: string,
): Promise<GithubMetadata> {
  const auth = token || env.GITHUB_TOKEN || undefined;
  const octokit = new Octokit({ auth, request: { timeout: 15000 } });

  try {
    const [repoInfo, tags, pulls, languages] = await Promise.allSettled([
      octokit.repos.get({ owner, repo }),
      octokit.repos.listTags({ owner, repo, per_page: 50 }),
      octokit.pulls.list({ owner, repo, state: "closed", per_page: 100, sort: "updated" }),
      octokit.repos.listLanguages({ owner, repo }),
    ]);

    const result: GithubMetadata = { ...EMPTY };

    if (repoInfo.status === "fulfilled") {
      result.defaultBranch = repoInfo.value.data.default_branch;
    }
    if (tags.status === "fulfilled") {
      result.tags = tags.value.data.map((t) => t.name);
    }
    if (languages.status === "fulfilled") {
      result.languages = languages.value.data as Record<string, number>;
    }
    if (pulls.status === "fulfilled") {
      result.pullRequests = pulls.value.data
        .filter((pr) => pr.merged_at)
        .map((pr) => ({
          number: pr.number,
          title: pr.title,
          authorLogin: pr.user?.login ?? null,
          mergedAt: pr.merged_at ?? null,
          createdAt: pr.created_at ?? null,
          files: [],
        }));
    }

    return result;
  } catch (err) {
    logger.debug({ err, owner, repo }, "GitHub metadata fetch failed (continuing without it)");
    return { ...EMPTY };
  }
}
