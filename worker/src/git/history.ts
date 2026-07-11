/**
 * Git history extraction using simple-git. Produces RawCommit records with
 * per-file numstat data, merge detection and co-author trailers.
 *
 * Commit count and lines changed are collected as EVIDENCE only — never used
 * directly as a final contribution score.
 */

import type { SimpleGit } from "simple-git";
import { env } from "../config/env.js";
import type {
  RawCommit,
  CommitFileChange,
  GitIdentity,
} from "../types.js";

const UNIT = "\x1f";
const RECORD = "\x1e";

const COAUTHOR_RE = /co-authored-by:\s*(.+?)\s*<([^>]+)>/gi;

export interface HistoryResult {
  commits: RawCommit[];
  defaultBranch: string;
  branchAnalyzed: string;
}

export async function readHistory(git: SimpleGit): Promise<HistoryResult> {
  const branchAnalyzed = (await git.revparse(["--abbrev-ref", "HEAD"]).catch(() => "HEAD")).trim();
  let defaultBranch = branchAnalyzed;
  try {
    const head = await git.raw(["symbolic-ref", "refs/remotes/origin/HEAD"]);
    defaultBranch = head.trim().replace("refs/remotes/origin/", "") || branchAnalyzed;
  } catch {
    /* keep branchAnalyzed */
  }

  const max = String(env.GIT_MAX_COMMITS);

  const metaRaw = await git.raw([
    "log",
    `--max-count=${max}`,
    "--date=iso-strict",
    `--pretty=format:${RECORD}%H${UNIT}%an${UNIT}%ae${UNIT}%aI${UNIT}%P${UNIT}%s${UNIT}%b`,
  ]);

  const numstatRaw = await git.raw([
    "log",
    `--max-count=${max}`,
    "--numstat",
    `--pretty=format:${RECORD}%H`,
  ]);

  const numstatByHash = parseNumstat(numstatRaw);
  const commits: RawCommit[] = [];

  for (const chunk of metaRaw.split(RECORD)) {
    if (!chunk.trim()) continue;
    const fields = chunk.split(UNIT);
    if (fields.length < 6) continue;
    const [hash, an, ae, aI, parents, subject] = fields;
    const body = fields.slice(6).join(UNIT);
    const message = [subject, body].filter(Boolean).join("\n").trim();
    const files = numstatByHash.get(hash) ?? [];
    const insertions = files.reduce((s, f) => s + f.insertions, 0);
    const deletions = files.reduce((s, f) => s + f.deletions, 0);

    commits.push({
      hash,
      author: { name: an.trim(), email: ae.trim().toLowerCase() },
      date: aI.trim(),
      message,
      isMerge: parents.trim().split(/\s+/).filter(Boolean).length > 1,
      coAuthors: extractCoAuthors(message),
      files,
      insertions,
      deletions,
    });
  }

  return { commits, defaultBranch, branchAnalyzed };
}

function extractCoAuthors(message: string): GitIdentity[] {
  const result: GitIdentity[] = [];
  let m: RegExpExecArray | null;
  COAUTHOR_RE.lastIndex = 0;
  while ((m = COAUTHOR_RE.exec(message)) !== null) {
    result.push({ name: m[1].trim(), email: m[2].trim().toLowerCase() });
  }
  return result;
}

function parseNumstat(raw: string): Map<string, CommitFileChange[]> {
  const map = new Map<string, CommitFileChange[]>();
  for (const chunk of raw.split(RECORD)) {
    if (!chunk.trim()) continue;
    const lines = chunk.split("\n");
    const hash = lines[0].trim();
    if (!hash) continue;
    const files: CommitFileChange[] = [];
    for (const line of lines.slice(1)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split("\t");
      if (parts.length < 3) continue;
      const insertions = parts[0] === "-" ? 0 : parseInt(parts[0], 10) || 0;
      const deletions = parts[1] === "-" ? 0 : parseInt(parts[1], 10) || 0;
      let filePath = parts.slice(2).join("\t");
      let status: CommitFileChange["status"] = "modified";
      if (filePath.includes(" => ")) {
        status = "renamed";
        filePath = normalizeRename(filePath);
      } else if (insertions === 0 && deletions > 0) {
        status = "deleted";
      } else if (deletions === 0 && insertions > 0) {
        status = "modified";
      }
      files.push({ path: filePath, insertions, deletions, status });
    }
    map.set(hash, files);
  }
  return map;
}

/** Resolve a numstat rename path like `a/{b => c}/d.ts` to the new path. */
function normalizeRename(raw: string): string {
  const braceMatch = raw.match(/^(.*)\{(.*) => (.*)\}(.*)$/);
  if (braceMatch) {
    const [, prefix, , to, suffix] = braceMatch;
    return `${prefix}${to}${suffix}`.replace(/\/\//g, "/");
  }
  const arrowMatch = raw.split(" => ");
  return arrowMatch[arrowMatch.length - 1];
}
