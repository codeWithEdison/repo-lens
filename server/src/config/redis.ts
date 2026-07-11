import { Redis } from "ioredis";
import { env } from "./env.js";
import { logger } from "./logger.js";

/**
 * Shared Redis connection options. BullMQ requires maxRetriesPerRequest=null.
 */
export const redisConnectionOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  // Required by BullMQ.
  maxRetriesPerRequest: null as null,
  connectTimeout: 3000,
  // The API producer should fail fast (and reject pending commands) rather than
  // block requests forever when Redis is unavailable. The worker uses its own
  // connection that keeps reconnecting.
  retryStrategy: (times: number): number | null => (times > 3 ? null : 200),
};

let client: Redis | null = null;

/** Lazily created Redis client used for health checks and queue coordination. */
export function getRedis(): Redis {
  if (!client) {
    client = new Redis(redisConnectionOptions);
    client.on("error", (err) => logger.error({ err }, "Redis connection error"));
  }
  return client;
}

export async function pingRedis(): Promise<boolean> {
  try {
    const res = await getRedis().ping();
    return res === "PONG";
  } catch {
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit().catch(() => undefined);
    client = null;
  }
}
