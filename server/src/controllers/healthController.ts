import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { pingRedis } from "../config/redis.js";

export const getHealth = asyncHandler(async (_req: Request, res: Response) => {
  const redis = await pingRedis();
  const healthy = redis;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    redis: redis ? "up" : "down",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});
