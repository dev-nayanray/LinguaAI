/** Nearest-rank percentile — simple and dependency-free, adequate for the sample sizes this suite runs (hundreds, not millions). */
export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) {
    return NaN;
  }
  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.min(Math.max(index, 0), sortedValues.length - 1)]!;
}

export interface LatencyStats {
  count: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
}

export function computeStats(durationsMs: number[]): LatencyStats {
  const sorted = [...durationsMs].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    min: sorted[0] ?? NaN,
    max: sorted[sorted.length - 1] ?? NaN,
  };
}

export interface Budget {
  p50: number;
  p95: number;
  p99: number;
}

export function meetsBudget(stats: LatencyStats, budget: Budget): boolean {
  return stats.p50 < budget.p50 && stats.p95 < budget.p95 && stats.p99 < budget.p99;
}

export function formatStats(stats: LatencyStats): string {
  return `n=${stats.count} p50=${stats.p50.toFixed(1)}ms p95=${stats.p95.toFixed(1)}ms p99=${stats.p99.toFixed(1)}ms min=${stats.min.toFixed(1)}ms max=${stats.max.toFixed(1)}ms`;
}
