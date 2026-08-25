export interface RegisteredUser {
  userId: string;
  username: string;
  firstName: string;
  chatId: string;
  lastSeen?: string;
}

export interface Expense {
  id: string;
  timestamp: string;
  description: string;
  amount: number;
  paidBy: string;
  currency?: string; // Default '₱'
  splitMode: 'Equal' | '50/50 Equal' | 'Exact Amounts' | 'Percentages' | 'Single Payer (100% owed)' | string;
  userAShare?: number;
  userBShare?: number;
  userAPercent?: number;
  userBPercent?: number;
  shares?: Record<string, number>;
  percentages?: Record<string, number>;
  singleOwer?: string;
  createdBy: string;
  category?: string;
  chatId?: string;
}

export interface Settlement {
  id: string;
  timestamp: string;
  payer: string;
  receiver: string;
  amount: number;
  currency?: string; // Default '₱'
  method: string;
  chatId?: string;
}

export interface TelegramUser {
  id: number;
  first_name: string;
  username: string;
  photo_url?: string;
}

export interface GroupChatMessage {
  id: string;
  sender: string;
  text?: string;
  isBot?: boolean;
  timestamp: string;
  receiptData?: {
    merchant: string;
    total: number;
    category: string;
    date: string;
    imageUrl?: string;
  };
}

export function formatAmount(val: number | string | undefined | null, decimals: number = 2): string {
  if (val === undefined || val === null || val === '') return '0.00';
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, ''));
  if (isNaN(num)) return '0.00';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}
