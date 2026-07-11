import type { AIProvider } from "./provider.js";
import { NoopAIProvider } from "./noopProvider.js";
import { OpenAICompatibleProvider } from "./openAICompatibleProvider.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

let provider: AIProvider | null = null;

/** Resolve the configured AI provider. Defaults to the Noop provider. */
export function getAIProvider(): AIProvider {
  if (provider) return provider;

  if (env.AI_PROVIDER === "openai-compatible" && env.AI_BASE_URL && env.AI_API_KEY && env.AI_MODEL) {
    logger.info({ model: env.AI_MODEL }, "Using OpenAI-compatible AI provider");
    provider = new OpenAICompatibleProvider({
      baseUrl: env.AI_BASE_URL,
      apiKey: env.AI_API_KEY,
      model: env.AI_MODEL,
    });
  } else {
    provider = new NoopAIProvider();
  }
  return provider;
}

export type { AIProvider } from "./provider.js";
