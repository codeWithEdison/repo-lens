import { ERROR_CODES, type ErrorCode } from "@shared/constants/index.js";

/** A typed, HTTP-aware application error with a stable error code. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode | string;
  readonly details: unknown | null;

  constructor(
    statusCode: number,
    code: ErrorCode | string,
    message: string,
    details: unknown | null = null,
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details: unknown = null): AppError {
    return new AppError(400, ERROR_CODES.INVALID_REQUEST, message, details);
  }

  static notFound(message = "The requested analysis does not exist or has expired."): AppError {
    return new AppError(404, ERROR_CODES.ANALYSIS_NOT_FOUND, message);
  }

  static notReady(message = "The analysis is not ready yet."): AppError {
    return new AppError(202, ERROR_CODES.ANALYSIS_NOT_READY, message);
  }

  static expired(message = "This analysis has expired and its data was deleted."): AppError {
    return new AppError(410, ERROR_CODES.ANALYSIS_EXPIRED, message);
  }

  static queueUnavailable(message = "The analysis queue is currently unavailable."): AppError {
    return new AppError(503, ERROR_CODES.QUEUE_UNAVAILABLE, message);
  }

  static internal(message = "An unexpected error occurred."): AppError {
    return new AppError(500, ERROR_CODES.INTERNAL_ERROR, message);
  }
}
