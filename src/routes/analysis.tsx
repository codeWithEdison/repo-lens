import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/repolens/AppShell";
import { ANALYSIS_STEPS } from "@/lib/mock-analysis";
import { runAnalysis, getPendingRepos } from "@/lib/analysis-store";
import { Check, Loader2 } from "lucide-react";

export const Route = createFileRoute("/analysis")({
  component: AnalysisPage,
});

function AnalysisPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const repos = getPendingRepos();

  useEffect(() => {
    if (!repos.length) {
      navigate({ to: "/" });
      return;
    }
    const stepMs = 550;
    const timers: ReturnType<typeof setTimeout>[] = [];
    ANALYSIS_STEPS.forEach((_, i) => {
      timers.push(setTimeout(() => setStep(i + 1), stepMs * (i + 1)));
    });
    timers.push(
      setTimeout(() => {
        runAnalysis();
        navigate({ to: "/report" });
      }, stepMs * ANALYSIS_STEPS.length + 400),
    );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progress = Math.round((step / ANALYSIS_STEPS.length) * 100);

  return (
    <AppShell>
      <main className="mx-auto max-w-2xl px-6 py-24">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-3 py-1 text-xs text-muted-foreground">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
            </span>
            Analyzing {repos.length} repositor{repos.length === 1 ? "y" : "ies"}
          </div>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight">Reading the repository</h1>
          <p className="mt-2 text-sm text-muted-foreground">This usually takes a few seconds.</p>
        </div>

        <div className="mb-8 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%`, background: "var(--gradient-accent)" }}
          />
        </div>

        <ol className="space-y-1 rounded-2xl border border-border/60 bg-card/40 p-2">
          {ANALYSIS_STEPS.map((label, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <li
                key={label}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors ${
                  active
                    ? "bg-muted/60 text-foreground"
                    : done
                      ? "text-muted-foreground"
                      : "text-muted-foreground/60"
                }`}
              >
                <span className="grid h-5 w-5 place-items-center">
                  {done ? (
                    <Check className="h-4 w-4 text-accent" />
                  ) : active ? (
                    <Loader2 className="h-4 w-4 animate-spin text-accent" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-40" />
                  )}
                </span>
                <span>{label}</span>
              </li>
            );
          })}
        </ol>
      </main>
    </AppShell>
  );
}