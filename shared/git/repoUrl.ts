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

  const segments = parsed.pathname
    .replace(/\.git$/i, "")
    .split("/")
    .filter(Boolean);

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
