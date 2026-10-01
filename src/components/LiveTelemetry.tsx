import React, { useState } from 'react';
import { 
  BenchmarkProgressEvent, 
  SingleRequestMetric, 
  BenchmarkConfig 
} from '../types.js';
import { 
  Activity, 
  Clock, 
  CheckCircle2, 
  Flame, 
  RefreshCw,
  Terminal,
  ExternalLink,
  Database,
  Zap,
  ArrowRight
} from 'lucide-react';
import { ThemeConfig } from '../lib/theme.js';

interface LiveTelemetryProps {
  progress: BenchmarkProgressEvent | null;
  isRunning: boolean;
  config: BenchmarkConfig;
  recentRequests: SingleRequestMetric[];
  onCancel: () => void;
  onViewReport: () => void;
  theme: ThemeConfig;
}

export const LiveTelemetry: React.FC<LiveTelemetryProps> = ({
  progress,
  isRunning,
  config,
  recentRequests,
  onCancel,
  onViewReport,
  theme,
}) => {
  const [selectedRequest, setSelectedRequest] = useState<SingleRequestMetric | null>(null);

  const total = progress?.totalRequests || config.totalRequests || 20;
  const completed = progress?.completedCount || 0;
  const failed = progress?.failedCount || 0;
  const activeWorkers = progress?.activeWorkers || 0;
  const concurrencyCeiling = config.concurrency;
  const percent = total > 0 ? Math.min(100, Math.round(((completed + failed) / total) * 100)) : 0;
  const currentTps = progress?.currentTps || 0;
  const rollingTtft = progress?.rollingAvgTtft || 0;
  const cumulativeTokens = progress?.cumulativeTokens || 0;
  const elapsedSec = progress?.elapsedMs ? (progress.elapsedMs / 1000).toFixed(1) : '0.0';

  // Worker slot grid representation
  const workerSlots = Array.from({ length: concurrencyCeiling }, (_, idx) => {
    const isActive = idx < activeWorkers && isRunning;
    const latestForSlot = recentRequests.filter(r => r.workerSlot === idx).pop();
    return {
      slot: idx,
      isActive,
      latest: latestForSlot,
    };
  });

  return (
    <div className="space-y-6">
      {/* 4 Real-Time KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Active Concurrency */}
        <div className={`p-4 rounded-xl border transition-colors ${theme.cardBg} ${theme.border}`}>
          <div className="flex items-center justify-between text-xs mb-2">
            <span className={`font-medium flex items-center gap-1.5 ${theme.textSecondary}`}>
              <Activity className="w-3.5 h-3.5" style={{ color: theme.accentHex }} />
              Active Concurrency
            </span>
            <span className={`text-[10px] font-mono ${theme.textMuted}`}>Workers</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold font-mono tabular-nums ${theme.textPrimary}`}>
              {activeWorkers}
            </span>
            <span className={`text-xs font-mono ${theme.textMuted}`}>
              / {concurrencyCeiling} streams
            </span>
          </div>
          <div className={`mt-2 flex items-center gap-1.5 text-[11px] ${theme.textMuted}`}>
            <span 
              className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'animate-pulse' : 'opacity-40'}`} 
              style={{ backgroundColor: theme.accentHex }}
            />
            <span>{isRunning ? 'Hardware semaphore active' : 'Engine standby'}</span>
          </div>
        </div>

        {/* KPI 2: Aggregate TPS */}
        <div className={`p-4 rounded-xl border transition-colors ${theme.cardBg} ${theme.border}`}>
          <div className="flex items-center justify-between text-xs mb-2">
            <span className={`font-medium flex items-center gap-1.5 ${theme.textSecondary}`}>
              <Flame className="w-3.5 h-3.5 text-amber-500" />
              Cluster Throughput
            </span>
            <span className={`text-[10px] font-mono ${theme.textMuted}`}>tokens/sec</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold font-mono tabular-nums ${theme.accentText}`}>
              {currentTps.toLocaleString()}
            </span>
            <span className={`text-xs font-mono ${theme.textMuted}`}>TPS</span>
          </div>
          <div className={`mt-2 text-[11px] font-mono tabular-nums ${theme.textMuted}`}>
            Generated: {cumulativeTokens.toLocaleString()} tokens
          </div>
        </div>

        {/* KPI 3: Rolling Average TTFT */}
        <div className={`p-4 rounded-xl border transition-colors ${theme.cardBg} ${theme.border}`}>
          <div className="flex items-center justify-between text-xs mb-2">
            <span className={`font-medium flex items-center gap-1.5 ${theme.textSecondary}`}>
              <Clock className="w-3.5 h-3.5 text-cyan-500" />
              Rolling Avg TTFT
            </span>
            <span className={`text-[10px] font-mono ${theme.textMuted}`}>Prefill + Queue</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-cyan-500">
              {rollingTtft}
            </span>
            <span className={`text-xs font-mono ${theme.textMuted}`}>ms</span>
          </div>
          <div className={`mt-2 text-[11px] ${theme.textMuted}`}>
            Time to first streaming token
          </div>
        </div>

        {/* KPI 4: Execution Progress */}
        <div className={`p-4 rounded-xl border transition-colors ${theme.cardBg} ${theme.border}`}>
          <div className="flex items-center justify-between text-xs mb-2">
            <span className={`font-medium flex items-center gap-1.5 ${theme.textSecondary}`}>
              <CheckCircle2 className="w-3.5 h-3.5" style={{ color: theme.accentHex }} />
              Benchmark Progress
            </span>
            <span className={`text-[10px] font-mono ${theme.textMuted}`}>{elapsedSec}s elapsed</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold font-mono tabular-nums ${theme.textPrimary}`}>
              {completed + failed}
            </span>
            <span className={`text-xs font-mono ${theme.textMuted}`}>
              / {total} ({percent}%)
            </span>
          </div>
          {/* Progress bar */}
          <div className={`mt-2.5 w-full rounded-full h-1.5 overflow-hidden ${theme.isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
            <div 
              className="h-full transition-all duration-300 rounded-full"
              style={{ width: `${percent}%`, backgroundColor: theme.accentHex }}
            />
          </div>
        </div>
      </div>

      {/* Completion Banner */}
      {!isRunning && progress?.status === 'completed' && (
        <div className={`p-4 rounded-xl border flex items-center justify-between ${theme.accentBg} ${theme.accentBorder}`}>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: theme.accentHex }} />
            <div>
              <h4 className={`text-xs font-semibold ${theme.textPrimary}`}>
                Benchmark Completed Successfully
              </h4>
              <p className={`text-[11px] ${theme.textMuted}`}>
                Processed {completed} requests in {elapsedSec}s. Aggregate throughput reached {progress.summary?.aggregateTps || currentTps} TPS with p50 TTFT of {progress.summary?.ttft.p50} ms.
                {progress.summary?.avgKvCacheSpeedup && ` KV Cache hit acceleration achieved avg ${progress.summary.avgKvCacheSpeedup}x speedup.`}
              </p>
            </div>
          </div>
          <button
            onClick={onViewReport}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shadow-xs ${theme.primaryButton}`}
          >
            <span>Inspect Markdown Report</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Sequential Context Ladder Indicator (when active) */}
      {config.isSequentialLadder && config.ladderSteps && (
        <div className={`p-4 rounded-xl border transition-colors ${theme.cardBg} ${theme.border}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-400" />
              <h4 className={`text-xs font-semibold ${theme.textPrimary}`}>
                Sequential Context Window Pipeline (KV Cache Prefix Reuse)
              </h4>
            </div>
            <span className={`text-[10px] font-mono ${theme.accentText}`}>
              RadixAttention / APC Active
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {config.ladderSteps.map((step, idx) => {
              const isPast = (completed / 2) > idx;
              const isCurrent = isRunning && Math.floor(completed / 2) === idx;

              return (
                <div 
                  key={step}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition-all flex items-center gap-2 ${
                    isCurrent
                      ? `${theme.accentBg} ${theme.borderFocus} ${theme.accentText} ring-1 ring-emerald-500`
                      : isPast
                      ? `${theme.innerPanelBg} ${theme.borderSubtle} text-emerald-400`
                      : `${theme.cardBgSubtle} ${theme.borderSubtle} opacity-50 ${theme.textMuted}`
                  }`}
                >
                  <span className="font-bold">{step === 0 ? '0 (Empty)' : `${(step / 1024).toFixed(0)}K`}</span>
                  {isCurrent && <span className="w-1.5 h-1.5 rounded-full animate-ping bg-emerald-400" />}
                  {isPast && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Worker Slot State Matrix */}
      <div className={`p-5 rounded-xl border transition-colors ${theme.cardBg} ${theme.border}`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className={`text-xs font-semibold uppercase tracking-wider flex items-center gap-2 ${theme.textSecondary}`}>
              <Activity className="w-4 h-4" style={{ color: theme.accentHex }} />
              Concurrent Worker Thread Pool ({concurrencyCeiling} slots)
            </h3>
            <p className={`text-[11px] mt-0.5 ${theme.textMuted}`}>
              Live status across hardware execution semaphores
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className={`flex items-center gap-1.5 ${theme.textSecondary}`}>
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: theme.accentHex }} />
              Streaming ({activeWorkers})
            </span>
            <span className={`flex items-center gap-1.5 ${theme.textMuted}`}>
              <span className={`w-2 h-2 rounded-full ${theme.isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />
              Idle ({Math.max(0, concurrencyCeiling - activeWorkers)})
            </span>
          </div>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-2">
          {workerSlots.map(worker => {
            const isBusy = worker.isActive;
            const hasData = Boolean(worker.latest);
            return (
              <div
                key={worker.slot}
                onClick={() => worker.latest && setSelectedRequest(worker.latest)}
                className={`p-2 rounded-lg border text-center transition-all cursor-pointer ${
                  isBusy
                    ? `${theme.accentBg} ${theme.borderFocus} ${theme.accentText} shadow-xs`
                    : hasData
                    ? `${theme.innerPanelBg} ${theme.borderSubtle} ${theme.textSecondary} hover:${theme.border}`
                    : `${theme.cardBgSubtle} ${theme.borderSubtle} opacity-50 text-slate-400`
                }`}
              >
                <div className={`text-[10px] font-mono ${theme.textMuted}`}>
                  W-{worker.slot + 1}
                </div>
                <div className="my-1 flex justify-center">
                  <span 
                    className={`w-2 h-2 rounded-full ${
                      isBusy ? 'animate-ping' : ''
                    }`}
                    style={{ backgroundColor: isBusy ? theme.accentHex : hasData ? '#64748b' : '#94a3b8' }}
                  />
                </div>
                <div className="text-[10px] font-mono font-medium truncate">
                  {isBusy ? 'Active' : worker.latest ? `${worker.latest.tps} TPS` : 'Idle'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live Waterfall Stream Inspector */}
      <div className={`p-5 rounded-xl border transition-colors ${theme.cardBg} ${theme.border}`}>
        <div className={`flex items-center justify-between pb-3 border-b ${theme.borderSubtle}`}>
          <div>
            <h3 className={`text-xs font-semibold uppercase tracking-wider flex items-center gap-2 ${theme.textSecondary}`}>
              <Terminal className="w-4 h-4 text-cyan-500" />
              Live Stream Request Inspector
            </h3>
            <p className={`text-[11px] mt-0.5 ${theme.textMuted}`}>
              Inspection of TTFT, ITL jitter, and token throughput
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isRunning && (
              <button
                onClick={onCancel}
                className="px-3 py-1 text-xs font-medium text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg hover:bg-rose-500/20 transition-colors"
              >
                Abort Benchmark
              </button>
            )}
            <span className={`text-[11px] font-mono ${theme.textMuted}`}>
              {recentRequests.length} finished streams
            </span>
          </div>
        </div>

        {recentRequests.length === 0 ? (
          <div className={`py-12 text-center text-xs ${theme.textMuted}`}>
            {isRunning 
              ? 'Dispatching initial requests to inference workers...' 
              : 'Start a benchmark to inspect live stream tokens and waterfall timings.'}
          </div>
        ) : (
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className={`border-b text-[11px] font-mono ${theme.tableHeadBg}`}>
                  <th className="py-2.5 px-3">Req ID</th>
                  <th className="py-2.5 px-3">Worker</th>
                  <th className="py-2.5 px-3">Context Type</th>
                  <th className="py-2.5 px-3 text-right">TTFT (ms)</th>
                  <th className="py-2.5 px-3 text-right">Tokens Out</th>
                  <th className="py-2.5 px-3 text-right">Stream TPS</th>
                  <th className="py-2.5 px-3 text-right">Avg ITL</th>
                  <th className="py-2.5 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className={`divide-y font-mono ${theme.tableBorder}`}>
                {recentRequests.slice(-15).reverse().map(req => (
                  <tr 
                    key={req.requestId}
                    onClick={() => setSelectedRequest(req)}
                    className={`${theme.tableRowHover} cursor-pointer transition-colors ${
                      selectedRequest?.requestId === req.requestId ? theme.accentBg : ''
                    }`}
                  >
                    <td className={`py-2 px-3 font-semibold ${theme.textPrimary}`}>
                      #{req.requestId}
                    </td>
                    <td className={`py-2 px-3 ${theme.textMuted}`}>
                      W-{req.workerSlot + 1}
                    </td>
                    <td className="py-2 px-3">
                      {req.isWarmKvCache ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          KV Hit (Warm)
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30">
                          Prefill (Cold)
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right text-cyan-400 tabular-nums">
                      {req.ttft} ms
                    </td>
                    <td className={`py-2 px-3 text-right tabular-nums ${theme.textSecondary}`}>
                      {req.completionTokens} tok
                    </td>
                    <td className={`py-2 px-3 text-right font-semibold tabular-nums ${theme.accentText}`}>
                      {req.tps} TPS
                    </td>
                    <td className={`py-2 px-3 text-right tabular-nums ${theme.textMuted}`}>
                      {req.avgItl || Math.round(1000 / Math.max(1, req.tps))} ms
                    </td>
                    <td className="py-2 px-3 text-right">
                      {req.status === 'completed' ? (
                        <span className="text-emerald-400 flex items-center justify-end gap-1 text-[11px]">
                          <CheckCircle2 className="w-3 h-3" />
                          200 OK
                        </span>
                      ) : (
                        <span className="text-rose-400 text-[11px]">
                          Failed
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Selected Request Modal / Drawer */}
      {selectedRequest && (
        <div className={`p-4 rounded-xl border text-xs space-y-2 ${theme.innerPanelBg} ${theme.borderFocus}`}>
          <div className="flex items-center justify-between">
            <span className={`font-semibold ${theme.textPrimary}`}>
              Stream Inspector: Request #{selectedRequest.requestId} (Worker {selectedRequest.workerSlot + 1})
            </span>
            <button
              onClick={() => setSelectedRequest(null)}
              className={`${theme.textMuted} hover:${theme.textPrimary} text-xs`}
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
            <div>TTFT: <strong className="text-cyan-400">{selectedRequest.ttft} ms</strong></div>
            <div>Throughput: <strong className={theme.accentText}>{selectedRequest.tps} TPS</strong></div>
            <div>Completion: <strong className={theme.textPrimary}>{selectedRequest.completionTokens} tokens</strong></div>
            <div>Duration: <strong className={theme.textPrimary}>{selectedRequest.totalDurationMs || Math.round(selectedRequest.completionTokens * 15)} ms</strong></div>
          </div>
          {selectedRequest.samplePreview && (
            <div className={`mt-2 p-2 rounded border font-mono text-[11px] leading-relaxed ${theme.codeBlockBg} ${theme.codeBlockBorder}`}>
              {selectedRequest.samplePreview}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
