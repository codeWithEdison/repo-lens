import { describe, it, expect } from "vitest";
import {
  generateAnalysisId,
  isValidAnalysisId,
  safeRepositoryDirName,
} from "@shared/workspace/ids.js";
import { safeJoin, ensureInside, analysisWorkspacePath } from "@shared/workspace/paths.js";

describe("analysis id", () => {
  it("generates ids with the analysis_ prefix", () => {
    const id = generateAnalysisId();
    expect(id).toMatch(/^analysis_[a-f0-9]+$/);
    expect(isValidAnalysisId(id)).toBe(true);
  });

  it("rejects path traversal and unsafe ids", () => {
    expect(isValidAnalysisId("analysis_../etc")).toBe(false);
    expect(isValidAnalysisId("analysis_/evil")).toBe(false);
    expect(isValidAnalysisId("analysis_ab cd")).toBe(false);
    expect(isValidAnalysisId("../../etc/passwd")).toBe(false);
    expect(isValidAnalysisId("analysis_ZZZ")).toBe(false);
    expect(isValidAnalysisId("")).toBe(false);
    expect(isValidAnalysisId(123 as unknown)).toBe(false);
  });

  it("derives safe repo directory names", () => {
    expect(safeRepositoryDirName("owner/Repo Name!", 0)).toBe("owner-repo-name-0");
    expect(safeRepositoryDirName("../../evil", 1)).toBe("evil-1");
  });
});

describe("safe paths", () => {
  it("safeJoin stays inside the base", () => {
    const joined = safeJoin("/tmp/base", "sub", "file.json");
    expect(joined).toContain("/tmp/base/sub/file.json");
  });

  it("safeJoin rejects traversal", () => {
    expect(() => safeJoin("/tmp/base", "../escape")).toThrow();
    expect(() => safeJoin("/tmp/base", "../../etc/passwd")).toThrow();
  });

  it("ensureInside throws when target escapes base", () => {
    expect(() => ensureInside("/tmp/base", "/tmp/other")).toThrow();
    expect(() => ensureInside("/tmp/base", "/tmp/base/child")).not.toThrow();
  });

  it("analysisWorkspacePath validates the id", () => {
    expect(() => analysisWorkspacePath("/tmp/ws", "../evil")).toThrow();
    expect(analysisWorkspacePath("/tmp/ws", "analysis_abcdef")).toContain("analysis_abcdef");
  });
});
