/**
 * UI-facing report types. These describe the shape the existing report page
 * renders. The API client adapts the backend ContributionReport into this
 * shape so the visual design stays unchanged.
 */

export type RepoSource = "github" | "gitlab" | "bitbucket" | "generic";

export interface RepoInput {
  id: string;
  url: string;
  name: string;
  source: RepoSource;
  /** Optional branch to analyze (defaults to the repo's default branch). */
  branch?: string;
  /**
   * Optional short-lived access token for private repositories. Held only in
   * memory for the duration of the submission — never persisted or displayed.
   */
  accessToken?: string;
}

export interface Developer {
  name: string;
  handle: string;
  contributionPct: number;
  features: number;
  technicalImpact: number;
  complexity: number;
  consistency: number;
  reviews: number;
  finalScore: number;
  suggestedShare: number;
  reason: string;
}

export interface Feature {
  name: string;
  owner: string;
  otherContributors: string[];
  complexity: "Low" | "Medium" | "High";
  contribution: number;
  evidence: string;
}

export interface TimelinePoint {
  week: string;
  [dev: string]: string | number;
}

export interface AnalysisReport {
  analysisId: string;
  repositories: RepoInput[];
  developers: Developer[];
  features: Feature[];
  timeline: TimelinePoint[];
  insights: {
    architecture: string;
    languages: { name: string; pct: number }[];
    frameworks: string[];
    projectSize: string;
    modules: number;
    dependencies: number;
    complexity: string;
  };
  aiSummary: string;
  analysisTimeMs: number;
}

/** Ordered pipeline stages shown on the analysis progress screen. */
export const ANALYSIS_STEPS = [
  "Preparing Workspace",
  "Cloning Repositories",
  "Reading Git History",
  "Inspecting Project Structure",
  "Analyzing Contributors",
  "Detecting Features",
  "Calculating Contribution",
  "Generating Report",
] as const;

/** Parse a repository URL for the input chips (display only; server re-validates). */
export function parseRepoUrl(
  url: string,
  options?: { branch?: string; accessToken?: string },
): RepoInput | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  let source: RepoSource = "github";
  if (trimmed.includes("gitlab")) source = "gitlab";
  else if (trimmed.includes("bitbucket")) source = "bitbucket";
  else if (!trimmed.includes("github")) source = "generic";
  // Best-effort: strip a web-view suffix (…/tree/<branch>, …/blob/…, GitLab's
  // …/-/…) so the chip shows "owner/repo" and we can pre-fill the branch. The
  // server re-validates and is the source of truth.
  const path = trimmed.replace(/^https?:\/\//, "").replace(/\.git$/, "");
  const segments = path.split("/").filter(Boolean);
  // segments[0] is the host; owner/repo start at index 1.
  const viewKeywords = new Set(["tree", "blob", "commit", "commits", "src", "branch", "-"]);
  let repoSegs = segments.slice(1);
  let detectedBranch: string | undefined;
  const dashIdx = repoSegs.indexOf("-");
  if (dashIdx > 1) {
    const rest = repoSegs.slice(dashIdx + 1);
    if (rest[0] === "tree" || rest[0] === "blob") detectedBranch = rest[1];
    repoSegs = repoSegs.slice(0, dashIdx);
  } else {
    for (let i = 2; i < repoSegs.length; i++) {
      if (viewKeywords.has(repoSegs[i])) {
        if (repoSegs[i] === "tree" || repoSegs[i] === "blob" || repoSegs[i] === "src" || repoSegs[i] === "branch") {
          detectedBranch = repoSegs[i + 1];
        }
        repoSegs = repoSegs.slice(0, i);
        break;
      }
    }
  }
  const name = repoSegs.slice(-2).join("/") || trimmed;
  const branch = options?.branch?.trim() || detectedBranch || undefined;
  const accessToken = options?.accessToken?.trim() || undefined;
  return { id: crypto.randomUUID(), url: trimmed, name, source, branch, accessToken };
}
