import { Router } from "express";
import analysisRoutes from "./analysisRoutes.js";
import healthRoutes from "./healthRoutes.js";

const router = Router();

router.use("/", healthRoutes);
router.use("/", analysisRoutes);

export default router;
