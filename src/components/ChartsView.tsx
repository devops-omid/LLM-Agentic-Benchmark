import React, { useMemo } from 'react';
import * as echarts from 'echarts';
import { 
  BenchmarkRunRaw, 
  BenchmarkModel,
} from '../types.js';
import { ConcurrencySpeedChart } from './ConcurrencySpeedChart.js';
import { EChart } from './EChart.js';
import { 
  BarChart2, 
  TrendingUp, 
  Clock, 
  Database,
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

  const { summary, requests, telemetryPoints } = runData;
  const completedRequests = useMemo(() => requests.filter(r => r.status === 'completed'), [requests]);

  const timeline = telemetryPoints && telemetryPoints.length > 0 ? telemetryPoints : [];
  const peakTps = Math.round(Math.max(...timeline.map(t => t.instantaneousTps), summary.aggregateTps, 0));

  const ladderSteps = summary.ladderSteps || [];
  const hasLadder = ladderSteps.length > 0;
  const maxContext = hasLadder ? Math.max(...ladderSteps.map(s => s.contextTokens), 1024) : 65536;

  // Chart 1: TTFT Distribution & Percentile Variance Option
  const ttftChartOption = useMemo<echarts.EChartsOption>(() => {
    const nominalData: any[] = [];
    const warmData: any[] = [];
    const tailData: any[] = [];

    completedRequests.forEach((req, idx) => {
      const seq = req.requestId || (idx + 1);
      const item = {
        name: `Request #${seq}`,
        value: [seq, req.ttft],
        req,
      };
      if (req.isWarmKvCache) {
        warmData.push(item);
      } else if (req.ttft >= summary.ttft.p95) {
        tailData.push(item);
      } else {
        nominalData.push(item);
      }
    });

    const markLines = [
      {
        yAxis: summary.ttft.p50,
        name: 'p50',
        lineStyle: { color: theme.chart.p50LineColor, type: 'dashed' as const, width: 1.5 },
        label: {
          show: true,
          position: 'insideEndTop' as const,
          formatter: `p50: ${summary.ttft.p50}ms`,
          color: theme.chart.p50LineColor,
          fontSize: 10,
          fontFamily: 'monospace',
        },
      },
      {
        yAxis: summary.ttft.p95,
        name: 'p95',
        lineStyle: { color: theme.chart.p95LineColor, type: 'dashed' as const, width: 1.5 },
        label: {
          show: true,
          position: 'insideEndTop' as const,
          formatter: `p95: ${summary.ttft.p95}ms`,
          color: theme.chart.p95LineColor,
          fontSize: 10,
          fontFamily: 'monospace',
        },
      },
    ];

    const hostIdx = nominalData.length > 0 ? 0 : (warmData.length > 0 ? 1 : 2);

    return {
      backgroundColor: 'transparent',
      grid: {
        left: '2%',
        right: '4%',
        top: 48,
        bottom: 44,
        containLabel: true,
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: theme.isDark ? '#0b0f17' : '#ffffff',
        borderColor: theme.isDark ? '#1e293b' : '#e2e8f0',
        borderWidth: 1,
        padding: [10, 14],
        textStyle: {
          color: theme.isDark ? '#f8fafc' : '#0f172a',
          fontSize: 12,
        },
        formatter: (params: any) => {
          const req = params.data?.req;
          if (!req) return '';
          const isTail = req.ttft >= summary.ttft.p95;
          const isWarm = req.isWarmKvCache;
          const badgeBg = isWarm ? 'rgba(16, 185, 129, 0.15)' : isTail ? 'rgba(244, 63, 94, 0.15)' : 'rgba(56, 189, 248, 0.15)';
          const badgeColor = isWarm ? '#10b981' : isTail ? '#f43f5e' : '#38bdf8';
          const badgeText = isWarm ? 'Warm KV Hit' : isTail ? 'Tail (≥p95)' : 'Nominal Stream';

          return `
            <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; min-width: 190px;">
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(128,128,128,0.25); padding-bottom: 4px; margin-bottom: 6px;">
                <span style="font-weight: 700; font-size: 13px;">⚡ Request #${req.requestId || params.value[0]}</span>
                <span style="font-size: 9px; font-weight: 600; padding: 2px 6px; border-radius: 4px; background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeColor}40;">
                  ${badgeText}
                </span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 4px; font-size: 11px;">
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: ${theme.chart.textColor};">TTFT Latency:</span>
                  <span style="font-weight: 700; color: ${badgeColor};">${req.ttft} ms</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: ${theme.chart.textColor};">Generation Speed:</span>
                  <span style="font-weight: 700;">${req.tps} TPS</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: ${theme.chart.textColor};">Total Duration:</span>
                  <span style="font-weight: 600;">${Math.round(req.totalDurationMs || 0)} ms</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 10px; color: ${theme.chart.textColor};">
                  <span>Worker Slot:</span>
                  <span>Slot #${req.workerSlot ?? 0}</span>
                </div>
              </div>
            </div>
          `;
        },
      },
      legend: {
        top: 6,
        left: 'center',
        data: ['Nominal Streams', 'Warm KV-Cache Hits', 'Tail Latency (>=p95)'],
        selectedMode: true,
        textStyle: {
          color: theme.isDark ? '#cbd5e1' : '#475569',
          fontSize: 10,
          fontWeight: 500,
        },
        itemGap: 12,
      },
      toolbox: {
        top: 4,
        right: 6,
        itemSize: 12,
        itemGap: 8,
        iconStyle: { borderColor: theme.chart.textColor },
        feature: {
          dataZoom: { yAxisIndex: 'none', title: { zoom: 'Zoom Area', back: 'Restore View' } },
          restore: { title: 'Reset Scale' },
          saveAsImage: {
            title: 'Export PNG',
            name: `ttft_scatter_${runData.runId || 'run'}`,
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
          bottom: 2,
          height: 16,
          start: 0,
          end: 100,
          borderColor: theme.isDark ? '#334155' : '#cbd5e1',
          backgroundColor: theme.isDark ? 'rgba(15, 23, 42, 0.4)' : 'rgba(241, 245, 249, 0.6)',
          fillerColor: theme.isDark ? 'rgba(16, 185, 129, 0.25)' : 'rgba(0, 122, 255, 0.2)',
          handleStyle: { color: '#10b981' },
          textStyle: { color: theme.chart.textColor, fontSize: 9 },
        },
      ],
      xAxis: {
        type: 'value',
        name: 'Sequence #',
        nameLocation: 'middle',
        nameGap: 22,
        min: 1,
        max: Math.max(completedRequests.length, 1),
        axisLine: { lineStyle: { color: theme.chart.gridColor } },
        axisLabel: { color: theme.chart.textColor, fontSize: 10, fontFamily: 'monospace' },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        name: 'TTFT (ms)',
        nameLocation: 'end',
        axisLine: { show: false },
        axisLabel: {
          color: theme.chart.textColor,
          fontSize: 10,
          fontFamily: 'monospace',
          formatter: '{value}ms',
        },
        splitLine: {
          lineStyle: { color: theme.chart.gridColor, type: 'dashed' },
        },
      },
      series: [
        {
          name: 'Nominal Streams',
          type: 'scatter',
          data: nominalData,
          symbolSize: 6,
          itemStyle: {
            color: theme.chart.scatterDotColor || '#38bdf8',
            borderColor: theme.chart.scatterDotStroke || '#0284c7',
            borderWidth: 1,
          },
          markLine: hostIdx === 0 ? { silent: true, symbol: ['none', 'none'], data: markLines } : undefined,
        },
        {
          name: 'Warm KV-Cache Hits',
          type: 'scatter',
          data: warmData,
          symbolSize: 7,
          itemStyle: {
            color: '#10b981',
            borderColor: '#065f46',
            borderWidth: 1,
          },
          markLine: hostIdx === 1 ? { silent: true, symbol: ['none', 'none'], data: markLines } : undefined,
        },
        {
          name: 'Tail Latency (>=p95)',
          type: 'effectScatter',
          showEffectOn: 'render',
          rippleEffect: {
            brushType: 'stroke',
            scale: 2.5,
            period: 4,
          },
          data: tailData,
          symbolSize: 8,
          itemStyle: {
            color: theme.chart.scatterTailColor || '#f43f5e',
            borderColor: theme.chart.scatterTailStroke || '#fb7185',
            borderWidth: 1.5,
          },
          markLine: hostIdx === 2 ? { silent: true, symbol: ['none', 'none'], data: markLines } : undefined,
        },
      ],
    };
  }, [completedRequests, summary, theme, runData.runId]);

  // Chart 2: Throughput (TPS) Timeline Option
  const tpsChartOption = useMemo<echarts.EChartsOption>(() => {
    const timelineData = (timeline.length > 0 ? timeline : [
      { elapsedMs: 0, instantaneousTps: summary.aggregateTps, activeWorkers: 1, completedRequests: 0, cumulativeTokens: 0 },
      { elapsedMs: summary.totalWallTimeMs, instantaneousTps: summary.aggregateTps, activeWorkers: 1, completedRequests: summary.completedRequests, cumulativeTokens: summary.totalTokens }
    ]).map(pt => ({
      value: [Number((pt.elapsedMs / 1000).toFixed(2)), Math.round(pt.instantaneousTps)],
      raw: pt,
    }));

    return {
      backgroundColor: 'transparent',
      grid: {
        left: '2%',
        right: '4%',
        top: 48,
        bottom: 44,
        containLabel: true,
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'line',
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
          const item = params[0];
          const raw = item.data?.raw;
          const elapsedSec = (item.value[0] ?? 0).toFixed(1);
          const tps = item.value[1] ?? 0;
          const workers = raw?.activeWorkers ?? summary.concurrencyPeak ?? 1;
          const completed = raw?.completedRequests ?? summary.completedRequests;

          return `
            <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; min-width: 180px;">
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(128,128,128,0.25); padding-bottom: 4px; margin-bottom: 6px;">
                <span style="font-weight: 700; font-size: 13px;">⏱️ ${elapsedSec}s elapsed</span>
                <span style="font-size: 9px; font-weight: 600; padding: 2px 6px; border-radius: 4px; background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);">
                  ${workers} worker${workers > 1 ? 's' : ''}
                </span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 4px; font-size: 11px;">
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: ${theme.chart.textColor};">Instantaneous TPS:</span>
                  <span style="font-weight: 700; color: #10b981;">${tps} tokens/s</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: ${theme.chart.textColor};">Cluster Average:</span>
                  <span style="font-weight: 600;">${summary.aggregateTps} tokens/s</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 10px; color: ${theme.chart.textColor};">
                  <span>Completed Runs:</span>
                  <span>${completed} requests</span>
                </div>
              </div>
            </div>
          `;
        },
      },
      legend: {
        top: 6,
        left: 'center',
        data: ['Cluster Throughput (TPS)'],
        selectedMode: true,
        textStyle: {
          color: theme.isDark ? '#cbd5e1' : '#475569',
          fontSize: 10,
          fontWeight: 500,
        },
      },
      toolbox: {
        top: 4,
        right: 6,
        itemSize: 12,
        itemGap: 8,
        iconStyle: { borderColor: theme.chart.textColor },
        feature: {
          dataZoom: { yAxisIndex: 'none', title: { zoom: 'Zoom Area', back: 'Restore View' } },
          restore: { title: 'Reset Scale' },
          saveAsImage: {
            title: 'Export PNG',
            name: `throughput_timeline_${runData.runId || 'run'}`,
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
          bottom: 2,
          height: 16,
          start: 0,
          end: 100,
          borderColor: theme.isDark ? '#334155' : '#cbd5e1',
          backgroundColor: theme.isDark ? 'rgba(15, 23, 42, 0.4)' : 'rgba(241, 245, 249, 0.6)',
          fillerColor: theme.isDark ? 'rgba(16, 185, 129, 0.25)' : 'rgba(0, 122, 255, 0.2)',
          handleStyle: { color: '#10b981' },
          textStyle: { color: theme.chart.textColor, fontSize: 9 },
        },
      ],
      xAxis: {
        type: 'value',
        name: 'Elapsed (seconds)',
        nameLocation: 'middle',
        nameGap: 22,
        min: 0,
        axisLine: { lineStyle: { color: theme.chart.gridColor } },
        axisLabel: {
          color: theme.chart.textColor,
          fontSize: 10,
          fontFamily: 'monospace',
          formatter: (val: number) => `${val.toFixed(1)}s`,
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        name: 'Tokens / Sec',
        nameLocation: 'end',
        axisLine: { show: false },
        axisLabel: {
          color: theme.chart.textColor,
          fontSize: 10,
          fontFamily: 'monospace',
        },
        splitLine: {
          lineStyle: { color: theme.chart.gridColor, type: 'dashed' },
        },
      },
      series: [
        {
          name: 'Cluster Throughput (TPS)',
          type: 'line',
          smooth: true,
          showSymbol: false,
          symbolSize: 4,
          lineStyle: {
            color: theme.chart.tpsLineColor || '#10b981',
            width: 2.5,
          },
          itemStyle: {
            color: theme.chart.tpsLineColor || '#10b981',
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: theme.isDark ? 'rgba(16, 185, 129, 0.4)' : 'rgba(0, 122, 255, 0.35)' },
              { offset: 1, color: theme.isDark ? 'rgba(16, 185, 129, 0.02)' : 'rgba(0, 122, 255, 0.02)' },
            ]),
          },
          markLine: {
            silent: true,
            symbol: ['none', 'none'],
            data: [
              {
                yAxis: summary.aggregateTps,
                name: 'Average TPS',
                lineStyle: {
                  color: theme.chart.tpsLineColor || '#10b981',
                  type: 'dashed' as const,
                  width: 1.5,
                },
                label: {
                  show: true,
                  position: 'insideEndTop' as const,
                  formatter: `Avg ${summary.aggregateTps} TPS`,
                  color: theme.chart.tpsLineColor || '#10b981',
                  fontSize: 10,
                  fontFamily: 'monospace',
                },
              },
            ],
          },
          data: timelineData,
        },
      ],
    };
  }, [timeline, summary, theme, runData.runId]);

  // Chart 3: Context Scaling & KV Cache Option
  const ladderChartOption = useMemo<echarts.EChartsOption>(() => {
    if (!ladderSteps || ladderSteps.length === 0) return {};

    return {
      backgroundColor: 'transparent',
      grid: {
        left: '2%',
        right: '4%',
        top: 48,
        bottom: 44,
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
          const step = ladderSteps[idx];
          if (!step) return '';
          const tokenStr = step.contextTokens === 0 ? '0 (Empty Context)' : `${step.contextTokens.toLocaleString()} tokens (${(step.contextTokens / 1024).toFixed(0)}K)`;

          return `
            <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; min-width: 210px;">
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(128,128,128,0.25); padding-bottom: 4px; margin-bottom: 6px;">
                <span style="font-weight: 700; font-size: 13px;">Stage #${step.stepIndex || (idx + 1)}</span>
                <span style="font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);">
                  ${step.speedupFactor}x Faster
                </span>
              </div>
              <div style="font-size: 11px; margin-bottom: 6px; color: ${theme.chart.textColor};">
                Context Depth: <span style="font-weight: 600; color: ${theme.isDark ? '#f8fafc' : '#0f172a'};">${tokenStr}</span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 4px; font-size: 11px;">
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #f59e0b;">● Cold Prefill TTFT:</span>
                  <span style="font-weight: 700; color: #f59e0b;">${step.coldTtft} ms</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #10b981;">● Warm KV-Cache TTFT:</span>
                  <span style="font-weight: 700; color: #10b981;">${step.warmTtft} ms</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: ${theme.chart.textColor};">Acceleration Factor:</span>
                  <span style="font-weight: 700; color: #10b981;">${step.speedupFactor}x Speedup</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 10px; color: ${theme.chart.textColor};">
                  <span>Generation Speed:</span>
                  <span>${step.tps} TPS</span>
                </div>
              </div>
            </div>
          `;
        },
      },
      legend: {
        top: 6,
        left: 'center',
        data: ['Cold Prefill TTFT (ms)', 'Warm KV-Cache TTFT (ms)'],
        selectedMode: true,
        textStyle: {
          color: theme.isDark ? '#cbd5e1' : '#475569',
          fontSize: 10,
          fontWeight: 500,
        },
        itemGap: 12,
      },
      toolbox: {
        top: 4,
        right: 6,
        itemSize: 12,
        itemGap: 8,
        iconStyle: { borderColor: theme.chart.textColor },
        feature: {
          dataZoom: { yAxisIndex: 'none', title: { zoom: 'Zoom Area', back: 'Restore View' } },
          restore: { title: 'Reset Scale' },
          saveAsImage: {
            title: 'Export PNG',
            name: `kv_cache_scaling_${runData.runId || 'run'}`,
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
          bottom: 2,
          height: 16,
          start: 0,
          end: 100,
          borderColor: theme.isDark ? '#334155' : '#cbd5e1',
          backgroundColor: theme.isDark ? 'rgba(15, 23, 42, 0.4)' : 'rgba(241, 245, 249, 0.6)',
          fillerColor: theme.isDark ? 'rgba(16, 185, 129, 0.25)' : 'rgba(0, 122, 255, 0.2)',
          handleStyle: { color: '#10b981' },
          textStyle: { color: theme.chart.textColor, fontSize: 9 },
        },
      ],
      xAxis: {
        type: 'category',
        name: 'Context Window Depth',
        nameLocation: 'middle',
        nameGap: 24,
        data: ladderSteps.map(s => s.contextTokens === 0 ? '0' : `${(s.contextTokens / 1024).toFixed(0)}K`),
        axisLine: { lineStyle: { color: theme.chart.gridColor } },
        axisLabel: {
          color: theme.chart.textColor,
          fontSize: 10,
          fontFamily: 'monospace',
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        name: 'TTFT (ms)',
        nameLocation: 'end',
        axisLine: { show: false },
        axisLabel: {
          color: theme.chart.textColor,
          fontSize: 10,
          fontFamily: 'monospace',
          formatter: '{value}ms',
        },
        splitLine: {
          lineStyle: { color: theme.chart.gridColor, type: 'dashed' },
        },
      },
      series: [
        {
          name: 'Cold Prefill TTFT (ms)',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 8,
          lineStyle: {
            color: '#f59e0b',
            width: 2.5,
            type: 'dashed' as const,
          },
          itemStyle: {
            color: '#f59e0b',
            borderColor: '#78350f',
            borderWidth: 1.5,
          },
          data: ladderSteps.map(s => s.coldTtft),
        },
        {
          name: 'Warm KV-Cache TTFT (ms)',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 8,
          lineStyle: {
            color: '#10b981',
            width: 3,
          },
          itemStyle: {
            color: '#10b981',
            borderColor: '#064e3b',
            borderWidth: 1.5,
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(16, 185, 129, 0.25)' },
              { offset: 1, color: 'rgba(16, 185, 129, 0.02)' },
            ]),
          },
          data: ladderSteps.map(s => s.warmTtft),
        },
      ],
    };
  }, [ladderSteps, theme, runData.runId]);

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

          <div className="w-full">
            <EChart
              option={ttftChartOption}
              theme={theme.isDark ? 'dark' : 'light'}
              style={{ width: '100%', height: '270px' }}
            />
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
                Peak: {peakTps} TPS
              </span>
            </div>
          </div>

          <div className="w-full">
            <EChart
              option={tpsChartOption}
              theme={theme.isDark ? 'dark' : 'light'}
              style={{ width: '100%', height: '270px' }}
            />
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

          <div className="w-full">
            <EChart
              option={ladderChartOption}
              theme={theme.isDark ? 'dark' : 'light'}
              style={{ width: '100%', height: '280px' }}
            />
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
