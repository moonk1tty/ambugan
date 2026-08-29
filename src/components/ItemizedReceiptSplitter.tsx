import React, { useState, useEffect, useRef } from 'react';
import { 
  Receipt, Sparkles, Camera, Plus, Trash2, Check, User, 
  Calculator, AlertCircle, RefreshCw, X, CheckCircle2,
  DollarSign, ArrowRight, Layers, FileText, ArrowUpDown, Clock
} from 'lucide-react';
import { ReceiptItem, ParsedReceiptData, formatAmount } from '../types';
import { compressReceiptImage } from '../lib/imageUtils';
import { scanReceiptWithAI } from '../lib/ocrService';

export interface SplitItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  assignedMembers: string[]; // List of user names/IDs sharing this item
}

interface ItemizedReceiptSplitterProps {
  onSaveToLedger: (expenseData: {
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
  }) => void;
  groupMembers: string[];
  initialReceiptData?: ParsedReceiptData | null;
  defaultPayer?: string;
  defaultCurrency?: string;
  onOpenScanner?: () => void;
  onSwitchToQuickEntry?: () => void;
  isOpenModal?: boolean;
  onCloseModal?: () => void;
  gasUrl?: string;
}

export const ItemizedReceiptSplitter: React.FC<ItemizedReceiptSplitterProps> = ({
  onSaveToLedger,
  groupMembers = [],
  initialReceiptData = null,
  defaultPayer = '',
  defaultCurrency = '₱',
  onOpenScanner,
  onSwitchToQuickEntry,
  isOpenModal = false,
  onCloseModal,
  gasUrl
}) => {
  // Members list (ensure at least 2 default names if empty)
  const members = groupMembers.length > 0 ? groupMembers : ['Kate', 'Alex', 'Sam'];

  // Form State - empty by default
  const [merchant, setMerchant] = useState<string>('');
  const [currency, setCurrency] = useState<string>(defaultCurrency || '₱');
  const [paidBy, setPaidBy] = useState<string>(defaultPayer || members[0] || '');
  const [category, setCategory] = useState<string>('Food & Drink');

  // Items - empty by default
  const [items, setItems] = useState<SplitItem[]>([]);

  // Extra charges - 0 by default
  const [tax, setTax] = useState<number>(0.00);
  const [tip, setTip] = useState<number>(0.00);
  const [discount, setDiscount] = useState<number>(0.00);
  const [taxDistributionMode, setTaxDistributionMode] = useState<'proportional' | 'even'>('proportional');

  // Real OCR State
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanSuccessMsg, setScanSuccessMsg] = useState<string | null>(null);
  const [rateLimitSeconds, setRateLimitSeconds] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New Item Input State (for quick manual addition)
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');

  // Keep paidBy in sync if default changes
  useEffect(() => {
    if (defaultPayer && members.includes(defaultPayer)) {
      setPaidBy(defaultPayer);
    }
  }, [defaultPayer]);

  useEffect(() => {
    if (defaultCurrency) {
      setCurrency(defaultCurrency);
    }
  }, [defaultCurrency]);

  const loadParsedReceipt = (data: ParsedReceiptData) => {
    if (data.merchant) setMerchant(data.merchant);
    if (data.currency) setCurrency(data.currency);
    if (data.category) setCategory(data.category);
    if (typeof data.tax === 'number') setTax(data.tax);
    if (typeof data.tip === 'number') setTip(data.tip);
    if (typeof data.discount === 'number') setDiscount(data.discount);

    if (data.items && data.items.length > 0) {
      const converted: SplitItem[] = data.items.map((it, idx) => ({
        id: `ocr-item-${idx}-${Date.now()}`,
        name: it.name || `Item ${idx + 1}`,
        price: Number(it.price) || 0,
        quantity: Number(it.quantity) || 1,
        assignedMembers: it.assignedTo && it.assignedTo.length > 0 
          ? it.assignedTo 
          : (members.length > 0 ? [...members] : ['Kate'])
      }));
      setItems(converted);
    }
  };

  // Load initial receipt if provided
  useEffect(() => {
    if (initialReceiptData) {
      loadParsedReceipt(initialReceiptData);
    }
  }, [initialReceiptData]);

  // Rate limit countdown effect
  useEffect(() => {
    if (rateLimitSeconds === null || rateLimitSeconds <= 0) return;
    const timer = setInterval(() => {
      setRateLimitSeconds(prev => {
        if (prev === null || prev <= 1) return null;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [rateLimitSeconds]);

  // Demo receipt loader for instant testing without API quota limits
  const loadDemoReceipt = (type: 'italian' | 'ramen' | 'cafe') => {
    setScanError(null);
    setRateLimitSeconds(null);
    if (type === 'italian') {
      // Philippine Restaurant with 10% Service Charge & PWD Discount + VAT Exemption
      loadParsedReceipt({
        merchant: 'Manam Comfort Filipino',
        total: 1540.00,
        currency: '₱',
        category: 'Food & Drink',
        tax: 0.00, // In PH, 12% VAT is already in SKU item prices
        tip: 140.00, // 10% Service Charge
        discount: 180.00, // PWD Discount + VAT Exemption deduction
        items: [
          { name: '🍲 House Crispy Sisig (Large)', price: 540.00, quantity: 1, assignedTo: [...members] },
          { name: '🍚 Garlic Sinangag Rice Platter', price: 260.00, quantity: 1, assignedTo: [...members] },
          { name: '🍖 Sinigang na Beef Short Rib & Watermelon', price: 620.00, quantity: 1, assignedTo: [members[0] || 'Kate', members[1] || 'Alex'] },
          { name: '🥤 Ube Sago Shake (2x)', price: 300.00, quantity: 2, assignedTo: [members[0] || 'Kate', members[2] || 'Sam'] }
        ]
      });
      setScanSuccessMsg('✨ Loaded sample Manam receipt (10% SC & PWD/VAT Exemption applied).');
    } else if (type === 'ramen') {
      loadParsedReceipt({
        merchant: 'Ippudo Ramen Bar (BGC)',
        total: 1480.00,
        currency: '₱',
        category: 'Food & Drink',
        tax: 0.00, // 12% VAT included in Ramen prices
        tip: 130.00, // 10% Service Charge
        discount: 0,
        items: [
          { name: '🍜 Shiromaru Classic Ramen', price: 495.00, quantity: 1, assignedTo: [members[0] || 'Kate'] },
          { name: '🍜 Akamaru Shinaji Ramen', price: 535.00, quantity: 1, assignedTo: [members[1] || 'Alex'] },
          { name: '🥟 Hakata Gyoza (5 pcs)', price: 240.00, quantity: 1, assignedTo: [...members] },
          { name: '🥤 Cold Hojicha Green Tea', price: 80.00, quantity: 1, assignedTo: [members[0] || 'Kate'] }
        ]
      });
      setScanSuccessMsg('✨ Loaded sample Ramen Bar receipt with Service Charge.');
    } else {
      loadParsedReceipt({
        merchant: 'Wildflour Cafe + Bakery',
        total: 1195.00,
        currency: '₱',
        category: 'Food & Drink',
        tax: 0.00, // VAT inclusive
        tip: 110.00, // Service Charge
        discount: 95.00, // Senior / PWD & VAT exemption
        items: [
          { name: '☕ Oat Milk Honey Latte', price: 240.00, quantity: 1, assignedTo: [members[0] || 'Kate'] },
          { name: '🥐 Salted Egg Croissant', price: 195.00, quantity: 1, assignedTo: [members[0] || 'Kate'] },
          { name: '🍳 Wildflour Breakfast Platter', price: 590.00, quantity: 1, assignedTo: [members[1] || 'Alex'] },
          { name: '🍰 Carrot Cake Slice', price: 160.00, quantity: 1, assignedTo: [...members] }
        ]
      });
      setScanSuccessMsg('✨ Loaded sample Cafe receipt with PWD/VAT exemption.');
    }
    setTimeout(() => setScanSuccessMsg(null), 4000);
  };

  // Real OCR File Handler with client compression
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setScanError(null);
    setScanSuccessMsg(null);
    setRateLimitSeconds(null);

    try {
      const result = await scanReceiptWithAI({
        fileOrBase64: file,
        gasUrl: gasUrl
      });

      if (result.isRateLimit) {
        const retrySec = result.retryAfter || 20;
        setRateLimitSeconds(retrySec);
        setScanError(`Gemini free tier rate limit reached. Auto-ready in ${retrySec}s, or select a sample receipt below.`);
        return;
      }

      if (result.success && result.receipt) {
        const parsed = result.receipt;
        loadParsedReceipt({
          merchant: parsed.merchant || file.name.replace(/\.[^/.]+$/, ""),
          total: Number(parsed.total) || 0,
          currency: parsed.currency || currency,
          category: parsed.category || 'Food & Drink',
          tax: Number(parsed.tax) || 0,
          tip: Number(parsed.tip) || 0,
          discount: Number(parsed.discount) || 0,
          items: (parsed.items || []).map((it: any) => ({
            name: it.name || 'Item',
            price: Number(it.price) || 0,
            quantity: Number(it.quantity) || 1,
            assignedTo: [...members]
          }))
        });
        setScanSuccessMsg(`✨ OCR Vision extracted ${parsed.items?.length || 0} items from ${parsed.merchant || 'receipt'}`);
        setTimeout(() => setScanSuccessMsg(null), 4000);
      } else {
        throw new Error(result.error || 'Could not parse receipt contents.');
      }
    } catch (err: any) {
      console.error('Real OCR Upload Error:', err);
      setScanError(err.message || 'Failed to read receipt. You can enter dishes manually below.');
    } finally {
      setIsScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Item Management
  const handleToggleMemberForItem = (itemId: string, memberName: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const isAssigned = item.assignedMembers.includes(memberName);
      const updated = isAssigned 
        ? item.assignedMembers.filter(m => m !== memberName)
        : [...item.assignedMembers, memberName];
      return { ...item, assignedMembers: updated };
    }));
  };

  const handleSelectAllForMember = (itemId: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      return { ...item, assignedMembers: [...members] };
    }));
  };

  const handleSelectNoneForMember = (itemId: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      return { ...item, assignedMembers: [] };
    }));
  };

  const handleItemFieldChange = (itemId: string, field: 'name' | 'price' | 'quantity', value: any) => {
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      return { ...item, [field]: value };
    }));
  };

  const handleDeleteItem = (itemId: string) => {
    setItems(prev => prev.filter(item => item.id !== itemId));
  };

  const handleAddNewItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    const priceNum = parseFloat(newItemPrice) || 0;
    if (priceNum <= 0) return;

    const newItem: SplitItem = {
      id: `custom-item-${Date.now()}`,
      name: newItemName.trim(),
      price: priceNum,
      quantity: 1,
      assignedMembers: [...members]
    };

    setItems(prev => [...prev, newItem]);
    setNewItemName('');
    setNewItemPrice('');
  };

  // Calculations
  const foodSubtotal = items.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
  const extraTotal = (Number(tax) || 0) + (Number(tip) || 0) - (Number(discount) || 0);
  const grandTotal = Math.max(0, foodSubtotal + extraTotal);

  // Per-member calculation logic
  const memberBreakdowns: Record<string, {
    foodShare: number;
    extraShare: number;
    totalOwed: number;
    itemsAssigned: string[];
  }> = {};

  // Initialize
  members.forEach(m => {
    memberBreakdowns[m] = {
      foodShare: 0,
      extraShare: 0,
      totalOwed: 0,
      itemsAssigned: []
    };
  });

  // 1. Calculate food share per item
  items.forEach(item => {
    const assignedCount = item.assignedMembers.length;
    if (assignedCount > 0) {
      const sharePerPerson = (Number(item.price) || 0) / assignedCount;
      item.assignedMembers.forEach(m => {
        if (!memberBreakdowns[m]) {
          memberBreakdowns[m] = { foodShare: 0, extraShare: 0, totalOwed: 0, itemsAssigned: [] };
        }
        memberBreakdowns[m].foodShare += sharePerPerson;
        memberBreakdowns[m].itemsAssigned.push(item.name);
      });
    }
  });

  // 2. Distribute tax, tip, discount
  const activeParticipants = members.filter(m => memberBreakdowns[m].foodShare > 0);

  members.forEach(m => {
    let extraShare = 0;
    if (extraTotal !== 0) {
      if (taxDistributionMode === 'proportional') {
        if (foodSubtotal > 0) {
          extraShare = (memberBreakdowns[m].foodShare / foodSubtotal) * extraTotal;
        }
      } else {
        // Even split across active participants
        if (activeParticipants.length > 0 && memberBreakdowns[m].foodShare > 0) {
          extraShare = extraTotal / activeParticipants.length;
        }
      }
    }
    memberBreakdowns[m].extraShare = extraShare;
    memberBreakdowns[m].totalOwed = Math.max(0, memberBreakdowns[m].foodShare + extraShare);
  });

  // Final shares map for ledger
  const computedShares: Record<string, number> = {};
  members.forEach(m => {
    computedShares[m] = Number((memberBreakdowns[m]?.totalOwed || 0).toFixed(2));
  });

  // Save to Ledger
  const handleSave = () => {
    if (items.length === 0) {
      setScanError('Please add at least one item or dish to split.');
      return;
    }

    const unassignedItems = items.filter(it => it.assignedMembers.length === 0);
    if (unassignedItems.length > 0) {
      setScanError(`Please assign at least one member to "${unassignedItems[0].name}".`);
      return;
    }

    onSaveToLedger({
      description: merchant.trim() ? `Receipt: ${merchant.trim()}` : 'Itemized Receipt',
      amount: Number(grandTotal.toFixed(2)),
      paidBy: paidBy || members[0],
      currency,
      category,
      shares: computedShares,
      itemsBreakdown: items.map(it => ({
        name: it.name,
        price: it.price,
        quantity: it.quantity,
        assignedTo: it.assignedMembers
      })),
      tax: Number(tax) || 0,
      tip: Number(tip) || 0,
      discount: Number(discount) || 0
    });

    if (onCloseModal) {
      onCloseModal();
    }
  };

  const content = (
    <div className="space-y-4">
      {/* Real OCR Action Bar */}
      <div className="bg-white/80 backdrop-blur-md border border-black/5 rounded-[24px] p-4 shadow-xs flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[#1B1B19]/60 font-semibold">
            <Receipt className="w-3.5 h-3.5 text-[#4A6CF7]" />
            <span>Itemized Dish Splitter</span>
          </div>
          <p className="text-xs text-[#1B1B19]/70 mt-0.5">
            Assign individual items to members with automatic proportional tax & tip.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            accept="image/*" 
            className="hidden" 
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isScanning}
            className="px-3 py-1.5 bg-[#1B1B19] hover:bg-black text-white rounded-xl text-xs font-mono font-semibold transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
          >
            {isScanning ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#4A6CF7]" />
                <span>Reading Receipt...</span>
              </>
            ) : (
              <>
                <Camera className="w-3.5 h-3.5 text-amber-400" />
                <span>Upload Receipt (AI OCR)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Notifications & Rate Limit Recovery Banner */}
      {scanSuccessMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200/80 rounded-2xl flex items-center gap-2.5 text-emerald-800 text-xs animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span className="font-medium">{scanSuccessMsg}</span>
        </div>
      )}

      {scanError && (
        <div className="p-3.5 bg-amber-50 border border-amber-200/80 rounded-2xl space-y-2.5 text-xs animate-in fade-in">
          <div className="flex items-start gap-2.5 text-amber-900">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
            <div className="flex-1 space-y-1">
              <div className="font-semibold text-[#1B1B19]">
                {rateLimitSeconds ? 'Gemini API Rate Limit (Free Tier)' : 'OCR Notice'}
              </div>
              <p className="text-amber-800 leading-relaxed">{scanError}</p>
            </div>
            <button 
              onClick={() => { setScanError(null); setRateLimitSeconds(null); }} 
              className="text-amber-600 hover:text-amber-900 cursor-pointer p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Action buttons: Rate limit countdown or sample loaders */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-200/60">
            {rateLimitSeconds && rateLimitSeconds > 0 ? (
              <div className="flex items-center gap-1.5 text-[11px] font-mono font-semibold text-amber-900 bg-amber-100/80 px-2.5 py-1 rounded-lg">
                <Clock className="w-3.5 h-3.5 animate-pulse text-amber-700" />
                <span>Ready to scan again in {rateLimitSeconds}s</span>
              </div>
            ) : null}

            <span className="text-[10px] font-mono text-[#1B1B19]/50 uppercase tracking-wider">Sample Receipts:</span>
            <button
              type="button"
              onClick={() => loadDemoReceipt('italian')}
              className="px-2.5 py-1 bg-white hover:bg-black/5 text-[#1B1B19] border border-black/10 rounded-lg text-[11px] font-mono font-medium transition cursor-pointer"
            >
              🇵🇭 Manam (10% SC + PWD/VAT Exemption)
            </button>
            <button
              type="button"
              onClick={() => loadDemoReceipt('ramen')}
              className="px-2.5 py-1 bg-white hover:bg-black/5 text-[#1B1B19] border border-black/10 rounded-lg text-[11px] font-mono font-medium transition cursor-pointer"
            >
              🍜 Ippudo Ramen (Service Charge)
            </button>
            <button
              type="button"
              onClick={() => loadDemoReceipt('cafe')}
              className="px-2.5 py-1 bg-white hover:bg-black/5 text-[#1B1B19] border border-black/10 rounded-lg text-[11px] font-mono font-medium transition cursor-pointer"
            >
              🥐 Wildflour Cafe
            </button>
          </div>
        </div>
      )}

      {/* ┌────────────────────────────────────────────────────────┐
          │ 🧾 Trattoria Bella                                     │
          │ Total: $56.50 • Paid by: [ Kate ▼ ]                    │
          └────────────────────────────────────────────────────────┘ */}
      <div className="bg-white/80 backdrop-blur-md border border-black/5 rounded-[24px] p-5 shadow-xs space-y-3.5">
        <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#1B1B19]/60 font-semibold flex justify-between items-center">
          <span>Receipt Header</span>
          <span className="text-[9px] text-[#1B1B19]/40 font-normal">Step 1 of 3</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* Merchant Input */}
          <div className="sm:col-span-2 space-y-1">
            <label className="block text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/60">
              Receipt / Merchant
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-sm">🧾</span>
              <input
                type="text"
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                placeholder="e.g. Trattoria Bella"
                className="w-full bg-white border border-black/10 pl-9 pr-3 py-2 rounded-xl text-xs font-semibold text-[#1B1B19] focus:outline-none focus:ring-2 focus:ring-[#4A6CF7]/20"
              />
            </div>
          </div>

          {/* Paid By */}
          <div className="space-y-1">
            <label className="block text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/60">
              Paid By
            </label>
            <select
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
              className="w-full bg-white border border-black/10 px-3 py-2 rounded-xl text-xs font-semibold text-[#1B1B19] focus:outline-none focus:ring-2 focus:ring-[#4A6CF7]/20 cursor-pointer"
            >
              {members.map((m, idx) => (
                <option key={idx} value={m}>👤 {m}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Currency & Summary Banner */}
        <div className="pt-2.5 border-t border-black/5 flex items-center justify-between text-xs flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase text-[#1B1B19]/50">Currency:</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="bg-black/5 border border-black/5 px-2 py-0.5 rounded-lg text-xs font-mono font-bold text-[#1B1B19] focus:outline-none cursor-pointer"
            >
              <option value="₱">₱ (PHP)</option>
              <option value="$">$ (USD)</option>
              <option value="€">€ (EUR)</option>
              <option value="£">£ (GBP)</option>
              <option value="¥">¥ (JPY)</option>
              <option value="S$">S$ (SGD)</option>
              <option value="A$">A$ (AUD)</option>
            </select>
          </div>

          <div className="flex items-center gap-2 font-mono">
            <span className="text-[11px] text-[#1B1B19]/60">Food Subtotal: <strong>{currency}{formatAmount(foodSubtotal)}</strong></span>
            <span>•</span>
            <span className="text-sm font-bold text-[#1B1B19]">
              Total: <strong className="text-emerald-700">{currency}{formatAmount(grandTotal)}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* ┌────────────────────────────────────────────────────────┐
          │ 🍝 ITEM ROWS: "Who shared this?"                       │
          │    [👤 Kate ✓]  [👤 Alex ✓]  [👤 Sam ]                 │
          └────────────────────────────────────────────────────────┘ */}
      <div className="bg-white/80 backdrop-blur-md border border-black/5 rounded-[24px] p-5 shadow-xs space-y-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#1B1B19]/60 font-semibold flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            <span>Dishes & Items ({items.length})</span>
          </div>
          <span className="text-[9px] text-[#1B1B19]/40 font-normal">Assign per dish</span>
        </div>

        <div className="space-y-2.5">
          {items.length === 0 ? (
            <div className="text-center py-7 px-4 bg-black/[0.02] border border-dashed border-black/10 rounded-2xl space-y-2">
              <div className="w-10 h-10 rounded-2xl bg-black/5 flex items-center justify-center mx-auto text-[#1B1B19]/50">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-[#1B1B19]">No items in receipt yet</p>
                <p className="text-[10px] text-[#1B1B19]/50 font-mono mt-0.5 max-w-xs mx-auto">
                  Upload a receipt photo above for AI OCR extraction, or add dishes manually below.
                </p>
              </div>
            </div>
          ) : (
            items.map((item, idx) => {
              const assignedCount = item.assignedMembers.length;
              const sharePerPerson = assignedCount > 0 ? item.price / assignedCount : 0;

              return (
                <div 
                  key={item.id}
                  className="bg-white border border-black/10 hover:border-black/20 rounded-2xl p-3.5 space-y-2.5 shadow-xs transition min-w-0 overflow-hidden"
                >
                  {/* Dish Name & Line Price */}
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => handleItemFieldChange(item.id, 'name', e.target.value)}
                        className="bg-transparent font-semibold text-[#1B1B19] text-xs sm:text-sm focus:outline-none focus:bg-black/5 px-2 py-1 rounded-lg w-full min-w-0 border-b border-transparent focus:border-[#4A6CF7]"
                        placeholder="Dish or item name"
                      />
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs font-mono text-[#1B1B19]/50">{currency}</span>
                      <input
                        type="number"
                        step="0.01"
                        value={item.price}
                        onChange={(e) => handleItemFieldChange(item.id, 'price', parseFloat(e.target.value) || 0)}
                        className="w-20 bg-black/5 border border-black/10 focus:border-[#4A6CF7] rounded-xl px-2 py-1 text-right text-xs font-mono font-bold text-[#1B1B19] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-1.5 hover:bg-rose-50 text-[#1B1B19]/40 hover:text-rose-600 rounded-xl transition ml-1 cursor-pointer"
                        title="Remove item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Who shared this? Member selector chips */}
                  <div className="pt-2 border-t border-black/5">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/60">
                        Who shared this?
                      </span>
                      <div className="flex items-center gap-1.5 text-[10px] font-mono">
                        <button
                          type="button"
                          onClick={() => handleSelectAllForMember(item.id)}
                          className="text-[#4A6CF7] hover:underline font-bold"
                        >
                          All
                        </button>
                        <span className="text-[#1B1B19]/20">•</span>
                        <button
                          type="button"
                          onClick={() => handleSelectNoneForMember(item.id)}
                          className="text-[#1B1B19]/50 hover:text-[#1B1B19]"
                        >
                          None
                        </button>
                      </div>
                    </div>

                    {/* Splitnest Member Chips */}
                    <div className="flex flex-wrap gap-1.5">
                      {members.map((member) => {
                        const isSelected = item.assignedMembers.includes(member);
                        return (
                          <button
                            key={member}
                            type="button"
                            onClick={() => handleToggleMemberForItem(item.id, member)}
                            className={`px-3 py-1 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-[#1B1B19] text-white font-semibold shadow-xs'
                                : 'bg-black/5 hover:bg-black/10 text-[#1B1B19]/70 border border-black/5'
                            }`}
                          >
                            <span>👤 {member}</span>
                            {isSelected && <Check className="w-3 h-3 text-emerald-400" />}
                          </button>
                        );
                      })}
                    </div>

                    {/* Sub-Share Note */}
                    <div className="mt-2 text-[11px] font-mono flex items-center justify-between text-[#1B1B19]/70 bg-black/5 px-2.5 py-1.5 rounded-xl min-w-0">
                      {assignedCount === 0 ? (
                        <span className="text-rose-600 flex items-center gap-1 font-semibold truncate">
                          <AlertCircle className="w-3 h-3 shrink-0" /> Unassigned (Select at least 1 person)
                        </span>
                      ) : assignedCount === members.length ? (
                        <span className="text-[#1B1B19]/80 font-medium truncate">
                          Split evenly: <strong>{currency}{formatAmount(sharePerPerson)} each</strong>
                        </span>
                      ) : (
                        <span className="truncate">
                          {item.assignedMembers.map(m => `${m}: ${currency}${formatAmount(sharePerPerson)}`).join(', ')}
                        </span>
                      )}

                      <span className="text-[10px] text-[#1B1B19]/40 font-semibold shrink-0 ml-2">
                        ({assignedCount}/{members.length})
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* Quick Add Custom Item Form (Responsive, full-width, zero overspill) */}
          <form 
            onSubmit={handleAddNewItem} 
            className="w-full max-w-full bg-black/5 border border-dashed border-black/15 rounded-2xl p-2.5 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center min-w-0"
          >
            <div className="flex-1 min-w-0">
              <input
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder="➕ Dish or item name (e.g. Garlic Bread)"
                className="w-full min-w-0 bg-white border border-black/10 rounded-xl px-3 py-2 text-xs text-[#1B1B19] focus:outline-none focus:ring-2 focus:ring-[#4A6CF7]/20 placeholder:text-[#1B1B19]/40"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1 bg-white border border-black/10 rounded-xl px-2.5 py-1.5 flex-1 sm:flex-initial">
                <span className="text-xs text-[#1B1B19]/50 font-mono">{currency}</span>
                <input
                  type="number"
                  step="0.01"
                  value={newItemPrice}
                  onChange={(e) => setNewItemPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-20 bg-transparent text-xs font-mono font-bold text-[#1B1B19] text-right focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={!newItemName.trim() || !newItemPrice}
                className="px-4 py-2 bg-[#1B1B19] hover:bg-black disabled:opacity-30 text-white rounded-xl text-xs font-mono font-semibold transition flex items-center justify-center gap-1 cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Item</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ┌────────────────────────────────────────────────────────┐
          │ ➕ Service Charge ($140) & PWD/VAT Discount (-$180)    │
          │    🔘 Distribute proportionally to food total          │
          │    ⚪ Split evenly across all participants              │
          └────────────────────────────────────────────────────────┘ */}
      <div className="bg-white/80 backdrop-blur-md border border-black/5 rounded-[24px] p-5 shadow-xs space-y-3.5">
        <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#1B1B19]/60 font-semibold flex justify-between items-center">
          <span>Service Charge, Discounts & Taxes</span>
          <span className={`text-xs font-mono font-bold ${extraTotal >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
            {extraTotal >= 0 ? `+${currency}${formatAmount(extraTotal)}` : `-${currency}${formatAmount(Math.abs(extraTotal))}`}
          </span>
        </div>

        {/* Inputs with Philippine VAT guidance */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-mono font-medium text-[#1B1B19]/70">
                Service Charge (SC) / Tip
              </label>
              <span className="text-[9px] font-mono text-[#4A6CF7] font-semibold">Added</span>
            </div>
            <div className="flex items-center bg-white border border-black/10 rounded-xl px-2.5 py-1.5 focus-within:border-[#4A6CF7]">
              <span className="text-xs text-[#1B1B19]/40 font-mono mr-1">{currency}</span>
              <input
                type="number"
                step="0.01"
                value={tip}
                onChange={(e) => setTip(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full bg-transparent text-xs font-mono font-bold text-[#1B1B19] focus:outline-none"
              />
            </div>
            <span className="text-[9px] text-[#1B1B19]/40 font-mono mt-0.5 block">e.g. 5%–10% restaurant SC</span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-mono font-medium text-[#1B1B19]/70">
                PWD / SC / VAT Exemption (-)
              </label>
              <span className="text-[9px] font-mono text-rose-600 font-semibold">Deducted</span>
            </div>
            <div className="flex items-center bg-white border border-black/10 rounded-xl px-2.5 py-1.5 focus-within:border-rose-400">
              <span className="text-xs text-[#1B1B19]/40 font-mono mr-1">{currency}</span>
              <input
                type="number"
                step="0.01"
                value={discount}
                onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full bg-transparent text-xs font-mono font-bold text-rose-600 focus:outline-none"
              />
            </div>
            <span className="text-[9px] text-[#1B1B19]/40 font-mono mt-0.5 block">PWD 20% + VAT Exemption</span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-mono font-medium text-[#1B1B19]/70">
                Additional Tax (if exclusive)
              </label>
              <span className="text-[9px] font-mono text-[#1B1B19]/40">Optional</span>
            </div>
            <div className="flex items-center bg-white border border-black/10 rounded-xl px-2.5 py-1.5 focus-within:border-[#4A6CF7]">
              <span className="text-xs text-[#1B1B19]/40 font-mono mr-1">{currency}</span>
              <input
                type="number"
                step="0.01"
                value={tax}
                onChange={(e) => setTax(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full bg-transparent text-xs font-mono font-bold text-[#1B1B19] focus:outline-none"
              />
            </div>
            <span className="text-[9px] text-emerald-700/80 font-mono mt-0.5 block">🇵🇭 0.00 in PH (VAT in items)</span>
          </div>
        </div>

        {/* VAT Info Pill */}
        <div className="px-3 py-2 bg-black/[0.02] border border-black/5 rounded-xl flex items-center gap-2 text-[10px] font-mono text-[#1B1B19]/60">
          <span className="text-xs">💡</span>
          <span>
            <strong>PH Tax Note:</strong> 12% VAT is already incorporated into menu items and receipt line prices. Only Service Charge and PWD/SC + VAT Exemption discounts adjust the final bill.
          </span>
        </div>

        {/* Distribution Strategy Radio Options */}
        <div className="pt-2 border-t border-black/5 space-y-2">
          <label className="text-[10px] font-mono text-[#1B1B19]/60 uppercase tracking-wider block">
            Distribution Mode
          </label>

          <div className="space-y-2 text-xs">
            <label 
              onClick={() => setTaxDistributionMode('proportional')}
              className={`flex items-start gap-2.5 p-3 rounded-2xl border cursor-pointer transition ${
                taxDistributionMode === 'proportional'
                  ? 'bg-[#4A6CF7]/5 border-[#4A6CF7]/30 text-[#1B1B19]'
                  : 'bg-white border-black/10 text-[#1B1B19]/70 hover:border-black/20'
              }`}
            >
              <input 
                type="radio" 
                name="taxDistMode" 
                checked={taxDistributionMode === 'proportional'} 
                onChange={() => setTaxDistributionMode('proportional')}
                className="mt-0.5 text-[#4A6CF7] focus:ring-0 cursor-pointer" 
              />
              <div className="space-y-0.5">
                <p className="font-semibold text-xs text-[#1B1B19] flex items-center gap-1.5">
                  <span>🔘 Distribute proportionally to food total</span>
                  <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-md font-mono font-bold">
                    Recommended
                  </span>
                </p>
                <p className="text-[10px] text-[#1B1B19]/60 leading-tight">
                  Members who ordered more food pay a fair, proportional share of tax and tip.
                </p>
              </div>
            </label>

            <label 
              onClick={() => setTaxDistributionMode('even')}
              className={`flex items-start gap-2.5 p-3 rounded-2xl border cursor-pointer transition ${
                taxDistributionMode === 'even'
                  ? 'bg-[#4A6CF7]/5 border-[#4A6CF7]/30 text-[#1B1B19]'
                  : 'bg-white border-black/10 text-[#1B1B19]/70 hover:border-black/20'
              }`}
            >
              <input 
                type="radio" 
                name="taxDistMode" 
                checked={taxDistributionMode === 'even'} 
                onChange={() => setTaxDistributionMode('even')}
                className="mt-0.5 text-[#4A6CF7] focus:ring-0 cursor-pointer" 
              />
              <div className="space-y-0.5">
                <p className="font-semibold text-xs text-[#1B1B19]">⚪ Split evenly across all participants</p>
                <p className="text-[10px] text-[#1B1B19]/60 leading-tight">
                  Divides total tax & tip into equal shares among all active participants.
                </p>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* ┌────────────────────────────────────────────────────────┐
          │ 📊 Final Calculation Breakdown:                        │
          │    • Kate owes: $15.42                                 │
          │    • Alex owes: $15.42                                 │
          │    • Sam owes:  $25.66                                 │
          └────────────────────────────────────────────────────────┘ */}
      <div className="bg-white/80 backdrop-blur-md border border-black/5 rounded-[24px] p-5 shadow-xs space-y-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#1B1B19]/60 font-semibold flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            <Calculator className="w-3.5 h-3.5 text-[#4A6CF7]" />
            <span>Final Calculation Breakdown</span>
          </div>
          <span className="text-[10px] font-mono text-[#1B1B19]/50">
            Payer: <strong className="text-[#1B1B19]">{paidBy}</strong>
          </span>
        </div>

        {/* Individual Breakdown List */}
        <div className="space-y-2 pt-1">
          {members.map((member) => {
            const b = memberBreakdowns[member];
            const isPayer = member === paidBy;
            const owed = b?.totalOwed || 0;

            return (
              <div 
                key={member}
                className="bg-white border border-black/10 rounded-2xl p-3 flex items-center justify-between text-xs shadow-xs"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-black/5 text-[#1B1B19] font-bold text-xs flex items-center justify-center uppercase">
                    {member.replace(/^@/, '').substring(0, 2)}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-[#1B1B19]">{member}</span>
                      {isPayer && (
                        <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-md font-bold font-mono">
                          Paid {currency}{formatAmount(grandTotal)}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-[#1B1B19]/60 font-mono">
                      Food: {currency}{formatAmount(b?.foodShare || 0)} + Tax/Tip: {currency}{formatAmount(b?.extraShare || 0)}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-[#1B1B19]/50 font-mono block">owes</span>
                  <span className="text-sm font-extrabold font-mono text-emerald-700">
                    {currency}{formatAmount(owed)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Total Balance Sum Check */}
        <div className="pt-2.5 border-t border-black/5 flex items-center justify-between text-xs font-mono text-[#1B1B19]/70">
          <span className="text-[11px]">Sum of All Member Shares:</span>
          <span className="font-bold text-[#1B1B19]">
            {currency}{formatAmount(Object.values(computedShares).reduce((a, b) => a + b, 0))}
          </span>
        </div>
      </div>

      {/* ┌────────────────────────────────────────────────────────┐
          │ [  ✓ Save & Record to Group Ledger  ]                  │
          └────────────────────────────────────────────────────────┘ */}
      <button 
        type="button"
        onClick={handleSave}
        className="w-full bg-[#1B1B19] hover:bg-black text-white font-mono uppercase tracking-wider py-3.5 rounded-2xl font-bold text-xs transition shadow-md flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.005]"
      >
        <Check className="w-4 h-4 text-emerald-400" />
        <span>Save & Record to Group Ledger ({currency}{formatAmount(grandTotal)})</span>
      </button>
    </div>
  );

  // If used inside a modal
  if (isOpenModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-md animate-in fade-in duration-200">
        <div className="bg-[#F8F7F4] border border-black/10 rounded-[32px] w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-[#1B1B19]">
          <div className="px-5 py-4 border-b border-black/5 bg-[#F8F7F4] flex items-center justify-between sticky top-0 z-20">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#1B1B19] text-white flex items-center justify-center text-xs shadow-md">
                <Receipt className="w-4 h-4 text-white" />
              </div>
              <div>
                <h4 className="font-bold text-[#1B1B19] text-sm">Receipt Splitter</h4>
                <p className="text-[10px] text-[#1B1B19]/60 font-mono">Itemized multi-person split</p>
              </div>
            </div>
            {onCloseModal && (
              <button 
                onClick={onCloseModal}
                className="w-7 h-7 rounded-full bg-black/5 hover:bg-black/10 text-[#1B1B19]/60 hover:text-[#1B1B19] flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="p-5 overflow-y-auto flex-1 scrollbar-thin">
            {content}
          </div>
        </div>
      </div>
    );
  }

  // Otherwise return inline content
  return content;
};
