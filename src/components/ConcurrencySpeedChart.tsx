import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as echarts from 'echarts';
import { EChart } from './EChart.js';
import { BenchmarkModel, ConcurrencyStatItem } from '../types.js';
import { ThemeConfig } from '../lib/theme.js';
import { 
  Zap, 
  Activity, 
  Target, 
  Cpu, 
  RotateCw, 
  Layers, 
  TrendingUp,
  Info
} from 'lucide-react';

interface ConcurrencySpeedChartProps {
  models?: BenchmarkModel[];
  activeModelId?: string;
  theme: ThemeConfig;
  onModelChange?: (modelId: string) => void;
}

export const ConcurrencySpeedChart: React.FC<ConcurrencySpeedChartProps> = ({
  models: propModels,
  activeModelId,
  theme,
  onModelChange,
}) => {
  const [models, setModels] = useState<BenchmarkModel[]>(propModels || []);
  const [selectedModelId, setSelectedModelId] = useState<string>(activeModelId || 'qwen3.8-27b');
  const [stats, setStats] = useState<ConcurrencyStatItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Sync prop models if available, otherwise fetch
  useEffect(() => {
    if (propModels && propModels.length > 0) {
      setModels(propModels);
    } else {
      fetch('/api/models')
        .then(res => res.json())
        .then(data => {
          if (data.models?.length) setModels(data.models);
        })
        .catch(err => console.error('Failed to load models in ConcurrencySpeedChart:', err));
    }
  }, [propModels]);

  // Sync activeModelId if changed from parent
  useEffect(() => {
    if (activeModelId && activeModelId !== selectedModelId) {
      setSelectedModelId(activeModelId);
    }
  }, [activeModelId]);

  // Fetch concurrency stats for the selected model
  const fetchStats = useCallback((modelId: string) => {
    setLoading(true);
    setError(null);
    fetch(`/api/concurrency-stats?modelId=${encodeURIComponent(modelId)}`)
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        const items: ConcurrencyStatItem[] = Array.isArray(data) ? data : (data.stats || []);
        setStats(items);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch concurrency stats:', err);
        setError(err.message || 'Failed to load concurrency stats');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (selectedModelId) {
      fetchStats(selectedModelId);
    }
  }, [selectedModelId, fetchStats]);

  const handleSelectModel = (newModelId: string) => {
    setSelectedModelId(newModelId);
    onModelChange?.(newModelId);
  };

  const [sweeping, setSweeping] = useState<boolean>(false);

  const handleRunSweep = useCallback(async () => {
    if (sweeping) return;
    setSweeping(true);
    try {
      const res = await fetch('/api/benchmark/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: selectedModelId,
          concurrencySweep: [1, 2, 4, 8],
          promptTokens: 256,
          targetOutputTokens: 128,
          temperature: 0.1,
          systemPromptPreset: 'general',
        }),
      });
      if (res.ok) {
        const { runId } = await res.json();
        const es = new EventSource(`/api/benchmark/stream/${runId}`);
        es.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
              es.close();
              setSweeping(false);
              fetchStats(selectedModelId);
            }
          } catch {
            // ignore
          }
        };
        es.onerror = () => {
          es.close();
          setSweeping(false);
          fetchStats(selectedModelId);
        };
      } else {
        setSweeping(false);
      }
    } catch {
      setSweeping(false);
    }
  }, [sweeping, selectedModelId, fetchStats]);

  // Selected model metadata
  const currentModelMeta = useMemo(() => {
    return models.find(m => m.id === selectedModelId) || {
      id: selectedModelId,
      name: selectedModelId,
      provider: 'unknown',
      parameterSize: '',
      description: '',
    };
  }, [models, selectedModelId]);

  // Derived KPI Stats
  const kpis = useMemo(() => {
    if (!stats || stats.length === 0) return null;

    const peakAggregate = stats.reduce((max, cur) => (cur.aggregateTps > max.aggregateTps ? cur : max), stats[0]);
    const sweetSpot = stats.reduce((best, cur) => 
      (cur.aggregateTps / Math.max(1, cur.p50Ttft) > best.aggregateTps / Math.max(1, best.p50Ttft)) ? cur : best
    , stats[0]);

    const c1 = stats.find(s => s.concurrency === 1) || stats[0];
    const idealPeak = peakAggregate.concurrency * c1.streamTps;
    const scalingEfficiency = idealPeak > 0 ? Math.min(100, Math.round((peakAggregate.aggregateTps / idealPeak) * 100)) : 100;
    const benchmarkCount = stats.filter(s => s.source === 'benchmark').length;
    const calibratedCount = stats.filter(s => s.source === 'calibrated').length;

    return {
      peakAggregate,
      sweetSpot,
      scalingEfficiency,
      benchmarkCount,
      calibratedCount,
    };
  }, [stats]);

  // Build ECharts Option
  const chartOption = useMemo<echarts.EChartsOption>(() => {
    if (!stats || stats.length === 0) return {};

    const xAxisLabels = stats.map(s => `${s.concurrency}x`);

    return {
      backgroundColor: 'transparent',
      animationDuration: 500,
      grid: {
        left: '2%',
        right: '2%',
        top: 60,
        bottom: 50,
        containLabel: true,
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          crossStyle: { color: theme.chart.textColor },
          lineStyle: { color: theme.chart.textColor, type: 'dashed' },
        },
        backgroundColor: theme.isDark ? '#0b0f17' : '#ffffff',
        borderColor: theme.isDark ? '#1e293b' : '#e2e8f0',
        borderWidth: 1,
        padding: [10, 14],
        textStyle: {
          color: theme.isDark ? '#f8fafc' : '#0f172a',
          fontSize: 12,
        },
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return '';
          const idx = params[0].dataIndex;
          const stat = stats[idx];
          if (!stat) return '';

          const isBenchmark = stat.source === 'benchmark';
          const badgeBg = isBenchmark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 116, 139, 0.15)';
          const badgeColor = isBenchmark ? '#10b981' : '#94a3b8';
          const badgeText = isBenchmark ? '✓ REAL BENCHMARK' : 'CALIBRATED BASELINE';

          return `
            <div style="min-width: 220px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;">
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(128,128,128,0.25); padding-bottom: 6px; margin-bottom: 8px;">
                <span style="font-weight: 700; font-size: 13px;">⚡ ${stat.concurrency} Concurrent Stream${stat.concurrency > 1 ? 's' : ''}</span>
                <span style="font-size: 9px; font-weight: 600; padding: 2px 6px; border-radius: 4px; background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeColor}40;">
                  ${badgeText}
                </span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 5px; font-size: 11px;">
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #10b981;">● Aggregate Cluster TPS:</span>
                  <span style="font-weight: 700;">${stat.aggregateTps.toLocaleString()} tokens/s</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #06b6d4;">● Per-Stream TPS:</span>
                  <span style="font-weight: 700;">${stat.streamTps.toLocaleString()} tokens/s</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #f59e0b;">▲ Median TTFT (p50):</span>
                  <span style="font-weight: 700;">${stat.p50Ttft} ms</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #f43f5e;">▲ Tail Latency (p95):</span>
                  <span style="font-weight: 700;">${stat.p95Ttft} ms</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 4px; padding-top: 4px; border-top: 1px dashed rgba(128,128,128,0.2); font-size: 10px; color: ${theme.chart.textColor};">
                  <span>Tested Load Requests:</span>
                  <span>${stat.totalRequests} runs</span>
                </div>
                ${stat.runId ? `
                <div style="display: flex; justify-content: space-between; font-size: 9px; color: ${theme.chart.textColor}; opacity: 0.8; margin-top: 2px;">
                  <span>Run ID:</span>
                  <span style="font-family: monospace;">${stat.runId}</span>
                </div>` : ''}
              </div>
            </div>
          `;
        },
      },
      legend: {
        top: 8,
        left: 'center',
        data: ['Aggregate Throughput (TPS)', 'Per-Stream TPS', 'Time To First Token (p50 TTFT)'],
        selectedMode: true,
        textStyle: {
          color: theme.isDark ? '#cbd5e1' : '#475569',
          fontSize: 11,
          fontWeight: 500,
        },
      },
      toolbox: {
        top: 6,
        right: 12,
        itemSize: 13,
        itemGap: 10,
        iconStyle: {
          borderColor: theme.chart.textColor,
        },
        feature: {
          dataZoom: { yAxisIndex: 'none', title: { zoom: 'Zoom Area', back: 'Restore View' } },
          restore: { title: 'Reset Scale' },
          saveAsImage: {
            title: 'Export Graph PNG',
            name: `speed_vs_concurrency_${selectedModelId.replace(/[^a-zA-Z0-9]/g, '_')}`,
            pixelRatio: 2,
          },
        },
      },
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: [0],
          start: 0,
          end: 100,
        },
        {
          type: 'slider',
          xAxisIndex: [0],
          bottom: 6,
          height: 18,
          start: 0,
          end: 100,
          borderColor: theme.isDark ? '#334155' : '#cbd5e1',
          backgroundColor: theme.isDark ? 'rgba(15, 23, 42, 0.4)' : 'rgba(241, 245, 249, 0.6)',
          fillerColor: theme.isDark ? 'rgba(16, 185, 129, 0.25)' : 'rgba(0, 122, 255, 0.2)',
          handleStyle: {
            color: '#10b981',
          },
          textStyle: {
            color: theme.chart.textColor,
            fontSize: 9,
          },
        },
      ],
      xAxis: {
        type: 'category',
        name: 'Concurrency Level',
        nameLocation: 'middle',
        nameGap: 24,
        nameTextStyle: {
          color: theme.chart.textColor,
          fontSize: 10,
          fontWeight: 500,
        },
        data: xAxisLabels,
        boundaryGap: false,
        axisLine: { lineStyle: { color: theme.chart.gridColor } },
        axisTick: { alignWithLabel: true, lineStyle: { color: theme.chart.gridColor } },
        axisLabel: {
          color: theme.chart.textColor,
          fontSize: 10,
          fontFamily: 'monospace',
          formatter: (value: string) => `${value} streams`,
        },
        splitLine: {
          show: true,
          lineStyle: {
            color: theme.chart.gridColor,
            type: 'dashed',
            opacity: 0.6,
          },
        },
      },
      yAxis: [
        {
          type: 'value',
          name: 'Speed (Tokens/sec)',
          nameTextStyle: {
            color: '#10b981',
            fontSize: 10,
            fontWeight: 600,
            align: 'left',
          },
          position: 'left',
          axisLine: { show: true, lineStyle: { color: theme.chart.gridColor } },
          axisTick: { show: false },
          axisLabel: {
            color: theme.chart.textColor,
            fontSize: 10,
            fontFamily: 'monospace',
            formatter: '{value} TPS',
          },
          splitLine: {
            lineStyle: {
              color: theme.chart.gridColor,
              type: 'dashed',
              opacity: 0.5,
            },
          },
        },
        {
          type: 'value',
          name: 'Latency (ms)',
          nameTextStyle: {
            color: '#f59e0b',
            fontSize: 10,
            fontWeight: 600,
            align: 'right',
          },
          position: 'right',
          axisLine: { show: true, lineStyle: { color: theme.chart.gridColor } },
          axisTick: { show: false },
          axisLabel: {
            color: theme.chart.textColor,
            fontSize: 10,
            fontFamily: 'monospace',
            formatter: '{value} ms',
          },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'Aggregate Throughput (TPS)',
          type: 'line',
          yAxisIndex: 0,
          smooth: 0.35,
          lineStyle: { width: 3, color: '#10b981' },
          itemStyle: { color: '#10b981' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(16, 185, 129, 0.32)' },
              { offset: 1, color: 'rgba(16, 185, 129, 0.02)' },
            ]),
          },
          data: stats.map(s => ({
            value: s.aggregateTps,
            symbol: 'circle',
            symbolSize: s.source === 'benchmark' ? 10 : 6,
            itemStyle: {
              color: '#10b981',
              borderColor: s.source === 'benchmark' ? '#ffffff' : '#10b981',
              borderWidth: s.source === 'benchmark' ? 2 : 1,
            },
          })),
        },
        {
          name: 'Per-Stream TPS',
          type: 'line',
          yAxisIndex: 0,
          smooth: 0.35,
          lineStyle: { width: 2, type: 'dashed', color: '#06b6d4' },
          itemStyle: { color: '#06b6d4' },
          data: stats.map(s => ({
            value: s.streamTps,
            symbol: 'diamond',
            symbolSize: s.source === 'benchmark' ? 10 : 6,
            itemStyle: {
              color: '#06b6d4',
              borderColor: s.source === 'benchmark' ? '#ffffff' : '#06b6d4',
              borderWidth: s.source === 'benchmark' ? 2 : 1,
            },
          })),
        },
        {
          name: 'Time To First Token (p50 TTFT)',
          type: 'line',
          yAxisIndex: 1,
          smooth: 0.35,
          lineStyle: { width: 2, color: '#f59e0b' },
          itemStyle: { color: '#f59e0b' },
          data: stats.map(s => ({
            value: s.p50Ttft,
            symbol: 'triangle',
            symbolSize: s.source === 'benchmark' ? 10 : 6,
            itemStyle: {
              color: '#f59e0b',
              borderColor: s.source === 'benchmark' ? '#ffffff' : '#f59e0b',
              borderWidth: s.source === 'benchmark' ? 2 : 1,
            },
          })),
        },
      ],
    };
  }, [stats, theme, selectedModelId]);

  return (
    <div className={`p-5 rounded-xl border space-y-5 transition-colors ${theme.cardBg} ${theme.border}`}>
      {/* Header with Title and Model Selector Dropdown */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b ${theme.borderSubtle}`}>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h3 className={`text-xs font-semibold uppercase tracking-wider ${theme.textPrimary}`}>
              Speed vs Concurrency Scaling Engine
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              ECharts High-Res
            </span>
          </div>
          <p className={`text-[11px] ${theme.textMuted}`}>
            Token generation speed (aggregate & per-stream TPS) and responsive TTFT latency across 1 to 32 concurrent streams.
          </p>
        </div>

        {/* Model Selector and Refresh */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-medium ${theme.textSecondary}`}>Target LLM:</span>
            <select
              value={selectedModelId}
              onChange={e => handleSelectModel(e.target.value)}
              className={`text-xs font-mono py-1.5 px-3 rounded-lg border outline-none transition-colors cursor-pointer ${theme.inputBg} ${theme.inputBorder}`}
            >
              {models.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.provider})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleRunSweep}
            disabled={loading || sweeping}
            title="Launch live parallel Concurrency Sweep (1, 2, 4, 8 streams)"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-mono font-medium transition-colors bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 cursor-pointer"
          >
            <Zap className={`w-3.5 h-3.5 ${sweeping ? 'animate-pulse text-emerald-300' : ''}`} />
            <span>{sweeping ? 'Sweeping...' : 'Run Sweep'}</span>
          </button>

          <button
            onClick={() => fetchStats(selectedModelId)}
            disabled={loading || sweeping}
            title="Refresh concurrency telemetry"
            className={`p-1.5 rounded-lg border text-xs transition-colors hover:bg-slate-800/40 disabled:opacity-50 ${theme.borderSubtle} ${theme.textSecondary}`}
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Stats Badges */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Badge 1: Peak Throughput */}
          <div className={`p-3 rounded-lg border transition-colors ${theme.innerPanelBg} ${theme.borderSubtle}`}>
            <div className="flex items-center justify-between text-[11px]">
              <span className={`font-medium flex items-center gap-1.5 ${theme.textMuted}`}>
                <Zap className="w-3.5 h-3.5 text-emerald-400" />
                Peak Aggregate TPS
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                {kpis.peakAggregate.concurrency} streams
              </span>
            </div>
            <div className={`text-base font-bold font-mono mt-1 ${theme.textPrimary}`}>
              {kpis.peakAggregate.aggregateTps.toLocaleString()}{' '}
              <span className="text-xs font-normal text-emerald-400">tokens/s</span>
            </div>
          </div>

          {/* Badge 2: Sweet Spot Concurrency */}
          <div className={`p-3 rounded-lg border transition-colors ${theme.innerPanelBg} ${theme.borderSubtle}`}>
            <div className="flex items-center justify-between text-[11px]">
              <span className={`font-medium flex items-center gap-1.5 ${theme.textMuted}`}>
                <Target className="w-3.5 h-3.5 text-cyan-400" />
                Sweet Spot
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400">
                TPS / TTFT
              </span>
            </div>
            <div className={`text-base font-bold font-mono mt-1 ${theme.textPrimary}`}>
              {kpis.sweetSpot.concurrency} streams{' '}
              <span className={`text-[11px] font-normal font-mono ${theme.textSecondary}`}>
                ({kpis.sweetSpot.aggregateTps} TPS · {kpis.sweetSpot.p50Ttft}ms)
              </span>
            </div>
          </div>

          {/* Badge 3: Scaling Efficiency */}
          <div className={`p-3 rounded-lg border transition-colors ${theme.innerPanelBg} ${theme.borderSubtle}`}>
            <div className="flex items-center justify-between text-[11px]">
              <span className={`font-medium flex items-center gap-1.5 ${theme.textMuted}`}>
                <Activity className="w-3.5 h-3.5 text-amber-400" />
                Scaling Efficiency
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
                vs linear
              </span>
            </div>
            <div className={`text-base font-bold font-mono mt-1 ${theme.textPrimary}`}>
              {kpis.scalingEfficiency}%{' '}
              <span className={`text-xs font-normal ${theme.textMuted}`}>hardware yield</span>
            </div>
          </div>

          {/* Badge 4: Telemetry Origin Blend */}
          <div className={`p-3 rounded-lg border transition-colors ${theme.innerPanelBg} ${theme.borderSubtle}`}>
            <div className="flex items-center justify-between text-[11px]">
              <span className={`font-medium flex items-center gap-1.5 ${theme.textMuted}`}>
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                Data Points
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">
                Merged
              </span>
            </div>
            <div className={`text-xs font-mono font-medium mt-1.5 flex items-center gap-2 ${theme.textPrimary}`}>
              <span className="inline-flex items-center gap-1 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                {kpis.benchmarkCount} Measured Runs
              </span>
              {kpis.calibratedCount > 0 && (
                <>
                  <span className="text-slate-500">|</span>
                  <span className="inline-flex items-center gap-1 text-slate-400">
                    <span className="w-2 h-2 rounded-full bg-slate-500 inline-block" />
                    {kpis.calibratedCount} Calibrated
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Interactive ECharts Surface */}
      <div className="relative">
        {error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-mono">
            {error}
          </div>
        )}

        {!loading && !error && stats.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/50 backdrop-blur-xs rounded-lg p-6 text-center z-10">
            <Zap className="w-8 h-8 text-emerald-400 mb-2 opacity-80" />
            <h4 className="text-sm font-semibold text-slate-200">No Benchmark Runs Recorded For This Model</h4>
            <p className="text-xs text-slate-400 max-w-md mt-1 mb-4">
              All synthetic data curves have been removed. Click Run Sweep to launch real parallel multi-stream requests and measure throughput scaling.
            </p>
            <button
              onClick={handleRunSweep}
              disabled={sweeping}
              className="px-4 py-2 rounded-lg bg-emerald-500 text-slate-950 font-semibold text-xs flex items-center gap-2 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
            >
              <Zap className="w-4 h-4" />
              <span>{sweeping ? 'Running Sweep...' : 'Run Concurrency Sweep (1, 2, 4, 8)'}</span>
            </button>
          </div>
        )}

        <EChart
          option={chartOption}
          theme={theme.isDark ? 'dark' : 'light'}
          loading={loading}
          style={{ width: '100%', height: '380px' }}
        />
      </div>

      {/* Footer Info Notice */}
      <div className={`flex items-center justify-between pt-2 text-[10px] font-mono ${theme.textMuted}`}>
        <div className="flex items-center gap-1.5">
          <Info className="w-3 h-3 text-cyan-400 shrink-0" />
          <span>Click legend items to toggle series. Drag bottom slider or mouse-wheel to zoom concurrency range.</span>
        </div>
        <div>
          Model Arch: <span className="font-semibold text-slate-300">{currentModelMeta.parameterSize || currentModelMeta.id}</span>
        </div>
      </div>
    </div>
  );
};

export default ConcurrencySpeedChart;
