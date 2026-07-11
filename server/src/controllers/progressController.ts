import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../errors/AppError.js";
import { workspace } from "../services/workspace.js";
import { loadActiveMetadata } from "../utils/analysisAccess.js";
import { logger } from "../config/logger.js";
import { SSE_EVENTS } from "@shared/contracts/index.js";
import type { AnalysisProgress } from "@shared/types/index.js";

export const getProgress = asyncHandler(async (req: Request, res: Response) => {
  const { analysisId } = req.params;
  await loadActiveMetadata(analysisId);

  const progress = await workspace.readProgress(analysisId);
  if (!progress) {
    throw AppError.notFound();
  }
  res.status(200).json(progress);
});

const HEARTBEAT_MS = 15000;
const POLL_MS = 1000;

/** Server-Sent Events stream for live progress updates. */
export const getProgressEvents = asyncHandler(async (req: Request, res: Response) => {
  const { analysisId } = req.params;
  await loadActiveMetadata(analysisId);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  let closed = false;
  let lastSerialized = "";

  const send = (event: string, data: unknown): void => {
    if (closed) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const readAndSend = async (): Promise<AnalysisProgress | null> => {
    let progress: AnalysisProgress | null = null;
    try {
      progress = await workspace.readProgress(analysisId);
    } catch (err) {
      logger.warn({ err, analysisId }, "SSE progress read failed");
      return null;
    }
    if (!progress) return null;
    const serialized = JSON.stringify(progress);
    if (serialized !== lastSerialized) {
      lastSerialized = serialized;
      send(SSE_EVENTS.progress, progress);
    }
    return progress;
  };

  // Initial snapshot.
  const initial = await readAndSend();
  if (initial && (initial.status === "completed" || initial.status === "failed")) {
    send(SSE_EVENTS.done, { status: initial.status });
    cleanup();
    res.end();
    return;
  }

  const pollTimer = setInterval(() => {
    void (async () => {
      const progress = await readAndSend();
      if (!progress) {
        // Workspace may have been deleted mid-stream.
        if (!(await workspace.workspaceExists(analysisId))) {
          send(SSE_EVENTS.error, { message: "Analysis no longer available." });
          cleanup();
          res.end();
        }
        return;
      }
      if (progress.status === "completed" || progress.status === "failed") {
        send(SSE_EVENTS.done, { status: progress.status });
        cleanup();
        res.end();
      }
    })();
  }, POLL_MS);

  const heartbeatTimer = setInterval(() => {
    send(SSE_EVENTS.heartbeat, { ts: Date.now() });
  }, HEARTBEAT_MS);

  function cleanup(): void {
    if (closed) return;
    closed = true;
    clearInterval(pollTimer);
    clearInterval(heartbeatTimer);
  }

  req.on("close", () => {
    cleanup();
  });
});
