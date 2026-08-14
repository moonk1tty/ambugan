import React, { useState } from 'react';
import { CheckCircle2, ArrowRight, ExternalLink, Bot, Key, Database, Globe, Sparkles, Copy, Check } from 'lucide-react';

export const SetupGuide: React.FC = () => {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [copiedTokenPlaceholder, setCopiedTokenPlaceholder] = useState(false);

  const steps = [
    {
      step: 1,
      title: 'Create Telegram Bot with @BotFather',
      icon: <Bot className="w-5 h-5 text-sky-400" />,
      description: 'Obtain your Telegram Bot API token to handle group chats and mini apps.',
      details: [
        'Open Telegram and search for @BotFather.',
        'Send /newbot and choose a name (e.g. SplitSquadBot).',
        'Copy the API HTTP Token generated (e.g. 123456789:ABCdefGhIJKlm...).',
        'Add your new bot into your shared couple Telegram group chat.',
        'Make sure to disable Group Privacy in @BotFather (/setprivacy -> Disable) so the bot can read receipt photo uploads.'
      ]
    },
    {
      step: 2,
      title: 'Get Gemini Vision API Key',
      icon: <Sparkles className="w-5 h-5 text-amber-400" />,
      description: 'Enable Google Gemini 2.5 Flash Vision API for automatic receipt OCR scanning.',
      details: [
        'Visit Google AI Studio (aistudio.google.com).',
        'Click "Get API Key" and create a free key.',
        'Copy your Gemini API Key.'
      ],
      link: 'https://aistudio.google.com'
    },
    {
      step: 3,
      title: 'Deploy Google Apps Script Backend (Code.gs)',
      icon: <Database className="w-5 h-5 text-emerald-400" />,
      description: 'Host your backend API and auto-creating Google Sheets database for free on Google Cloud.',
      details: [
        'Go to Google Apps Script (script.google.com) and create a New Project.',
        'Replace all default code with the Code.gs code provided in the Code tab.',
        'Paste your TELEGRAM_BOT_TOKEN and GEMINI_API_KEY in the top config lines.',
        'Click Deploy -> New deployment -> Select type: Web app.',
        'Set Execute as: "Me" and Who has access: "Anyone".',
        'Click Deploy, authorize permissions, and copy the Web App URL generated.'
      ],
      link: 'https://script.google.com'
    },
    {
      step: 4,
      title: 'Bind Telegram Webhook',
      icon: <Globe className="w-5 h-5 text-indigo-400" />,
      description: 'Connect Telegram messages & photo uploads directly to your script.',
      details: [
        'In Google Apps Script editor, select the setWebhook function from the function dropdown at the top.',
        'Click "Run".',
        'Check the execution log to verify "Set Webhook Response: {"ok":true,...}".'
      ]
    },
    {
      step: 5,
      title: 'Configure Telegram Mini App Button',
      icon: <Key className="w-5 h-5 text-purple-400" />,
      description: 'Set up the interactive Mini App button inside your Telegram group chat.',
      details: [
        'Back in @BotFather, send /newapp.',
        'Select your bot, enter title "SplitSquad", description, and upload a thumbnail.',
        'When prompted for Web App URL, paste your index.html URL or your deployed Web App link.',
        'Or send /setmenubutton to set a default "Open Expense Tracker" button in your group chat!'
      ]
    }
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl h-[640px] overflow-y-auto space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-sky-400" />
          Step-by-Step Deployment & Configuration Guide
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Follow these 5 simple steps to get your production Telegram Bot, Gemini AI Vision Receipt Reader, and Mini App running in under 5 minutes.
        </p>
      </div>

      {/* Step Stepper Header */}
      <div className="grid grid-cols-5 gap-2">
        {steps.map(s => (
          <button
            key={s.step}
            onClick={() => setActiveStep(s.step)}
            className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
              activeStep === s.step
                ? 'bg-sky-500/10 border-sky-500/50 text-sky-300'
                : activeStep > s.step
                ? 'bg-slate-950 border-emerald-500/30 text-emerald-400'
                : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
            }`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider">Step 0{s.step}</span>
            <div className="mt-1">{s.icon}</div>
          </button>
        ))}
      </div>

      {/* Active Step Details */}
      {steps.filter(s => s.step === activeStep).map(s => (
        <div key={s.step} className="bg-slate-950 p-5 rounded-2xl border border-slate-800/80 space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold text-sky-400 uppercase tracking-widest">Step {s.step} of 5</span>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                {s.icon}
                {s.title}
              </h3>
              <p className="text-xs text-slate-400">{s.description}</p>
            </div>

            {s.link && (
              <a
                href={s.link}
                target="_blank"
                rel="noreferrer"
                className="bg-slate-800 hover:bg-slate-700 text-sky-400 text-xs px-3 py-1.5 rounded-xl border border-slate-700 flex items-center gap-1 shrink-0"
              >
                <span>Open Link</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-900">
            {s.details.map((detail, idx) => (
              <div key={idx} className="flex items-start space-x-2.5 text-xs text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{detail}</span>
              </div>
            ))}
          </div>

          <div className="pt-4 flex justify-between items-center border-t border-slate-900">
            <button
              onClick={() => setActiveStep(Math.max(1, activeStep - 1))}
              disabled={activeStep === 1}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-400 disabled:opacity-30 border border-slate-800"
            >
              Previous
            </button>

            <button
              onClick={() => setActiveStep(Math.min(5, activeStep + 1))}
              disabled={activeStep === 5}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 disabled:opacity-30 shadow-md flex items-center space-x-1"
            >
              <span>Next Step</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
