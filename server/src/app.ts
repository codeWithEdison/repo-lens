import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";

import { env } from "./config/env.js";
import { requestId } from "./middleware/requestId.js";
import { apiRateLimiter } from "./middleware/rateLimit.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import apiRoutes from "./routes/index.js";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins.length ? env.corsOrigins : true,
      methods: ["GET", "POST", "DELETE"],
      credentials: false,
    }),
  );

  app.use(requestId);
  app.use(express.json({ limit: `${env.MAX_REQUEST_BODY_KB}kb` }));

  app.use("/api", apiRateLimiter, apiRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
