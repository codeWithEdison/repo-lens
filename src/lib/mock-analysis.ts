export type RepoSource = "github" | "gitlab" | "bitbucket" | "local";

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

export function parseRepoUrl(url: string): RepoInput | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  let source: RepoSource = "github";
  if (trimmed.includes("gitlab")) source = "gitlab";
  else if (trimmed.includes("bitbucket")) source = "bitbucket";
  const parts = trimmed.replace(/\.git$/, "").split("/").filter(Boolean);
  const name = parts.slice(-2).join("/") || trimmed;
  return {
    id: crypto.randomUUID(),
    url: trimmed,
    name,
    source,
  };
}

const DEVELOPERS = [
  { name: "Edison Vega", handle: "edisonv" },
  { name: "John Park", handle: "jpark" },
  { name: "Maya Chen", handle: "mchen" },
  { name: "Priya Rao", handle: "prao" },
  { name: "Lukas Meier", handle: "lmeier" },
];

const FEATURES: Omit<Feature, "owner" | "otherContributors">[] = [
  { name: "Authentication", complexity: "High", contribution: 81, evidence: "42 commits, 8 PRs, 3.2k LOC" },
  { name: "Billing & Subscriptions", complexity: "High", contribution: 74, evidence: "31 commits, 12 PRs" },
  { name: "Realtime Sync Engine", complexity: "High", contribution: 92, evidence: "58 commits, core protocol" },
  { name: "Admin Dashboard", complexity: "Medium", contribution: 67, evidence: "24 components" },
  { name: "API Gateway", complexity: "High", contribution: 88, evidence: "REST + tRPC layer" },
  { name: "Notification Service", complexity: "Medium", contribution: 55, evidence: "email, push, in-app" },
  { name: "Search & Indexing", complexity: "Medium", contribution: 63, evidence: "Postgres FTS, Meilisearch" },
  { name: "CI/CD Pipeline", complexity: "Low", contribution: 71, evidence: "GitHub Actions workflows" },
];

export function generateMockReport(repositories: RepoInput[]): AnalysisReport {
  const devs = DEVELOPERS.slice(0, 5);
  const raw = devs.map((d, i) => {
    const base = 95 - i * 14 + Math.random() * 6;
    return { d, base };
  });
  const total = raw.reduce((s, r) => s + r.base, 0);
  const developers: Developer[] = raw.map((r, i) => {
    const pct = +(r.base / total * 100).toFixed(1);
    const complexity = Math.max(30, Math.round(95 - i * 12 + Math.random() * 8));
    const impact = Math.max(30, Math.round(92 - i * 11 + Math.random() * 6));
    const consistency = Math.max(40, Math.round(88 - i * 8 + Math.random() * 10));
    const reviews = Math.round(60 + Math.random() * 35);
    const features = Math.max(1, 6 - i);
    const finalScore = Math.round((pct * 1.2 + complexity + impact + consistency + reviews) / 5);
    return {
      name: r.d.name,
      handle: r.d.handle,
      contributionPct: pct,
      features,
      technicalImpact: impact,
      complexity,
      consistency,
      reviews,
      finalScore,
      suggestedShare: pct,
      reason:
        i === 0
          ? "Owns core systems and highest-complexity modules."
          : i === 1
          ? "Strong feature delivery with consistent throughput."
          : i === 2
          ? "Cross-cutting contributions across API and infra."
          : i === 3
          ? "Focused on UI polish and product surface area."
          : "Occasional contributor, primarily fixes and reviews.",
    };
  });

  const features: Feature[] = FEATURES.map((f, i) => {
    const owner = developers[i % developers.length].name.split(" ")[0];
    const others = developers
      .filter((d) => !d.name.startsWith(owner))
      .slice(0, 2)
      .map((d) => d.name.split(" ")[0]);
    return { ...f, owner, otherContributors: others };
  });

  const timeline: TimelinePoint[] = Array.from({ length: 12 }).map((_, w) => {
    const point: TimelinePoint = { week: `W${w + 1}` };
    developers.forEach((d) => {
      point[d.name.split(" ")[0]] = Math.round(
        Math.max(0, Math.sin(w / 2 + developers.indexOf(d)) * 20 + 30 + Math.random() * 15),
      );
    });
    return point;
  });

  return {
    repositories,
    developers,
    features,
    timeline,
    insights: {
      architecture: "Modular monorepo with layered services (API, workers, web).",
      languages: [
        { name: "TypeScript", pct: 68 },
        { name: "Python", pct: 14 },
        { name: "Go", pct: 9 },
        { name: "SQL", pct: 6 },
        { name: "Shell", pct: 3 },
      ],
      frameworks: ["React", "Next.js", "tRPC", "Prisma", "FastAPI"],
      projectSize: "142k LOC · 1,284 files",
      modules: 34,
      dependencies: 218,
      complexity: "Moderate–High",
    },
    aiSummary:
      `Across ${repositories.length} repositor${repositories.length === 1 ? "y" : "ies"}, ${developers[0].name} emerges as the technical lead — owning the realtime sync engine, API gateway, and authentication surface. ${developers[1].name} anchors billing and admin tooling with consistent weekly throughput. ${developers[2].name} contributes broadly across infrastructure, while the remaining contributors focus on product polish and code review. Final scores weight complexity, feature ownership, and review depth over raw commit counts, giving a fair picture of engineering impact.`,
    analysisTimeMs: 3200 + Math.round(Math.random() * 1800),
  };
}

export const ANALYSIS_STEPS = [
  "Connecting Repository",
  "Reading Git History",
  "Analyzing Project",
  "Detecting Features",
  "Calculating Ownership",
  "Measuring Complexity",
  "Generating Contribution Report",
  "Generating AI Summary",
] as const;