import pino from "pino";
import { env } from "./env.js";

export const logger = pino({
  level: env.isProduction ? "info" : "debug",
  base: { service: "repolens-worker" },
  redact: {
    paths: ["accessToken", "*.accessToken", "GITHUB_TOKEN", "AI_API_KEY"],
    remove: true,
  },
});
