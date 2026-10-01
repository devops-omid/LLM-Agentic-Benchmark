import React, { useState, useEffect } from 'react';
import { 
  Copy, 
  Check, 
  Download, 
  FileText, 
  Code, 
  Eye, 
  Terminal,
} from 'lucide-react';
import { BenchmarkRunRaw } from '../types.js';
import { ThemeConfig } from '../lib/theme.js';

interface MarkdownReportViewProps {
  currentRunId: string | null;
  runData: BenchmarkRunRaw | null;
  theme: ThemeConfig;
}

export const MarkdownReportView: React.FC<MarkdownReportViewProps> = ({
  currentRunId,
  runData,
  theme,
}) => {
  const [reportMarkdown, setReportMarkdown] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'rendered' | 'raw'>('rendered');

  useEffect(() => {
    if (!currentRunId) return;

    setIsLoading(true);
    fetch(`/api/history/${currentRunId}/report`)
      .then(async res => {
        if (!res.ok) throw new Error('Report not found');
        return await res.text();
      })
      .then(text => {
        setReportMarkdown(text);
      })
      .catch(err => {
        console.error('Failed to load report:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [currentRunId]);

  const handleCopy = () => {
    if (!reportMarkdown) return;
    navigator.clipboard.writeText(reportMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadMd = () => {
    if (!reportMarkdown) return;
    const blob = new Blob([reportMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentRunId || 'benchmark_report'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    if (!runData) return;
    const blob = new Blob([JSON.stringify(runData, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentRunId || 'benchmark_telemetry'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!currentRunId && !reportMarkdown) {
    return (
      <div className={`py-24 text-center p-8 rounded-xl border space-y-3 ${theme.cardBg} ${theme.border}`}>
        <FileText className={`w-10 h-10 mx-auto ${theme.textMuted}`} />
        <h4 className={`text-sm font-semibold ${theme.textPrimary}`}>No Benchmark Report Selected</h4>
        <p className={`text-xs max-w-md mx-auto ${theme.textMuted}`}>
          Execute a benchmark run or select a historical benchmark from the archive to inspect its executive Markdown summary.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Action Header Bar */}
      <div className={`flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border transition-colors ${theme.cardBg} ${theme.border}`}>
        <div className="flex items-center gap-3">
          <FileText className="w-4 h-4" style={{ color: theme.accentHex }} />
          <div>
            <div className={`text-xs font-semibold font-mono ${theme.textPrimary}`}>
              {currentRunId}.md
            </div>
            <div className={`text-[11px] ${theme.textMuted}`}>
              Executive Markdown Telemetry Report
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className={`flex items-center p-1 rounded-lg border text-xs ${theme.innerPanelBg} ${theme.borderSubtle}`}>
            <button
              onClick={() => setViewMode('rendered')}
              className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1.5 ${
                viewMode === 'rendered' ? theme.activeNavTab : theme.inactiveNavTab
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview</span>
            </button>
            <button
              onClick={() => setViewMode('raw')}
              className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1.5 ${
                viewMode === 'raw' ? theme.activeNavTab : theme.inactiveNavTab
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              <span>Raw MD</span>
            </button>
          </div>

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
              theme.isDark 
                ? 'bg-slate-800 text-slate-200 hover:bg-slate-700 border-slate-700' 
                : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200 shadow-2xs'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" style={{ color: theme.accentHex }} />
                <span className={theme.accentText}>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Markdown</span>
              </>
            )}
          </button>

          {/* Download MD */}
          <button
            onClick={handleDownloadMd}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
              theme.isDark 
                ? 'bg-slate-800 text-slate-200 hover:bg-slate-700 border-slate-700' 
                : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200 shadow-2xs'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download .md</span>
          </button>

          {/* Download JSON */}
          {runData && (
            <button
              onClick={handleDownloadJson}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${theme.accentBg} ${theme.accentText} ${theme.accentBorder}`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Raw JSON</span>
            </button>
          )}
        </div>
      </div>

      {/* Report Content Viewport */}
      <div className={`p-6 rounded-xl border min-h-[500px] transition-colors ${theme.cardBg} ${theme.border}`}>
        {isLoading ? (
          <div className={`py-20 text-center text-xs ${theme.textMuted}`}>
            Loading generated markdown summary...
          </div>
        ) : viewMode === 'raw' ? (
          <pre className={`text-xs font-mono p-4 rounded-lg border leading-relaxed overflow-x-auto whitespace-pre-wrap select-all ${theme.codeBlockBg} ${theme.codeBlockBorder} ${theme.isDark ? 'text-slate-300' : 'text-slate-100'}`}>
            {reportMarkdown}
          </pre>
        ) : (
          <div className={`prose max-w-none text-xs leading-relaxed space-y-4 ${theme.isDark ? 'text-slate-300' : 'text-slate-700'}`}>
            {/* Simple clean markdown parser for headings, tables, lists */}
            {reportMarkdown.split('\n\n').map((block, idx) => {
              if (block.startsWith('# ')) {
                return (
                  <h1 key={idx} className={`text-lg font-bold tracking-tight pb-2 border-b ${theme.textPrimary} ${theme.borderSubtle}`}>
                    {block.replace(/^#\s+/, '')}
                  </h1>
                );
              }
              if (block.startsWith('## ')) {
                return (
                  <h2 key={idx} className={`text-sm font-semibold tracking-tight pt-4 pb-1 border-b ${theme.accentText} ${theme.borderSubtle}`}>
                    {block.replace(/^##\s+/, '')}
                  </h2>
                );
              }
              if (block.startsWith('### ')) {
                return (
                  <h3 key={idx} className={`text-xs font-semibold pt-2 ${theme.textPrimary}`}>
                    {block.replace(/^###\s+/, '')}
                  </h3>
                );
              }
              if (block.startsWith('|')) {
                // Table
                const rows = block.split('\n').filter(r => r.trim() && !r.includes(':---'));
                return (
                  <div key={idx} className="overflow-x-auto my-3">
                    <table className="w-full text-left text-xs border-collapse">
                      <tbody>
                        {rows.map((r, rIdx) => {
                          const cols = r.split('|').filter((_, cIdx, arr) => cIdx > 0 && cIdx < arr.length - 1);
                          const isHeader = rIdx === 0;
                          return (
                            <tr key={rIdx} className={isHeader ? `border-b font-semibold ${theme.tableHeadBg} ${theme.tableBorder}` : `border-b ${theme.tableBorder} ${theme.tableRowHover}`}>
                              {cols.map((col, cIdx) => (
                                <td key={cIdx} className={`py-2 px-3 font-mono text-[11px] ${isHeader ? theme.textPrimary : theme.textSecondary}`}>
                                  {col.trim().replace(/\*\*/g, '')}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              }
              if (block.startsWith('* ') || block.startsWith('- ')) {
                const items = block.split('\n');
                return (
                  <ul key={idx} className="list-disc pl-5 space-y-1">
                    {items.map((it, iIdx) => (
                      <li key={iIdx} className={`font-mono text-[11px] ${theme.textSecondary}`}>
                        {it.replace(/^[\*\-]\s+/, '').replace(/\*\*/g, '')}
                      </li>
                    ))}
                  </ul>
                );
              }
              return (
                <p key={idx} className={`leading-normal ${theme.textSecondary}`}>
                  {block.replace(/\*\*/g, '')}
                </p>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

