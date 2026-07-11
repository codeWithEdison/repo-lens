import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/repolens/AppShell";
import { ANALYSIS_STEPS } from "@/lib/report-types";
import {
  subscribeToAnalysisProgress,
  type BackendProgress,
  type ProgressSubscription,
} from "@/lib/api-client";
import { Check, Loader2, AlertTriangle, Lock } from "lucide-react";
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
  const [failure, setFailure] = useState<"failed" | "expired" | "connection" | null>(null);
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
          setFailure("failed");
        } else if (status === "expired") {
          setFailure("expired");
        }
      },
      onError: () => setFailure("connection"),
    });

    return () => subRef.current?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const overall = progress?.overallProgress ?? 0;
  const currentStep = progress ? stageToStepIndex(progress.currentStage) : 0;
  const repoCount = progress?.repositories.length ?? 0;
  const failed = failure !== null;

  // Prefer the backend's specific error message; fall back per failure kind.
  const backendError = progress?.error?.message;
  const errorCode = progress?.error?.code;
  const failedRepos = progress?.repositories.filter((r) => r.status === "failed") ?? [];
  const isAuthIssue =
    errorCode === "REPOSITORY_CLONE_FAILED" ||
    errorCode === "PRIVATE_REPOSITORIES_DISABLED" ||
    /private|access token|authenticat|not found|could not access/i.test(backendError ?? "");

  let message: string;
  if (failure === "expired") {
    message = "This analysis has expired and its data was removed.";
  } else if (failure === "connection") {
    message = "Lost connection to the analysis service. Check that the API is running and try again.";
  } else if (failure === "failed") {
    message = backendError ?? "The analysis failed.";
  } else {
    message = progress?.message ?? "Connecting to the analysis service…";
  }

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
          <div className="space-y-4">
            {failure === "failed" && (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-sm text-foreground">{message}</p>
                {failedRepos.length > 0 && (
                  <ul className="mt-3 space-y-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                    {failedRepos.map((r) => (
                      <li key={r.url} className="flex items-center gap-2">
                        <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" />
                        <span className="truncate">{r.name}</span>
                        <span className="text-muted-foreground/70">— {r.currentStage ?? "failed"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {isAuthIssue && failure === "failed" && (
              <div className="rounded-2xl border border-border/60 bg-card/50 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Lock className="h-4 w-4 text-accent" /> Analyzing a private repository?
                </div>
                <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
                  A valid token still fails if it isn&apos;t scoped to this repo. For a
                  GitHub <span className="text-foreground">fine-grained</span> token, check all of:
                </p>
                <ul className="ml-1 list-inside list-disc space-y-1 text-xs leading-relaxed text-muted-foreground">
                  <li><span className="text-foreground">Resource owner</span> = the repo&apos;s owner/org (e.g. the organization, not your personal account).</li>
                  <li><span className="text-foreground">Repository access</span> includes this exact repository (a token limited to selected repos returns &quot;not found&quot; for any other repo).</li>
                  <li><span className="text-foreground">Permissions</span>: Contents → Read and Metadata → Read.</li>
                  <li>For org repos, the org must <span className="text-foreground">enable/approve</span> fine-grained tokens; SAML SSO orgs need a <span className="text-foreground">classic</span> token with <code>repo</code> scope.</li>
                  <li>Then on the home screen click <span className="text-foreground">Private</span>, paste the token, and click <span className="text-foreground">Add</span> before Analyze.</li>
                </ul>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Tip: a <span className="text-foreground">classic</span> PAT with the <code>repo</code> scope avoids most of these pitfalls.
                </p>
              </div>
            )}

            <div className="flex justify-center gap-2 pt-2">
              <Button onClick={() => navigate({ to: "/" })}>Start a new analysis</Button>
            </div>
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
