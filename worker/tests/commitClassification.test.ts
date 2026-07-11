import { describe, it, expect } from "vitest";
import {
  classifyCommit,
  isBotIdentity,
  isAiAssistantIdentity,
  meaningfulFiles,
} from "../src/analyzers/commitClassification.js";
import type { RawCommit } from "../src/types.js";

function commit(partial: Partial<RawCommit>): RawCommit {
  return {
    hash: "abc123",
    author: { name: "Jane Dev", email: "jane@example.com" },
    date: new Date().toISOString(),
    message: "feat: add thing",
    isMerge: false,
    coAuthors: [],
    files: [{ path: "src/app.ts", insertions: 10, deletions: 2, status: "modified" }],
    insertions: 10,
    deletions: 2,
    ...partial,
  };
}

describe("commit classification", () => {
  it("detects bot identities", () => {
    expect(isBotIdentity("dependabot[bot]", "49699333+dependabot[bot]@users.noreply.github.com")).toBe(true);
    expect(isBotIdentity("Jane Dev", "jane@example.com")).toBe(false);
  });

  it("detects AI coding assistants as automated authors", () => {
    expect(isAiAssistantIdentity("Lovable", "bot@lovable.dev")).toBe(true);
    expect(isAiAssistantIdentity("Cursor Agent", "cursoragent@cursor.com")).toBe(true);
    expect(isAiAssistantIdentity("Claude", "noreply@anthropic.com")).toBe(true);
    expect(isAiAssistantIdentity("Copilot", "x@example.com")).toBe(true);
    // AI assistants are also treated as bots for scoring purposes.
    expect(isBotIdentity("Lovable", "bot@lovable.dev")).toBe(true);
    // A real developer whose name merely contains a substring is not caught.
    expect(isAiAssistantIdentity("Jane Dev", "jane@example.com")).toBe(false);
    expect(isAiAssistantIdentity("Marcus", "marcus@example.com")).toBe(false);
  });

  it("excludes AI coding assistant commits with a clear reason", () => {
    const c = classifyCommit(
      commit({ author: { name: "Lovable", email: "bot@lovable.dev" } }),
    );
    expect(c.classification.included).toBe(false);
    expect(c.classification.isBot).toBe(true);
    expect(c.classification.reason).toMatch(/ai coding assistant/i);
  });

  it("excludes merge commits", () => {
    const c = classifyCommit(commit({ isMerge: true }));
    expect(c.classification.included).toBe(false);
    expect(c.classification.reason).toMatch(/merge/i);
  });

  it("excludes lockfile-only commits", () => {
    const c = classifyCommit(
      commit({ files: [{ path: "package-lock.json", insertions: 500, deletions: 200, status: "modified" }] }),
    );
    expect(c.classification.included).toBe(false);
    expect(c.classification.isLockfileOnly).toBe(true);
  });

  it("excludes generated-output-only commits", () => {
    const c = classifyCommit(
      commit({ files: [{ path: "dist/bundle.js", insertions: 900, deletions: 0, status: "added" }] }),
    );
    expect(c.classification.included).toBe(false);
    expect(c.classification.isGenerated).toBe(true);
  });

  it("excludes revert commits", () => {
    const c = classifyCommit(commit({ message: "Revert \"feat: add thing\"" }));
    expect(c.classification.included).toBe(false);
    expect(c.classification.isRevert).toBe(true);
  });

  it("includes meaningful commits", () => {
    const c = classifyCommit(commit({}));
    expect(c.classification.included).toBe(true);
  });

  it("meaningfulFiles strips generated and lockfiles", () => {
    const files = meaningfulFiles(
      commit({
        files: [
          { path: "src/app.ts", insertions: 1, deletions: 0, status: "modified" },
          { path: "dist/x.js", insertions: 1, deletions: 0, status: "added" },
          { path: "yarn.lock", insertions: 1, deletions: 0, status: "modified" },
        ],
      }),
    );
    expect(files).toEqual(["src/app.ts"]);
  });
});
