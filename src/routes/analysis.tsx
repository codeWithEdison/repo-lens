import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/repolens/AppShell";
import { ANALYSIS_STEPS } from "@/lib/report-types";
import {
  subscribeToAnalysisProgress,
  type BackendProgress,
  type ProgressSubscription,
} from "@/lib/api-client";
import { Check, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/analysis")({
  validateSearch: (search: Record<string, unknown>): { id?: string } => ({
    id: typeof search.id === "string" ? search.id : undefined,
  }),
  component: AnalysisPage,
});

/** Map a backend stage name to the index of the closest UI step. */
function stageToStepIndex(stage: string): number {
  const idx = (ANALYSIS_STEPS as readonly string[]).indexOf(stage);
  if (idx >= 0) return idx;
  // Later backend stages (Generating Exports, Cleaning..., Completed) map to the end.
  return ANALYSIS_STEPS.length;
}

function AnalysisPage() {
  const navigate = useNavigate();
  const { id } = Route.useSearch();
  const [progress, setProgress] = useState<BackendProgress | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const subRef = useRef<ProgressSubscription | null>(null);

  useEffect(() => {
    if (!id) {
      navigate({ to: "/" });
      return;
    }

    subRef.current = subscribeToAnalysisProgress(id, {
      onProgress: (p) => setProgress(p),
      onDone: (status) => {
        if (status === "completed") {
          navigate({ to: "/report", search: { id } });
        } else if (status === "failed") {
          setFailed("The analysis failed. See details below.");
        } else if (status === "expired") {
          setFailed("This analysis has expired.");
        }
      },
      onError: () => setFailed("Lost connection to the analysis service."),
    });

    return () => subRef.current?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const overall = progress?.overallProgress ?? 0;
  const currentStep = progress ? stageToStepIndex(progress.currentStage) : 0;
  const repoCount = progress?.repositories.length ?? 0;
  const message = failed ?? progress?.message ?? "Connecting to the analysis service…";

  return (
    <AppShell>
      <main className="mx-auto max-w-2xl px-6 py-24">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-3 py-1 text-xs text-muted-foreground">
            {failed ? (
              <AlertTriangle className="h-3 w-3 text-destructive" />
            ) : (
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
            )}
            {failed
              ? "Analysis stopped"
              : `Analyzing ${repoCount || ""} repositor${repoCount === 1 ? "y" : "ies"}`.trim()}
          </div>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight">
            {failed ? "Something went wrong" : "Reading the repositories"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        </div>

        {failed ? (
          <div className="text-center">
            <Button onClick={() => navigate({ to: "/" })}>Start a new analysis</Button>
          </div>
        ) : (
          <>
            <div className="mb-8 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${overall}%`, background: "var(--gradient-accent)" }}
              />
            </div>

            <ol className="space-y-1 rounded-2xl border border-border/60 bg-card/40 p-2">
              {ANALYSIS_STEPS.map((label, i) => {
                const done = i < currentStep;
                const active = i === currentStep;
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
          </>
        )}
      </main>
    </AppShell>
  );
}
