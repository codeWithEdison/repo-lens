/**
 * Transparent, configurable contribution scoring weights and helpers.
 *
 * The score is deliberately NOT based only on commit count or lines of code.
 * Every metric is normalized (0..1), weighted, and combined. Results are
 * evidence-based estimates, not mathematically absolute truths.
 */

import type { ContributionMetricKey } from "../types/index.js";

export interface MetricDefinition {
  key: ContributionMetricKey;
  label: string;
  weight: number;
}

/** Default weights. Total should equal 1.0 (100%). */
export const DEFAULT_METRIC_WEIGHTS: Record<ContributionMetricKey, number> = {
  featureOwnership: 0.3,
  delivery: 0.2,
  complexity: 0.15,
  consistency: 0.1,
  quality: 0.1,
  architecture: 0.05,
  review: 0.05,
  maintenance: 0.05,
};

export const METRIC_LABELS: Record<ContributionMetricKey, string> = {
  featureOwnership: "Feature Ownership",
  delivery: "Delivery and Completion",
  complexity: "Technical Complexity",
  consistency: "Consistency",
  quality: "Quality and Testing",
  architecture: "Architecture and Infrastructure",
  review: "Code Review and Collaboration",
  maintenance: "Maintenance and Stabilization",
};

export const METRIC_ORDER: ContributionMetricKey[] = [
  "featureOwnership",
  "delivery",
  "complexity",
  "consistency",
  "quality",
  "architecture",
  "review",
  "maintenance",
];

export function getMetricDefinitions(
  overrides: Partial<Record<ContributionMetricKey, number>> = {},
): MetricDefinition[] {
  return METRIC_ORDER.map((key) => ({
    key,
    label: METRIC_LABELS[key],
    weight: overrides[key] ?? DEFAULT_METRIC_WEIGHTS[key],
  }));
}

/** Clamp a number into [min, max]. */
export function clamp(value: number, min = 0, max = 1): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Min-max normalize a list of raw values into 0..1.
 * When all values are equal, everyone receives 0.5 (neutral) to avoid
 * artificially inflating a single contributor.
 */
export function normalizeValues(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => (max === 0 ? 0 : 0.5));
  return values.map((v) => (v - min) / (max - min));
}

/**
 * Normalize a set of scores so they total exactly 100 (rounded to 1 decimal).
 * Returns all zeros when the total is zero (no reliable contribution).
 */
export function toPercentages(scores: number[]): number[] {
  const total = scores.reduce((s, v) => s + v, 0);
  if (total <= 0) return scores.map(() => 0);
  const pcts = scores.map((v) => (v / total) * 100);
  return roundPreservingTotal(pcts, 100);
}

/**
 * Round an array of numbers to 1 decimal while preserving the target sum,
 * distributing the rounding remainder to the largest fractional parts.
 */
export function roundPreservingTotal(values: number[], target: number): number[] {
  const scaled = values.map((v) => v * 10);
  const floored = scaled.map((v) => Math.floor(v));
  let remainder = Math.round(target * 10) - floored.reduce((s, v) => s + v, 0);
  const order = scaled
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  const result = [...floored];
  for (let k = 0; k < order.length && remainder > 0; k++) {
    result[order[k].i] += 1;
    remainder--;
  }
  return result.map((v) => v / 10);
}
