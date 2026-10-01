export type ThemeId = 'obsidian' | 'light' | 'tungsten' | 'cobalt';

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  isDark: boolean;
  fontFamily: string;
  
  // Backgrounds
  rootBg: string;
  headerBg: string;
  cardBg: string;
  cardBgSubtle: string;
  innerPanelBg: string;
  
  // Borders
  border: string;
  borderSubtle: string;
  borderFocus: string;
  
  // Typography
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  
  // Accent & Actions
  accentHex: string;
  accentText: string;
  accentBg: string;
  accentBorder: string;
  primaryButton: string;
  
  // Interactive Elements
  activeNavTab: string;
  inactiveNavTab: string;
  inputBg: string;
  inputBorder: string;
  tableHeadBg: string;
  tableRowHover: string;
  tableBorder: string;
  codeBlockBg: string;
  codeBlockBorder: string;
  
  // Chart Colors (for SVG graphics)
  chart: {
    gridColor: string;
    textColor: string;
    tpsLineColor: string;
    tpsAreaStart: string;
    tpsAreaEnd: string;
    p50LineColor: string;
    p95LineColor: string;
    p99LineColor: string;
    scatterDotColor: string;
    scatterDotStroke: string;
    scatterTailColor: string;
    scatterTailStroke: string;
    tooltipBg: string;
    tooltipBorder: string;
    tooltipText: string;
  };
}

