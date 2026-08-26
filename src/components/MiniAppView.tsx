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
  Pencil,
  Check,
  X
} from 'lucide-react';
import { Expense, Settlement, RegisteredUser, formatAmount } from '../types';

interface MiniAppViewProps {
  expenses: Expense[];
  settlements: Settlement[];
  registeredUsers?: RegisteredUser[];
  activeUser: string;
  setActiveUser: (user: string) => void;
  onAddExpense: (expense: Omit<Expense, 'id' | 'timestamp'>) => Promise<void> | void;
  onEditExpense?: (expense: Expense) => Promise<void> | void;
  onDeleteExpense?: (expenseId: string) => Promise<void> | void;
  onSettleUp: (settlement: Omit<Settlement, 'id' | 'timestamp'>) => Promise<void> | void;
  onSyncMembers?: () => Promise<void> | void;
  onRemoveMember?: (memberName: string) => Promise<void> | void;
  gasUrl: string;
  setGasUrl: (url: string) => void;
  isOnlineGas: boolean;
  chatId?: string;
  groupTitle?: string;
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
  onEditExpense,
  onDeleteExpense,
  onSettleUp,
  onSyncMembers,
  onRemoveMember,
  gasUrl,
  setGasUrl,
  isOnlineGas,
  chatId = '',
  groupTitle = ''
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
  const [equalSplitMembers, setEqualSplitMembers] = useState<string[]>([]);
  const [exactShares, setExactShares] = useState<Record<string, string>>({});
  const [percentShares, setPercentShares] = useState<Record<string, string>>({});
  const [singleDebtor, setSingleDebtor] = useState<string>('');
  
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

