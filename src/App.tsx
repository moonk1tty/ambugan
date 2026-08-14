import React, { useState, useEffect, useCallback } from 'react';
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

const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbzBu8cufpEzEl9vZHTj4wajJn_Ax5bfFL9hN3yT5xg/exec';

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
    return localStorage.getItem(STORAGE_KEYS.GAS_URL) || (import.meta.env.VITE_GAS_URL as string) || DEFAULT_GAS_URL;
  });

  const [isOnlineGas, setIsOnlineGas] = useState<boolean>(false);

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
  const fetchGasData = useCallback(async (url: string, targetChatId?: string) => {
    if (!url || !url.startsWith('http')) {
      setIsOnlineGas(false);
      return;
    }

    try {
      const currentChatId = targetChatId || getChatId();
      const tg = (window as any).Telegram?.WebApp;
      const tgUser = tg?.initDataUnsafe?.user;

      let result: any;
      if (tgUser && currentChatId) {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'get_data',
            chatId: currentChatId,
            user: tgUser
          })
        });
        result = await response.json();
      } else {
        const queryUrl = currentChatId 
          ? `${url}?action=get_data&chatId=${encodeURIComponent(currentChatId)}` 
          : `${url}?action=get_data`;
        const response = await fetch(queryUrl);
        result = await response.json();
      }

      if (result.status === 'success' && result.data) {
        setIsOnlineGas(true);
        if (Array.isArray(result.data.expenses)) {
          setExpenses(result.data.expenses);
        } else {
          setExpenses([]);
        }
        if (Array.isArray(result.data.settlements)) {
          setSettlements(result.data.settlements);
        } else {
          setSettlements([]);
        }
        if (Array.isArray(result.data.users)) {
          setRegisteredUsers(result.data.users);
        }
      } else {
        setIsOnlineGas(false);
      }
    } catch (err) {
      console.warn('Google Apps Script fetch error:', err);
      setIsOnlineGas(false);
    }
  }, []);

  // Sync state from local cache and trigger fresh fetch whenever chatId or gasUrl updates
  useEffect(() => {
    if (!chatId) return;

    // Load local storage for this specific chatId
    const keyExpenses = `${STORAGE_KEYS.EXPENSES}_${chatId}`;
    const savedExp = localStorage.getItem(keyExpenses);
    if (savedExp) {
      try { setExpenses(JSON.parse(savedExp)); } catch (e) { setExpenses([]); }
    } else {
      setExpenses([]);
    }

    const keySettlements = `${STORAGE_KEYS.SETTLEMENTS}_${chatId}`;
    const savedSet = localStorage.getItem(keySettlements);
    if (savedSet) {
      try { setSettlements(JSON.parse(savedSet)); } catch (e) { setSettlements([]); }
    } else {
      setSettlements([]);
    }

    const keyUsers = `${STORAGE_KEYS.REGISTERED_USERS}_${chatId}`;
    const savedUsers = localStorage.getItem(keyUsers);
    if (savedUsers) {
      try { setRegisteredUsers(JSON.parse(savedUsers)); } catch (e) { setRegisteredUsers([]); }
    } else {
      setRegisteredUsers([]);
    }

    const keyUser = `${STORAGE_KEYS.ACTIVE_USER}_${chatId}`;
    const savedUser = localStorage.getItem(keyUser);
    if (savedUser) {
      setActiveUser(savedUser);
    } else {
      const tg = (window as any).Telegram?.WebApp;
      if (tg?.initDataUnsafe?.user) {
        const tgUser = tg.initDataUnsafe.user;
        const name = tgUser.first_name || tgUser.username || `User ${tgUser.id}`;
        setActiveUser(name);
      }
    }

    // Fetch fresh data from Google Apps Script endpoint for this chatId
    if (gasUrl) {
      fetchGasData(gasUrl, chatId);
    }
  }, [chatId, gasUrl, fetchGasData]);

  const handleAddExpense = async (newExp: Omit<Expense, 'id' | 'timestamp'>) => {
    const created: Expense = {
      ...newExp,
      id: 'EXP-' + Date.now(),
      timestamp: new Date().toISOString()
    };

    // Optimistic local state update
    setExpenses(prev => [created, ...prev]);

    // Send to GAS backend if URL is configured
    if (gasUrl && gasUrl.startsWith('http')) {
      try {
        const chatId = getChatId();
        const tg = (window as any).Telegram?.WebApp;
        const tgUser = tg?.initDataUnsafe?.user;

        const response = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'add_expense',
            expense: created,
            chatId: chatId,
            user: tgUser
          })
        });
        const result = await response.json();
        if (result.status === 'success' && result.data) {
          setIsOnlineGas(true);
          if (Array.isArray(result.data.expenses)) {
            setExpenses(result.data.expenses);
          }
          if (Array.isArray(result.data.users)) {
            setRegisteredUsers(result.data.users);
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

    // Optimistic local state update
    setSettlements(prev => [created, ...prev]);

    // Send to GAS backend if URL is configured
    if (gasUrl && gasUrl.startsWith('http')) {
      try {
        const chatId = getChatId();
        const tg = (window as any).Telegram?.WebApp;
        const tgUser = tg?.initDataUnsafe?.user;

        const response = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'settle_up',
            settlement: created,
            chatId: chatId,
            user: tgUser
          })
        });
        const result = await response.json();
        if (result.status === 'success' && result.data) {
          setIsOnlineGas(true);
          if (Array.isArray(result.data.settlements)) {
            setSettlements(result.data.settlements);
          }
          if (Array.isArray(result.data.users)) {
            setRegisteredUsers(result.data.users);
          }
        }
      } catch (err) {
        console.warn('Failed to sync settlement with Google Apps Script backend:', err);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F7F4] text-[#1B1B19] font-sans flex flex-col selection:bg-[#4A6CF7] selection:text-white">
      {/* Centered Telegram Mini App View */}
      <main className="w-full max-w-[440px] mx-auto flex-1 flex flex-col">
        <MiniAppView
          expenses={expenses}
          settlements={settlements}
          registeredUsers={registeredUsers}
          activeUser={activeUser}
          setActiveUser={setActiveUser}
          onAddExpense={handleAddExpense}
          onSettleUp={handleSettleUp}
          gasUrl={gasUrl}
          setGasUrl={setGasUrl}
          isOnlineGas={isOnlineGas}
          chatId={chatId}
        />
      </main>
    </div>
  );
}

