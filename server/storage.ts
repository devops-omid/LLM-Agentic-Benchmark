import fs from 'fs';
import path from 'path';
import { BenchmarkRunRaw, BenchmarkSummaryMetrics, BenchmarkConfig } from './types.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const RAW_DIR = path.join(DATA_DIR, 'raw');
const REPORTS_DIR = path.join(DATA_DIR, 'reports');

// Ensure directories exist
function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(RAW_DIR)) {
    fs.mkdirSync(RAW_DIR, { recursive: true });
  }
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
}

ensureDirectories();

export function generateRunId(modelId: string): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  
  const cleanModel = modelId
    .replace(/^meta\//, '')
    .replace(/^nvidia\//, '')
    .replace(/^mistralai\//, '')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .toLowerCase();

  return `bench_${yyyy}${mm}${dd}_${hh}${min}${ss}_${cleanModel}`;
}

export function generateMarkdownReport(raw: BenchmarkRunRaw): string {
  const { runId, timestamp, model, config, summary } = raw;
  const errorRate = summary.totalRequests > 0 
    ? ((summary.failedRequests / summary.totalRequests) * 100).toFixed(1)
    : '0.0';

  const concurrencyAnalysis = summary.concurrencyPeak >= 16 
    ? `Under high concurrency (${config.concurrency} concurrent streams), the model sustained **${summary.aggregateTps} tokens/sec** aggregate cluster throughput. Average TTFT reached **${summary.ttft.mean} ms** (p95: **${summary.ttft.p95} ms**). Tail latency remained ${summary.ttft.p99 < 800 ? 'resilient without severe queue saturation' : 'moderately affected by prefill queue contention'}.`
    : `Operating at moderate concurrency (${config.concurrency} workers), stream responsiveness was snappy with median TTFT of **${summary.ttft.p50} ms** and average per-stream generation speed of **${summary.meanStreamTps} TPS**.`;

  return `# LLM Speed & Latency Benchmark Report

- **Run Identifier:** \`${runId}\`
- **Execution Timestamp:** ${new Date(timestamp).toUTCString()}
- **Model Target:** \`${model.name}\` (\`${model.id}\`)
- **Inference Engine:** \`${model.provider.toUpperCase()}\` via \`${model.endpoint}\`

---

## 1. Workload Specification

| Parameter | Configured Value | Description |
| :--- | :--- | :--- |
| **Model** | \`${model.id}\` | Target model architecture |
| **Input Context** | \`${config.promptTokens.toLocaleString()} tokens\` | Calibrated prefill prompt payload |
| **Target Completion** | \`${config.targetOutputTokens.toLocaleString()} tokens\` | Target generated output per stream |
| **Concurrency Ceiling** | \`${config.concurrency} streams\` | Concurrent execution semaphore limit |
| **Total Test Requests** | \`${config.totalRequests} requests\` | Total synthetic runs planned |
| **Sampling Temperature** | \`${config.temperature}\` | Greedy/Creative generation balance |

---

## 2. Key Performance Indicators (KPIs)

| Performance Metric | Measured Value | Unit / Definition |
| :--- | :--- | :--- |
| **Aggregate Cluster Throughput** | **${summary.aggregateTps}** | \`tokens/sec\` across all active streams |
| **Mean Per-Stream Throughput** | **${summary.meanStreamTps}** | \`tokens/sec\` per client connection |
| **Time to First Token (TTFT Mean)** | **${summary.ttft.mean}** | \`ms\` prefill & queue transit |
| **Time to First Token (TTFT p50)** | **${summary.ttft.p50}** | \`ms\` median interactive responsiveness |
| **Inter-Token Latency (ITL Mean)** | **${summary.itl.mean}** | \`ms\` chunk-to-chunk delta |
| **Total Tokens Processed** | **${summary.totalTokens.toLocaleString()}** | \`${summary.totalPromptTokens.toLocaleString()}\` prompt + \`${summary.totalCompletionTokens.toLocaleString()}\` completion |
| **Total Benchmark Wall Time** | **${(summary.totalWallTimeMs / 1000).toFixed(2)}** | \`seconds\` total elapsed test time |
| **Success Rate** | **${(100 - parseFloat(errorRate)).toFixed(1)}%** | \`${summary.completedRequests} / ${summary.totalRequests}\` completed (${summary.failedRequests} errors) |
${summary.avgKvCacheSpeedup ? `| **Average KV-Cache Speedup** | **${summary.avgKvCacheSpeedup}x** | Acceleration via prefix reuse / RadixAttention |` : ''}

${summary.ladderSteps && summary.ladderSteps.length > 0 ? `---

## 3. Context Window Ladder & KV-Cache Acceleration

Sequential evaluation across escalating context depths, reusing prefix state across stages:

| Stage # | Context Depth | Cold TTFT | Warm TTFT (KV Cache) | Prefill Speedup | Stream TPS | Stage Duration |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${summary.ladderSteps.map(step => `| Stage ${step.stepIndex + 1} | \`${step.contextTokens.toLocaleString()} tokens\` | \`${step.coldTtft} ms\` | \`${step.warmTtft} ms\` | **${step.speedupFactor}x** | \`${step.tps} TPS\` | \`${(step.durationMs / 1000).toFixed(2)}s\` |`).join('\n')}

* **KV Cache Prefix Reuse:** Chaining context incrementally allows the inference engine (vLLM / RadixAttention / Gemini prompt cache) to skip re-evaluating preceding context blocks, reducing prefill latency from **${Math.max(...summary.ladderSteps.map(s => s.coldTtft))} ms** down to **${Math.min(...summary.ladderSteps.map(s => s.warmTtft))} ms**.
` : ''}
---

## ${summary.ladderSteps && summary.ladderSteps.length > 0 ? '4' : '3'}. Latency Distribution & Tail Percentiles

Detailed distribution across completed requests:

### Time to First Token (TTFT)
* **p50 (Median):** \`${summary.ttft.p50} ms\`
* **p90:** \`${summary.ttft.p90} ms\`
* **p95:** \`${summary.ttft.p95} ms\`
* **p99 (Tail):** \`${summary.ttft.p99} ms\`
* **Min / Max:** \`${summary.ttft.min} ms\` / \`${summary.ttft.max} ms\`

### Inter-Token Latency (ITL)
* **p50 (Median):** \`${summary.itl.p50} ms\`
* **p90:** \`${summary.itl.p90} ms\`
* **p95:** \`${summary.itl.p95} ms\`
* **p99 (Tail):** \`${summary.itl.p99} ms\`
* **Min / Max:** \`${summary.itl.min} ms\` / \`${summary.itl.max} ms\`

---

## ${summary.ladderSteps && summary.ladderSteps.length > 0 ? '5' : '4'}. Architectural Analysis & Concurrency Insights

${concurrencyAnalysis}

* **Prefill Saturation:** Input context of **${config.promptTokens} tokens** required approximately **${summary.ttft.p50} ms** for KV-cache initialization on ${model.name}.
* **Decode Efficiency:** Generation inter-token latency stabilized around **${summary.itl.p50} ms** per chunk, yielding **${summary.meanStreamTps} tokens/sec** per single client thread.
* **Error Resilience:** Rate limit and socket handling registered **${summary.failedRequests}** failed attempts under **${config.concurrency}** concurrent worker pressure.

---
*Report generated automatically by LLM Agentic Speed Benchmark Engine.*
`;
}

export async function saveBenchmarkRun(raw: BenchmarkRunRaw): Promise<{ rawPath: string; reportPath: string }> {
  ensureDirectories();
  const rawPath = path.join(RAW_DIR, `${raw.runId}.json`);
  const reportPath = path.join(REPORTS_DIR, `${raw.runId}.md`);

  const rawJson = JSON.stringify(raw, null, 2);
  const markdownContent = generateMarkdownReport(raw);

  // Write files
  await fs.promises.writeFile(rawPath, rawJson, 'utf-8');
  await fs.promises.writeFile(reportPath, markdownContent, 'utf-8');

  return { rawPath, reportPath };
}

export async function getHistoricalRuns(): Promise<Array<{
  runId: string;
  timestamp: string;
  model: string;
  provider: string;
  promptTokens: number;
  outputTokens: number;
  concurrency: number;
  totalRequests: number;
  aggregateTps: number;
  p50Ttft: number;
  p95Ttft: number;
  wallTimeSec: number;
  successRate: number;
}>> {
  ensureDirectories();
  const files = await fs.promises.readdir(RAW_DIR);
  const jsonFiles = files.filter(f => f.endsWith('.json'));

  const history = await Promise.all(
    jsonFiles.map(async file => {
      try {
        const filePath = path.join(RAW_DIR, file);
        const data = await fs.promises.readFile(filePath, 'utf-8');
        const parsed: BenchmarkRunRaw = JSON.parse(data);
        const total = parsed.summary?.totalRequests || parsed.config?.totalRequests || 1;
        const completed = parsed.summary?.completedRequests || 0;
        const successRate = total > 0 ? (completed / total) * 100 : 100;

        return {
          runId: parsed.runId,
          timestamp: parsed.timestamp,
          model: parsed.model?.name || parsed.config?.modelId || 'Unknown Model',
          provider: parsed.model?.provider || 'nvidia_nim',
          promptTokens: parsed.config?.promptTokens || 0,
          outputTokens: parsed.config?.targetOutputTokens || 0,
          concurrency: parsed.config?.concurrency || 1,
          totalRequests: total,
          aggregateTps: parsed.summary?.aggregateTps || 0,
          p50Ttft: parsed.summary?.ttft?.p50 || 0,
          p95Ttft: parsed.summary?.ttft?.p95 || 0,
          wallTimeSec: parsed.summary?.totalWallTimeMs ? Number((parsed.summary.totalWallTimeMs / 1000).toFixed(1)) : 0,
          successRate: Number(successRate.toFixed(1)),
        };
      } catch (err) {
        return null;
      }
    })
  );

  return history
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export async function getRunRaw(runId: string): Promise<BenchmarkRunRaw | null> {
  const filePath = path.join(RAW_DIR, `${runId}.json`);
  if (!fs.existsSync(filePath)) return null;
  const content = await fs.promises.readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

export async function getRunReport(runId: string): Promise<string | null> {
  const filePath = path.join(REPORTS_DIR, `${runId}.md`);
  if (!fs.existsSync(filePath)) return null;
  return await fs.promises.readFile(filePath, 'utf-8');
}

export async function deleteRun(runId: string): Promise<boolean> {
  const rawPath = path.join(RAW_DIR, `${runId}.json`);
  const reportPath = path.join(REPORTS_DIR, `${runId}.md`);
  let deleted = false;
  if (fs.existsSync(rawPath)) {
    await fs.promises.unlink(rawPath);
    deleted = true;
  }
  if (fs.existsSync(reportPath)) {
    await fs.promises.unlink(reportPath);
    deleted = true;
  }
  return deleted;
}

/**
 * Seed initial sample runs if directory is empty so user gets instantaneous analytical value!
 */
export async function seedInitialRunsIfEmpty() {
  ensureDirectories();
  const existing = await fs.promises.readdir(RAW_DIR);
  if (existing.length > 0) return;

  const sample1RunId = 'bench_20261001_063000_llama-3-1-70b-instruct';
  const sample1Raw: BenchmarkRunRaw = {
    runId: sample1RunId,
    timestamp: new Date(Date.now() - 3600 * 1000).toISOString(),
    model: {
      id: 'meta/llama-3.1-70b-instruct',
      name: 'Llama 3.1 70B Instruct',
      provider: 'nvidia_nim',
      endpoint: 'https://integrate.api.nvidia.com/v1',
    },
    config: {
      modelId: 'meta/llama-3.1-70b-instruct',
      promptTokens: 4096,
      targetOutputTokens: 512,
      concurrency: 12,
      totalRequests: 24,
      temperature: 0.2,
      systemPromptPreset: 'agentic_tool',
    },
    summary: {
      totalWallTimeMs: 16840,
      totalPromptTokens: 98304,
      totalCompletionTokens: 12288,
      totalTokens: 110592,
      aggregateTps: 729.69,
      meanStreamTps: 63.84,
      ttft: { mean: 242.5, p50: 228.0, p90: 284.0, p95: 312.0, p99: 348.0, min: 194.0, max: 355.0 },
      itl: { mean: 15.6, p50: 15.2, p90: 17.8, p95: 19.4, p99: 23.1, min: 12.0, max: 28.5 },
      totalRequests: 24,
      completedRequests: 24,
      failedRequests: 0,
      concurrencyPeak: 12,
    },
    requests: Array.from({ length: 24 }, (_, i) => ({
      requestId: i + 1,
      workerSlot: i % 12,
      startTime: 100 + i * 200,
      ttft: Math.round(210 + (Math.sin(i) + 1) * 45),
      totalDurationMs: 8200 + Math.round((Math.cos(i) + 1) * 800),
      promptTokens: 4096,
      completionTokens: 512,
      tps: Number((62 + (i % 5) * 1.5).toFixed(1)),
      itlList: [15, 14.8, 16.2, 15.5, 15.1],
      avgItl: 15.3,
      status: 'completed',
      statusCode: 200,
      samplePreview: '{"tool_call": "fetch_telemetry_batch", "arguments": {"cluster_id": "h100-sno-04", "sample_window": 60}}',
    })),
    telemetryPoints: Array.from({ length: 16 }, (_, i) => ({
      elapsedMs: (i + 1) * 1000,
      activeWorkers: i < 12 ? i + 1 : 12 - (i - 12) * 3,
      completedRequests: Math.min(24, Math.floor((i / 16) * 24)),
      cumulativeTokens: Math.floor((i / 16) * 12288),
      instantaneousTps: 680 + Math.floor(Math.sin(i) * 60),
    })),
  };

  const sample2RunId = 'bench_20261001_065000_llama-3-1-8b-instruct';
  const sample2Raw: BenchmarkRunRaw = {
    runId: sample2RunId,
    timestamp: new Date(Date.now() - 1200 * 1000).toISOString(),
    model: {
      id: 'meta/llama-3.1-8b-instruct',
      name: 'Llama 3.1 8B Instruct',
      provider: 'nvidia_nim',
      endpoint: 'https://integrate.api.nvidia.com/v1',
    },
    config: {
      modelId: 'meta/llama-3.1-8b-instruct',
      promptTokens: 512,
      targetOutputTokens: 128,
      concurrency: 16,
      totalRequests: 32,
      temperature: 0.1,
      systemPromptPreset: 'general',
    },
    summary: {
      totalWallTimeMs: 4620,
      totalPromptTokens: 16384,
      totalCompletionTokens: 4096,
      totalTokens: 20480,
      aggregateTps: 886.58,
      meanStreamTps: 114.2,
      ttft: { mean: 98.4, p50: 92.0, p90: 118.0, p95: 128.0, p99: 142.0, min: 82.0, max: 148.0 },
      itl: { mean: 8.7, p50: 8.4, p90: 10.1, p95: 11.2, p99: 13.5, min: 6.8, max: 15.0 },
      totalRequests: 32,
      completedRequests: 32,
      failedRequests: 0,
      concurrencyPeak: 16,
    },
    requests: Array.from({ length: 32 }, (_, i) => ({
      requestId: i + 1,
      workerSlot: i % 16,
      startTime: 50 + i * 100,
      ttft: Math.round(85 + (Math.sin(i) + 1) * 20),
      totalDurationMs: 1120 + Math.round((Math.cos(i) + 1) * 200),
      promptTokens: 512,
      completionTokens: 128,
      tps: Number((110 + (i % 6) * 2).toFixed(1)),
      itlList: [8.5, 8.2, 8.8, 8.6],
      avgItl: 8.6,
      status: 'completed',
      statusCode: 200,
      samplePreview: 'Benchmark completed nominal: all telemetry streams within expected low-latency boundaries.',
    })),
    telemetryPoints: Array.from({ length: 10 }, (_, i) => ({
      elapsedMs: (i + 1) * 500,
      activeWorkers: i < 8 ? (i + 1) * 2 : 16 - (i - 8) * 8,
      completedRequests: Math.min(32, Math.floor((i / 10) * 32)),
      cumulativeTokens: Math.floor((i / 10) * 4096),
      instantaneousTps: 840 + Math.floor(Math.sin(i) * 50),
    })),
  };

  await saveBenchmarkRun(sample1Raw);
  await saveBenchmarkRun(sample2Raw);
}
