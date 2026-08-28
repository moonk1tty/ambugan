import React, { useState } from 'react';
import { Send, Image as ImageIcon, Bot, Sparkles, CheckCircle2, User, Loader2 } from 'lucide-react';
import { GroupChatMessage, Expense, formatAmount } from '../types';
import { GoogleGenAI } from '@google/genai';

interface ChatSimulatorProps {
  messages: GroupChatMessage[];
  onSendMessage: (msg: GroupChatMessage) => void;
  onReceiptScanned: (receiptExpense: Omit<Expense, 'id' | 'timestamp'>) => void;
  activeUser: string;
}

export const ChatSimulator: React.FC<ChatSimulatorProps> = ({
  messages,
  onSendMessage,
  onReceiptScanned,
  activeUser
}) => {
  const [inputText, setInputText] = useState('');
  const [isScanningReceipt, setIsScanningReceipt] = useState(false);

  // Sample receipts for quick testing
  const sampleReceipts = [
    {
      name: 'Whole Foods Market Receipt',
      merchant: 'Whole Foods Market',
      total: 68.40,
      category: 'Groceries',
      imageUrl: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'Olive Garden Dinner Receipt',
      merchant: 'Olive Garden',
      total: 54.20,
      category: 'Dining',
      imageUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'Target Household Goods Receipt',
      merchant: 'Target Store',
      total: 31.90,
      category: 'General',
      imageUrl: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=600&q=80'
    }
  ];

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const userMsg: GroupChatMessage = {
      id: 'msg-' + Date.now(),
      sender: activeUser,
      text: inputText.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    onSendMessage(userMsg);

    // Command handlers
    if (inputText.trim().toLowerCase() === '/balance') {
      setTimeout(() => {
        const botMsg: GroupChatMessage = {
          id: 'bot-' + Date.now(),
          sender: 'SplitSquad Bot',
          isBot: true,
          text: '📊 *Group Balance Check*\n\nType /balance or open the Mini App to view current net balances and settle up!',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        onSendMessage(botMsg);
      }, 600);
    }

    setInputText('');
  };

  const handleSimulateReceiptUpload = async (receipt: typeof sampleReceipts[0]) => {
    setIsScanningReceipt(true);

    // 1. Send User Photo Message
    const photoMsg: GroupChatMessage = {
      id: 'photo-' + Date.now(),
      sender: activeUser,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      receiptData: {
        merchant: receipt.merchant,
        total: receipt.total,
        currency: '₱',
        category: receipt.category,
        date: new Date().toISOString().slice(0, 10),
        items: [{ name: receipt.merchant, price: receipt.total, quantity: 1, selected: true }],
        imageUrl: receipt.imageUrl
      }
    };
    onSendMessage(photoMsg);

    // Simulate Gemini 2.5 Flash Vision API call delay & processing
    setTimeout(() => {
      onReceiptScanned({
        description: `Receipt: ${receipt.merchant}`,
        amount: receipt.total,
        paidBy: activeUser,
        splitMode: '50/50 Equal',
        createdBy: `${activeUser} (Gemini AI Vision)`,
        category: receipt.category
      });

      // 2. Bot posts scanned summary
      const botReply: GroupChatMessage = {
        id: 'bot-' + Date.now(),
        sender: 'SplitSquad Bot',
        isBot: true,
        text: `🧾 *AI Receipt Scanned & Logged!*\n\n• *Merchant:* ${receipt.merchant}\n• *Total Amount:* $${formatAmount(receipt.total)}\n• *Category:* ${receipt.category}\n• *Paid By:* ${activeUser} (Split 50/50)\n\n✅ Logged to Google Sheets database!`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      onSendMessage(botReply);
      setIsScanningReceipt(false);
    }, 1500);
  };

  return (
    <div className="w-full max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[640px]">
      
      {/* Telegram Chat Header */}
      <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center font-bold text-white shadow-md">
            👥
          </div>
          <div>
            <h3 className="font-semibold text-slate-100 text-sm">Group: Couple Expenses</h3>
            <p className="text-[11px] text-slate-400">2 members • SplitSquad Bot active</p>
          </div>
        </div>
        <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> AI Vision Ready
        </span>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950/40">
        
        {/* Welcome Banner */}
        <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-800 text-center text-xs text-slate-400 space-y-1">
          <p className="font-semibold text-slate-200">💬 Telegram Group Chat Simulator</p>
          <p>Send a message or test uploading a receipt to see Gemini AI OCR automatically extract totals and update group balances!</p>
        </div>

        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.isBot
                ? 'items-start'
                : msg.sender === activeUser
                ? 'items-end'
                : 'items-start'
            }`}
          >
            <span className="text-[10px] text-slate-500 mb-0.5 px-1 font-medium">
              {msg.sender} • {msg.timestamp}
            </span>

            <div
              className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl text-xs space-y-1 ${
                msg.isBot
                  ? 'bg-slate-900 border border-sky-500/30 text-sky-100 shadow-md'
                  : msg.sender === activeUser
                  ? 'bg-sky-600 text-white shadow-md'
                  : 'bg-slate-800 text-slate-200'
              }`}
            >
              {msg.isBot && (
                <div className="flex items-center space-x-1.5 text-sky-400 font-bold mb-1 border-b border-sky-500/20 pb-1">
                  <Bot className="w-3.5 h-3.5" />
                  <span>SplitSquad Bot</span>
                </div>
              )}

              {msg.receiptData && (
                <div className="space-y-1.5">
                  <img
                    src={msg.receiptData.imageUrl}
                    alt="Receipt"
                    className="w-full h-32 object-cover rounded-xl border border-slate-700/50"
                  />
                  <p className="font-semibold text-slate-100 flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5" /> Receipt Uploaded
                  </p>
                </div>
              )}

              {msg.text && (
                <div className="whitespace-pre-line leading-relaxed">{msg.text}</div>
              )}
            </div>
          </div>
        ))}

        {isScanningReceipt && (
          <div className="flex items-center space-x-2 bg-sky-950/60 border border-sky-500/40 p-3 rounded-2xl text-xs text-sky-300">
            <Loader2 className="w-4 h-4 animate-spin shrink-0 text-sky-400" />
            <span>Gemini Vision API scanning receipt image... Extracting Merchant & Total...</span>
          </div>
        )}
      </div>

      {/* Quick Test Receipt Chips */}
      <div className="bg-slate-950 px-3 py-2 border-t border-slate-800 flex items-center space-x-2 overflow-x-auto text-[11px] scrollbar-none">
        <span className="text-slate-500 shrink-0 font-medium">Test Receipt OCR:</span>
        {sampleReceipts.map((r, i) => (
          <button
            key={i}
            onClick={() => handleSimulateReceiptUpload(r)}
            disabled={isScanningReceipt}
            className="shrink-0 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-200 px-2.5 py-1 rounded-lg transition flex items-center space-x-1 disabled:opacity-50"
          >
            <ImageIcon className="w-3 h-3 text-sky-400" />
            <span>{r.merchant} (${formatAmount(r.total)})</span>
          </button>
        ))}
      </div>

      {/* Chat Input Bar */}
      <form onSubmit={handleSendText} className="bg-slate-950 p-3 border-t border-slate-800 flex items-center space-x-2">
        <input
          type="text"
          placeholder={`Message as ${activeUser}... (or try /balance)`}
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
        />
        <button
          type="submit"
          className="bg-sky-500 hover:bg-sky-400 text-slate-950 p-2 rounded-xl transition font-bold"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>

    </div>
  );
};
