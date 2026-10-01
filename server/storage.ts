import fs from 'fs';
import path from 'path';
import { BenchmarkRunRaw, BenchmarkSummaryMetrics, BenchmarkConfig, ConcurrencyStatItem } from './types.js';

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

export async function seedInitialRunsIfEmpty(): Promise<void> {
  ensureDirectories();
}

export const normalizeModelKey = (id: string): string =>
  id.toLowerCase().replace(/^(meta|google|mistralai|nvidia)\//, '').replace(/[^a-z0-9]/g, '');

export async function getConcurrencyStats(modelId?: string): Promise<ConcurrencyStatItem[]> {
  ensureDirectories();
  const targetNorm = modelId && modelId !== 'all' ? normalizeModelKey(modelId) : null;

  try {
    const files = await fs.promises.readdir(RAW_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const validRuns: BenchmarkRunRaw[] = [];
    for (const file of jsonFiles) {
      try {
        const filePath = path.join(RAW_DIR, file);
        const data = await fs.promises.readFile(filePath, 'utf-8');
        const parsed: BenchmarkRunRaw = JSON.parse(data);

        // Filter only runs with valid completed requests and completed status
        if (!parsed.summary || (parsed.summary.completedRequests ?? 0) <= 0) {
          continue;
        }

        const rawModelId = parsed.model?.id || parsed.config?.modelId;
        if (!rawModelId) continue;

        if (targetNorm && normalizeModelKey(rawModelId) !== targetNorm && rawModelId !== modelId) {
          continue;
        }

        validRuns.push(parsed);
      } catch {
        // Skip corrupted or unreadable JSON files
      }
    }

    if (validRuns.length === 0) {
      return [];
    }

    // Sort descending by timestamp so newest runs come first
    validRuns.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Group runs by concurrency level, taking latest run per concurrency level
    const runsByConcurrency = new Map<number, BenchmarkRunRaw>();
    for (const run of validRuns) {
      const concurrency = run.config?.concurrency || run.summary.concurrencyPeak || 1;
      if (!runsByConcurrency.has(concurrency)) {
        runsByConcurrency.set(concurrency, run);
      }
    }

    const result: ConcurrencyStatItem[] = [];
    for (const [concurrency, run] of runsByConcurrency.entries()) {
      const aggregateTps = Number((run.summary.aggregateTps || 0).toFixed(1));
      const streamTps = Number((run.summary.meanStreamTps || (concurrency > 0 ? aggregateTps / concurrency : aggregateTps)).toFixed(1));
      const p50Ttft = Math.round(run.summary.ttft?.p50 || 0);
      const p95Ttft = Math.round(run.summary.ttft?.p95 || 0);
      const totalRequests = run.summary.completedRequests || run.summary.totalRequests || 0;

      result.push({
        concurrency,
        aggregateTps,
        streamTps,
        p50Ttft,
        p95Ttft,
        totalRequests,
        source: 'benchmark',
        runId: run.runId,
        timestamp: run.timestamp,
      });
    }

    return result.sort((a, b) => a.concurrency - b.concurrency);
  } catch (err) {
    console.error('[Storage] Error scanning raw files for concurrency stats:', err);
    return [];
  }
}


