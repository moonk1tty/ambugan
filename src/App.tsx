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
  if (tg?.initDataUnsafe?.chat?.id) {
    return String(tg.initDataUnsafe.chat.id);
  }
  const urlParams = new URLSearchParams(window.location.search);
  const paramChatId = urlParams.get('chat_id') || urlParams.get('chatId') || urlParams.get('start_param');
  if (paramChatId) return paramChatId;
  if (tg?.initDataUnsafe?.start_param) {
    return String(tg.initDataUnsafe.start_param);
  }
  if (tg?.initDataUnsafe?.user?.id) {
    return String(tg.initDataUnsafe.user.id);
  }
  return '';
}

export default function App() {
  const chatId = getChatId();

  const [activeUser, setActiveUser] = useState<string>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEYS.ACTIVE_USER}_${chatId}`);
    if (saved) return saved;
    return '';
  });

  const [registeredUsers, setRegisteredUsers] = useState<RegisteredUser[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEYS.REGISTERED_USERS}_${chatId}`);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* fallback */ }
    }
    return [];
  });

  const [gasUrl, setGasUrl] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.GAS_URL) || (import.meta.env.VITE_GAS_URL as string) || '';
  });

  const [isOnlineGas, setIsOnlineGas] = useState<boolean>(false);

  const [expenses, setExpenses] = useState<Expense[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEYS.EXPENSES}_${chatId}`);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* fallback */ }
    }
    return DEFAULT_EXPENSES;
  });

  const [settlements, setSettlements] = useState<Settlement[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEYS.SETTLEMENTS}_${chatId}`);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* fallback */ }
    }
    return DEFAULT_SETTLEMENTS;
  });

  // Save to localStorage scoped by chatId when state changes
  useEffect(() => {
    if (activeUser) {
      localStorage.setItem(`${STORAGE_KEYS.ACTIVE_USER}_${chatId}`, activeUser);
    }
  }, [activeUser, chatId]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEYS.REGISTERED_USERS}_${chatId}`, JSON.stringify(registeredUsers));
  }, [registeredUsers, chatId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.GAS_URL, gasUrl);
  }, [gasUrl]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEYS.EXPENSES}_${chatId}`, JSON.stringify(expenses));
  }, [expenses, chatId]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEYS.SETTLEMENTS}_${chatId}`, JSON.stringify(settlements));
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
  const fetchGasData = useCallback(async (url: string) => {
    if (!url || !url.startsWith('http')) {
      setIsOnlineGas(false);
      return;
    }

    try {
      const chatId = getChatId();
      const tg = (window as any).Telegram?.WebApp;
      const tgUser = tg?.initDataUnsafe?.user;

      let result: any;
      if (tgUser && chatId) {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'get_data',
            chatId: chatId,
            user: tgUser
          })
        });
        result = await response.json();
      } else {
        const queryUrl = chatId 
          ? `${url}?action=get_data&chatId=${encodeURIComponent(chatId)}` 
          : `${url}?action=get_data`;
        const response = await fetch(queryUrl);
        result = await response.json();
      }

      if (result.status === 'success' && result.data) {
        setIsOnlineGas(true);
        if (Array.isArray(result.data.expenses)) {
          setExpenses(result.data.expenses);
        }
        if (Array.isArray(result.data.settlements)) {
          setSettlements(result.data.settlements);
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

  // Poll / Sync from GAS on mount or when gasUrl changes
  useEffect(() => {
    if (gasUrl) {
      fetchGasData(gasUrl);
    } else {
      setIsOnlineGas(false);
    }
  }, [gasUrl, fetchGasData]);

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
        />
      </main>
    </div>
  );
}

