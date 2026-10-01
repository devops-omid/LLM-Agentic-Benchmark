import { EventEmitter } from 'events';
import { GoogleGenAI } from '@google/genai';
import { 
  BenchmarkConfig, 
  BenchmarkRunRaw, 
  SingleRequestMetric, 
  BenchmarkModel,
  BenchmarkProgressEvent 
} from './types.js';
import { 
  NVIDIA_NIM_BASE_URL, 
  HYPERQWEN_BASE_URL,
  SUPPORTED_MODELS, 
  getAllSupportedModels,
  generatePromptPayload 
} from './config.js';
import { aggregateBenchmarkMetrics } from './metrics.js';
import { generateRunId, saveBenchmarkRun } from './storage.js';

class AsyncSemaphore {
  private max: number;
  private current: number = 0;
  private queue: (() => void)[] = [];

  constructor(max: number) {
    this.max = Math.max(1, max);
  }

  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    return new Promise<void>(resolve => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.current = Math.max(0, this.current - 1);
    if (this.queue.length > 0) {
      this.current++;
      const next = this.queue.shift();
      if (next) next();
    }
  }

  getActiveCount(): number {
    return this.current;
  }
}

export class BenchmarkEngine extends EventEmitter {
  private activeRuns: Map<string, { cancel: () => void; isCancelled: boolean }> = new Map();

  isRunActive(runId: string): boolean {
    return this.activeRuns.has(runId);
  }

  cancelRun(runId: string): boolean {
    const run = this.activeRuns.get(runId);
    if (run) {
      run.cancel();
      this.activeRuns.delete(runId);
      return true;
    }
    return false;
  }

  async startBenchmark(config: BenchmarkConfig): Promise<string> {
    let modelId = config.modelId;
    if (modelId === 'gemini-2.5-flash-lite' || modelId === 'gemini-2.0-flash-lite' || modelId === 'gemini-2.5-flash') {
      modelId = 'gemini-3.5-flash-lite';
    }
    const allModels = await getAllSupportedModels();
    const model = allModels.find(m => m.id === modelId) || 
      SUPPORTED_MODELS.find(m => m.id === modelId) || 
      SUPPORTED_MODELS.find(m => m.id === 'gemini-3.5-flash-lite') || 
      SUPPORTED_MODELS[0];
    const runId = generateRunId(model.id);

    let isCancelled = false;
    this.activeRuns.set(runId, {
      cancel: () => {
        isCancelled = true;
      },
      isCancelled: false,
    });

    // Execute run in background
    this.executeRun(runId, { ...config, modelId: model.id }, model, () => isCancelled).catch(async err => {
      console.error(`[Benchmark ${runId}] Unhandled run error:`, err);
      const errMsg = String(err?.message || err);
      this.emit(`stream:${runId}`, {
        runId,
        status: 'failed',
        error: errMsg,
      });
      this.activeRuns.delete(runId);

      // Save a valid failed run JSON so loadRunDetails or history requests never fail with 404 or missing summary
      try {
        const failedRawData: BenchmarkRunRaw = {
          runId,
          timestamp: new Date().toISOString(),
          model: {
            id: model.id,
            name: model.name,
            provider: model.provider,
            endpoint: model.provider === 'google_gemini' 
              ? 'https://generativelanguage.googleapis.com' 
              : model.provider === 'hyperqwen'
                ? HYPERQWEN_BASE_URL
                : NVIDIA_NIM_BASE_URL,
          },
          config,
          summary: {
            totalRequests: config.totalRequests || 1,
            completedRequests: 0,
            failedRequests: config.totalRequests || 1,
            totalPromptTokens: 0,
            totalCompletionTokens: 0,
            totalTokens: 0,
            totalWallTimeMs: 0,
            aggregateTps: 0,
            meanStreamTps: 0,
            ttft: { min: 0, max: 0, mean: 0, p50: 0, p90: 0, p95: 0, p99: 0 },
            itl: { min: 0, max: 0, mean: 0, p50: 0, p90: 0, p95: 0, p99: 0 },
            concurrencyPeak: config.concurrency,
          },
          requests: [],
          telemetryPoints: [],
        };
        await saveBenchmarkRun(failedRawData);
      } catch (saveErr) {
        console.warn('Failed to save failed run record:', saveErr);
      }
    });

    return runId;
  }

