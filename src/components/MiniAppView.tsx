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
  RefreshCw,
  Users,
  UserMinus,
  Trash2,
  Pencil,
  Check,
  X,
  Sparkles,
  Camera,
  Receipt,
  Layers,
  Zap,
  QrCode,
  CreditCard,
  Copy,
  Search,
  ArrowUpDown,
  SlidersHorizontal,
  Eye,
  UploadCloud,
  Building2,
  Wallet,
  ExternalLink
} from 'lucide-react';
import { Expense, Settlement, RegisteredUser, formatAmount, ReceiptItem, ParsedReceiptData, MemberPaymentDetails } from '../types';
import { ReceiptScannerModal } from './ReceiptScannerModal';
import { ItemizedReceiptSplitter } from './ItemizedReceiptSplitter';

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
  onAddMember?: (memberName: string) => Promise<void> | void;
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
  onAddMember,
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
  const [manualMemberInput, setManualMemberInput] = useState('');
  const [isAddingManualMember, setIsAddingManualMember] = useState(false);
  const [splitMode, setSplitMode] = useState<'Equal' | '50/50 Equal' | 'Exact Amounts' | 'Percentages' | 'Single Payer (100% owed)'>('Equal');
  const [equalSplitMembers, setEqualSplitMembers] = useState<string[]>([]);
  const [exactShares, setExactShares] = useState<Record<string, string>>({});
  const [percentShares, setPercentShares] = useState<Record<string, string>>({});
  const [singleDebtor, setSingleDebtor] = useState<string>('');
  
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [logSubTab, setLogSubTab] = useState<'quick' | 'splitter'>('quick');
  const [showItemizedSplitter, setShowItemizedSplitter] = useState(false);
  const [itemizedInitialData, setItemizedInitialData] = useState<ParsedReceiptData | null>(null);
  const [scannedItemsPreview, setScannedItemsPreview] = useState<ReceiptItem[]>([]);

  const handleApplyScannedReceipt = (data: {
    description: string;
    amount: number;
    category: string;
    items: ReceiptItem[];
    currency: string;
  }) => {
    setDescription(data.description);
    setAmount(String(data.amount));
    if (data.currency) setCurrency(data.currency);
    setScannedItemsPreview(data.items || []);
    setSplitMode('Equal');
    
    // Also prepare for itemized modal if the user wants to open it
    setItemizedInitialData({
      merchant: data.description.replace(/^Receipt:\s*/, ''),
      total: data.amount,
      currency: data.currency || '₱',
      category: data.category,
      items: data.items
    });

    setToastMessage(`✨ Scanned ${data.currency}${formatAmount(data.amount)} from ${data.description}`);
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 3000);
  };

  const handleSaveItemizedExpense = async (data: {
    description: string;
    amount: number;
    paidBy: string;
    currency: string;
    category: string;
    shares: Record<string, number>;
    itemsBreakdown: {
      name: string;
      price: number;
      quantity: number;
      assignedTo: string[];
    }[];
    tax: number;
    tip: number;
    discount: number;
  }) => {
    try {
      setActionLoading({
        active: true,
        success: false,
        title: 'Saving Itemized Receipt...',
        subtitle: `Assigning dishes across members & syncing to cloud...`
      });

      await onAddExpense({
        description: data.description,
        amount: data.amount,
        paidBy: data.paidBy || activeUser,
        currency: data.currency || '₱',
        splitMode: 'Exact Amounts',
        shares: data.shares,
        category: data.category || 'Food & Drink',
        createdBy: activeUser,
        chatId: chatId,
        isReceiptSplitter: true,
        merchant: data.description.replace(/^Receipt:\s*/, ''),
        itemsBreakdown: data.itemsBreakdown,
        tax: data.tax,
        tip: data.tip,
        discount: data.discount
      });

      // Clear any stored receipt data to clear the receipt splitter tab
      setItemizedInitialData(null);
      setScannedItemsPreview([]);

      setActionLoading({
        active: true,
        success: true,
        title: 'Receipt Recorded!',
        subtitle: `Split calculated for ${Object.keys(data.shares).length} group members.`
      });
      await new Promise(r => setTimeout(r, 650));

      setToastMessage(`🧾 Saved ${data.description} (${data.currency}${formatAmount(data.amount)}) to Ledger`);
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3500);
    } catch (err: any) {
      console.error('Failed to save itemized receipt:', err);
    } finally {
      setActionLoading({ active: false, success: false, title: '', subtitle: '' });
    }
  };

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

  // Edit Expense Modal State (Standard Quick Edit)
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

  // Edit Receipt Splitter Modal State
  const [editingReceiptExpense, setEditingReceiptExpense] = useState<Expense | null>(null);

  // Member Payment Details & QR State
  const paymentStorageKey = `splitnest_payment_details_${chatId || 'default'}`;
  const [paymentDetails, setPaymentDetails] = useState<Record<string, MemberPaymentDetails>>(() => {
    try {
      const saved = localStorage.getItem(paymentStorageKey);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showPaymentDirectoryModal, setShowPaymentDirectoryModal] = useState(false);
  const [paymentTargetMember, setPaymentTargetMember] = useState<string>('');
  const [paymentBankName, setPaymentBankName] = useState<string>('GCash');
  const [paymentCustomBank, setPaymentCustomBank] = useState<string>('');
  const [paymentAccountName, setPaymentAccountName] = useState<string>('');
  const [paymentAccountNumber, setPaymentAccountNumber] = useState<string>('');
  const [paymentQrCodeUrl, setPaymentQrCodeUrl] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);
  const [viewingQrModal, setViewingQrModal] = useState<{
    memberName: string;
    bankName: string;
    accountName: string;
    accountNumber: string;
    qrCodeUrl: string;
    notes?: string;
  } | null>(null);

  // History / Ledger Search & Sorting State
  const [historySearch, setHistorySearch] = useState('');
  const [historySort, setHistorySort] = useState<'latest' | 'oldest' | 'highest' | 'lowest'>('latest');

  // All Settlements Modal / Page View State & Filters
  const [showAllSettlementsModal, setShowAllSettlementsModal] = useState(false);
  const [settlementFilterPayer, setSettlementFilterPayer] = useState<string>('all');
  const [settlementFilterReceiver, setSettlementFilterReceiver] = useState<string>('all');
  const [settlementSearch, setSettlementSearch] = useState<string>('');

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

  // 1. Registered Telegram members from database
  if (registeredUsers && registeredUsers.length > 0) {
    registeredUsers.forEach(u => {
      const name = (u.firstName || u.name || u.username || '').trim();
      const cleanLower = name.toLowerCase().replace(/^@/, '');
      if (name && !name.toLowerCase().includes('bot') && name !== 'Alex' && name !== 'Sam' && !removedLower.has(cleanLower)) {
        userSet.add(name.trim());
      }
    });
  }

  // 2. Always harvest all active participants from expenses & settlements
  expenses.forEach(e => {
    if (e.paidBy && !e.paidBy.toLowerCase().includes('bot') && e.paidBy !== 'Alex' && e.paidBy !== 'Sam' && !removedLower.has(e.paidBy.toLowerCase().replace(/^@/, ''))) {
      userSet.add(e.paidBy.trim());
    }
    if (e.createdBy && !e.createdBy.toLowerCase().includes('bot') && e.createdBy !== 'Alex' && e.createdBy !== 'Sam' && !removedLower.has(e.createdBy.toLowerCase().replace(/^@/, ''))) {
      userSet.add(e.createdBy.trim());
    }
    if (e.singleOwer && !e.singleOwer.toLowerCase().includes('bot') && !removedLower.has(e.singleOwer.toLowerCase().replace(/^@/, ''))) {
      userSet.add(e.singleOwer.trim());
    }
    if (e.splitMembers && Array.isArray(e.splitMembers)) {
      e.splitMembers.forEach(sm => {
        if (sm && !sm.toLowerCase().includes('bot') && !removedLower.has(sm.toLowerCase().replace(/^@/, ''))) {
          userSet.add(sm.trim());
        }
      });
    }
    if (e.shares && typeof e.shares === 'object') {
      Object.keys(e.shares).forEach(sh => {
        if (sh && !sh.toLowerCase().includes('bot') && !removedLower.has(sh.toLowerCase().replace(/^@/, ''))) {
          userSet.add(sh.trim());
        }
      });
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

  const normalizeMemberName = (input: string | undefined | null): string => {
    if (!input) return availableUsers[0] || 'Member';
    const clean = String(input).trim();
    const cleanNoAt = clean.replace(/^@/, '').toLowerCase();

    // 1. Direct exact match in availableUsers
    const exact = availableUsers.find(u => u === clean);
    if (exact) return exact;

    // 2. Case-insensitive match or match without @
    const matchNoAt = availableUsers.find(u => u.replace(/^@/, '').toLowerCase() === cleanNoAt);
    if (matchNoAt) return matchNoAt;

    // 3. Match from registeredUsers
    if (registeredUsers && registeredUsers.length > 0) {
      const reg = registeredUsers.find(r => 
        (r.firstName && r.firstName.toLowerCase() === cleanNoAt) ||
        (r.username && r.username.replace(/^@/, '').toLowerCase() === cleanNoAt) ||
        (r.name && r.name.toLowerCase() === cleanNoAt)
      );
      if (reg) {
        const regName = reg.name || reg.firstName || reg.username;
        const inPool = availableUsers.find(u => u.toLowerCase() === regName.toLowerCase() || u.replace(/^@/, '').toLowerCase() === regName.replace(/^@/, '').toLowerCase());
        if (inPool) return inPool;
        return regName;
      }
    }

    return clean;
  };

  // Calculate Net Balances grouped by Currency dynamically across all members with exact integer-cent precision
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

    const memberSummariesByCurrency: Record<string, Array<{
      name: string;
      paid: number;
      share: number;
      net: number;
      status: 'creditor' | 'debtor' | 'settled';
    }>> = {};

    currencySet.forEach(curr => {
      const paidCentsMap: Record<string, number> = {};
      const shareCentsMap: Record<string, number> = {};
      const userNetCents: Record<string, number> = {};
      // Pairwise debt matrix: pairwiseOwedCents[Debtor][Creditor] in integer cents
      const pairwiseOwedCents: Record<string, Record<string, number>> = {};

      availableUsers.forEach(u => {
        paidCentsMap[u] = 0;
        shareCentsMap[u] = 0;
        userNetCents[u] = 0;
        pairwiseOwedCents[u] = {};
        availableUsers.forEach(v => {
          pairwiseOwedCents[u][v] = 0;
        });
      });

      const ensureUserInMatrix = (name: string) => {
        if (!pairwiseOwedCents[name]) {
          pairwiseOwedCents[name] = {};
          paidCentsMap[name] = 0;
          shareCentsMap[name] = 0;
          userNetCents[name] = 0;
        }
        availableUsers.forEach(v => {
          if (pairwiseOwedCents[name][v] === undefined) pairwiseOwedCents[name][v] = 0;
          if (pairwiseOwedCents[v] && pairwiseOwedCents[v][name] === undefined) pairwiseOwedCents[v][name] = 0;
        });
      };

      const currExpenses = expenses.filter(e => (e.currency || '₱') === curr);
      const currSettlements = settlements.filter(s => (s.currency || '₱') === curr);

      currExpenses.forEach(e => {
        const totalCents = Math.round((Number(e.amount) || 0) * 100);
        if (totalCents <= 0) return;

        const payer = normalizeMemberName(e.paidBy);
        ensureUserInMatrix(payer);
        paidCentsMap[payer] += totalCents;
        userNetCents[payer] += totalCents;

        const splitMode = e.splitMode || 'Equal';
        const itemMemberSharesInCents: Record<string, number> = {};

        if (splitMode === 'Equal' || splitMode === '50/50 Equal') {
          const rawParticipants = (e.splitMembers && Array.isArray(e.splitMembers) && e.splitMembers.length > 0)
            ? e.splitMembers.map(m => normalizeMemberName(m))
            : availableUsers;
          const participants: string[] = Array.from(new Set(rawParticipants.filter(Boolean) as string[]));
          const numMembers = Math.max(participants.length, 1);
          const baseCents = Math.floor(totalCents / numMembers);
          const remCents = totalCents % numMembers;

          participants.forEach((u, idx) => {
            const share = baseCents + (idx < remCents ? 1 : 0);
            itemMemberSharesInCents[u] = (itemMemberSharesInCents[u] || 0) + share;
          });
        } else if (splitMode === 'Exact Amounts') {
          if (e.shares && Object.keys(e.shares).length > 0) {
            let allocatedCents = 0;
            let highestUser = '';
            let highestAmt = -1;

            Object.entries(e.shares).forEach(([rawUser, shareVal]) => {
              const u = normalizeMemberName(rawUser);
              const c = Math.round((Number(shareVal) || 0) * 100);
              itemMemberSharesInCents[u] = (itemMemberSharesInCents[u] || 0) + c;
              allocatedCents += c;
              if (c > highestAmt) {
                highestAmt = c;
                highestUser = u;
              }
            });

            // Rebalance any rounding discrepancy to highest user
            const diff = totalCents - allocatedCents;
            if (diff !== 0 && highestUser) {
              itemMemberSharesInCents[highestUser] = (itemMemberSharesInCents[highestUser] || 0) + diff;
            }
          } else {
            const userA = payer;
            const otherCandidate = e.createdBy && normalizeMemberName(e.createdBy) !== payer
              ? normalizeMemberName(e.createdBy)
              : availableUsers.find(u => u !== payer) || availableUsers[1] || payer;
            const userB = normalizeMemberName(otherCandidate);

            const shareACents = e.userAShare !== undefined
              ? Math.round(Number(e.userAShare) * 100)
              : Math.floor(totalCents / 2);
            const shareBCents = totalCents - shareACents;

            itemMemberSharesInCents[userA] = (itemMemberSharesInCents[userA] || 0) + shareACents;
            itemMemberSharesInCents[userB] = (itemMemberSharesInCents[userB] || 0) + shareBCents;
          }
        } else if (splitMode === 'Percentages') {
          if (e.percentages && Object.keys(e.percentages).length > 0) {
            let allocatedCents = 0;
            let highestUser = '';
            let highestPct = -1;

            Object.entries(e.percentages).forEach(([rawUser, pctVal]) => {
              const u = normalizeMemberName(rawUser);
              const pct = Number(pctVal) || 0;
              const c = Math.round(totalCents * (pct / 100));
              itemMemberSharesInCents[u] = (itemMemberSharesInCents[u] || 0) + c;
              allocatedCents += c;
              if (pct > highestPct) {
                highestPct = pct;
                highestUser = u;
              }
            });

            const diff = totalCents - allocatedCents;
            if (diff !== 0 && highestUser) {
              itemMemberSharesInCents[highestUser] = (itemMemberSharesInCents[highestUser] || 0) + diff;
            }
          } else {
            const userA = payer;
            const otherCandidate = e.createdBy && normalizeMemberName(e.createdBy) !== payer
              ? normalizeMemberName(e.createdBy)
              : availableUsers.find(u => u !== payer) || availableUsers[1] || payer;
            const userB = normalizeMemberName(otherCandidate);

            const pA = (Number(e.userAPercent) || 50) / 100;
            const shareACents = Math.round(totalCents * pA);
            const shareBCents = totalCents - shareACents;

            itemMemberSharesInCents[userA] = (itemMemberSharesInCents[userA] || 0) + shareACents;
            itemMemberSharesInCents[userB] = (itemMemberSharesInCents[userB] || 0) + shareBCents;
          }
        } else if (splitMode === 'Single Payer (100% owed)') {
          const targetOwer = e.singleOwer || (availableUsers.find(u => u !== payer) || availableUsers[0]);
          const debtor = normalizeMemberName(targetOwer);
          itemMemberSharesInCents[debtor] = (itemMemberSharesInCents[debtor] || 0) + totalCents;
        }

        // Apply shares to Net totals and to Direct Pairwise Debts
        Object.entries(itemMemberSharesInCents).forEach(([debtor, share]) => {
          ensureUserInMatrix(debtor);
          shareCentsMap[debtor] = (shareCentsMap[debtor] || 0) + share;
          userNetCents[debtor] = (userNetCents[debtor] || 0) - share;

          // If debtor is not the payer, debtor owes payer directly
          if (debtor !== payer && share > 0) {
            if (!pairwiseOwedCents[debtor]) pairwiseOwedCents[debtor] = {};
            pairwiseOwedCents[debtor][payer] = (pairwiseOwedCents[debtor][payer] || 0) + share;
          }
        });
      });

      currSettlements.forEach(s => {
        const settleCents = Math.round((Number(s.amount) || 0) * 100);
        if (settleCents <= 0) return;
        const payer = normalizeMemberName(s.payer);
        const receiver = normalizeMemberName(s.receiver);

        ensureUserInMatrix(payer);
        ensureUserInMatrix(receiver);

        userNetCents[payer] += settleCents;
        userNetCents[receiver] -= settleCents;

        // Payer paid receiver, so reduce what payer owes receiver
        if (payer !== receiver) {
          if (!pairwiseOwedCents[payer]) pairwiseOwedCents[payer] = {};
          pairwiseOwedCents[payer][receiver] = (pairwiseOwedCents[payer][receiver] || 0) - settleCents;
        }
      });

      // Compute Overall Member Summaries (Paid, Consumed/Share, Net Position)
      const allMembersInCurrency = Array.from(new Set([
        ...availableUsers,
        ...Object.keys(userNetCents)
      ]));

      const summaries = allMembersInCurrency.map(name => {
        const net = (userNetCents[name] || 0) / 100;
        const paid = (paidCentsMap[name] || 0) / 100;
        const share = (shareCentsMap[name] || 0) / 100;
        return {
          name,
          paid,
          share,
          net,
          status: net >= 0.005 ? ('creditor' as const) : net <= -0.005 ? ('debtor' as const) : ('settled' as const)
        };
      });
      summaries.sort((a, b) => b.net - a.net);
      memberSummariesByCurrency[curr] = summaries;

      // Calculate Exact Bilateral Net Transfers (Direct Pairwise Settlements)
      const pairProcessed = new Set<string>();
      for (let i = 0; i < allMembersInCurrency.length; i++) {
        for (let j = i + 1; j < allMembersInCurrency.length; j++) {
          const userA = allMembersInCurrency[i];
          const userB = allMembersInCurrency[j];
          const pairKey = [userA, userB].sort().join(':::');
          if (pairProcessed.has(pairKey)) continue;
          pairProcessed.add(pairKey);

          const owedAB = pairwiseOwedCents[userA]?.[userB] || 0; // A owes B
          const owedBA = pairwiseOwedCents[userB]?.[userA] || 0; // B owes A
          const netCents = owedAB - owedBA;

          if (netCents > 0) {
            results.push({
              currency: curr,
              debtor: userA,
              creditor: userB,
              amount: netCents / 100,
              summaryText: `${userA} owes ${userB}`
            });
          } else if (netCents < 0) {
            results.push({
              currency: curr,
              debtor: userB,
              creditor: userA,
              amount: Math.abs(netCents) / 100,
              summaryText: `${userB} owes ${userA}`
            });
          }
        }
      }
    });

    results.sort((a, b) => b.amount - a.amount);

    return {
      settlementTransfers: results,
      memberSummaries: memberSummariesByCurrency
    };
  };

  const { settlementTransfers: currencyBalances, memberSummaries } = calculateCurrencyBalances();
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
      createdBy: activeUser,
      chatId: chatId
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
  const activeUserNorm = normalizeMemberName(activeUser);
  const myDebts = activeBalances.filter(
    b => normalizeMemberName(b.debtor) === activeUserNorm
  );
  const myCredits = activeBalances.filter(
    b => normalizeMemberName(b.creditor) === activeUserNorm
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

  // Payment Details Management Helpers
  const handleOpenPaymentModal = (member?: string) => {
    const target = member || activeUser;
    setPaymentTargetMember(target);
    const existing = paymentDetails[target];
    if (existing) {
      setPaymentBankName(existing.bankName || 'GCash');
      setPaymentCustomBank(existing.bankName && !['GCash', 'Maya', 'BPI', 'BDO', 'UnionBank', 'GoTyme', 'SeaBank', 'Cash'].includes(existing.bankName) ? existing.bankName : '');
      setPaymentAccountName(existing.accountName || '');
      setPaymentAccountNumber(existing.accountNumber || '');
      setPaymentQrCodeUrl(existing.qrCodeUrl || '');
      setPaymentNotes(existing.notes || '');
    } else {
      setPaymentBankName('GCash');
      setPaymentCustomBank('');
      setPaymentAccountName(target);
      setPaymentAccountNumber('');
      setPaymentQrCodeUrl('');
      setPaymentNotes('');
    }
    setShowPaymentModal(true);
  };

  const handleSavePaymentForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentTargetMember) return;
    const finalBank = paymentBankName === 'Other' ? (paymentCustomBank.trim() || 'Bank Transfer') : paymentBankName;
    const newDetails: MemberPaymentDetails = {
      memberName: paymentTargetMember,
      bankName: finalBank,
      accountName: paymentAccountName.trim() || paymentTargetMember,
      accountNumber: paymentAccountNumber.trim(),
      qrCodeUrl: paymentQrCodeUrl || undefined,
      notes: paymentNotes.trim() || undefined,
      updatedAt: new Date().toISOString()
    };
    const updated = { ...paymentDetails, [paymentTargetMember]: newDetails };
    setPaymentDetails(updated);
    try {
      localStorage.setItem(paymentStorageKey, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save payment info', e);
    }
    setShowPaymentModal(false);
    setToastMessage(`💳 Payment details saved for ${paymentTargetMember}!`);
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 3000);
  };

  const handleRemovePaymentDetails = (member: string) => {
    const updated = { ...paymentDetails };
    delete updated[member];
    setPaymentDetails(updated);
    try {
      localStorage.setItem(paymentStorageKey, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to remove payment info', e);
    }
    setShowPaymentModal(false);
    setToastMessage(`Removed payment info for ${member}`);
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 2500);
  };

  const handleQrFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (!result) return;
      
      const img = new Image();
      img.onload = () => {
        const maxDim = 800;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.85);
          setPaymentQrCodeUrl(compressed);
        } else {
          setPaymentQrCodeUrl(result);
        }
      };
      img.onerror = () => {
        setPaymentQrCodeUrl(result);
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  const handleCopyText = (text: string, label: string = 'Account number copied!') => {
    if (!text) return;
    try {
      navigator.clipboard.writeText(text);
      setCopiedNotification(label);
      setTimeout(() => setCopiedNotification(null), 2000);
    } catch (e) {
      console.error('Failed to copy', e);
    }
  };

  // Edit Expense Modal Handlers
  const handleOpenEditModal = (exp: Expense) => {
    const isReceipt = Boolean(
      exp.isReceiptSplitter || 
      (exp.itemsBreakdown && exp.itemsBreakdown.length > 0) || 
      (exp.description && exp.description.startsWith('Receipt:'))
    );

    if (isReceipt) {
      setEditingReceiptExpense(exp);
      return;
    }

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

  const handleSaveEditedReceipt = async (data: {
    description: string;
    amount: number;
    paidBy: string;
    currency: string;
    category: string;
    shares: Record<string, number>;
    itemsBreakdown: {
      name: string;
      price: number;
      quantity: number;
      assignedTo: string[];
    }[];
    tax: number;
    tip: number;
    discount: number;
  }) => {
    if (!editingReceiptExpense) return;
    try {
      setActionLoading({
        active: true,
        success: false,
        title: 'Updating Receipt Split...',
        subtitle: `Recalculating member shares & updating ledger...`
      });

      const updated: Expense = {
        ...editingReceiptExpense,
        description: data.description,
        amount: data.amount,
        paidBy: data.paidBy || activeUser,
        currency: data.currency || '₱',
        splitMode: 'Exact Amounts',
        shares: data.shares,
        category: data.category || 'Food & Drink',
        isReceiptSplitter: true,
        merchant: data.description.replace(/^Receipt:\s*/, ''),
        itemsBreakdown: data.itemsBreakdown,
        tax: data.tax,
        tip: data.tip,
        discount: data.discount
      };

      if (onEditExpense) {
        await onEditExpense(updated);
      }

      setEditingReceiptExpense(null);

      setActionLoading({
        active: true,
        success: true,
        title: 'Receipt Updated!',
        subtitle: 'Ledger and balance totals have been recomputed.'
      });
      await new Promise(r => setTimeout(r, 600));

      setToastMessage(`🧾 Updated ${data.description} (${data.currency}${formatAmount(data.amount)})`);
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
    } catch (err) {
      console.error('Failed to update receipt expense:', err);
    } finally {
      setActionLoading({ active: false, success: false, title: '', subtitle: '' });
    }
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
    const targetExp = editingExpense || editingReceiptExpense;
    if (!targetExp) return;
    setIsDeletingExpense(true);
    const targetId = targetExp.id;
    const targetDesc = targetExp.description;

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
      setEditingReceiptExpense(null);
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
          {groupTitle && groupTitle.trim() ? (
            <span 
              className="text-[10px] font-mono font-semibold px-2 py-0.5 bg-black/5 text-[#1B1B19]/70 rounded-md border border-black/5 truncate max-w-[130px] sm:max-w-[200px]"
              title={groupTitle}
            >
              {groupTitle}
            </span>
          ) : (
            <div 
              className="h-5 w-20 sm:w-28 bg-black/10 rounded-md animate-pulse shrink-0 border border-black/5" 
              title="Loading group name..."
            />
          )}
        </div>

        <div className="flex items-center space-x-2">
          {availableUsers.length > 1 ? (
            <button
              type="button"
              onClick={() => setShowMembersModal(true)}
              title={`View & manage ${availableUsers.length} group members`}
              className="text-[10px] font-mono font-medium px-2.5 py-1 bg-black/5 hover:bg-black/10 rounded-full text-[#1B1B19]/70 hover:text-[#1B1B19] flex items-center space-x-1 border border-black/5 transition cursor-pointer"
            >
              <Users className="w-3 h-3 text-[#1B1B19]/60" />
              <span>{availableUsers.length}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowMembersModal(true)}
              title="Loading group members..."
              className="h-6 w-10 bg-black/10 rounded-full animate-pulse flex items-center justify-center space-x-1 px-2 py-1 border border-black/5 cursor-pointer"
            >
              <Users className="w-3 h-3 text-[#1B1B19]/30" />
              <div className="h-2 w-2.5 bg-black/15 rounded-full" />
            </button>
          )}

          {/* Clean Status Dot Indicator */}
          <div
            title={isOnlineGas ? 'Connected & Synced with Google Sheets' : 'Connecting to Google Sheets...'}
            className="flex items-center justify-center p-1 cursor-default"
          >
            <span
              className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                isOnlineGas
                  ? 'bg-emerald-500 ring-4 ring-emerald-500/20'
                  : 'bg-amber-400 animate-pulse ring-4 ring-amber-400/20'
              }`}
            />
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
          <div className="space-y-3">
            
            {/* Sub-tabs under Log: Quick Entry vs Receipt Splitter */}
            <div className="bg-black/5 p-1 rounded-2xl flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider font-semibold">
              <button
                type="button"
                onClick={() => setLogSubTab('quick')}
                className={`flex-1 py-2 px-3 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  logSubTab === 'quick'
                    ? 'bg-white text-[#1B1B19] shadow-xs font-bold'
                    : 'text-[#1B1B19]/60 hover:text-[#1B1B19]'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span>Quick Entry</span>
              </button>
              <button
                type="button"
                onClick={() => setLogSubTab('splitter')}
                className={`flex-1 py-2 px-3 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  logSubTab === 'splitter'
                    ? 'bg-white text-[#1B1B19] shadow-xs font-bold'
                    : 'text-[#1B1B19]/60 hover:text-[#1B1B19]'
                }`}
              >
                <Receipt className="w-3.5 h-3.5 text-[#4A6CF7]" />
                <span>Receipt Splitter</span>
              </button>
            </div>

            {logSubTab === 'quick' && (
              <form onSubmit={handleSingleSubmit} className="bg-white/70 backdrop-blur-md border border-black/5 rounded-[24px] p-5 shadow-sm space-y-3">
            {scannedItemsPreview.length > 0 && (
              <div className="p-2.5 bg-indigo-50/80 border border-indigo-100 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-indigo-700 font-semibold">
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    {scannedItemsPreview.length} Parsed Items from Receipt
                  </span>
                  <button 
                    type="button"
                    onClick={() => setScannedItemsPreview([])}
                    className="text-indigo-400 hover:text-indigo-600 text-[10px]"
                  >
                    Clear items
                  </button>
                </div>
                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                  {scannedItemsPreview.map((it, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 text-[10px] bg-white border border-indigo-200/60 px-2 py-0.5 rounded-md text-indigo-900 font-medium">
                      <span>{it.name}</span>
                      <span className="font-bold font-mono text-indigo-600">{currency}{formatAmount(it.price)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

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
                  className="w-full bg-white/60 border border-black/5 px-3.5 py-2.5 rounded-xl text-sm font-semibold font-mono text-left text-[#1B1B19] placeholder-[#1B1B19]/40 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#4A6CF7]/20 transition"
                />
              </div>
            </div>

            {/* Paid By Selector */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="block text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/60 font-semibold">
                  Paid By ({availableUsers.length} members)
                </label>
                <button
                  type="button"
                  onClick={() => setShowMembersModal(true)}
                  className="text-[10px] font-mono text-[#1B1B19]/60 hover:text-[#1B1B19] font-medium flex items-center space-x-1 cursor-pointer"
                >
                  <Users className="w-2.5 h-2.5" />
                  <span>Manage</span>
                </button>
              </div>

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
              className="w-full bg-[#18181B] hover:bg-black text-white font-semibold py-3.5 px-6 rounded-full text-sm transition shadow-sm active:scale-[0.99] flex items-center justify-center gap-2 mt-2 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>Submit Entry</span>
            </button>
          </form>
        )}

        {logSubTab === 'splitter' && (
          <ItemizedReceiptSplitter
            onSaveToLedger={handleSaveItemizedExpense}
            groupMembers={availableUsers}
            initialReceiptData={itemizedInitialData}
            defaultPayer={paidBy || activeUser}
            defaultCurrency={currency}
            onOpenScanner={() => setShowScannerModal(true)}
            onSwitchToQuickEntry={() => setLogSubTab('quick')}
            gasUrl={gasUrl}
          />
        )}
          </div>
        )}

        {/* TAB 2: BALANCES & INDIVIDUAL SETTLEMENTS */}
        {activeTab === 'balances' && (
          <div className="space-y-3">
            {/* 1. Member Balance Pairings */}
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
                  {activeBalances.map((cb, i) => {
                    const isDebtor = cb.debtor.toLowerCase() === activeUser.toLowerCase();
                    const isCreditor = cb.creditor.toLowerCase() === activeUser.toLowerCase();

                    return (
                      <div 
                        key={i} 
                        className={`p-3.5 rounded-2xl border transition flex items-center justify-between gap-2.5 ${
                          isDebtor 
                            ? 'bg-rose-50/60 border-rose-200/60' 
                            : isCreditor 
                              ? 'bg-emerald-50/60 border-emerald-200/60' 
                              : 'bg-white/60 border-black/5'
                        }`}
                      >
                        <div className="min-w-0">
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
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-bold font-mono text-sm text-[#1B1B19]">
                            {cb.currency}{formatAmount(cb.amount)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenIndividualSettle(cb)}
                            className="bg-[#1B1B19] hover:bg-black text-white px-3 py-1.5 rounded-xl font-semibold text-xs shadow-sm transition active:scale-95 flex items-center gap-1 cursor-pointer"
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

            {/* 2. Group Member Net Balances Breakdown (Who Paid What & Net Positions) */}
            <div className="bg-white/70 backdrop-blur-md border border-black/5 rounded-[24px] p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-black/5 pb-2">
                <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#1B1B19]/60 font-semibold">
                  Member Net Balances
                </div>
                <span className="text-[10px] font-mono text-[#1B1B19]/40">
                  {Object.keys(memberSummaries).length > 0 ? `${Object.values(memberSummaries)[0]?.length || 0} members` : ''}
                </span>
              </div>

              {Object.entries(memberSummaries).map(([curr, summaries]) => (
                <div key={curr} className="space-y-2">
                  {summaries.length === 0 ? (
                    <p className="text-xs text-[#1B1B19]/50 italic text-center py-2">No active balances</p>
                  ) : (
                    summaries.map((m, idx) => {
                      const isMe = normalizeMemberName(m.name) === activeUserNorm;
                      return (
                        <div
                          key={idx}
                          className={`p-3 rounded-2xl border flex items-center justify-between gap-3 text-xs transition ${
                            isMe
                              ? 'bg-amber-50/50 border-amber-200/80 shadow-xs'
                              : 'bg-white/60 border-black/5'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-[#1B1B19]">
                                {m.name} {isMe && <span className="text-[10px] text-amber-700 font-semibold font-mono">(You)</span>}
                              </span>
                            </div>
                            <p className="text-[10px] text-[#1B1B19]/50 font-mono mt-0.5">
                              Paid {curr}{formatAmount(m.paid)} • Share {curr}{formatAmount(m.share)}
                            </p>
                          </div>

                          <div className="text-right shrink-0">
                            {m.status === 'creditor' ? (
                              <div className="text-right">
                                <span className="font-bold font-mono text-emerald-600 text-sm">
                                  +{curr}{formatAmount(m.net)}
                                </span>
                                <span className="block text-[9px] font-mono text-emerald-700 font-semibold uppercase">
                                  gets back
                                </span>
                              </div>
                            ) : m.status === 'debtor' ? (
                              <div className="text-right">
                                <span className="font-bold font-mono text-rose-600 text-sm">
                                  -{curr}{formatAmount(Math.abs(m.net))}
                                </span>
                                <span className="block text-[9px] font-mono text-rose-700 font-semibold uppercase">
                                  owes
                                </span>
                              </div>
                            ) : (
                              <div className="text-right">
                                <span className="font-bold font-mono text-gray-500 text-xs">
                                  {curr}0.00
                                </span>
                                <span className="block text-[9px] font-mono text-gray-400 font-semibold uppercase">
                                  settled
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ))}
            </div>

            {/* 3. Recent Settlements (Display up to 5 with View All button) */}
            <div className="bg-white/70 backdrop-blur-md border border-black/5 p-4 rounded-[20px] shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#1B1B19]/60 font-semibold flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-[#1B1B19]" />
                  <span>Settlement History ({settlements.length})</span>
                </div>
                {settlements.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAllSettlementsModal(true)}
                    className="text-[10px] font-mono text-[#4A6CF7] hover:underline font-bold flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>View all ({settlements.length})</span>
                    <span>→</span>
                  </button>
                )}
              </div>

              {settlements.length === 0 ? (
                <p className="text-xs text-[#1B1B19]/50 italic text-center py-2">No settlements recorded yet</p>
              ) : (
                <>
                  <div className="space-y-1.5">
                    {settlements.slice(0, 5).map((s, i) => (
                      <div key={i} className="bg-white/70 hover:bg-white p-2.5 rounded-xl border border-black/5 flex items-center justify-between text-xs transition">
                        <div>
                          <div className="font-semibold text-[#1B1B19]">
                            <span>{s.payer}</span>
                            <span className="text-[#1B1B19]/50 font-normal px-1">paid</span>
                            <span className="text-emerald-700 font-semibold">{s.receiver}</span>
                          </div>
                          <p className="text-[10px] text-[#1B1B19]/50 font-mono mt-0.5">
                            {s.method ? `via ${s.method} • ` : ''}{new Date(s.timestamp).toLocaleDateString()}
                          </p>
                        </div>
                        <span className="font-bold font-mono text-[#1B1B19] text-sm">{s.currency || '₱'}{formatAmount(Number(s.amount))}</span>
                      </div>
                    ))}
                  </div>

                  {settlements.length > 5 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllSettlementsModal(true)}
                      className="w-full py-2 bg-black/5 hover:bg-black/10 active:scale-[0.99] text-[#1B1B19] rounded-xl text-xs font-mono font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 text-[#1B1B19]/70" />
                      <span>View All Settlements ({settlements.length})</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowAllSettlementsModal(true)}
                      className="w-full py-1.5 text-center text-[10px] font-mono text-[#4A6CF7] hover:underline font-semibold cursor-pointer"
                    >
                      Filter & Search Settlements →
                    </button>
                  )}
                </>
              )}
            </div>

            {/* 3. Member Payment Details & QR Codes Container */}
            {(() => {
              const configuredMembers = availableUsers.filter(u => Boolean(paymentDetails[u]));
              const unconfiguredMembersCount = availableUsers.length - configuredMembers.length;

              return (
                <div className="bg-white/70 backdrop-blur-md border border-black/5 rounded-[24px] p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between border-b border-black/5 pb-2">
                    <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#1B1B19]/60 font-semibold flex items-center gap-1.5">
                      <QrCode className="w-3.5 h-3.5 text-[#1B1B19]" />
                      <span>Payment details</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPaymentDirectoryModal(true)}
                      className="bg-[#1B1B19] hover:bg-black text-white px-2.5 py-1 rounded-xl text-xs font-mono font-medium flex items-center space-x-1 shadow-xs transition cursor-pointer"
                    >
                      <PlusCircle className="w-3 h-3 text-emerald-400" />
                      <span>Manage</span>
                    </button>
                  </div>

                  {configuredMembers.length === 0 ? (
                    <div className="p-4 rounded-2xl border border-dashed border-black/10 bg-white/40 text-center space-y-2">
                      <p className="text-xs text-[#1B1B19]/70 font-medium">No payment accounts or QR codes saved yet.</p>
                      <p className="text-[10px] text-[#1B1B19]/40 font-mono">Add your GCash, Maya, or bank details to speed up settlements for everyone.</p>
                      <button
                        type="button"
                        onClick={() => setShowPaymentDirectoryModal(true)}
                        className="inline-flex items-center gap-1 bg-black/5 hover:bg-black/10 text-[#1B1B19] text-xs font-mono px-3 py-1.5 rounded-xl transition cursor-pointer font-semibold"
                      >
                        <PlusCircle className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Set Up Payment Info</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {configuredMembers.map((member) => {
                          const details = paymentDetails[member];
                          const isCurrent = member === activeUser;

                          return (
                            <div
                              key={member}
                              className="p-3 rounded-2xl border border-black/5 bg-white/80 hover:bg-white transition space-y-2 shadow-xs"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-xs text-[#1B1B19] truncate">{member}</span>
                                    {isCurrent && (
                                      <span className="text-[8px] font-mono px-1 py-0.2 bg-[#4A6CF7]/10 text-[#4A6CF7] rounded font-semibold">
                                        You
                                      </span>
                                    )}
                                    <span className="text-[9px] font-mono px-1.5 py-0.2 bg-[#1B1B19] text-white rounded font-bold">
                                      {details.bankName}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-[#1B1B19]/70 font-mono mt-0.5 truncate">
                                    {details.accountName}
                                  </p>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  {details.qrCodeUrl && (
                                    <button
                                      type="button"
                                      onClick={() => setViewingQrModal({
                                        memberName: member,
                                        bankName: details.bankName,
                                        accountName: details.accountName,
                                        accountNumber: details.accountNumber,
                                        qrCodeUrl: details.qrCodeUrl!,
                                        notes: details.notes
                                      })}
                                      title="View full QR"
                                      className="p-1.5 bg-black/5 hover:bg-black/10 rounded-lg text-[#1B1B19] transition cursor-pointer"
                                    >
                                      <QrCode className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenPaymentModal(member)}
                                    title="Edit payment details"
                                    className="p-1.5 bg-black/5 hover:bg-black/10 rounded-lg text-[#1B1B19] transition cursor-pointer"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Account Number with 1-click copy */}
                              <div className="flex items-center justify-between bg-black/5 px-2.5 py-1.5 rounded-xl text-xs font-mono">
                                <span className="font-bold text-[#1B1B19] tracking-wider truncate">
                                  {details.accountNumber || 'No account number'}
                                </span>
                                {details.accountNumber && (
                                  <button
                                    type="button"
                                    onClick={() => handleCopyText(details.accountNumber, `Copied ${member}'s ${details.bankName} number!`)}
                                    className="text-[10px] text-[#4A6CF7] hover:underline font-semibold flex items-center gap-1 shrink-0 ml-2 cursor-pointer"
                                  >
                                    <Copy className="w-3 h-3" />
                                    <span>{copiedNotification?.includes(member) ? 'Copied!' : 'Copy'}</span>
                                  </button>
                                )}
                              </div>

                              {/* Notes badge if any */}
                              {details.notes && (
                                <p className="text-[10px] text-[#1B1B19]/60 italic truncate">
                                  Note: {details.notes}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Footer link to manage all members / unconfigured */}
                      <div className="pt-1 flex items-center justify-between text-[11px] font-mono text-[#1B1B19]/60 px-1">
                        <span>
                          {unconfiguredMembersCount > 0 
                            ? `${unconfiguredMembersCount} member${unconfiguredMembersCount === 1 ? '' : 's'} without payment info` 
                            : 'All group members configured'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowPaymentDirectoryModal(true)}
                          className="text-[#4A6CF7] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <span>View all</span>
                          <span>→</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* TAB 3: LEDGER */}
        {activeTab === 'ledger' && (
          <div className="bg-white/70 backdrop-blur-md border border-black/5 rounded-[24px] p-5 shadow-sm space-y-3.5 min-h-[500px]">
            {/* Search and Sort Controls - Sticky Header */}
            <div className="sticky top-2 z-20 bg-white/95 backdrop-blur-md p-2 -mx-2 rounded-2xl border border-black/5 shadow-xs space-y-1.5">
              <div className="flex items-center gap-2">
                {/* Search Bar */}
                <div className="relative flex-1 min-w-0">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#1B1B19]/40" />
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Search expense, payer, item..."
                    className="w-full bg-white/90 border border-black/10 pl-8 pr-7 py-2 rounded-xl text-xs font-mono text-[#1B1B19] focus:outline-none focus:ring-1 focus:ring-[#1B1B19] placeholder:text-black/30"
                  />
                  {historySearch && (
                    <button
                      type="button"
                      onClick={() => setHistorySearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#1B1B19]/40 hover:text-[#1B1B19] text-xs font-mono cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Collapsed Sort Dropdown Beside Search Bar */}
                <div className="relative shrink-0">
                  <div className="flex items-center bg-white/90 border border-black/10 rounded-xl px-2.5 py-2 text-xs font-mono text-[#1B1B19] focus-within:ring-1 focus-within:ring-[#1B1B19] shadow-2xs">
                    <ArrowUpDown className="w-3.5 h-3.5 text-[#1B1B19]/50 mr-1.5 shrink-0" />
                    <select
                      value={historySort}
                      onChange={(e) => setHistorySort(e.target.value as any)}
                      className="bg-transparent text-xs font-mono text-[#1B1B19] focus:outline-none cursor-pointer pr-1 font-medium"
                    >
                      <option value="latest">Latest</option>
                      <option value="oldest">Oldest</option>
                      <option value="highest">Highest ₱</option>
                      <option value="lowest">Lowest ₱</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Filter status banner */}
              {historySearch.trim() && (
                <div className="text-[10px] font-mono text-[#1B1B19]/60 flex items-center justify-between px-1 pt-0.5">
                  <span>Showing {
                    expenses.filter(exp => {
                      const q = historySearch.toLowerCase().trim();
                      const matchDesc = (exp.description || '').toLowerCase().includes(q);
                      const matchPayer = (exp.paidBy || '').toLowerCase().includes(q);
                      const matchCat = (exp.category || '').toLowerCase().includes(q);
                      const matchItems = exp.itemsBreakdown?.some(it => (it.name || '').toLowerCase().includes(q));
                      return matchDesc || matchPayer || matchCat || matchItems;
                    }).length
                  } matches</span>
                  <button
                    type="button"
                    onClick={() => setHistorySearch('')}
                    className="text-[#4A6CF7] hover:underline cursor-pointer"
                  >
                    Clear filter
                  </button>
                </div>
              )}
            </div>

            {/* Expense List */}
            {expenses.length === 0 ? (
              <div className="text-center py-12 text-[#1B1B19]/50 text-xs font-mono">
                <p>No expenses logged yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {expenses
                  .filter(exp => {
                    if (!historySearch.trim()) return true;
                    const q = historySearch.toLowerCase().trim();
                    const matchDesc = (exp.description || '').toLowerCase().includes(q);
                    const matchPayer = (exp.paidBy || '').toLowerCase().includes(q);
                    const matchCat = (exp.category || '').toLowerCase().includes(q);
                    const matchItems = exp.itemsBreakdown?.some(it => (it.name || '').toLowerCase().includes(q));
                    return matchDesc || matchPayer || matchCat || matchItems;
                  })
                  .sort((a, b) => {
                    if (historySort === 'latest') {
                      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
                    }
                    if (historySort === 'oldest') {
                      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
                    }
                    if (historySort === 'highest') {
                      return (Number(b.amount) || 0) - (Number(a.amount) || 0);
                    }
                    if (historySort === 'lowest') {
                      return (Number(a.amount) || 0) - (Number(b.amount) || 0);
                    }
                    return 0;
                  })
                  .map((exp, idx) => {
                    const isReceipt = Boolean(
                      exp.isReceiptSplitter ||
                      (exp.itemsBreakdown && exp.itemsBreakdown.length > 0) ||
                      (exp.description && exp.description.startsWith('Receipt:'))
                    );

                    return (
                      <div
                        key={exp.id || idx}
                        className="bg-white/80 hover:bg-white p-3.5 rounded-2xl border border-black/5 hover:border-black/15 transition shadow-xs flex items-center justify-between text-xs group"
                      >
                        <div
                          onClick={() => handleOpenEditModal(exp)}
                          className="space-y-1 min-w-0 flex-1 cursor-pointer pr-2"
                        >
                          <div className="flex items-center space-x-1.5 flex-wrap">
                            <span className="font-bold text-[#1B1B19] text-sm truncate">{exp.description}</span>
                            {isReceipt && (
                              <span className="text-[9px] px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded-md font-mono font-bold shrink-0 flex items-center gap-0.5">
                                <Receipt className="w-2.5 h-2.5" />
                                <span>Itemized Split</span>
                              </span>
                            )}
                            <span className="text-[9px] px-1.5 py-0.2 bg-black/5 text-[#1B1B19]/70 rounded-md font-mono shrink-0">
                              {exp.splitMode === 'Single Payer (100% owed)' 
                                ? '100% Owed' 
                                : (exp.splitMode === 'Equal' || exp.splitMode === '50/50 Equal' || !exp.splitMode) && exp.splitMembers && exp.splitMembers.length > 0 && exp.splitMembers.length < availableUsers.length
                                  ? `Equal (${exp.splitMembers.length} of ${availableUsers.length})`
                                  : exp.splitMode || 'Equal'}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#1B1B19]/70">
                            Paid by <strong className="text-[#1B1B19]">{exp.paidBy}</strong>
                            {exp.singleOwer ? <span> • Owed by <strong className="text-[#1B1B19]">{exp.singleOwer}</strong></span> : null}
                            {(exp.splitMode === 'Equal' || exp.splitMode === '50/50 Equal' || !exp.splitMode) && exp.splitMembers && exp.splitMembers.length > 0 && exp.splitMembers.length < availableUsers.length ? (
                              <span> • Split: <span className="font-medium text-[#1B1B19]">{exp.splitMembers.join(', ')}</span></span>
                            ) : null}
                            {exp.itemsBreakdown && exp.itemsBreakdown.length > 0 ? (
                              <span className="text-[10px] text-[#1B1B19]/50 block font-mono">
                                {exp.itemsBreakdown.length} dish{exp.itemsBreakdown.length === 1 ? '' : 'es'} itemized
                              </span>
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
                            title={isReceipt ? "Edit receipt split" : "Edit expense"}
                            className="p-1.5 rounded-xl bg-black/5 hover:bg-[#1B1B19] text-[#1B1B19] hover:text-white transition flex items-center justify-center border border-black/5 hover:border-[#1B1B19] cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Individual Settlement Full Page */}
      {selectedDebtToSettle && (
        <div className="fixed inset-0 bg-[#F8F7F4] z-50 flex flex-col animate-in fade-in duration-150">
          {/* Top Header with (X) button */}
          <header className="px-5 py-4 border-b border-black/5 bg-[#F8F7F4]/95 backdrop-blur-md flex items-center justify-between sticky top-0 z-20 shrink-0">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#1B1B19] text-white flex items-center justify-center text-sm shadow-md">
                🤝
              </div>
              <div>
                <h4 className="font-bold text-[#1B1B19] text-sm">
                  Settle Balance
                </h4>
                <p className="text-[10px] text-[#1B1B19]/60 font-mono">
                  Record Member Payment
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDebtToSettle(null)}
              className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 text-[#1B1B19]/70 hover:text-[#1B1B19] flex items-center justify-center transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </header>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 max-w-xl mx-auto w-full">
            {/* Debt summary card */}
            <div className="bg-white/80 p-3.5 rounded-2xl border border-black/5 space-y-1.5 text-xs shadow-2xs">
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

            {/* Recipient's Bank / QR Code Details for seamless settlement */}
            {(() => {
              const creditorDetails = paymentDetails[selectedDebtToSettle.creditor];
              if (creditorDetails) {
                return (
                  <div className="bg-emerald-50/80 border border-emerald-200/80 p-3 rounded-2xl space-y-2 text-xs">
                    <div className="flex items-center justify-between border-b border-emerald-200/60 pb-1.5">
                      <span className="font-mono text-[10px] uppercase font-bold text-emerald-900 flex items-center gap-1">
                        <CreditCard className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Pay To: {selectedDebtToSettle.creditor} ({creditorDetails.bankName})</span>
                      </span>
                      <span className="text-[9px] font-mono px-1.5 py-0.2 bg-emerald-200/80 text-emerald-900 rounded font-bold">
                        Account on File
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10px] text-emerald-800/70 font-mono">Account Name</p>
                        <p className="font-bold text-emerald-950">{creditorDetails.accountName}</p>
                      </div>
                      {creditorDetails.qrCodeUrl && (
                        <button
                          type="button"
                          onClick={() => setViewingQrModal({
                            memberName: selectedDebtToSettle.creditor,
                            bankName: creditorDetails.bankName,
                            accountName: creditorDetails.accountName,
                            accountNumber: creditorDetails.accountNumber,
                            qrCodeUrl: creditorDetails.qrCodeUrl!,
                            notes: creditorDetails.notes
                          })}
                          className="flex items-center gap-1 bg-[#1B1B19] text-white px-2.5 py-1 rounded-lg text-[10px] font-mono font-medium shadow-xs hover:bg-black transition cursor-pointer"
                        >
                          <QrCode className="w-3 h-3 text-emerald-400" />
                          <span>View QR</span>
                        </button>
                      )}
                    </div>

                    {creditorDetails.accountNumber && (
                      <div className="flex items-center justify-between bg-white/90 px-2.5 py-1.5 rounded-xl font-mono text-xs border border-emerald-200/60">
                        <span className="font-bold text-emerald-950">{creditorDetails.accountNumber}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyText(creditorDetails.accountNumber, `Copied ${selectedDebtToSettle.creditor}'s account number!`)}
                          className="text-[#4A6CF7] hover:underline font-semibold flex items-center gap-1 text-[10px] cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          <span>{copiedNotification ? '✓ Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    )}

                    {creditorDetails.notes && (
                      <p className="text-[10px] text-emerald-900/70 italic">
                        Note from {selectedDebtToSettle.creditor}: {creditorDetails.notes}
                      </p>
                    )}
                  </div>
                );
              }

              return (
                <div className="bg-amber-50/70 border border-amber-200/80 p-2.5 rounded-2xl text-xs space-y-1.5">
                  <p className="text-[11px] text-amber-900 font-medium">
                    No payment details saved for <strong>{selectedDebtToSettle.creditor}</strong>.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleOpenPaymentModal(selectedDebtToSettle.creditor)}
                    className="text-[10px] font-mono text-amber-900 bg-amber-200/60 hover:bg-amber-200 px-2 py-1 rounded-lg font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    <PlusCircle className="w-3 h-3" />
                    <span>+ Add {selectedDebtToSettle.creditor}'s QR / Bank Info</span>
                  </button>
                </div>
              );
            })()}

            {/* Amount input */}
            <div className="space-y-1">
              <label className="block text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/60 font-semibold">
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
                className="w-full bg-white border border-black/10 px-3.5 py-2.5 rounded-xl text-sm font-semibold font-mono text-[#1B1B19] focus:outline-none focus:ring-2 focus:ring-[#4A6CF7]/20"
              />
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/60 font-semibold">
                Payment Method
              </label>
              <div className="flex flex-wrap gap-1.5">
                {['Cash', 'GCash', 'Maya', 'Bank Transfer', 'Other'].map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSettleMethod(m)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                      settleMethod === m
                        ? 'bg-[#1B1B19] text-white border-[#1B1B19] shadow-xs'
                        : 'bg-white border-black/10 text-[#1B1B19]/70 hover:bg-black/5'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Fixed Footer at the bottom */}
          <div className="sticky bottom-0 bg-[#F8F7F4]/95 backdrop-blur-md border-t border-black/10 p-3.5 sm:p-4 shrink-0 z-20">
            <div className="max-w-xl mx-auto grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSelectedDebtToSettle(null)}
                className="w-full bg-[#ECEBE7] hover:bg-[#E2E1DC] active:scale-[0.98] text-[#1B1B19] py-3.5 px-6 rounded-full font-semibold text-sm transition text-center cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmIndividualSettle}
                className="w-full bg-[#1B1B19] hover:bg-black active:scale-[0.98] text-white py-3.5 px-6 rounded-full font-semibold text-sm shadow-sm transition text-center cursor-pointer"
              >
                Confirm Settle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Expense Full Page */}
      {editingExpense && (
        <div className="fixed inset-0 bg-[#F8F7F4] z-50 flex flex-col animate-in fade-in duration-150">
          {/* Top Header with (X) button */}
          <header className="px-5 py-4 border-b border-black/5 bg-[#F8F7F4]/95 backdrop-blur-md flex items-center justify-between sticky top-0 z-20 shrink-0">
            <div className="flex items-center space-x-2.5">
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
              className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 text-[#1B1B19]/70 hover:text-[#1B1B19] flex items-center justify-center transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </header>

          <form onSubmit={handleSaveEditedExpense} className="flex-1 flex flex-col min-h-0">
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 max-w-xl mx-auto w-full">
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
            </div>

            {/* Fixed Footer at the bottom */}
            <div className="sticky bottom-0 bg-[#F8F7F4]/95 backdrop-blur-md border-t border-black/10 p-3.5 sm:p-4 shrink-0 z-20">
              <div className="max-w-xl mx-auto grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setEditingExpense(null)}
                  className="w-full bg-[#ECEBE7] hover:bg-[#E2E1DC] active:scale-[0.98] text-[#1B1B19] py-3.5 px-6 rounded-full font-semibold text-sm transition text-center cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-full bg-[#1B1B19] hover:bg-black active:scale-[0.98] text-white py-3.5 px-6 rounded-full font-semibold text-sm shadow-sm transition text-center cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </form>
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

            {/* Quick Add Member Form */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const name = manualMemberInput.trim();
                if (!name || isAddingManualMember) return;
                setIsAddingManualMember(true);
                try {
                  if (onAddMember) await onAddMember(name);
                  setManualMemberInput('');
                } catch (err) {
                  console.error('Failed to add member:', err);
                } finally {
                  setIsAddingManualMember(false);
                }
              }}
              className="flex items-center space-x-1.5 pt-1"
            >
              <input
                type="text"
                placeholder="Add member name or @handle..."
                value={manualMemberInput}
                onChange={(e) => setManualMemberInput(e.target.value)}
                className="flex-1 bg-white border border-black/10 focus:border-[#1B1B19] rounded-xl px-3 py-2 text-xs font-mono outline-none text-[#1B1B19]"
              />
              <button
                type="submit"
                disabled={!manualMemberInput.trim() || isAddingManualMember}
                className="bg-[#1B1B19] hover:bg-black disabled:opacity-40 text-white px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer shrink-0"
              >
                {isAddingManualMember ? 'Adding...' : 'Add'}
              </button>
            </form>

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

      {/* Gemini AI OCR Receipt Scanner Modal */}
      <ReceiptScannerModal
        isOpen={showScannerModal}
        onClose={() => setShowScannerModal(false)}
        onApplyReceipt={handleApplyScannedReceipt}
        onOpenItemizedSplitter={(data) => {
          setItemizedInitialData(data);
          setActiveTab('new');
          setLogSubTab('splitter');
          setShowScannerModal(false);
        }}
        groupMembers={availableUsers}
        activeGasUrl={gasUrl}
        activeChatId={chatId}
      />

      {/* Edit Itemized Receipt Splitter Modal */}
      {editingReceiptExpense && (
        <ItemizedReceiptSplitter
          isOpenModal={true}
          isEditing={true}
          submitButtonLabel={`Update Receipt Split (${editingReceiptExpense.currency || '₱'}${formatAmount(editingReceiptExpense.amount)})`}
          onCloseModal={() => setEditingReceiptExpense(null)}
          groupMembers={availableUsers}
          defaultPayer={editingReceiptExpense.paidBy || activeUser}
          defaultCurrency={editingReceiptExpense.currency || '₱'}
          initialReceiptData={{
            merchant: editingReceiptExpense.merchant || editingReceiptExpense.description.replace(/^Receipt:\s*/, ''),
            total: Number(editingReceiptExpense.amount) || 0,
            currency: editingReceiptExpense.currency || '₱',
            category: editingReceiptExpense.category || 'Food & Drink',
            tax: Number(editingReceiptExpense.tax) || 0,
            tip: Number(editingReceiptExpense.tip) || 0,
            discount: Number(editingReceiptExpense.discount) || 0,
            items: (editingReceiptExpense.itemsBreakdown && editingReceiptExpense.itemsBreakdown.length > 0)
              ? editingReceiptExpense.itemsBreakdown.map(it => ({
                  name: it.name,
                  price: Number(it.price) || 0,
                  quantity: Number(it.quantity) || 1,
                  assignedTo: it.assignedTo || []
                }))
              : [{
                  name: editingReceiptExpense.description,
                  price: Number(editingReceiptExpense.amount) || 0,
                  quantity: 1,
                  assignedTo: editingReceiptExpense.splitMembers && editingReceiptExpense.splitMembers.length > 0
                    ? editingReceiptExpense.splitMembers
                    : availableUsers
                }]
          }}
          onSaveToLedger={handleSaveEditedReceipt}
          gasUrl={gasUrl}
        />
      )}

      {/* Member Payment Directory Full Page */}
      {showPaymentDirectoryModal && (
        <div className="fixed inset-0 bg-[#F8F7F4] z-50 flex flex-col animate-in fade-in duration-150 text-[#1B1B19]">
          {/* Top Header with (X) button */}
          <header className="px-5 py-4 border-b border-black/5 bg-[#F8F7F4]/95 backdrop-blur-md flex items-center justify-between sticky top-0 z-20 shrink-0">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#1B1B19] text-white flex items-center justify-center text-xs shadow-md">
                <QrCode className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <h4 className="font-bold text-[#1B1B19] text-sm">Payment Methods Directory</h4>
                <p className="text-[10px] text-[#1B1B19]/60 font-mono">Manage accounts & QR codes for all members</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowPaymentDirectoryModal(false)}
              className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 text-[#1B1B19]/70 hover:text-[#1B1B19] flex items-center justify-center transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 max-w-xl mx-auto w-full">
            {/* Quick Action bar for active user */}
            <div className="bg-white/80 p-3 rounded-2xl border border-black/5 flex items-center justify-between gap-2 shadow-2xs">
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#1B1B19]">Your Payment Details ({activeUser})</p>
                <p className="text-[10px] text-[#1B1B19]/50 font-mono truncate">
                  {paymentDetails[activeUser]
                    ? `${paymentDetails[activeUser]?.bankName} • ${paymentDetails[activeUser]?.accountNumber || 'Configured'}`
                    : 'Not configured yet — add your GCash/Bank'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  handleOpenPaymentModal(activeUser);
                }}
                className="bg-[#1B1B19] hover:bg-black text-white px-3 py-1.5 rounded-xl text-xs font-mono font-semibold shrink-0 transition cursor-pointer shadow-xs"
              >
                {paymentDetails[activeUser] ? 'Edit Mine' : '+ Add Mine'}
              </button>
            </div>

            {/* Section 1: Configured Members */}
            {(() => {
              const configured = availableUsers.filter(u => Boolean(paymentDetails[u]));
              const unconfigured = availableUsers.filter(u => !paymentDetails[u]);

              return (
                <div className="space-y-3">
                  {configured.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/60 font-semibold px-1">
                        <span>Configured Accounts ({configured.length})</span>
                      </div>
                      <div className="space-y-2">
                        {configured.map(member => {
                          const details = paymentDetails[member];
                          const isCurrent = member === activeUser;

                          return (
                            <div
                              key={member}
                              className="p-3 rounded-2xl border border-black/5 bg-white space-y-2 shadow-2xs"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-xs text-[#1B1B19]">{member}</span>
                                    {isCurrent && (
                                      <span className="text-[8px] font-mono px-1 py-0.2 bg-[#4A6CF7]/10 text-[#4A6CF7] rounded font-semibold">
                                        You
                                      </span>
                                    )}
                                    <span className="text-[9px] font-mono px-1.5 py-0.2 bg-[#1B1B19] text-white rounded font-bold">
                                      {details.bankName}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-[#1B1B19]/70 font-mono mt-0.5 truncate">
                                    {details.accountName}
                                  </p>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  {details.qrCodeUrl && (
                                    <button
                                      type="button"
                                      onClick={() => setViewingQrModal({
                                        memberName: member,
                                        bankName: details.bankName,
                                        accountName: details.accountName,
                                        accountNumber: details.accountNumber,
                                        qrCodeUrl: details.qrCodeUrl!,
                                        notes: details.notes
                                      })}
                                      title="View full QR"
                                      className="p-1.5 bg-black/5 hover:bg-black/10 rounded-lg text-[#1B1B19] transition cursor-pointer"
                                    >
                                      <QrCode className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenPaymentModal(member)}
                                    title="Edit payment details"
                                    className="p-1.5 bg-black/5 hover:bg-black/10 rounded-lg text-[#1B1B19] transition cursor-pointer"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {details.accountNumber && (
                                <div className="flex items-center justify-between bg-black/5 px-2.5 py-1.5 rounded-xl text-xs font-mono">
                                  <span className="font-bold text-[#1B1B19] tracking-wider truncate">
                                    {details.accountNumber}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyText(details.accountNumber, `Copied ${member}'s ${details.bankName} number!`)}
                                    className="text-[10px] text-[#4A6CF7] hover:underline font-semibold flex items-center gap-1 shrink-0 ml-2 cursor-pointer"
                                  >
                                    <Copy className="w-3 h-3" />
                                    <span>Copy</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Section 2: Members Without Info Yet (Clean Inner Page list) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/60 font-semibold px-1">
                      <span>No Info Added Yet ({unconfigured.length})</span>
                    </div>

                    {unconfigured.length === 0 ? (
                      <div className="p-3 rounded-2xl bg-emerald-50/60 border border-emerald-200/60 text-center">
                        <p className="text-xs font-semibold text-emerald-800">🎉 All members have payment info configured!</p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {unconfigured.map(member => {
                          const isCurrent = member === activeUser;

                          return (
                            <div
                              key={member}
                              className="p-2.5 rounded-2xl border border-dashed border-black/10 bg-white/60 hover:bg-white flex items-center justify-between gap-2 transition"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-xs text-[#1B1B19] truncate">{member}</span>
                                  {isCurrent && (
                                    <span className="text-[8px] font-mono px-1 py-0.2 bg-[#4A6CF7]/10 text-[#4A6CF7] rounded font-semibold">
                                      You
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-[#1B1B19]/40 font-mono">No payment info on file</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleOpenPaymentModal(member)}
                                className="text-[11px] font-mono px-2.5 py-1 bg-black/5 hover:bg-black/10 text-[#1B1B19] font-medium rounded-xl transition shrink-0 cursor-pointer"
                              >
                                + Add Info
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

          </div>

          {/* Fixed Footer at the bottom */}
          <div className="sticky bottom-0 bg-[#F8F7F4]/95 backdrop-blur-md border-t border-black/10 p-3.5 sm:p-4 shrink-0 z-20">
            <div className="max-w-xl mx-auto">
              <button
                type="button"
                onClick={() => setShowPaymentDirectoryModal(false)}
                className="w-full bg-[#1B1B19] hover:bg-black active:scale-[0.98] text-white py-3.5 px-6 rounded-full font-semibold text-sm shadow-sm transition text-center cursor-pointer"
              >
                Close Directory
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Member Payment Details & QR Code Edit Full Page */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-[#F8F7F4] z-50 flex flex-col animate-in fade-in duration-150">
          {/* Top Header with (X) button */}
          <header className="px-5 py-4 border-b border-black/5 bg-[#F8F7F4]/95 backdrop-blur-md flex items-center justify-between sticky top-0 z-20 shrink-0">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#1B1B19] text-white flex items-center justify-center text-xs shadow-md">
                <QrCode className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <h4 className="font-bold text-[#1B1B19] text-sm">Payment Details</h4>
                <p className="text-[10px] text-[#1B1B19]/60 font-mono">For member: {paymentTargetMember}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowPaymentModal(false)}
              className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 text-[#1B1B19]/70 hover:text-[#1B1B19] flex items-center justify-center transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </header>

          <form onSubmit={handleSavePaymentForm} className="flex-1 flex flex-col min-h-0">
            {/* Scrollable Form Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 max-w-xl mx-auto w-full">
              {/* Member Target Selector */}
              <div className="space-y-1">
                <label className="block text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/60 font-semibold">
                  Member
                </label>
                <select
                  value={paymentTargetMember}
                  onChange={(e) => {
                    const chosen = e.target.value;
                    setPaymentTargetMember(chosen);
                    const existing = paymentDetails[chosen];
                    if (existing) {
                      setPaymentBankName(existing.bankName || 'GCash');
                      setPaymentCustomBank(existing.bankName && !['GCash', 'Maya', 'BPI', 'BDO', 'UnionBank', 'GoTyme', 'SeaBank', 'Cash'].includes(existing.bankName) ? existing.bankName : '');
                      setPaymentAccountName(existing.accountName || '');
                      setPaymentAccountNumber(existing.accountNumber || '');
                      setPaymentQrCodeUrl(existing.qrCodeUrl || '');
                      setPaymentNotes(existing.notes || '');
                    } else {
                      setPaymentBankName('GCash');
                      setPaymentCustomBank('');
                      setPaymentAccountName(chosen);
                      setPaymentAccountNumber('');
                      setPaymentQrCodeUrl('');
                      setPaymentNotes('');
                    }
                  }}
                  className="w-full bg-white border border-black/10 px-3.5 py-2.5 rounded-xl text-xs text-[#1B1B19] focus:outline-none focus:ring-2 focus:ring-[#4A6CF7]/20 font-medium cursor-pointer shadow-2xs"
                >
                  {availableUsers.map(u => (
                    <option key={u} value={u}>
                      {u} {u === activeUser ? '(You)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Payment Channel / Bank */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/60 font-semibold">
                  Payment Channel / Bank
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {['GCash', 'Maya', 'BPI', 'BDO', 'UnionBank', 'GoTyme', 'SeaBank', 'Other'].map(b => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setPaymentBankName(b)}
                      className={`p-2.5 rounded-xl text-xs font-semibold border transition text-center cursor-pointer ${
                        paymentBankName === b
                          ? 'bg-[#1B1B19] text-white border-[#1B1B19] shadow-xs'
                          : 'bg-white/80 border-black/5 text-[#1B1B19]/70 hover:bg-white'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
                {paymentBankName === 'Other' && (
                  <input
                    type="text"
                    value={paymentCustomBank}
                    onChange={e => setPaymentCustomBank(e.target.value)}
                    placeholder="Specify bank or wallet name (e.g. PayPal, Wise)"
                    className="w-full bg-white border border-black/10 px-3.5 py-2.5 rounded-xl text-xs text-[#1B1B19] focus:outline-none focus:ring-2 focus:ring-[#4A6CF7]/20 mt-1 shadow-2xs"
                  />
                )}
              </div>

              {/* Account Name */}
              <div className="space-y-1">
                <label className="block text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/60 font-semibold">
                  Account Name
                </label>
                <input
                  type="text"
                  value={paymentAccountName}
                  onChange={e => setPaymentAccountName(e.target.value)}
                  placeholder="e.g. Juan Dela Cruz"
                  required
                  className="w-full bg-white border border-black/10 px-3.5 py-2.5 rounded-xl text-xs text-[#1B1B19] focus:outline-none focus:ring-2 focus:ring-[#4A6CF7]/20 font-medium shadow-2xs"
                />
              </div>

              {/* Account Number / Mobile */}
              <div className="space-y-1">
                <label className="block text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/60 font-semibold">
                  Account Number / Mobile Number
                </label>
                <input
                  type="text"
                  value={paymentAccountNumber}
                  onChange={e => setPaymentAccountNumber(e.target.value)}
                  placeholder="e.g. 0917 123 4567 or 1234-5678-90"
                  className="w-full bg-white border border-black/10 px-3.5 py-2.5 rounded-xl text-xs font-mono text-[#1B1B19] focus:outline-none focus:ring-2 focus:ring-[#4A6CF7]/20 shadow-2xs"
                />
              </div>

              {/* QR Code Upload */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/60 font-semibold flex items-center justify-between">
                  <span>QR Code Image (Optional)</span>
                  {paymentQrCodeUrl && (
                    <button
                      type="button"
                      onClick={() => setPaymentQrCodeUrl('')}
                      className="text-rose-500 hover:underline text-[10px] lowercase font-normal"
                    >
                      remove qr
                    </button>
                  )}
                </label>
                
                {paymentQrCodeUrl ? (
                  <div className="bg-white p-3 rounded-2xl border border-black/10 flex items-center gap-3 shadow-2xs">
                    <img
                      src={paymentQrCodeUrl}
                      alt="Uploaded QR Code"
                      className="w-16 h-16 object-contain rounded-lg border border-black/5 bg-black/5"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-semibold text-emerald-700 block">✓ QR Image Attached</span>
                      <p className="text-[10px] text-[#1B1B19]/50 font-mono">Members can view & scan full-screen</p>
                      <label className="mt-1 inline-block text-xs text-[#4A6CF7] hover:underline font-semibold cursor-pointer">
                        Replace QR
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleQrFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <label className="w-full border-2 border-dashed border-black/15 hover:border-black/30 rounded-2xl p-5 flex flex-col items-center justify-center gap-1.5 cursor-pointer bg-white/50 hover:bg-white transition">
                    <QrCode className="w-6 h-6 text-[#1B1B19]/40" />
                    <span className="text-xs font-semibold text-[#1B1B19]">Upload QR Code Image</span>
                    <span className="text-[10px] text-[#1B1B19]/50 font-mono">GCash / Maya / Bank QR photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleQrFileUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {/* Optional Notes */}
              <div className="space-y-1">
                <label className="block text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/60 font-semibold">
                  Notes / Payment Instructions (Optional)
                </label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={e => setPaymentNotes(e.target.value)}
                  placeholder="e.g. Please put SplitNest in reference note"
                  className="w-full bg-white border border-black/10 px-3.5 py-2.5 rounded-xl text-xs text-[#1B1B19] focus:outline-none focus:ring-2 focus:ring-[#4A6CF7]/20 shadow-2xs"
                />
              </div>

              {paymentDetails[paymentTargetMember] && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => handleRemovePaymentDetails(paymentTargetMember)}
                    className="w-full bg-rose-50 hover:bg-rose-100/70 text-rose-700 border border-rose-200/80 py-2.5 rounded-2xl font-medium text-xs transition cursor-pointer"
                  >
                    Remove Details for {paymentTargetMember}
                  </button>
                </div>
              )}
            </div>

            {/* Fixed Footer at the bottom */}
            <div className="sticky bottom-0 bg-[#F8F7F4]/95 backdrop-blur-md border-t border-black/10 p-3.5 sm:p-4 shrink-0 z-20">
              <div className="max-w-xl mx-auto grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="w-full bg-[#ECEBE7] hover:bg-[#E2E1DC] active:scale-[0.98] text-[#1B1B19] py-3.5 px-6 rounded-full font-semibold text-sm transition text-center cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-full bg-[#1B1B19] hover:bg-black active:scale-[0.98] text-white py-3.5 px-6 rounded-full font-semibold text-sm shadow-sm transition text-center cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* QR Code Full Viewer Modal */}
      {viewingQrModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 p-4 flex items-center justify-center animate-in fade-in">
          <div className="bg-[#F8F7F4] border border-black/10 rounded-[32px] p-6 w-full max-w-sm space-y-4 shadow-2xl text-center">
            <div className="flex items-center justify-between border-b border-black/5 pb-2">
              <div className="flex items-center space-x-2 text-left">
                <div className="w-8 h-8 rounded-xl bg-[#1B1B19] text-white flex items-center justify-center text-xs shadow-md">
                  <QrCode className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h4 className="font-bold text-[#1B1B19] text-sm">{viewingQrModal.memberName}'s {viewingQrModal.bankName} QR</h4>
                  <p className="text-[10px] text-[#1B1B19]/60 font-mono">{viewingQrModal.accountName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingQrModal(null)}
                className="w-7 h-7 rounded-full bg-black/5 hover:bg-black/10 text-[#1B1B19]/60 hover:text-[#1B1B19] flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* QR Code Display Canvas */}
            <div className="bg-white p-4 rounded-2xl border border-black/10 shadow-inner flex flex-col items-center justify-center">
              <img
                src={viewingQrModal.qrCodeUrl}
                alt={`${viewingQrModal.memberName} QR`}
                className="max-h-64 w-auto object-contain rounded-xl"
              />
            </div>

            {/* Details & Copy */}
            <div className="bg-white/80 p-3 rounded-2xl border border-black/5 space-y-1 text-left text-xs font-mono">
              <div className="flex justify-between items-center text-[#1B1B19]">
                <span className="text-[#1B1B19]/60">Bank / Channel:</span>
                <span className="font-bold">{viewingQrModal.bankName}</span>
              </div>
              <div className="flex justify-between items-center text-[#1B1B19]">
                <span className="text-[#1B1B19]/60">Name:</span>
                <span className="font-bold truncate max-w-[170px]">{viewingQrModal.accountName}</span>
              </div>
              {viewingQrModal.accountNumber && (
                <div className="flex justify-between items-center text-[#1B1B19] pt-1 border-t border-black/5">
                  <span className="text-[#1B1B19]/60">Account #:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold">{viewingQrModal.accountNumber}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyText(viewingQrModal.accountNumber, 'Account number copied!')}
                      className="text-[#4A6CF7] hover:underline font-semibold text-[10px] flex items-center gap-0.5 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </button>
                  </div>
                </div>
              )}
              {viewingQrModal.notes && (
                <p className="text-[10px] text-[#1B1B19]/60 italic pt-1">
                  Note: {viewingQrModal.notes}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setViewingQrModal(null)}
              className="w-full bg-[#1B1B19] hover:bg-black text-white py-2.5 rounded-xl font-semibold text-xs transition cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* ┌────────────────────────────────────────────────────────┐
          │ 💸 ALL SETTLEMENTS FULL PAGE VIEW (WITH WHO PAID WHO FILTER) │
          └────────────────────────────────────────────────────────┘ */}
      {showAllSettlementsModal && (() => {
        const filteredSettlements = settlements.filter(s => {
          // Filter by payer
          if (settlementFilterPayer !== 'all' && s.payer !== settlementFilterPayer) {
            return false;
          }
          // Filter by receiver
          if (settlementFilterReceiver !== 'all' && s.receiver !== settlementFilterReceiver) {
            return false;
          }
          // Search by text
          if (settlementSearch.trim()) {
            const query = settlementSearch.toLowerCase().trim();
            const payerMatch = s.payer.toLowerCase().includes(query);
            const receiverMatch = s.receiver.toLowerCase().includes(query);
            const methodMatch = s.method?.toLowerCase().includes(query);
            const amountMatch = String(s.amount).includes(query);
            return payerMatch || receiverMatch || methodMatch || amountMatch;
          }
          return true;
        });

        const totalFilteredSettled = filteredSettlements.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

        return (
          <div className="fixed inset-0 bg-[#F8F7F4] z-50 flex flex-col animate-in fade-in duration-150 overflow-hidden">
            {/* Top Header */}
            <header className="px-5 py-4 border-b border-black/5 bg-[#F8F7F4]/95 backdrop-blur-md flex items-center justify-between sticky top-0 z-20 shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#1B1B19] text-white flex items-center justify-center text-sm shadow-md">
                  <History className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h4 className="font-bold text-[#1B1B19] text-sm">Settlement History</h4>
                  <p className="text-[10px] text-[#1B1B19]/60 font-mono">
                    {filteredSettlements.length} of {settlements.length} settlement{settlements.length === 1 ? '' : 's'} shown
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAllSettlementsModal(false)}
                className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 text-[#1B1B19]/70 hover:text-[#1B1B19] flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto flex flex-col">
              <div className="max-w-xl mx-auto w-full p-4 sm:p-5 space-y-3.5 flex-1 flex flex-col">
                {/* Filter Controls Bar */}
                <div className="bg-white/80 backdrop-blur-md border border-black/5 rounded-[22px] p-4 space-y-3 shadow-xs shrink-0">
                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#1B1B19]/40" />
                    <input
                      type="text"
                      value={settlementSearch}
                      onChange={(e) => setSettlementSearch(e.target.value)}
                      placeholder="Search by member name, method, or amount..."
                      className="w-full bg-white border border-black/10 pl-9 pr-8 py-2 rounded-xl text-xs text-[#1B1B19] focus:outline-none focus:ring-2 focus:ring-[#4A6CF7]/20 placeholder:text-[#1B1B19]/40"
                    />
                    {settlementSearch && (
                      <button
                        type="button"
                        onClick={() => setSettlementSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#1B1B19]/40 hover:text-[#1B1B19]"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Who Paid Who Filter Dropdowns */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-mono font-semibold text-[#1B1B19]/60 uppercase tracking-wider">
                      <span className="flex items-center gap-1">
                        <SlidersHorizontal className="w-3 h-3" />
                        Filter Who Paid Who
                      </span>
                      {(settlementFilterPayer !== 'all' || settlementFilterReceiver !== 'all' || settlementSearch) && (
                        <button
                          type="button"
                          onClick={() => {
                            setSettlementFilterPayer('all');
                            setSettlementFilterReceiver('all');
                            setSettlementSearch('');
                          }}
                          className="text-[#4A6CF7] hover:underline normal-case font-bold"
                        >
                          Reset filters
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {/* Payer (Sender) Filter */}
                      <div className="bg-white border border-black/10 rounded-xl p-2 flex items-center justify-between gap-2 shadow-2xs">
                        <span className="text-[11px] font-mono text-[#1B1B19]/60 font-medium shrink-0">Paid by:</span>
                        <select
                          value={settlementFilterPayer}
                          onChange={(e) => setSettlementFilterPayer(e.target.value)}
                          className="bg-transparent text-xs font-semibold text-[#1B1B19] focus:outline-none cursor-pointer text-right flex-1 truncate"
                        >
                          <option value="all">Anyone (All Payers)</option>
                          {availableUsers.map((u) => (
                            <option key={u} value={u}>
                              {u} {u === activeUser ? '(You)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Receiver Filter */}
                      <div className="bg-white border border-black/10 rounded-xl p-2 flex items-center justify-between gap-2 shadow-2xs">
                        <span className="text-[11px] font-mono text-[#1B1B19]/60 font-medium shrink-0">Paid to:</span>
                        <select
                          value={settlementFilterReceiver}
                          onChange={(e) => setSettlementFilterReceiver(e.target.value)}
                          className="bg-transparent text-xs font-semibold text-[#1B1B19] focus:outline-none cursor-pointer text-right flex-1 truncate"
                        >
                          <option value="all">Anyone (All Receivers)</option>
                          {availableUsers.map((u) => (
                            <option key={u} value={u}>
                              {u} {u === activeUser ? '(You)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Filter Summary Tags */}
                    {(settlementFilterPayer !== 'all' || settlementFilterReceiver !== 'all') && (
                      <div className="pt-1 flex items-center gap-1.5 flex-wrap text-[11px] font-mono">
                        <span className="text-[#1B1B19]/60">Active Filter:</span>
                        <span className="bg-[#1B1B19] text-white px-2 py-0.5 rounded-md font-bold">
                          {settlementFilterPayer !== 'all' ? settlementFilterPayer : 'Anyone'}
                          {' → '}
                          {settlementFilterReceiver !== 'all' ? settlementFilterReceiver : 'Anyone'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* List Content */}
                <div className="flex-1 space-y-2">
                  {filteredSettlements.length === 0 ? (
                    <div className="py-16 text-center space-y-2 bg-white/50 border border-black/5 rounded-[22px] p-6">
                      <div className="w-12 h-12 rounded-2xl bg-black/5 mx-auto flex items-center justify-center text-[#1B1B19]/40">
                        <History className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-semibold text-[#1B1B19]">No settlements match your filter</p>
                      <p className="text-xs text-[#1B1B19]/50 font-mono max-w-xs mx-auto">
                        Try selecting different payer/receiver combinations or clearing your search term.
                      </p>
                      {(settlementFilterPayer !== 'all' || settlementFilterReceiver !== 'all' || settlementSearch) && (
                        <button
                          type="button"
                          onClick={() => {
                            setSettlementFilterPayer('all');
                            setSettlementFilterReceiver('all');
                            setSettlementSearch('');
                          }}
                          className="mt-2 text-xs font-mono font-bold text-[#4A6CF7] hover:underline cursor-pointer"
                        >
                          Clear all filters
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredSettlements.map((s, idx) => (
                        <div
                          key={s.id || idx}
                          className="bg-white border border-black/10 hover:border-black/20 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-2xs transition"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap text-sm">
                              <span className="font-bold text-[#1B1B19]">{s.payer}</span>
                              <span className="text-[11px] font-mono text-[#1B1B19]/40 px-1">paid</span>
                              <span className="font-bold text-emerald-700">{s.receiver}</span>
                            </div>

                            <div className="flex items-center gap-2 text-[11px] text-[#1B1B19]/50 font-mono">
                              {s.method && (
                                <span className="bg-black/5 px-2 py-0.5 rounded text-[#1B1B19]/70 font-semibold">
                                  {s.method}
                                </span>
                              )}
                              <span>{new Date(s.timestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-base font-extrabold font-mono text-[#1B1B19]">
                              {s.currency || '₱'}{formatAmount(Number(s.amount))}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sticky Full Page Footer */}
            <div className="bg-[#F8F7F4]/95 backdrop-blur-md border-t border-black/10 p-3.5 sm:p-4 shrink-0 z-20">
              <div className="max-w-xl mx-auto flex items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/50 block">Filtered Total</span>
                  <span className="text-sm font-bold font-mono text-[#1B1B19]">
                    {currency}{formatAmount(totalFilteredSettled)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAllSettlementsModal(false)}
                  className="bg-[#18181B] hover:bg-black text-white px-7 py-3 rounded-full text-xs font-semibold shadow-sm transition active:scale-[0.98] cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
};
