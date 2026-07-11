import logoUrl from "@/asset/logo-trimmed.png";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center ${className}`}>
      <img
        src={logoUrl}
        alt="RepoLens"
        className="h-11 w-auto select-none"
        draggable={false}
      />
    </span>
  );
}
