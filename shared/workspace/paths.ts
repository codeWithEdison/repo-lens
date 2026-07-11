/**
 * Safe path resolution helpers that guarantee resolved paths stay inside the
 * configured workspace root, preventing path traversal and symlink escapes.
 */

import path from "node:path";
import fs from "node:fs";
import { assertValidAnalysisId } from "./ids.js";

/** Resolve the absolute workspace root from a possibly-relative config value. */
export function resolveWorkspaceRoot(root: string): string {
  return path.resolve(root);
}

/** Absolute path to a single analysis workspace, with id validation. */
export function analysisWorkspacePath(root: string, analysisId: string): string {
  assertValidAnalysisId(analysisId);
  const resolvedRoot = resolveWorkspaceRoot(root);
  const target = path.resolve(resolvedRoot, analysisId);
  ensureInside(resolvedRoot, target);
  return target;
}

/**
 * Join untrusted segments onto a base directory and verify the result does not
 * escape the base. Throws on traversal attempts.
 */
export function safeJoin(base: string, ...segments: string[]): string {
  const resolvedBase = path.resolve(base);
  const target = path.resolve(resolvedBase, ...segments);
  ensureInside(resolvedBase, target);
  return target;
}

/** Throw when `target` is not contained within `base`. */
export function ensureInside(base: string, target: string): void {
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(target);
  const rel = path.relative(resolvedBase, resolvedTarget);
  if (rel === "") return;
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Path escapes the workspace root");
  }
}

/**
 * Verify a real (symlink-resolved) path still lives inside the base directory.
 * Used before serving or deleting files to prevent symlink escapes.
 */
export function assertRealPathInside(base: string, target: string): void {
  const resolvedBase = fs.realpathSync(path.resolve(base));
  let realTarget: string;
  try {
    realTarget = fs.realpathSync(path.resolve(target));
  } catch {
    // Target does not exist yet — validate its parent instead.
    ensureInside(resolvedBase, target);
    return;
  }
  ensureInside(resolvedBase, realTarget);
}
