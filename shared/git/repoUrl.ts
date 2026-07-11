/**
 * Repository URL validation and SSRF protection.
 *
 * Repository URLs are untrusted input. We only allow https(s) URLs pointing at
 * an explicit allowlist of public Git hosts (plus optional self-hosted hosts),
 * and reject anything that looks like a local address, private IP range, or a
 * credential-injected URL.
 */

import type { RepositoryProvider } from "../types/index.js";
import { DEFAULT_ALLOWED_GIT_HOSTS } from "../constants/index.js";

export interface RepoUrlValidationOptions {
  allowedHosts?: readonly string[];
}

export interface ParsedRepository {
  provider: RepositoryProvider;
  host: string;
  owner: string;
  name: string;
  /** Normalized https clone url without credentials. */
  cleanUrl: string;
  /** Short display name, e.g. "owner/name". */
  displayName: string;
  /** Branch detected from a web URL (e.g. .../tree/<branch>), if any. */
  branch?: string;
}

/**
 * Web-view path segments used by Git hosts to point at a branch/file/commit
 * rather than the repository root (e.g. github.com/o/r/tree/main). The repo
 * path is everything before the first of these.
 */
const WEB_VIEW_SEGMENTS = new Set([
  "tree",
  "blob",
  "commit",
  "commits",
  "releases",
  "tags",
  "branches",
  "pull",
  "pulls",
  "merge_requests",
  "issues",
  "actions",
  "wiki",
  "raw",
  "compare",
  "src", // bitbucket branch view
  "branch",
  "pull-requests", // bitbucket
]);

/** Segments after which the next segment is a branch/ref name. */
const BRANCH_PREFIX_SEGMENTS = new Set(["tree", "blob", "src", "branch"]);

/**
 * Reduce a URL path to the repository path segments, extracting a branch when
 * the URL is a web view like `/owner/repo/tree/<branch>`. Handles GitLab's
 * `/-/` separator (which precedes the view for nested group projects).
 */
function extractRepoPath(segments: string[]): { repoSegments: string[]; branch?: string } {
  const dashIdx = segments.indexOf("-");
  if (dashIdx > 1) {
    const repoSegments = segments.slice(0, dashIdx);
    const rest = segments.slice(dashIdx + 1);
    const branch = rest[0] && BRANCH_PREFIX_SEGMENTS.has(rest[0]) ? rest[1] : undefined;
    return { repoSegments, branch };
  }

  for (let i = 2; i < segments.length; i++) {
    if (WEB_VIEW_SEGMENTS.has(segments[i])) {
      const branch = BRANCH_PREFIX_SEGMENTS.has(segments[i]) ? segments[i + 1] : undefined;
      return { repoSegments: segments.slice(0, i), branch };
    }
  }
  return { repoSegments: segments };
}

const PRIVATE_IPV4_PATTERNS: RegExp[] = [
  /^10\./,
  /^127\./,
  /^169\.254\./, // link-local
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^0\./,
];

function isIpv4(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function isPrivateHost(host: string): boolean {
  const lower = host.toLowerCase();
  if (
    lower === "localhost" ||
    lower === "0.0.0.0" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal")
  ) {
    return true;
  }
  // Cloud metadata endpoint.
  if (lower === "169.254.169.254" || lower === "metadata.google.internal") {
    return true;
  }
  if (isIpv4(lower) && PRIVATE_IPV4_PATTERNS.some((re) => re.test(lower))) {
    return true;
  }
  // IPv6 loopback / link-local / unique-local.
  if (lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) {
    return true;
  }
  return false;
}

function providerForHost(host: string): RepositoryProvider {
  const lower = host.toLowerCase();
  if (lower === "github.com" || lower.endsWith(".github.com")) return "github";
  if (lower === "gitlab.com" || lower.endsWith(".gitlab.com")) return "gitlab";
  if (lower === "bitbucket.org" || lower.endsWith(".bitbucket.org")) return "bitbucket";
  return "generic";
}

export class RepoUrlError extends Error {
  constructor(
    public readonly code:
      | "INVALID_REPOSITORY_URL"
      | "UNSUPPORTED_REPOSITORY_PROVIDER",
    message: string,
  ) {
    super(message);
    this.name = "RepoUrlError";
  }
}

/**
 * Validate and normalize a repository URL. Throws RepoUrlError on failure.
 */
export function validateRepositoryUrl(
  rawUrl: string,
  options: RepoUrlValidationOptions = {},
): ParsedRepository {
  const allowedHosts = (options.allowedHosts && options.allowedHosts.length > 0
    ? options.allowedHosts
    : DEFAULT_ALLOWED_GIT_HOSTS
  ).map((h) => h.toLowerCase());

  const trimmed = (rawUrl ?? "").trim();
  if (!trimmed) {
    throw new RepoUrlError("INVALID_REPOSITORY_URL", "Repository URL is required.");
  }

  if (trimmed.startsWith("file:") || trimmed.startsWith("/") || /^[a-zA-Z]:\\/.test(trimmed)) {
    throw new RepoUrlError(
      "INVALID_REPOSITORY_URL",
      "Local filesystem paths are not allowed.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new RepoUrlError("INVALID_REPOSITORY_URL", "Malformed repository URL.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new RepoUrlError(
      "INVALID_REPOSITORY_URL",
      "Only http and https repository URLs are supported.",
    );
  }

  // Reject credential-injected URLs (user:pass@host). Tokens must be provided
  // via the dedicated accessToken field instead.
  if (parsed.username || parsed.password) {
    throw new RepoUrlError(
      "INVALID_REPOSITORY_URL",
      "Credentials must not be embedded in the repository URL.",
    );
  }

  const host = parsed.hostname.toLowerCase();
  if (isPrivateHost(host)) {
    throw new RepoUrlError(
      "INVALID_REPOSITORY_URL",
      "Private, local, or loopback hosts are not allowed.",
    );
  }

  const hostAllowed = allowedHosts.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
  if (!hostAllowed) {
    throw new RepoUrlError(
      "UNSUPPORTED_REPOSITORY_PROVIDER",
      `Repository host "${host}" is not in the allowed list.`,
    );
  }

  const allSegments = parsed.pathname
    .replace(/\.git$/i, "")
    .split("/")
    .filter(Boolean);

  // Strip web-view suffixes like /tree/<branch> or /blob/<branch>/<path> so a
  // pasted browser URL still resolves to the correct clone target.
  const { repoSegments: segments, branch } = extractRepoPath(allSegments);

  if (segments.length < 2) {
    throw new RepoUrlError(
      "INVALID_REPOSITORY_URL",
      "Repository URL must include an owner and repository name.",
    );
  }

  const owner = segments[0];
  const name = segments[segments.length - 1];
  const provider = providerForHost(host);
  const cleanUrl = `https://${host}/${segments.join("/")}.git`;

  return {
    provider,
    host,
    owner,
    name,
    cleanUrl,
    displayName: `${owner}/${name}`,
    branch,
  };
}

/** Compare two URLs for duplicate detection (ignores .git, trailing slash, case). */
export function normalizeForComparison(rawUrl: string): string {
  return rawUrl
    .trim()
    .toLowerCase()
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
}
