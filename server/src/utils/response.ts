import type { Response } from "express";
import type { ApiErrorResponse } from "@shared/contracts/index.js";

export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details: unknown = null,
): void {
  const body: ApiErrorResponse = { error: { code, message, details } };
  res.status(statusCode).json(body);
}
