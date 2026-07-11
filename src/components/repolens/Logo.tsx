export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className="grid h-7 w-7 place-items-center rounded-lg"
        style={{ background: "var(--gradient-accent)", boxShadow: "var(--shadow-glow)" }}
      >
        <div className="h-2.5 w-2.5 rounded-full bg-background" />
      </div>
      <span className="text-[15px] font-semibold tracking-tight">RepoLens</span>
    </div>
  );
}