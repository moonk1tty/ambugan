import React, { useState } from 'react';
import { Copy, Download, Check, FileCode, Code2, ExternalLink, Key, Cpu } from 'lucide-react';

interface CodeViewerProps {
  indexHtmlContent: string;
  codeGsContent: string;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({ indexHtmlContent, codeGsContent }) => {
  const [activeFile, setActiveFile] = useState<'index.html' | 'Code.gs'>('index.html');
  const [copied, setCopied] = useState(false);

  const currentCode = activeFile === 'index.html' ? indexHtmlContent : codeGsContent;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([currentCode], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = activeFile;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[640px]">
      
      {/* File Selector Bar */}
      <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveFile('index.html')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition ${
              activeFile === 'index.html'
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-slate-200 bg-slate-900'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>index.html (Telegram Mini App)</span>
          </button>

          <button
            onClick={() => setActiveFile('Code.gs')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition ${
              activeFile === 'Code.gs'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200 bg-slate-900'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Code.gs (Apps Script Backend)</span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleCopy}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-xl text-xs font-medium flex items-center space-x-1.5 border border-slate-700/80 transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>

          <button
            onClick={handleDownload}
            className="bg-sky-500 hover:bg-sky-400 text-slate-950 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-md transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-slate-950/60 px-4 py-2.5 border-b border-slate-800/80 text-xs text-slate-400 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <Cpu className="w-3.5 h-3.5 text-sky-400" />
          {activeFile === 'index.html'
            ? 'Single-file Frontend with Telegram WebApp SDK & Tailwind CSS'
            : 'Google Apps Script Backend with Webhook, Gemini Vision API & Sheets Integration'}
        </span>
        <span className="font-mono text-[11px] text-slate-500">{currentCode.split('\n').length} lines</span>
      </div>

      {/* Code Area */}
      <div className="flex-1 overflow-auto p-4 bg-slate-950 font-mono text-[11px] text-slate-300 leading-relaxed scrollbar-thin">
        <pre>{currentCode}</pre>
      </div>

    </div>
  );
};
