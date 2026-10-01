import React, { useState, useRef, useEffect } from 'react';
import { Play, Square, Palette, ChevronDown, Check } from 'lucide-react';
import { ThemeConfig, ThemeId, THEMES } from '../lib/theme.js';

interface TopNavProps {
  activeTab: 'console' | 'telemetry' | 'report' | 'history';
  setActiveTab: (tab: 'console' | 'telemetry' | 'report' | 'history') => void;
  isRunning: boolean;
  onStartBenchmark: () => void;
  onCancelBenchmark: () => void;
  historyCount: number;
  theme: ThemeConfig;
  onSelectTheme: (themeId: ThemeId) => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  setActiveTab,
  isRunning,
  onStartBenchmark,
  onCancelBenchmark,
  historyCount,
  theme,
  onSelectTheme,
}) => {
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setThemeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className={`sticky top-0 z-50 flex items-center justify-between px-6 py-3.5 backdrop-blur-md border-b transition-colors duration-200 ${theme.headerBg}`}>
      {/* Zone 1: Single text wordmark */}
      <div className="flex items-center gap-3">
        <a 
          href="#console" 
          onClick={(e) => { e.preventDefault(); setActiveTab('console'); }}
          className={`text-base font-semibold tracking-tight flex items-center gap-2 transition-colors ${theme.textPrimary}`}
        >
          <span 
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ backgroundColor: theme.accentHex }}
          />
          LLM Speed Benchmark
        </a>
      </div>

      {/* Zone 2: 4 clean navigation links / tabs */}
      <nav className={`flex items-center gap-1 p-1 rounded-lg border transition-colors ${theme.isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-100 border-slate-200'}`}>
        <button
          onClick={() => setActiveTab('console')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
            activeTab === 'console'
              ? theme.activeNavTab
              : theme.inactiveNavTab
          }`}
        >
          Benchmark Console
        </button>

        <button
          onClick={() => setActiveTab('telemetry')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'telemetry'
              ? theme.activeNavTab
              : theme.inactiveNavTab
          }`}
        >
          {isRunning && (
            <span 
              className="w-1.5 h-1.5 rounded-full animate-ping"
              style={{ backgroundColor: theme.accentHex }}
            />
          )}
          Live Telemetry
        </button>

        <button
          onClick={() => setActiveTab('report')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
            activeTab === 'report'
              ? theme.activeNavTab
              : theme.inactiveNavTab
          }`}
        >
          Markdown Report
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap flex items-center gap-1 ${
            activeTab === 'history'
              ? theme.activeNavTab
              : theme.inactiveNavTab
          }`}
        >
          <span>History Archive</span>
          {historyCount > 0 && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono tabular-nums ${theme.isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'}`}>
              {historyCount}
            </span>
          )}
        </button>
      </nav>

      {/* Zone 3: Theme Switcher & Primary Action */}
      <div className="flex items-center gap-3">
        {/* Theme Picker Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setThemeDropdownOpen(!themeDropdownOpen)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all ${
              theme.isDark 
                ? 'bg-slate-900/80 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700' 
                : 'bg-white border-slate-200 text-slate-700 hover:text-slate-900 hover:border-slate-300 shadow-2xs'
            }`}
            title="Switch UI Theme"
          >
            <Palette className="w-3.5 h-3.5" style={{ color: theme.accentHex }} />
            <span className="hidden sm:inline">{theme.name}</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {themeDropdownOpen && (
            <div className={`absolute right-0 mt-1.5 w-52 rounded-xl border p-1 shadow-lg z-50 transition-all ${theme.innerPanelBg} ${theme.border}`}>
              <div className={`px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${theme.textMuted}`}>
                Select Visual Theme
              </div>
              {Object.values(THEMES).map(t => (
                <button
                  key={t.id}
                  onClick={() => {
                    onSelectTheme(t.id);
                    setThemeDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-2 text-xs rounded-lg transition-colors text-left ${
                    theme.id === t.id
                      ? `${t.accentBg} ${theme.textPrimary} font-medium`
                      : `${theme.textSecondary} hover:${theme.textPrimary} hover:opacity-80`
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span 
                      className="w-2.5 h-2.5 rounded-full shrink-0" 
                      style={{ backgroundColor: t.accentHex }}
                    />
                    <span>{t.name}</span>
                  </div>
                  {theme.id === t.id && (
                    <Check className="w-3.5 h-3.5" style={{ color: t.accentHex }} />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Primary Benchmark Action */}
        {isRunning ? (
          <button
            onClick={onCancelBenchmark}
            className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded-lg hover:bg-rose-500/20 transition-all whitespace-nowrap"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>Abort Stream</span>
          </button>
        ) : (
          <button
            onClick={onStartBenchmark}
            className={`flex items-center gap-2 px-4 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap shadow-xs active:scale-[0.98] ${theme.primaryButton}`}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Launch Benchmark</span>
          </button>
        )}
      </div>
    </header>
  );
};

