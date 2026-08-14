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
  splitMode: '50/50 Equal' | 'Exact Amounts' | 'Percentages' | 'Single Payer (100% owed)';
  userAShare?: number;
  userBShare?: number;
  userAPercent?: number;
  userBPercent?: number;
  createdBy: string;
  category: string;
}

export interface Settlement {
  id: string;
  timestamp: string;
  payer: string;
  receiver: string;
  amount: number;
  currency?: string; // Default '₱'
  method: string;
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
