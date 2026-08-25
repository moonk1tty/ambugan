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
  Send,
  Settings,
  RefreshCw,
  Users,
  UserMinus,
  Trash2,
  X
} from 'lucide-react';
import { Expense, Settlement, RegisteredUser } from '../types';

interface MiniAppViewProps {
  expenses: Expense[];
  settlements: Settlement[];
  registeredUsers?: RegisteredUser[];
  activeUser: string;
  setActiveUser: (user: string) => void;
  onAddExpense: (expense: Omit<Expense, 'id' | 'timestamp'>) => Promise<void> | void;
  onSettleUp: (settlement: Omit<Settlement, 'id' | 'timestamp'>) => Promise<void> | void;
  onSyncMembers?: () => Promise<void> | void;
  onRemoveMember?: (memberName: string) => Promise<void> | void;
  gasUrl: string;
  setGasUrl: (url: string) => void;
  isOnlineGas: boolean;
  chatId?: string;
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
  registeredUsers = [],
  activeUser,
  setActiveUser,
  onAddExpense,
  onSettleUp,
  onSyncMembers,
  onRemoveMember,
  gasUrl,
  setGasUrl,
  isOnlineGas,
  chatId = ''
}) => {
  const [activeTab, setActiveTab] = useState<'new' | 'balances' | 'ledger'>('new');
  
  // Single Expense Form State
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('₱'); // Default to Pesos
  const [paidBy, setPaidBy] = useState(activeUser);
  const [showAddCustomUser, setShowAddCustomUser] = useState(false);
  const [customUserName, setCustomUserName] = useState('');
  const [isSyncingMembers, setIsSyncingMembers] = useState(false);
  const [splitMode, setSplitMode] = useState<'Equal' | '50/50 Equal' | 'Exact Amounts' | 'Percentages' | 'Single Payer (100% owed)'>('Equal');
  const [exactShares, setExactShares] = useState<Record<string, string>>({});
  const [percentShares, setPercentShares] = useState<Record<string, string>>({});
  const [singleDebtor, setSingleDebtor] = useState<string>('');
  const [category, setCategory] = useState('Food');
  
  // Toast & Modals
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null);
  const [isRemovingMember, setIsRemovingMember] = useState(false);
  const [removeToast, setRemoveToast] = useState<string | null>(null);

  // Individual Settle Up Modal State
  const [selectedDebtToSettle, setSelectedDebtToSettle] = useState<{
    debtor: string;
    creditor: string;
    amount: number;
    currency: string;
  } | null>(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleMethod, setSettleMethod] = useState('Cash');

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [inputGasUrl, setInputGasUrl] = useState(gasUrl);
  const [isTestingUrl, setIsTestingUrl] = useState(false);
  const [testResult, setTestResult] = useState<{ status: 'success' | 'error'; message: string } | null>(null);

  // Global Action Processing Loader State
  const [actionLoading, setActionLoading] = useState<{
    active: boolean;
    success: boolean;
    title: string;
    subtitle: string;
  }>({
    active: false,
    success: false,
    title: '',
    subtitle: ''
  });

  // Persistent tracking of manually removed members for this group
  const removedStorageKey = `splitnest_removed_members_${chatId || 'default'}`;
  const [removedMembers, setRemovedMembers] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(removedStorageKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleConfirmRemoveMember = async (memberName: string) => {
    if (!memberName) return;
    setIsRemovingMember(true);
    const cleanTarget = memberName.trim();

    setActionLoading({
      active: true,
      success: false,
      title: 'Updating Group Members...',
      subtitle: `Removing ${cleanTarget} and updating ledger...`
    });

    const startTime = Date.now();
    try {
      const updatedRemoved = Array.from(new Set([...removedMembers, cleanTarget]));
      setRemovedMembers(updatedRemoved);
      try {
        localStorage.setItem(removedStorageKey, JSON.stringify(updatedRemoved));
      } catch (e) {}

      // If the removed member was selected in paidBy, pick another member
      if (paidBy.toLowerCase().replace(/^@/, '') === cleanTarget.toLowerCase().replace(/^@/, '')) {
        const remaining = availableUsers.filter(u => u.toLowerCase().replace(/^@/, '') !== cleanTarget.toLowerCase().replace(/^@/, ''));
        if (remaining.length > 0) {
          setPaidBy(remaining[0]);
        }
      }

      if (onRemoveMember) {
        await onRemoveMember(cleanTarget);
      }
      const elapsed = Date.now() - startTime;
      if (elapsed < 500) {
        await new Promise(r => setTimeout(r, 500 - elapsed));
      }
      setActionLoading({
        active: true,
        success: true,
        title: 'Member Removed',
        subtitle: `${cleanTarget} removed from active roster.`
      });
      await new Promise(r => setTimeout(r, 550));
      setMemberToRemove(null);
      setRemoveToast(`Removed ${cleanTarget} from group ledger.`);
      setTimeout(() => setRemoveToast(null), 3500);
    } catch (err) {
      console.error('Failed to remove member:', err);
    } finally {
      setIsRemovingMember(false);
      setActionLoading({ active: false, success: false, title: '', subtitle: '' });
    }
  };

  useEffect(() => {
    setInputGasUrl(gasUrl);
  }, [gasUrl]);

  // Sync paidBy with activeUser when activeUser changes
  useEffect(() => {
    if (activeUser && !paidBy) {
      setPaidBy(activeUser);
    }
  }, [activeUser, paidBy]);

  // Derive dynamic list of users (excluding bots, placeholders, and manually removed members)
  const userSet = new Set<string>();
  const removedLower = new Set(removedMembers.map(m => m.toLowerCase().replace(/^@/, '')));

  if (registeredUsers && registeredUsers.length > 0) {
    registeredUsers.forEach(u => {
      let name = '';
      if (typeof u === 'string') {
        name = (u as string).trim();
      } else if (u && typeof u === 'object') {
        const uName = String((u as any).username || (u as any).userName || '').replace(/^@/, '').trim();
        const fName = String((u as any).firstName || (u as any).first_name || (u as any).name || '').trim();
        const isBot = uName.toLowerCase().includes('bot') || fName.toLowerCase().includes('bot');
        if (isBot) return;
        name = fName || (uName ? `@${uName}` : '') || (u.userId ? `User ${u.userId}` : '');
      }
      const cleanLower = name.trim().toLowerCase().replace(/^@/, '');
      if (name && !name.toLowerCase().includes('bot') && name !== 'Alex' && name !== 'Sam' && !removedLower.has(cleanLower)) {
        userSet.add(name.trim());
      }
    });
  }

  // Fall back to expenses and settlements only if registeredUsers is empty
  if (!registeredUsers || registeredUsers.length === 0) {
    expenses.forEach(e => {
      if (e.paidBy && !e.paidBy.toLowerCase().includes('bot') && e.paidBy !== 'Alex' && e.paidBy !== 'Sam' && !removedLower.has(e.paidBy.toLowerCase().replace(/^@/, ''))) {
        userSet.add(e.paidBy.trim());
      }
      if (e.createdBy && !e.createdBy.toLowerCase().includes('bot') && e.createdBy !== 'Alex' && e.createdBy !== 'Sam' && !removedLower.has(e.createdBy.toLowerCase().replace(/^@/, ''))) {
        userSet.add(e.createdBy.trim());
      }
    });
    settlements.forEach(s => {
      if (s.payer && !s.payer.toLowerCase().includes('bot') && s.payer !== 'Alex' && s.payer !== 'Sam' && !removedLower.has(s.payer.toLowerCase().replace(/^@/, ''))) {
        userSet.add(s.payer.trim());
      }
      if (s.receiver && !s.receiver.toLowerCase().includes('bot') && s.receiver !== 'Alex' && s.receiver !== 'Sam' && !removedLower.has(s.receiver.toLowerCase().replace(/^@/, ''))) {
        userSet.add(s.receiver.trim());
      }
    });
  }

  if (activeUser && !activeUser.toLowerCase().includes('bot') && activeUser !== 'Alex' && activeUser !== 'Sam' && !removedLower.has(activeUser.toLowerCase().replace(/^@/, ''))) {
    userSet.add(activeUser.trim());
  }

  // Ensure legacy mock names Alex and Sam are excluded
  userSet.delete('Alex');
  userSet.delete('Sam');

  const availableUsers = Array.from(userSet).filter(Boolean);
  if (availableUsers.length === 0) {
    if (activeUser && activeUser !== 'Alex' && activeUser !== 'Sam' && !removedLower.has(activeUser.toLowerCase().replace(/^@/, ''))) {
      availableUsers.push(activeUser);
    } else {
      availableUsers.push('Me');
    }
  }

  const handleManualMemberSync = async () => {
    if (isSyncingMembers) return;
    setIsSyncingMembers(true);
    try {
      if (onSyncMembers) {
        await onSyncMembers();
        setToastMessage('✅ Group members synced from Telegram API!');
        setShowSuccessToast(true);
        setTimeout(() => setShowSuccessToast(false), 3000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSyncingMembers(false);
    }
  };

  const handleAddCustomUser = () => {
    const trimmed = customUserName.trim();
    if (trimmed && !trimmed.toLowerCase().includes('bot') && trimmed !== 'Alex' && trimmed !== 'Sam') {
      setPaidBy(trimmed);
      setActiveUser(trimmed);
      setCustomUserName('');
      setShowAddCustomUser(false);
      setToastMessage(`Added ${trimmed} to group members!`);
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 2500);
    }
  };

  const otherUser = availableUsers.find(u => u !== paidBy) || (availableUsers.length > 1 ? availableUsers[1] : 'Group');

  // Auto-initialize multi-member shares when switching split modes or changing members
  const handleSplitModeChange = (mode: 'Equal' | '50/50 Equal' | 'Exact Amounts' | 'Percentages' | 'Single Payer (100% owed)') => {
    setSplitMode(mode);
    if (mode === 'Exact Amounts') {
      const numAmt = parseFloat(amount) || 0;
      const initial: Record<string, string> = {};
      if (numAmt > 0 && availableUsers.length > 0) {
        const perPerson = (numAmt / availableUsers.length).toFixed(2);
        availableUsers.forEach(u => {
          initial[u] = exactShares[u] || perPerson;
        });
      } else {
        availableUsers.forEach(u => {
          initial[u] = exactShares[u] || '';
        });
      }
      setExactShares(initial);
    } else if (mode === 'Percentages') {
      const initial: Record<string, string> = {};
      if (availableUsers.length > 0) {
        const equalPct = (100 / availableUsers.length).toFixed(1);
        availableUsers.forEach(u => {
          initial[u] = percentShares[u] || equalPct;
        });
      }
      setPercentShares(initial);
    } else if (mode === 'Single Payer (100% owed)') {
      if (!singleDebtor) {
        const firstOther = availableUsers.find(u => u !== paidBy) || availableUsers[0];
        if (firstOther) setSingleDebtor(firstOther);
      }
    }
  };

  const handleDistributeExactEvenly = () => {
    const numAmt = parseFloat(amount) || 0;
    if (availableUsers.length === 0) return;
    const share = (numAmt / availableUsers.length).toFixed(2);
    const updated: Record<string, string> = {};
    availableUsers.forEach(u => { updated[u] = share; });
    setExactShares(updated);
  };

  const handleSetEqualPercentages = () => {
    if (availableUsers.length === 0) return;
    const share = (100 / availableUsers.length).toFixed(1);
    const updated: Record<string, string> = {};
    availableUsers.forEach(u => { updated[u] = share; });
    setPercentShares(updated);
  };

  // Calculate Net Balances grouped by Currency dynamically across all members
  const calculateCurrencyBalances = () => {
    const currencySet = new Set<string>();
    expenses.forEach(e => currencySet.add(e.currency || '₱'));
    settlements.forEach(s => currencySet.add(s.currency || '₱'));
    if (currencySet.size === 0) currencySet.add('₱');

    const results: Array<{
      currency: string;
      debtor: string;
      creditor: string;
      amount: number;
      summaryText: string;
    }> = [];

    currencySet.forEach(curr => {
      const userNetMap: Record<string, number> = {};
      availableUsers.forEach(u => { userNetMap[u] = 0; });

      expenses.filter(e => (e.currency || '₱') === curr).forEach(e => {
        const amt = Number(e.amount) || 0;
        const payer = e.paidBy || availableUsers[0];
        if (userNetMap[payer] === undefined) userNetMap[payer] = 0;

        userNetMap[payer] += amt;

        if (e.splitMode === 'Equal' || e.splitMode === '50/50 Equal' || !e.splitMode) {
          const numMembers = Math.max(availableUsers.length, 1);
          const sharePerMember = amt / numMembers;
          availableUsers.forEach(u => {
            if (userNetMap[u] === undefined) userNetMap[u] = 0;
            userNetMap[u] -= sharePerMember;
          });
        } else if (e.splitMode === 'Exact Amounts') {
          if (e.shares && Object.keys(e.shares).length > 0) {
            Object.entries(e.shares).forEach(([u, share]) => {
              if (userNetMap[u] === undefined) userNetMap[u] = 0;
              userNetMap[u] -= Number(share) || 0;
            });
          } else {
            const userA = payer;
            const userB = availableUsers.find(u => u !== payer) || availableUsers[1];
            const shareA = Number(e.userAShare) || (amt / 2);
            const shareB = Number(e.userBShare) || (amt / 2);
            userNetMap[userA] -= shareA;
            if (userB) {
              if (userNetMap[userB] === undefined) userNetMap[userB] = 0;
              userNetMap[userB] -= shareB;
            }
          }
        } else if (e.splitMode === 'Percentages') {
          if (e.percentages && Object.keys(e.percentages).length > 0) {
            Object.entries(e.percentages).forEach(([u, pct]) => {
              if (userNetMap[u] === undefined) userNetMap[u] = 0;
              userNetMap[u] -= amt * ((Number(pct) || 0) / 100);
            });
          } else {
            const userA = payer;
            const userB = availableUsers.find(u => u !== payer) || availableUsers[1];
            const pA = (Number(e.userAPercent) || 50) / 100;
            const pB = (Number(e.userBPercent) || 50) / 100;
            userNetMap[userA] -= amt * pA;
            if (userB) {
              if (userNetMap[userB] === undefined) userNetMap[userB] = 0;
              userNetMap[userB] -= amt * pB;
            }
          }
        } else if (e.splitMode === 'Single Payer (100% owed)') {
          const debtor = e.singleOwer || availableUsers.find(u => u !== payer) || availableUsers[1];
          if (debtor) {
            if (userNetMap[debtor] === undefined) userNetMap[debtor] = 0;
            userNetMap[debtor] -= amt;
          }
        }
      });

      settlements.filter(s => (s.currency || '₱') === curr).forEach(s => {
        const amt = Number(s.amount) || 0;
        if (s.payer) {
          if (userNetMap[s.payer] === undefined) userNetMap[s.payer] = 0;
          userNetMap[s.payer] += amt;
        }
        if (s.receiver) {
          if (userNetMap[s.receiver] === undefined) userNetMap[s.receiver] = 0;
          userNetMap[s.receiver] -= amt;
        }
      });

      const debtors: Array<{ name: string; bal: number }> = [];
      const creditors: Array<{ name: string; bal: number }> = [];

      Object.entries(userNetMap).forEach(([name, net]) => {
        if (net > 0.01) creditors.push({ name, bal: net });
        else if (net < -0.01) debtors.push({ name, bal: Math.abs(net) });
      });

      debtors.forEach(d => {
        creditors.forEach(c => {
          const oweAmt = Math.min(d.bal, c.bal);
          if (oweAmt >= 0.01) {
            results.push({
              currency: curr,
              debtor: d.name,
              creditor: c.name,
              amount: oweAmt,
              summaryText: `${d.name} owes ${c.name}`
            });
            d.bal -= oweAmt;
            c.bal -= oweAmt;
          }
        });
      });
    });

    return results;
  };

  const currencyBalances = calculateCurrencyBalances();
  const activeBalances = currencyBalances.filter(cb => cb.amount >= 0.01);

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !amount || Number(amount) <= 0) return;

    const numAmt = parseFloat(amount);
    let finalShares: Record<string, number> | undefined = undefined;
    let finalPercentages: Record<string, number> | undefined = undefined;
    let finalSingleOwer: string | undefined = undefined;

    if (splitMode === 'Exact Amounts') {
      finalShares = {};
      availableUsers.forEach(u => {
        finalShares![u] = parseFloat(exactShares[u] || '0') || 0;
      });
    } else if (splitMode === 'Percentages') {
      finalPercentages = {};
      availableUsers.forEach(u => {
        finalPercentages![u] = parseFloat(percentShares[u] || '0') || 0;
      });
    } else if (splitMode === 'Single Payer (100% owed)') {
      finalSingleOwer = singleDebtor || availableUsers.find(u => u !== paidBy) || availableUsers[0];
    }

    const payload = {
      description: description.trim(),
      amount: numAmt,
      currency,
      paidBy: paidBy.trim() || activeUser,
      splitMode,
      userAShare: finalShares ? finalShares[paidBy || activeUser] : undefined,
      userBShare: finalShares ? finalShares[otherUser] : undefined,
      userAPercent: finalPercentages ? finalPercentages[paidBy || activeUser] : undefined,
      userBPercent: finalPercentages ? finalPercentages[otherUser] : undefined,
      shares: finalShares,
      percentages: finalPercentages,
      singleOwer: finalSingleOwer,
      createdBy: activeUser,
      category
    };

    const savedDesc = description.trim();
    const savedAmt = amount;
    const savedCurr = currency;

    setActionLoading({
      active: true,
      success: false,
      title: 'Logging Expense...',
      subtitle: `Syncing ${savedCurr}${savedAmt} to shared ledger & updating balances...`
    });

    const startTime = Date.now();
    try {
      await onAddExpense(payload);
      const elapsed = Date.now() - startTime;
      if (elapsed < 500) {
        await new Promise(r => setTimeout(r, 500 - elapsed));
      }
      setActionLoading({
        active: true,
        success: true,
        title: 'Expense Logged!',
        subtitle: `Balances and shared ledger are now up to date.`
      });
      await new Promise(r => setTimeout(r, 550));
    } catch (err) {
      console.error('Failed to log expense:', err);
    } finally {
      setDescription('');
      setAmount('');
      setExactShares({});
      setPercentShares({});
      setActionLoading({ active: false, success: false, title: '', subtitle: '' });
      setToastMessage(`Logged "${savedCurr}${savedAmt} ${savedDesc}"`);
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
    }
  };

  // Calculate active user's personal balances (who owes me, who I owe)
  const myDebts = activeBalances.filter(
    b => b.debtor.toLowerCase() === activeUser.toLowerCase()
  );
  const myCredits = activeBalances.filter(
    b => b.creditor.toLowerCase() === activeUser.toLowerCase()
  );

  const totalOwedByMe = myDebts.reduce((sum, b) => sum + b.amount, 0);
  const totalOwedToMe = myCredits.reduce((sum, b) => sum + b.amount, 0);
  const myNet = totalOwedToMe - totalOwedByMe;

  // Individual Settle Up Handlers
  const handleOpenIndividualSettle = (debt: { debtor: string; creditor: string; amount: number; currency: string }) => {
    setSelectedDebtToSettle(debt);
    setSettleAmount(String(debt.amount));
    setSettleMethod('Cash');
  };

  const handleConfirmIndividualSettle = async () => {
    if (!selectedDebtToSettle) return;
    const amt = parseFloat(settleAmount) || selectedDebtToSettle.amount;
    if (amt <= 0) return;

    const debtor = selectedDebtToSettle.debtor;
    const creditor = selectedDebtToSettle.creditor;
    const curr = selectedDebtToSettle.currency;

    setActionLoading({
      active: true,
      success: false,
      title: 'Recording Settlement...',
      subtitle: `Clearing balance of ${curr}${amt.toFixed(2)} between ${debtor} and ${creditor}...`
    });

    const startTime = Date.now();
    try {
      await onSettleUp({
        payer: debtor,
        receiver: creditor,
        amount: amt,
        currency: curr,
        method: settleMethod || 'Cash'
      });
      const elapsed = Date.now() - startTime;
      if (elapsed < 500) {
        await new Promise(r => setTimeout(r, 500 - elapsed));
      }
      setActionLoading({
        active: true,
        success: true,
        title: 'Settlement Complete!',
        subtitle: `Debts recalculated and shared ledger synchronized.`
      });
      await new Promise(r => setTimeout(r, 550));
    } catch (err) {
      console.error('Failed to record settlement:', err);
    } finally {
      setSelectedDebtToSettle(null);
      setActionLoading({ active: false, success: false, title: '', subtitle: '' });
      setToastMessage(`✅ Settled ${curr}${amt.toFixed(2)} between ${debtor} and ${creditor}!`);
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
    }
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

      {/* Remove Member Toast Alert */}
      {removeToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 max-w-[380px] w-[92%] z-50 bg-rose-950 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center space-x-2 text-xs font-medium border border-rose-800 animate-in fade-in slide-in-from-top-2">
          <UserMinus className="w-4 h-4 shrink-0 text-rose-400" />
          <span className="truncate">{removeToast}</span>
        </div>
      )}

      {/* Header */}
      <header className="flex justify-between items-center pb-2 pt-0.5">
        <div className="flex items-center space-x-2">
          <h1 className="text-base font-bold tracking-tight text-[#1B1B19]">splitnest</h1>
          {chatId && (
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 bg-black/5 text-[#1B1B19]/70 rounded-md border border-black/5">
              {chatId.startsWith('-') ? `Group ${chatId.substring(0, 7)}...` : `Chat ${chatId.substring(0, 6)}...`}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-1.5">
          <button
            type="button"
            onClick={() => setShowMembersModal(true)}
            title="View & manage group members"
            className="text-[10px] font-mono font-medium px-2.5 py-1 bg-black/5 hover:bg-black/10 rounded-full text-[#1B1B19]/70 hover:text-[#1B1B19] flex items-center space-x-1.5 border border-black/5 transition cursor-pointer"
          >
            <Users className="w-3 h-3 text-[#1B1B19]/60" />
            <span>{availableUsers.length} {availableUsers.length === 1 ? 'member' : 'members'}</span>
          </button>

          <div className="text-[10px] font-mono font-medium px-2.5 py-1 bg-black/5 rounded-full text-[#1B1B19]/70 flex items-center space-x-1.5 border border-black/5 select-none">
            <span className={`w-1.5 h-1.5 rounded-full ${isOnlineGas ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
            <span>{isOnlineGas ? 'Synced' : 'Connecting'}</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto space-y-4 py-2">
        
        {/* Personal Balance Card (Strictly for Active User / Viewing Telegram Member) */}
        {activeTab === 'new' && (
          <div className="bg-white/70 backdrop-blur-md border border-black/5 rounded-2xl px-4 py-3 shadow-sm flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#1B1B19]/50 font-semibold leading-none mb-1">
                <span>Your Balance</span>
                <span className="text-[#1B1B19]/40 font-normal">({activeUser})</span>
              </div>
              
              <div className="flex items-center gap-2 flex-wrap">
                {myDebts.length === 0 && myCredits.length === 0 ? (
                  <div className="flex items-center gap-1.5 text-sm font-bold font-mono tracking-tight text-emerald-600">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>₱0.00</span>
                    <span className="text-xs text-[#1B1B19]/60 font-medium font-sans">• Settled up (You owe nothing)</span>
                  </div>
                ) : (
                  <>
                    <span className={`text-sm font-bold font-mono tracking-tight ${
                      myNet > 0.009 
                        ? 'text-emerald-600' 
                        : myNet < -0.009 
                          ? 'text-rose-600' 
                          : 'text-[#1B1B19]'
                    }`}>
                      {myNet > 0.009 ? '+' : myNet < -0.009 ? '-' : ''}
                      {currency}{Math.abs(myNet).toFixed(2)}
                    </span>
                    <span className="text-xs text-[#1B1B19]/70 font-medium truncate">
                      {myCredits.length > 0 && myDebts.length === 0 && (
                        `• ${myCredits.map(c => `${c.debtor} owes you ${c.currency}${c.amount.toFixed(2)}`).join(', ')}`
                      )}
                      {myDebts.length > 0 && myCredits.length === 0 && (
                        `• You owe ${myDebts.map(d => `${d.creditor} (${d.currency}${d.amount.toFixed(2)})`).join(', ')}`
                      )}
                      {myCredits.length > 0 && myDebts.length > 0 && (
                        `• +${currency}${totalOwedToMe.toFixed(2)} owed to you, -${currency}${totalOwedByMe.toFixed(2)} you owe`
                      )}
                    </span>
                  </>
                )}
              </div>
            </div>

            <button
              onClick={() => setActiveTab('balances')}
              className="font-mono text-[10px] uppercase tracking-wider text-[#4A6CF7] hover:underline font-bold shrink-0"
            >
              Settle →
            </button>
          </div>
        )}

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

            {/* Paid By Selector */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="block text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/60 font-semibold">
                  Paid By ({availableUsers.length} members)
                </label>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowMembersModal(true)}
                    className="text-[10px] font-mono text-[#1B1B19]/60 hover:text-[#1B1B19] font-medium flex items-center space-x-1"
                  >
                    <Users className="w-2.5 h-2.5" />
                    <span>Manage</span>
                  </button>
                  <span className="text-[#1B1B19]/20 text-[10px]">•</span>
                  <button
                    type="button"
                    onClick={() => setShowAddCustomUser(!showAddCustomUser)}
                    className="text-[10px] font-mono text-[#4A6CF7] hover:underline font-semibold"
                  >
                    {showAddCustomUser ? 'Cancel' : '+ Add Name'}
                  </button>
                </div>
              </div>

              {showAddCustomUser && (
                <div className="p-2.5 bg-white/80 rounded-xl border border-black/5 flex items-center space-x-1.5">
                  <input
                    type="text"
                    placeholder="Friend's Name (e.g. Chesco, Mark)"
                    value={customUserName}
                    onChange={e => setCustomUserName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomUser(); }}}
                    className="flex-1 bg-white border border-black/10 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#1B1B19] focus:outline-none focus:ring-1 focus:ring-[#4A6CF7]"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomUser}
                    className="bg-[#1B1B19] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-black transition"
                  >
                    Add
                  </button>
                </div>
              )}

              <select
                value={paidBy}
                onChange={e => setPaidBy(e.target.value)}
                className="w-full bg-white/60 border border-black/5 px-3 py-2.5 rounded-xl text-xs font-semibold text-[#1B1B19] focus:outline-none focus:bg-white transition"
              >
                {availableUsers.map(u => (
                  <option key={u} value={u}>
                    {u === activeUser ? `${u} (You)` : u}
                  </option>
                ))}
              </select>
            </div>

            {/* Split Mode Selector */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/50">Split Mode</label>
                {(splitMode === 'Equal' || splitMode === '50/50 Equal') && availableUsers.length > 0 && (
                  <span className="text-[10px] font-mono text-[#1B1B19]/60 font-semibold">
                    {availableUsers.length} members ({amount && Number(amount) > 0 ? `${currency}${(Number(amount) / availableUsers.length).toFixed(2)} each` : 'divided equally'})
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'Equal', label: 'Equal' },
                  { id: 'Exact Amounts', label: 'Exact Amounts' },
                  { id: 'Percentages', label: 'Percentages (%)' },
                  { id: 'Single Payer (100% owed)', label: '100% Owed' }
                ].map(mode => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => handleSplitModeChange(mode.id as any)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border text-left transition ${
                      splitMode === mode.id || (mode.id === 'Equal' && splitMode === '50/50 Equal')
                        ? 'bg-[#1B1B19] border-[#1B1B19] text-white font-semibold'
                        : 'bg-white/40 border-black/5 text-[#1B1B19]/70 hover:bg-white/80'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Equal Split Live Breakdown */}
            {(splitMode === 'Equal' || splitMode === '50/50 Equal') && availableUsers.length > 1 && (
              <div className="bg-white/40 p-2.5 rounded-xl border border-black/5 text-xs text-[#1B1B19]/80 space-y-1.5">
                <div className="flex justify-between items-center text-[10px] font-mono text-[#1B1B19]/60 uppercase font-semibold">
                  <span>Equal Share ({availableUsers.length} members)</span>
                  <span>
                    {amount && Number(amount) > 0 
                      ? `${currency}${(Number(amount) / availableUsers.length).toFixed(2)} / person` 
                      : 'Enter amount above'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {availableUsers.map(u => {
                    const share = amount && Number(amount) > 0 
                      ? (Number(amount) / availableUsers.length).toFixed(2) 
                      : '0.00';
                    const isPayer = u === (paidBy || activeUser);
                    return (
                      <span 
                        key={u} 
                        className={`px-2 py-0.5 rounded-md text-[10px] font-mono border ${
                          isPayer 
                            ? 'bg-[#1B1B19] text-white border-[#1B1B19] font-bold' 
                            : 'bg-white text-[#1B1B19] border-black/5'
                        }`}
                      >
                        {isPayer ? `Paid: ${u}` : u}: {currency}{share}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Exact Amounts Multi-Member Inputs */}
            {splitMode === 'Exact Amounts' && (
              <div className="bg-white/40 p-3 rounded-2xl border border-black/5 space-y-2.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#1B1B19]/60 font-semibold">
                    Exact Shares ({availableUsers.length} members)
                  </span>
                  <button
                    type="button"
                    onClick={handleDistributeExactEvenly}
                    className="font-mono text-[10px] text-[#4A6CF7] hover:underline font-semibold"
                  >
                    Distribute Evenly
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {availableUsers.map(u => {
                    const isPayer = u === (paidBy || activeUser);
                    return (
                      <div key={u} className="bg-white/70 p-2 rounded-xl border border-black/5 space-y-1">
                        <div className="flex justify-between items-center text-[10px] font-mono text-[#1B1B19]/70">
                          <span className="truncate font-semibold max-w-[85px]">{isPayer ? `${u} (Payer)` : u}</span>
                          <span className="font-semibold">{currency}</span>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={exactShares[u] ?? ''}
                          onChange={e => {
                            const val = e.target.value;
                            setExactShares(prev => ({ ...prev, [u]: val }));
                          }}
                          className="w-full bg-white border border-black/10 rounded-lg px-2 py-1 text-xs font-mono font-bold text-[#1B1B19] focus:outline-none focus:ring-1 focus:ring-[#1B1B19]"
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Total Allocation Check */}
                {(() => {
                  const numAmt = parseFloat(amount) || 0;
                  const totalAllocated = availableUsers.reduce((sum, u) => sum + (parseFloat(exactShares[u] || '0') || 0), 0);
                  const diff = numAmt - totalAllocated;
                  const isMatch = Math.abs(diff) < 0.01;

                  return (
                    <div className="flex items-center justify-between text-[11px] font-mono pt-1 border-t border-black/5">
                      <span className="text-[#1B1B19]/60">
                        Allocated: <strong className="text-[#1B1B19]">{currency}{totalAllocated.toFixed(2)}</strong> / {currency}{numAmt.toFixed(2)}
                      </span>
                      <span className={`font-semibold px-2 py-0.5 rounded ${
                        isMatch ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {isMatch ? '✓ Balanced' : `Diff: ${diff > 0 ? '+' : ''}${currency}${diff.toFixed(2)}`}
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Percentages Multi-Member Inputs */}
            {splitMode === 'Percentages' && (
              <div className="bg-white/40 p-3 rounded-2xl border border-black/5 space-y-2.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#1B1B19]/60 font-semibold">
                    Percentage Shares ({availableUsers.length} members)
                  </span>
                  <button
                    type="button"
                    onClick={handleSetEqualPercentages}
                    className="font-mono text-[10px] text-[#4A6CF7] hover:underline font-semibold"
                  >
                    Set Equal %
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {availableUsers.map(u => {
                    const isPayer = u === (paidBy || activeUser);
                    const pct = parseFloat(percentShares[u] || '0') || 0;
                    const numAmt = parseFloat(amount) || 0;
                    const calcAmount = numAmt > 0 ? ((numAmt * pct) / 100).toFixed(2) : '0.00';

                    return (
                      <div key={u} className="bg-white/70 p-2 rounded-xl border border-black/5 space-y-1">
                        <div className="flex justify-between items-center text-[10px] font-mono text-[#1B1B19]/70">
                          <span className="truncate font-semibold max-w-[70px]">{isPayer ? `${u} (Payer)` : u}</span>
                          <span className="text-[#1B1B19]/50">{currency}{calcAmount}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.1"
                            placeholder="0"
                            value={percentShares[u] ?? ''}
                            onChange={e => {
                              const val = e.target.value;
                              setPercentShares(prev => ({ ...prev, [u]: val }));
                            }}
                            className="w-full bg-white border border-black/10 rounded-lg px-2 py-1 text-xs font-mono font-bold text-[#1B1B19] focus:outline-none focus:ring-1 focus:ring-[#1B1B19]"
                          />
                          <span className="text-xs font-mono text-[#1B1B19]/60 font-semibold">%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Total % Check */}
                {(() => {
                  const totalPct = availableUsers.reduce((sum, u) => sum + (parseFloat(percentShares[u] || '0') || 0), 0);
                  const isMatch = Math.abs(totalPct - 100) < 0.1;

                  return (
                    <div className="flex items-center justify-between text-[11px] font-mono pt-1 border-t border-black/5">
                      <span className="text-[#1B1B19]/60">
                        Total %: <strong className="text-[#1B1B19]">{totalPct.toFixed(1)}%</strong>
                      </span>
                      <span className={`font-semibold px-2 py-0.5 rounded ${
                        isMatch ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {isMatch ? '✓ 100% Complete' : `Diff: ${(100 - totalPct).toFixed(1)}%`}
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Single Payer (100% owed) Member Selector */}
            {splitMode === 'Single Payer (100% owed)' && (
              <div className="bg-white/40 p-3 rounded-2xl border border-black/5 space-y-2 text-xs">
                <label className="block text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/60 font-semibold">
                  Select Who Owes 100% of this Expense
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {availableUsers.map(u => {
                    const isPayer = u === (paidBy || activeUser);
                    const isSelected = (singleDebtor || (availableUsers.find(k => k !== paidBy) || availableUsers[0])) === u;
                    return (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setSingleDebtor(u)}
                        className={`p-2 rounded-xl text-left border transition ${
                          isSelected
                            ? 'bg-[#1B1B19] text-white border-[#1B1B19] shadow-sm'
                            : 'bg-white/70 border-black/5 text-[#1B1B19]/80 hover:bg-white'
                        }`}
                      >
                        <p className="font-semibold text-xs truncate">{u} {isPayer ? '(Payer)' : ''}</p>
                        <p className={`text-[10px] font-mono ${isSelected ? 'text-white/70' : 'text-[#1B1B19]/50'}`}>
                          Owes {currency}{amount || '0.00'}
                        </p>
                      </button>
                    );
                  })}
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

        {/* TAB 2: BALANCES & INDIVIDUAL SETTLEMENTS */}
        {activeTab === 'balances' && (
          <div className="space-y-3">
            <div className="bg-white/70 backdrop-blur-md border border-black/5 rounded-[24px] p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-black/5 pb-2">
                <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#1B1B19]/60 font-semibold">
                  Member Settlements
                </div>
                <span className="text-[10px] font-mono text-[#1B1B19]/40">
                  {activeBalances.length} {activeBalances.length === 1 ? 'balance' : 'balances'}
                </span>
              </div>
              
              {activeBalances.length === 0 ? (
                <div className="py-4 text-center space-y-1">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-1 text-base">
                    ✓
                  </div>
                  <p className="text-lg font-bold font-mono text-emerald-600">₱0.00</p>
                  <p className="text-xs text-[#1B1B19]/70 font-medium">All settled up! No outstanding balances across the group.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] text-[#1B1B19]/60 leading-tight">
                    Settle balances individually for each member pair. All group members see the same live settlements.
                  </p>
                  {activeBalances.map((cb, i) => {
                    const isDebtor = cb.debtor.toLowerCase() === activeUser.toLowerCase();
                    const isCreditor = cb.creditor.toLowerCase() === activeUser.toLowerCase();

                    return (
                      <div 
                        key={i} 
                        className={`p-3 rounded-2xl border transition flex items-center justify-between gap-2.5 ${
                          isDebtor 
                            ? 'bg-rose-50/60 border-rose-200/60' 
                            : isCreditor 
                              ? 'bg-emerald-50/60 border-emerald-200/60' 
                              : 'bg-white/60 border-black/5'
                        }`}
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-xs text-[#1B1B19]">
                              {isDebtor ? (
                                <>You owe <strong className="text-rose-700">{cb.creditor}</strong></>
                              ) : isCreditor ? (
                                <><strong className="text-emerald-700">{cb.debtor}</strong> owes You</>
                              ) : (
                                <>{cb.debtor} owes {cb.creditor}</>
                              )}
                            </span>
                            {isDebtor && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 bg-rose-200/80 text-rose-800 rounded font-semibold">
                                You Pay
                              </span>
                            )}
                            {isCreditor && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 bg-emerald-200/80 text-emerald-800 rounded font-semibold">
                                You Receive
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-[#1B1B19]/50 font-mono">
                            Direct Settlement • {cb.currency}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-bold font-mono text-sm text-[#1B1B19]">
                            {cb.currency}{cb.amount.toFixed(2)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenIndividualSettle(cb)}
                            className="bg-[#1B1B19] hover:bg-black text-white px-3 py-1.5 rounded-xl font-semibold text-xs shadow-sm transition active:scale-95 flex items-center gap-1"
                          >
                            <ArrowRightLeft className="w-3 h-3" />
                            <span>Settle</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
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
                        <p className="text-[10px] text-[#1B1B19]/50 font-mono">
                          {s.method ? `via ${s.method} • ` : ''}{new Date(s.timestamp).toLocaleDateString()}
                        </p>
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

      </div>

      {/* Individual Settlement Modal */}
      {selectedDebtToSettle && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-md z-50 p-5 flex items-center justify-center">
          <div className="bg-[#F8F7F4] border border-black/10 rounded-[32px] p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-black/5 pb-2">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-[#1B1B19] text-white flex items-center justify-center text-sm shadow-md">
                  🤝
                </div>
                <div>
                  <h4 className="font-bold text-[#1B1B19] text-sm">
                    Settle Individual Balance
                  </h4>
                  <p className="text-[10px] text-[#1B1B19]/60 font-mono">
                    Record Member Payment
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDebtToSettle(null)}
                className="text-xs text-[#1B1B19]/50 hover:text-[#1B1B19] font-mono px-2 py-1"
              >
                ✕
              </button>
            </div>

            {/* Debt summary card */}
            <div className="bg-white/80 p-3.5 rounded-2xl border border-black/5 space-y-1.5 text-xs">
              <div className="flex justify-between items-center text-[#1B1B19]/70">
                <span>Payer:</span>
                <span className="font-bold text-[#1B1B19]">{selectedDebtToSettle.debtor}</span>
              </div>
              <div className="flex justify-between items-center text-[#1B1B19]/70">
                <span>Receiver:</span>
                <span className="font-bold text-[#1B1B19]">{selectedDebtToSettle.creditor}</span>
              </div>
              <div className="flex justify-between items-center text-[#1B1B19]/70 border-t border-black/5 pt-1.5">
                <span>Total Balance:</span>
                <span className="font-bold font-mono text-[#1B1B19] text-sm">
                  {selectedDebtToSettle.currency}{selectedDebtToSettle.amount.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Amount input */}
            <div className="space-y-1">
              <label className="block text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/60">
                Amount Paid ({selectedDebtToSettle.currency})
              </label>
              <input
                type="number"
                step="0.01"
                value={settleAmount}
                onChange={e => setSettleAmount(e.target.value)}
                required
                className="w-full bg-white border border-black/10 px-3.5 py-2 rounded-xl text-sm font-semibold font-mono text-[#1B1B19] focus:outline-none focus:ring-2 focus:ring-[#4A6CF7]/20"
              />
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/60">
                Payment Method
              </label>
              <div className="flex flex-wrap gap-1.5">
                {['Cash', 'GCash', 'Maya', 'Bank Transfer', 'Other'].map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSettleMethod(m)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                      settleMethod === m
                        ? 'bg-[#1B1B19] text-white border-[#1B1B19] font-semibold'
                        : 'bg-white/60 border-black/5 text-[#1B1B19]/70 hover:bg-white'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSelectedDebtToSettle(null)}
                className="w-full bg-black/5 hover:bg-black/10 text-[#1B1B19] py-2.5 rounded-xl font-semibold text-xs transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmIndividualSettle}
                className="w-full bg-[#1B1B19] hover:bg-black text-white py-2.5 rounded-xl font-semibold text-xs shadow-md transition"
              >
                Confirm Settle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Google Apps Script & Sync Settings Modal */}
      {showSettingsModal && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-md z-50 p-4 flex items-center justify-center">
          <div className="bg-[#F8F7F4] border border-black/10 rounded-[32px] p-5 w-full max-w-sm space-y-3.5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-black/5 pb-2.5">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-lg bg-[#4A6CF7]/10 text-[#4A6CF7] flex items-center justify-center text-sm font-bold">
                  ⚙️
                </div>
                <div>
                  <h4 className="font-bold text-[#1B1B19] text-sm leading-tight">Google Sheets Sync</h4>
                  <p className="text-[10px] text-[#1B1B19]/60 font-mono">Backend Connection Status</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowSettingsModal(false);
                  setTestResult(null);
                }}
                className="text-xs text-[#1B1B19]/50 hover:text-[#1B1B19] font-mono px-2 py-1"
              >
                ✕
              </button>
            </div>

            {/* Status indicator pill */}
            <div className={`p-3 rounded-2xl border text-xs font-mono flex items-start space-x-2.5 ${
              isOnlineGas 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}>
              <span className={`w-2.5 h-2.5 rounded-full mt-0.5 shrink-0 ${isOnlineGas ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`}></span>
              <div className="space-y-0.5">
                <p className="font-bold">{isOnlineGas ? '🟢 Live Sheet Connected' : '🟡 Sync Pending / Blocked'}</p>
                <p className="text-[10px] leading-tight opacity-80">
                  {isOnlineGas 
                    ? 'All members and expenses in your Google Sheet are syncing automatically.' 
                    : 'Google returned a login redirect. Verify "Execute as: Me" and "Who has access: Anyone".'}
                </p>
              </div>
            </div>

            {/* Web App URL field */}
            <div className="space-y-1">
              <label className="block text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/60">
                Apps Script Web App URL
              </label>
              <input
                type="url"
                value={inputGasUrl}
                onChange={e => setInputGasUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full bg-white border border-black/10 px-3 py-2 rounded-xl text-xs font-mono text-[#1B1B19] focus:outline-none focus:ring-2 focus:ring-[#4A6CF7]/20"
              />
            </div>

            {/* Test result message if any */}
            {testResult && (
              <div className={`p-2.5 rounded-xl text-xs font-mono leading-tight ${
                testResult.status === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}>
                {testResult.message}
              </div>
            )}

            {/* Deployment Instructions Checklist */}
            <div className="bg-white/60 p-3 rounded-2xl border border-black/5 text-[11px] space-y-1.5 text-[#1B1B19]/80">
              <p className="font-bold font-mono text-[10px] uppercase text-[#1B1B19]">Troubleshooting Checklist:</p>
              <p className="leading-snug">• <strong>Deploy New Version</strong>: In Apps Script, click <code>Deploy &gt; Manage deployments &gt; Edit (pencil) &gt; Version: New version &gt; Deploy</code>.</p>
              <p className="leading-snug">• <strong>Bot Privacy (@BotFather)</strong>: To receive <code>/start</code> in groups, send <code>/setprivacy</code> to @BotFather and choose <code>Disable</code>, or promote the bot to Admin.</p>
              <p className="leading-snug">• <strong>Execute as</strong>: <code>Me</code> | <strong>Who has access</strong>: <code>Anyone</code>.</p>
            </div>

            {/* Sync Webhook Button */}
            <button
              type="button"
              disabled={isTestingUrl}
              onClick={async () => {
                setIsTestingUrl(true);
                setTestResult(null);
                try {
                  const cleanUrl = inputGasUrl.trim();
                  if (!cleanUrl.startsWith('http')) {
                    setTestResult({ status: 'error', message: 'Enter a valid Apps Script Web App URL first.' });
                    setIsTestingUrl(false);
                    return;
                  }
                  const res = await fetch(`${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=set_webhook`);
                  const json = await res.json();
                  if (json.result && json.result.ok) {
                    setTestResult({ status: 'success', message: '✅ Webhook successfully connected to Telegram! Bot will now respond to commands.' });
                  } else {
                    setTestResult({ status: 'error', message: `Webhook registration response: ${JSON.stringify(json.result || json)}` });
                  }
                } catch (err: any) {
                  setTestResult({ status: 'error', message: `Webhook registration failed: ${err.message}` });
                } finally {
                  setIsTestingUrl(false);
                }
              }}
              className="w-full bg-[#1B1B19] hover:bg-black text-white py-2 rounded-xl font-semibold text-xs transition flex items-center justify-center space-x-1.5"
            >
              <Send className="w-3 h-3" />
              <span>Register / Refresh Telegram Webhook</span>
            </button>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                disabled={isTestingUrl}
                onClick={async () => {
                  setIsTestingUrl(true);
                  setTestResult(null);
                  try {
                    const cleanUrl = inputGasUrl.trim();
                    if (!cleanUrl.startsWith('http')) {
                      setTestResult({ status: 'error', message: 'URL must start with https://' });
                      setIsTestingUrl(false);
                      return;
                    }
                    const res = await fetch(`${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=get_data`);
                    const text = await res.text();
                    if (text.includes('accounts.google.com') || text.startsWith('<')) {
                      setTestResult({
                        status: 'error',
                        message: 'Google Sign-In blocked this URL. In Apps Script, set "Execute as: Me" and "Who has access: Anyone".'
                      });
                    } else {
                      const json = JSON.parse(text);
                      if (json.status === 'success') {
                        setGasUrl(cleanUrl);
                        setTestResult({
                          status: 'success',
                          message: `Connected! Found ${(json.data?.users || []).length} users and ${(json.data?.expenses || []).length} expenses.`
                        });
                        setTimeout(() => {
                          setShowSettingsModal(false);
                          window.location.reload();
                        }, 1200);
                      } else {
                        setTestResult({ status: 'error', message: json.message || 'Error fetching data' });
                      }
                    }
                  } catch (err: any) {
                    setTestResult({ status: 'error', message: `Fetch failed: ${err.message}` });
                  } finally {
                    setIsTestingUrl(false);
                  }
                }}
                className="w-full bg-[#4A6CF7] hover:bg-[#3B5BE3] text-white py-2.5 rounded-xl font-semibold text-xs transition shadow-sm flex items-center justify-center space-x-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTestingUrl ? 'animate-spin' : ''}`} />
                <span>{isTestingUrl ? 'Testing...' : 'Save & Test'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSettingsModal(false);
                  setTestResult(null);
                }}
                className="w-full bg-black/5 hover:bg-black/10 text-[#1B1B19] py-2.5 rounded-xl font-semibold text-xs transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group Members Management Modal */}
      {showMembersModal && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-md z-50 p-4 flex items-center justify-center">
          <div className="bg-[#F8F7F4] border border-black/10 rounded-[32px] p-5 w-full max-w-sm space-y-3.5 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-black/5 pb-2.5">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-[#1B1B19] text-white flex items-center justify-center text-xs shadow-md">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-[#1B1B19] text-sm leading-tight">Group Members</h4>
                  <p className="text-[10px] text-[#1B1B19]/60 font-mono">{availableUsers.length} active in ledger</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowMembersModal(false);
                  setMemberToRemove(null);
                }}
                className="w-7 h-7 rounded-full bg-black/5 hover:bg-black/10 text-[#1B1B19]/60 hover:text-[#1B1B19] flex items-center justify-center transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* List of members with remove action */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 min-h-[120px] max-h-[300px]">
              {availableUsers.length === 0 ? (
                <div className="text-center py-6 text-xs text-[#1B1B19]/50 font-mono">
                  No members found. Tap "Sync Telegram Members" below.
                </div>
              ) : (
                availableUsers.map((member) => {
                  const isCurrent = member === activeUser;
                  return (
                    <div
                      key={member}
                      className="bg-white/80 border border-black/5 rounded-2xl p-3 flex items-center justify-between shadow-xs hover:border-black/10 transition"
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-[#1B1B19]/5 text-[#1B1B19] font-bold text-xs flex items-center justify-center uppercase shrink-0">
                          {member.replace(/^@/, '').substring(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center space-x-1.5">
                            <p className="font-semibold text-xs text-[#1B1B19] truncate">{member}</p>
                            {isCurrent && (
                              <span className="text-[9px] font-mono px-1.5 py-0.5 bg-[#4A6CF7]/10 text-[#4A6CF7] rounded-full font-medium shrink-0">
                                You
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-[#1B1B19]/50 font-mono truncate">
                            {member.startsWith('@') ? 'Telegram handle' : 'Group member'}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setMemberToRemove(member)}
                        title={`Remove ${member} from ledger`}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition border border-transparent hover:border-rose-200 shrink-0 ml-2 cursor-pointer"
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* In-Modal Confirmation Warning when a member is selected to be removed */}
            {memberToRemove && (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 space-y-2.5 text-xs">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-rose-900 leading-tight">Remove {memberToRemove}?</p>
                    <p className="text-[11px] text-rose-700 mt-0.5 leading-snug">
                      This will remove them from split dropdowns and sync the change to Google Sheets.
                    </p>
                  </div>
                </div>
                <div className="flex space-x-2 pt-0.5">
                  <button
                    type="button"
                    disabled={isRemovingMember}
                    onClick={() => setMemberToRemove(null)}
                    className="flex-1 bg-white hover:bg-rose-100/60 text-rose-900 border border-rose-200 py-1.5 rounded-xl font-medium text-xs transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isRemovingMember}
                    onClick={() => handleConfirmRemoveMember(memberToRemove)}
                    className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-1.5 rounded-xl font-semibold text-xs shadow-xs transition flex items-center justify-center space-x-1"
                  >
                    {isRemovingMember ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    <span>{isRemovingMember ? 'Removing...' : 'Confirm Remove'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Actions footer inside modal */}
            <div className="pt-1 space-y-2">
              <button
                type="button"
                disabled={isSyncingMembers}
                onClick={async () => {
                  setIsSyncingMembers(true);
                  setActionLoading({
                    active: true,
                    success: false,
                    title: 'Syncing Telegram Members...',
                    subtitle: 'Querying group admins & roster from Telegram...'
                  });
                  const startTime = Date.now();
                  try {
                    if (onSyncMembers) await onSyncMembers();
                    const elapsed = Date.now() - startTime;
                    if (elapsed < 500) {
                      await new Promise(r => setTimeout(r, 500 - elapsed));
                    }
                    setActionLoading({
                      active: true,
                      success: true,
                      title: 'Members Synced!',
                      subtitle: 'Roster and group permissions are up to date.'
                    });
                    await new Promise(r => setTimeout(r, 550));
                  } catch (err) {
                    console.error('Sync failed:', err);
                  } finally {
                    setIsSyncingMembers(false);
                    setActionLoading({ active: false, success: false, title: '', subtitle: '' });
                  }
                }}
                className="w-full bg-black/5 hover:bg-black/10 text-[#1B1B19] py-2.5 rounded-xl font-medium text-xs transition flex items-center justify-center space-x-1.5 font-mono"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#1B1B19]/70 ${isSyncingMembers ? 'animate-spin text-[#4A6CF7]' : ''}`} />
                <span>{isSyncingMembers ? 'Syncing...' : 'Sync Telegram Members'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Action Processing & Sync Loader */}
      {actionLoading.active && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-5 animate-in fade-in duration-200">
          <div className="bg-[#F8F7F4] border border-black/10 rounded-[28px] p-6 w-full max-w-xs space-y-3.5 text-center shadow-2xl">
            {actionLoading.success ? (
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-xl font-bold shadow-xs">
                ✓
              </div>
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-[#1B1B19] text-white flex items-center justify-center mx-auto shadow-md">
                <RefreshCw className="w-6 h-6 animate-spin text-white" />
              </div>
            )}
            <div className="space-y-1">
              <h4 className="font-bold text-[#1B1B19] text-sm">
                {actionLoading.title}
              </h4>
              <p className="text-[11px] text-[#1B1B19]/60 font-mono leading-tight">
                {actionLoading.subtitle}
              </p>
            </div>
            {!actionLoading.success && (
              <div className="w-full bg-black/5 h-1 rounded-full overflow-hidden">
                <div className="bg-[#1B1B19] h-full rounded-full animate-pulse w-3/4 mx-auto" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Monospace Sticky Footer Navigation */}
      <footer className="sticky bottom-0 bg-[#F8F7F4]/95 backdrop-blur-md border-t border-black/10 py-3 mt-auto z-40 grid grid-cols-3 gap-1 text-center font-mono text-[9px] uppercase tracking-wider">
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
      </footer>

    </div>
  );
};
