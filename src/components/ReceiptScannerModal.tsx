import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, Upload, Sparkles, X, Check, Loader2, RefreshCw, 
  Receipt, Store, Calendar, Tag, AlertCircle, ShoppingBag, Plus, Trash2, ArrowRight, Clock
} from 'lucide-react';
import { ParsedReceiptData, ReceiptItem, formatAmount } from '../types';
import { compressReceiptImage } from '../lib/imageUtils';
import { scanReceiptWithAI } from '../lib/ocrService';

interface ReceiptScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyReceipt: (data: {
    description: string;
    amount: number;
    category: string;
    items: ReceiptItem[];
    currency: string;
  }) => void;
  onOpenItemizedSplitter?: (data: ParsedReceiptData) => void;
  groupMembers?: string[];
  activeGasUrl?: string;
  activeChatId?: string;
}

const SAMPLE_RECEIPTS = [
  {
    title: 'Cafe & Bakery Bill',
    merchant: 'Artisan Cafe & Bakery',
    total: 485.00,
    currency: '₱',
    category: 'Food & Drink',
    imageUrl: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80',
    items: [
      { name: 'Iced Spanish Latte (Grande)', price: 185.00, quantity: 1, selected: true },
      { name: 'Cold Brew Oatmilk', price: 170.00, quantity: 1, selected: true },
      { name: 'Almond Croissant', price: 130.00, quantity: 1, selected: true }
    ]
  },
  {
    title: 'Supermarket Groceries',
    merchant: 'Metro Gourmet Mart',
    total: 1340.50,
    currency: '₱',
    category: 'Groceries',
    imageUrl: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=800&q=80',
    items: [
      { name: 'Fresh Milk 1L (2x)', price: 195.00, quantity: 2, selected: true },
      { name: 'Sourdough Bread', price: 165.00, quantity: 1, selected: true },
      { name: 'Organic Chicken Breast 1kg', price: 420.50, quantity: 1, selected: true },
      { name: 'Avocados & Greens', price: 280.00, quantity: 1, selected: true },
      { name: 'Snack Assortment', price: 280.00, quantity: 1, selected: true }
    ]
  },
  {
    title: 'Italian Bistro Dinner',
    merchant: 'Trattoria Bella Vista',
    total: 2150.00,
    currency: '₱',
    category: 'Food & Drink',
    imageUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80',
    items: [
      { name: 'Truffle Mushroom Pasta', price: 580.00, quantity: 1, selected: true },
      { name: 'Quattro Formaggi Pizza', price: 650.00, quantity: 1, selected: true },
      { name: 'Crispy Calamari Fritti', price: 420.00, quantity: 1, selected: true },
      { name: 'San Pellegrino Sparkling (2x)', price: 300.00, quantity: 2, selected: true },
      { name: 'Tiramisu Classico', price: 200.00, quantity: 1, selected: true }
    ]
  }
];

