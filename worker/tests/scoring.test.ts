import { describe, it, expect } from "vitest";
import {
  normalizeValues,
  toPercentages,
  roundPreservingTotal,
  DEFAULT_METRIC_WEIGHTS,
} from "@shared/scoring/index.js";

describe("scoring helpers", () => {
  it("default metric weights sum to 1.0", () => {
    const total = Object.values(DEFAULT_METRIC_WEIGHTS).reduce((s, v) => s + v, 0);
    expect(Math.round(total * 1000) / 1000).toBe(1);
  });

  it("normalizeValues maps to 0..1 with min and max at extremes", () => {
    const norm = normalizeValues([10, 20, 30]);
    expect(norm[0]).toBe(0);
    expect(norm[2]).toBe(1);
    expect(norm[1]).toBeCloseTo(0.5, 5);
  });

  it("normalizeValues returns neutral 0.5 when all equal and non-zero", () => {
    expect(normalizeValues([5, 5, 5])).toEqual([0.5, 0.5, 0.5]);
  });

  it("toPercentages sums to 100", () => {
    const pcts = toPercentages([3, 1, 1]);
    expect(pcts.reduce((s, v) => s + v, 0)).toBeCloseTo(100, 5);
  });

  it("toPercentages returns zeros when total is zero", () => {
    expect(toPercentages([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it("roundPreservingTotal preserves the target sum", () => {
    const rounded = roundPreservingTotal([33.33, 33.33, 33.34], 100);
    expect(rounded.reduce((s, v) => s + v, 0)).toBeCloseTo(100, 5);
  });
});
