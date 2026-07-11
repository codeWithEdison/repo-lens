/**
 * Classifies commits to reduce or exclude low-signal activity from scoring.
 * Excluded activity is retained in evidence with a clear reason.
 */

import type { RawCommit, ClassifiedCommit, CommitClassification } from "../types.js";

const BOT_EMAIL_PATTERNS = [
  /\[bot\]/i,
  /noreply@github\.com$/i,
  /dependabot/i,
  /renovate/i,
  /greenkeeper/i,
  /snyk-bot/i,
];

const BOT_NAME_PATTERNS = [
  /\[bot\]$/i,
  /^dependabot/i,
  /^renovate/i,
  /^greenkeeper/i,
  /^github-actions/i,
  /^semantic-release-bot/i,
];

/**
 * AI coding assistants commit under their own identity (as author or
 * co-author) rather than the human who prompted them. We treat them as
 * automated authors so they don't appear as separate human contributors and
 * don't dilute real contribution scores. The human's own direct commits still
 * count normally.
 */
const AI_ASSISTANT_EMAIL_PATTERNS = [
  /@lovable\.dev$/i,
  /@cursor\.(com|sh)$/i,
  /cursoragent@/i,
  /@anthropic\.com$/i, // Claude / Claude Code
  /@openai\.com$/i, // Codex / ChatGPT
  /@stackblitz\.com$/i, // bolt.new
  /@devin\.ai$/i,
  /@cognition(-ai|labs)?\./i, // Devin (Cognition)
];

const AI_ASSISTANT_NAME_PATTERNS = [
  /^lovable(\s|$|-)/i,
  /^cursor(\s|agent|$)/i,
  /^claude(\s|$)/i, // Claude, Claude Code
  /^copilot(\s|$)/i,
  /^github copilot/i,
  /^devin(\s|$)/i,
  /^bolt(\s|$)/i,
  /^v0(\s|$|\.)/i,
  /^codex(\s|$)/i,
  /^sweep(\s|$)/i,
  /^gemini code/i,
];

export function isAiAssistantIdentity(name: string, email: string): boolean {
  return (
    AI_ASSISTANT_EMAIL_PATTERNS.some((re) => re.test(email)) ||
    AI_ASSISTANT_NAME_PATTERNS.some((re) => re.test(name.trim()))
  );
}

const LOCKFILE_NAMES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
  "composer.lock",
  "gemfile.lock",
  "poetry.lock",
  "cargo.lock",
  "go.sum",
]);

const GENERATED_DIR_PATTERNS = [
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /(^|\/)out\//,
  /(^|\/)vendor\//,
  /(^|\/)node_modules\//,
  /(^|\/)\.next\//,
  /(^|\/)coverage\//,
  /\.gen\./,
  /\.min\.(js|css)$/,
  /(^|\/)generated\//,
  /routeTree\.gen\.ts$/,
];

const REVERT_RE = /^revert\b|this reverts commit/i;

export function isBotIdentity(name: string, email: string): boolean {
  return (
    BOT_EMAIL_PATTERNS.some((re) => re.test(email)) ||
    BOT_NAME_PATTERNS.some((re) => re.test(name)) ||
    isAiAssistantIdentity(name, email)
  );
}

function isLockfileOnly(commit: RawCommit): boolean {
  if (commit.files.length === 0) return false;
  return commit.files.every((f) => LOCKFILE_NAMES.has(basename(f.path).toLowerCase()));
}

function isGeneratedOnly(commit: RawCommit): boolean {
  if (commit.files.length === 0) return false;
  return commit.files.every((f) => GENERATED_DIR_PATTERNS.some((re) => re.test(f.path)));
}

function isFormattingOnly(commit: RawCommit): boolean {
  const msg = commit.message.toLowerCase();
  const looksLikeFormat = /\b(format|formatting|prettier|eslint --fix|lint fix|whitespace|reformat)\b/.test(
    msg,
  );
  // Heuristic: many files touched but message signals formatting, or the churn
  // is symmetric (equal insertions/deletions) across many files.
  return looksLikeFormat && commit.files.length > 0;
}

export function classifyCommit(commit: RawCommit): ClassifiedCommit {
  const isAiAssistant = isAiAssistantIdentity(commit.author.name, commit.author.email);
  const isBot = isBotIdentity(commit.author.name, commit.author.email);
  const isRevert = REVERT_RE.test(commit.message);
  const lockfileOnly = isLockfileOnly(commit);
  const generated = isGeneratedOnly(commit);
  const formattingOnly = isFormattingOnly(commit);

  let included = true;
  let reason: string | undefined;

  if (commit.isMerge) {
    included = false;
    reason = "Merge commit";
  } else if (isAiAssistant) {
    included = false;
    reason = "AI coding assistant commit";
  } else if (isBot) {
    included = false;
    reason = "Automated bot commit";
  } else if (lockfileOnly) {
    included = false;
    reason = "Lockfile-only change";
  } else if (generated) {
    included = false;
    reason = "Generated / build output only";
  } else if (formattingOnly) {
    included = false;
    reason = "Formatting-only change";
  } else if (isRevert) {
    included = false;
    reason = "Reverted change";
  }

  const classification: CommitClassification = {
    included,
    reason,
    isBot,
    isRevert,
    isFormattingOnly: formattingOnly,
    isLockfileOnly: lockfileOnly,
    isGenerated: generated,
  };

  return { ...commit, classification };
}

/** Return only the "meaningful" (non-generated, non-vendored) files of a commit. */
export function meaningfulFiles(commit: RawCommit): string[] {
  return commit.files
    .filter((f) => !GENERATED_DIR_PATTERNS.some((re) => re.test(f.path)))
    .filter((f) => !LOCKFILE_NAMES.has(basename(f.path).toLowerCase()))
    .map((f) => f.path);
}

function basename(p: string): string {
  const parts = p.split("/");
  return parts[parts.length - 1];
}
