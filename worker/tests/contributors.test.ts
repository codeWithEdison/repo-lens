import { describe, it, expect } from "vitest";
import { normalizeContributors, extractGithubLogin } from "../src/analyzers/contributors.js";
import { classifyCommit } from "../src/analyzers/commitClassification.js";
import type { RepoAnalysis, RawCommit } from "../src/types.js";

function raw(name: string, email: string, message = "feat: x"): RawCommit {
  return {
    hash: Math.random().toString(16).slice(2),
    author: { name, email },
    date: new Date().toISOString(),
    message,
    isMerge: false,
    coAuthors: [],
    files: [{ path: "src/app.ts", insertions: 5, deletions: 1, status: "modified" }],
    insertions: 5,
    deletions: 1,
  };
}

function analysis(commits: RawCommit[]): RepoAnalysis {
  return {
    job: { name: "repo", url: "u", cleanUrl: "u", provider: "github" },
    summary: {
      name: "repo",
      provider: "github",
      url: "u",
      defaultBranch: "main",
      branchAnalyzed: "main",
      commitCount: commits.length,
      contributorCount: 0,
      firstCommitAt: null,
      lastCommitAt: null,
      languages: [],
      frameworks: [],
      tags: [],
      hasTests: false,
      hasCi: false,
      hasDocker: false,
      hasDocs: false,
      fileCount: 1,
    },
    commits: commits.map(classifyCommit),
    structure: {
      fileCount: 1,
      languages: [],
      frameworks: [],
      hasTests: false,
      hasCi: false,
      hasDocker: false,
      hasDocs: false,
      mainDirectories: [],
      exportedFunctions: 0,
      classes: 0,
      interfaces: 0,
      components: 0,
      routes: 0,
      services: 0,
      hooks: 0,
    },
    pullRequests: [],
    defaultBranch: "main",
    branchAnalyzed: "main",
  };
}

describe("contributor normalization", () => {
  it("extracts github login from noreply email", () => {
    expect(extractGithubLogin("123+octocat@users.noreply.github.com")).toBe("octocat");
    expect(extractGithubLogin("octocat@users.noreply.github.com")).toBe("octocat");
    expect(extractGithubLogin("jane@example.com")).toBeUndefined();
  });

  it("merges the same full name across different emails", () => {
    const index = normalizeContributors([
      analysis([raw("Jane Dev", "jane@work.com"), raw("Jane Dev", "jane@personal.com")]),
    ]);
    const human = index.contributors.filter((c) => !c.isBot);
    expect(human).toHaveLength(1);
    expect(human[0].emails).toContain("jane@work.com");
    expect(human[0].emails).toContain("jane@personal.com");
    expect(human[0].identityConfidence).toBeLessThan(0.95);
  });

  it("does not merge different single-word handles", () => {
    const index = normalizeContributors([
      analysis([raw("alpha", "a@x.com"), raw("beta", "b@x.com")]),
    ]);
    expect(index.contributors.filter((c) => !c.isBot)).toHaveLength(2);
  });

  it("flags bots", () => {
    const index = normalizeContributors([
      analysis([raw("dependabot[bot]", "dependabot[bot]@users.noreply.github.com")]),
    ]);
    expect(index.contributors.some((c) => c.isBot)).toBe(true);
  });
});
