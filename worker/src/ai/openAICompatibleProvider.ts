/**
 * OpenAICompatibleProvider — talks to any OpenAI-compatible chat completions
 * endpoint (OpenAI, Azure, local LLMs, etc.). It only sends bounded, structured
 * summaries — never repository source code or secrets. Falls back to the Noop
 * provider on any error so analysis never fails because of the AI layer.
 */

import type {
  AIProvider,
  ProjectSummaryInput,
  ProjectSummaryResult,
  FeatureExplanationInput,
  FeatureExplanationResult,
  ContributionExplanationInput,
  ContributionExplanationResult,
} from "./provider.js";
import { NoopAIProvider } from "./noopProvider.js";

interface OpenAICompatibleOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly id = "openai-compatible";
  private readonly fallback = new NoopAIProvider();

  constructor(private readonly options: OpenAICompatibleOptions) {}

  async summarizeProject(input: ProjectSummaryInput): Promise<ProjectSummaryResult> {
    const fallback = await this.fallback.summarizeProject(input);
    const text = await this.complete(
      "You write concise, neutral engineering contribution summaries. " +
        "Never invent facts beyond the provided structured data.",
      JSON.stringify(input),
      fallback.summary,
    );
    return { summary: text };
  }

  async explainFeature(input: FeatureExplanationInput): Promise<FeatureExplanationResult> {
    const fallback = await this.fallback.explainFeature(input);
    const text = await this.complete(
      "Explain feature ownership in one neutral sentence using only the data provided.",
      JSON.stringify(input),
      fallback.explanation,
    );
    return { explanation: text };
  }

  async explainContribution(
    input: ContributionExplanationInput,
  ): Promise<ContributionExplanationResult> {
    const fallback = await this.fallback.explainContribution(input);
    const text = await this.complete(
      "Explain a contributor's estimated contribution in one neutral sentence using only the data provided.",
      JSON.stringify(input),
      fallback.explanation,
    );
    return { explanation: text };
  }

  private async complete(system: string, user: string, fallback: string): Promise<string> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const res = await fetch(`${this.options.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.options.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: 0.2,
          max_tokens: 300,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) return fallback;
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content?.trim();
      return content && content.length > 0 ? content : fallback;
    } catch {
      return fallback;
    }
  }
}
