import type { Request, Response } from "express";
import fs from "node:fs";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../errors/AppError.js";
import { workspace } from "../services/workspace.js";
import { loadActiveMetadata } from "../utils/analysisAccess.js";
import { assertRealPathInside } from "@shared/workspace/paths.js";
import { ERROR_CODES } from "@shared/constants/index.js";

type ExportKind = "pdf" | "json" | "csv";

const CONTENT_TYPES: Record<ExportKind, string> = {
  pdf: "application/pdf",
  json: "application/json",
  csv: "text/csv",
};

function makeExportHandler(kind: ExportKind) {
  return asyncHandler(async (req: Request, res: Response) => {
    const { analysisId } = req.params;
    await loadActiveMetadata(analysisId);

    const ready = await workspace.exportExists(analysisId, kind);
    if (!ready) {
      throw new AppError(
        202,
        ERROR_CODES.EXPORT_NOT_READY,
        "The export is not ready yet.",
      );
    }

    const filePath = workspace.getExportPath(analysisId, kind);
    // Defense in depth: verify the resolved real path stays in the workspace.
    assertRealPathInside(workspace.getWorkspacePath(analysisId), filePath);

    const safeName = `repolens-${analysisId}.${kind}`;
    res.setHeader("Content-Type", CONTENT_TYPES[kind]);
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);

    const stream = fs.createReadStream(filePath);
    stream.on("error", () => {
      if (!res.headersSent) {
        res.status(500).end();
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  });
}

export const getPdfExport = makeExportHandler("pdf");
export const getJsonExport = makeExportHandler("json");
export const getCsvExport = makeExportHandler("csv");