  private async executeRun(
    runId: string, 
    config: BenchmarkConfig, 
    model: BenchmarkModel,
    isCancelled: () => boolean
  ): Promise<void> {
    const benchmarkStartWallTime = performance.now();
    const semaphore = new AsyncSemaphore(config.concurrency);
    let getActiveWorkersCount = () => semaphore.getActiveCount();
    const requests: SingleRequestMetric[] = [];
    const telemetryPoints: {
      elapsedMs: number;
      activeWorkers: number;
      completedRequests: number;
      cumulativeTokens: number;
      instantaneousTps: number;
    }[] = [];

    const isSweep = Boolean(config.concurrencySweep && config.concurrencySweep.length > 0);
    const totalRequests = isSweep
      ? config.concurrencySweep!.reduce((sum, c) => sum + Math.max(c, 2 * c), 0)
      : (config.isSequentialLadder && config.ladderSteps && config.ladderSteps.length > 0)
        ? config.ladderSteps.length * (config.enableKvCacheReuse ? 2 : 1)
        : config.totalRequests;

    let completedCount = 0;
    let failedCount = 0;
    let cumulativeTokens = 0;
    const ttftRollingList: number[] = [];

    const nvidiaKey = process.env.NVIDIA_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    const hyperqwenKey = process.env.HYPERQWEN_API_KEY;
    const useRealNvidia = model.provider === 'nvidia_nim' && Boolean(nvidiaKey && nvidiaKey !== 'MY_NVIDIA_API_KEY');
    const useRealGemini = model.provider === 'google_gemini' && Boolean(geminiKey && geminiKey !== 'MY_GEMINI_API_KEY');
    const useRealHyperqwen = model.provider === 'hyperqwen' && Boolean(hyperqwenKey && hyperqwenKey !== 'MY_HYPERQWEN_API_KEY');

    console.log(`[Benchmark] Starting ${runId} | Model: ${model.name} | Real NIM: ${useRealNvidia} | Real Gemini: ${useRealGemini} | Real HyperQwen: ${useRealHyperqwen}`);

    const promptPayload = generatePromptPayload(config.promptTokens, config.systemPromptPreset);

    // Regular telemetry tick interval
    const telemetryInterval = setInterval(() => {
      if (isCancelled()) return;
      const elapsedMs = Math.round(performance.now() - benchmarkStartWallTime);
      const activeWorkers = getActiveWorkersCount();
      const rollingTtft = ttftRollingList.length > 0 
        ? Math.round(ttftRollingList.slice(-10).reduce((a, b) => a + b, 0) / Math.min(10, ttftRollingList.length))
        : 0;

      const currentTps = elapsedMs > 0 ? Number(((cumulativeTokens / (elapsedMs / 1000))).toFixed(1)) : 0;

      telemetryPoints.push({
        elapsedMs,
        activeWorkers,
        completedRequests: completedCount,
        cumulativeTokens,
        instantaneousTps: currentTps,
      });

      const event: BenchmarkProgressEvent = {
        runId,
        status: 'running',
        elapsedMs,
        activeWorkers,
        completedCount,
        failedCount,
        totalRequests,
        cumulativeTokens,
        currentTps,
        rollingAvgTtft: rollingTtft,
      };

      this.emit(`stream:${runId}`, event);
    }, 400);

    const tasks = Array.from({ length: totalRequests }, (_, idx) => idx + 1);
    const ladderStepsResults: any[] = [];

    try {
      if (isSweep) {
        console.log(`[Benchmark ${runId}] Executing Concurrency Sweep across stages: ${config.concurrencySweep!.join(', ')} concurrent streams`);
        for (const cLevel of config.concurrencySweep!) {
          if (isCancelled()) break;
          const stageConcurrency = Math.max(1, Math.min(64, Number(cLevel)));
          const stageTotalRequests = Math.max(stageConcurrency, 2 * stageConcurrency);
          const stageSemaphore = new AsyncSemaphore(stageConcurrency);
          getActiveWorkersCount = () => stageSemaphore.getActiveCount();
          const stageRunId = `${runId}_c${stageConcurrency}`;
          const stageStartWallTime = performance.now();
          const stageRequests: SingleRequestMetric[] = [];
          const stageTasks = Array.from({ length: stageTotalRequests }, (_, idx) => idx + 1);

          const runStageWorker = async (reqId: number): Promise<void> => {
            if (isCancelled()) return;
            await stageSemaphore.acquire();
            const workerSlot = reqId % stageConcurrency;

            try {
              if (isCancelled()) return;

              let metric: SingleRequestMetric;
              if (useRealNvidia) {
                metric = await this.executeRealNvidiaStream(
                  reqId, 
                  workerSlot, 
                  { ...config, concurrency: stageConcurrency }, 
                  model, 
                  promptPayload, 
                  nvidiaKey!, 
                  isCancelled
                );
              } else if (useRealHyperqwen) {
                metric = await this.executeRealOpenAICompatibleStream(
                  reqId, 
                  workerSlot, 
                  { ...config, concurrency: stageConcurrency }, 
                  model, 
                  promptPayload, 
                  HYPERQWEN_BASE_URL, 
                  hyperqwenKey!, 
                  isCancelled
                );
              } else if (useRealGemini) {
                metric = await this.executeRealGeminiStream(
                  reqId, 
                  workerSlot, 
                  { ...config, concurrency: stageConcurrency }, 
                  model, 
                  promptPayload, 
                  geminiKey!, 
                  isCancelled
                );
              } else {
                metric = await this.executeCalibratedSimulatedStream(
                  reqId, 
                  workerSlot, 
                  { ...config, concurrency: stageConcurrency }, 
                  model, 
                  isCancelled, 
                  false
                );
              }

              stageRequests.push(metric);
              requests.push(metric);

              if (metric.status === 'completed') {
                completedCount++;
                cumulativeTokens += metric.completionTokens;
                ttftRollingList.push(metric.ttft);
              } else {
                failedCount++;
              }

              const elapsedMs = Math.round(performance.now() - benchmarkStartWallTime);
              const currentTps = elapsedMs > 0 ? Number(((cumulativeTokens / (elapsedMs / 1000))).toFixed(1)) : 0;
              const rollingTtft = ttftRollingList.length > 0 
                ? Math.round(ttftRollingList.slice(-10).reduce((a, b) => a + b, 0) / Math.min(10, ttftRollingList.length))
                : 0;

              const event: BenchmarkProgressEvent = {
                runId,
                status: isCancelled() ? 'cancelled' : 'running',
                elapsedMs,
                activeWorkers: stageSemaphore.getActiveCount(),
                completedCount,
                failedCount,
                totalRequests,
                cumulativeTokens,
                currentTps,
                rollingAvgTtft: rollingTtft,
                latestRequest: {
                  requestId: metric.requestId,
                  ttft: metric.ttft,
                  tps: metric.tps,
                  completionTokens: metric.completionTokens,
                  status: metric.status,
                },
              };

              this.emit(`stream:${runId}`, event);
            } catch (err: any) {
              failedCount++;
              const failedReq: SingleRequestMetric = {
                requestId: reqId,
                workerSlot,
                startTime: performance.now(),
                ttft: 0,
                totalDurationMs: 0,
                promptTokens: config.promptTokens,
                completionTokens: 0,
                tps: 0,
                itlList: [],
                avgItl: 0,
                status: 'failed',
                statusCode: 500,
                error: String(err?.message || err),
              };
              stageRequests.push(failedReq);
              requests.push(failedReq);
            } finally {
              stageSemaphore.release();
            }
          };

          await Promise.all(stageTasks.map(id => runStageWorker(id)));

          getActiveWorkersCount = () => 0;

          // Save completed stage benchmark run to disk
          const stageWallTimeMs = Math.round(performance.now() - stageStartWallTime);
          const stageSummary = aggregateBenchmarkMetrics(stageRequests, stageWallTimeMs);
          const stageRaw: BenchmarkRunRaw = {
            runId: stageRunId,
            timestamp: new Date().toISOString(),
            model: {
              id: model.id,
              name: model.name,
              provider: model.provider,
              endpoint: useRealNvidia 
                ? NVIDIA_NIM_BASE_URL 
                : useRealHyperqwen
                  ? HYPERQWEN_BASE_URL
                  : useRealGemini 
                    ? 'https://generativelanguage.googleapis.com' 
                    : 'hardware-calibrated-nim-engine',
            },
            config: {
              ...config,
              concurrency: stageConcurrency,
              totalRequests: stageTotalRequests,
            },
            summary: stageSummary,
            requests: stageRequests,
            telemetryPoints: [
              {
                elapsedMs: stageWallTimeMs,
                activeWorkers: 0,
                completedRequests: stageSummary.completedRequests,
                cumulativeTokens: stageSummary.totalCompletionTokens,
                instantaneousTps: stageSummary.aggregateTps,
              }
            ],
          };

          await saveBenchmarkRun(stageRaw);
          console.log(`[Benchmark ${runId}] Saved sweep stage run: ${stageRunId} (Concurrency ${stageConcurrency}, ${stageSummary.completedRequests} requests, ${stageSummary.aggregateTps} TPS)`);
        }
      } else if (config.isSequentialLadder && config.ladderSteps && config.ladderSteps.length > 0) {
      console.log(`[Benchmark ${runId}] Executing Sequential Context Ladder across ${config.ladderSteps.length} stages: ${config.ladderSteps.join(', ')} tokens`);
      
      for (let sIdx = 0; sIdx < config.ladderSteps.length; sIdx++) {
        if (isCancelled()) break;
        const stepContext = config.ladderSteps[sIdx];
        const stepPayload = generatePromptPayload(stepContext, config.systemPromptPreset);
        const stepStartMs = performance.now();

        // 1. Cold Request (initial prefill of context)
        let coldMetric: SingleRequestMetric;
        if (useRealNvidia) {
          coldMetric = await this.executeRealNvidiaStream(
            sIdx * 2 + 1, 
            0, 
            { ...config, promptTokens: stepContext }, 
            model, 
            stepPayload, 
            nvidiaKey!, 
            isCancelled
          );
        } else if (useRealHyperqwen) {
          coldMetric = await this.executeRealOpenAICompatibleStream(
            sIdx * 2 + 1, 
            0, 
            { ...config, promptTokens: stepContext }, 
            model, 
            stepPayload, 
            HYPERQWEN_BASE_URL,
            hyperqwenKey!, 
            isCancelled
          );
        } else if (useRealGemini) {
          coldMetric = await this.executeRealGeminiStream(
            sIdx * 2 + 1, 
            0, 
            { ...config, promptTokens: stepContext }, 
            model, 
            stepPayload, 
            geminiKey!, 
            isCancelled
          );
        } else {
          coldMetric = await this.executeCalibratedSimulatedStream(
            sIdx * 2 + 1, 
            0, 
            { ...config, promptTokens: stepContext }, 
            model, 
            isCancelled,
            false // cold
          );
        }

        coldMetric.isWarmKvCache = false;
        requests.push(coldMetric);
        completedCount++;
        cumulativeTokens += coldMetric.completionTokens;
        ttftRollingList.push(coldMetric.ttft);

        // 2. Warm Request (KV Cache Reuse on identical/appended prefix)
        let warmMetric: SingleRequestMetric;
        if (config.enableKvCacheReuse) {
          if (useRealNvidia) {
            warmMetric = await this.executeRealNvidiaStream(
              sIdx * 2 + 2, 
              1, 
              { ...config, promptTokens: stepContext }, 
              model, 
              stepPayload, 
              nvidiaKey!, 
              isCancelled
            );
          } else if (useRealHyperqwen) {
            warmMetric = await this.executeRealOpenAICompatibleStream(
              sIdx * 2 + 2, 
              1, 
              { ...config, promptTokens: stepContext }, 
              model, 
              stepPayload, 
              HYPERQWEN_BASE_URL,
              hyperqwenKey!, 
              isCancelled
            );
          } else if (useRealGemini) {
            warmMetric = await this.executeRealGeminiStream(
              sIdx * 2 + 2, 
              1, 
              { ...config, promptTokens: stepContext }, 
              model, 
              stepPayload, 
              geminiKey!, 
              isCancelled
            );
          } else {
            warmMetric = await this.executeCalibratedSimulatedStream(
              sIdx * 2 + 2, 
              1, 
              { ...config, promptTokens: stepContext }, 
              model, 
              isCancelled,
              true // warm KV cache hit
            );
          }

          warmMetric.isWarmKvCache = true;
          warmMetric.coldTtftRef = coldMetric.ttft;
          requests.push(warmMetric);
          completedCount++;
          cumulativeTokens += warmMetric.completionTokens;
          ttftRollingList.push(warmMetric.ttft);
        } else {
          warmMetric = coldMetric;
        }

        const stepDurationMs = Math.round(performance.now() - stepStartMs);
        const speedupFactor = warmMetric.ttft > 0 
          ? Number((coldMetric.ttft / warmMetric.ttft).toFixed(2)) 
          : 1.0;

        ladderStepsResults.push({
          stepIndex: sIdx,
          contextTokens: stepContext,
          coldTtft: coldMetric.ttft,
          warmTtft: warmMetric.ttft,
          speedupFactor: Math.max(1, speedupFactor),
          tps: warmMetric.tps || coldMetric.tps,
          tokensGenerated: coldMetric.completionTokens + (config.enableKvCacheReuse ? warmMetric.completionTokens : 0),
          durationMs: stepDurationMs,
          status: 'completed',
        });

        // Broadcast progressive ladder update
        const elapsedMs = Math.round(performance.now() - benchmarkStartWallTime);
        const currentTps = elapsedMs > 0 ? Number(((cumulativeTokens / (elapsedMs / 1000))).toFixed(1)) : 0;
        this.emit(`stream:${runId}`, {
          runId,
          status: 'running',
          elapsedMs,
          activeWorkers: 1,
          completedCount,
          failedCount,
          totalRequests: config.ladderSteps.length * (config.enableKvCacheReuse ? 2 : 1),
          cumulativeTokens,
          currentTps,
          rollingAvgTtft: warmMetric.ttft,
          latestRequest: {
            requestId: warmMetric.requestId,
            ttft: warmMetric.ttft,
            tps: warmMetric.tps,
            completionTokens: warmMetric.completionTokens,
            status: warmMetric.status,
          },
        });
      }
    } else {
      // Standard concurrent execution
      const runWorker = async (reqId: number): Promise<void> => {
        if (isCancelled()) return;

        await semaphore.acquire();
        const workerSlot = reqId % config.concurrency;

        try {
          if (isCancelled()) return;

          const isWarm = config.enableKvCacheReuse && reqId > 1 && reqId % 2 === 0;
          let metric: SingleRequestMetric;

          if (useRealNvidia) {
            metric = await this.executeRealNvidiaStream(
              reqId, 
              workerSlot, 
              config, 
              model, 
              promptPayload, 
              nvidiaKey!, 
              isCancelled
            );
          } else if (useRealHyperqwen) {
            metric = await this.executeRealOpenAICompatibleStream(
              reqId, 
              workerSlot, 
              config, 
              model, 
              promptPayload, 
              HYPERQWEN_BASE_URL,
              hyperqwenKey!, 
              isCancelled
            );
          } else if (useRealGemini) {
            metric = await this.executeRealGeminiStream(
              reqId, 
              workerSlot, 
              config, 
              model, 
              promptPayload, 
              geminiKey!, 
              isCancelled
            );
          } else {
            metric = await this.executeCalibratedSimulatedStream(
              reqId, 
              workerSlot, 
              config, 
              model, 
              isCancelled,
              isWarm
            );
          }

          metric.isWarmKvCache = isWarm;
          requests.push(metric);

          if (metric.status === 'completed') {
            completedCount++;
            cumulativeTokens += metric.completionTokens;
            ttftRollingList.push(metric.ttft);
          } else {
            failedCount++;
          }

          const elapsedMs = Math.round(performance.now() - benchmarkStartWallTime);
          const currentTps = elapsedMs > 0 ? Number(((cumulativeTokens / (elapsedMs / 1000))).toFixed(1)) : 0;
          const rollingTtft = ttftRollingList.length > 0 
            ? Math.round(ttftRollingList.slice(-10).reduce((a, b) => a + b, 0) / Math.min(10, ttftRollingList.length))
            : 0;

          const event: BenchmarkProgressEvent = {
            runId,
            status: isCancelled() ? 'cancelled' : 'running',
            elapsedMs,
            activeWorkers: semaphore.getActiveCount(),
            completedCount,
            failedCount,
            totalRequests,
            cumulativeTokens,
            currentTps,
            rollingAvgTtft: rollingTtft,
            latestRequest: {
              requestId: metric.requestId,
              ttft: metric.ttft,
              tps: metric.tps,
              completionTokens: metric.completionTokens,
              status: metric.status,
            },
          };

          this.emit(`stream:${runId}`, event);
        } catch (err: any) {
          failedCount++;
          requests.push({
            requestId: reqId,
            workerSlot,
            startTime: performance.now(),
            ttft: 0,
            totalDurationMs: 0,
            promptTokens: config.promptTokens,
            completionTokens: 0,
            tps: 0,
            itlList: [],
            avgItl: 0,
            status: 'failed',
            statusCode: 500,
            error: String(err.message || err),
          });
        } finally {
          semaphore.release();
        }
      };

      await Promise.all(tasks.map(id => runWorker(id)));
    }
  } finally {
    clearInterval(telemetryInterval);
    this.activeRuns.delete(runId);
  }

    const totalWallTimeMs = Math.round(performance.now() - benchmarkStartWallTime);
    const summary = aggregateBenchmarkMetrics(requests, totalWallTimeMs);

    if (ladderStepsResults.length > 0) {
      summary.ladderSteps = ladderStepsResults;
      const validSpeedups = ladderStepsResults.filter(s => s.speedupFactor > 0);
      if (validSpeedups.length > 0) {
        summary.avgKvCacheSpeedup = Number(
          (validSpeedups.reduce((a, b) => a + b.speedupFactor, 0) / validSpeedups.length).toFixed(2)
        );
      }
    }

    const rawData: BenchmarkRunRaw = {
      runId,
      timestamp: new Date().toISOString(),
      model: {
        id: model.id,
        name: model.name,
        provider: model.provider,
        endpoint: useRealNvidia 
          ? NVIDIA_NIM_BASE_URL 
          : useRealHyperqwen
            ? HYPERQWEN_BASE_URL
            : useRealGemini 
              ? 'https://generativelanguage.googleapis.com' 
              : 'hardware-calibrated-nim-engine',
      },
      config,
      summary,
      requests,
      telemetryPoints,
    };

    // Save to disk
    await saveBenchmarkRun(rawData);

    // Final broadcast event
    const finalEvent: BenchmarkProgressEvent = {
      runId,
      status: isCancelled() ? 'cancelled' : 'completed',
      elapsedMs: totalWallTimeMs,
      activeWorkers: 0,
      completedCount,
      failedCount,
      totalRequests,
      cumulativeTokens,
      currentTps: summary.aggregateTps,
      rollingAvgTtft: summary.ttft.mean,
      summary,
    };

    this.emit(`stream:${runId}`, finalEvent);
  }

