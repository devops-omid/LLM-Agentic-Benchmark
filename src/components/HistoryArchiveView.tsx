import React, { useState } from 'react';
import { HistoryRunItem } from '../types.js';
import { 
  Search, 
  Download, 
  Eye, 
  Trash2, 
  FileText
} from 'lucide-react';
import { ThemeConfig } from '../lib/theme.js';

interface HistoryArchiveViewProps {
  history: HistoryRunItem[];
  onSelectRun: (runId: string) => void;
  onDeleteRun: (runId: string) => void;
  theme: ThemeConfig;
}

export const HistoryArchiveView: React.FC<HistoryArchiveViewProps> = ({
  history,
  onSelectRun,
  onDeleteRun,
  theme,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>('all');

  const filteredHistory = history.filter(item => {
    const matchesSearch = 
      item.runId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.model.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesProvider = selectedProvider === 'all' || item.provider === selectedProvider;
    return matchesSearch && matchesProvider;
  });

  const handleDownloadReport = (runId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const a = document.createElement('a');
    a.href = `/api/history/${runId}/report`;
    a.download = `${runId}.md`;
    a.click();
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter Header */}
      <div className={`flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border transition-colors ${theme.cardBg} ${theme.border}`}>
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className={`w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 ${theme.textMuted}`} />
            <input
              type="text"
              placeholder="Search historical runs by model or run identifier..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border focus:outline-none transition-colors ${theme.inputBg} ${theme.inputBorder}`}
            />
          </div>
        </div>

        {/* Provider Segmented Filter */}
        <div className={`flex items-center gap-1 p-1 rounded-lg border text-xs ${theme.innerPanelBg} ${theme.borderSubtle}`}>
          <button
            onClick={() => setSelectedProvider('all')}
            className={`px-3 py-1 rounded transition-colors ${
              selectedProvider === 'all' ? theme.activeNavTab : theme.inactiveNavTab
            }`}
          >
            All Providers ({history.length})
          </button>
          <button
            onClick={() => setSelectedProvider('hyperqwen')}
            className={`px-3 py-1 rounded transition-colors ${
              selectedProvider === 'hyperqwen' ? theme.activeNavTab : theme.inactiveNavTab
            }`}
          >
            HyperQwen
          </button>
          <button
            onClick={() => setSelectedProvider('nvidia_nim')}
            className={`px-3 py-1 rounded transition-colors ${
              selectedProvider === 'nvidia_nim' ? theme.activeNavTab : theme.inactiveNavTab
            }`}
          >
            NVIDIA NIM
          </button>
          <button
            onClick={() => setSelectedProvider('google_gemini')}
            className={`px-3 py-1 rounded transition-colors ${
              selectedProvider === 'google_gemini' ? theme.activeNavTab : theme.inactiveNavTab
            }`}
          >
            Gemini
          </button>
        </div>
      </div>

      {/* History Runs Table */}
      <div className={`p-4 rounded-xl border overflow-hidden transition-colors ${theme.cardBg} ${theme.border}`}>
        {filteredHistory.length === 0 ? (
          <div className={`py-16 text-center text-xs ${theme.textMuted}`}>
            No historical benchmark runs match your criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className={`border-b text-[11px] font-mono ${theme.tableHeadBg}`}>
                  <th className="py-2.5 px-3">Run Identifier</th>
                  <th className="py-2.5 px-3">Model Architecture</th>
                  <th className="py-2.5 px-3 text-right">Streams</th>
                  <th className="py-2.5 px-3 text-right">Context</th>
                  <th className="py-2.5 px-3 text-right">Output</th>
                  <th className="py-2.5 px-3 text-right">Aggregate TPS</th>
                  <th className="py-2.5 px-3 text-right">p50 TTFT</th>
                  <th className="py-2.5 px-3 text-right">p95 TTFT</th>
                  <th className="py-2.5 px-3 text-right">Wall Time</th>
                  <th className="py-2.5 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y font-mono ${theme.tableBorder}`}>
                {filteredHistory.map(item => (
                  <tr
                    key={item.runId}
                    onClick={() => onSelectRun(item.runId)}
                    className={`${theme.tableRowHover} cursor-pointer transition-colors group`}
                  >
                    <td className={`py-3 px-3 font-semibold text-[11px] ${theme.textPrimary}`}>
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 opacity-50" />
                        <span className="truncate max-w-[150px]">{item.runId}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 font-sans">
                      <div className={`font-medium ${theme.textPrimary}`}>{item.model}</div>
                      <div className={`text-[10px] ${theme.textMuted}`}>
                        {item.provider === 'hyperqwen' ? 'HyperQwen vLLM' : item.provider === 'nvidia_nim' ? 'NVIDIA NIM' : 'Google Gemini'}
                      </div>
                    </td>
                    <td className={`py-3 px-3 text-right tabular-nums ${theme.textSecondary}`}>
                      {item.concurrency}
                    </td>
                    <td className={`py-3 px-3 text-right tabular-nums ${theme.textSecondary}`}>
                      {item.promptTokens === 0 ? '0' : `${(item.promptTokens / 1024).toFixed(0)}k`}
                    </td>
                    <td className={`py-3 px-3 text-right tabular-nums ${theme.textSecondary}`}>
                      {item.outputTokens}
                    </td>
                    <td className={`py-3 px-3 text-right font-semibold tabular-nums ${theme.accentText}`}>
                      {item.aggregateTps} TPS
                    </td>
                    <td className="py-3 px-3 text-right text-cyan-400 tabular-nums">
                      {item.p50Ttft} ms
                    </td>
                    <td className="py-3 px-3 text-right text-amber-400 tabular-nums">
                      {item.p95Ttft} ms
                    </td>
                    <td className={`py-3 px-3 text-right tabular-nums ${theme.textMuted}`}>
                      {item.wallTimeSec}s
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-center gap-1.5 opacity-80 group-hover:opacity-100">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectRun(item.runId);
                          }}
                          title="View Telemetry & Report"
                          className={`p-1.5 rounded hover:bg-slate-500/20 transition-colors ${theme.textSecondary}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDownloadReport(item.runId, e)}
                          title="Download Markdown Report"
                          className={`p-1.5 rounded hover:bg-slate-500/20 transition-colors ${theme.textSecondary}`}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteRun(item.runId);
                          }}
                          title="Delete Run"
                          className="p-1.5 rounded hover:bg-rose-500/20 text-rose-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
