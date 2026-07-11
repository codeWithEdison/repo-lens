/**
 * Contributor-level CSV export.
 */

import type { ContributionReport, ContributionMetricKey } from "@shared/types/index.js";

const COLUMNS = [
  "Rank",
  "Contributor",
  "Contribution Percentage",
  "Final Score",
  "Feature Ownership Score",
  "Delivery Score",
  "Complexity Score",
  "Consistency Score",
  "Quality Score",
  "Architecture Score",
  "Review Score",
  "Maintenance Score",
  "Features Owned",
  "Repositories",
  "Confidence",
];

function metric(scoreMetrics: ContributionReport["contributionScores"][number]["metrics"], key: ContributionMetricKey): number {
  return scoreMetrics.find((m) => m.key === key)?.normalizedValue ?? 0;
}

export function buildCsv(report: ContributionReport): string {
  const rows = report.contributionScores.map((s, i) => [
    i + 1,
    s.name,
    s.contributionPct,
    s.finalScore,
    metric(s.metrics, "featureOwnership"),
    metric(s.metrics, "delivery"),
    metric(s.metrics, "complexity"),
    metric(s.metrics, "consistency"),
    metric(s.metrics, "quality"),
    metric(s.metrics, "architecture"),
    metric(s.metrics, "review"),
    metric(s.metrics, "maintenance"),
    s.featuresOwned,
    s.repositories.join(" | "),
    s.confidence,
  ]);

  const lines = [COLUMNS, ...rows].map((row) => row.map(csvCell).join(","));
  return lines.join("\n");
}

function csvCell(value: string | number): string {
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
