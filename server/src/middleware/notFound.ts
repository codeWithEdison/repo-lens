import type { Request, Response } from "express";
import { ERROR_CODES } from "@shared/constants/index.js";
import { sendError } from "../utils/response.js";

export function notFound(_req: Request, res: Response): void {
  sendError(res, 404, ERROR_CODES.ANALYSIS_NOT_FOUND, "Route not found.");
}
