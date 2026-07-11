import pino from "pino";
import { env } from "./env.js";

export const logger = pino({
  level: env.isProduction ? "info" : "debug",
  base: { service: "repolens-server" },
  redact: {
    paths: ["req.headers.authorization", "accessToken", "*.accessToken"],
    remove: true,
  },
});
