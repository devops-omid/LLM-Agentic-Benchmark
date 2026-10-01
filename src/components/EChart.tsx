import React, { useRef, useEffect } from 'react';
import * as echarts from 'echarts';

export interface EChartProps {
  option: echarts.EChartsOption;
  style?: React.CSSProperties;
  className?: string;
  theme?: 'dark' | 'light' | null;
  loading?: boolean;
  notMerge?: boolean;
  lazyUpdate?: boolean;
  onChartReady?: (instance: echarts.ECharts) => void;
  onEvents?: Record<string, (params: any) => void>;
}

export const EChart: React.FC<EChartProps> = ({
  option,
  style = { width: '100%', height: '360px' },
  className = '',
  theme = null,
  loading = false,
  notMerge = false,
  lazyUpdate = false,
  onChartReady,
  onEvents,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  // Initialize and handle theme / resize observer
  useEffect(() => {
    if (!containerRef.current) return;

    if (chartInstance.current) {
      chartInstance.current.dispose();
      chartInstance.current = null;
    }

    const chart = echarts.init(containerRef.current, theme || undefined, {
      renderer: 'canvas',
    });
    chartInstance.current = chart;

    if (onEvents) {
      Object.entries(onEvents).forEach(([eventName, handler]) => {
        chart.on(eventName, handler);
      });
    }

    onChartReady?.(chart);

    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartInstance.current = null;
    };
  }, [theme]);

  // Handle option updates & loading state
  useEffect(() => {
    const chart = chartInstance.current;
    if (!chart) return;

    if (loading) {
      chart.showLoading('default', {
        text: '',
        color: '#10b981',
        maskColor: 'rgba(0, 0, 0, 0.1)',
      });
    } else {
      chart.hideLoading();
      chart.setOption(option, notMerge, lazyUpdate);
    }
  }, [option, loading, notMerge, lazyUpdate]);

  return <div ref={containerRef} style={style} className={className} />;
};

export default EChart;
