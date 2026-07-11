/**
 * PDF export generated from the same report.json model (no separate report
 * model). Uses pdfkit (pure JS, no native deps, no code execution).
 */

import PDFDocument from "pdfkit";
import type { ContributionReport } from "@shared/types/index.js";

export function buildPdf(report: ContributionReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const heading = (text: string): void => {
      doc.moveDown(0.8).fontSize(14).fillColor("#111").text(text);
      doc.moveDown(0.3).fontSize(10).fillColor("#333");
    };

    // Title
    doc.fontSize(22).fillColor("#111").text("RepoLens Contribution Report");
    doc.moveDown(0.2).fontSize(9).fillColor("#666").text(`Analysis ${report.analysisId}`);
    doc.text(`Generated ${new Date(report.generatedAt).toLocaleString()}`);

    heading("Repositories");
    report.repositories.forEach((r) => {
      doc.text(`• ${r.name} — ${r.commitCount} commits, ${r.contributorCount} contributors (${r.url})`);
    });

    heading("Project Summary");
    doc.text(report.projectSummary, { align: "left" });

    heading("Technologies");
    doc.text(`Languages: ${report.technologies.languages.map((l) => `${l.name} ${l.pct}%`).join(", ") || "n/a"}`);
    doc.text(`Frameworks: ${report.technologies.frameworks.join(", ") || "n/a"}`);
    doc.text(`Architecture: ${report.technologies.architecture}`);
    doc.text(`Size: ${report.technologies.projectSize}`);

    heading("Contribution Ranking (estimated)");
    report.contributionScores.forEach((s, i) => {
      doc
        .fontSize(11)
        .fillColor("#111")
        .text(`${i + 1}. ${s.name} — ${s.contributionPct}%  (final score ${s.finalScore})`);
      doc.fontSize(9).fillColor("#555").text(`   ${s.explanation}`);
      doc.fontSize(10).fillColor("#333");
    });

    heading("Detected Features");
    if (report.detectedFeatures.length === 0) {
      doc.text("No features detected with sufficient confidence.");
    }
    report.detectedFeatures.forEach((f) => {
      const owner = report.contributors.find((c) => c.id === f.primaryContributor)?.name ?? "unknown";
      doc.text(`• ${f.name} (${f.complexity}, confidence ${(f.confidence * 100).toFixed(0)}%) — owner: ${owner}`);
    });

    heading("Technical Share Recommendation");
    report.technicalShareRecommendation.forEach((t) => {
      doc.text(`• ${t.name}: ${t.sharePct}%`);
    });

    heading("Methodology");
    doc.fontSize(9).fillColor("#444").text(report.methodology);

    heading("Limitations");
    doc.fontSize(9).fillColor("#444");
    report.limitations.forEach((l) => doc.text(`• ${l}`));

    if (report.warnings.length) {
      heading("Warnings");
      doc.fontSize(9).fillColor("#a15c00");
      report.warnings.forEach((w) => doc.text(`• ${w}`));
    }

    doc
      .moveDown(1)
      .fontSize(8)
      .fillColor("#999")
      .text(
        "RepoLens produces evidence-based technical contribution estimates. It should support human discussion and should not be treated as an unquestionable legal, financial, employment, or equity decision.",
      );

    doc.end();
  });
}
