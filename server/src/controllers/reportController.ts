import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../errors/AppError.js";
import { workspace } from "../services/workspace.js";
import { loadActiveMetadata } from "../utils/analysisAccess.js";
import { ERROR_CODES } from "@shared/constants/index.js";

export const getReport = asyncHandler(async (req: Request, res: Response) => {
  const { analysisId } = req.params;
  const metadata = await loadActiveMetadata(analysisId);

  if (metadata.status === "failed") {
    const message = metadata.error?.message ?? "The analysis failed.";
    throw new AppError(422, ERROR_CODES.ANALYSIS_FAILED, message, {
      code: metadata.error?.code ?? ERROR_CODES.INTERNAL_ERROR,
    });
  }

  if (metadata.status !== "completed" || !metadata.reportReady) {
    // Not ready yet: 202 with progress hint.
    const progress = await workspace.readProgress(analysisId);
    res.status(202).json({
      status: metadata.status,
      message: "The report is still being generated.",
      progress: progress
        ? { overallProgress: progress.overallProgress, currentStage: progress.currentStage }
        : null,
    });
    return;
  }

  const report = await workspace.readReport(analysisId);
  if (!report) {
    throw AppError.notReady("The report is still being generated.");
  }
  res.status(200).json(report);
});
