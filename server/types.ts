export interface BenchmarkModel {
  id: string;
  name: string;
  provider: 'nvidia_nim' | 'google_gemini' | 'hyperqwen';
  contextLimit: number;
  description: string;
  recommendedConcurrency: number;
  parameterSize: string;
}

export interface ContextWindowOption {
  value: number;
  label: string;
}

export interface WorkloadPreset {
  id: string;
  name: string;
  description: string;
  promptTokens: number;
  targetOutputTokens: number;
  concurrency: number;
  totalRequests: number;
  systemPromptPreset: 'agentic_tool' | 'code_synthesis' | 'doc_reasoning' | 'general';
  isSequentialLadder?: boolean;
  ladderSteps?: number[];
  enableKvCacheReuse?: boolean;
}

export interface BenchmarkConfig {
  modelId: string;
  promptTokens: number;
  targetOutputTokens: number;
  concurrency: number;
  totalRequests: number;
  temperature: number;
  systemPromptPreset?: 'agentic_tool' | 'code_synthesis' | 'doc_reasoning' | 'general';
  isSequentialLadder?: boolean;
  ladderSteps?: number[];
  enableKvCacheReuse?: boolean;
  contextStart?: number;
  contextEnd?: number;
}

export interface LadderStepResult {
  stepIndex: number;
  contextTokens: number;
  coldTtft: number;
  warmTtft: number;
  speedupFactor: number;
  tps: number;
  tokensGenerated: number;
  durationMs: number;
  status: 'completed' | 'failed';
}

export interface TokenChunkMetric {
  chunkIndex: number;
  tokensInChunk: number;
  timestampMs: number;
  deltaMs: number; // ITL: Inter-token latency
}

export interface SingleRequestMetric {
  requestId: number;
  workerSlot: number;
  startTime: number;
  ttft: number; // Time to First Token in ms
  totalDurationMs: number;
  promptTokens: number;
  completionTokens: number;
  tps: number; // Tokens per second for this stream
  itlList: number[]; // ITL deltas
  avgItl: number;
  status: 'completed' | 'failed' | 'cancelled';
  statusCode: number;
  error?: string;
  samplePreview?: string;
  isWarmKvCache?: boolean;
  coldTtftRef?: number;
}

export interface PercentileMetrics {
  mean: number;
  p50: number; // Median
  p90: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
}

export interface BenchmarkSummaryMetrics {
  totalWallTimeMs: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  aggregateTps: number; // Total completion tokens / Total wall time (s)
  meanStreamTps: number;
  ttft: PercentileMetrics;
  itl: PercentileMetrics;
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  concurrencyPeak: number;
  ladderSteps?: LadderStepResult[];
  avgKvCacheSpeedup?: number;
  kvCacheHitRatePercent?: number;
}

export interface BenchmarkRunRaw {
  runId: string;
  timestamp: string;
  model: {
    id: string;
    name: string;
    provider: string;
    endpoint: string;
  };
  config: BenchmarkConfig;
  summary: BenchmarkSummaryMetrics;
  requests: SingleRequestMetric[];
  telemetryPoints: {
    elapsedMs: number;
    activeWorkers: number;
    completedRequests: number;
    cumulativeTokens: number;
    instantaneousTps: number;
  }[];
}

export interface BenchmarkProgressEvent {
  runId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  elapsedMs: number;
  activeWorkers: number;
  completedCount: number;
  failedCount: number;
  totalRequests: number;
  cumulativeTokens: number;
  currentTps: number;
  rollingAvgTtft: number;
  latestRequest?: {
    requestId: number;
    ttft: number;
    tps: number;
    completionTokens: number;
    status: string;
  };
  summary?: BenchmarkSummaryMetrics;
  error?: string;
}
