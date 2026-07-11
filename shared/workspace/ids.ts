/**
 * Analysis ID generation and validation, plus safe local directory naming.
 *
 * Analysis IDs are public identifiers used directly in filesystem paths, so
 * they must be strictly validated to prevent path traversal.
 */

import { randomBytes } from "node:crypto";
import { ANALYSIS_ID_PREFIX } from "../constants/index.js";

const RANDOM_LENGTH = 8;
const ID_BODY_PATTERN = /^[a-f0-9]{6,32}$/;
const ANALYSIS_ID_PATTERN = new RegExp(`^${ANALYSIS_ID_PREFIX}[a-f0-9]{6,32}$`);

/** Generate a collision-resistant, URL-safe analysis id: analysis_<hex>. */
export function generateAnalysisId(): string {
  const random = randomBytes(RANDOM_LENGTH).toString("hex");
  return `${ANALYSIS_ID_PREFIX}${random}`;
}

/** Returns true when the id is a well-formed, safe analysis id. */
export function isValidAnalysisId(id: unknown): id is string {
  if (typeof id !== "string") return false;
  if (id.length > 64) return false;
  if (id.includes("/") || id.includes("\\") || id.includes("..") || /\s/.test(id)) {
    return false;
  }
  return ANALYSIS_ID_PATTERN.test(id);
}

/** Throws when the analysis id is invalid. */
export function assertValidAnalysisId(id: unknown): asserts id is string {
  if (!isValidAnalysisId(id)) {
    throw new Error(`Invalid analysis id: ${String(id)}`);
  }
}

export { ID_BODY_PATTERN };

/**
 * Derive a safe local directory name for a repository from an owner/name pair.
 * Only lowercase alphanumerics, dashes and underscores survive; a short index
 * suffix keeps names unique within a single analysis.
 */
export function safeRepositoryDirName(displayName: string, index: number): string {
  const base = displayName
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const safeBase = base || "repo";
  return `${safeBase}-${index}`;
}
