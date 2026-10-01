import { PercentileMetrics, SingleRequestMetric, BenchmarkSummaryMetrics } from './types.js';

export function calculatePercentiles(values: number[]): PercentileMetrics {
  if (!values || values.length === 0) {
    return { mean: 0, p50: 0, p90: 0, p95: 0, p99: 0, min: 0, max: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = Number((sum / sorted.length).toFixed(2));
  const min = Number(sorted[0].toFixed(2));
  const max = Number(sorted[sorted.length - 1].toFixed(2));

  function getQuantile(q: number): number {
    if (sorted.length === 1) return sorted[0];
    const index = (sorted.length - 1) * q;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    if (lower === upper) return sorted[lower];
    return Number((sorted[lower] * (1 - weight) + sorted[upper] * weight).toFixed(2));
  }

  return {
    mean,
    p50: getQuantile(0.50),
    p90: getQuantile(0.90),
    p95: getQuantile(0.95),
    p99: getQuantile(0.99),
    min,
    max,
  };
}

export function aggregateBenchmarkMetrics(
  requests: SingleRequestMetric[],
  totalWallTimeMs: number
): BenchmarkSummaryMetrics {
  const completed = requests.filter(r => r.status === 'completed');
  const failed = requests.filter(r => r.status === 'failed');

  const ttftList = completed.map(r => r.ttft);
  const itlAll: number[] = [];
  completed.forEach(r => {
    if (r.itlList && r.itlList.length > 0) {
      itlAll.push(...r.itlList);
    }
  });

  const totalPromptTokens = requests.reduce((acc, r) => acc + r.promptTokens, 0);
  const totalCompletionTokens = completed.reduce((acc, r) => acc + r.completionTokens, 0);
  const totalTokens = totalPromptTokens + totalCompletionTokens;

  const wallTimeSec = totalWallTimeMs > 0 ? totalWallTimeMs / 1000 : 0.001;
  const aggregateTps = Number((totalCompletionTokens / wallTimeSec).toFixed(2));

  const streamTpsList = completed.map(r => r.tps).filter(t => t > 0);
  const meanStreamTps = streamTpsList.length > 0 
    ? Number((streamTpsList.reduce((a, b) => a + b, 0) / streamTpsList.length).toFixed(2))
    : 0;

  const ttftPercentiles = calculatePercentiles(ttftList);
  const itlPercentiles = calculatePercentiles(itlAll);

  // Peak concurrency detected
  const concurrencyPeak = requests.reduce((max, r) => Math.max(max, r.workerSlot + 1), 1);

  return {
    totalWallTimeMs: Math.round(totalWallTimeMs),
    totalPromptTokens,
    totalCompletionTokens,
    totalTokens,
    aggregateTps,
    meanStreamTps,
    ttft: ttftPercentiles,
    itl: itlPercentiles,
    totalRequests: requests.length,
    completedRequests: completed.length,
    failedRequests: failed.length,
    concurrencyPeak,
  };
}
