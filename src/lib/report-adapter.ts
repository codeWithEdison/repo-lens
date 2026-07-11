/**
 * Adapts the backend ContributionReport into the UI AnalysisReport shape so the
 * existing report page renders real data without visual changes.
 */

import type {
  AnalysisReport,
  Developer,
  Feature,
  RepoInput,
  RepoSource,
  TimelinePoint,
} from "./report-types";

interface BackendMetric {
  key: string;
  normalizedValue: number;
}
interface BackendScore {
  contributorId: string;
  name: string;
  handle: string;
  metrics: BackendMetric[];
  finalScore: number;
  contributionPct: number;
  featuresOwned: number;
  repositories: string[];
  explanation: string;
}
interface BackendFeature {
  name: string;
  primaryContributor: string | null;
  supportingContributors: string[];
  contributors: Array<{ contributorId: string; name: string; share: number }>;
  complexity: "Low" | "Medium" | "High";
  confidence: number;
  files: string[];
  commits: string[];
}
interface BackendRepositorySummary {
  name: string;
  provider: string;
  url: string;
}
interface BackendContributor {
  id: string;
  name: string;
}
interface BackendTimelinePoint {
  period: string;
  values: Record<string, number>;
}

export interface BackendReport {
  analysisId: string;
  repositories: BackendRepositorySummary[];
  projectSummary: string;
  technologies: {
    languages: { name: string; pct: number }[];
    frameworks: string[];
    architecture: string;
    projectSize: string;
    modules: number;
    dependencies: number;
    complexity: string;
  };
  contributors: BackendContributor[];
  contributionScores: BackendScore[];
  detectedFeatures: BackendFeature[];
  contributionTimeline: BackendTimelinePoint[];
}

const MAX_DEVELOPERS = 5;

function metric(metrics: BackendMetric[], key: string): number {
  const m = metrics.find((x) => x.key === key);
  return m ? Math.round(m.normalizedValue * 100) : 0;
}

function firstName(name: string): string {
  return name.split(" ")[0] || name;
}

export function adaptReport(backend: BackendReport, analysisTimeMs: number): AnalysisReport {
  const idToName = new Map(backend.contributors.map((c) => [c.id, c.name] as const));

  const topScores = backend.contributionScores.slice(0, MAX_DEVELOPERS);

  const developers: Developer[] = topScores.map((s) => ({
    name: s.name,
    handle: s.handle,
    contributionPct: s.contributionPct,
    features: s.featuresOwned,
    technicalImpact: metric(s.metrics, "delivery"),
    complexity: metric(s.metrics, "complexity"),
    consistency: metric(s.metrics, "consistency"),
    reviews: metric(s.metrics, "review"),
    finalScore: Math.round(s.finalScore),
    suggestedShare: s.contributionPct,
    reason: s.explanation,
  }));

  const features: Feature[] = backend.detectedFeatures.map((f) => {
    const ownerName = f.primaryContributor ? idToName.get(f.primaryContributor) ?? "—" : "—";
    const others = f.supportingContributors
      .map((id) => firstName(idToName.get(id) ?? ""))
      .filter(Boolean)
      .slice(0, 3);
    const primaryShare = f.contributors[0]?.share ?? Math.round(f.confidence * 100);
    return {
      name: f.name,
      owner: firstName(ownerName),
      otherContributors: others,
      complexity: f.complexity,
      contribution: Math.round(primaryShare),
      evidence: `${f.commits.length} commits · ${f.files.length} files · ${Math.round(f.confidence * 100)}% confidence`,
    };
  });

  const devFirstNames = developers.map((d) => firstName(d.name));
  const timeline: TimelinePoint[] = backend.contributionTimeline.map((point, i) => {
    const tp: TimelinePoint = { week: `W${i + 1}` };
    topScores.forEach((s, idx) => {
      tp[devFirstNames[idx]] = point.values[s.contributorId] ?? 0;
    });
    return tp;
  });

  const repositories: RepoInput[] = backend.repositories.map((r, i) => ({
    id: `r-${i}`,
    url: r.url,
    name: r.name,
    source: (["github", "gitlab", "bitbucket"].includes(r.provider)
      ? r.provider
      : "generic") as RepoSource,
  }));

  return {
    analysisId: backend.analysisId,
    repositories,
    developers,
    features,
    timeline,
    insights: {
      architecture: backend.technologies.architecture,
      languages: backend.technologies.languages.map((l) => ({ name: l.name, pct: l.pct })),
      frameworks: backend.technologies.frameworks,
      projectSize: backend.technologies.projectSize,
      modules: backend.technologies.modules,
      dependencies: backend.technologies.dependencies,
      complexity: backend.technologies.complexity,
    },
    aiSummary: backend.projectSummary,
    analysisTimeMs,
  };
}