export const THEMES: Record<ThemeId, ThemeConfig> = {
  obsidian: {
    id: 'obsidian',
    name: 'Obsidian Emerald',
    isDark: true,
    fontFamily: 'font-sans',
    rootBg: 'bg-[#0b0f17]',
    headerBg: 'bg-[#0e1420]/95 border-slate-800',
    cardBg: 'bg-slate-900/60',
    cardBgSubtle: 'bg-slate-900/40',
    innerPanelBg: 'bg-slate-950/70',
    border: 'border-slate-800',
    borderSubtle: 'border-slate-800/60',
    borderFocus: 'border-emerald-500/50',
    textPrimary: 'text-slate-100',
    textSecondary: 'text-slate-300',
    textMuted: 'text-slate-400',
    accentHex: '#10b981',
    accentText: 'text-emerald-400',
    accentBg: 'bg-emerald-500/10',
    accentBorder: 'border-emerald-500/30',
    primaryButton: 'bg-emerald-400 text-slate-950 hover:bg-emerald-300 shadow-emerald-500/20',
    activeNavTab: 'bg-slate-800 text-emerald-400 shadow-sm',
    inactiveNavTab: 'text-slate-400 hover:text-slate-200',
    inputBg: 'bg-slate-950 text-slate-100',
    inputBorder: 'border-slate-800 focus:border-emerald-500/50',
    tableHeadBg: 'border-slate-800 text-slate-400',
    tableRowHover: 'hover:bg-slate-800/40',
    tableBorder: 'border-slate-800/60',
    codeBlockBg: 'bg-slate-950/80',
    codeBlockBorder: 'border-slate-800',
    chart: {
      gridColor: '#1e293b',
      textColor: '#64748b',
      tpsLineColor: '#10b981',
      tpsAreaStart: '#10b981',
      tpsAreaEnd: '#10b981',
      p50LineColor: '#06b6d4',
      p95LineColor: '#f59e0b',
      p99LineColor: '#f43f5e',
      scatterDotColor: '#38bdf8',
      scatterDotStroke: '#0284c7',
      scatterTailColor: '#f43f5e',
      scatterTailStroke: '#fb7185',
      tooltipBg: 'bg-slate-950',
      tooltipBorder: 'border-slate-700',
      tooltipText: 'text-slate-200',
    },
  },

  light: {
    id: 'light',
    name: 'OpenCode (Light)',
    isDark: false,
    fontFamily: 'font-mono',
    rootBg: 'bg-[#fdfcfc]',
    headerBg: 'bg-[#fdfcfc]/95 border-b border-[rgba(15,0,0,0.12)]',
    cardBg: 'bg-[#f8f7f7]',
    cardBgSubtle: 'bg-[#f1eeee]',
    innerPanelBg: 'bg-[#fdfcfc]',
    border: 'border-[rgba(15,0,0,0.12)]',
    borderSubtle: 'border-[rgba(15,0,0,0.08)]',
    borderFocus: 'border-[#007aff]',
    textPrimary: 'text-[#201d1d]',
    textSecondary: 'text-[#424245]',
    textMuted: 'text-[#646262]',
    accentHex: '#007aff',
    accentText: 'text-[#007aff]',
    accentBg: 'bg-[#007aff]/10',
    accentBorder: 'border-[#007aff]/30',
    primaryButton: 'bg-[#201d1d] text-[#fdfcfc] hover:bg-[#0f0000] rounded-[4px] shadow-none',
    activeNavTab: 'bg-[#201d1d] text-[#fdfcfc] rounded-[4px]',
    inactiveNavTab: 'text-[#646262] hover:text-[#201d1d]',
    inputBg: 'bg-[#fdfcfc] text-[#201d1d]',
    inputBorder: 'border-[rgba(15,0,0,0.2)] focus:border-[#007aff]',
    tableHeadBg: 'border-[rgba(15,0,0,0.12)] text-[#646262] bg-[#f8f7f7]',
    tableRowHover: 'hover:bg-[#f1eeee]/70',
    tableBorder: 'border-[rgba(15,0,0,0.10)]',
    codeBlockBg: 'bg-[#201d1d] text-[#fdfcfc]',
    codeBlockBorder: 'border-[#302c2c]',
    chart: {
      gridColor: 'rgba(15,0,0,0.08)',
      textColor: '#646262',
      tpsLineColor: '#007aff',
      tpsAreaStart: '#007aff',
      tpsAreaEnd: '#007aff',
      p50LineColor: '#007aff',
      p95LineColor: '#ff9f0a',
      p99LineColor: '#ff3b30',
      scatterDotColor: '#007aff',
      scatterDotStroke: '#0056b3',
      scatterTailColor: '#ff3b30',
      scatterTailStroke: '#d70015',
      tooltipBg: 'bg-[#201d1d]',
      tooltipBorder: 'border-[#302c2c]',
      tooltipText: 'text-[#fdfcfc]',
    },
  },

  tungsten: {
    id: 'tungsten',
    name: 'Tungsten Amber',
    isDark: true,
    fontFamily: 'font-sans',
    rootBg: 'bg-[#0e0f14]',
    headerBg: 'bg-[#14151e]/95 border-amber-950/60',
    cardBg: 'bg-[#161722]/80',
    cardBgSubtle: 'bg-[#111219]/60',
    innerPanelBg: 'bg-[#0a0a0f]',
    border: 'border-amber-900/30',
    borderSubtle: 'border-amber-900/20',
    borderFocus: 'border-amber-500/50',
    textPrimary: 'text-amber-50',
    textSecondary: 'text-amber-100/90',
    textMuted: 'text-amber-200/60',
    accentHex: '#f59e0b',
    accentText: 'text-amber-400',
    accentBg: 'bg-amber-500/10',
    accentBorder: 'border-amber-500/30',
    primaryButton: 'bg-amber-400 text-slate-950 hover:bg-amber-300 shadow-amber-500/20',
    activeNavTab: 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs',
    inactiveNavTab: 'text-amber-200/60 hover:text-amber-100',
    inputBg: 'bg-[#0b0c10] text-amber-50',
    inputBorder: 'border-amber-900/40 focus:border-amber-500/50',
    tableHeadBg: 'border-amber-950/80 text-amber-200/60',
    tableRowHover: 'hover:bg-amber-500/5',
    tableBorder: 'border-amber-950/60',
    codeBlockBg: 'bg-[#08090d]',
    codeBlockBorder: 'border-amber-900/30',
    chart: {
      gridColor: '#26221c',
      textColor: '#927c62',
      tpsLineColor: '#f59e0b',
      tpsAreaStart: '#f59e0b',
      tpsAreaEnd: '#f59e0b',
      p50LineColor: '#fbbf24',
      p95LineColor: '#f97316',
      p99LineColor: '#ef4444',
      scatterDotColor: '#fbbf24',
      scatterDotStroke: '#d97706',
      scatterTailColor: '#ef4444',
      scatterTailStroke: '#dc2626',
      tooltipBg: 'bg-[#0a0a0f]',
      tooltipBorder: 'border-amber-700/60',
      tooltipText: 'text-amber-100',
    },
  },

  cobalt: {
    id: 'cobalt',
    name: 'Cobalt Deep',
    isDark: true,
    fontFamily: 'font-sans',
    rootBg: 'bg-[#070b14]',
    headerBg: 'bg-[#0c1222]/95 border-sky-950/60',
    cardBg: 'bg-[#0d1527]/80',
    cardBgSubtle: 'bg-[#090f1d]/60',
    innerPanelBg: 'bg-[#050811]',
    border: 'border-sky-950/70',
    borderSubtle: 'border-sky-950/40',
    borderFocus: 'border-sky-500/50',
    textPrimary: 'text-slate-100',
    textSecondary: 'text-sky-100/90',
    textMuted: 'text-sky-300/60',
    accentHex: '#38bdf8',
    accentText: 'text-sky-400',
    accentBg: 'bg-sky-500/10',
    accentBorder: 'border-sky-500/30',
    primaryButton: 'bg-sky-400 text-slate-950 hover:bg-sky-300 shadow-sky-500/20',
    activeNavTab: 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-xs',
    inactiveNavTab: 'text-sky-300/60 hover:text-sky-100',
    inputBg: 'bg-[#050811] text-sky-50',
    inputBorder: 'border-sky-900/40 focus:border-sky-500/50',
    tableHeadBg: 'border-sky-950 text-sky-300/60',
    tableRowHover: 'hover:bg-sky-500/5',
    tableBorder: 'border-sky-950/60',
    codeBlockBg: 'bg-[#04060c]',
    codeBlockBorder: 'border-sky-900/30',
    chart: {
      gridColor: '#121f38',
      textColor: '#57729e',
      tpsLineColor: '#38bdf8',
      tpsAreaStart: '#38bdf8',
      tpsAreaEnd: '#38bdf8',
      p50LineColor: '#60a5fa',
      p95LineColor: '#c084fc',
      p99LineColor: '#f43f5e',
      scatterDotColor: '#38bdf8',
      scatterDotStroke: '#0284c7',
      scatterTailColor: '#f43f5e',
      scatterTailStroke: '#fb7185',
      tooltipBg: 'bg-[#050811]',
      tooltipBorder: 'border-sky-700/60',
      tooltipText: 'text-sky-100',
    },
  },
};
