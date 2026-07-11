import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { workspace } from "./services/workspace.js";
import { closeQueues } from "./config/queue.js";
import { closeRedis } from "./config/redis.js";

async function main(): Promise<void> {
  await workspace.ensureRoot();

  const app = createApp();
  const server = app.listen(env.SERVER_PORT, () => {
    logger.info(
      { port: env.SERVER_PORT, workspace: workspace.getRoot() },
      "RepoLens API server started",
    );
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutting down API server");
    server.close();
    await closeQueues();
    await closeRedis();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "Fatal error starting API server");
  process.exit(1);
});
