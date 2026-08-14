import React, { useState, useEffect } from 'react';
import { 
  PlusCircle, 
  Scale, 
  History, 
  Download, 
  CheckCircle2, 
  ArrowRightLeft, 
  AlertCircle,
  Sliders,
  Send
} from 'lucide-react';
import { Expense, Settlement } from '../types';

interface MiniAppViewProps {
  expenses: Expense[];
  settlements: Settlement[];
  activeUser: string;
  setActiveUser: (user: string) => void;
  onAddExpense: (expense: Omit<Expense, 'id' | 'timestamp'>) => void;
  onSettleUp: (settlement: Omit<Settlement, 'id' | 'timestamp'>) => void;
  gasUrl: string;
  setGasUrl: (url: string) => void;
  isOnlineGas: boolean;
}

const SUPPORTED_CURRENCIES = [
  { symbol: '₱', label: '₱ (PHP)' },
  { symbol: '$', label: '$ (USD)' },
  { symbol: '€', label: '€ (EUR)' },
  { symbol: '£', label: '£ (GBP)' },
  { symbol: '¥', label: '¥ (JPY)' },
  { symbol: 'SG$', label: 'SG$ (SGD)' },
  { symbol: 'AU$', label: 'AU$ (AUD)' }
];

export const MiniAppView: React.FC<MiniAppViewProps> = ({
  expenses,
  settlements,
  activeUser,
  setActiveUser,
  onAddExpense,
  onSettleUp,
  gasUrl,
  setGasUrl,
  isOnlineGas
}) => {
  const [activeTab, setActiveTab] = useState<'new' | 'balances' | 'ledger' | 'settings'>('new');
  
  // Single Expense Form State
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('₱'); // Default to Pesos
  const [paidBy, setPaidBy] = useState(activeUser);
  const [splitMode, setSplitMode] = useState<'50/50 Equal' | 'Exact Amounts' | 'Percentages' | 'Single Payer (100% owed)'>('50/50 Equal');
  const [exactA, setExactA] = useState('');
  const [exactB, setExactB] = useState('');
  const [percentA, setPercentA] = useState('50');
  const [percentB, setPercentB] = useState('50');
  const [category, setCategory] = useState('Food');
  
  // Toast
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Simple Yes/No Settle Up Confirmation Modal State
  const [showSettleModal, setShowSettleModal] = useState(false);

  // Sync paidBy with activeUser when user changes
  useEffect(() => {
    setPaidBy(activeUser);
  }, [activeUser]);

  // Calculate Net Balances grouped by Currency (no conversion across currencies)
  const calculateCurrencyBalances = () => {
    const currencySet = new Set<string>();
    expenses.forEach(e => currencySet.add(e.currency || '₱'));
    settlements.forEach(s => currencySet.add(s.currency || '₱'));
    if (currencySet.size === 0) currencySet.add('₱');

    const results: Array<{
      currency: string;
      netAlex: number; // positive = Sam owes Alex, negative = Alex owes Sam
      paidAlex: number;
      shareAlex: number;
      paidSam: number;
      shareSam: number;
    }> = [];

    currencySet.forEach(curr => {
      let paidAlex = 0;
      let shareAlex = 0;
      let paidSam = 0;
      let shareSam = 0;

      expenses.filter(e => (e.currency || '₱') === curr).forEach(e => {
        const amt = Number(e.amount) || 0;
        if (e.paidBy === 'Alex') paidAlex += amt;
        else paidSam += amt;

        if (e.splitMode === '50/50 Equal') {
          shareAlex += amt / 2;
          shareSam += amt / 2;
        } else if (e.splitMode === 'Exact Amounts') {
          shareAlex += Number(e.userAShare) || 0;
          shareSam += Number(e.userBShare) || 0;
        } else if (e.splitMode === 'Percentages') {
          const pA = (Number(e.userAPercent) || 50) / 100;
          const pB = (Number(e.userBPercent) || 50) / 100;
          shareAlex += amt * pA;
          shareSam += amt * pB;
        } else if (e.splitMode === 'Single Payer (100% owed)') {
          if (e.paidBy === 'Alex') {
            shareSam += amt; // Sam owes 100%
          } else {
            shareAlex += amt; // Alex owes 100%
          }
        }
      });

      let netSettlement = 0; // Positive if Alex paid Sam, negative if Sam paid Alex
      settlements.filter(s => (s.currency || '₱') === curr).forEach(s => {
        const amt = Number(s.amount) || 0;
        if (s.payer === 'Alex') netSettlement += amt;
        else netSettlement -= amt;
      });

      const netAlex = (paidAlex - shareAlex) + netSettlement;
      results.push({
        currency: curr,
        netAlex,
        paidAlex,
        shareAlex,
        paidSam,
        shareSam
      });
    });

    return results;
  };

  const currencyBalances = calculateCurrencyBalances();
  const activeBalances = currencyBalances.filter(cb => Math.abs(cb.netAlex) >= 0.01);

  const handleSingleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !amount || Number(amount) <= 0) return;

    onAddExpense({
      description: description.trim(),
      amount: parseFloat(amount),
      currency,
      paidBy,
      splitMode,
      userAShare: exactA ? parseFloat(exactA) : undefined,
      userBShare: exactB ? parseFloat(exactB) : undefined,
      userAPercent: percentA ? parseFloat(percentA) : undefined,
      userBPercent: percentB ? parseFloat(percentB) : undefined,
      createdBy: activeUser,
      category
    });

    setDescription('');
    setAmount('');
    setExactA('');
    setExactB('');
    setToastMessage(`Logged "${currency}${amount} ${description}"`);
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 3000);
  };

  // Simple Yes/No Settle Up Confirmation Handler
  const handleConfirmSettleUp = () => {
    if (activeBalances.length === 0) {
      setShowSettleModal(false);
      return;
    }

    activeBalances.forEach(cb => {
      const oweAmount = Math.abs(cb.netAlex);
      const payer = cb.netAlex < 0 ? 'Alex' : 'Sam';
      const receiver = cb.netAlex < 0 ? 'Sam' : 'Alex';

      onSettleUp({
        payer,
        receiver,
        amount: oweAmount,
        currency: cb.currency,
        method: 'Settled Up'
      });
    });

    setShowSettleModal(false);
    setToastMessage(`All balances marked as settled up!`);
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 3000);
  };

  const exportCSV = () => {
    const headers = ['Timestamp', 'Type', 'Description', 'Amount', 'Currency', 'PaidBy', 'SplitMode', 'Category', 'CreatedBy'];
    const expenseRows = expenses.map(e => [
      e.timestamp,
      'Expense',
      `"${e.description.replace(/"/g, '""')}"`,
      e.amount,
      e.currency || '₱',
      e.paidBy,
      e.splitMode,
      e.category,
      e.createdBy
    ]);

    const settlementRows = settlements.map(s => [
      s.timestamp,
      'Settlement',
      `"Settle Up (${s.method})"`,
      s.amount,
      s.currency || '₱',
      s.payer,
      `Payer: ${s.payer} -> ${s.receiver}`,
      'Transfer',
      s.payer
    ]);

    const csvContent = [
      headers.join(','),
      ...expenseRows.map(r => r.join(',')),
      ...settlementRows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `splitsquad_expenses_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full max-w-md mx-auto min-h-screen text-[#1B1B19] flex flex-col justify-between p-4 relative font-sans">
      
      {/* Toast Alert */}
      {showSuccessToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 max-w-[380px] w-[92%] z-50 bg-[#1B1B19] text-white px-4 py-3 rounded-2xl shadow-xl flex items-center space-x-2 text-xs font-medium border border-black/10">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-[#4A6CF7]" />
          <span className="truncate">{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <header className="flex justify-between items-center pb-2 pt-0.5">
        <h1 className="text-base font-bold tracking-tight text-[#1B1B19]">splitnest</h1>
        <div className="text-[10px] font-mono font-medium px-2.5 py-0.5 bg-black/5 rounded-full text-[#1B1B19]/70 flex items-center space-x-1.5 border border-black/5">
          <span className={`w-1.5 h-1.5 rounded-full ${isOnlineGas ? 'bg-[#4A6CF7] animate-pulse' : 'bg-emerald-500'}`}></span>
          <span>v1.0 {isOnlineGas ? '• GAS' : ''}</span>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto space-y-4 py-2">
        
        {/* Group Net Balance Card */}
        <div className="bg-white/70 backdrop-blur-md border border-black/5 rounded-2xl px-4 py-3 shadow-sm flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#1B1B19]/50 font-semibold leading-none mb-1">
              Group Net Balance
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {activeBalances.length === 0 ? (
                <div className="flex items-center gap-1.5 text-sm font-bold font-mono tracking-tight text-[#1B1B19]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>₱0.00</span>
                </div>
              ) : (
                activeBalances.map((ab, idx) => (
                  <span key={idx} className="text-sm font-bold font-mono tracking-tight text-[#1B1B19]">
                    {ab.currency}{Math.abs(ab.netAlex).toFixed(2)}
                  </span>
                ))
              )}
              <span className="text-xs text-[#1B1B19]/60 font-medium truncate">
                {activeBalances.length === 0 ? '• Settled' : `• ${activeBalances.map(ab => ab.netAlex > 0 ? 'Sam owes Alex' : 'Alex owes Sam').join(', ')}`}
              </span>
            </div>
          </div>

          <button
            onClick={() => setActiveTab('balances')}
            className="font-mono text-[10px] uppercase tracking-wider text-[#4A6CF7] hover:underline font-bold shrink-0"
          >
            Details →
          </button>
        </div>

        {/* TAB 1: LOG EXPENSE FORM */}
        {activeTab === 'new' && (
          <form onSubmit={handleSingleSubmit} className="bg-white/70 backdrop-blur-md border border-black/5 rounded-[24px] p-5 shadow-sm space-y-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#1B1B19]/60 font-semibold flex justify-between items-center">
              <span>Log Expense</span>
              <span className="text-[9px] text-[#1B1B19]/40">Default: ₱ (PHP)</span>
            </div>

            <div>
              <input
                type="text"
                placeholder="Description"
                value={description}
                onChange={e => setDescription(e.target.value)}
                required
                className="w-full bg-white/60 border border-black/5 px-3.5 py-2.5 rounded-xl text-sm font-medium text-[#1B1B19] placeholder-[#1B1B19]/40 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#4A6CF7]/20 transition"
              />
            </div>

            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-4">
                <select
                  value={currency}
                  onChange={e => setCurrency(e.target.value)}
                  className="w-full bg-white/60 border border-black/5 px-2.5 py-2.5 rounded-xl text-xs font-bold text-[#1B1B19] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#4A6CF7]/20 transition h-full"
                >
                  {SUPPORTED_CURRENCIES.map(c => (
                    <option key={c.symbol} value={c.symbol}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-8">
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  required
                  className="w-full bg-white/60 border border-black/5 px-3.5 py-2.5 rounded-xl text-sm font-semibold font-mono text-[#1B1B19] placeholder-[#1B1B19]/40 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#4A6CF7]/20 transition"
                />
              </div>
            </div>

            {/* Category Selectable Tags */}
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/60 font-semibold mb-1.5">
                Category
              </label>
              <div className="flex flex-wrap gap-1.5">
                {['Food', 'Travel', 'Transport', 'Gift', 'Others'].map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                      category === cat
                        ? 'bg-[#1B1B19] border-[#1B1B19] text-white font-semibold shadow-sm'
                        : 'bg-white/60 border-black/5 text-[#1B1B19]/70 hover:bg-white/90'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/50 mb-1">Paid By</label>
              <select
                value={paidBy}
                onChange={e => setPaidBy(e.target.value)}
                className="w-full bg-white/60 border border-black/5 px-3 py-2 rounded-xl text-xs font-semibold text-[#1B1B19] focus:outline-none focus:bg-white transition"
              >
                <option value="Alex">Alex</option>
                <option value="Sam">Sam</option>
              </select>
            </div>

            {/* Split Mode Selector */}
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/50 mb-1">Split Mode</label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: '50/50 Equal', label: '50/50 Equal' },
                  { id: 'Exact Amounts', label: 'Exact Amounts' },
                  { id: 'Percentages', label: 'Percentages (%)' },
                  { id: 'Single Payer (100% owed)', label: '100% Owed' }
                ].map(mode => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setSplitMode(mode.id as any)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border text-left transition ${
                      splitMode === mode.id
                        ? 'bg-[#1B1B19] border-[#1B1B19] text-white font-semibold'
                        : 'bg-white/40 border-black/5 text-[#1B1B19]/70 hover:bg-white/80'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Split Inputs */}
            {splitMode === 'Exact Amounts' && (
              <div className="bg-white/40 p-2.5 rounded-xl border border-black/5 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[10px] font-mono text-[#1B1B19]/60">Alex ({currency})</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={exactA}
                    onChange={e => setExactA(e.target.value)}
                    className="w-full mt-1 bg-white/80 border border-black/5 rounded-lg px-2 py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-[#1B1B19]/60">Sam ({currency})</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={exactB}
                    onChange={e => setExactB(e.target.value)}
                    className="w-full mt-1 bg-white/80 border border-black/5 rounded-lg px-2 py-1 text-xs"
                  />
                </div>
              </div>
            )}

            {splitMode === 'Percentages' && (
              <div className="bg-white/40 p-2.5 rounded-xl border border-black/5 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[10px] font-mono text-[#1B1B19]/60">Alex %</label>
                  <input
                    type="number"
                    placeholder="50"
                    value={percentA}
                    onChange={e => {
                      setPercentA(e.target.value);
                      const num = parseFloat(e.target.value);
                      if (!isNaN(num)) setPercentB(String(100 - num));
                    }}
                    className="w-full mt-1 bg-white/80 border border-black/5 rounded-lg px-2 py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-[#1B1B19]/60">Sam %</label>
                  <input
                    type="number"
                    placeholder="50"
                    value={percentB}
                    onChange={e => {
                      setPercentB(e.target.value);
                      const num = parseFloat(e.target.value);
                      if (!isNaN(num)) setPercentA(String(100 - num));
                    }}
                    className="w-full mt-1 bg-white/80 border border-black/5 rounded-lg px-2 py-1 text-xs"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-[#1B1B19] hover:bg-black text-white font-semibold py-3.5 rounded-2xl text-sm transition shadow-md active:scale-[0.99] flex items-center justify-center space-x-2 mt-2"
            >
              <Send className="w-4 h-4" />
              <span>Submit Entry ({currency})</span>
            </button>
          </form>
        )}

        {/* TAB 2: BALANCES & SETTLE UP */}
        {activeTab === 'balances' && (
          <div className="space-y-3">
            <div className="bg-white/70 backdrop-blur-md border border-black/5 rounded-[24px] p-5 shadow-sm text-center space-y-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#1B1B19]/60 font-semibold">
                Settlement Overview
              </div>
              
              {activeBalances.length === 0 ? (
                <div className="py-2 space-y-1">
                  <p className="text-2xl font-bold font-mono text-emerald-600">₱0.00</p>
                  <p className="text-xs text-[#1B1B19]/70">All settled up! No outstanding balances across any currency.</p>
                </div>
              ) : (
                <div className="py-1 space-y-2">
                  {activeBalances.map((cb, i) => (
                    <div key={i} className="bg-white/60 p-3 rounded-xl border border-black/5 text-xs flex justify-between items-center">
                      <span className="text-[#1B1B19]/70 font-medium">{cb.currency} Balance:</span>
                      <span className="font-bold font-mono text-sm text-[#1B1B19]">
                        {cb.netAlex > 0
                          ? `Sam owes Alex ${cb.currency}${cb.netAlex.toFixed(2)}`
                          : `Alex owes Sam ${cb.currency}${Math.abs(cb.netAlex).toFixed(2)}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {activeBalances.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowSettleModal(true)}
                  className="w-full bg-[#4A6CF7] hover:bg-[#3B5BE3] text-white py-3 rounded-2xl font-semibold text-xs shadow-sm transition flex items-center justify-center space-x-2"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  <span>Settle Up Now</span>
                </button>
              )}
            </div>

            {/* Currency Breakdown Card */}
            <div className="bg-white/70 backdrop-blur-md border border-black/5 p-4 rounded-[20px] shadow-sm space-y-2 text-xs">
              <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#1B1B19]/60 font-semibold border-b border-black/5 pb-1.5">
                Logged Expenses by Currency
              </div>
              {currencyBalances.map((cb, idx) => {
                const currExpenses = expenses.filter(e => (e.currency || '₱') === cb.currency);
                const totalAmt = currExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
                return (
                  <div key={idx} className="flex justify-between items-center py-1 text-[#1B1B19]/80 font-medium">
                    <span>{cb.currency} Total ({currExpenses.length} items)</span>
                    <span className="font-bold font-mono text-[#1B1B19]">{cb.currency}{totalAmt.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>

            {/* Recent Settlements */}
            <div className="bg-white/70 backdrop-blur-md border border-black/5 p-4 rounded-[20px] shadow-sm space-y-2">
              <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#1B1B19]/60 font-semibold">
                Settlement History
              </div>
              {settlements.length === 0 ? (
                <p className="text-xs text-[#1B1B19]/50 italic text-center py-2">No settlements recorded yet</p>
              ) : (
                <div className="space-y-1.5">
                  {settlements.map((s, i) => (
                    <div key={i} className="bg-white/50 p-2.5 rounded-xl border border-black/5 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-semibold text-[#1B1B19]">{s.payer} paid {s.receiver}</span>
                        <p className="text-[10px] text-[#1B1B19]/50 font-mono">{new Date(s.timestamp).toLocaleDateString()}</p>
                      </div>
                      <span className="font-bold font-mono text-[#1B1B19]">{s.currency || '₱'}{Number(s.amount).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: LEDGER */}
        {activeTab === 'ledger' && (
          <div className="bg-white/70 backdrop-blur-md border border-black/5 rounded-[24px] p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-black/5 pb-2">
              <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#1B1B19]/60 font-semibold">
                Expense Ledger ({expenses.length})
              </div>
              <button
                type="button"
                onClick={exportCSV}
                className="bg-black/5 hover:bg-black/10 text-[#1B1B19] px-2.5 py-1 rounded-lg text-xs font-mono font-medium border border-black/5 flex items-center space-x-1"
              >
                <Download className="w-3 h-3" />
                <span>CSV</span>
              </button>
            </div>

            {expenses.length === 0 ? (
              <div className="text-center py-8 text-[#1B1B19]/50 text-xs">
                <p>No expenses logged yet.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                {expenses.map((exp, idx) => (
                  <div key={idx} className="bg-white/60 p-3 rounded-xl border border-black/5 flex items-center justify-between text-xs">
                    <div className="space-y-0.5">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-[#1B1B19]">{exp.description}</span>
                        <span className="text-[9px] bg-black/5 font-mono text-[#1B1B19]/70 px-1.5 py-0.5 rounded">
                          {exp.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#1B1B19]/60">
                        Paid by <strong>{exp.paidBy}</strong> • {exp.splitMode}
                      </p>
                      <p className="text-[9px] text-[#1B1B19]/40 font-mono">{new Date(exp.timestamp).toLocaleDateString()}</p>
                    </div>

                    <div className="text-right">
                      <span className="font-bold font-mono text-[#1B1B19] text-sm">
                        {exp.currency || '₱'}{Number(exp.amount).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: CONFIG / SETTINGS */}
        {activeTab === 'settings' && (
          <div className="bg-white/70 backdrop-blur-md border border-black/5 rounded-[24px] p-5 shadow-sm space-y-3.5 text-xs">
            <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#1B1B19]/60 font-semibold border-b border-black/5 pb-2">
              System Configuration
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#1B1B19]/70 mb-1">Google Apps Script Web App URL</label>
              <input
                type="text"
                placeholder="https://script.google.com/macros/s/.../exec"
                value={gasUrl}
                onChange={e => setGasUrl(e.target.value)}
                className="w-full bg-white/80 border border-black/5 rounded-xl px-3 py-2 text-[#1B1B19] font-mono text-[11px] focus:outline-none focus:ring-2 focus:ring-[#4A6CF7]/20"
              />
            </div>

            <div className="bg-white/50 p-3 rounded-xl border border-black/5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[#1B1B19] font-semibold">Backend Status</span>
                {isOnlineGas ? (
                  <span className="text-[#4A6CF7] font-semibold flex items-center gap-1 font-mono text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" /> GAS Live Sync
                  </span>
                ) : (
                  <span className="text-amber-700 font-semibold flex items-center gap-1 font-mono text-[11px]">
                    <AlertCircle className="w-3.5 h-3.5" /> Local Interactive Simulator
                  </span>
                )}
              </div>
              <p className="text-[#1B1B19]/60 text-[11px]">
                In local simulator mode, all data persists in interactive state. Paste your GAS Web App URL above to sync with Google Sheets.
              </p>
            </div>
          </div>
        )}

      </div>

      {/* Settle Up Modal */}
      {showSettleModal && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-md z-50 p-5 flex items-center justify-center">
          <div className="bg-[#F8F7F4] border border-black/10 rounded-[32px] p-6 w-full max-w-xs space-y-4 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#1B1B19] text-white flex items-center justify-center mx-auto text-xl shadow-md">
              🤝
            </div>

            <div className="space-y-1">
              <h4 className="font-bold text-[#1B1B19] text-base">
                Are you sure you're settled up?
              </h4>
              <p className="text-xs text-[#1B1B19]/70">
                This will clear all current active balances and record a settlement entry.
              </p>
            </div>

            {activeBalances.length > 0 && (
              <div className="bg-white/80 p-3 rounded-xl border border-black/5 text-left space-y-1 text-[11px] font-mono">
                <p className="text-[#1B1B19]/60 font-semibold border-b border-black/5 pb-1">Balances to clear:</p>
                {activeBalances.map((ab, idx) => (
                  <p key={idx} className="text-[#1B1B19] font-bold">
                    • {ab.currency}{Math.abs(ab.netAlex).toFixed(2)} ({ab.netAlex > 0 ? 'Sam ➔ Alex' : 'Alex ➔ Sam'})
                  </p>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowSettleModal(false)}
                className="w-full bg-black/5 hover:bg-black/10 text-[#1B1B19] py-2.5 rounded-xl font-semibold text-xs transition"
              >
                No
              </button>
              <button
                type="button"
                onClick={handleConfirmSettleUp}
                className="w-full bg-[#1B1B19] hover:bg-black text-white py-2.5 rounded-xl font-semibold text-xs shadow-md transition"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Monospace Sticky Footer Navigation */}
      <footer className="sticky bottom-0 bg-[#F8F7F4]/95 backdrop-blur-md border-t border-black/10 py-3 mt-auto z-40 grid grid-cols-4 gap-1 text-center font-mono text-[9px] uppercase tracking-wider">
        <button
          onClick={() => setActiveTab('new')}
          className={`py-2 rounded-xl transition flex flex-col items-center justify-center ${
            activeTab === 'new'
              ? 'bg-[#1B1B19] text-white font-bold shadow-sm'
              : 'text-[#1B1B19]/60 hover:text-[#1B1B19] hover:bg-black/5'
          }`}
        >
          <span className="opacity-60 text-[8px]">[01]</span>
          <span className="font-bold">NEW</span>
        </button>

        <button
          onClick={() => setActiveTab('balances')}
          className={`py-2 rounded-xl transition flex flex-col items-center justify-center ${
            activeTab === 'balances'
              ? 'bg-[#1B1B19] text-white font-bold shadow-sm'
              : 'text-[#1B1B19]/60 hover:text-[#1B1B19] hover:bg-black/5'
          }`}
        >
          <span className="opacity-60 text-[8px]">[02]</span>
          <span className="font-bold">SETTLE</span>
        </button>

        <button
          onClick={() => setActiveTab('ledger')}
          className={`py-2 rounded-xl transition flex flex-col items-center justify-center ${
            activeTab === 'ledger'
              ? 'bg-[#1B1B19] text-white font-bold shadow-sm'
              : 'text-[#1B1B19]/60 hover:text-[#1B1B19] hover:bg-black/5'
          }`}
        >
          <span className="opacity-60 text-[8px]">[03]</span>
          <span className="font-bold">LEDGER</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`py-2 rounded-xl transition flex flex-col items-center justify-center ${
            activeTab === 'settings'
              ? 'bg-[#1B1B19] text-white font-bold shadow-sm'
              : 'text-[#1B1B19]/60 hover:text-[#1B1B19] hover:bg-black/5'
          }`}
        >
          <span className="opacity-60 text-[8px]">[04]</span>
          <span className="font-bold">CONFIG</span>
        </button>
      </footer>

    </div>
  );
};