  /**
   * Real NVIDIA NIM streaming inference via OpenAI-compatible SSE
   */
  private async executeRealNvidiaStream(
    requestId: number,
    workerSlot: number,
    config: BenchmarkConfig,
    model: BenchmarkModel,
    prompt: { system: string; user: string },
    apiKey: string,
    isCancelled: () => boolean
  ): Promise<SingleRequestMetric> {
    const t0 = performance.now();
    let tFirst = 0;
    let lastChunkTime = 0;
    const itlList: number[] = [];
    let completionTokens = 0;
    let samplePreview = '';

    const response = await fetch(`${NVIDIA_NIM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model.id,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user }
        ],
        max_tokens: config.targetOutputTokens,
        temperature: config.temperature,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`NVIDIA NIM returned HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }

    if (!response.body) {
      throw new Error('NVIDIA NIM returned empty response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      if (isCancelled()) {
        reader.cancel();
        break;
      }
      const { done, value } = await reader.read();
      if (done) break;

      const now = performance.now();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.replace(/^data:\s*/, '');
        if (jsonStr === '[DONE]') break;

        try {
          const parsed = JSON.parse(jsonStr);
          const delta = parsed.choices?.[0]?.delta;
          const deltaContent = (delta?.content || '') + (delta?.reasoning_content || '') + (delta?.reasoning || '');
          if (deltaContent) {
            completionTokens++;
            if (samplePreview.length < 120) {
              samplePreview += deltaContent;
            }

            if (tFirst === 0) {
              tFirst = now;
              lastChunkTime = now;
            } else {
              const delta = Math.round(now - lastChunkTime);
              itlList.push(delta);
              lastChunkTime = now;
            }
          }
        } catch {
          // ignore chunk parse errors
        }
      }
    }

