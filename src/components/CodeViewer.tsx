import React, { useState } from 'react';
import { Copy, Download, Check, FileCode, Code2, Folder, Sparkles, Cpu, Bot, Database, Globe } from 'lucide-react';

interface CodeViewerProps {
  indexHtmlContent?: string;
  mainIndexHtmlContent?: string;
  testIndexHtmlContent?: string;
  mainCodeGsContent: string;
  testCodeGsContent: string;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({ 
  indexHtmlContent,
  mainIndexHtmlContent,
  testIndexHtmlContent,
  mainCodeGsContent, 
  testCodeGsContent 
}) => {
  const [selectedEnv, setSelectedEnv] = useState<'main' | 'test'>('main');
  const [activeFileType, setActiveFileType] = useState<'Code.gs' | 'index.html'>('Code.gs');
  const [copied, setCopied] = useState(false);

  const getActiveCode = () => {
    if (activeFileType === 'index.html') {
      if (selectedEnv === 'main') {
        return mainIndexHtmlContent || indexHtmlContent || '';
      } else {
        return testIndexHtmlContent || indexHtmlContent || '';
      }
    }
    return selectedEnv === 'main' ? mainCodeGsContent : testCodeGsContent;
  };

  const currentCode = getActiveCode();
  const activeFileName = activeFileType === 'index.html' 
    ? (selectedEnv === 'main' ? 'gas/main/index.html' : 'gas/test/index.html') 
    : (selectedEnv === 'main' ? 'gas/main/Code.gs' : 'gas/test/Code.gs');

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
    link.download = activeFileType === 'index.html' ? 'index.html' : `Code_${selectedEnv}.gs`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[680px]">
      
      {/* Top Environment Selector Bar */}
      <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
        
        {/* Environment Tabs */}
        <div className="flex items-center space-x-1.5 bg-slate-900 p-1 rounded-2xl border border-slate-800">
          <button
            onClick={() => setSelectedEnv('main')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition ${
              selectedEnv === 'main'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Folder className="w-3.5 h-3.5" />
            <span>📁 gas/main (Production)</span>
          </button>

          <button
            onClick={() => setSelectedEnv('test')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition ${
              selectedEnv === 'test'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>📁 gas/test (Test Bot)</span>
          </button>
        </div>

        {/* File Type Tabs */}
        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => setActiveFileType('Code.gs')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition ${
              activeFileType === 'Code.gs'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200 bg-slate-900'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Code.gs (Backend + OCR)</span>
          </button>

          <button
            onClick={() => setActiveFileType('index.html')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition ${
              activeFileType === 'index.html'
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-slate-200 bg-slate-900'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>index.html (Mini App)</span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleCopy}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-xl text-xs font-medium flex items-center space-x-1.5 border border-slate-700/80 transition cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied!' : 'Copy Code'}</span>
          </button>

          <button
            onClick={handleDownload}
            className="bg-sky-500 hover:bg-sky-400 text-slate-950 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-md transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </button>
        </div>
      </div>

      {/* Environment Config Credentials Ribbon */}
      <div className="bg-slate-950/80 px-4 py-2.5 border-b border-slate-800/80 text-xs text-slate-300 flex flex-wrap items-center justify-between gap-2">
        {selectedEnv === 'main' ? (
          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
            <span className="flex items-center gap-1 text-emerald-400 font-bold">
              <Bot className="w-3.5 h-3.5" /> Main Bot: 8949508191...
            </span>
            <span className="text-slate-600">•</span>
            <span className="flex items-center gap-1 text-slate-400">
              <Database className="w-3.5 h-3.5" /> Sheet: 106hKhXE...
            </span>
            <span className="text-slate-600">•</span>
            <span className="flex items-center gap-1 text-sky-400">
              <Globe className="w-3.5 h-3.5" /> Mini App: t.me/splitnest_bot/ambugan
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
            <span className="flex items-center gap-1 text-purple-400 font-bold">
              <Bot className="w-3.5 h-3.5" /> Test Bot: 8975116420...
            </span>
            <span className="text-slate-600">•</span>
            <span className="flex items-center gap-1 text-slate-400">
              <Database className="w-3.5 h-3.5" /> Sheet: 1w7-vyYv...
            </span>
            <span className="text-slate-600">•</span>
            <span className="flex items-center gap-1 text-sky-400">
              <Globe className="w-3.5 h-3.5" /> Mini App: t.me/splistnest_test_bot/test
            </span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            ⚡ Gemini AI OCR Vision Included
          </span>
          <span className="font-mono text-[11px] text-slate-500">{currentCode.split('\n').length} lines</span>
        </div>
      </div>

      {/* Code Area */}
      <div className="flex-1 overflow-auto p-4 bg-slate-950 font-mono text-[11px] text-slate-300 leading-relaxed scrollbar-thin">
        <pre>{currentCode}</pre>
      </div>

    </div>
  );
};
