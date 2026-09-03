export interface RegisteredUser {
  userId: string;
  username: string;
  firstName: string;
  chatId: string;
  name?: string;
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
  splitMembers?: string[];
  createdBy: string;
  category?: string;
  chatId?: string;
  // Receipt Splitter Extended Metadata
  isReceiptSplitter?: boolean;
  merchant?: string;
  itemsBreakdown?: Array<{
    name: string;
    price: number;
    quantity: number;
    assignedTo: string[];
  }>;
  tax?: number;
  tip?: number;
  discount?: number;
}

export interface MemberPaymentDetails {
  member?: string;
  memberName?: string;
  bankName: string; // e.g. GCash, Maya, BPI, BDO, UnionBank, GoTyme, SeaBank, Cash, etc.
  bankOrWallet?: string;
  accountName: string;
  accountNumber: string;
  qrCodeUrl?: string; // Base64 data URL or Image URL
  notes?: string;
  updatedAt?: string;
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

export interface ReceiptItem {
  name: string;
  price: number;
  quantity?: number;
  selected?: boolean;
  assignedTo?: string[];
}

export interface PendingReceipt {
  id: string;
  timestamp: string;
  merchant: string;
  amount: number;
  currency: string;
  paidBy: string;
  category?: string;
  chatId?: string;
  tax?: number;
  tip?: number;
  discount?: number;
  items: ReceiptItem[];
  uploaderName?: string;
  status: 'pending' | 'submitted' | 'discarded';
  rawSummary?: string;
}

export interface ParsedReceiptData {
  merchant: string;
  total: number;
  currency: string;
  date?: string;
  category?: string;
  tax?: number;
  tip?: number;
  discount?: number;
  items: ReceiptItem[];
  summary?: string;
  imageUrl?: string;
  pendingId?: string;
}

export interface GroupChatMessage {
  id: string;
  sender: string;
  text?: string;
  isBot?: boolean;
  timestamp: string;
  receiptData?: ParsedReceiptData;
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
