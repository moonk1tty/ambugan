import React, { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { MiniAppView } from './components/MiniAppView';
import { Expense, Settlement, RegisteredUser } from './types';

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

const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbyzs2hkta9HPE7MDkHgXw6Fk56r9WBaSb_7M9Y3H_cIUfZsDdJJsIpF8dEqTvC4bU5J/exec';

export default function App() {
  const [chatId, setChatId] = useState<string>(() => getChatId());

  // Detect and update chatId dynamically when Telegram SDK initializes
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      try { tg.ready(); } catch (e) {}
    }

    const checkAndSetChatId = () => {
      const currentId = getChatId();
      if (currentId && currentId !== chatId) {
        setChatId(currentId);
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
    const saved = localStorage.getItem(STORAGE_KEYS.GAS_URL);
    if (!saved || saved.includes('AKfycbzBu8cufpEzEl9vZHTj4wajJn_Ax5bfFL9hN3yT5xg')) {
      return ((import.meta as any).env?.VITE_GAS_URL as string) || DEFAULT_GAS_URL;
    }
    return saved;
  });

  const [isOnlineGas, setIsOnlineGas] = useState<boolean>(true);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [loadingStage, setLoadingStage] = useState<number>(0);

  // Progressive loading messages to keep user engaged while Telegram API & Sheets sync
  const loadingSteps = [
    'Connecting to Telegram group...',
    'Syncing group members & permissions...',
    'Loading shared ledger & balances...',
    'Ready!'
  ];

  useEffect(() => {
    if (!isInitialLoading) return;
    const interval = setInterval(() => {
      setLoadingStage(prev => {
        if (prev < loadingSteps.length - 1) return prev + 1;
        return prev;
      });
    }, 450);
    return () => clearInterval(interval);
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
        const fetchedExpenses = Array.isArray(result.data.expenses) ? result.data.expenses : [];
        const fetchedSettlements = Array.isArray(result.data.settlements) ? result.data.settlements : [];
        const fetchedUsers: RegisteredUser[] = Array.isArray(result.data.users) ? [...result.data.users] : [];

        // Also harvest any distinct names from expenses & settlements to ensure no member is missed
        const knownNames = new Set(fetchedUsers.map(u => (u.firstName || u.username || '').toLowerCase()));
        
        fetchedExpenses.forEach((e: Expense) => {
          if (e.paidBy && !knownNames.has(e.paidBy.toLowerCase()) && !e.paidBy.toLowerCase().includes('bot') && e.paidBy !== 'Alex' && e.paidBy !== 'Sam') {
            knownNames.add(e.paidBy.toLowerCase());
            fetchedUsers.push({ userId: `EXP-${e.paidBy}`, firstName: e.paidBy, username: '', chatId: e.chatId || '', lastSeen: '' });
          }
        });

        fetchedSettlements.forEach((s: Settlement) => {
          [s.payer, s.receiver].forEach(name => {
            if (name && !knownNames.has(name.toLowerCase()) && !name.toLowerCase().includes('bot') && name !== 'Alex' && name !== 'Sam') {
              knownNames.add(name.toLowerCase());
              fetchedUsers.push({ userId: `SET-${name}`, firstName: name, username: '', chatId: s.chatId || '', lastSeen: '' });
            }
          });
        });

        setExpenses(fetchedExpenses);
        setSettlements(fetchedSettlements);
        setRegisteredUsers(fetchedUsers);
      } else if (result.status === 'success' && Array.isArray(result.users)) {
        setIsOnlineGas(true);
        setRegisteredUsers(result.users);
      } else {
        setIsOnlineGas(false);
      }
    } catch (err) {
      console.warn('Google Apps Script fetch error:', err);
      setIsOnlineGas(false);
    } finally {
      setIsInitialLoading(false);
    }
  }, []);

  // Sync state from local cache and trigger fresh fetch whenever chatId or gasUrl updates
  useEffect(() => {
    const currentChatId = chatId || getChatId();

    let savedUsersRaw: string | null = null;

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
        try { setRegisteredUsers(JSON.parse(savedUsersRaw)); } catch (e) { setRegisteredUsers([]); }
      } else {
        setRegisteredUsers([]);
      }

      const keyUser = `${STORAGE_KEYS.ACTIVE_USER}_${currentChatId}`;
      const savedUser = localStorage.getItem(keyUser);
      if (savedUser) {
        setActiveUser(savedUser);
      }
    }

    // If group has 0 or 1 known member, force Telegram member discovery on mount
    const hasFewUsers = !savedUsersRaw || (function() {
      try {
        const parsed = JSON.parse(savedUsersRaw);
        return !Array.isArray(parsed) || parsed.length <= 1;
      } catch {
        return true;
      }
    })();

    // Fetch fresh data on initial mount
    if (gasUrl) {
      fetchGasData(gasUrl, currentChatId, hasFewUsers);
    }

    // Smooth transition: dismiss loading screen after 1.8s once steps complete
    const fallbackTimer = setTimeout(() => {
      setIsInitialLoading(false);
    }, 1800);

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
    const created: Expense = {
      ...newExp,
      id: 'EXP-' + Date.now(),
      timestamp: new Date().toISOString()
    };

    // Optimistic local state and localStorage update
    const updatedExpenses = [created, ...expenses];
    setExpenses(updatedExpenses);
    try {
      localStorage.setItem(`splitnest_expenses_${chatId || 'default'}`, JSON.stringify(updatedExpenses));
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

  const handleRemoveMember = async (memberNameToRemove: string) => {
    if (!memberNameToRemove) return;
    const cleanTarget = memberNameToRemove.trim();
    const targetLower = cleanTarget.toLowerCase().replace(/^@/, '');

    // 1. Optimistic local state update
    const updatedUsers = registeredUsers.filter(u => {
      const uName = (u.username || '').toLowerCase().replace(/^@/, '');
      const fName = (u.firstName || u.name || '').toLowerCase();
      const uId = String(u.userId || '').toLowerCase();
      return uName !== targetLower && fName !== targetLower && uId !== targetLower;
    });
    setRegisteredUsers(updatedUsers);
    try {
      localStorage.setItem(`splitnest_users_${chatId || 'default'}`, JSON.stringify(updatedUsers));
    } catch (e) {}

    // If the active viewing user was the one removed, select another remaining member
    if (activeUser.toLowerCase().replace(/^@/, '') === targetLower) {
      if (updatedUsers.length > 0) {
        setActiveUser(updatedUsers[0].firstName || updatedUsers[0].username || updatedUsers[0].name || 'User');
      }
    }

    // 2. Sync removal with Google Apps Script backend
    if (gasUrl && gasUrl.startsWith('http')) {
      try {
        const currentChatId = chatId || getChatId();
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
        if (result.status === 'success' && result.data) {
          setIsOnlineGas(true);
          if (Array.isArray(result.data.users)) {
            setRegisteredUsers(result.data.users);
            try {
              localStorage.setItem(`splitnest_users_${currentChatId || 'default'}`, JSON.stringify(result.data.users));
            } catch (e) {}
          }
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
          </div>
        ) : (
          <MiniAppView
            expenses={expenses}
            settlements={settlements}
            registeredUsers={registeredUsers}
            activeUser={activeUser}
            setActiveUser={setActiveUser}
            onAddExpense={handleAddExpense}
            onSettleUp={handleSettleUp}
            onSyncMembers={handleSyncMembers}
            onRemoveMember={handleRemoveMember}
            gasUrl={gasUrl}
            setGasUrl={setGasUrl}
            isOnlineGas={isOnlineGas}
            chatId={chatId}
          />
        )}
      </main>
    </div>
  );
}

