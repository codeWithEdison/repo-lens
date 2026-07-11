import { describe, it, expect } from "vitest";
import {
  validateRepositoryUrl,
  normalizeForComparison,
  RepoUrlError,
} from "@shared/git/repoUrl.js";

describe("repository URL validation", () => {
  it("accepts a valid GitHub URL and normalizes it", () => {
    const parsed = validateRepositoryUrl("https://github.com/tanstack/router");
    expect(parsed.provider).toBe("github");
    expect(parsed.owner).toBe("tanstack");
    expect(parsed.name).toBe("router");
    expect(parsed.cleanUrl).toBe("https://github.com/tanstack/router.git");
  });

  it("rejects file:// URLs and local paths", () => {
    expect(() => validateRepositoryUrl("file:///etc/passwd")).toThrow(RepoUrlError);
    expect(() => validateRepositoryUrl("/etc/passwd")).toThrow(RepoUrlError);
  });

  it("rejects localhost and private IPs (SSRF)", () => {
    expect(() => validateRepositoryUrl("http://localhost/x/y")).toThrow();
    expect(() => validateRepositoryUrl("http://127.0.0.1/x/y")).toThrow();
    expect(() => validateRepositoryUrl("http://10.0.0.5/x/y")).toThrow();
    expect(() => validateRepositoryUrl("http://169.254.169.254/x/y")).toThrow();
    expect(() => validateRepositoryUrl("http://192.168.1.1/x/y")).toThrow();
  });

  it("rejects credential-injected URLs", () => {
    expect(() => validateRepositoryUrl("https://user:pass@github.com/a/b")).toThrow();
  });

  it("rejects unsupported hosts by default", () => {
    try {
      validateRepositoryUrl("https://example.com/a/b");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(RepoUrlError);
      expect((err as RepoUrlError).code).toBe("UNSUPPORTED_REPOSITORY_PROVIDER");
    }
  });

  it("allows self-hosted hosts when configured", () => {
    const parsed = validateRepositoryUrl("https://git.acme.com/team/app", {
      allowedHosts: ["git.acme.com"],
    });
    expect(parsed.host).toBe("git.acme.com");
    expect(parsed.provider).toBe("generic");
  });

  it("requires an owner and repo name", () => {
    expect(() => validateRepositoryUrl("https://github.com/onlyowner")).toThrow();
  });

  it("normalizeForComparison ignores .git and trailing slash and case", () => {
    expect(normalizeForComparison("https://GitHub.com/A/B.git/")).toBe(
      normalizeForComparison("https://github.com/a/b"),
    );
  });
});
