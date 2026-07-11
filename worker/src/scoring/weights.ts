/**
 * Scoring configuration.
 *
 * Adjust these weights to tune how contribution is estimated. Weights should
 * sum to 1.0. This is intentionally a server-side configuration file rather
 * than a UI so results stay transparent and reproducible.
 */

import type { ContributionMetricKey } from "@shared/types/index.js";
import { DEFAULT_METRIC_WEIGHTS, getMetricDefinitions } from "@shared/scoring/index.js";

/** Override any subset of the default weights here. */
export const WEIGHT_OVERRIDES: Partial<Record<ContributionMetricKey, number>> = {
  // Example: featureOwnership: 0.35,
};

export const activeMetricDefinitions = getMetricDefinitions(WEIGHT_OVERRIDES);

export const activeWeights: Record<ContributionMetricKey, number> = {
  ...DEFAULT_METRIC_WEIGHTS,
  ...WEIGHT_OVERRIDES,
};
