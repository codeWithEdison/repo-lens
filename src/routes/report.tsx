import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/repolens/AppShell";
import type { AnalysisReport } from "@/lib/report-types";
import {
  getAnalysisReport,
  getAnalysisProgress,
  downloadPdfExport,
  downloadJsonExport,
  downloadCsvExport,
  deleteAnalysis,
  RepoLensApiError,
} from "@/lib/api-client";
import { adaptReport, type BackendReport } from "@/lib/report-adapter";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Download,
  FileJson,
  FileText,
  Link2,
  Sparkles,
  Code2,
  Package,
  Layers,
  Timer,
  GitBranch,
  Users,
  Boxes,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/report")({
  validateSearch: (search: Record<string, unknown>): { id?: string } => ({
    id: typeof search.id === "string" ? search.id : undefined,
  }),
  component: ReportPage,
});

const CHART_COLORS = [
  "oklch(0.72 0.18 262)",
  "oklch(0.75 0.17 165)",
  "oklch(0.78 0.17 55)",
  "oklch(0.7 0.2 320)",
  "oklch(0.72 0.2 20)",
];

function ReportPage() {
  const navigate = useNavigate();
  const { id } = Route.useSearch();
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    const load = async () => {
      try {
        const [result, progress] = await Promise.all([
          getAnalysisReport<BackendReport>(id),
          getAnalysisProgress(id).catch(() => null),
        ]);
        if (cancelled) return;
        if (result.status === "pending" || !result.report) {
          // Report still generating — send the user back to the progress view.
          navigate({ to: "/analysis", search: { id } });
          return;
        }
        let elapsed = 0;
        if (progress?.startedAt && progress?.completedAt) {
          elapsed = new Date(progress.completedAt).getTime() - new Date(progress.startedAt).getTime();
        }
        setReport(adaptReport(result.report, elapsed));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof RepoLensApiError ? err.message : "Could not load the report.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <AppShell>
        <main className="mx-auto max-w-2xl px-6 py-32 text-center">
          <Loader2 className="mx-auto mb-6 h-8 w-8 animate-spin text-accent" />
          <h1 className="text-2xl font-semibold tracking-tight">Loading report…</h1>
        </main>
      </AppShell>
    );
  }

  if (!report) {
    return (
      <AppShell>
        <main className="mx-auto max-w-2xl px-6 py-32 text-center">
          <div className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-2xl border border-border/60 bg-card/50">
            <GitBranch className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {error ? "Report unavailable" : "No analysis yet"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error ?? "Paste a repository URL to begin a new analysis."}
          </p>
          <div className="mt-6">
            <Button asChild>
              <Link to="/">Start an analysis</Link>
            </Button>
          </div>
        </main>
      </AppShell>
    );
  }

  const analysisId = report.analysisId;

  const removeAnalysis = async () => {
    try {
      await deleteAnalysis(analysisId);
      toast.success("Analysis data deleted");
      navigate({ to: "/" });
    } catch {
      toast.error("Could not delete the analysis");
    }
  };

  const pieData = report.developers.map((d) => ({
    name: d.name.split(" ")[0],
    value: d.suggestedShare,
  }));

  const stats = [
    { icon: GitBranch, label: "Repositories", value: report.repositories.length },
    { icon: Users, label: "Developers", value: report.developers.length },
    { icon: Boxes, label: "Features", value: report.features.length },
    { icon: Code2, label: "Languages", value: report.insights.languages.length },
    { icon: Layers, label: "Frameworks", value: report.insights.frameworks.length },
    { icon: Package, label: "Architecture", value: "Monorepo" },
    { icon: Timer, label: "Analysis Time", value: `${(report.analysisTimeMs / 1000).toFixed(1)}s` },
  ];

  return (
    <AppShell>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              to="/"
              className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> New analysis
            </Link>
            <h1 className="text-3xl font-semibold tracking-tight">Contribution Report</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {report.repositories.map((r) => r.name).join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadJsonExport(analysisId)}>
              <FileJson className="mr-1.5 h-3.5 w-3.5" /> JSON
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadCsvExport(analysisId)}>
              <FileText className="mr-1.5 h-3.5 w-3.5" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadPdfExport(analysisId)}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                toast.success("Share link copied");
              }}
            >
              <Link2 className="mr-1.5 h-3.5 w-3.5" /> Copy link
            </Button>
            <Button variant="outline" size="sm" onClick={() => void removeAnalysis()}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        </div>

        <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-border/60 bg-card/40 p-4 transition-colors hover:bg-card/70"
            >
              <s.icon className="mb-3 h-4 w-4 text-muted-foreground" />
              <div className="text-lg font-semibold tracking-tight">{s.value}</div>
              <div className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                {s.label}
              </div>
            </div>
          ))}
        </div>

        <section
          className="mb-10 rounded-2xl border border-border/60 bg-card/40 p-6"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-accent" /> AI Summary
          </div>
          <p className="text-[15px] leading-relaxed text-foreground/90">{report.aiSummary}</p>
        </section>

        <section className="mb-10">
          <SectionHeader
            title="Contribution Ranking"
            subtitle="Weighted by complexity, ownership, and reviews."
          />
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/30">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Developer</th>
                    <th className="px-3 py-3 font-medium">Contribution</th>
                    <th className="px-3 py-3 font-medium">Features</th>
                    <th className="px-3 py-3 font-medium">Impact</th>
                    <th className="px-3 py-3 font-medium">Complexity</th>
                    <th className="px-3 py-3 font-medium">Consistency</th>
                    <th className="px-3 py-3 font-medium">Reviews</th>
                    <th className="px-5 py-3 text-right font-medium">Final</th>
                  </tr>
                </thead>
                <tbody>
                  {report.developers.map((d, i) => (
                    <tr
                      key={d.handle}
                      className="border-b border-border/40 transition-colors last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="grid h-7 w-7 place-items-center rounded-full text-[11px] font-semibold text-background"
                            style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                          >
                            {d.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </div>
                          <div>
                            <div className="font-medium">{d.name}</div>
                            <div className="text-xs text-muted-foreground">@{d.handle}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1 w-16 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${d.contributionPct}%`,
                                background: CHART_COLORS[i],
                              }}
                            />
                          </div>
                          <span className="tabular-nums">{d.contributionPct}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 tabular-nums">{d.features}</td>
                      <td className="px-3 py-3 tabular-nums">{d.technicalImpact}</td>
                      <td className="px-3 py-3 tabular-nums">{d.complexity}</td>
                      <td className="px-3 py-3 tabular-nums">{d.consistency}</td>
                      <td className="px-3 py-3 tabular-nums">{d.reviews}</td>
                      <td className="px-5 py-3 text-right">
                        <span className="rounded-lg bg-muted/60 px-2 py-1 font-semibold tabular-nums">
                          {d.finalScore}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <div className="mb-10 grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-border/60 bg-card/40 p-6">
            <SectionHeader title="Repository Timeline" subtitle="Contributions per week" small />
            <div className="h-64 w-full">
              <ResponsiveContainer>
                <AreaChart data={report.timeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    {report.developers.map((d, i) => (
                      <linearGradient key={d.handle} id={`g-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_COLORS[i]} stopOpacity={0.5} />
                        <stop offset="100%" stopColor={CHART_COLORS[i]} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid stroke="oklch(1 0 0 / 0.05)" vertical={false} />
                  <XAxis
                    dataKey="week"
                    stroke="oklch(0.66 0.015 260)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="oklch(0.66 0.015 260)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.185 0.012 260)",
                      border: "1px solid oklch(1 0 0 / 0.1)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  {report.developers.map((d, i) => (
                    <Area
                      key={d.handle}
                      type="monotone"
                      dataKey={d.name.split(" ")[0]}
                      stroke={CHART_COLORS[i]}
                      fill={`url(#g-${i})`}
                      strokeWidth={1.5}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-2xl border border-border/60 bg-card/40 p-6">
            <SectionHeader
              title="Technical Share"
              subtitle="Suggested equity / recognition split"
              small
            />
            <div className="grid grid-cols-[160px_minmax(0,1fr)] items-center gap-4">
              <div className="h-40">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={pieData} innerRadius={38} outerRadius={65} dataKey="value" stroke="none">
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-2 text-sm">
                {report.developers.map((d, i) => (
                  <li key={d.handle} className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: CHART_COLORS[i] }}
                      />
                      <span className="truncate">{d.name}</span>
                    </div>
                    <span className="tabular-nums text-muted-foreground">{d.suggestedShare}%</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-4 space-y-1.5 border-t border-border/60 pt-4 text-xs text-muted-foreground">
              {report.developers.map((d) => (
                <div key={d.handle}>
                  <span className="text-foreground">{d.name.split(" ")[0]}:</span> {d.reason}
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="mb-10">
          <SectionHeader
            title="Feature Ownership"
            subtitle="Who owns which features, and how deep it goes."
          />
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {report.features.map((f) => (
              <div
                key={f.name}
                className="group rounded-2xl border border-border/60 bg-card/40 p-5 transition-all hover:border-accent/40 hover:bg-card/70"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <h3 className="font-medium">{f.name}</h3>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                      f.complexity === "High"
                        ? "bg-destructive/15 text-destructive"
                        : f.complexity === "Medium"
                          ? "bg-accent/15 text-accent"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {f.complexity}
                  </span>
                </div>
                <div className="mb-3 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Owner</span>
                    <span className="font-medium">{f.owner}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Contributors</span>
                    <span>{f.otherContributors.join(", ") || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Contribution</span>
                    <span className="tabular-nums">{f.contribution}%</span>
                  </div>
                </div>
                <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${f.contribution}%`, background: "var(--gradient-accent)" }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="truncate">{f.evidence}</span>
                  <button className="text-accent transition-opacity hover:opacity-80">
                    View →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <SectionHeader title="Repository Insights" subtitle="Architecture, stack, and complexity." />
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-border/60 bg-card/40 p-6">
              <h3 className="mb-4 text-xs uppercase tracking-wider text-muted-foreground">Stack</h3>
              <dl className="space-y-3 text-sm">
                <Row label="Architecture" value={report.insights.architecture} />
                <Row label="Frameworks" value={report.insights.frameworks.join(", ")} />
                <Row label="Project size" value={report.insights.projectSize} />
                <Row label="Modules" value={String(report.insights.modules)} />
                <Row label="Dependencies" value={String(report.insights.dependencies)} />
                <Row label="Complexity" value={report.insights.complexity} />
              </dl>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card/40 p-6">
              <h3 className="mb-4 text-xs uppercase tracking-wider text-muted-foreground">Languages</h3>
              <ul className="space-y-3 text-sm">
                {report.insights.languages.map((l, i) => (
                  <li key={l.name}>
                    <div className="mb-1 flex justify-between">
                      <span>{l.name}</span>
                      <span className="tabular-nums text-muted-foreground">{l.pct}%</span>
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${l.pct}%`,
                          background: CHART_COLORS[i % CHART_COLORS.length],
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>
    </AppShell>
  );
}

function SectionHeader({
  title,
  subtitle,
  small = false,
}: {
  title: string;
  subtitle?: string;
  small?: boolean;
}) {
  return (
    <div className="mb-4">
      <h2
        className={
          small ? "text-base font-semibold tracking-tight" : "text-lg font-semibold tracking-tight"
        }
      >
        {title}
      </h2>
      {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}