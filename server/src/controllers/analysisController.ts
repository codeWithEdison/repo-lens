import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../errors/AppError.js";
import { createAnalysis, deleteAnalysis } from "../services/analysisService.js";
import { workspace } from "../services/workspace.js";
import { isValidAnalysisId } from "@shared/workspace/ids.js";
import type { DeleteAnalysisResponse } from "@shared/contracts/index.js";

export const postAnalysis = asyncHandler(async (req: Request, res: Response) => {
  const result = await createAnalysis(req.body);
  res.status(202).json(result);
});

export const deleteAnalysisHandler = asyncHandler(async (req: Request, res: Response) => {
  const { analysisId } = req.params;
  if (!isValidAnalysisId(analysisId)) {
    throw AppError.badRequest("Invalid analysis id.");
  }

  const existed = await workspace.workspaceExists(analysisId);
  await deleteAnalysis(analysisId);

  // Idempotent: succeeds whether or not the workspace existed.
  const body: DeleteAnalysisResponse = { analysisId, deleted: existed };
  res.status(200).json(body);
});
