import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type KeyboardEvent } from "react";
import { AppShell } from "@/components/repolens/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Github, GitBranch, Plus, Sparkles, X, ArrowRight, Upload } from "lucide-react";
import { toast } from "sonner";
import { parseRepoUrl, type RepoInput } from "@/lib/mock-analysis";
import { setPendingRepos } from "@/lib/analysis-store";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [repos, setRepos] = useState<RepoInput[]>([]);

  const addRepo = () => {
    const parsed = parseRepoUrl(url);
    if (!parsed) {
      toast.error("Enter a repository URL");
      return;
    }
    if (repos.some((r) => r.url === parsed.url)) {
      toast.error("Already added");
      return;
    }
    setRepos((prev) => [...prev, parsed]);
    setUrl("");
  };

  const removeRepo = (id: string) => setRepos((prev) => prev.filter((r) => r.id !== id));

  const analyze = () => {
    if (!repos.length) {
      toast.error("Add at least one repository");
      return;
    }
    setPendingRepos(repos);
    navigate({ to: "/analysis" });
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addRepo();
    }
  };

  const demo = () => {
    const sample = [
      parseRepoUrl("https://github.com/vercel/next.js")!,
      parseRepoUrl("https://github.com/tanstack/router")!,
    ];
    setRepos(sample);
    setPendingRepos(sample);
    navigate({ to: "/analysis" });
  };

  return (
    <AppShell>
      <main className="relative">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[600px]"
          style={{ background: "var(--gradient-hero)" }}
        />
        <div className="grid-bg pointer-events-none absolute inset-x-0 top-0 h-[600px]" />

        <section className="relative mx-auto max-w-3xl px-6 pb-16 pt-24 text-center sm:pt-32">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <Sparkles className="h-3 w-3 text-accent" />
            AI-powered contribution analysis
          </div>
          <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            <span className="text-gradient">RepoLens</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
            See who built what. Analyze one or multiple repositories and discover real engineering
            contributions — not just commits or lines of code.
          </p>

          <div
            className="mx-auto mt-10 max-w-2xl rounded-2xl border border-border/60 bg-card/60 p-2 text-left backdrop-blur-xl"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="flex items-center gap-2 p-2">
              <GitBranch className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={onKey}
                placeholder="Paste a GitHub, GitLab, or Bitbucket URL"
                className="h-10 min-w-0 flex-1 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
              />
              <Button size="sm" variant="ghost" onClick={addRepo} className="shrink-0 gap-1">
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>

            {repos.length > 0 && (
              <div className="flex flex-wrap gap-1.5 border-t border-border/60 p-3">
                {repos.map((r) => (
                  <span
                    key={r.id}
                    className="group inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/60 py-1 pl-2 pr-1 text-xs"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                    <span className="max-w-[220px] truncate">{r.name}</span>
                    <button
                      onClick={() => removeRepo(r.id)}
                      className="rounded p-0.5 text-muted-foreground opacity-60 transition-opacity hover:opacity-100"
                      aria-label={`Remove ${r.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 border-t border-border/60 p-2">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs text-muted-foreground"
                onClick={() => toast.info("GitHub connect coming soon")}
              >
                <Github className="h-3.5 w-3.5" /> Connect GitHub
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs text-muted-foreground"
                onClick={() => toast.info("Local upload coming soon")}
              >
                <Upload className="h-3.5 w-3.5" /> Upload local
              </Button>
              <div className="flex-1" />
              <Button
                size="sm"
                onClick={analyze}
                disabled={!repos.length}
                className="gap-1.5"
                style={
                  repos.length
                    ? {
                        background: "var(--gradient-accent)",
                        color: "oklch(0.99 0.005 260)",
                      }
                    : undefined
                }
              >
                Analyze {repos.length ? `(${repos.length})` : ""}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {repos.length === 0 && (
            <button
              onClick={demo}
              className="mt-6 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              or try a live demo with sample repositories →
            </button>
          )}
        </section>

        <section className="relative mx-auto grid max-w-5xl gap-3 px-6 pb-24 sm:grid-cols-3">
          {[
            {
              title: "Real ownership",
              body: "Detects features, modules, and who actually owns them — not just who touched files.",
            },
            {
              title: "Complexity-weighted",
              body: "Scores contributions by architectural depth, review load, and consistency over time.",
            },
            {
              title: "AI-generated report",
              body: "A professional summary explaining who built what — and why they scored the way they did.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-border/60 bg-card/30 p-5 transition-colors hover:bg-card/60"
            >
              <div
                className="mb-2 h-1 w-6 rounded-full"
                style={{ background: "var(--gradient-accent)" }}
              />
              <h3 className="text-sm font-medium">{f.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>
      </main>
    </AppShell>
  );
}
