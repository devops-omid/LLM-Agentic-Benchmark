/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { TopNav } from './components/TopNav.js';
import { ConfigDrawer } from './components/ConfigDrawer.js';
import { LiveTelemetry } from './components/LiveTelemetry.js';
import { ChartsView } from './components/ChartsView.js';
import { MarkdownReportView } from './components/MarkdownReportView.js';
import { HistoryArchiveView } from './components/HistoryArchiveView.js';
import { 
  BenchmarkModel, 
  WorkloadPreset, 
  BenchmarkConfig, 
  BenchmarkProgressEvent, 
  SingleRequestMetric, 
  BenchmarkRunRaw, 
  HistoryRunItem 
} from './types.js';
import { THEMES, ThemeId } from './lib/theme.js';
import { AlertCircle, CheckCircle2, Activity } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'console' | 'telemetry' | 'report' | 'history'>('console');
  
  // Visual Theme State (persisted in localStorage)
  const [currentThemeId, setCurrentThemeId] = useState<ThemeId>(() => {
    try {
      const saved = localStorage.getItem('llm_bench_theme') as ThemeId;
      return saved && THEMES[saved] ? saved : 'obsidian';
    } catch {
      return 'obsidian';
    }
  });

  const theme = THEMES[currentThemeId] || THEMES.obsidian;

  const handleSelectTheme = (themeId: ThemeId) => {
    setCurrentThemeId(themeId);
    try {
      localStorage.setItem('llm_bench_theme', themeId);
    } catch (e) {
      console.warn('Failed to save theme in localStorage:', e);
    }
  };

  const [models, setModels] = useState<BenchmarkModel[]>([]);
  const [presets, setPresets] = useState<WorkloadPreset[]>([]);
  const [envConfig, setEnvConfig] = useState<{
    hasNvidiaKey: boolean;
    hasGeminiKey: boolean;
    nvidiaBaseUrl: string;
    defaultModel: string;
  } | null>(null);

  // Active configuration: defaults to cheap and fast Llama 3.2 11B Vision Instruct
  const [config, setConfig] = useState<BenchmarkConfig>({
    modelId: 'meta/llama-3.2-11b-vision-instruct',
    promptTokens: 0,
    targetOutputTokens: 2048,
    concurrency: 4,
    totalRequests: 8,
    temperature: 0.1,
    systemPromptPreset: 'general',
    isSequentialLadder: true,
    contextStart: 0,
    contextEnd: 8192,
    ladderSteps: [0, 2048, 4096, 6144, 8192],
    enableKvCacheReuse: true,
  });

  // Benchmark execution state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [liveProgress, setLiveProgress] = useState<BenchmarkProgressEvent | null>(null);
  const [recentRequests, setRecentRequests] = useState<SingleRequestMetric[]>([]);
  const [activeRunData, setActiveRunData] = useState<BenchmarkRunRaw | null>(null);
  const [history, setHistory] = useState<HistoryRunItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  // 1. Initial Load: Models, Env Config, and History
  useEffect(() => {
    fetch('/api/models')
      .then(res => res.json())
      .then(data => {
        if (data.models && data.models.length > 0) {
          setModels(data.models);
          const defaultM = data.models.find((m: BenchmarkModel) => m.id === 'meta/llama-3.2-11b-vision-instruct') || data.models[0];
          setConfig(prev => ({ ...prev, modelId: defaultM.id }));
        }
        if (data.presets) {
          setPresets(data.presets);
        }
      })
      .catch(err => console.error('Failed to load models:', err));

    fetch('/api/env-config')
      .then(res => res.json())
      .then(data => setEnvConfig(data))
      .catch(err => console.error('Failed to load env config:', err));

    refreshHistory();
  }, []);

  const refreshHistory = () => {
    fetch('/api/history')
      .then(res => res.json())
      .then(data => {
        if (data.history) {
          setHistory(data.history);
          // If no active run data yet, load the latest historical run for charts
          if (data.history.length > 0 && !activeRunData) {
            loadRunDetails(data.history[0].runId, false);
          }
        }
      })
      .catch(err => console.error('Failed to load history:', err));
  };

  const loadRunDetails = (runId: string, switchTab: boolean = true) => {
    fetch(`/api/history/${runId}`)
      .then(async res => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data: BenchmarkRunRaw) => {
        if (!data || !data.summary) {
          console.warn('Run data has no summary:', data);
          return;
        }
        setActiveRunData(data);
        setCurrentRunId(runId);
        setRecentRequests(data.requests || []);
        setLiveProgress({
          runId,
          status: 'completed',
          elapsedMs: data.summary.totalWallTimeMs || 0,
          activeWorkers: 0,
          completedCount: data.summary.completedRequests || 0,
          failedCount: data.summary.failedRequests || 0,
          totalRequests: data.summary.totalRequests || 0,
          cumulativeTokens: data.summary.totalCompletionTokens || 0,
          currentTps: data.summary.aggregateTps || 0,
          rollingAvgTtft: data.summary.ttft?.mean || 0,
          summary: data.summary,
        });
        if (switchTab) {
          setActiveTab('telemetry');
        }
      })
      .catch(err => console.warn('Failed to load run details:', err.message || err));
  };

  const handleApplyPreset = (preset: WorkloadPreset) => {
    setConfig(prev => ({
      ...prev,
      promptTokens: preset.promptTokens,
      targetOutputTokens: preset.targetOutputTokens,
      concurrency: preset.concurrency,
      totalRequests: preset.totalRequests,
      systemPromptPreset: preset.systemPromptPreset,
    }));
  };

  // 2. Start Benchmark Execution
  const handleStartBenchmark = async () => {
    if (isRunning) return;
    setErrorMessage(null);
    setRecentRequests([]);
    setActiveRunData(null);
    setIsRunning(true);
    setActiveTab('telemetry');

    try {
      const res = await fetch('/api/benchmark/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to start benchmark');
      }

      const { runId } = await res.json();
      setCurrentRunId(runId);

      // Open SSE stream
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const es = new EventSource(`/api/benchmark/stream/${runId}`);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const data: BenchmarkProgressEvent = JSON.parse(event.data);
          setLiveProgress(data);

          if (data.latestRequest) {
            setRecentRequests(prev => {
              const exists = prev.some(r => r.requestId === data.latestRequest!.requestId);
              if (exists) return prev;
              const newReq: SingleRequestMetric = {
                requestId: data.latestRequest!.requestId,
                workerSlot: (data.latestRequest!.requestId - 1) % config.concurrency,
                startTime: 0,
                ttft: data.latestRequest!.ttft,
                totalDurationMs: 0,
                promptTokens: config.promptTokens,
                completionTokens: data.latestRequest!.completionTokens,
                tps: data.latestRequest!.tps,
                itlList: [],
                avgItl: 0,
                status: data.latestRequest!.status as any,
                statusCode: 200,
                samplePreview: '',
              };
              return [...prev, newReq];
            });
          }

          if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
            setIsRunning(false);
            es.close();
            eventSourceRef.current = null;
            if (data.status === 'failed') {
              setErrorMessage(data.error || 'Benchmark run failed');
            } else if (data.status === 'completed') {
              loadRunDetails(runId, false);
            }
            refreshHistory();
          }
        } catch (err) {
          console.error('SSE JSON error:', err);
        }
      };

      es.onerror = () => {
        setIsRunning(false);
        es.close();
        eventSourceRef.current = null;
        refreshHistory();
      };
    } catch (err: any) {
      setIsRunning(false);
      setErrorMessage(err.message || 'Benchmark launch failed');
    }
  };

  // 3. Cancel Running Benchmark
  const handleCancelBenchmark = async () => {
    if (!currentRunId) return;
    try {
      await fetch(`/api/benchmark/cancel/${currentRunId}`, { method: 'POST' });
    } catch (err) {
      console.error('Failed to cancel:', err);
    } finally {
      setIsRunning(false);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    }
  };

  // 4. Delete Historical Run
  const handleDeleteRun = async (runId: string) => {
    try {
      await fetch(`/api/history/${runId}`, { method: 'DELETE' });
      if (currentRunId === runId) {
        setCurrentRunId(null);
        setActiveRunData(null);
        setLiveProgress(null);
      }
      refreshHistory();
    } catch (err) {
      console.error('Failed to delete run:', err);
    }
  };

  const selectedModel = models.find(m => m.id === config.modelId) || models[0];

  return (
    <div className={`min-h-screen ${theme.rootBg} ${theme.textPrimary} flex flex-col ${theme.fontFamily} transition-colors duration-200`}>
      {/* Universal Top Nav */}
      <TopNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isRunning={isRunning}
        onStartBenchmark={handleStartBenchmark}
        onCancelBenchmark={handleCancelBenchmark}
        historyCount={history.length}
        theme={theme}
        onSelectTheme={handleSelectTheme}
      />

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Error notification banner */}
        {errorMessage && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center justify-between text-xs text-rose-500">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-slate-400 hover:text-white text-xs underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Global Model & Execution Bar */}
        <div className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-xs transition-colors ${theme.cardBg} ${theme.border}`}>
          <div className="flex items-center gap-2">
            <span className={theme.textMuted}>Current Model:</span>
            <span className={`font-semibold ${theme.textPrimary}`}>{selectedModel?.name || config.modelId}</span>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${theme.accentBg} ${theme.accentText} ${theme.accentBorder}`}>
              {selectedModel?.parameterSize || 'Fast & Cheap'}
            </span>
            <span className="opacity-40">·</span>
            <span className={theme.textSecondary}>{config.concurrency} Streams</span>
            <span className="opacity-40">·</span>
            <span className={theme.textSecondary}>
              Output: {config.targetOutputTokens >= 1024 ? `${(config.targetOutputTokens / 1024).toFixed(0)}K` : config.targetOutputTokens} tok
            </span>
            <span className="opacity-40">·</span>
            <span className={theme.textSecondary}>
              {config.isSequentialLadder ? (
                <>Range: {config.contextStart === 0 ? '0' : `${((config.contextStart || 0) / 1024).toFixed(0)}K`} → {((config.contextEnd || 8192) / 1024).toFixed(0)}K (div by {config.targetOutputTokens >= 1024 ? `${(config.targetOutputTokens / 1024).toFixed(0)}K` : config.targetOutputTokens})</>
              ) : (
                <>{config.promptTokens} Context</>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11px] font-mono">
            {selectedModel?.provider === 'google_gemini' && envConfig?.hasGeminiKey ? (
              <span className={`flex items-center gap-1.5 ${theme.accentText}`}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Google Gemini API Connected
              </span>
            ) : envConfig?.hasNvidiaKey ? (
              <span className={`flex items-center gap-1.5 ${theme.accentText}`}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                NVIDIA NIM API Key Connected
              </span>
            ) : (
              <span className="text-amber-500 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" />
                Calibrated Hardware Simulation Active
              </span>
            )}
          </div>
        </div>

        {/* TAB 1: Benchmark Console */}
        {activeTab === 'console' && (
          <ConfigDrawer
            models={models}
            presets={presets}
            config={config}
            onChangeConfig={setConfig}
            onApplyPreset={handleApplyPreset}
            onStartBenchmark={handleStartBenchmark}
            isRunning={isRunning}
            envConfig={envConfig}
            theme={theme}
          />
        )}

        {/* TAB 2: Live Telemetry & Interactive Visualizer */}
        {activeTab === 'telemetry' && (
          <div className="space-y-6">
            <LiveTelemetry
              progress={liveProgress}
              isRunning={isRunning}
              config={config}
              recentRequests={recentRequests}
              onCancel={handleCancelBenchmark}
              onViewReport={() => setActiveTab('report')}
              theme={theme}
            />

            {/* Interactive SVG Charts */}
            <ChartsView runData={activeRunData} theme={theme} />
          </div>
        )}

        {/* TAB 3: Markdown Report Dual View */}
        {activeTab === 'report' && (
          <MarkdownReportView
            currentRunId={currentRunId}
            runData={activeRunData}
            theme={theme}
          />
        )}

        {/* TAB 4: History Archive */}
        {activeTab === 'history' && (
          <HistoryArchiveView
            history={history}
            onSelectRun={(runId) => loadRunDetails(runId, true)}
            onDeleteRun={handleDeleteRun}
            theme={theme}
          />
        )}
      </main>

      {/* Subtle Quiet Footer */}
      <footer className={`py-4 border-t text-center text-xs transition-colors ${theme.borderSubtle} ${theme.textMuted}`}>
        LLM Agentic Speed Benchmark · High-Precision Streaming TTFT, ITL & Throughput Analysis
      </footer>
    </div>
  );
}

