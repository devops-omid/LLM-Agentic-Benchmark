import React, { useState } from 'react';
import { 
  BenchmarkRunRaw, 
  BenchmarkModel,
} from '../types.js';
import { ConcurrencySpeedChart } from './ConcurrencySpeedChart.js';
import { 
  BarChart2, 
  TrendingUp, 
  Clock, 
  Zap,
  Database,
  Layers,
  CheckCircle2
} from 'lucide-react';
import { ThemeConfig } from '../lib/theme.js';

interface ChartsViewProps {
  runData: BenchmarkRunRaw | null;
  theme: ThemeConfig;
  models?: BenchmarkModel[];
  activeModelId?: string;
}

export const ChartsView: React.FC<ChartsViewProps> = ({ 
  runData, 
  theme,
  models,
  activeModelId,
}) => {
  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number;
    y: number;
    title: string;
    value: string;
    details?: string;
  } | null>(null);

  if (!runData || !runData.summary) {
    return (
      <div className="space-y-6">
        <ConcurrencySpeedChart
          models={models}
          activeModelId={activeModelId}
          theme={theme}
        />
        <div className={`py-12 text-center text-xs p-8 rounded-xl border ${theme.cardBg} ${theme.border} ${theme.textMuted}`}>
          No completed individual run telemetry active. Select a historical run from the Archive or execute a benchmark to inspect single-run TTFT scatter and throughput timeline graphs.
        </div>
      </div>
    );
  }

  const { summary, requests, telemetryPoints, config } = runData;
  const completedRequests = requests.filter(r => r.status === 'completed');

  // Chart Dimensions
  const chartHeight = 220;
  const chartWidth = 640;
  const padding = { top: 20, right: 30, bottom: 30, left: 55 };

  // Chart 1: TTFT Distribution Scatter Math
  const maxTtft = Math.max(...requests.map(r => r.ttft), summary.ttft.p99 * 1.15, 100);
  const minTtft = Math.max(0, Math.min(...requests.map(r => r.ttft)) * 0.8);

  const getTtftY = (val: number) => {
    const range = maxTtft - minTtft || 1;
    const norm = (val - minTtft) / range;
    return chartHeight - padding.bottom - norm * (chartHeight - padding.top - padding.bottom);
  };

  const getTtftX = (idx: number, total: number) => {
    const innerWidth = chartWidth - padding.left - padding.right;
    return padding.left + (idx / Math.max(1, total - 1)) * innerWidth;
  };

  // Chart 2: Throughput Timeline Math
  const timeline = telemetryPoints && telemetryPoints.length > 0 ? telemetryPoints : [];
  const maxTps = Math.max(...timeline.map(t => t.instantaneousTps), summary.aggregateTps * 1.2, 50);
  const maxElapsed = timeline.length > 0 ? timeline[timeline.length - 1].elapsedMs : summary.totalWallTimeMs;

  const getTpsY = (tps: number) => {
    const norm = Math.min(1, Math.max(0, tps / maxTps));
    return chartHeight - padding.bottom - norm * (chartHeight - padding.top - padding.bottom);
  };

  const getTpsX = (elapsed: number) => {
    const innerWidth = chartWidth - padding.left - padding.right;
    const norm = maxElapsed > 0 ? elapsed / maxElapsed : 0;
    return padding.left + norm * innerWidth;
  };

  const tpsPathD = timeline.reduce((acc, pt, i) => {
    const x = getTpsX(pt.elapsedMs);
    const y = getTpsY(pt.instantaneousTps);
    return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  const tpsAreaD = timeline.length > 0 
    ? `${tpsPathD} L ${getTpsX(maxElapsed)} ${chartHeight - padding.bottom} L ${padding.left} ${chartHeight - padding.bottom} Z`
    : '';

  // Chart 3: Context Scaling & KV Cache Curve
  const ladderSteps = summary.ladderSteps || [];
  const hasLadder = ladderSteps.length > 0;
  const maxContext = hasLadder ? Math.max(...ladderSteps.map(s => s.contextTokens), 1024) : 65536;
  const maxLadderTtft = hasLadder ? Math.max(...ladderSteps.map(s => Math.max(s.coldTtft, s.warmTtft)), 100) * 1.15 : 1000;

  const getContextX = (tokens: number) => {
    const innerWidth = chartWidth - padding.left - padding.right;
    const norm = tokens / maxContext;
    return padding.left + norm * innerWidth;
  };

  const getLadderY = (ttft: number) => {
    const norm = Math.min(1, Math.max(0, ttft / maxLadderTtft));
    return chartHeight - padding.bottom - norm * (chartHeight - padding.top - padding.bottom);
  };

  return (
    <div className="space-y-6">
      {/* Primary Analytics: Speed vs Concurrency Graph (ECharts) */}
      <ConcurrencySpeedChart
        models={models}
        activeModelId={runData?.model?.id || activeModelId}
        theme={theme}
      />

      {/* Visualizer Grid (High Precision Charts) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Graph 1: TTFT Distribution & Percentile Variance */}
        <div className={`p-5 rounded-xl border space-y-4 transition-colors ${theme.cardBg} ${theme.border}`}>
          <div className={`flex items-center justify-between pb-3 border-b ${theme.borderSubtle}`}>
            <div>
              <h3 className={`text-xs font-semibold uppercase tracking-wider flex items-center gap-2 ${theme.textSecondary}`}>
                <Clock className="w-4 h-4 text-cyan-500" />
                Time to First Token (TTFT) Scatter & Percentiles
              </h3>
              <p className={`text-[11px] mt-0.5 ${theme.textMuted}`}>
                Latency consistency across {completedRequests.length} requests
              </p>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-mono">
              <span style={{ color: theme.chart.p50LineColor }}>p50: {summary.ttft.p50}ms</span>
              <span style={{ color: theme.chart.p95LineColor }}>p95: {summary.ttft.p95}ms</span>
              <span style={{ color: theme.chart.p99LineColor }}>p99: {summary.ttft.p99}ms</span>
            </div>
          </div>

          <div className="relative w-full overflow-hidden">
            <svg 
              viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
              className="w-full h-auto select-none"
            >
              {/* Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
                const y = padding.top + pct * (chartHeight - padding.top - padding.bottom);
                const val = Math.round(maxTtft - pct * (maxTtft - minTtft));
                return (
                  <g key={idx}>
                    <line 
                      x1={padding.left} 
                      y1={y} 
                      x2={chartWidth - padding.right} 
                      y2={y} 
                      stroke={theme.chart.gridColor} 
                      strokeDasharray="3 3"
                    />
                    <text 
                      x={padding.left - 8} 
                      y={y + 3} 
                      fill={theme.chart.textColor} 
                      fontSize="9" 
                      textAnchor="end" 
                      fontFamily="monospace"
                    >
                      {val}ms
                    </text>
                  </g>
                );
              })}

              {/* p50 Median Reference Line */}
              <line
                x1={padding.left}
                y1={getTtftY(summary.ttft.p50)}
                x2={chartWidth - padding.right}
                y2={getTtftY(summary.ttft.p50)}
                stroke={theme.chart.p50LineColor}
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
              <text
                x={chartWidth - padding.right - 4}
                y={getTtftY(summary.ttft.p50) - 4}
                fill={theme.chart.p50LineColor}
                fontSize="9"
                textAnchor="end"
                fontFamily="monospace"
              >
                p50: {summary.ttft.p50}ms
              </text>

              {/* p95 Reference Line */}
              <line
                x1={padding.left}
                y1={getTtftY(summary.ttft.p95)}
                x2={chartWidth - padding.right}
                y2={getTtftY(summary.ttft.p95)}
                stroke={theme.chart.p95LineColor}
                strokeWidth="1.5"
                strokeDasharray="2 2"
              />
              <text
                x={chartWidth - padding.right - 4}
                y={getTtftY(summary.ttft.p95) - 4}
                fill={theme.chart.p95LineColor}
                fontSize="9"
                textAnchor="end"
                fontFamily="monospace"
              >
                p95: {summary.ttft.p95}ms
              </text>

              {/* Scatter Points */}
              {completedRequests.map((req, idx) => {
                const x = getTtftX(idx, completedRequests.length);
                const y = getTtftY(req.ttft);
                const isTail = req.ttft >= summary.ttft.p95;
                const isWarm = req.isWarmKvCache;

                return (
                  <circle
                    key={req.requestId}
                    cx={x}
                    cy={y}
                    r={isTail ? 4 : isWarm ? 3.5 : 3}
                    fill={isWarm ? '#10b981' : isTail ? theme.chart.scatterTailColor : theme.chart.scatterDotColor}
                    stroke={isTail ? theme.chart.scatterTailStroke : theme.chart.scatterDotStroke}
                    strokeWidth="1"
                    className="cursor-pointer transition-transform hover:scale-150"
                    onMouseEnter={() => setHoveredPoint({
                      x,
                      y,
                      title: `Request #${req.requestId}`,
                      value: `TTFT: ${req.ttft}ms (${req.tps} TPS)`,
                      details: isWarm ? 'KV Cache Hit (Warm)' : isTail ? 'Tail Latency (≥p95)' : 'Nominal Stream'
                    })}
                    onMouseLeave={() => setHoveredPoint(null)}
                  />
                );
              })}

              {/* X Axis Label */}
              <text 
                x={chartWidth / 2} 
                y={chartHeight - 6} 
                fill={theme.chart.textColor} 
                fontSize="10" 
                textAnchor="middle"
              >
                Request Sequence (1 to {completedRequests.length})
              </text>
            </svg>

            {/* Hover Tooltip */}
            {hoveredPoint && (
              <div 
                className={`absolute pointer-events-none p-2 rounded shadow-lg text-[11px] border z-20 ${theme.chart.tooltipBg} ${theme.chart.tooltipBorder} ${theme.chart.tooltipText}`}
                style={{ 
                  left: Math.min(hoveredPoint.x, chartWidth - 140), 
                  top: Math.max(10, hoveredPoint.y - 45) 
                }}
              >
                <div className="font-semibold">{hoveredPoint.title}</div>
                <div className="font-mono text-emerald-400">{hoveredPoint.value}</div>
                {hoveredPoint.details && (
                  <div className="text-[9px] opacity-75">{hoveredPoint.details}</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Graph 2: Throughput (TPS) Timeline */}
        <div className={`p-5 rounded-xl border space-y-4 transition-colors ${theme.cardBg} ${theme.border}`}>
          <div className={`flex items-center justify-between pb-3 border-b ${theme.borderSubtle}`}>
            <div>
              <h3 className={`text-xs font-semibold uppercase tracking-wider flex items-center gap-2 ${theme.textSecondary}`}>
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                Cluster Throughput (TPS) Over Time
              </h3>
              <p className={`text-[11px] mt-0.5 ${theme.textMuted}`}>
                Token generation rate across active worker pool
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className={`font-bold ${theme.accentText}`}>
                Peak: {Math.round(maxTps)} TPS
              </span>
            </div>
          </div>

          <div className="relative w-full overflow-hidden">
            <svg 
              viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
              className="w-full h-auto select-none"
            >
              <defs>
                <linearGradient id="tpsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.chart.tpsAreaStart} stopOpacity="0.35" />
                  <stop offset="100%" stopColor={theme.chart.tpsAreaEnd} stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
                const y = padding.top + pct * (chartHeight - padding.top - padding.bottom);
                const val = Math.round(maxTps - pct * maxTps);
                return (
                  <g key={idx}>
                    <line 
                      x1={padding.left} 
                      y1={y} 
                      x2={chartWidth - padding.right} 
                      y2={y} 
                      stroke={theme.chart.gridColor} 
                      strokeDasharray="3 3"
                    />
                    <text 
                      x={padding.left - 8} 
                      y={y + 3} 
                      fill={theme.chart.textColor} 
                      fontSize="9" 
                      textAnchor="end" 
                      fontFamily="monospace"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}

              {/* Area */}
              {tpsAreaD && (
                <path d={tpsAreaD} fill="url(#tpsGradient)" />
              )}

              {/* Line */}
              {tpsPathD && (
                <path 
                  d={tpsPathD} 
                  fill="none" 
                  stroke={theme.chart.tpsLineColor} 
                  strokeWidth="2.5" 
                  strokeLinecap="round"
                />
              )}

              {/* Benchmark Aggregate Average Line */}
              <line
                x1={padding.left}
                y1={getTpsY(summary.aggregateTps)}
                x2={chartWidth - padding.right}
                y2={getTpsY(summary.aggregateTps)}
                stroke={theme.chart.tpsLineColor}
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <text
                x={chartWidth - padding.right - 2}
                y={getTpsY(summary.aggregateTps) - 4}
                fill={theme.chart.tpsLineColor}
                fontSize="9"
                textAnchor="end"
                fontFamily="monospace"
              >
                Avg {summary.aggregateTps} TPS
              </text>

              {/* X Axis Label */}
              <text 
                x={chartWidth / 2} 
                y={chartHeight - 6} 
                fill={theme.chart.textColor} 
                fontSize="10" 
                textAnchor="middle"
              >
                Elapsed Wall Time (0 to {(maxElapsed / 1000).toFixed(1)}s)
              </text>
            </svg>
          </div>
        </div>
      </div>

      {/* Graph 3: Context Scaling & KV Cache Latency Curve (Only shown or highlighted when ladder data exists) */}
      {hasLadder && (
        <div className={`p-5 rounded-xl border space-y-4 transition-colors ${theme.cardBg} ${theme.border}`}>
          <div className={`flex flex-wrap items-center justify-between pb-3 border-b ${theme.borderSubtle}`}>
            <div>
              <h3 className={`text-xs font-semibold uppercase tracking-wider flex items-center gap-2 ${theme.textSecondary}`}>
                <Database className="w-4 h-4 text-emerald-400" />
                Context Scaling & KV Cache Latency Curve
              </h3>
              <p className={`text-[11px] mt-0.5 ${theme.textMuted}`}>
                Prefill latency scaling vs KV-Cache prefix hit acceleration from 0 to {(maxContext / 1024).toFixed(0)}K tokens
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-amber-500">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                Cold Prefill TTFT
              </span>
              <span className="flex items-center gap-1.5 text-emerald-500">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                Warm KV-Cache TTFT
              </span>
              {summary.avgKvCacheSpeedup && (
                <span className="px-2 py-0.5 rounded font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/30">
                  Avg {summary.avgKvCacheSpeedup}x Speedup
                </span>
              )}
            </div>
          </div>

          <div className="relative w-full overflow-hidden">
            <svg 
              viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
              className="w-full h-auto select-none"
            >
              {/* Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
                const y = padding.top + pct * (chartHeight - padding.top - padding.bottom);
                const val = Math.round(maxLadderTtft - pct * maxLadderTtft);
                return (
                  <g key={idx}>
                    <line 
                      x1={padding.left} 
                      y1={y} 
                      x2={chartWidth - padding.right} 
                      y2={y} 
                      stroke={theme.chart.gridColor} 
                      strokeDasharray="3 3"
                    />
                    <text 
                      x={padding.left - 8} 
                      y={y + 3} 
                      fill={theme.chart.textColor} 
                      fontSize="9" 
                      textAnchor="end" 
                      fontFamily="monospace"
                    >
                      {val}ms
                    </text>
                  </g>
                );
              })}

              {/* Cold TTFT Path */}
              {(() => {
                const coldPoints = ladderSteps.map(s => ({
                  x: getContextX(s.contextTokens),
                  y: getLadderY(s.coldTtft),
                }));
                const coldPathD = coldPoints.reduce((acc, pt, i) => i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`, '');
                return (
                  <path
                    d={coldPathD}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="2.5"
                    strokeDasharray="4 2"
                  />
                );
              })()}

              {/* Warm TTFT Path */}
              {(() => {
                const warmPoints = ladderSteps.map(s => ({
                  x: getContextX(s.contextTokens),
                  y: getLadderY(s.warmTtft),
                }));
                const warmPathD = warmPoints.reduce((acc, pt, i) => i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`, '');
                return (
                  <path
                    d={warmPathD}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="3"
                  />
                );
              })()}

              {/* Step Dots */}
              {ladderSteps.map((step, idx) => {
                const x = getContextX(step.contextTokens);
                const yCold = getLadderY(step.coldTtft);
                const yWarm = getLadderY(step.warmTtft);

                return (
                  <g key={idx}>
                    {/* Cold Dot */}
                    <circle
                      cx={x}
                      cy={yCold}
                      r="4.5"
                      fill="#f59e0b"
                      stroke="#78350f"
                      strokeWidth="1.5"
                      className="cursor-pointer"
                    />
                    {/* Warm Dot */}
                    <circle
                      cx={x}
                      cy={yWarm}
                      r="4.5"
                      fill="#10b981"
                      stroke="#064e3b"
                      strokeWidth="1.5"
                      className="cursor-pointer"
                    />
                    {/* X Tick Label */}
                    <text
                      x={x}
                      y={chartHeight - 12}
                      fill={theme.chart.textColor}
                      fontSize="9"
                      textAnchor="middle"
                      fontFamily="monospace"
                    >
                      {step.contextTokens === 0 ? '0' : `${(step.contextTokens / 1024).toFixed(0)}K`}
                    </text>
                  </g>
                );
              })}

              <text 
                x={chartWidth / 2} 
                y={chartHeight - 2} 
                fill={theme.chart.textColor} 
                fontSize="10" 
                textAnchor="middle"
              >
                Context Window Depth (Tokens: 0 to {(maxContext / 1024).toFixed(0)}K)
              </text>
            </svg>
          </div>

          {/* Sequential Ladder Performance Table */}
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className={`border-b text-[11px] font-mono ${theme.tableHeadBg}`}>
                  <th className="py-2.5 px-3">Stage #</th>
                  <th className="py-2.5 px-3">Context Tokens</th>
                  <th className="py-2.5 px-3 text-right">Cold TTFT (Prefill)</th>
                  <th className="py-2.5 px-3 text-right">Warm TTFT (KV Hit)</th>
                  <th className="py-2.5 px-3 text-right">KV Speedup</th>
                  <th className="py-2.5 px-3 text-right">Generation TPS</th>
                  <th className="py-2.5 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className={`divide-y font-mono ${theme.tableBorder}`}>
                {ladderSteps.map((step, idx) => (
                  <tr key={idx} className={`${theme.tableRowHover} transition-colors`}>
                    <td className={`py-2.5 px-3 ${theme.textPrimary}`}>Step {idx + 1}</td>
                    <td className={`py-2.5 px-3 font-semibold ${theme.textPrimary}`}>
                      {step.contextTokens === 0 ? '0 (Empty Context)' : `${step.contextTokens.toLocaleString()} tokens (${(step.contextTokens / 1024).toFixed(0)}K)`}
                    </td>
                    <td className="py-2.5 px-3 text-right text-amber-500 tabular-nums">
                      {step.coldTtft} ms
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-500 font-semibold tabular-nums">
                      {step.warmTtft} ms
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-bold border border-emerald-500/30">
                        {step.speedupFactor}x Faster
                      </span>
                    </td>
                    <td className={`py-2.5 px-3 text-right tabular-nums ${theme.textSecondary}`}>
                      {step.tps} TPS
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className="inline-flex items-center gap-1 text-emerald-500 text-[10px]">
                        <CheckCircle2 className="w-3 h-3" />
                        Validated
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Latency Percentile Matrix Table */}
      <div className={`p-5 rounded-xl border space-y-4 transition-colors ${theme.cardBg} ${theme.border}`}>
        <div className={`flex items-center justify-between pb-3 border-b ${theme.borderSubtle}`}>
          <h3 className={`text-xs font-semibold uppercase tracking-wider flex items-center gap-2 ${theme.textSecondary}`}>
            <BarChart2 className="w-4 h-4" style={{ color: theme.accentHex }} />
            Statistical Latency Breakdown
          </h3>
          <span className={`text-[11px] font-mono ${theme.textMuted}`}>
            {summary.completedRequests} sample points
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className={`border-b text-[11px] font-mono ${theme.tableHeadBg}`}>
                <th className="py-2.5 px-3">Metric Dimension</th>
                <th className="py-2.5 px-3 text-right">Mean</th>
                <th className="py-2.5 px-3 text-right" style={{ color: theme.chart.p50LineColor }}>p50 (Median)</th>
                <th className="py-2.5 px-3 text-right">p90</th>
                <th className="py-2.5 px-3 text-right" style={{ color: theme.chart.p95LineColor }}>p95</th>
                <th className="py-2.5 px-3 text-right" style={{ color: theme.chart.p99LineColor }}>p99 (Tail)</th>
                <th className="py-2.5 px-3 text-right">Min</th>
                <th className="py-2.5 px-3 text-right">Max</th>
              </tr>
            </thead>
            <tbody className={`divide-y font-mono ${theme.tableBorder}`}>
              <tr className={`${theme.tableRowHover} transition-colors`}>
                <td className={`py-3 px-3 font-sans font-medium flex items-center gap-2 ${theme.textPrimary}`}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.chart.p50LineColor }} />
                  Time to First Token (TTFT)
                </td>
                <td className={`py-3 px-3 text-right tabular-nums ${theme.textSecondary}`}>{summary.ttft.mean} ms</td>
                <td className="py-3 px-3 text-right font-semibold tabular-nums" style={{ color: theme.chart.p50LineColor }}>{summary.ttft.p50} ms</td>
                <td className={`py-3 px-3 text-right tabular-nums ${theme.textSecondary}`}>{summary.ttft.p90} ms</td>
                <td className="py-3 px-3 text-right tabular-nums" style={{ color: theme.chart.p95LineColor }}>{summary.ttft.p95} ms</td>
                <td className="py-3 px-3 text-right font-semibold tabular-nums" style={{ color: theme.chart.p99LineColor }}>{summary.ttft.p99} ms</td>
                <td className={`py-3 px-3 text-right tabular-nums ${theme.textMuted}`}>{summary.ttft.min} ms</td>
                <td className={`py-3 px-3 text-right tabular-nums ${theme.textMuted}`}>{summary.ttft.max} ms</td>
              </tr>
              <tr className={`${theme.tableRowHover} transition-colors`}>
                <td className={`py-3 px-3 font-sans font-medium flex items-center gap-2 ${theme.textPrimary}`}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.accentHex }} />
                  Inter-Token Latency (ITL)
                </td>
                <td className={`py-3 px-3 text-right tabular-nums ${theme.textSecondary}`}>{summary.itl.mean} ms</td>
                <td className="py-3 px-3 text-right font-semibold tabular-nums" style={{ color: theme.accentHex }}>{summary.itl.p50} ms</td>
                <td className={`py-3 px-3 text-right tabular-nums ${theme.textSecondary}`}>{summary.itl.p90} ms</td>
                <td className="py-3 px-3 text-right tabular-nums" style={{ color: theme.chart.p95LineColor }}>{summary.itl.p95} ms</td>
                <td className="py-3 px-3 text-right font-semibold tabular-nums" style={{ color: theme.chart.p99LineColor }}>{summary.itl.p99} ms</td>
                <td className={`py-3 px-3 text-right tabular-nums ${theme.textMuted}`}>{summary.itl.min} ms</td>
                <td className={`py-3 px-3 text-right tabular-nums ${theme.textMuted}`}>{summary.itl.max} ms</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