  // Edit Expense Modal State
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCurrency, setEditCurrency] = useState('₱');
  const [editPaidBy, setEditPaidBy] = useState('');
  const [editSplitMode, setEditSplitMode] = useState<'Equal' | '50/50 Equal' | 'Exact Amounts' | 'Percentages' | 'Single Payer (100% owed)'>('Equal');
  const [editEqualSplitMembers, setEditEqualSplitMembers] = useState<string[]>([]);
  const [editExactShares, setEditExactShares] = useState<Record<string, string>>({});
  const [editPercentShares, setEditPercentShares] = useState<Record<string, string>>({});
  const [editSingleDebtor, setEditSingleDebtor] = useState<string>('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingExpense, setIsDeletingExpense] = useState(false);

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

  // Active contributors for Equal Split in Add Expense form (default is ALL available users)
  const selectedEqualMembers = equalSplitMembers.length > 0
    ? equalSplitMembers.filter(u => availableUsers.includes(u))
    : availableUsers;

  const handleToggleEqualMember = (member: string) => {
    const current = equalSplitMembers.length > 0
      ? equalSplitMembers.filter(u => availableUsers.includes(u))
      : [...availableUsers];
    
    if (current.includes(member)) {
      if (current.length <= 1) return; // Keep at least one contributor
      setEqualSplitMembers(current.filter(u => u !== member));
    } else {
      setEqualSplitMembers([...current, member]);
    }
  };

  const handleSelectAllEqualMembers = () => {
    setEqualSplitMembers([...availableUsers]);
  };

  const handleToggleEditEqualMember = (member: string) => {
    const current = editEqualSplitMembers.length > 0
      ? editEqualSplitMembers.filter(u => availableUsers.includes(u))
      : [...availableUsers];
    
    if (current.includes(member)) {
      if (current.length <= 1) return; // Keep at least one contributor
      setEditEqualSplitMembers(current.filter(u => u !== member));
    } else {
      setEditEqualSplitMembers([...current, member]);
    }
  };

  const handleSelectAllEditEqualMembers = () => {
    setEditEqualSplitMembers([...availableUsers]);
  };

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

  // Helper to parse numbers safely with commas and spaces removed
  const parseCleanNumber = (val: string | number | undefined | null): number => {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const cleaned = String(val).replace(/,/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  };

  // Auto-initialize multi-member shares when switching split modes or changing members
  const handleSplitModeChange = (mode: 'Equal' | '50/50 Equal' | 'Exact Amounts' | 'Percentages' | 'Single Payer (100% owed)') => {
    setSplitMode(mode);
    if (mode === 'Exact Amounts') {
      const numAmt = parseCleanNumber(amount);
      const initial: Record<string, string> = {};
      if (numAmt > 0 && availableUsers.length > 0) {
        const perPerson = formatAmount(numAmt / availableUsers.length);
        availableUsers.forEach(u => {
          initial[u] = exactShares[u] ? formatAmount(parseCleanNumber(exactShares[u])) : perPerson;
        });
      } else {
        availableUsers.forEach(u => {
          initial[u] = exactShares[u] ? formatAmount(parseCleanNumber(exactShares[u])) : '';
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
    const numAmt = parseCleanNumber(amount);
    if (availableUsers.length === 0) return;
    const share = formatAmount(numAmt / availableUsers.length);
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
          const participants = (e.splitMembers && Array.isArray(e.splitMembers) && e.splitMembers.length > 0)
            ? e.splitMembers.filter(u => availableUsers.includes(u) || u === payer)
            : availableUsers;
          const numMembers = Math.max(participants.length, 1);
          const sharePerMember = amt / numMembers;
          participants.forEach(u => {
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
        const roundedNet = Math.round(net * 100) / 100;
        if (roundedNet >= 0.01) creditors.push({ name, bal: roundedNet });
        else if (roundedNet <= -0.01) debtors.push({ name, bal: Math.abs(roundedNet) });
      });

      debtors.sort((a, b) => b.bal - a.bal);
      creditors.sort((a, b) => b.bal - a.bal);

      let dIdx = 0;
      let cIdx = 0;

      while (dIdx < debtors.length && cIdx < creditors.length) {
        const deb = debtors[dIdx];
        const cred = creditors[cIdx];
        let oweAmt = Math.min(deb.bal, cred.bal);
        oweAmt = Math.round(oweAmt * 100) / 100;

        if (oweAmt >= 0.01) {
          results.push({
            currency: curr,
            debtor: deb.name,
            creditor: cred.name,
            amount: oweAmt,
            summaryText: `${deb.name} owes ${cred.name}`
          });
          deb.bal = Math.round((deb.bal - oweAmt) * 100) / 100;
          cred.bal = Math.round((cred.bal - oweAmt) * 100) / 100;
        }

        if (deb.bal < 0.01) dIdx++;
        if (cred.bal < 0.01) cIdx++;
      }
    });

    return results;
  };

  const currencyBalances = calculateCurrencyBalances();
  const activeBalances = currencyBalances.filter(cb => cb.amount >= 0.01);

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmt = parseCleanNumber(amount);
    if (!description.trim() || numAmt <= 0) return;

    let finalShares: Record<string, number> | undefined = undefined;
    let finalPercentages: Record<string, number> | undefined = undefined;
    let finalSingleOwer: string | undefined = undefined;
    let finalSplitMembers: string[] | undefined = undefined;

    if (splitMode === 'Equal' || splitMode === '50/50 Equal') {
      finalSplitMembers = selectedEqualMembers.length > 0 ? selectedEqualMembers : availableUsers;
    } else if (splitMode === 'Exact Amounts') {
      finalShares = {};
      availableUsers.forEach(u => {
        finalShares![u] = parseCleanNumber(exactShares[u]);
      });
    } else if (splitMode === 'Percentages') {
      finalPercentages = {};
      availableUsers.forEach(u => {
        finalPercentages![u] = parseCleanNumber(percentShares[u]);
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
      splitMembers: finalSplitMembers,
      userAShare: finalShares ? finalShares[paidBy || activeUser] : undefined,
      userBShare: finalShares ? finalShares[otherUser] : undefined,
      userAPercent: finalPercentages ? finalPercentages[paidBy || activeUser] : undefined,
      userBPercent: finalPercentages ? finalPercentages[otherUser] : undefined,
      shares: finalShares,
      percentages: finalPercentages,
      singleOwer: finalSingleOwer,
      createdBy: activeUser
    };

    const savedDesc = description.trim();
    const savedAmt = numAmt;
    const savedCurr = currency;

    setActionLoading({
      active: true,
      success: false,
      title: 'Logging Expense...',
      subtitle: `Syncing ${savedCurr}${formatAmount(savedAmt)} to shared ledger & updating balances...`
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
      setEqualSplitMembers([]);
      setExactShares({});
      setPercentShares({});
      setActionLoading({ active: false, success: false, title: '', subtitle: '' });
      setToastMessage(`Logged "${savedCurr}${formatAmount(savedAmt)} ${savedDesc}"`);
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
    setSettleAmount(formatAmount(debt.amount));
    setSettleMethod('Cash');
  };

  const handleConfirmIndividualSettle = async () => {
    if (!selectedDebtToSettle) return;
    const amt = parseCleanNumber(settleAmount) || selectedDebtToSettle.amount;
    if (amt <= 0) return;

    const debtor = selectedDebtToSettle.debtor;
    const creditor = selectedDebtToSettle.creditor;
    const curr = selectedDebtToSettle.currency;

    setActionLoading({
      active: true,
      success: false,
      title: 'Recording Settlement...',
      subtitle: `Clearing balance of ${curr}${formatAmount(amt)} between ${debtor} and ${creditor}...`
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
      setToastMessage(`✅ Settled ${curr}${formatAmount(amt)} between ${debtor} and ${creditor}!`);
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
    }
  };

  // Edit Expense Modal Handlers
  const handleOpenEditModal = (exp: Expense) => {
    setEditingExpense(exp);
    setEditDescription(exp.description || '');
    setEditAmount(String(exp.amount || ''));
    setEditCurrency(exp.currency || '₱');
    setEditPaidBy(exp.paidBy || activeUser);

    let mode: any = exp.splitMode || 'Equal';
    if (mode === '50/50 Equal') mode = 'Equal';
    setEditSplitMode(mode);

    // Initialize equal split members
    if (exp.splitMembers && Array.isArray(exp.splitMembers) && exp.splitMembers.length > 0) {
      setEditEqualSplitMembers(exp.splitMembers);
    } else {
      setEditEqualSplitMembers([...availableUsers]);
    }

    // Initialize exact shares
    const initialExact: Record<string, string> = {};
    if (exp.shares && Object.keys(exp.shares).length > 0) {
      availableUsers.forEach(u => {
        initialExact[u] = exp.shares && exp.shares[u] !== undefined ? String(exp.shares[u]) : '';
      });
    } else {
      const numMembers = Math.max(availableUsers.length, 1);
      const even = ((Number(exp.amount) || 0) / numMembers).toFixed(2);
      availableUsers.forEach(u => {
        initialExact[u] = even;
      });
    }
    setEditExactShares(initialExact);

    // Initialize percentages
    const initialPct: Record<string, string> = {};
    if (exp.percentages && Object.keys(exp.percentages).length > 0) {
      availableUsers.forEach(u => {
        initialPct[u] = exp.percentages && exp.percentages[u] !== undefined ? String(exp.percentages[u]) : '';
      });
    } else {
      const numMembers = Math.max(availableUsers.length, 1);
      const evenPct = (100 / numMembers).toFixed(1);
      availableUsers.forEach(u => {
        initialPct[u] = evenPct;
      });
    }
    setEditPercentShares(initialPct);

    setEditSingleDebtor(exp.singleOwer || (availableUsers.find(u => u !== (exp.paidBy || activeUser)) || availableUsers[0]));
    setShowDeleteConfirm(false);
  };

  const handleSaveEditedExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense) return;
    const numAmt = parseCleanNumber(editAmount);
    if (!editDescription.trim() || numAmt <= 0) return;

    let finalShares: Record<string, number> | undefined = undefined;
    let finalPercentages: Record<string, number> | undefined = undefined;
    let finalSingleOwer: string | undefined = undefined;
    let finalSplitMembers: string[] | undefined = undefined;

    if (editSplitMode === 'Equal' || editSplitMode === '50/50 Equal') {
      const chosen = editEqualSplitMembers.length > 0
        ? editEqualSplitMembers.filter(u => availableUsers.includes(u))
        : availableUsers;
      finalSplitMembers = chosen;
    } else if (editSplitMode === 'Exact Amounts') {
      finalShares = {};
      availableUsers.forEach(u => {
        finalShares![u] = parseCleanNumber(editExactShares[u]);
      });
    } else if (editSplitMode === 'Percentages') {
      finalPercentages = {};
      availableUsers.forEach(u => {
        finalPercentages![u] = parseCleanNumber(editPercentShares[u]);
      });
    } else if (editSplitMode === 'Single Payer (100% owed)') {
      finalSingleOwer = editSingleDebtor || availableUsers.find(u => u !== editPaidBy) || availableUsers[0];
    }

    const updated: Expense = {
      ...editingExpense,
      description: editDescription.trim(),
      amount: numAmt,
      currency: editCurrency,
      paidBy: editPaidBy.trim() || activeUser,
      splitMode: editSplitMode,
      splitMembers: finalSplitMembers,
      userAShare: finalShares ? finalShares[editPaidBy || activeUser] : undefined,
      userBShare: finalShares ? finalShares[otherUser] : undefined,
      userAPercent: finalPercentages ? finalPercentages[editPaidBy || activeUser] : undefined,
      userBPercent: finalPercentages ? finalPercentages[otherUser] : undefined,
      shares: finalShares,
      percentages: finalPercentages,
      singleOwer: finalSingleOwer
    };

    const savedDesc = editDescription.trim();
    const savedAmt = numAmt;
    const savedCurr = editCurrency;

    setActionLoading({
      active: true,
      success: false,
      title: 'Updating Expense...',
      subtitle: `Saving changes for ${savedCurr}${formatAmount(savedAmt)} to ledger & balances...`
    });

    const startTime = Date.now();
    try {
      if (onEditExpense) {
        await onEditExpense(updated);
      }
      const elapsed = Date.now() - startTime;
      if (elapsed < 500) {
        await new Promise(r => setTimeout(r, 500 - elapsed));
      }
      setActionLoading({
        active: true,
        success: true,
        title: 'Expense Updated!',
        subtitle: `Ledger & balances have been recalculated.`
      });
      await new Promise(r => setTimeout(r, 550));
      setEditingExpense(null);
    } catch (err) {
      console.error('Failed to update expense:', err);
    } finally {
      setActionLoading({ active: false, success: false, title: '', subtitle: '' });
      setToastMessage(`Updated "${savedCurr}${formatAmount(savedAmt)} ${savedDesc}"`);
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
    }
  };

  const handleDeleteExpenseAction = async () => {
    if (!editingExpense) return;
    setIsDeletingExpense(true);
    const targetId = editingExpense.id;
    const targetDesc = editingExpense.description;

    setActionLoading({
      active: true,
      success: false,
      title: 'Deleting Expense...',
      subtitle: `Removing ${targetDesc} from shared ledger...`
    });

    const startTime = Date.now();
    try {
      if (onDeleteExpense) {
        await onDeleteExpense(targetId);
      }
      const elapsed = Date.now() - startTime;
      if (elapsed < 500) {
        await new Promise(r => setTimeout(r, 500 - elapsed));
      }
      setActionLoading({
        active: true,
        success: true,
        title: 'Expense Deleted',
        subtitle: `Item removed from ledger and balances updated.`
      });
      await new Promise(r => setTimeout(r, 550));
      setEditingExpense(null);
    } catch (err) {
      console.error('Failed to delete expense:', err);
    } finally {
      setIsDeletingExpense(false);
      setActionLoading({ active: false, success: false, title: '', subtitle: '' });
      setToastMessage(`Deleted "${targetDesc}"`);
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
    }
  };

  const exportCSV = () => {
    const headers = ['Timestamp', 'Type', 'Description', 'Amount', 'Currency', 'PaidBy', 'SplitMode', 'CreatedBy'];
    const expenseRows = expenses.map(e => [
      e.timestamp,
      'Expense',
      `"${e.description.replace(/"/g, '""')}"`,
      e.amount,
      e.currency || '₱',
      e.paidBy,
      e.splitMode,
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
    <div className="w-full max-w-md mx-auto h-screen max-h-screen text-[#1B1B19] flex flex-col p-4 relative font-sans overflow-hidden box-border">
      
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
      <header className="flex justify-between items-center pb-2 pt-0.5 shrink-0">
        <div className="flex items-center space-x-2 min-w-0">
          <h1 className="text-base font-bold tracking-tight text-[#1B1B19] shrink-0">splitnest</h1>
          {(groupTitle || chatId) && (
            <span 
              className="text-[10px] font-mono font-semibold px-2 py-0.5 bg-black/5 text-[#1B1B19]/70 rounded-md border border-black/5 truncate max-w-[130px] sm:max-w-[200px]"
              title={groupTitle || (chatId.startsWith('-') ? `Group ${chatId}` : `Chat ${chatId}`)}
            >
              {groupTitle || (chatId.startsWith('-') ? `Group ${chatId.substring(0, 7)}...` : `Chat ${chatId.substring(0, 6)}...`)}
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
                      {currency}{formatAmount(Math.abs(myNet))}
                    </span>
                    <span className="text-xs text-[#1B1B19]/70 font-medium truncate">
                      {myCredits.length > 0 && myDebts.length === 0 && (
                        `• ${myCredits.map(c => `${c.debtor} owes you ${c.currency}${formatAmount(c.amount)}`).join(', ')}`
                      )}
                      {myDebts.length > 0 && myCredits.length === 0 && (
                        `• You owe ${myDebts.map(d => `${d.creditor} (${d.currency}${formatAmount(d.amount)})`).join(', ')}`
                      )}
                      {myCredits.length > 0 && myDebts.length > 0 && (
                        `• +${currency}${formatAmount(totalOwedToMe)} owed to you, -${currency}${formatAmount(totalOwedByMe)} you owe`
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
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === '' || /^[0-9.,]*$/.test(val)) {
                      setAmount(val);
                    }
                  }}
                  onBlur={() => {
                    if (amount && parseCleanNumber(amount) > 0) {
                      setAmount(formatAmount(parseCleanNumber(amount)));
                    }
                  }}
                  required
                  className="w-full bg-white/60 border border-black/5 px-3.5 py-2.5 rounded-xl text-sm font-semibold font-mono text-[#1B1B19] placeholder-[#1B1B19]/40 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#4A6CF7]/20 transition"
                />
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
                <label className="block text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/50">Split</label>
                {(splitMode === 'Equal' || splitMode === '50/50 Equal') && availableUsers.length > 0 && (
                  <span className="text-[10px] font-mono text-[#1B1B19]/60 font-semibold">
                    {availableUsers.length} members ({parseCleanNumber(amount) > 0 ? `${currency}${formatAmount(parseCleanNumber(amount) / availableUsers.length)} each` : 'divided equally'})
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'Equal', label: 'Equally' },
                  { id: 'Exact Amounts', label: 'Custom amounts' },
                  { id: 'Percentages', label: 'Percentages (%)' },
                  { id: 'Single Payer (100% owed)', label: '100% owed by...' }
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

            {/* Equal Split Live Breakdown & Contributor Selector */}
            {(splitMode === 'Equal' || splitMode === '50/50 Equal') && availableUsers.length > 0 && (
              <div className="bg-white/50 p-3 rounded-2xl border border-black/5 space-y-2.5 text-xs">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-[#1B1B19]/70 font-semibold block">
                      Contributing Members ({selectedEqualMembers.length}/{availableUsers.length})
                    </span>
                    <p className="text-[10px] text-[#1B1B19]/50 font-mono">
                      {selectedEqualMembers.length === availableUsers.length 
                        ? 'All members contribute equally' 
                        : `Splitting equally among ${selectedEqualMembers.length} selected`}
                    </p>
                  </div>
                  {selectedEqualMembers.length !== availableUsers.length && (
                    <button
                      type="button"
                      onClick={handleSelectAllEqualMembers}
                      className="text-[10px] font-mono text-[#4A6CF7] hover:underline font-semibold"
                    >
                      Select All
                    </button>
                  )}
                </div>

                {/* Interactive Member Toggle Chips */}
                <div className="flex flex-wrap gap-1.5">
                  {availableUsers.map(u => {
                    const isSelected = selectedEqualMembers.includes(u);
                    const isPayer = u === (paidBy || activeUser);
                    return (
                      <button
                        key={u}
                        type="button"
                        onClick={() => handleToggleEqualMember(u)}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 border transition cursor-pointer ${
                          isSelected
                            ? 'bg-[#1B1B19] text-white border-[#1B1B19] shadow-xs'
                            : 'bg-white/80 text-[#1B1B19]/40 border-black/10 hover:border-black/20 hover:text-[#1B1B19]/70'
                        }`}
                      >
                        <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold ${
                          isSelected ? 'bg-white text-[#1B1B19]' : 'border border-black/20'
                        }`}>
                          {isSelected ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : null}
                        </div>
                        <span>{u} {isPayer ? '(Payer)' : ''}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Live Per-Person Amount Display */}
                <div className="pt-1.5 border-t border-black/5 flex items-center justify-between font-mono text-[11px]">
                  <span className="text-[#1B1B19]/60">Share per person:</span>
                  <span className="font-bold text-[#1B1B19] text-xs">
                    {parseCleanNumber(amount) > 0 
                      ? `${currency}${formatAmount(parseCleanNumber(amount) / Math.max(selectedEqualMembers.length, 1))} each` 
                      : `${currency}0.00`}
                  </span>
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
                          type="text"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={exactShares[u] ?? ''}
                          onChange={e => {
                            const val = e.target.value;
                            if (val === '' || /^[0-9.,]*$/.test(val)) {
                              setExactShares(prev => ({ ...prev, [u]: val }));
                            }
                          }}
                          onBlur={() => {
                            const val = exactShares[u];
                            if (val && parseCleanNumber(val) > 0) {
                              setExactShares(prev => ({ ...prev, [u]: formatAmount(parseCleanNumber(val)) }));
                            }
                          }}
                          className="w-full bg-white border border-black/10 rounded-lg px-2 py-1 text-xs font-mono font-bold text-[#1B1B19] focus:outline-none focus:ring-1 focus:ring-[#1B1B19]"
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Total Allocation Check */}
                {(() => {
                  const numAmt = parseCleanNumber(amount);
                  const totalAllocated = availableUsers.reduce((sum, u) => sum + parseCleanNumber(exactShares[u]), 0);
                  const diff = numAmt - totalAllocated;
                  const isMatch = Math.abs(diff) < 0.01;

                  return (
                    <div className="flex items-center justify-between text-[11px] font-mono pt-1 border-t border-black/5">
                      <span className="text-[#1B1B19]/60">
                        Allocated: <strong className="text-[#1B1B19]">{currency}{formatAmount(totalAllocated)}</strong> / {currency}{formatAmount(numAmt)}
                      </span>
                      <span className={`font-semibold px-2 py-0.5 rounded ${
                        isMatch ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {isMatch ? '✓ Balanced' : `Diff: ${diff > 0 ? '+' : ''}${currency}${formatAmount(Math.abs(diff))}`}
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
                    const pct = parseCleanNumber(percentShares[u]);
                    const numAmt = parseCleanNumber(amount);
                    const calcAmount = numAmt > 0 ? formatAmount((numAmt * pct) / 100) : '0.00';

                    return (
                      <div key={u} className="bg-white/70 p-2 rounded-xl border border-black/5 space-y-1">
                        <div className="flex justify-between items-center text-[10px] font-mono text-[#1B1B19]/70">
                          <span className="truncate font-semibold max-w-[70px]">{isPayer ? `${u} (Payer)` : u}</span>
                          <span className="text-[#1B1B19]/50 font-mono font-semibold">{currency}{calcAmount}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="0"
                            value={percentShares[u] ?? ''}
                            onChange={e => {
                              const val = e.target.value;
                              if (val === '' || /^[0-9.,]*$/.test(val)) {
                                setPercentShares(prev => ({ ...prev, [u]: val }));
                              }
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
                  const totalPct = availableUsers.reduce((sum, u) => sum + parseCleanNumber(percentShares[u]), 0);
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
                        className={`p-2.5 rounded-xl text-left border transition ${
                          isSelected
                            ? 'bg-[#1B1B19] text-white border-[#1B1B19] shadow-sm'
                            : 'bg-white/70 border-black/5 text-[#1B1B19]/80 hover:bg-white'
                        }`}
                      >
                        <p className="font-semibold text-xs truncate">{u} {isPayer ? '(Payer)' : ''}</p>
                        <p className={`text-[10px] font-mono font-bold mt-0.5 ${isSelected ? 'text-white/90' : 'text-[#1B1B19]/60'}`}>
                          Owes {currency}{parseCleanNumber(amount) > 0 ? formatAmount(parseCleanNumber(amount)) : '0.00'}
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
              <span>Submit Entry ({currency}{parseCleanNumber(amount) > 0 ? ` ${formatAmount(parseCleanNumber(amount))}` : ''})</span>
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
                            {cb.currency}{formatAmount(cb.amount)}
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
                      <span className="font-bold font-mono text-[#1B1B19]">{s.currency || '₱'}{formatAmount(Number(s.amount))}</span>
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
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#1B1B19]/60 font-semibold">
                  Expense History ({expenses.length})
                </div>
                <p className="text-[10px] text-[#1B1B19]/40 font-mono mt-0.5">Tap any expense to edit or adjust split</p>
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
                  <div
                    key={exp.id || idx}
                    className="bg-white/70 hover:bg-white/95 p-3 rounded-2xl border border-black/5 hover:border-black/15 transition shadow-xs flex items-center justify-between text-xs group"
                  >
                    <div
                      onClick={() => handleOpenEditModal(exp)}
                      className="space-y-0.5 min-w-0 flex-1 cursor-pointer pr-2"
                    >
                      <div className="flex items-center space-x-1.5">
                        <span className="font-bold text-[#1B1B19] text-sm truncate">{exp.description}</span>
                        <span className="text-[9px] px-1.5 py-0.2 bg-black/5 text-[#1B1B19]/70 rounded-md font-mono shrink-0">
                          {exp.splitMode === 'Single Payer (100% owed)' 
                            ? '100% Owed' 
                            : (exp.splitMode === 'Equal' || exp.splitMode === '50/50 Equal' || !exp.splitMode) && exp.splitMembers && exp.splitMembers.length > 0 && exp.splitMembers.length < availableUsers.length
                              ? `Equal (${exp.splitMembers.length} of ${availableUsers.length})`
                              : exp.splitMode}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#1B1B19]/70">
                        Paid by <strong className="text-[#1B1B19]">{exp.paidBy}</strong>
                        {exp.singleOwer ? <span> • Owed by <strong className="text-[#1B1B19]">{exp.singleOwer}</strong></span> : null}
                        {(exp.splitMode === 'Equal' || exp.splitMode === '50/50 Equal' || !exp.splitMode) && exp.splitMembers && exp.splitMembers.length > 0 && exp.splitMembers.length < availableUsers.length ? (
                          <span> • Split: <span className="font-medium text-[#1B1B19]">{exp.splitMembers.join(', ')}</span></span>
                        ) : null}
                      </p>
                      <p className="text-[9px] text-[#1B1B19]/40 font-mono">
                        {new Date(exp.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <div className="text-right">
                        <span className="font-bold font-mono text-[#1B1B19] text-sm">
                          {exp.currency || '₱'}{formatAmount(Number(exp.amount))}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(exp)}
                        title="Edit expense"
                        className="p-1.5 rounded-xl bg-black/5 hover:bg-[#1B1B19] text-[#1B1B19] hover:text-white transition flex items-center justify-center border border-black/5 hover:border-[#1B1B19] cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
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
                  {selectedDebtToSettle.currency}{formatAmount(selectedDebtToSettle.amount)}
                </span>
              </div>
            </div>

            {/* Amount input */}
            <div className="space-y-1">
              <label className="block text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/60">
                Amount Paid ({selectedDebtToSettle.currency})
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={settleAmount}
                onChange={e => {
                  const val = e.target.value;
                  if (val === '' || /^[0-9.,]*$/.test(val)) {
                    setSettleAmount(val);
                  }
                }}
                onBlur={() => {
                  if (settleAmount && parseCleanNumber(settleAmount) > 0) {
                    setSettleAmount(formatAmount(parseCleanNumber(settleAmount)));
                  }
                }}
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

      {/* Edit Expense Modal */}
      {editingExpense && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-md z-50 p-4 flex items-center justify-center overflow-y-auto">
          <div className="bg-[#F8F7F4] border border-black/10 rounded-[32px] p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto space-y-4 shadow-2xl my-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-black/5 pb-2.5">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-[#1B1B19] text-white flex items-center justify-center text-xs shadow-md">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-[#1B1B19] text-sm">Edit Expense</h4>
                  <p className="text-[10px] text-[#1B1B19]/60 font-mono">Update details or adjust split</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingExpense(null)}
                className="text-[#1B1B19]/50 hover:text-[#1B1B19] p-1 rounded-lg transition font-mono text-xs"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedExpense} className="space-y-3.5">
              {/* Description Field */}
              <div className="space-y-1">
                <label className="block text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/60 font-semibold">
                  Description
                </label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  placeholder="e.g. Dinner, Groceries, Grab"
                  required
                  className="w-full bg-white border border-black/10 px-3.5 py-2.5 rounded-xl text-xs text-[#1B1B19] focus:outline-none focus:ring-2 focus:ring-[#4A6CF7]/20 placeholder:text-black/30 font-medium"
                />
              </div>

              {/* Amount & Currency */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/60 font-semibold">
                    Amount & Currency
                  </label>
                  <div className="flex items-center space-x-1">
                    {SUPPORTED_CURRENCIES.slice(0, 4).map(c => (
                      <button
                        key={c.symbol}
                        type="button"
                        onClick={() => setEditCurrency(c.symbol)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition ${
                          editCurrency === c.symbol
                            ? 'bg-[#1B1B19] text-white font-bold'
                            : 'bg-black/5 text-[#1B1B19]/60 hover:bg-black/10'
                        }`}
                      >
                        {c.symbol}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono font-bold text-[#1B1B19]/50 text-sm">
                    {editCurrency}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editAmount}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === '' || /^[0-9.,]*$/.test(val)) {
                        setEditAmount(val);
                      }
                    }}
                    onBlur={() => {
                      if (editAmount && parseCleanNumber(editAmount) > 0) {
                        setEditAmount(formatAmount(parseCleanNumber(editAmount)));
                      }
                    }}
                    placeholder="0.00"
                    required
                    className="w-full bg-white border border-black/10 pl-8 pr-3.5 py-2.5 rounded-xl text-sm font-bold font-mono text-[#1B1B19] focus:outline-none focus:ring-2 focus:ring-[#4A6CF7]/20 placeholder:text-black/20"
                  />
                </div>
              </div>

              {/* Paid By Field */}
              <div className="space-y-1">
                <label className="block text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/60 font-semibold">
                  Paid By
                </label>
                <select
                  value={editPaidBy}
                  onChange={e => setEditPaidBy(e.target.value)}
                  className="w-full bg-white border border-black/10 px-3.5 py-2 rounded-xl text-xs font-semibold text-[#1B1B19] focus:outline-none focus:ring-2 focus:ring-[#4A6CF7]/20 cursor-pointer"
                >
                  {availableUsers.map(u => (
                    <option key={u} value={u}>
                      {u} {u === activeUser ? '(You)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Split Mode Selector */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/60 font-semibold">
                  Split Mode
                </label>
                <div className="grid grid-cols-2 gap-1.5 bg-black/5 p-1 rounded-xl">
                  {[
                    { id: 'Equal', label: 'Equal Split' },
                    { id: 'Exact Amounts', label: 'Exact Amounts' },
                    { id: 'Percentages', label: 'Percentages (%)' },
                    { id: 'Single Payer (100% owed)', label: '100% Owed' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setEditSplitMode(tab.id as any)}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-medium transition text-center ${
                        editSplitMode === tab.id
                          ? 'bg-[#1B1B19] text-white font-semibold shadow-xs'
                          : 'text-[#1B1B19]/70 hover:text-[#1B1B19]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Interactive Split Breakdown Area */}
              <div className="bg-white/80 border border-black/5 rounded-2xl p-3 space-y-2">
                {editSplitMode === 'Equal' && (
                  <div className="space-y-2.5">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/70 font-semibold block">
                          Contributing Members ({editEqualSplitMembers.length}/{availableUsers.length})
                        </span>
                        <p className="text-[10px] text-[#1B1B19]/50 font-mono">
                          {editEqualSplitMembers.length === availableUsers.length 
                            ? 'All members contribute equally' 
                            : `Splitting equally among ${editEqualSplitMembers.length} selected`}
                        </p>
                      </div>
                      {editEqualSplitMembers.length !== availableUsers.length && (
                        <button
                          type="button"
                          onClick={handleSelectAllEditEqualMembers}
                          className="text-[10px] font-mono text-[#4A6CF7] hover:underline font-semibold"
                        >
                          Select All
                        </button>
                      )}
                    </div>

                    {/* Member Toggle Chips in Edit Modal */}
                    <div className="flex flex-wrap gap-1.5">
                      {availableUsers.map(u => {
                        const isSelected = editEqualSplitMembers.includes(u);
                        const isPayer = u === editPaidBy;
                        return (
                          <button
                            key={u}
                            type="button"
                            onClick={() => handleToggleEditEqualMember(u)}
                            className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 border transition cursor-pointer ${
                              isSelected
                                ? 'bg-[#1B1B19] text-white border-[#1B1B19] shadow-xs'
                                : 'bg-white/80 text-[#1B1B19]/40 border-black/10 hover:border-black/20 hover:text-[#1B1B19]/70'
                            }`}
                          >
                            <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold ${
                              isSelected ? 'bg-white text-[#1B1B19]' : 'border border-black/20'
                            }`}>
                              {isSelected ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : null}
                            </div>
                            <span>{u} {isPayer ? '(Payer)' : ''}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Live Per-Person Amount in Edit Modal */}
                    <div className="pt-1.5 border-t border-black/5 flex items-center justify-between font-mono text-[11px]">
                      <span className="text-[#1B1B19]/60">Share per person:</span>
                      <span className="font-bold text-[#1B1B19] text-xs">
                        {editCurrency}{formatAmount(parseCleanNumber(editAmount) / Math.max(editEqualSplitMembers.length, 1))} each
                      </span>
                    </div>
                  </div>
                )}

                {editSplitMode === 'Exact Amounts' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase text-[#1B1B19]/60">Exact share per person</span>
                      <button
                        type="button"
                        onClick={() => {
                          const amt = parseCleanNumber(editAmount);
                          const even = (amt / Math.max(availableUsers.length, 1)).toFixed(2);
                          const updated: Record<string, string> = {};
                          availableUsers.forEach(u => { updated[u] = even; });
                          setEditExactShares(updated);
                        }}
                        className="text-[10px] text-[#4A6CF7] font-mono hover:underline"
                      >
                        Distribute Evenly
                      </button>
                    </div>

                    <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                      {availableUsers.map(u => (
                        <div key={u} className="flex items-center justify-between space-x-2 text-xs">
                          <span className="truncate max-w-[120px] font-medium text-[#1B1B19]">{u}</span>
                          <div className="relative w-28">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-[11px] text-[#1B1B19]/40">{editCurrency}</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={editExactShares[u] || ''}
                              placeholder="0.00"
                              onChange={e => {
                                const val = e.target.value;
                                if (val === '' || /^[0-9.,]*$/.test(val)) {
                                  setEditExactShares({ ...editExactShares, [u]: val });
                                }
                              }}
                              className="w-full bg-white border border-black/10 pl-6 pr-2 py-1 rounded-lg text-xs font-mono font-semibold text-[#1B1B19] focus:outline-none focus:ring-1 focus:ring-[#4A6CF7]"
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Exact shares validation summary */}
                    {(() => {
                      const values: string[] = Object.values(editExactShares);
                      const totalEntered: number = values.reduce<number>((sum, v) => sum + parseCleanNumber(v), 0);
                      const targetAmt: number = parseCleanNumber(editAmount);
                      const diff: number = Math.abs(totalEntered - targetAmt);
                      return (
                        <div className="flex items-center justify-between pt-1 border-t border-black/5 text-[10px] font-mono">
                          <span className="text-[#1B1B19]/60">Total allocated:</span>
                          <span className={diff < 0.05 ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold'}>
                            {editCurrency}{formatAmount(totalEntered)} / {editCurrency}{formatAmount(targetAmt)}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {editSplitMode === 'Percentages' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase text-[#1B1B19]/60">Percentage share</span>
                      <button
                        type="button"
                        onClick={() => {
                          const evenPct = (100 / Math.max(availableUsers.length, 1)).toFixed(1);
                          const updated: Record<string, string> = {};
                          availableUsers.forEach(u => { updated[u] = evenPct; });
                          setEditPercentShares(updated);
                        }}
                        className="text-[10px] text-[#4A6CF7] font-mono hover:underline"
                      >
                        Set Equal %
                      </button>
                    </div>

                    <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                      {availableUsers.map(u => (
                        <div key={u} className="flex items-center justify-between space-x-2 text-xs">
                          <span className="truncate max-w-[120px] font-medium text-[#1B1B19]">{u}</span>
                          <div className="relative w-24">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={editPercentShares[u] || ''}
                              placeholder="0"
                              onChange={e => {
                                const val = e.target.value;
                                if (val === '' || /^[0-9.,]*$/.test(val)) {
                                  setEditPercentShares({ ...editPercentShares, [u]: val });
                                }
                              }}
                              className="w-full bg-white border border-black/10 pl-2 pr-6 py-1 rounded-lg text-xs font-mono font-semibold text-[#1B1B19] focus:outline-none focus:ring-1 focus:ring-[#4A6CF7]"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[11px] text-[#1B1B19]/40">%</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Percentage validation summary */}
                    {(() => {
                      const values: string[] = Object.values(editPercentShares);
                      const totalPct: number = values.reduce<number>((sum, v) => sum + parseCleanNumber(v), 0);
                      const isMatch: boolean = Math.abs(totalPct - 100) < 0.5;
                      return (
                        <div className="flex items-center justify-between pt-1 border-t border-black/5 text-[10px] font-mono">
                          <span className="text-[#1B1B19]/60">Total percent:</span>
                          <span className={isMatch ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold'}>
                            {totalPct.toFixed(1)}% / 100%
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {editSplitMode === 'Single Payer (100% owed)' && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono uppercase text-[#1B1B19]/60 block">Who owes 100% of this?</span>
                    <div className="flex flex-wrap gap-1.5">
                      {availableUsers.map(u => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => setEditSingleDebtor(u)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                            editSingleDebtor === u
                              ? 'bg-[#1B1B19] text-white border-[#1B1B19] font-semibold'
                              : 'bg-white border-black/10 text-[#1B1B19]/70 hover:bg-black/5'
                          }`}
                        >
                          {u}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Danger Zone: Delete Option */}
              <div className="pt-1 border-t border-black/5">
                {!showDeleteConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="text-[11px] text-rose-600 hover:text-rose-700 font-medium flex items-center space-x-1 hover:underline transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete this expense from ledger</span>
                  </button>
                ) : (
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-2.5 space-y-2 text-xs">
                    <p className="font-bold text-rose-900 leading-tight">Delete this expense?</p>
                    <p className="text-[11px] text-rose-700">
                      This will permanently remove it from history and recalculate balances.
                    </p>
                    <div className="flex space-x-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1 bg-white hover:bg-rose-100 text-rose-900 border border-rose-200 py-1.5 rounded-lg text-xs font-medium transition"
                      >
                        Keep Expense
                      </button>
                      <button
                        type="button"
                        disabled={isDeletingExpense}
                        onClick={handleDeleteExpenseAction}
                        className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-1.5 rounded-lg text-xs font-semibold shadow-xs transition"
                      >
                        {isDeletingExpense ? 'Deleting...' : 'Yes, Delete'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditingExpense(null)}
                  className="w-full bg-black/5 hover:bg-black/10 text-[#1B1B19] py-2.5 rounded-xl font-semibold text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-full bg-[#1B1B19] hover:bg-black text-white py-2.5 rounded-xl font-semibold text-xs shadow-md transition"
                >
                  Save Changes
                </button>
              </div>
            </form>
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
      <footer className="sticky bottom-0 bg-[#F8F7F4]/95 backdrop-blur-md border-t border-black/10 h-14 min-h-[56px] max-h-[56px] shrink-0 mt-auto z-40 grid grid-cols-3 gap-1.5 p-1.5 text-center font-mono text-[9px] uppercase tracking-wider box-border">
        <button
          type="button"
          onClick={() => setActiveTab('new')}
          className={`h-full min-h-0 rounded-xl transition flex flex-col items-center justify-center select-none ${
            activeTab === 'new'
              ? 'bg-[#1B1B19] text-white font-bold shadow-sm'
              : 'text-[#1B1B19]/60 hover:text-[#1B1B19] hover:bg-black/5'
          }`}
        >
          <PlusCircle className="w-3.5 h-3.5 mb-1 shrink-0" />
          <span className="font-bold leading-none shrink-0">LOG</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('balances')}
          className={`h-full min-h-0 rounded-xl transition flex flex-col items-center justify-center select-none ${
            activeTab === 'balances'
              ? 'bg-[#1B1B19] text-white font-bold shadow-sm'
              : 'text-[#1B1B19]/60 hover:text-[#1B1B19] hover:bg-black/5'
          }`}
        >
          <Scale className="w-3.5 h-3.5 mb-1 shrink-0" />
          <span className="font-bold leading-none shrink-0">SETTLE</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ledger')}
          className={`h-full min-h-0 rounded-xl transition flex flex-col items-center justify-center select-none ${
            activeTab === 'ledger'
              ? 'bg-[#1B1B19] text-white font-bold shadow-sm'
              : 'text-[#1B1B19]/60 hover:text-[#1B1B19] hover:bg-black/5'
          }`}
        >
          <History className="w-3.5 h-3.5 mb-1 shrink-0" />
          <span className="font-bold leading-none shrink-0">HISTORY</span>
        </button>
      </footer>

    </div>
  );
};
