import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Logo } from "./Logo";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="transition-opacity hover:opacity-80">
            <Logo />
          </Link>
          <nav className="flex items-center gap-6 text-sm text-muted-foreground">
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-foreground"
            >
              GitHub
            </a>
            <a href="#" className="transition-colors hover:text-foreground">
              Docs
            </a>
          </nav>
        </div>
      </header>
      {children}
      <footer className="mx-auto max-w-6xl px-6 py-10 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-6">
          <span>© {new Date().getFullYear()} RepoLens — Open source</span>
          <span>See who built what.</span>
        </div>
      </footer>
    </div>
  );
}