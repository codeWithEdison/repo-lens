/**
 * Frontend API client for the RepoLens stateless backend.
 *
 * The backend base URL is configurable via VITE_API_URL (defaults to the local
 * dev server). All analysis state lives on the server for the lifetime of the
 * temporary workspace; the client only needs the analysis id.
 */

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ||
  "http://localhost:4000";

export interface RepositoryRequest {
  url: string;
  branch?: string;
  accessToken?: string;
}

export interface CreateAnalysisResult {
  analysisId: string;
  status: string;
  progressUrl: string;
  reportUrl: string;
}

export type BackendAnalysisStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "expired";

export interface BackendRepositoryProgress {
  name: string;
  url: string;
  progress: number;
  status: string;
  currentStage?: string;
}

export interface BackendProgress {
  analysisId: string;
  status: BackendAnalysisStatus;
  overallProgress: number;
  currentStage: string;
  message: string;
  repositories: BackendRepositoryProgress[];
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  error: { code: string; message: string } | null;
}

export interface ApiError {
  code: string;
  message: string;
  details: unknown;
}

export class RepoLensApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: unknown = null,
  ) {
    super(message);
    this.name = "RepoLensApiError";
  }
}

async function parseError(res: Response): Promise<RepoLensApiError> {
  try {
    const body = (await res.json()) as { error?: ApiError };
    if (body.error) {
      return new RepoLensApiError(res.status, body.error.code, body.error.message, body.error.details);
    }
  } catch {
    /* ignore parse errors */
  }
  return new RepoLensApiError(res.status, "INTERNAL_ERROR", `Request failed (${res.status}).`);
}

export async function createAnalysis(
  repositories: RepositoryRequest[],
): Promise<CreateAnalysisResult> {
  const res = await fetch(`${API_BASE}/api/analyses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repositories }),
  });
  if (!res.ok && res.status !== 202) throw await parseError(res);
  return (await res.json()) as CreateAnalysisResult;
}

export async function getAnalysisProgress(analysisId: string): Promise<BackendProgress> {
  const res = await fetch(`${API_BASE}/api/progress/${analysisId}`);
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as BackendProgress;
}

export interface ProgressSubscription {
  close: () => void;
}

/**
 * Subscribe to live progress via Server-Sent Events. The caller supplies a
 * polling fallback for environments where SSE is unavailable.
 */
export function subscribeToAnalysisProgress(
  analysisId: string,
  handlers: {
    onProgress: (progress: BackendProgress) => void;
    onDone: (status: BackendAnalysisStatus) => void;
    onError: (err: Error) => void;
  },
): ProgressSubscription {
  if (typeof EventSource === "undefined") {
    return pollingFallback(analysisId, handlers);
  }

  let closed = false;
  const source = new EventSource(`${API_BASE}/api/progress/${analysisId}/events`);

  source.addEventListener("progress", (e) => {
    try {
      handlers.onProgress(JSON.parse((e as MessageEvent).data) as BackendProgress);
    } catch {
      /* ignore malformed event */
    }
  });
  source.addEventListener("done", (e) => {
    try {
      const data = JSON.parse((e as MessageEvent).data) as { status: BackendAnalysisStatus };
      handlers.onDone(data.status);
    } finally {
      close();
    }
  });
  source.addEventListener("error", () => {
    // SSE dropped — fall back to polling instead of surfacing an error.
    if (closed) return;
    source.close();
    pollingFallback(analysisId, handlers);
  });

  function close(): void {
    if (closed) return;
    closed = true;
    source.close();
  }

  return { close };
}

function pollingFallback(
  analysisId: string,
  handlers: {
    onProgress: (progress: BackendProgress) => void;
    onDone: (status: BackendAnalysisStatus) => void;
    onError: (err: Error) => void;
  },
): ProgressSubscription {
  let stopped = false;
  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const progress = await getAnalysisProgress(analysisId);
      handlers.onProgress(progress);
      if (progress.status === "completed" || progress.status === "failed" || progress.status === "expired") {
        handlers.onDone(progress.status);
        stopped = true;
        return;
      }
    } catch (err) {
      handlers.onError(err as Error);
      stopped = true;
      return;
    }
    setTimeout(() => void tick(), 1500);
  };
  void tick();
  return {
    close: () => {
      stopped = true;
    },
  };
}

export interface ReportResult<T> {
  status: "ready" | "pending";
  report?: T;
}

/**
 * Fetch the report. Returns { status: "pending" } while still generating (202),
 * throws RepoLensApiError on failure/not-found/expired.
 */
export async function getAnalysisReport<T = unknown>(analysisId: string): Promise<ReportResult<T>> {
  const res = await fetch(`${API_BASE}/api/report/${analysisId}`);
  if (res.status === 202) {
    return { status: "pending" };
  }
  if (!res.ok) throw await parseError(res);
  return { status: "ready", report: (await res.json()) as T };
}

function download(analysisId: string, kind: "pdf" | "json" | "csv"): void {
  const url = `${API_BASE}/api/export/${kind}/${analysisId}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = `repolens-${analysisId}.${kind}`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const downloadPdfExport = (id: string): void => download(id, "pdf");
export const downloadJsonExport = (id: string): void => download(id, "json");
export const downloadCsvExport = (id: string): void => download(id, "csv");

export async function deleteAnalysis(analysisId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/analysis/${analysisId}`, { method: "DELETE" });
  if (!res.ok) throw await parseError(res);
}
