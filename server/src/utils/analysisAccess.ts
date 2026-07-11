import { AppError } from "../errors/AppError.js";
import { workspace } from "../services/workspace.js";
import { isValidAnalysisId } from "@shared/workspace/ids.js";
import type { AnalysisMetadata } from "@shared/types/index.js";

/**
 * Validate the id, ensure the workspace exists and is not expired, and return
 * its metadata. Throws AppError (404/410) as appropriate.
 */
export async function loadActiveMetadata(analysisId: string): Promise<AnalysisMetadata> {
  if (!isValidAnalysisId(analysisId)) {
    throw AppError.badRequest("Invalid analysis id.");
  }

  const exists = await workspace.workspaceExists(analysisId);
  if (!exists) {
    throw AppError.notFound();
  }

  const metadata = await workspace.readMetadata(analysisId);
  if (!metadata) {
    throw AppError.notFound();
  }

  if (metadata.status === "expired") {
    throw AppError.expired();
  }

  if (new Date(metadata.expiresAt).getTime() < Date.now()) {
    throw AppError.expired();
  }

  return metadata;
}
