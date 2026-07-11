import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/AppError.js";
import { ERROR_CODES } from "@shared/constants/index.js";
import { sendError } from "../utils/response.js";
import { logger } from "../config/logger.js";

/** Central error-handling middleware. Never leaks stack traces or raw errors. */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // next is required for Express to recognize this as an error handler.
  _next: NextFunction,
): void {
  if (res.headersSent) {
    return;
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, reqId: req.id }, err.message);
    }
    sendError(res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  if (err instanceof ZodError) {
    sendError(
      res,
      400,
      ERROR_CODES.INVALID_REQUEST,
      "The request payload is invalid.",
      err.flatten(),
    );
    return;
  }

  logger.error({ err, reqId: req.id }, "Unhandled error");
  sendError(
    res,
    500,
    ERROR_CODES.INTERNAL_ERROR,
    "An unexpected error occurred.",
    null,
  );
}
