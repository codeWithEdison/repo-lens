/**
 * WorkspaceService — the single gateway for all filesystem access to analysis
 * workspaces. Controllers and analyzers must go through this service instead of
 * touching the filesystem directly.
 *
 * The filesystem is the source of truth for progress, report and evidence data.
 * All JSON writes are atomic (write temp file, then rename) so readers never
 * observe partially-written files.
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

import {
  WORKSPACE_FILES,
  WORKSPACE_DIRS,
  EXPORT_FILES,
} from "../constants/index.js";
import type {
  AnalysisMetadata,
  AnalysisProgress,
  AnalysisLogEntry,
  ContributionReport,
  ContributionEvidence,
} from "../types/index.js";
import {
  analysisWorkspacePath,
  resolveWorkspaceRoot,
  safeJoin,
  assertRealPathInside,
} from "./paths.js";
import { assertValidAnalysisId } from "./ids.js";

export class WorkspaceService {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolveWorkspaceRoot(root);
  }

  getRoot(): string {
    return this.root;
  }

  getWorkspacePath(analysisId: string): string {
    return analysisWorkspacePath(this.root, analysisId);
  }

  async ensureRoot(): Promise<void> {
    await fsp.mkdir(this.root, { recursive: true });
  }

  async createWorkspace(analysisId: string): Promise<string> {
    const dir = this.getWorkspacePath(analysisId);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.mkdir(safeJoin(dir, WORKSPACE_DIRS.exports), { recursive: true });
    return dir;
  }

  async workspaceExists(analysisId: string): Promise<boolean> {
    if (!this.safeId(analysisId)) return false;
    try {
      const stat = await fsp.stat(this.getWorkspacePath(analysisId));
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  private safeId(analysisId: string): boolean {
    try {
      assertValidAnalysisId(analysisId);
      return true;
    } catch {
      return false;
    }
  }

  // ---- Atomic JSON primitives -------------------------------------------

  private async writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
    const dir = path.dirname(filePath);
    await fsp.mkdir(dir, { recursive: true });
    const tmp = path.join(dir, `.tmp-${randomBytes(6).toString("hex")}`);
    const payload = JSON.stringify(data, null, 2);
    await fsp.writeFile(tmp, payload, "utf8");
    await fsp.rename(tmp, filePath);
  }

  private async readJson<T>(filePath: string): Promise<T | null> {
    try {
      const raw = await fsp.readFile(filePath, "utf8");
      return JSON.parse(raw) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  private file(analysisId: string, name: string): string {
    return safeJoin(this.getWorkspacePath(analysisId), name);
  }

  // ---- Metadata ----------------------------------------------------------

  async writeMetadata(analysisId: string, metadata: AnalysisMetadata): Promise<void> {
    await this.writeJsonAtomic(this.file(analysisId, WORKSPACE_FILES.metadata), metadata);
  }

  async readMetadata(analysisId: string): Promise<AnalysisMetadata | null> {
    return this.readJson<AnalysisMetadata>(this.file(analysisId, WORKSPACE_FILES.metadata));
  }

  async updateMetadata(
    analysisId: string,
    patch: Partial<AnalysisMetadata>,
  ): Promise<AnalysisMetadata | null> {
    const current = await this.readMetadata(analysisId);
    if (!current) return null;
    const next: AnalysisMetadata = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await this.writeMetadata(analysisId, next);
    return next;
  }

  // ---- Progress ----------------------------------------------------------

  async writeProgress(analysisId: string, progress: AnalysisProgress): Promise<void> {
    await this.writeJsonAtomic(this.file(analysisId, WORKSPACE_FILES.progress), progress);
  }

  async readProgress(analysisId: string): Promise<AnalysisProgress | null> {
    return this.readJson<AnalysisProgress>(this.file(analysisId, WORKSPACE_FILES.progress));
  }

  // ---- Report ------------------------------------------------------------

  async writeReport(analysisId: string, report: ContributionReport): Promise<void> {
    await this.writeJsonAtomic(this.file(analysisId, WORKSPACE_FILES.report), report);
  }

  async readReport(analysisId: string): Promise<ContributionReport | null> {
    return this.readJson<ContributionReport>(this.file(analysisId, WORKSPACE_FILES.report));
  }

  // ---- Evidence ----------------------------------------------------------

  async writeEvidence(analysisId: string, evidence: ContributionEvidence): Promise<void> {
    await this.writeJsonAtomic(this.file(analysisId, WORKSPACE_FILES.evidence), evidence);
  }

  async readEvidence(analysisId: string): Promise<ContributionEvidence | null> {
    return this.readJson<ContributionEvidence>(this.file(analysisId, WORKSPACE_FILES.evidence));
  }

  // ---- Logs (JSON array) -------------------------------------------------

  async appendLog(analysisId: string, entry: AnalysisLogEntry): Promise<void> {
    const filePath = this.file(analysisId, WORKSPACE_FILES.logs);
    const existing = (await this.readJson<AnalysisLogEntry[]>(filePath)) ?? [];
    existing.push(entry);
    await this.writeJsonAtomic(filePath, existing);
  }

  async readLogs(analysisId: string): Promise<AnalysisLogEntry[]> {
    return (await this.readJson<AnalysisLogEntry[]>(this.file(analysisId, WORKSPACE_FILES.logs))) ?? [];
  }

  // ---- Repositories directory -------------------------------------------

  getRepositoriesDir(analysisId: string): string {
    return safeJoin(this.getWorkspacePath(analysisId), WORKSPACE_DIRS.repositories);
  }

  async createRepositoriesDir(analysisId: string): Promise<string> {
    const dir = this.getRepositoriesDir(analysisId);
    await fsp.mkdir(dir, { recursive: true });
    return dir;
  }

  getRepositoryPath(analysisId: string, dirName: string): string {
    return safeJoin(this.getRepositoriesDir(analysisId), dirName);
  }

  async deleteRepositoriesDirectory(analysisId: string): Promise<void> {
    const dir = this.getRepositoriesDir(analysisId);
    assertRealPathInside(this.getWorkspacePath(analysisId), dir);
    await fsp.rm(dir, { recursive: true, force: true });
  }

  // ---- Exports -----------------------------------------------------------

  getExportsDir(analysisId: string): string {
    return safeJoin(this.getWorkspacePath(analysisId), WORKSPACE_DIRS.exports);
  }

  getExportPath(analysisId: string, kind: keyof typeof EXPORT_FILES): string {
    return safeJoin(this.getExportsDir(analysisId), EXPORT_FILES[kind]);
  }

  async exportExists(analysisId: string, kind: keyof typeof EXPORT_FILES): Promise<boolean> {
    try {
      await fsp.access(this.getExportPath(analysisId, kind));
      return true;
    } catch {
      return false;
    }
  }

  async writeExport(
    analysisId: string,
    kind: keyof typeof EXPORT_FILES,
    data: string | Buffer | Uint8Array,
  ): Promise<void> {
    const filePath = this.getExportPath(analysisId, kind);
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp-${randomBytes(6).toString("hex")}`;
    await fsp.writeFile(tmp, data);
    await fsp.rename(tmp, filePath);
  }

  // ---- Deletion ----------------------------------------------------------

  async deleteWorkspace(analysisId: string): Promise<void> {
    if (!this.safeId(analysisId)) return;
    const dir = this.getWorkspacePath(analysisId);
    if (!fs.existsSync(dir)) return;
    assertRealPathInside(this.root, dir);
    await fsp.rm(dir, { recursive: true, force: true });
  }

  /** List all workspace directory names (validated) for cleanup scans. */
  async listWorkspaceIds(): Promise<string[]> {
    try {
      const entries = await fsp.readdir(this.root, { withFileTypes: true });
      return entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .filter((name) => this.safeId(name));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }
}
