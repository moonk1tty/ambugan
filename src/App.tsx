import React, { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { MiniAppView } from './components/MiniAppView';
import { Expense, Settlement, RegisteredUser } from './types';
import { ENVIRONMENTS, getStoredEnvironment } from './config/environments';

const STORAGE_KEYS = {
  GAS_URL: 'splitsquad_gas_url',
  EXPENSES: 'splitsquad_expenses',
  SETTLEMENTS: 'splitsquad_settlements',
  ACTIVE_USER: 'splitsquad_active_user',
  REGISTERED_USERS: 'splitsquad_registered_users'
};

const DEFAULT_EXPENSES: Expense[] = [];

const DEFAULT_SETTLEMENTS: Settlement[] = [];

function getChatId(): string {
  const tg = (window as any).Telegram?.WebApp;
  
  // Helper to sanitize chatId strings
  const sanitize = (val: string | null | undefined): string => {
    if (!val) return '';
    let clean = String(val).trim();
    if (clean.includes('startapp=')) clean = clean.split('startapp=')[1] || clean;
    if (clean.includes('chat_id=')) clean = clean.split('chat_id=')[1] || clean;
    if (clean.includes('chatId=')) clean = clean.split('chatId=')[1] || clean;

    const isExplicitGroup = clean.startsWith('g_') || clean.startsWith('c_') || clean.startsWith('group_');

    if (clean.startsWith('c_')) clean = clean.substring(2);
    if (clean.startsWith('g_')) clean = clean.substring(2);
    if (clean.startsWith('group_')) clean = clean.substring(6);

    clean = clean.replace(/[^0-9-]/g, '');
    if (!clean) return '';

    if (/^100\d{8,}$/.test(clean)) {
      clean = '-' + clean;
    } else if (isExplicitGroup && !clean.startsWith('-')) {
      clean = '-' + clean;
    }
    return clean;
  };

  // 1. Direct initDataUnsafe chat object (from Telegram group chat button or menu)
  if (tg?.initDataUnsafe?.chat?.id) {
    return String(tg.initDataUnsafe.chat.id);
  }

  // 2. Telegram start_param in initDataUnsafe (from Direct Mini App links t.me/bot/app?startapp=...)
  if (tg?.initDataUnsafe?.start_param) {
    const startParam = sanitize(tg.initDataUnsafe.start_param);
    if (startParam) return startParam;
  }

  // 3. Query parameters in window.location.search
  const urlParams = new URLSearchParams(window.location.search);
  const paramChatId = sanitize(
    urlParams.get('startapp') || 
    urlParams.get('chat_id') || 
    urlParams.get('chatId') || 
    urlParams.get('start_param') || 
    urlParams.get('tgWebAppStartParam')
  );
  if (paramChatId) return paramChatId;

  // 4. Hash parameters in window.location.hash
  if (window.location.hash) {
    try {
      const hashClean = window.location.hash.replace(/^#/, '');
      const hashParams = new URLSearchParams(hashClean);
      const hashChatId = sanitize(
        hashParams.get('startapp') || 
        hashParams.get('chat_id') || 
        hashParams.get('chatId') || 
        hashParams.get('start_param') || 
        hashParams.get('tgWebAppStartParam')
      );
      if (hashChatId) return hashChatId;

      const tgWebAppData = hashParams.get('tgWebAppData');
      if (tgWebAppData) {
        const appDataParams = new URLSearchParams(decodeURIComponent(tgWebAppData));
        const appDataStartParam = sanitize(appDataParams.get('start_param') || appDataParams.get('startapp'));
        if (appDataStartParam) return appDataStartParam;
      }
    } catch (e) {
      console.error('Error parsing hash params', e);
    }
  }

  // 5. Fallback to user ID for private 1-on-1 chats
  if (tg?.initDataUnsafe?.user?.id) {
    return String(tg.initDataUnsafe.user.id);
  }

  return '';
}

function getGroupTitle(cId: string): string {
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.initDataUnsafe?.chat?.title) {
    return tg.initDataUnsafe.chat.title;
  }
  const urlParams = new URLSearchParams(window.location.search);
  const paramTitle = urlParams.get('group_title') || urlParams.get('groupTitle') || urlParams.get('title') || urlParams.get('chat_title');
  if (paramTitle) return paramTitle;

  if (window.location.hash) {
    try {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const hashTitle = hashParams.get('group_title') || hashParams.get('groupTitle') || hashParams.get('title') || hashParams.get('chat_title');
      if (hashTitle) return hashTitle;
    } catch (e) {}
  }

  if (cId) {
    const saved = localStorage.getItem(`splitsquad_group_title_${cId}`);
    if (saved) return saved;
  }
  return '';
}

const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbxWrWkiLh-zOHuMfoXhx2bKhuNbuCCZCsxfjKGoZae4D0iYtkTlHjQr7zBXu7RkymEJaA/exec';

export default function App() {
  const [chatId, setChatId] = useState<string>(() => getChatId());
  const [groupTitle, setGroupTitle] = useState<string>(() => getGroupTitle(chatId));

  // Detect and update chatId & groupTitle dynamically when Telegram SDK initializes
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      try { tg.ready(); } catch (e) {}
      if (tg.initDataUnsafe?.chat?.title) {
        setGroupTitle(tg.initDataUnsafe.chat.title);
        if (chatId) {
          localStorage.setItem(`splitsquad_group_title_${chatId}`, tg.initDataUnsafe.chat.title);
        }
      }
    }

    const checkAndSetChatId = () => {
      const currentId = getChatId();
      if (currentId && currentId !== chatId) {
        setChatId(currentId);
      }
      const tgLatest = (window as any).Telegram?.WebApp;
      if (tgLatest?.initDataUnsafe?.chat?.title) {
        setGroupTitle(tgLatest.initDataUnsafe.chat.title);
      }
    };

    checkAndSetChatId();
    const interval = setInterval(checkAndSetChatId, 250);
    const timeout = setTimeout(() => clearInterval(interval), 3000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [chatId]);

  const [activeUser, setActiveUser] = useState<string>('');
  const [registeredUsers, setRegisteredUsers] = useState<RegisteredUser[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);

  const [gasUrl, setGasUrl] = useState<string>(() => {
    const activeEnv = getStoredEnvironment();
    const envDefault = ENVIRONMENTS[activeEnv]?.defaultGasUrl || ENVIRONMENTS.main.defaultGasUrl;
    const saved = localStorage.getItem(STORAGE_KEYS.GAS_URL);
    if (!saved || saved.includes('AKfycbzBu8cufpEzEl9vZHTj4wajJn_Ax5bfFL9hN3yT5xg')) {
      return ((import.meta as any).env?.VITE_GAS_URL as string) || envDefault || DEFAULT_GAS_URL;
    }
    return saved;
  });

  const [isOnlineGas, setIsOnlineGas] = useState<boolean>(true);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [loadingStage, setLoadingStage] = useState<number>(0);
  const [showManualContinue, setShowManualContinue] = useState<boolean>(false);

  // Progressive loading messages to keep user engaged while Telegram API & Sheets sync
  const loadingSteps = [
    'Connecting to Telegram group...',
    'Syncing group members & permissions...',
    'Loading shared ledger & balances...',
    'Finalizing member roster...'
  ];

  useEffect(() => {
    if (!isInitialLoading) return;
    const interval = setInterval(() => {
      setLoadingStage(prev => {
        if (prev < loadingSteps.length - 1) return prev + 1;
        return prev;
      });
    }, 600);
    return () => clearInterval(interval);
  }, [isInitialLoading]);

  // Show a manual bypass option after 6 seconds only if still stuck on <= 1 member
  useEffect(() => {
    if (!isInitialLoading) {
      setShowManualContinue(false);
      return;
    }
    const timer = setTimeout(() => {
      setShowManualContinue(true);
    }, 6000);
    return () => clearTimeout(timer);
  }, [isInitialLoading]);

  // Save to localStorage scoped by chatId when state changes
  useEffect(() => {
    if (activeUser && chatId) {
      localStorage.setItem(`${STORAGE_KEYS.ACTIVE_USER}_${chatId}`, activeUser);
    }
  }, [activeUser, chatId]);

  useEffect(() => {
    if (chatId) {
      localStorage.setItem(`${STORAGE_KEYS.REGISTERED_USERS}_${chatId}`, JSON.stringify(registeredUsers));
    }
  }, [registeredUsers, chatId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.GAS_URL, gasUrl);
  }, [gasUrl]);

  useEffect(() => {
    if (chatId) {
      localStorage.setItem(`${STORAGE_KEYS.EXPENSES}_${chatId}`, JSON.stringify(expenses));
    }
  }, [expenses, chatId]);

  useEffect(() => {
    if (chatId) {
      localStorage.setItem(`${STORAGE_KEYS.SETTLEMENTS}_${chatId}`, JSON.stringify(settlements));
    }
  }, [settlements, chatId]);

  // Check Telegram WebApp user context on load or fall back to first registered user
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.initDataUnsafe?.user) {
      const tgUser = tg.initDataUnsafe.user;
      const tgName = tgUser.first_name || tgUser.username || `User ${tgUser.id}`;
      if (tgName) {
        setActiveUser(tgName);
        return;
      }
    }
    if ((!activeUser || activeUser === 'Alex' || activeUser === 'Sam') && registeredUsers.length > 0) {
      const firstUser = registeredUsers.find(u => {
        const uName = (u.username || '').toLowerCase();
        const fName = (u.firstName || '').toLowerCase();
        return !uName.includes('bot') && !fName.includes('bot');
      });
      if (firstUser) {
        const name = firstUser.firstName || firstUser.username || `User ${firstUser.userId}`;
        if (name) setActiveUser(name);
      }
    }
  }, [registeredUsers]);

  // Fetch data from Google Apps Script endpoint if configured
  const fetchGasData = useCallback(async (url: string, targetChatId?: string, forceMemberSync = false) => {
    if (!url || !url.startsWith('http')) {
      setIsOnlineGas(false);
      return;
    }

    try {
      const currentChatId = targetChatId || getChatId();
      const tg = (window as any).Telegram?.WebApp;
      const tgUser = tg?.initDataUnsafe?.user;

      const action = forceMemberSync ? 'sync_members' : 'get_data';
      const queryUrl = currentChatId 
        ? `${url}${url.includes('?') ? '&' : '?'}action=${action}&chatId=${encodeURIComponent(currentChatId)}` 
        : `${url}${url.includes('?') ? '&' : '?'}action=${action}`;

      const response = await fetch(queryUrl);
      const text = await response.text();

      // Check if response is Google Login HTML instead of JSON
      if (text.trim().startsWith('<') || text.includes('accounts.google.com')) {
        console.warn('Google Apps Script returned Google Sign-In HTML page. Make sure Web App "Who has access" is set to "Anyone".');
        setIsOnlineGas(false);
        return;
      }

      const result = JSON.parse(text);

      if (result.status === 'success' && result.data) {
        setIsOnlineGas(true);
        if (result.data.groupTitle || result.data.chatTitle) {
          const title = result.data.groupTitle || result.data.chatTitle;
          setGroupTitle(title);
          if (currentChatId) {
            localStorage.setItem(`splitsquad_group_title_${currentChatId}`, title);
          }
        }
        const fetchedExpenses = Array.isArray(result.data.expenses) ? result.data.expenses : [];
        const fetchedSettlements = Array.isArray(result.data.settlements) ? result.data.settlements : [];
        const fetchedUsers: RegisteredUser[] = Array.isArray(result.data.users) ? [...result.data.users] : [];

        // Also harvest any distinct names from expenses & settlements to ensure no member is missed
        const knownNames = new Set(fetchedUsers.map(u => (u.firstName || u.username || u.name || '').toLowerCase().replace(/^@/, '')));
        
        // Load custom added members and removed members from localStorage
        const customMembersKey = `splitsquad_custom_members_${currentChatId}`;
        const removedMembersKey = `splitsquad_removed_members_${currentChatId}`;
        let localCustomMembers: RegisteredUser[] = [];
        let removedNames: Set<string> = new Set();
        try {
          const rawCustom = localStorage.getItem(customMembersKey);
          if (rawCustom) localCustomMembers = JSON.parse(rawCustom);
        } catch (e) {}
        try {
          const rawRemoved = localStorage.getItem(removedMembersKey);
          if (rawRemoved) {
            const arr = JSON.parse(rawRemoved);
            removedNames = new Set(arr.map((n: string) => n.toLowerCase().replace(/^@/, '')));
          }
        } catch (e) {}

        // Merge locally added custom members
        localCustomMembers.forEach(cm => {
          const cleanName = (cm.firstName || cm.username || cm.name || '').toLowerCase().replace(/^@/, '');
          if (cleanName && !knownNames.has(cleanName) && !removedNames.has(cleanName)) {
            knownNames.add(cleanName);
            fetchedUsers.push(cm);
          }
        });

        // Filter out any explicitly removed members
        const finalUsers = fetchedUsers.filter(u => {
          const cleanName = (u.firstName || u.username || u.name || '').toLowerCase().replace(/^@/, '');
          return !removedNames.has(cleanName);
        });

        finalUsers.forEach((e: RegisteredUser) => {
          knownNames.add((e.firstName || e.username || e.name || '').toLowerCase().replace(/^@/, ''));
        });
        
        fetchedExpenses.forEach((e: Expense) => {
          const paidByClean = (e.paidBy || '').toLowerCase().replace(/^@/, '');
          if (e.paidBy && !knownNames.has(paidByClean) && !paidByClean.includes('bot') && e.paidBy !== 'Alex' && e.paidBy !== 'Sam' && !removedNames.has(paidByClean)) {
            knownNames.add(paidByClean);
            finalUsers.push({ userId: `EXP-${e.paidBy}`, firstName: e.paidBy, username: '', name: e.paidBy, chatId: e.chatId || '', lastSeen: '' });
          }
        });

        fetchedSettlements.forEach((s: Settlement) => {
          [s.payer, s.receiver].forEach(name => {
            const nameClean = (name || '').toLowerCase().replace(/^@/, '');
            if (name && !knownNames.has(nameClean) && !nameClean.includes('bot') && name !== 'Alex' && name !== 'Sam' && !removedNames.has(nameClean)) {
              knownNames.add(nameClean);
              finalUsers.push({ userId: `SET-${name}`, firstName: name, username: '', name: name, chatId: s.chatId || '', lastSeen: '' });
            }
          });
        });

        setExpenses(fetchedExpenses);
        setSettlements(fetchedSettlements);
        setRegisteredUsers(finalUsers);

        if (currentChatId) {
          localStorage.setItem(`${STORAGE_KEYS.EXPENSES}_${currentChatId}`, JSON.stringify(fetchedExpenses));
          localStorage.setItem(`${STORAGE_KEYS.SETTLEMENTS}_${currentChatId}`, JSON.stringify(fetchedSettlements));
          localStorage.setItem(`${STORAGE_KEYS.REGISTERED_USERS}_${currentChatId}`, JSON.stringify(finalUsers));
        }

        // If we got more than 1 member or have completed member sync, dismiss loader
        if (finalUsers.length > 1 || !forceMemberSync) {
          setIsInitialLoading(false);
        }
      } else if (result.status === 'success' && Array.isArray(result.users)) {
        setIsOnlineGas(true);
        setRegisteredUsers(result.users);
        if (currentChatId) {
          localStorage.setItem(`${STORAGE_KEYS.REGISTERED_USERS}_${currentChatId}`, JSON.stringify(result.users));
        }
        if (result.users.length > 1 || !forceMemberSync) {
          setIsInitialLoading(false);
        }
      } else {
        setIsOnlineGas(false);
      }
    } catch (err) {
      console.warn('Google Apps Script fetch error:', err);
      setIsOnlineGas(false);
    }
  }, []);

  // Dismiss loader automatically as soon as registeredUsers has > 1 member
  useEffect(() => {
    if (registeredUsers && registeredUsers.length > 1 && isInitialLoading) {
      setIsInitialLoading(false);
    }
  }, [registeredUsers, isInitialLoading]);

  // Sync state from local cache and trigger fresh fetch whenever chatId or gasUrl updates
  useEffect(() => {
    const currentChatId = chatId || getChatId();

    let savedUsersRaw: string | null = null;
    let cachedMemberCount = 0;

    if (currentChatId) {
      // Load local storage for this specific chatId (reset previous group's data to prevent cross-group leakage)
      const keyExpenses = `${STORAGE_KEYS.EXPENSES}_${currentChatId}`;
      const savedExp = localStorage.getItem(keyExpenses);
      if (savedExp) {
        try { setExpenses(JSON.parse(savedExp)); } catch (e) { setExpenses([]); }
      } else {
        setExpenses([]);
      }

      const keySettlements = `${STORAGE_KEYS.SETTLEMENTS}_${currentChatId}`;
      const savedSet = localStorage.getItem(keySettlements);
      if (savedSet) {
        try { setSettlements(JSON.parse(savedSet)); } catch (e) { setSettlements([]); }
      } else {
        setSettlements([]);
      }

      const keyUsers = `${STORAGE_KEYS.REGISTERED_USERS}_${currentChatId}`;
      savedUsersRaw = localStorage.getItem(keyUsers);
      if (savedUsersRaw) {
        try { 
          const parsed = JSON.parse(savedUsersRaw);
          if (Array.isArray(parsed)) {
            setRegisteredUsers(parsed);
            cachedMemberCount = parsed.length;
          }
        } catch (e) { 
          setRegisteredUsers([]); 
        }
      } else {
        setRegisteredUsers([]);
      }

      const keyUser = `${STORAGE_KEYS.ACTIVE_USER}_${currentChatId}`;
      const savedUser = localStorage.getItem(keyUser);
      if (savedUser) {
        setActiveUser(savedUser);
      }
    }

    // If group has > 1 member in local cache, we can dismiss loader promptly
    if (cachedMemberCount > 1) {
      setTimeout(() => setIsInitialLoading(false), 800);
    }

    // Force live Telegram member sync if group has <= 1 member
    const needsMemberSync = cachedMemberCount <= 1;

    // Fetch fresh data on initial mount
    if (gasUrl) {
      fetchGasData(gasUrl, currentChatId, needsMemberSync);
    }

    // Safety fallback: if after 7.5s we still only have 1 member (e.g. 1-person solo chat), dismiss loader
    const fallbackTimer = setTimeout(() => {
      setIsInitialLoading(false);
    }, 7500);

    // Periodically sync every 8 seconds while Mini App is open
    const pollInterval = setInterval(() => {
      if (gasUrl) {
        fetchGasData(gasUrl, chatId || getChatId());
      }
    }, 8000);

    const onFocus = () => {
      if (gasUrl) {
        fetchGasData(gasUrl, chatId || getChatId());
      }
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearTimeout(fallbackTimer);
      clearInterval(pollInterval);
      window.removeEventListener('focus', onFocus);
    };
  }, [chatId, gasUrl, fetchGasData]);

  const handleAddExpense = async (newExp: Omit<Expense, 'id' | 'timestamp'>) => {
    const currentChatId = newExp.chatId || chatId || getChatId();
    const created: Expense = {
      ...newExp,
      id: 'EXP-' + Date.now(),
      timestamp: new Date().toISOString(),
      chatId: currentChatId
    };

    // Optimistic local state and localStorage update
    const updatedExpenses = [created, ...expenses];
    setExpenses(updatedExpenses);
    try {
      localStorage.setItem(`splitnest_expenses_${currentChatId || 'default'}`, JSON.stringify(updatedExpenses));
      if (currentChatId) {
        localStorage.setItem(`${STORAGE_KEYS.EXPENSES}_${currentChatId}`, JSON.stringify(updatedExpenses));
      }
    } catch (e) {}

    // Send to GAS backend if URL is configured
    if (gasUrl && gasUrl.startsWith('http')) {
      try {
        const tg = (window as any).Telegram?.WebApp;
        const tgUser = tg?.initDataUnsafe?.user;

        const response = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'add_expense',
            expense: created,
            chatId: currentChatId,
            user: tgUser
          })
        });
        const result = await response.json();
        if (result.status === 'success' && result.data) {
          setIsOnlineGas(true);
          if (Array.isArray(result.data.expenses)) {
            setExpenses(result.data.expenses);
            try {
              localStorage.setItem(`splitnest_expenses_${currentChatId || 'default'}`, JSON.stringify(result.data.expenses));
            } catch (e) {}
          }
          if (Array.isArray(result.data.settlements)) {
            setSettlements(result.data.settlements);
            try {
              localStorage.setItem(`splitnest_settlements_${currentChatId || 'default'}`, JSON.stringify(result.data.settlements));
            } catch (e) {}
          }
          if (Array.isArray(result.data.users)) {
            setRegisteredUsers(result.data.users);
            try {
              localStorage.setItem(`splitnest_users_${currentChatId || 'default'}`, JSON.stringify(result.data.users));
            } catch (e) {}
          }
        }
      } catch (err) {
        console.warn('Failed to sync expense with Google Apps Script backend:', err);
      }
    }
  };

  const handleEditExpense = async (updatedExp: Expense) => {
    // 1. Optimistic local state and localStorage update
    const updatedExpenses = expenses.map(exp => (exp.id === updatedExp.id ? updatedExp : exp));
    setExpenses(updatedExpenses);
    try {
      localStorage.setItem(`splitnest_expenses_${chatId || 'default'}`, JSON.stringify(updatedExpenses));
      if (chatId) {
        localStorage.setItem(`${STORAGE_KEYS.EXPENSES}_${chatId}`, JSON.stringify(updatedExpenses));
      }
    } catch (e) {}

    // 2. Send update to GAS backend if configured
    if (gasUrl && gasUrl.startsWith('http')) {
      try {
        const currentChatId = chatId || getChatId();
        const tg = (window as any).Telegram?.WebApp;
        const tgUser = tg?.initDataUnsafe?.user;

        const response = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'edit_expense',
            expense: updatedExp,
            chatId: currentChatId,
            user: tgUser
          })
        });
        const result = await response.json();
        if (result.status === 'success' && result.data) {
          setIsOnlineGas(true);
          if (Array.isArray(result.data.expenses)) {
            setExpenses(result.data.expenses);
            try {
              localStorage.setItem(`splitnest_expenses_${currentChatId || 'default'}`, JSON.stringify(result.data.expenses));
            } catch (e) {}
          }
          if (Array.isArray(result.data.settlements)) {
            setSettlements(result.data.settlements);
            try {
              localStorage.setItem(`splitnest_settlements_${currentChatId || 'default'}`, JSON.stringify(result.data.settlements));
            } catch (e) {}
          }
          if (Array.isArray(result.data.users)) {
            setRegisteredUsers(result.data.users);
            try {
              localStorage.setItem(`splitnest_users_${currentChatId || 'default'}`, JSON.stringify(result.data.users));
            } catch (e) {}
          }
        }
      } catch (err) {
        console.warn('Failed to sync expense update with Google Apps Script backend:', err);
      }
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    // 1. Optimistic local state and localStorage update
    const updatedExpenses = expenses.filter(exp => exp.id !== expenseId);
    setExpenses(updatedExpenses);
    try {
      localStorage.setItem(`splitnest_expenses_${chatId || 'default'}`, JSON.stringify(updatedExpenses));
      if (chatId) {
        localStorage.setItem(`${STORAGE_KEYS.EXPENSES}_${chatId}`, JSON.stringify(updatedExpenses));
      }
    } catch (e) {}

    // 2. Send delete to GAS backend if configured
    if (gasUrl && gasUrl.startsWith('http')) {
      try {
        const currentChatId = chatId || getChatId();
        const response = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'delete_expense',
            id: expenseId,
            chatId: currentChatId
          })
        });
        const result = await response.json();
        if (result.status === 'success' && result.data) {
          setIsOnlineGas(true);
          if (Array.isArray(result.data.expenses)) {
            setExpenses(result.data.expenses);
            try {
              localStorage.setItem(`splitnest_expenses_${currentChatId || 'default'}`, JSON.stringify(result.data.expenses));
            } catch (e) {}
          }
          if (Array.isArray(result.data.settlements)) {
            setSettlements(result.data.settlements);
            try {
              localStorage.setItem(`splitnest_settlements_${currentChatId || 'default'}`, JSON.stringify(result.data.settlements));
            } catch (e) {}
          }
        }
      } catch (err) {
        console.warn('Failed to sync expense deletion with Google Apps Script backend:', err);
      }
    }
  };

  const handleSettleUp = async (settlement: Omit<Settlement, 'id' | 'timestamp'>) => {
    const created: Settlement = {
      ...settlement,
      id: 'SET-' + Date.now(),
      timestamp: new Date().toISOString()
    };

    // Optimistic local state and localStorage update
    const updatedSettlements = [created, ...settlements];
    setSettlements(updatedSettlements);
    try {
      localStorage.setItem(`splitnest_settlements_${chatId || 'default'}`, JSON.stringify(updatedSettlements));
    } catch (e) {}

    // Send to GAS backend if URL is configured
    if (gasUrl && gasUrl.startsWith('http')) {
      try {
        const currentChatId = chatId || getChatId();
        const tg = (window as any).Telegram?.WebApp;
        const tgUser = tg?.initDataUnsafe?.user;

        const response = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'settle_up',
            settlement: created,
            chatId: currentChatId,
            user: tgUser
          })
        });
        const result = await response.json();
        if (result.status === 'success' && result.data) {
          setIsOnlineGas(true);
          if (Array.isArray(result.data.settlements)) {
            setSettlements(result.data.settlements);
            try {
              localStorage.setItem(`splitnest_settlements_${currentChatId || 'default'}`, JSON.stringify(result.data.settlements));
            } catch (e) {}
          }
          if (Array.isArray(result.data.expenses)) {
            setExpenses(result.data.expenses);
            try {
              localStorage.setItem(`splitnest_expenses_${currentChatId || 'default'}`, JSON.stringify(result.data.expenses));
            } catch (e) {}
          }
          if (Array.isArray(result.data.users)) {
            setRegisteredUsers(result.data.users);
            try {
              localStorage.setItem(`splitnest_users_${currentChatId || 'default'}`, JSON.stringify(result.data.users));
            } catch (e) {}
          }
        }
      } catch (err) {
        console.warn('Failed to sync settlement with Google Apps Script backend:', err);
      }
    }
  };

  const handleSyncMembers = async () => {
    if (gasUrl) {
      await fetchGasData(gasUrl, chatId || getChatId(), true);
    }
  };

  const handleAddMember = async (newMemberName: string) => {
    if (!newMemberName || !newMemberName.trim()) return;
    const cleanName = newMemberName.trim();
    const currentChatId = chatId || getChatId();
    const customMembersKey = `splitsquad_custom_members_${currentChatId}`;
    const removedMembersKey = `splitsquad_removed_members_${currentChatId}`;

    // 1. Clear from removed list
    try {
      const rawRemoved = localStorage.getItem(removedMembersKey);
      if (rawRemoved) {
        const arr = JSON.parse(rawRemoved);
        const filtered = arr.filter((n: string) => n.toLowerCase().replace(/^@/, '') !== cleanName.toLowerCase().replace(/^@/, ''));
        localStorage.setItem(removedMembersKey, JSON.stringify(filtered));
      }
    } catch (e) {}

    // 2. Optimistic local state update
    const newUser: RegisteredUser = {
      userId: `NAME-${cleanName.replace(/[^a-zA-Z0-9]/g, '')}`,
      firstName: cleanName.startsWith('@') ? cleanName.substring(1) : cleanName,
      username: cleanName.startsWith('@') ? cleanName : '',
      name: cleanName,
      chatId: currentChatId,
      lastSeen: new Date().toISOString()
    };

    const alreadyExists = registeredUsers.some(u => 
      (u.firstName || u.name || '').toLowerCase() === cleanName.toLowerCase() ||
      (u.username || '').toLowerCase().replace(/^@/, '') === cleanName.toLowerCase().replace(/^@/, '')
    );

    let updated = registeredUsers;
    if (!alreadyExists) {
      updated = [...registeredUsers, newUser];
      setRegisteredUsers(updated);
    }

    if (currentChatId) {
      localStorage.setItem(`${STORAGE_KEYS.REGISTERED_USERS}_${currentChatId}`, JSON.stringify(updated));
    }

    // Save to custom members list for persistent merging
    try {
      const rawCustom = localStorage.getItem(customMembersKey);
      const customList: RegisteredUser[] = rawCustom ? JSON.parse(rawCustom) : [];
      if (!customList.some(c => (c.firstName || c.name || c.username || '').toLowerCase() === cleanName.toLowerCase())) {
        customList.push(newUser);
        localStorage.setItem(customMembersKey, JSON.stringify(customList));
      }
    } catch (e) {}

    // 3. Sync to GAS backend
    if (gasUrl && gasUrl.startsWith('http')) {
      try {
        const response = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'add_member',
            name: cleanName,
            chatId: currentChatId
          })
        });
        const result = await response.json();
        if (result.status === 'success' && result.data && Array.isArray(result.data.users)) {
          // Re-fetch to guarantee sync with sheet
          await fetchGasData(gasUrl, currentChatId);
        }
      } catch (err) {
        console.warn('Failed to add member to backend:', err);
      }
    }
  };

  const handleRemoveMember = async (memberNameToRemove: string) => {
    if (!memberNameToRemove) return;
    const cleanTarget = memberNameToRemove.trim();
    const targetLower = cleanTarget.toLowerCase().replace(/^@/, '');
    const currentChatId = chatId || getChatId();
    const customMembersKey = `splitsquad_custom_members_${currentChatId}`;
    const removedMembersKey = `splitsquad_removed_members_${currentChatId}`;

    // 1. Track in removed members list
    try {
      const rawRemoved = localStorage.getItem(removedMembersKey);
      const removedList: string[] = rawRemoved ? JSON.parse(rawRemoved) : [];
      if (!removedList.some(n => n.toLowerCase().replace(/^@/, '') === targetLower)) {
        removedList.push(cleanTarget);
        localStorage.setItem(removedMembersKey, JSON.stringify(removedList));
      }
    } catch (e) {}

    // 2. Remove from custom members list
    try {
      const rawCustom = localStorage.getItem(customMembersKey);
      if (rawCustom) {
        const customList: RegisteredUser[] = JSON.parse(rawCustom);
        const filtered = customList.filter(c => (c.firstName || c.name || c.username || '').toLowerCase().replace(/^@/, '') !== targetLower);
        localStorage.setItem(customMembersKey, JSON.stringify(filtered));
      }
    } catch (e) {}

    // 3. Optimistic local state update
    const updatedUsers = registeredUsers.filter(u => {
      const uName = (u.username || '').toLowerCase().replace(/^@/, '');
      const fName = (u.firstName || u.name || '').toLowerCase();
      const uId = String(u.userId || '').toLowerCase();
      return uName !== targetLower && fName !== targetLower && uId !== targetLower;
    });
    setRegisteredUsers(updatedUsers);
    if (currentChatId) {
      localStorage.setItem(`${STORAGE_KEYS.REGISTERED_USERS}_${currentChatId}`, JSON.stringify(updatedUsers));
    }

    // If the active viewing user was the one removed, select another remaining member
    if (activeUser.toLowerCase().replace(/^@/, '') === targetLower) {
      if (updatedUsers.length > 0) {
        setActiveUser(updatedUsers[0].firstName || updatedUsers[0].username || updatedUsers[0].name || 'User');
      }
    }

    // 4. Sync removal with Google Apps Script backend
    if (gasUrl && gasUrl.startsWith('http')) {
      try {
        const response = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'remove_member',
            username: cleanTarget,
            name: cleanTarget,
            chatId: currentChatId
          })
        });
        const result = await response.json();
        if (result.status === 'success') {
          await fetchGasData(gasUrl, currentChatId);
        }
      } catch (err) {
        console.warn('Failed to sync member removal with Google Apps Script backend:', err);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F7F4] text-[#1B1B19] font-sans flex flex-col selection:bg-[#4A6CF7] selection:text-white">
      {/* Centered Telegram Mini App View */}
      <main className="w-full max-w-[440px] mx-auto flex-1 flex flex-col">
        {isInitialLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-5 animate-in fade-in duration-300">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-[#1B1B19] text-white flex items-center justify-center shadow-lg transform transition-transform duration-300 hover:scale-105">
                <span className="font-bold font-mono text-2xl tracking-tight">sn</span>
              </div>
              <div className="absolute -bottom-1 -right-1 bg-white p-1.5 rounded-full shadow-md border border-black/5">
                <Loader2 className="w-4 h-4 text-[#4A6CF7] animate-spin" />
              </div>
            </div>

            <div className="space-y-1.5 max-w-xs">
              <h2 className="text-xl font-bold tracking-tight text-[#1B1B19]">splitnest</h2>
              <p className="text-xs text-[#1B1B19]/70 font-mono transition-all duration-300 min-h-[1.25rem]">
                {loadingSteps[loadingStage] || 'Syncing Telegram ledger...'}
              </p>
            </div>

            <div className="w-44 space-y-1.5">
              <div className="h-1.5 bg-black/5 rounded-full overflow-hidden p-0.5">
                <div 
                  className="h-full bg-[#1B1B19] rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${Math.min(100, Math.max(15, ((loadingStage + 1) / loadingSteps.length) * 100))}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-[#1B1B19]/40 font-mono">
                <span>Telegram Sync</span>
                <span>{Math.min(100, Math.round(((loadingStage + 1) / loadingSteps.length) * 100))}%</span>
              </div>
            </div>

            {showManualContinue && (
              <button
                type="button"
                onClick={() => setIsInitialLoading(false)}
                className="mt-2 text-xs font-mono text-[#4A6CF7] hover:underline underline-offset-4 animate-in fade-in duration-300"
              >
                Continue to Mini App →
              </button>
            )}
          </div>
        ) : (
          <MiniAppView
            expenses={expenses}
            settlements={settlements}
            registeredUsers={registeredUsers}
            activeUser={activeUser}
            setActiveUser={setActiveUser}
            onAddExpense={handleAddExpense}
            onEditExpense={handleEditExpense}
            onDeleteExpense={handleDeleteExpense}
            onSettleUp={handleSettleUp}
            onSyncMembers={handleSyncMembers}
            onAddMember={handleAddMember}
            onRemoveMember={handleRemoveMember}
            gasUrl={gasUrl}
            setGasUrl={setGasUrl}
            isOnlineGas={isOnlineGas}
            chatId={chatId}
            groupTitle={groupTitle}
          />
        )}
      </main>
    </div>
  );
}

