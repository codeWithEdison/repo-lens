/**
 * Internal worker data models used while analyzing repositories, before the
 * final ContributionReport / ContributionEvidence are assembled.
 */

import type {
  RepositoryProvider,
  RepositorySummary,
} from "@shared/types/index.js";

export interface RepoJob {
  name: string;
  url: string;
  cleanUrl: string;
  provider: RepositoryProvider | string;
  branch?: string;
  accessToken?: string;
}

export interface GitIdentity {
  name: string;
  email: string;
}

export interface CommitFileChange {
  path: string;
  insertions: number;
  deletions: number;
  status: "added" | "modified" | "deleted" | "renamed" | "unknown";
}

export interface RawCommit {
  hash: string;
  author: GitIdentity;
  date: string;
  message: string;
  isMerge: boolean;
  coAuthors: GitIdentity[];
  files: CommitFileChange[];
  insertions: number;
  deletions: number;
}

export interface CommitClassification {
  included: boolean;
  reason?: string;
  isBot: boolean;
  isRevert: boolean;
  isFormattingOnly: boolean;
  isLockfileOnly: boolean;
  isGenerated: boolean;
}

export interface ClassifiedCommit extends RawCommit {
  classification: CommitClassification;
}

export interface StructureAnalysis {
  fileCount: number;
  languages: Array<{ name: string; files: number }>;
  frameworks: string[];
  hasTests: boolean;
  hasCi: boolean;
  hasDocker: boolean;
  hasDocs: boolean;
  mainDirectories: string[];
  /** ts-morph derived counts (best effort). */
  exportedFunctions: number;
  classes: number;
  interfaces: number;
  components: number;
  routes: number;
  services: number;
  hooks: number;
}

export interface RepoAnalysis {
  job: RepoJob;
  summary: RepositorySummary;
  commits: ClassifiedCommit[];
  structure: StructureAnalysis;
  /** github pull requests when available (author login -> count etc). */
  pullRequests: PullRequestInfo[];
  defaultBranch: string;
  branchAnalyzed: string;
}

export interface PullRequestInfo {
  number: number;
  title: string;
  authorLogin: string | null;
  mergedAt: string | null;
  createdAt: string | null;
  files: string[];
}
