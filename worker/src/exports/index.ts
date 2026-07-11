import { workspace } from "../services/workspace.js";
import type { ContributionReport } from "@shared/types/index.js";
import { buildCsv } from "./csv.js";
import { buildPdf } from "./pdf.js";

/** Generate and persist report.json, report.csv and report.pdf exports. */
export async function generateExports(
  analysisId: string,
  report: ContributionReport,
): Promise<void> {
  await workspace.writeExport(analysisId, "json", JSON.stringify(report, null, 2));
  await workspace.writeExport(analysisId, "csv", buildCsv(report));
  const pdf = await buildPdf(report);
  await workspace.writeExport(analysisId, "pdf", pdf);
}