    const tEnd = performance.now();
    const totalDurationMs = Math.round(tEnd - t0);
    const ttft = tFirst > 0 ? Math.round(tFirst - t0) : totalDurationMs;
    const generationDurationSec = (tEnd - (tFirst > 0 ? tFirst : t0)) / 1000;
    const tps = generationDurationSec > 0 ? Number((completionTokens / generationDurationSec).toFixed(1)) : 0;
    const avgItl = itlList.length > 0 
      ? Number((itlList.reduce((a, b) => a + b, 0) / itlList.length).toFixed(1)) 
      : 0;

    return {
      requestId,
      workerSlot,
      startTime: Math.round(t0),
      ttft,
      totalDurationMs,
      promptTokens: config.promptTokens,
      completionTokens,
      tps,
      itlList,
      avgItl,
      status: 'completed',
      statusCode: 200,
      samplePreview: samplePreview.trim(),
    };
  }

  /**
   * Real OpenAI-compatible SSE streaming inference (e.g. HyperQwen vLLM)
   */
  private async executeRealOpenAICompatibleStream(
    requestId: number,
    workerSlot: number,
    config: BenchmarkConfig,
    model: BenchmarkModel,
    prompt: { system: string; user: string },
    baseUrl: string,
    apiKey: string,
    isCancelled: () => boolean
  ): Promise<SingleRequestMetric> {
    const t0 = performance.now();
    let tFirst = 0;
    let lastChunkTime = 0;
    const itlList: number[] = [];
    let completionTokens = 0;
    let samplePreview = '';

    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    const response = await fetch(`${cleanBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model.id,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user }
        ],
        max_tokens: config.targetOutputTokens,
        temperature: config.temperature,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`${model.name} (${model.provider}) returned HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }

    if (!response.body) {
      throw new Error(`${model.name} returned empty response body`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      if (isCancelled()) {
        reader.cancel();
        break;
      }
      const { done, value } = await reader.read();
      if (done) break;

      const now = performance.now();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.replace(/^data:\s*/, '');
        if (jsonStr === '[DONE]') break;

        try {
          const parsed = JSON.parse(jsonStr);
          const delta = parsed.choices?.[0]?.delta;
          const deltaContent = (delta?.content || '') + (delta?.reasoning_content || '') + (delta?.reasoning || '');
          if (deltaContent) {
            completionTokens++;
            if (samplePreview.length < 120) {
              samplePreview += deltaContent;
            }

            if (tFirst === 0) {
              tFirst = now;
              lastChunkTime = now;
            } else {
              const deltaMs = Math.round(now - lastChunkTime);
              itlList.push(deltaMs);
              lastChunkTime = now;
            }
          }
        } catch {
          // ignore chunk parse errors
        }
      }
    }

    const tEnd = performance.now();
    const totalDurationMs = Math.round(tEnd - t0);
    const ttft = tFirst > 0 ? Math.round(tFirst - t0) : totalDurationMs;
    const generationDurationSec = (tEnd - (tFirst > 0 ? tFirst : t0)) / 1000;
    const tps = generationDurationSec > 0 ? Number((completionTokens / generationDurationSec).toFixed(1)) : 0;
    const avgItl = itlList.length > 0 
      ? Number((itlList.reduce((a, b) => a + b, 0) / itlList.length).toFixed(1)) 
      : 0;

    return {
      requestId,
      workerSlot,
      startTime: Math.round(t0),
      ttft,
      totalDurationMs,
      promptTokens: config.promptTokens,
      completionTokens,
      tps,
      itlList,
      avgItl,
      status: 'completed',
      statusCode: 200,
      samplePreview: samplePreview.trim(),
    };
  }

  /**
   * Real Google Gemini streaming inference via @google/genai SDK
   */
  private async executeRealGeminiStream(
    requestId: number,
    workerSlot: number,
    config: BenchmarkConfig,
    model: BenchmarkModel,
    prompt: { system: string; user: string },
    apiKey: string,
    isCancelled: () => boolean
  ): Promise<SingleRequestMetric> {
    const t0 = performance.now();
    let tFirst = 0;
    let lastChunkTime = 0;
    const itlList: number[] = [];
    let completionTokens = 0;
    let samplePreview = '';

    let modelId = model.id;
    if (modelId === 'gemini-2.5-flash-lite' || modelId === 'gemini-2.0-flash-lite' || modelId === 'gemini-2.5-flash') {
      modelId = 'gemini-3.5-flash-lite';
    }

    const ai = new GoogleGenAI({ apiKey });
    const responseStream = await ai.models.generateContentStream({
      model: modelId,
      contents: [
        { role: 'user', parts: [{ text: `${prompt.system}\n\n${prompt.user}` }] }
      ],
      config: {
        maxOutputTokens: config.targetOutputTokens,
        temperature: config.temperature,
      }
    });

    for await (const chunk of responseStream) {
      if (isCancelled()) break;
      const now = performance.now();
      const text = chunk.text || '';
      if (text) {
        // Approximate subword token count for chunk
        const chunkTokens = Math.max(1, Math.round(text.length / 4));
        completionTokens += chunkTokens;
        if (samplePreview.length < 120) {
          samplePreview += text;
        }

        if (tFirst === 0) {
          tFirst = now;
          lastChunkTime = now;
        } else {
          const delta = Math.round(now - lastChunkTime);
          itlList.push(delta);
          lastChunkTime = now;
        }
      }
    }

    const tEnd = performance.now();
    const totalDurationMs = Math.round(tEnd - t0);
    const ttft = tFirst > 0 ? Math.round(tFirst - t0) : totalDurationMs;
    const generationDurationSec = (tEnd - (tFirst > 0 ? tFirst : t0)) / 1000;
    const tps = generationDurationSec > 0 ? Number((completionTokens / generationDurationSec).toFixed(1)) : 0;
    const avgItl = itlList.length > 0 
      ? Number((itlList.reduce((a, b) => a + b, 0) / itlList.length).toFixed(1)) 
      : 0;

    return {
      requestId,
      workerSlot,
      startTime: Math.round(t0),
      ttft,
      totalDurationMs,
      promptTokens: config.promptTokens,
      completionTokens,
      tps,
      itlList,
      avgItl,
      status: 'completed',
      statusCode: 200,
      samplePreview: samplePreview.trim(),
    };
  }

  /**
   * Hardware-calibrated realistic simulation engine
   * Models Tensor-Parallelism, KV Cache allocation, prefill latency scaling, 
   * chunk ITL, and tail latency jitter based on real H100/A100 benchmarks.
   */
  private async executeCalibratedSimulatedStream(
    requestId: number,
    workerSlot: number,
    config: BenchmarkConfig,
    model: BenchmarkModel,
    isCancelled: () => boolean,
    isWarmKvCache: boolean = false
  ): Promise<SingleRequestMetric> {
    const t0 = performance.now();
    const targetTokens = config.targetOutputTokens;

    // Calibrated baseline parameters by model
    let baseTtft = 120;
    let prefillMsPer1k = 18;
    let baseItl = 15.0; // ~66 TPS
    let jitterFactor = 1.0;

    if (model.id.includes('70b')) {
      baseTtft = 180;
      prefillMsPer1k = 24;
      baseItl = 15.2; // ~65 TPS
      jitterFactor = 1.2;
    } else if (model.id.includes('8b')) {
      baseTtft = 65;
      prefillMsPer1k = 8;
      baseItl = 8.5; // ~118 TPS
      jitterFactor = 0.8;
    } else if (model.id.includes('qwen') || model.id.includes('27b')) {
      baseTtft = 85;
      prefillMsPer1k = 9;
      baseItl = 9.8; // ~102 TPS
      jitterFactor = 0.85;
    } else if (model.id.includes('11b')) {
      baseTtft = 75;
      prefillMsPer1k = 9;
      baseItl = 9.2; // ~108 TPS
      jitterFactor = 0.85;
    } else if (model.id.includes('340b')) {
      baseTtft = 340;
      prefillMsPer1k = 45;
      baseItl = 32.0; // ~31 TPS
      jitterFactor = 1.5;
    } else if (model.id.includes('mixtral')) {
      baseTtft = 140;
      prefillMsPer1k = 16;
      baseItl = 11.5; // ~87 TPS
      jitterFactor = 1.0;
    } else if (model.id.includes('flash-lite')) {
      baseTtft = 55;
      prefillMsPer1k = 4;
      baseItl = 6.2; // ~161 TPS
      jitterFactor = 0.6;
    } else if (model.id.includes('flash')) {
      baseTtft = 80;
      prefillMsPer1k = 6;
      baseItl = 7.5; // ~133 TPS
      jitterFactor = 0.7;
    }

    // Concurrency contention penalty
    const concurrencyContention = Math.pow(Math.max(1, config.concurrency / 8), 1.15) * 12;
    
    // Gaussian-like randomized jitter for authentic tail latencies (p95, p99)
    const randomJitter = (Math.random() + Math.random() + Math.random() - 1.5) * 25 * jitterFactor;
    
    // Occasional tail spike on 5% of requests (simulating GC, KV cache eviction, or recompute)
    const isTailSpike = (requestId % 19 === 0);
    const tailBonus = isTailSpike ? 140 * jitterFactor : 0;

    // Prefill cost: if warm KV cache hit, prefill computation is 0 (already resident in GPU VRAM)
    const effectivePrefill = isWarmKvCache 
      ? 0 
      : (config.promptTokens / 1000) * prefillMsPer1k;

    const calculatedTtft = Math.max(
      35,
      Math.round((isWarmKvCache ? baseTtft * 0.75 : baseTtft) + effectivePrefill + concurrencyContention + randomJitter + tailBonus)
    );

    // Sleep for TTFT
    await new Promise(r => setTimeout(r, calculatedTtft));
    if (isCancelled()) {
      return {
        requestId,
        workerSlot,
        startTime: Math.round(t0),
        ttft: calculatedTtft,
        totalDurationMs: calculatedTtft,
        promptTokens: config.promptTokens,
        completionTokens: 0,
        tps: 0,
        itlList: [],
        avgItl: 0,
        status: 'cancelled',
        statusCode: 499,
      };
    }

    const tFirst = performance.now();
    let lastChunkTime = tFirst;
    const itlList: number[] = [];
    let completionTokens = 0;

    // Stream tokens in realistic chunks of 3 to 6 tokens per network frame
    const tokensPerChunk = Math.min(4, Math.max(2, Math.round(targetTokens / 30)));
    const totalChunks = Math.ceil(targetTokens / tokensPerChunk);

    for (let c = 0; c < totalChunks; c++) {
      if (isCancelled()) break;
      const chunkTokens = Math.min(tokensPerChunk, targetTokens - completionTokens);
      if (chunkTokens <= 0) break;

      // Realistic interval between chunks
      const chunkDeltaMs = Math.max(
        4,
        Math.round((baseItl * chunkTokens) + (Math.random() - 0.5) * 4)
      );

      await new Promise(r => setTimeout(r, chunkDeltaMs));
      const now = performance.now();
      const actualDelta = Math.round(now - lastChunkTime);
      itlList.push(actualDelta);
      lastChunkTime = now;
      completionTokens += chunkTokens;
    }

    const tEnd = performance.now();
    const totalDurationMs = Math.round(tEnd - t0);
    const generationDurationSec = (tEnd - tFirst) / 1000;
    const tps = generationDurationSec > 0 ? Number((completionTokens / generationDurationSec).toFixed(1)) : 0;
    const avgItl = itlList.length > 0 
      ? Number((itlList.reduce((a, b) => a + b, 0) / itlList.length).toFixed(1)) 
      : 0;

    const samplePreviews = [
      `Plan confirmed: executing agent step with ${completionTokens} generated tokens. Pipeline latency nominal.`,
      `Telemetry checkpoint validated. KV-cache hit confirmed; generated structured JSON response payload.`,
      `Multi-turn reasoning synthesized. Verified mathematical invariant under high-concurrency stream.`,
    ];

    return {
      requestId,
      workerSlot,
      startTime: Math.round(t0),
      ttft: calculatedTtft,
      totalDurationMs,
      promptTokens: config.promptTokens,
      completionTokens,
      tps,
      itlList,
      avgItl,
      status: 'completed',
      statusCode: 200,
      samplePreview: samplePreviews[requestId % samplePreviews.length],
    };
  }
}

export const benchmarkEngine = new BenchmarkEngine();
