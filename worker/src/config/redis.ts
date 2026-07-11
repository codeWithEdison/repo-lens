import { Redis } from "ioredis";
import { env } from "./env.js";
import { logger } from "./logger.js";

export const redisConnectionOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null as null,
};

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(redisConnectionOptions);
    client.on("error", (err) => logger.error({ err }, "Redis connection error"));
  }
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit().catch(() => undefined);
    client = null;
  }
}
