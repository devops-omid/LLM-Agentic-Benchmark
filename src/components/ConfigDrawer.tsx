import React from 'react';
import { 
  BenchmarkModel, 
  WorkloadPreset, 
  BenchmarkConfig 
} from '../types.js';
import { 
  Cpu, 
  Layers, 
  Gauge, 
  Sliders, 
  Server, 
  Zap, 
  Check, 
  Database, 
  ArrowRight, 
  Sparkles,
  RefreshCw,
  Hash,
  Scale
} from 'lucide-react';
import { ThemeConfig } from '../lib/theme.js';

interface ConfigDrawerProps {
  models: BenchmarkModel[];
  presets: WorkloadPreset[];
  config: BenchmarkConfig;
  onChangeConfig: (newConfig: BenchmarkConfig) => void;
  onApplyPreset: (preset: WorkloadPreset) => void;
  onStartBenchmark: () => void;
  isRunning: boolean;
  envConfig: {
    hasNvidiaKey: boolean;
    hasGeminiKey: boolean;
    nvidiaBaseUrl: string;
  } | null;
  theme: ThemeConfig;
}

export const ConfigDrawer: React.FC<ConfigDrawerProps> = ({
  models,
  presets,
  config,
  onChangeConfig,
  onApplyPreset,
  onStartBenchmark,
  isRunning,
  envConfig,
  theme,
}) => {
  const selectedModel = models.find(m => m.id === config.modelId) || models[0];

  // Core range state
  const outputSize = config.targetOutputTokens || 256;
  const contextStart = config.contextStart !== undefined ? config.contextStart : 0;
  const contextEnd = config.contextEnd !== undefined ? config.contextEnd : Math.max(contextStart, outputSize * 4);

  // Helper to calculate discrete ladder steps divided by output size
  const calculateLadderSteps = (start: number, end: number, stride: number): number[] => {
    const steps: number[] = [];
    const stepSize = Math.max(16, stride);
    for (let cur = start; cur <= end; cur += stepSize) {
      steps.push(cur);
    }
    if (steps.length === 0 || steps[steps.length - 1] < end) {
      steps.push(end);
    }
    return steps;
  };

  const calculatedSteps = calculateLadderSteps(contextStart, contextEnd, outputSize);

  // Workload calculations
  const totalEstimatedPromptTokens = config.isSequentialLadder
    ? calculatedSteps.reduce((acc, step) => acc + step, 0)
    : config.promptTokens * config.totalRequests;
  const totalEstimatedOutputTokens = config.isSequentialLadder
    ? outputSize * calculatedSteps.length * (config.enableKvCacheReuse ? 2 : 1)
    : outputSize * config.totalRequests;
  const totalTokens = totalEstimatedPromptTokens + totalEstimatedOutputTokens;

  const isRealNvidia = selectedModel?.provider === 'nvidia_nim' && envConfig?.hasNvidiaKey;
  const isRealGemini = selectedModel?.provider === 'google_gemini' && envConfig?.hasGeminiKey;

  // Handlers for the 3-step range flow
  // 1. Output Size selection
  const handleSelectOutputSize = (newOutputSize: number) => {
    // Preserve current multiplier of output size if reasonable
    const currentMultiplier = outputSize > 0 ? Math.max(1, Math.round(contextEnd / outputSize)) : 4;
    const newContextEnd = Math.max(contextStart + newOutputSize, newOutputSize * currentMultiplier);
    const newSteps = calculateLadderSteps(contextStart, newContextEnd, newOutputSize);

    onChangeConfig({
      ...config,
      targetOutputTokens: newOutputSize,
      contextEnd: newContextEnd,
      ladderSteps: newSteps,
      promptTokens: config.isSequentialLadder ? contextStart : config.promptTokens,
    });
  };

  // 2. Context Start selection (default 0)
  const handleSelectContextStart = (newStart: number) => {
    const validEnd = Math.max(newStart + outputSize, contextEnd);
    const newSteps = calculateLadderSteps(newStart, validEnd, outputSize);

    onChangeConfig({
      ...config,
      contextStart: newStart,
      contextEnd: validEnd,
      ladderSteps: newSteps,
      promptTokens: config.isSequentialLadder ? newStart : newStart,
    });
  };

  // 3. Context End selection (Multiple of output size)
  const handleSelectContextEndMultiple = (multiplier: number) => {
    const newEnd = Math.max(contextStart + outputSize, outputSize * multiplier);
    const newSteps = calculateLadderSteps(contextStart, newEnd, outputSize);

    onChangeConfig({
      ...config,
      contextEnd: newEnd,
      ladderSteps: newSteps,
    });
  };

  // Common output size presets
  const OUTPUT_SIZE_OPTIONS = [
    { value: 128, label: '128 tok' },
    { value: 256, label: '256 tok' },
    { value: 512, label: '512 tok' },
    { value: 1024, label: '1K (1,024)' },
    { value: 2048, label: '2K (2,048)' },
    { value: 4096, label: '4K (4,096)' },
    { value: 8192, label: '8K (8,192)' },
    { value: 16384, label: '16K (16,384)' },
    { value: 32768, label: '32K (32,768)' },
  ];

  // Context Start Options (Default 0, or multiples)
  const CONTEXT_START_OPTIONS = [
    { value: 0, label: '0 (Empty Context · Default)' },
    { value: outputSize, label: `1× (${outputSize.toLocaleString()} tok)` },
    { value: outputSize * 2, label: `2× (${(outputSize * 2).toLocaleString()} tok)` },
    { value: outputSize * 4, label: `4× (${(outputSize * 4).toLocaleString()} tok)` },
  ];

  // Context End Multipliers (Multiples of output size)
  const END_MULTIPLIERS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32];

  const currentMultiplier = Math.round(contextEnd / Math.max(1, outputSize));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column: Model & Context Range Division (7 cols) */}
      <div className="lg:col-span-7 space-y-6">
        {/* Model Selection */}
        <div className={`p-5 rounded-xl border transition-colors ${theme.cardBg} ${theme.border}`}>
          <div className="flex items-center justify-between mb-3">
            <label className={`text-xs font-semibold uppercase tracking-wider flex items-center gap-2 ${theme.textSecondary}`}>
              <Cpu className="w-4 h-4" style={{ color: theme.accentHex }} />
              Inference Model Target
            </label>
            <div className={`text-xs ${theme.textMuted}`}>
              Active: <span className={`font-semibold ${theme.textPrimary}`}>{selectedModel?.name}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {models.map(model => {
              const isSelected = model.id === config.modelId;
              const isGeminiLite = model.id.includes('flash-lite');
              const isCheapNvidia = model.id === 'meta/llama-3.2-11b-vision-instruct';

              return (
                <button
                  key={model.id}
                  onClick={() => onChangeConfig({ ...config, modelId: model.id })}
                  disabled={isRunning}
                  className={`text-left p-3 rounded-lg border transition-all relative ${
                    isSelected
                      ? `${theme.isDark ? 'bg-slate-800/90 shadow-sm' : 'bg-[#f1eeee] shadow-xs'} ${theme.borderFocus}`
                      : `${theme.cardBgSubtle} ${theme.borderSubtle} hover:border-slate-400/40`
                  }`}
                >
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span className={`text-xs font-semibold tracking-tight ${theme.textPrimary}`}>
                      {model.name}
                    </span>
                    {isGeminiLite ? (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 whitespace-nowrap font-medium">
                        Lowest Cost Gemini
                      </span>
                    ) : isCheapNvidia ? (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-500 border border-cyan-500/30 whitespace-nowrap font-medium">
                        Fast & Cheap NIM
                      </span>
                    ) : (
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${theme.accentBg} ${theme.accentText} border ${theme.accentBorder} whitespace-nowrap`}>
                        {model.parameterSize}
                      </span>
                    )}
                  </div>
                  <p className={`text-[11px] line-clamp-2 leading-relaxed ${theme.textMuted}`}>
                    {model.description}
                  </p>
                  <div className={`mt-2 flex items-center justify-between text-[10px] font-mono ${theme.textMuted}`}>
                    <span>Context Limit: {(model.contextLimit / 1024).toFixed(0)}K</span>
                    <span>{model.provider === 'nvidia_nim' ? 'NVIDIA NIM' : 'Google Gemini'}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Inference Mode Status */}
          <div className={`mt-4 p-3 rounded-lg border flex items-center justify-between text-xs ${theme.innerPanelBg} ${theme.borderSubtle}`}>
            <div className="flex items-center gap-2">
              <Server className="w-3.5 h-3.5 opacity-60" />
              <span className={theme.textMuted}>Backend Connection:</span>
              {isRealNvidia ? (
                <span className={`${theme.accentText} font-medium`}>Real NVIDIA NIM API ({envConfig?.nvidiaBaseUrl})</span>
              ) : isRealGemini ? (
                <span className={`${theme.accentText} font-medium`}>Real Google Gemini Streaming API</span>
              ) : (
                <span className="text-amber-500 font-medium">Calibrated Hardware Simulation Engine</span>
              )}
            </div>
            <div className={`text-[11px] font-mono ${theme.textMuted}`}>
              Port: 3000
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* CORE FEATURE: Context Window Range Divided by Output Size                 */}
        {/* 1. User chooses Output Size                                               */}
        {/* 2. User chooses Context Window Start (default 0)                          */}
        {/* 3. User chooses Context Window End (multiple of Output Size)              */}
        {/* ========================================================================= */}
        <div className={`p-5 rounded-xl border space-y-5 transition-colors ${theme.cardBg} ${theme.border}`}>
          <div className={`flex flex-wrap items-center justify-between pb-3 border-b ${theme.borderSubtle}`}>
            <div>
              <h3 className={`text-xs font-semibold uppercase tracking-wider flex items-center gap-2 ${theme.textSecondary}`}>
                <Scale className="w-4 h-4" style={{ color: theme.accentHex }} />
                Context Range Builder (Divided by Output Size)
              </h3>
              <p className={`text-[11px] mt-0.5 ${theme.textMuted}`}>
                Calibrate sequential context scaling with step increment = 1× Output Size
              </p>
            </div>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${theme.accentBg} ${theme.accentBorder} ${theme.accentText}`}>
              Stride = {outputSize.toLocaleString()} tok
            </span>
          </div>

          {/* STEP 1: Choose Output Size */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={`text-xs font-semibold flex items-center gap-1.5 ${theme.textPrimary}`}>
                <span className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold font-mono ${theme.primaryButton}`}>
                  1
                </span>
                Target Output Generation Size
              </label>
              <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded tabular-nums ${theme.innerPanelBg} ${theme.accentText} border ${theme.borderSubtle}`}>
                {outputSize.toLocaleString()} tokens/req
              </span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {OUTPUT_SIZE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleSelectOutputSize(opt.value)}
                  disabled={isRunning}
                  className={`py-1.5 px-2 text-[11px] font-mono rounded border transition-all text-center ${
                    outputSize === opt.value
                      ? `${theme.accentBg} ${theme.accentText} ${theme.borderFocus} font-semibold shadow-2xs`
                      : `${theme.cardBgSubtle} ${theme.textMuted} ${theme.borderSubtle} hover:${theme.textPrimary}`
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className={`text-[10px] mt-1.5 ${theme.textMuted}`}>
              Step stride will scale in exact increments of {outputSize.toLocaleString()} tokens.
            </div>
          </div>

          {/* STEP 2: Choose Context Window Start (Default: 0) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={`text-xs font-semibold flex items-center gap-1.5 ${theme.textPrimary}`}>
                <span className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold font-mono ${theme.primaryButton}`}>
                  2
                </span>
                Context Window Start (Default: 0)
              </label>
              <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded tabular-nums ${theme.innerPanelBg} ${theme.textPrimary} border ${theme.borderSubtle}`}>
                {contextStart === 0 ? '0 (Empty Context)' : `${contextStart.toLocaleString()} tokens`}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CONTEXT_START_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleSelectContextStart(opt.value)}
                  disabled={isRunning}
                  className={`py-1.5 px-2 text-[11px] font-mono rounded border transition-all text-center ${
                    contextStart === opt.value
                      ? `${theme.accentBg} ${theme.accentText} ${theme.borderFocus} font-semibold shadow-2xs`
                      : `${theme.cardBgSubtle} ${theme.textMuted} ${theme.borderSubtle} hover:${theme.textPrimary}`
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* STEP 3: Choose Context Window End (Multiple of Output Size) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={`text-xs font-semibold flex items-center gap-1.5 ${theme.textPrimary}`}>
                <span className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold font-mono ${theme.primaryButton}`}>
                  3
                </span>
                Context Window End (Multiple of Output Size)
              </label>
              <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded tabular-nums ${theme.innerPanelBg} ${theme.accentText} border ${theme.borderSubtle}`}>
                {contextEnd.toLocaleString()} tokens ({currentMultiplier}× Output)
              </span>
            </div>

            <div className="grid grid-cols-5 sm:grid-cols-10 gap-1">
              {END_MULTIPLIERS.map(mult => {
                const tokenVal = outputSize * mult;
                const isSelected = currentMultiplier === mult;

                return (
                  <button
                    key={mult}
                    onClick={() => handleSelectContextEndMultiple(mult)}
                    disabled={isRunning}
                    title={`${mult}× Output Size = ${tokenVal.toLocaleString()} tokens`}
                    className={`py-1 px-1 text-[11px] font-mono rounded border transition-all text-center ${
                      isSelected
                        ? `${theme.accentBg} ${theme.accentText} ${theme.borderFocus} font-bold shadow-2xs`
                        : `${theme.cardBgSubtle} ${theme.textMuted} ${theme.borderSubtle} hover:${theme.textPrimary}`
                    }`}
                  >
                    {mult}×
                  </button>
                );
              })}
            </div>

            <div className={`mt-2 flex items-center justify-between text-[11px] font-mono ${theme.textMuted}`}>
              <span>Selected End: {contextEnd.toLocaleString()} tokens</span>
              <span className={theme.accentText}>
                {calculatedSteps.length} stages (div by {outputSize.toLocaleString()})
              </span>
            </div>
          </div>

          {/* Visual Step Matrix / Sequence Pipeline Preview */}
          <div className={`p-4 rounded-xl border space-y-3 ${theme.innerPanelBg} ${theme.borderSubtle}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-500" />
                <span className={`text-xs font-semibold ${theme.textPrimary}`}>
                  Generated Pipeline: {calculatedSteps.length} Discrete Benchmark Stages
                </span>
              </div>
              <span className={`text-[10px] font-mono ${theme.accentText}`}>
                Prefix Reuse: Enabled
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {calculatedSteps.map((stepTok, idx) => {
                const isCurrentPrompt = config.promptTokens === stepTok && !config.isSequentialLadder;
                return (
                  <React.Fragment key={stepTok}>
                    <button
                      onClick={() => onChangeConfig({
                        ...config,
                        promptTokens: stepTok,
                        isSequentialLadder: false
                      })}
                      title={`Click to set single prompt context to ${stepTok.toLocaleString()} tokens`}
                      disabled={isRunning}
                      className={`px-2.5 py-1 rounded text-xs font-mono font-medium border transition-all flex items-center gap-1 ${
                        isCurrentPrompt
                          ? 'ring-2 ring-emerald-500 bg-emerald-500/20 text-emerald-400 font-bold'
                          : idx === 0
                          ? `${theme.cardBgSubtle} ${theme.borderSubtle} ${theme.textMuted}`
                          : `${theme.accentBg} ${theme.accentBorder} ${theme.accentText} hover:scale-105`
                      }`}
                    >
                      <span>Stage {idx + 1}:</span>
                      <strong>{stepTok === 0 ? '0' : `${(stepTok / 1024).toFixed(0)}K`}</strong>
                    </button>
                    {idx < calculatedSteps.length - 1 && (
                      <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-700/20 flex flex-wrap items-center justify-between text-[11px]">
              <span className={`flex items-center gap-1.5 ${theme.textMuted}`}>
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                KV Cache Acceleration: Each test stage appends exactly {outputSize.toLocaleString()} tokens to the previous context.
              </span>
              <span className={`font-mono ${theme.accentText}`}>
                {contextStart.toLocaleString()} → {contextEnd.toLocaleString()} tokens
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Execution Mode, Semaphore Throttling & Footprint (5 cols) */}
      <div className="lg:col-span-5 space-y-6">
        {/* Execution Mode Selector */}
        <div className={`p-5 rounded-xl border space-y-4 transition-colors ${theme.cardBg} ${theme.border}`}>
          <div className={`flex items-center justify-between pb-3 border-b ${theme.borderSubtle}`}>
            <h3 className={`text-xs font-semibold uppercase tracking-wider flex items-center gap-2 ${theme.textSecondary}`}>
              <Gauge className="w-4 h-4" style={{ color: theme.accentHex }} />
              Benchmarking Execution Mode
            </h3>
            <span className={`text-[10px] font-mono ${theme.textMuted}`}>asyncio.Semaphore</span>
          </div>

          {/* Mode Switcher Tabs */}
          <div className={`grid grid-cols-2 gap-2 p-1 rounded-lg border ${theme.innerPanelBg} ${theme.borderSubtle}`}>
            <button
              onClick={() => onChangeConfig({
                ...config,
                isSequentialLadder: true,
                ladderSteps: calculatedSteps,
                enableKvCacheReuse: true,
              })}
              disabled={isRunning}
              className={`py-2 px-3 rounded-md text-xs font-medium transition-all text-center flex flex-col items-center gap-1 ${
                config.isSequentialLadder
                  ? `${theme.activeNavTab} shadow-xs font-semibold`
                  : `${theme.inactiveNavTab} hover:${theme.textPrimary}`
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                <span>Sequential Ladder</span>
              </div>
              <span className="text-[10px] opacity-75 font-normal">
                {calculatedSteps.length} stages (KV Cache)
              </span>
            </button>

            <button
              onClick={() => onChangeConfig({
                ...config,
                isSequentialLadder: false,
                promptTokens: config.promptTokens || contextStart,
              })}
              disabled={isRunning}
              className={`py-2 px-3 rounded-md text-xs font-medium transition-all text-center flex flex-col items-center gap-1 ${
                !config.isSequentialLadder
                  ? `${theme.activeNavTab} shadow-xs font-semibold`
                  : `${theme.inactiveNavTab} hover:${theme.textPrimary}`
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                <span>Single Range Point</span>
              </div>
              <span className="text-[10px] opacity-75 font-normal">
                {config.totalRequests} batch requests
              </span>
            </button>
          </div>

          {/* Concurrency Level Slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-medium ${theme.textSecondary}`}>Concurrency Throttling</span>
              <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded tabular-nums ${theme.accentBg} ${theme.accentText} border ${theme.accentBorder}`}>
                {config.concurrency} parallel streams
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="50"
              step="1"
              value={config.concurrency}
              onChange={(e) => onChangeConfig({ ...config, concurrency: Number(e.target.value) })}
              disabled={isRunning}
              style={{ accentColor: theme.accentHex }}
              className={`w-full cursor-pointer h-1.5 rounded-lg ${theme.isDark ? 'bg-slate-800' : 'bg-slate-200'}`}
            />
            <div className={`flex justify-between text-[10px] font-mono mt-1 ${theme.textMuted}`}>
              <span>1 stream</span>
              <span>25 streams</span>
              <span>50 streams</span>
            </div>
          </div>

          {/* Total Requests count (when single point) */}
          {!config.isSequentialLadder ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-medium ${theme.textSecondary}`}>Total Benchmark Requests</span>
                <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded tabular-nums ${theme.innerPanelBg} ${theme.textPrimary} border ${theme.borderSubtle}`}>
                  {config.totalRequests} runs
                </span>
              </div>
              <input
                type="range"
                min="2"
                max="100"
                step="2"
                value={config.totalRequests}
                onChange={(e) => onChangeConfig({ ...config, totalRequests: Number(e.target.value) })}
                disabled={isRunning}
                style={{ accentColor: theme.accentHex }}
                className={`w-full cursor-pointer h-1.5 rounded-lg ${theme.isDark ? 'bg-slate-800' : 'bg-slate-200'}`}
              />
              <div className={`flex justify-between text-[10px] font-mono mt-1 ${theme.textMuted}`}>
                <span>2</span>
                <span>50</span>
                <span>100</span>
              </div>
            </div>
          ) : (
            <div className={`p-3 rounded-lg border text-xs flex items-center justify-between ${theme.innerPanelBg} ${theme.borderSubtle}`}>
              <span className={theme.textMuted}>Sequential Pipeline:</span>
              <span className={`font-mono font-semibold ${theme.accentText}`}>
                {calculatedSteps.length * (config.enableKvCacheReuse ? 2 : 1)} runs (Cold + Warm KV)
              </span>
            </div>
          )}

          {/* Sampling Temperature */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-medium ${theme.textSecondary}`}>Sampling Temperature</span>
              <span className={`text-xs font-mono px-2 py-0.5 rounded tabular-nums ${theme.innerPanelBg} ${theme.textMuted} border ${theme.borderSubtle}`}>
                {config.temperature}
              </span>
            </div>
            <input
              type="range"
              min="0.0"
              max="1.0"
              step="0.05"
              value={config.temperature}
              onChange={(e) => onChangeConfig({ ...config, temperature: Number(e.target.value) })}
              disabled={isRunning}
              style={{ accentColor: theme.accentHex }}
              className={`w-full cursor-pointer h-1.5 rounded-lg ${theme.isDark ? 'bg-slate-800' : 'bg-slate-200'}`}
            />
          </div>
        </div>

        {/* Workload Footprint Calculation Card */}
        <div className={`p-5 rounded-xl border space-y-4 transition-colors ${theme.cardBg} ${theme.border}`}>
          <div className="flex items-center justify-between">
            <h4 className={`text-xs font-semibold flex items-center gap-2 ${theme.textPrimary}`}>
              <Layers className="w-4 h-4" style={{ color: theme.accentHex }} />
              Estimated Workload Footprint
            </h4>
            <span className={`text-[10px] font-mono ${theme.textMuted}`}>
              {config.isSequentialLadder ? `${calculatedSteps.length} Stages` : 'Batch Run'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className={`p-3 rounded-lg border ${theme.innerPanelBg} ${theme.borderSubtle}`}>
              <div className={`text-[10px] ${theme.textMuted}`}>Context Range</div>
              <div className={`text-xs font-semibold font-mono tabular-nums mt-0.5 ${theme.textPrimary}`}>
                {contextStart === 0 ? '0' : `${(contextStart / 1024).toFixed(0)}K`} → {(contextEnd / 1024).toFixed(0)}K tok
              </div>
            </div>
            <div className={`p-3 rounded-lg border ${theme.innerPanelBg} ${theme.borderSubtle}`}>
              <div className={`text-[10px] ${theme.textMuted}`}>Output Size / Stride</div>
              <div className={`text-xs font-semibold font-mono tabular-nums mt-0.5 ${theme.accentText}`}>
                {outputSize >= 1024 ? `${(outputSize / 1024).toFixed(0)}K` : outputSize} tokens
              </div>
            </div>
            <div className={`p-3 rounded-lg border ${theme.innerPanelBg} ${theme.borderSubtle}`}>
              <div className={`text-[10px] ${theme.textMuted}`}>Execution Mode</div>
              <div className={`text-xs font-semibold font-mono mt-0.5 ${theme.textPrimary}`}>
                {config.isSequentialLadder ? 'Sequential KV' : `${config.concurrency} Streams`}
              </div>
            </div>
            <div className={`p-3 rounded-lg border ${theme.innerPanelBg} ${theme.borderSubtle}`}>
              <div className={`text-[10px] ${theme.textMuted}`}>Estimated Cluster Tokens</div>
              <div className={`text-xs font-semibold font-mono tabular-nums mt-0.5 ${theme.textPrimary}`}>
                {totalTokens.toLocaleString()}
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              if (config.isSequentialLadder) {
                onChangeConfig({
                  ...config,
                  ladderSteps: calculatedSteps,
                  contextStart,
                  contextEnd,
                });
              }
              onStartBenchmark();
            }}
            disabled={isRunning}
            className={`w-full py-2.5 px-4 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-all flex items-center justify-center gap-2 ${theme.primaryButton}`}
          >
            <Zap className="w-4 h-4 fill-current" />
            <span>
              {config.isSequentialLadder 
                ? `Launch Range Ladder (${calculatedSteps.length} Stages: ${contextStart === 0 ? '0' : `${(contextStart / 1024).toFixed(0)}K`} → ${(contextEnd / 1024).toFixed(0)}K)`
                : `Benchmark at ${config.promptTokens.toLocaleString()} Context (${config.concurrency} Streams)`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
