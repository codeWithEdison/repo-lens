import { Router } from "express";
import { postAnalysis, deleteAnalysisHandler } from "../controllers/analysisController.js";
import { getProgress, getProgressEvents } from "../controllers/progressController.js";
import { getReport } from "../controllers/reportController.js";
import {
  getPdfExport,
  getJsonExport,
  getCsvExport,
} from "../controllers/exportController.js";
import { createAnalysisRateLimiter } from "../middleware/rateLimit.js";

const router = Router();

router.post("/analyses", createAnalysisRateLimiter, postAnalysis);

router.get("/progress/:analysisId", getProgress);
router.get("/progress/:analysisId/events", getProgressEvents);

router.get("/report/:analysisId", getReport);

router.get("/export/pdf/:analysisId", getPdfExport);
router.get("/export/json/:analysisId", getJsonExport);
router.get("/export/csv/:analysisId", getCsvExport);

router.delete("/analysis/:analysisId", deleteAnalysisHandler);

export default router;
