import type { AnalysisReport, RepoInput } from "./mock-analysis";
import { generateMockReport } from "./mock-analysis";

// Simple in-memory store shared across routes (client-only navigation).
let pendingRepos: RepoInput[] = [];
let currentReport: AnalysisReport | null = null;

export function setPendingRepos(repos: RepoInput[]) {
  pendingRepos = repos;
}
export function getPendingRepos() {
  return pendingRepos;
}
export function runAnalysis(): AnalysisReport {
  const repos = pendingRepos.length ? pendingRepos : [];
  currentReport = generateMockReport(repos);
  return currentReport;
}
export function getReport(): AnalysisReport | null {
  return currentReport;
}