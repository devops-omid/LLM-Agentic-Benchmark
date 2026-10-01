import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { SUPPORTED_MODELS, WORKLOAD_PRESETS, getServerEnvConfig } from './server/config.js';
import { benchmarkEngine } from './server/engine.js';
import { 
  getHistoricalRuns, 
  getRunRaw, 
  getRunReport, 
  deleteRun, 
  seedInitialRunsIfEmpty,
  getConcurrencyStats
} from './server/storage.js';
import { BenchmarkConfig } from './server/types.js';

const app = express();
const PORT = 3000;

app.use(express.json());

// Seed initial runs for historical comparison
seedInitialRunsIfEmpty().catch(err => {
  console.error('[Storage] Error during seed:', err);
});

// ================= API ROUTES =================

app.get('/api/models', (req, res) => {
  res.json({
    models: SUPPORTED_MODELS,
    presets: WORKLOAD_PRESETS,
  });
});

app.get('/api/env-config', (req, res) => {
  res.json(getServerEnvConfig());
});

app.post('/api/benchmark/start', async (req, res) => {
  try {
    const config: BenchmarkConfig = req.body;
    
    // Basic validation
    if (!config.modelId) {
      return res.status(400).json({ error: 'Missing required modelId.' });
    }

    let modelId = config.modelId;
    if (modelId === 'gemini-2.5-flash-lite' || modelId === 'gemini-2.0-flash-lite' || modelId === 'gemini-2.5-flash') {
      modelId = 'gemini-3.5-flash-lite';
    }

    const targetOutputTokens = Math.min(32768, Math.max(16, Number(config.targetOutputTokens) || 256));
    const contextStart = config.contextStart !== undefined ? Math.max(0, Number(config.contextStart)) : 0;
    const rawEnd = config.contextEnd !== undefined 
      ? Number(config.contextEnd) 
      : (contextStart + targetOutputTokens * 4);
    const endMultiplier = Math.max(1, Math.round(rawEnd / targetOutputTokens));
    const contextEnd = endMultiplier * targetOutputTokens;

    let ladderSteps = config.ladderSteps;
    if (config.isSequentialLadder) {
      const steps: number[] = [];
      const stride = targetOutputTokens;
      for (let cur = contextStart; cur <= contextEnd; cur += stride) {
        steps.push(cur);
      }
      if (steps.length === 0 || steps[steps.length - 1] < contextEnd) {
        steps.push(contextEnd);
      }
      ladderSteps = steps;
    }

    const promptTokens = config.promptTokens !== undefined 
      ? Math.min(262144, Math.max(0, Number(config.promptTokens))) 
      : contextStart;

    const runId = await benchmarkEngine.startBenchmark({
      modelId,
      promptTokens,
      targetOutputTokens,
      concurrency: Math.min(50, Math.max(1, Number(config.concurrency) || 8)),
      totalRequests: Math.min(100, Math.max(1, Number(config.totalRequests) || 20)),
      temperature: Number(config.temperature ?? 0.2),
      systemPromptPreset: config.systemPromptPreset || 'agentic_tool',
      isSequentialLadder: Boolean(config.isSequentialLadder),
      ladderSteps: ladderSteps || (config.isSequentialLadder ? [contextStart, contextEnd] : undefined),
      enableKvCacheReuse: config.enableKvCacheReuse !== undefined ? config.enableKvCacheReuse : true,
      contextStart,
      contextEnd,
    });

    res.json({ runId, status: 'initiated' });
  } catch (err: any) {
    console.error('[API] start benchmark error:', err);
    res.status(500).json({ error: err.message || 'Failed to start benchmark' });
  }
});

// SSE Streaming endpoint for real-time telemetry
app.get('/api/benchmark/stream/:runId', (req, res) => {
  const { runId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const listener = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
      cleanup();
      res.end();
    }
  };

  const cleanup = () => {
    benchmarkEngine.off(`stream:${runId}`, listener);
  };

  req.on('close', cleanup);
  benchmarkEngine.on(`stream:${runId}`, listener);

  // Send initial ping so client knows connection is open
  res.write(`data: ${JSON.stringify({ runId, status: 'connected' })}\n\n`);
});

app.post('/api/benchmark/cancel/:runId', (req, res) => {
  const { runId } = req.params;
  const success = benchmarkEngine.cancelRun(runId);
  res.json({ success, message: success ? 'Benchmark cancelled' : 'Run was not active' });
});

app.get('/api/history', async (req, res) => {
  try {
    const history = await getHistoricalRuns();
    res.json({ history });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/concurrency-stats', async (req, res) => {
  try {
    const modelId = typeof req.query.modelId === 'string' && req.query.modelId.trim()
      ? req.query.modelId.trim()
      : getServerEnvConfig().defaultModel;
    const stats = await getConcurrencyStats(modelId);
    res.json({ modelId, stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/history/:runId', async (req, res) => {
  try {
    const raw = await getRunRaw(req.params.runId);
    if (!raw) {
      return res.status(404).json({ error: 'Benchmark run not found' });
    }
    res.json(raw);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/history/:runId/report', async (req, res) => {
  try {
    const report = await getRunReport(req.params.runId);
    if (!report) {
      return res.status(404).send('Report not found');
    }
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.send(report);
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

app.delete('/api/history/:runId', async (req, res) => {
  try {
    const deleted = await deleteRun(req.params.runId);
    res.json({ success: deleted });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ================= CLIENT & VITE MOUNT =================

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[LLM Speed Benchmark] Server active on http://0.0.0.0:${PORT}`);
  });
}

startServer();
