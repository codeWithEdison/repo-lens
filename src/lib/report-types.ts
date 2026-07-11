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
export function parseRepoUrl(url: string): RepoInput | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  let source: RepoSource = "github";
  if (trimmed.includes("gitlab")) source = "gitlab";
  else if (trimmed.includes("bitbucket")) source = "bitbucket";
  else if (!trimmed.includes("github")) source = "generic";
  const parts = trimmed.replace(/\.git$/, "").split("/").filter(Boolean);
  const name = parts.slice(-2).join("/") || trimmed;
  return { id: crypto.randomUUID(), url: trimmed, name, source };
}