export const ReceiptScannerModal: React.FC<ReceiptScannerModalProps> = ({
  isOpen,
  onClose,
  onApplyReceipt,
  onOpenItemizedSplitter,
  groupMembers = [],
  activeGasUrl,
  activeChatId
}) => {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState<'idle' | 'analyzing' | 'parsed'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rateLimitSeconds, setRateLimitSeconds] = useState<number | null>(null);
  const [parsedData, setParsedData] = useState<ParsedReceiptData | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Compress image client-side to 1280px / ~150KB for fast transfer & low token usage
      const { base64, mimeType } = await compressReceiptImage(file, 1280, 0.85);
      setImagePreview(base64);
      processImageWithAI(base64, mimeType);
    } catch (err: any) {
      console.error("Compression error:", err);
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setImagePreview(base64);
        processImageWithAI(base64, file.type);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSelectSample = (sample: typeof SAMPLE_RECEIPTS[0]) => {
    setErrorMsg(null);
    setRateLimitSeconds(null);
    setParsedData({
      merchant: sample.merchant,
      date: new Date().toISOString().split('T')[0],
      total: sample.total,
      currency: sample.currency,
      category: sample.category,
      items: sample.items.map(it => ({ ...it, selected: true })),
      summary: `Scanned sample receipt from ${sample.merchant}`
    });
    setScanStep('parsed');
  };

  const processImageWithAI = async (base64Image: string, mimeType: string = 'image/jpeg') => {
    setIsScanning(true);
    setScanStep('analyzing');
    setErrorMsg(null);
    setRateLimitSeconds(null);

    try {
      const result = await scanReceiptWithAI({
        fileOrBase64: base64Image,
        mimeType: mimeType || 'image/jpeg',
        gasUrl: activeGasUrl
      });

      if (result.isRateLimit) {
        const retrySec = result.retryAfter || 20;
        setRateLimitSeconds(retrySec);
        setErrorMsg(`Gemini rate limit reached. Auto-ready in ${retrySec}s, or select a sample receipt below.`);
        setIsScanning(false);
        setScanStep('idle');
        return;
      }

      if (result.success && result.receipt) {
        const r = result.receipt;
        setParsedData({
          merchant: r.merchant || 'Unknown Merchant',
          date: r.date || new Date().toISOString().split('T')[0],
          total: Number(r.total) || 0,
          currency: r.currency || '₱',
          category: r.category || 'Food & Drink',
          items: (r.items || []).map((it: any) => ({
            name: it.name || 'Item',
            price: Number(it.price) || 0,
            quantity: Number(it.quantity) || 1,
            selected: true
          })),
          summary: r.summary,
          tax: Number(r.tax) || 0,
          tip: Number(r.tip) || 0,
          discount: Number(r.discount) || 0
        });
        setScanStep('parsed');
        setIsScanning(false);
        return;
      }

      throw new Error(result.error || 'Unable to read receipt contents.');
    } catch (err: any) {
      console.error('OCR scan error:', err);
      setErrorMsg(err.message || 'Unable to parse receipt image. You can still select a sample receipt or enter items manually.');
      setIsScanning(false);
      setScanStep('idle');
    }
  };

  const handleToggleItem = (index: number) => {
    if (!parsedData) return;
    const nextItems = [...parsedData.items];
    nextItems[index].selected = !nextItems[index].selected;
    
    // Recalculate total of selected items
    const selectedTotal = nextItems
      .filter(it => it.selected)
      .reduce((sum, it) => sum + (it.price || 0), 0);

    setParsedData({
      ...parsedData,
      items: nextItems,
      total: selectedTotal > 0 ? selectedTotal : parsedData.total
    });
  };

  const handleApply = () => {
    if (!parsedData) return;
    
    const selectedItems = parsedData.items.filter(it => it.selected !== false);
    const finalAmount = selectedItems.length > 0
      ? selectedItems.reduce((acc, it) => acc + (Number(it.price) || 0), 0)
      : parsedData.total;

    onApplyReceipt({
      description: parsedData.merchant ? `Receipt: ${parsedData.merchant}` : 'Receipt Expense',
      amount: Number(finalAmount.toFixed(2)),
      category: parsedData.category || 'Food & Drink',
      items: selectedItems,
      currency: parsedData.currency || '₱'
    });

    onClose();
  };

  const handleReset = () => {
    setImagePreview(null);
    setParsedData(null);
    setScanStep('idle');
    setErrorMsg(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#F8F7F4] border border-black/10 rounded-[32px] w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-[#1B1B19]">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between bg-[#F8F7F4] sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#1B1B19] text-white flex items-center justify-center text-xs shadow-md">
              <Sparkles className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-bold text-[#1B1B19] text-sm">Receipt Scanner</h3>
                <span className="px-1.5 py-0.2 text-[9px] font-mono font-bold bg-[#4A6CF7]/10 text-[#4A6CF7] rounded-md">
                  AI OCR
                </span>
              </div>
              <p className="text-[10px] text-[#1B1B19]/60 font-mono">Extract merchant, line items & amounts</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-black/5 hover:bg-black/10 text-[#1B1B19]/60 hover:text-[#1B1B19] flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          
          {errorMsg && (
            <div className={`p-3.5 rounded-2xl flex items-start gap-2.5 text-xs ${
              rateLimitSeconds ? 'bg-amber-50 border border-amber-200/80 text-amber-900' : 'bg-rose-50 border border-rose-200/80 text-rose-800'
            }`}>
              {rateLimitSeconds ? (
                <Clock className="w-4 h-4 shrink-0 text-amber-600 mt-0.5 animate-pulse" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              )}
              <div className="flex-1 space-y-1">
                <span className="font-medium">{errorMsg}</span>
                {rateLimitSeconds && (
                  <div className="text-[11px] font-mono font-semibold text-amber-800">
                    Auto-ready in: {rateLimitSeconds}s
                  </div>
                )}
              </div>
              <button onClick={() => { setErrorMsg(null); setRateLimitSeconds(null); }} className="text-black/40 hover:text-black cursor-pointer p-1">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {scanStep === 'idle' && (
            <div className="space-y-4">
              {/* Upload Dropzone */}
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-black/15 hover:border-[#4A6CF7] bg-white/70 hover:bg-white rounded-2xl p-7 text-center cursor-pointer transition duration-200 group flex flex-col items-center justify-center gap-2.5 shadow-xs"
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="image/*" 
                  capture="environment"
                  className="hidden" 
                />
                <div className="w-12 h-12 rounded-2xl bg-black/5 group-hover:bg-[#4A6CF7]/10 text-[#1B1B19] group-hover:text-[#4A6CF7] flex items-center justify-center transition-transform group-hover:scale-105">
                  <Camera className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-[#1B1B19] group-hover:text-[#4A6CF7]">
                    Take a Photo or Upload Receipt
                  </p>
                  <p className="text-[10px] text-[#1B1B19]/50 font-mono mt-0.5">
                    Supports JPG, PNG, WEBP, or camera capture
                  </p>
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-black/5 text-[#1B1B19] rounded-xl text-xs font-mono font-medium border border-black/5">
                  <Upload className="w-3 h-3" />
                  <span>Select Image</span>
                </div>
              </div>

              {/* Model Notice / Disclaimer Note */}
              <p className="text-[11px] text-[#1B1B19]/60 font-sans leading-relaxed text-center px-2">
                Try at your own risk, but don't get mad at me. It's slow because I'm using a free model – it would be much more efficient if you enter everything manually 😅
              </p>

              {/* Sample Presets */}
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/60 font-semibold mb-2 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  Or Try Sample Receipts
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {SAMPLE_RECEIPTS.map((sample, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSelectSample(sample)}
                      className="p-3 bg-white/80 hover:bg-white border border-black/5 hover:border-black/20 rounded-2xl text-left transition hover:scale-[1.01] flex flex-col justify-between shadow-xs cursor-pointer"
                    >
                      <div>
                        <span className="text-[10px] font-mono text-[#4A6CF7] block truncate font-bold">{sample.title}</span>
                        <span className="text-xs text-[#1B1B19] font-bold block truncate mt-0.5">{sample.merchant}</span>
                      </div>
                      <div className="mt-2 pt-2 border-t border-black/5 flex items-center justify-between text-[10px] font-mono">
                        <span className="text-[#1B1B19]/50">{sample.items.length} items</span>
                        <span className="font-bold text-emerald-700">{sample.currency}{formatAmount(sample.total)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {scanStep === 'analyzing' && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-black/5 flex items-center justify-center text-[#1B1B19]">
                  <Loader2 className="w-8 h-8 animate-spin text-[#4A6CF7]" />
                </div>
                <Sparkles className="w-4 h-4 text-amber-400 absolute -top-1 -right-1 animate-bounce" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-[#1B1B19]">AI OCR is Analyzing Receipt</h4>
                <p className="text-xs text-[#1B1B19]/60 max-w-xs mx-auto">
                  Extracting merchant name, line items, prices, and totals...
                </p>
              </div>
            </div>
          )}

          {scanStep === 'parsed' && parsedData && (
            <div className="space-y-3.5">
              {/* Summary Header Card */}
              <div className="p-4 bg-white/90 border border-black/10 rounded-2xl space-y-2.5 shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/60 font-semibold flex items-center gap-1">
                      <Store className="w-3 h-3 text-[#4A6CF7]" /> Merchant / Store
                    </span>
                    <input 
                      type="text" 
                      value={parsedData.merchant}
                      onChange={(e) => setParsedData({ ...parsedData, merchant: e.target.value })}
                      className="bg-transparent text-sm font-bold text-[#1B1B19] border-b border-dashed border-black/20 focus:border-[#4A6CF7] outline-none pb-0.5 mt-0.5 w-full"
                    />
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/50 block">
                      Total Extracted
                    </span>
                    <span className="text-base font-extrabold font-mono text-emerald-700">
                      {parsedData.currency}{formatAmount(parsedData.total)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-black/5 text-xs">
                  <div className="flex items-center gap-1 bg-black/5 px-2 py-0.5 rounded-lg text-[#1B1B19]/80 font-mono text-[10px]">
                    <Calendar className="w-3 h-3 text-[#1B1B19]/50" />
                    <span>{parsedData.date || 'Today'}</span>
                  </div>
                  <div className="flex items-center gap-1 bg-black/5 px-2 py-0.5 rounded-lg text-[#1B1B19]/80 font-mono text-[10px]">
                    <Tag className="w-3 h-3 text-[#4A6CF7]" />
                    <span>{parsedData.category || 'Food & Drink'}</span>
                  </div>
                  <button
                    onClick={handleReset}
                    className="ml-auto text-[10px] font-mono text-[#1B1B19]/60 hover:text-[#1B1B19] flex items-center gap-1 px-2 py-0.5 hover:bg-black/5 rounded-lg transition cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" /> Rescan
                  </button>
                </div>
              </div>

              {/* Line Items Checklist */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-[10px] font-mono uppercase tracking-wider text-[#1B1B19]/60 font-semibold flex items-center gap-1">
                    <ShoppingBag className="w-3 h-3 text-[#4A6CF7]" />
                    Line Items ({parsedData.items.length})
                  </h4>
                  <span className="text-[10px] font-mono text-[#1B1B19]/50">Toggle to include</span>
                </div>

                {parsedData.items.length === 0 ? (
                  <div className="p-3 bg-black/5 rounded-xl text-center text-xs text-[#1B1B19]/60">
                    No individual line items parsed. Full receipt total will be used.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {parsedData.items.map((item, idx) => (
                      <div 
                        key={idx}
                        onClick={() => handleToggleItem(idx)}
                        className={`p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between shadow-xs ${
                          item.selected !== false
                            ? 'bg-white border-black/15 text-[#1B1B19]'
                            : 'bg-black/5 border-transparent text-[#1B1B19]/40 opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-4 h-4 rounded flex items-center justify-center text-[10px] ${
                            item.selected !== false ? 'bg-[#1B1B19] text-white' : 'border border-black/20'
                          }`}>
                            {item.selected !== false && <Check className="w-3 h-3" />}
                          </div>
                          <span className="text-xs font-semibold truncate">{item.name}</span>
                        </div>
                        <span className="text-xs font-bold font-mono shrink-0 ml-2">
                          {parsedData.currency}{formatAmount(item.price)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-[#F8F7F4] border-t border-black/5 flex flex-wrap items-center justify-between gap-2">
          <button 
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl text-xs font-mono font-medium text-[#1B1B19]/60 hover:text-[#1B1B19] hover:bg-black/5 transition cursor-pointer"
          >
            Cancel
          </button>

          {scanStep === 'parsed' && parsedData && (
            <div className="flex items-center gap-2">
              {onOpenItemizedSplitter && (
                <button 
                  onClick={() => {
                    onOpenItemizedSplitter(parsedData);
                    onClose();
                  }}
                  className="px-4 py-2 rounded-xl bg-[#1B1B19] hover:bg-black text-white text-xs font-mono font-bold shadow-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Receipt className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Assign Dishes to Members</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}

              <button 
                onClick={handleApply}
                className="px-3.5 py-2 rounded-xl bg-black/5 hover:bg-black/10 text-[#1B1B19] border border-black/5 text-xs font-mono font-semibold flex items-center gap-1 transition cursor-pointer"
              >
                <span>Quick Total</span>
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
