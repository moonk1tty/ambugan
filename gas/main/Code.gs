/**
 * ==============================================================================
 * SPLITNEST TELEGRAM BOT & GOOGLE SHEETS BACKEND — [MAIN / PRODUCTION]
 * ==============================================================================
 * 
 * Environment: MAIN / PRODUCTION
 * 
 * Features:
 * 1. Gemini AI Receipt OCR Scanner:
 *    - Instant vision OCR on photos sent in Telegram group chat or via Mini App.
 *    - Extracts merchant, total, currency, items, and categories into structured data.
 * 2. Live Telegram API Group Member Fetching:
 *    - Queries Telegram Bot API (getChatAdministrators) live from Telegram.
 *    - Auto-registers any member who opens the Mini App or chats in the group.
 * 3. Strict Group Chat Isolation:
 *    - Each Telegram group has a completely unique Splitnest ledger.
 *    - Expenses, settlements, and member dropdowns are strictly isolated by chatId.
 * 4. Anti-Spam Protection:
 *    - Deduplicates webhook updates and throttles /start and welcome join messages.
 * 5. Real-time Group Expense & Settlement Telegram Notifications.
 */

// ==============================================================================
// 1. CONFIGURATION — MAIN / PRODUCTION
// ==============================================================================
var TELEGRAM_BOT_TOKEN = "8949508191:AAEnVE-w0bbqICLi_CJYkqiEXcbGkUcMi3I";
var SPREADSHEET_ID = "106hKhXEEObyEbWJDxu0dFax-fKUIiDmkO1klpPPSJuM";
var MINI_APP_URL = "https://t.me/splitnest_bot/ambugan";
var GEMINI_API_KEY = "AQ.Ab8RN6J7JovDJB5hcMs0ynYxPuBv1F9bDnSEeGPUQWSa5qK2_g";

// SHEET TAB NAMES
var SHEET_EXPENSES = "Expenses";
var SHEET_SETTLEMENTS = "Settlements";
var SHEET_USERS = "Users";

var TELEGRAM_API_BASE = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN;

// Cached Spreadsheet instance per execution
var _cachedSpreadsheet = null;
var _sheetsChecked = false;
var _blacklistMapCache = {};
var _chatTitleCache = {};

// ==============================================================================
// 2. SPREADSHEET DATABASE INITIALIZATION
// ==============================================================================

function getDbSpreadsheet() {
  if (_cachedSpreadsheet) return _cachedSpreadsheet;
  var ss;
  if (SPREADSHEET_ID && SPREADSHEET_ID.trim() !== "" && SPREADSHEET_ID !== "YOUR_SPREADSHEET_ID_HERE") {
    try {
      ss = SpreadsheetApp.openById(SPREADSHEET_ID.trim());
    } catch(e) {
      Logger.log("Error opening spreadsheet by ID: " + e.toString());
      ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.create("splitnest Expense Database (Main)");
    }
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.create("splitnest Expense Database (Main)");
  }

  ensureSheetsExist(ss);
  _cachedSpreadsheet = ss;
  return ss;
}

function ensureSheetsExist(ss) {
  if (_sheetsChecked) return;
  _sheetsChecked = true;

  try {
    var expSheet = ss.getSheetByName(SHEET_EXPENSES);
    if (!expSheet) {
      expSheet = ss.insertSheet(SHEET_EXPENSES);
      expSheet.appendRow([
        "Timestamp", "ID", "Description", "Amount", "Currency", "PaidBy", 
        "SplitMode", "UserAShare", "UserBShare", "UserAPercent", "UserBPercent", 
        "CreatedBy", "Category", "ChatID", "SplitData"
      ]);
      try { expSheet.getRange(1, 1, 1, 15).setFontWeight("bold").setBackground("#e8f0fe"); } catch(e){}
    }

    var setSheet = ss.getSheetByName(SHEET_SETTLEMENTS);
    if (!setSheet) {
      setSheet = ss.insertSheet(SHEET_SETTLEMENTS);
      setSheet.appendRow(["Timestamp", "ID", "Payer", "Receiver", "Amount", "Currency", "Method", "ChatID"]);
      try { setSheet.getRange(1, 1, 1, 8).setFontWeight("bold").setBackground("#e6f4ea"); } catch(e){}
    }

    var usrSheet = ss.getSheetByName(SHEET_USERS);
    if (!usrSheet) {
      usrSheet = ss.insertSheet(SHEET_USERS);
      usrSheet.appendRow(["UserID", "UserName", "FirstName", "ChatID", "LastSeen"]);
      try { usrSheet.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#feefc3"); } catch(e){}
    }
  } catch (err) {
    Logger.log("ensureSheetsExist warning: " + err.toString());
  }
}

function getExpensesSheet() { return getDbSpreadsheet().getSheetByName(SHEET_EXPENSES); }
function getSettlementsSheet() { return getDbSpreadsheet().getSheetByName(SHEET_SETTLEMENTS); }
function getUsersSheet() { return getDbSpreadsheet().getSheetByName(SHEET_USERS); }

// ==============================================================================
// 3. GEMINI AI OCR RECEIPT SCANNING ENGINE
// ==============================================================================

function scanReceiptWithGemini(base64Image, mimeType) {
  var apiKey = GEMINI_API_KEY;
  if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY_HERE") {
    return { ok: false, error: "GEMINI_API_KEY is not configured in Code.gs" };
  }
  
  var cleanMime = mimeType || "image/jpeg";
  var cleanBase64 = base64Image || "";
  if (cleanBase64.indexOf("base64,") !== -1) {
    var parts = cleanBase64.split("base64,");
    cleanBase64 = parts[1];
    var mimeMatch = parts[0].match(/data:([^;]+);/);
    if (mimeMatch) cleanMime = mimeMatch[1];
  }

  // Model: gemini-2.5-flash or gemini-3.7-flash REST endpoint
  var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey;
  
  var prompt = "You are an expert OCR receipt and bill parser for a shared expense-splitting app (Splitnest). " +
    "Analyze this receipt or bill image accurately. " +
    "Extract and return ONLY a valid JSON object with this exact structure:\n" +
    "{\n" +
    '  "merchant": "Store or Restaurant name (string)",\n' +
    '  "total": 123.45,\n' +
    '  "currency": "₱",\n' +
    '  "date": "YYYY-MM-DD",\n' +
    '  "category": "Food & Drink",\n' +
    '  "tax": 0.00,\n' +
    '  "tip": 0.00,\n' +
    '  "items": [\n' +
    '    { "name": "Item name", "price": 12.50, "quantity": 1 }\n' +
    '  ],\n' +
    '  "summary": "Short 1-sentence description"\n' +
    "}\n" +
    "Note on currency: Default to '₱' if in Philippine pesos, or '$' / '€' / '¥' if indicated on the receipt. " +
    "Categories: 'Food & Drink', 'Groceries', 'Shopping', 'Entertainment', 'Transport', 'Utilities', 'General'. " +
    "Strictly output only raw JSON without markdown fences.";

  var payload = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: cleanMime,
              data: cleanBase64
            }
          },
          {
            text: prompt
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json"
    }
  };

  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var res = UrlFetchApp.fetch(url, options);
    var resText = res.getContentText();
    var json = JSON.parse(resText);
    
    if (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts) {
      var rawResult = json.candidates[0].content.parts[0].text;
      rawResult = rawResult.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
      var parsed = JSON.parse(rawResult);
      return { ok: true, data: parsed };
    } else {
      return { ok: false, error: "Gemini Vision OCR could not parse image", raw: resText };
    }
  } catch (err) {
    return { ok: false, error: err.toString() };
  }
}

// ==============================================================================
// 4. HTTP GET HANDLER
// ==============================================================================

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "get_data";
    var chatId = (e && e.parameter) ? (e.parameter.chatId || e.parameter.chat_id || "") : "";
    var cleanChatId = normalizeChatId(chatId);

    if (action === "clear_queue" || action === "drop_updates" || action === "reset_webhook") {
      var clearRes = clearTelegramWebhookQueue();
      return createJsonResponse({ status: "success", message: "Telegram queue cleared & webhook reset", result: clearRes });
    }

    if (action === "cleanup_triggers" || action === "delete_triggers") {
      var triggerRes = deleteAllProjectTriggers();
      return createJsonResponse({ status: "success", message: "Project triggers cleaned up", result: triggerRes });
    }

    if (action === "set_webhook") {
      var webhookRes = setWebhook();
      return createJsonResponse({ status: "success", message: "Webhook registration executed", result: webhookRes });
    }

    if (action === "get_webhook_info" || action === "webhook_info") {
      var infoRes = UrlFetchApp.fetch(TELEGRAM_API_BASE + "/getWebhookInfo", { muteHttpExceptions: true });
      var infoJson = JSON.parse(infoRes.getContentText());
      return createJsonResponse({ status: "success", webhookInfo: infoJson });
    }

    if (action === "test_message" && cleanChatId) {
      var testRes = sendTelegramMessage(cleanChatId, "🔔 <b>splitnest Test Notification (Main)</b>\n\nYour Telegram bot is successfully connected!", getAppReplyMarkup(cleanChatId));
      return createJsonResponse({ status: "success", result: testRes });
    }

    if (action === "status") {
      var botInfo = {};
      try {
        var meRes = UrlFetchApp.fetch(TELEGRAM_API_BASE + "/getMe");
        botInfo = JSON.parse(meRes.getContentText());
      } catch (err) {
        botInfo = { error: err.toString() };
      }
      return createJsonResponse({
        status: "success",
        environment: "MAIN / PRODUCTION",
        tokenConfigured: Boolean(TELEGRAM_BOT_TOKEN),
        spreadsheetId: SPREADSHEET_ID,
        botInfo: botInfo
      });
    }

    var groupTitle = (e && e.parameter) ? (e.parameter.groupTitle || e.parameter.chat_title || "") : "";
    var allData = getAllData(cleanChatId, groupTitle);
    return createJsonResponse({ status: "success", data: allData });
  } catch (err) {
    Logger.log("doGet fatal error: " + err.toString());
    return createJsonResponse({ status: "error", message: err.toString() });
  }
}

// ==============================================================================
// 5. HTTP POST HANDLER
// ==============================================================================

function doPost(e) {
  var postData = "";
  try {
    if (e && e.postData && e.postData.contents) {
      postData = e.postData.contents;
    }
  } catch (err) {
    return createJsonResponse({ status: "error", message: "Failed to read request body: " + err.toString() });
  }

  if (!postData) {
    return createJsonResponse({ status: "error", message: "Empty POST body" });
  }

  var payload;
  try {
    payload = JSON.parse(postData);
  } catch (err) {
    return createJsonResponse({ status: "error", message: "Invalid JSON format: " + err.toString() });
  }

  // Handle Telegram Webhook
  if (payload.update_id !== undefined || payload.message || payload.my_chat_member || payload.callback_query) {
    return handleTelegramUpdate(payload);
  }

  var action = payload.action;
  var chatId = normalizeChatId(payload.chatId || payload.chat_id || "");

  // OCR Receipt Scan Action via API
  if (action === "scan_receipt" || action === "ocr_receipt") {
    var imageBase64 = payload.image || payload.base64 || payload.data;
    var mime = payload.mimeType || "image/jpeg";
    if (!imageBase64) return createJsonResponse({ status: "error", message: "Missing image base64 data" });

    var ocrResult = scanReceiptWithGemini(imageBase64, mime);
    if (ocrResult.ok) {
      return createJsonResponse({ status: "success", data: ocrResult.data, receipt: ocrResult.data });
    } else {
      return createJsonResponse({ status: "error", message: ocrResult.error || "OCR scan failed" });
    }
  }

  if (action === "get_data") {
    var groupTitle = payload.groupTitle || payload.chat_title || "";
    var currentData = getAllData(chatId, groupTitle);
    return createJsonResponse({ status: "success", data: currentData });
  }

  if (action === "add_expense" || action === "log_expense") {
    var expense = payload.expense;
    if (!expense) return createJsonResponse({ status: "error", message: "Missing expense payload" });

    saveExpenseToSheet(expense, chatId);

    if (chatId) {
      if (expense.paidBy) registerSimpleName(chatId, expense.paidBy);
      if (expense.createdBy) registerSimpleName(chatId, expense.createdBy);
      if (expense.singleOwer) registerSimpleName(chatId, expense.singleOwer);
      if (expense.splitMembers && Array.isArray(expense.splitMembers)) {
        for (var m = 0; m < expense.splitMembers.length; m++) {
          registerSimpleName(chatId, expense.splitMembers[m]);
        }
      }
    }

    if (chatId && (chatId.indexOf("-") === 0 || Number(chatId) < 0)) {
      sendExpenseGroupNotification(chatId, expense);
    }

    var updatedData = getAllData(chatId);
    return createJsonResponse({ status: "success", message: "Expense recorded successfully", data: updatedData });
  }

  if (action === "update_expense" || action === "edit_expense") {
    var expense = payload.expense;
    if (!expense || !expense.id) return createJsonResponse({ status: "error", message: "Missing expense or expense ID" });

    var updated = updateExpenseInSheet(expense, chatId);
    if (!updated) return createJsonResponse({ status: "error", message: "Expense ID not found" });

    if (chatId && (chatId.indexOf("-") === 0 || Number(chatId) < 0)) {
      sendExpenseUpdatedGroupNotification(chatId, expense);
    }

    var updatedData = getAllData(chatId);
    return createJsonResponse({ status: "success", message: "Expense updated successfully", data: updatedData });
  }

  if (action === "delete_expense") {
    var expenseId = payload.expenseId || payload.id;
    if (!expenseId) return createJsonResponse({ status: "error", message: "Missing expenseId" });

    var deleted = deleteExpenseFromSheet(expenseId, chatId);
    if (!deleted) return createJsonResponse({ status: "error", message: "Expense ID not found" });

    var updatedData = getAllData(chatId);
    return createJsonResponse({ status: "success", message: "Expense deleted successfully", data: updatedData });
  }

  if (action === "settle_up") {
    var settlement = payload.settlement;
    if (!settlement) return createJsonResponse({ status: "error", message: "Missing settlement payload" });

    saveSettlementToSheet(settlement, chatId);

    if (chatId) {
      if (settlement.payer) registerSimpleName(chatId, settlement.payer);
      if (settlement.receiver) registerSimpleName(chatId, settlement.receiver);
    }

    if (chatId && (chatId.indexOf("-") === 0 || Number(chatId) < 0)) {
      sendSettlementGroupNotification(chatId, settlement);
    }

    var updatedData = getAllData(chatId);
    return createJsonResponse({ status: "success", message: "Settlement recorded successfully", data: updatedData });
  }

  if (action === "remove_member" || action === "delete_member") {
    var identifier = payload.username || payload.userId || payload.name || payload.member;
    if (!identifier) return createJsonResponse({ status: "error", message: "Missing member identifier" });
    removeUserFromChat(chatId, identifier);
    var updatedData = getAllData(chatId);
    return createJsonResponse({ status: "success", message: "Member removed successfully", data: updatedData, users: updatedData.users });
  }

  if (action === "register_user" || action === "add_member") {
    var memberName = payload.name || payload.userName || payload.username || payload.firstName;
    if (memberName && chatId) {
      registerSimpleName(chatId, memberName);
      var updatedData = getAllData(chatId);
      return createJsonResponse({ status: "success", message: "Member added successfully", data: updatedData, users: updatedData.users });
    }
  }

  return createJsonResponse({ status: "error", message: "Unknown action: " + action });
}

// ==============================================================================
// 6. TELEGRAM WEBHOOK HANDLER
// ==============================================================================

function handleTelegramUpdate(update) {
  if (update.update_id !== undefined) {
    try {
      var updateIdStr = String(update.update_id);
      var cache = CacheService.getScriptCache();
      if (cache && cache.get("TG_UPD_" + updateIdStr)) {
        return createJsonResponse({ ok: true, status: "duplicate_ignored" });
      }
      if (cache) cache.put("TG_UPD_" + updateIdStr, "1", 21600);
    } catch (e) {}
  }

  if (update.my_chat_member) {
    var mcm = update.my_chat_member;
    var chatId = String(mcm.chat.id);
    var cleanChatId = normalizeChatId(chatId);
    var oldStatus = mcm.old_chat_member ? mcm.old_chat_member.status : "";
    var newStatus = mcm.new_chat_member ? mcm.new_chat_member.status : "";

    var cleanChatKey = cleanChatId.replace(/[^a-zA-Z0-9_]/g, "_");
    var welcomePropKey = "JOIN_WELCOMED_" + cleanChatKey;
    var scriptProps = PropertiesService.getScriptProperties();

    if (newStatus === "kicked" || newStatus === "left") {
      try { scriptProps.deleteProperty(welcomePropKey); } catch(e){}
      return createJsonResponse({ ok: true, status: "bot_removed" });
    }

    var wasInGroup = (oldStatus === "member" || oldStatus === "administrator" || oldStatus === "restricted");
    var isNowInGroup = (newStatus === "member" || newStatus === "administrator");
    var alreadyWelcomed = (scriptProps.getProperty(welcomePropKey) === "true");

    if (!wasInGroup && isNowInGroup && !alreadyWelcomed) {
      try { scriptProps.setProperty(welcomePropKey, "true"); } catch(e){}
      var welcomeText = "👋 <b>splitnest joined the group!</b>\n\n" +
                        "⚡ <b>Gemini AI Receipt Scanner Ready</b>: Send any receipt photo to scan and split instantly!\n\n" +
                        "💬 <i>Send a message or a sticker so your name registers on splitnest!</i>\n\n" +
                        "Tap below to open your group's splitnest!";
      sendTelegramMessage(chatId, welcomeText, getAppReplyMarkup(chatId));
    }
    return createJsonResponse({ ok: true, status: "my_chat_member_processed" });
  }

  var msg = update.message || update.edited_message || update.channel_post;
  if (!msg) return createJsonResponse({ ok: true, status: "no_message" });

  var chatId = String(msg.chat.id);
  var cleanChatId = normalizeChatId(chatId);

  var chatTitle = (msg.chat && msg.chat.title) ? msg.chat.title : "";
  if (chatTitle) {
    _chatTitleCache[cleanChatId] = chatTitle;
    try {
      var scriptProps = PropertiesService.getScriptProperties();
      var propKey = "CHAT_TITLE_" + cleanChatId.replace(/[^a-zA-Z0-9_]/g, "_");
      scriptProps.setProperty(propKey, chatTitle);
    } catch (e) {}
  }

  if (msg.from && !msg.from.is_bot && cleanChatId) {
    try { registerUsersBatch(cleanChatId, [msg.from]); } catch (e) {}
  }

  // ----------------------------------------------------------------------------
  // PHOTO / RECEIPT OCR PROCESSING
  // ----------------------------------------------------------------------------
  if (msg.photo && Array.isArray(msg.photo) && msg.photo.length > 0) {
    try {
      var highestPhoto = msg.photo[msg.photo.length - 1];
      var fileId = highestPhoto.file_id;
      
      sendTelegramMessage(chatId, "🔍 <i>Scanning receipt with Gemini AI...</i>");

      var getFileUrl = TELEGRAM_API_BASE + "/getFile?file_id=" + encodeURIComponent(fileId);
      var fileRes = UrlFetchApp.fetch(getFileUrl, { muteHttpExceptions: true });
      var fileJson = JSON.parse(fileRes.getContentText());

      if (fileJson.ok && fileJson.result && fileJson.result.file_path) {
        var filePath = fileJson.result.file_path;
        var downloadUrl = "https://api.telegram.org/file/bot" + TELEGRAM_BOT_TOKEN + "/" + filePath;
        var imgRes = UrlFetchApp.fetch(downloadUrl, { muteHttpExceptions: true });
        var imgBlob = imgRes.getBlob();
        var base64 = Utilities.base64Encode(imgBlob.getBytes());
        var mimeType = imgBlob.getContentType() || "image/jpeg";

        var ocrResult = scanReceiptWithGemini(base64, mimeType);
        if (ocrResult.ok && ocrResult.data) {
          var receipt = ocrResult.data;
          var merchant = receipt.merchant || "Receipt";
          var total = Number(receipt.total) || 0;
          var currency = receipt.currency || "₱";
          var category = receipt.category || "General";
          var items = Array.isArray(receipt.items) ? receipt.items : [];

          var itemLines = [];
          for (var it = 0; it < Math.min(items.length, 6); it++) {
            var itemObj = items[it];
            var itPrice = Number(itemObj.price || 0).toFixed(2);
            itemLines.push("• " + escapeHtml(itemObj.name || "Item") + " — <b>" + currency + itPrice + "</b>");
          }
          if (items.length > 6) {
            itemLines.push("• <i>+" + (items.length - 6) + " more items...</i>");
          }

          var ocrMsg = "🧾 <b>Gemini AI Receipt Scanned!</b>\n" +
                       "━━━━━━━━━━━━━\n" +
                       "🏪 <b>Merchant</b>: <b>" + escapeHtml(merchant) + "</b>\n" +
                       "💰 <b>Total</b>: <b>" + currency + total.toFixed(2) + "</b>\n" +
                       "🏷️ <b>Category</b>: " + escapeHtml(category) + "\n";
          
          if (itemLines.length > 0) {
            ocrMsg += "\n🛒 <b>Itemized Breakdown:</b>\n" + itemLines.join("\n") + "\n";
          }

          ocrMsg += "━━━━━━━━━━━━━\n" +
                    "💡 <i>Tap below to review, split, and log this receipt!</i>";

          sendTelegramMessage(chatId, ocrMsg, getAppReplyMarkup(chatId));
          return createJsonResponse({ ok: true, status: "photo_receipt_scanned", receipt: receipt });
        } else {
          sendTelegramMessage(chatId, "⚠️ Could not parse receipt details. Tap below to log the expense manually!", getAppReplyMarkup(chatId));
          return createJsonResponse({ ok: false, error: ocrResult.error });
        }
      }
    } catch (photoErr) {
      Logger.log("Error processing photo: " + photoErr.toString());
    }
  }

  var rawText = (msg.text || msg.caption || "").trim();
  if (!rawText) return createJsonResponse({ ok: true, status: "non_text_message" });

  var lowerText = rawText.toLowerCase().trim();
  var firstToken = lowerText.split(/\s+/)[0];
  var commandOnly = firstToken.split("@")[0].trim();

  // /start
  if (commandOnly === "/start" || commandOnly === "!start") {
    var startReply = "✨ <b>Welcome to splitnest!</b>\n\n" +
                     "Split bills, track shared expenses, and scan receipts with Gemini AI.\n\n" +
                     "📸 <b>Receipt OCR</b>: Send any photo of a bill to parse items & totals!\n\n" +
                     "👥 <b>Group Members Ready</b>: Tap below to open your group's expense ledger!";
    var resStart = sendTelegramMessage(chatId, startReply, getAppReplyMarkup(chatId));
    return createJsonResponse({ ok: true, status: "start_handled", sendResult: resStart });
  }

  // /help
  if (commandOnly === "/help" || commandOnly === "!help" || lowerText === "help") {
    var helpText = "📖 <b>splitnest Bot Commands:</b>\n\n" +
                   "• 📸 <b>Send a photo</b> - Gemini AI automatically scans receipt & itemized prices\n" +
                   "• <code>/balance</code> - View net balances & who owes whom\n" +
                   "• <code>/summary</code> - View total group spending & recent expense breakdown\n" +
                   "• <code>/start</code> - Open Mini App & ledger\n" +
                   "• <code>/help</code> - Show this guide\n\n" +
                   "💡 <i>Tip: Tap the button below anytime to log expenses or settle up!</i>";
    var helpRes = sendTelegramMessage(chatId, helpText, getAppReplyMarkup(chatId));
    return createJsonResponse({ ok: true, status: "help_handled", sendResult: helpRes });
  }

  // /balance or /summary
  if (commandOnly === "/balance" || commandOnly === "/balances" || commandOnly === "/bal" || 
      commandOnly === "/summary" || commandOnly === "/summaries" || lowerText === "balance" || lowerText === "summary") {
    var isSummary = (commandOnly === "/summary" || commandOnly === "/summaries" || lowerText === "summary");
    try {
      var summaryText = getGroupBalanceTextSummary(chatId, isSummary, chatTitle);
      var sendRes = sendTelegramMessage(chatId, summaryText, getAppReplyMarkup(chatId));
      return createJsonResponse({ ok: true, status: "balance_summary_handled", sendResult: sendRes });
    } catch (err) {
      Logger.log("Error generating balance summary: " + err.toString());
      var fallbackMsg = "⚠️ Could not retrieve balance right now. Please tap below to open the Mini App!";
      sendTelegramMessage(chatId, fallbackMsg, getAppReplyMarkup(chatId));
      return createJsonResponse({ ok: true, error: err.toString() });
    }
  }

  return createJsonResponse({ ok: true, status: "message_processed" });
}

// ==============================================================================
// 7. DATA HELPERS & USER REGISTRATION
// ==============================================================================

function getBlacklistSet(chatId) {
  var cleanChatId = normalizeChatId(chatId);
  if (_blacklistMapCache[cleanChatId]) return _blacklistMapCache[cleanChatId];

  var map = {};
  try {
    var scriptProps = PropertiesService.getScriptProperties();
    var blacklistKey = "BLACKLIST_" + (cleanChatId ? cleanChatId.replace(/[^a-zA-Z0-9_]/g, "_") : "GLOBAL");
    var blacklisted = (scriptProps.getProperty(blacklistKey) || "").split(",").filter(Boolean);
    for (var i = 0; i < blacklisted.length; i++) {
      var itm = blacklisted[i].toLowerCase().trim();
      map[itm] = true;
      map[itm.replace(/^@/, "")] = true;
    }
  } catch(e) {}

  _blacklistMapCache[cleanChatId] = map;
  return map;
}

function unblacklistUser(chatId, identifier) {
  if (!identifier) return;
  var cleanChatId = normalizeChatId(chatId);
  var target = String(identifier).trim().toLowerCase();
  var cleanTarget = target.replace(/^@/, "");
  try {
    var scriptProps = PropertiesService.getScriptProperties();
    var blacklistKey = "BLACKLIST_" + (cleanChatId ? cleanChatId.replace(/[^a-zA-Z0-9_]/g, "_") : "GLOBAL");
    var blacklisted = (scriptProps.getProperty(blacklistKey) || "").split(",").filter(Boolean);
    var filtered = [];
    for (var i = 0; i < blacklisted.length; i++) {
      var itm = blacklisted[i].toLowerCase().trim();
      if (itm !== target && itm !== cleanTarget && itm.replace(/^@/, "") !== cleanTarget) {
        filtered.push(blacklisted[i]);
      }
    }
    scriptProps.setProperty(blacklistKey, filtered.join(","));
    if (_blacklistMapCache[cleanChatId]) {
      delete _blacklistMapCache[cleanChatId][target];
      delete _blacklistMapCache[cleanChatId][cleanTarget];
    }
  } catch(e) {}
}

function registerSimpleName(chatId, name) {
  if (!name || !name.trim()) return;
  var cleanName = name.trim();
  var cleanChatId = normalizeChatId(chatId);
  unblacklistUser(cleanChatId, cleanName);

  var uid = "NAME-" + cleanName.replace(/[^a-zA-Z0-9]/g, "");
  var username = cleanName.startsWith("@") ? cleanName : "";
  var firstName = cleanName.startsWith("@") ? cleanName.substring(1) : cleanName;

  var sheet = getUsersSheet();
  var data = sheet.getDataRange().getValues();
  var found = false;
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rUId = String(row[0] || "").trim();
    var rUName = String(row[1] || "").trim();
    var rFName = String(row[2] || "").trim();
    var rCId = normalizeChatId(row[3]);
    if (rCId === cleanChatId) {
      if (rFName.toLowerCase() === firstName.toLowerCase() || 
          (username && rUName.toLowerCase() === username.toLowerCase()) || 
          (uid && rUId === uid)) {
        found = true;
        break;
      }
    }
  }

  if (!found) {
    var now = new Date().toISOString();
    sheet.appendRow([uid, username, firstName, cleanChatId, now]);
  }
}

function registerUsersBatch(chatId, usersList) {
  if (!usersList || usersList.length === 0) return;
  var cleanChatId = normalizeChatId(chatId);
  var sheet = getUsersSheet();
  var data = sheet.getDataRange().getValues();

  var existingMap = {};
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rUId = String(row[0] || "").trim();
    var rUName = String(row[1] || "").trim().toLowerCase();
    var rFName = String(row[2] || "").trim().toLowerCase();
    var rCId = normalizeChatId(row[3]);
    if (rCId === cleanChatId) {
      if (rUId) existingMap[rUId] = true;
      if (rUName) existingMap[rUName] = true;
      if (rFName) existingMap[rFName] = true;
    }
  }

  var now = new Date().toISOString();
  var rowsToAdd = [];

  for (var u = 0; u < usersList.length; u++) {
    var user = usersList[u];
    if (!user || user.is_bot) continue;

    var uid = String(user.id || user.userId || "").trim();
    var uname = String(user.username || "").trim();
    var fname = String(user.first_name || user.firstName || user.name || "").trim();
    if (!fname && uname) fname = uname;
    if (!fname && !uname) continue;

    var exists = (uid && existingMap[uid]) || 
                 (uname && existingMap[uname.toLowerCase()]) || 
                 (fname && existingMap[fname.toLowerCase()]);

    if (!exists) {
      rowsToAdd.push([uid, uname ? ("@" + uname.replace(/^@/, "")) : "", fname, cleanChatId, now]);
      if (uid) existingMap[uid] = true;
      if (uname) existingMap[uname.toLowerCase()] = true;
      if (fname) existingMap[fname.toLowerCase()] = true;
    }
  }

  if (rowsToAdd.length > 0) {
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rowsToAdd.length, 5).setValues(rowsToAdd);
  }
}

function removeUserFromChat(chatId, identifier) {
  if (!identifier) return;
  var cleanChatId = normalizeChatId(chatId);
  var sheet = getUsersSheet();
  var data = sheet.getDataRange().getValues();
  var target = String(identifier).trim().toLowerCase();
  var cleanTarget = target.replace(/^@/, "");

  for (var i = data.length - 1; i >= 1; i--) {
    var row = data[i];
    var rUId = String(row[0] || "").trim().toLowerCase();
    var rUName = String(row[1] || "").trim().toLowerCase().replace(/^@/, "");
    var rFName = String(row[2] || "").trim().toLowerCase();
    var rCId = normalizeChatId(row[3]);

    if (rCId === cleanChatId) {
      if (rUId === target || rUName === cleanTarget || rFName === target || rFName === cleanTarget) {
        sheet.deleteRow(i + 1);
      }
    }
  }

  try {
    var scriptProps = PropertiesService.getScriptProperties();
    var blacklistKey = "BLACKLIST_" + (cleanChatId ? cleanChatId.replace(/[^a-zA-Z0-9_]/g, "_") : "GLOBAL");
    var blacklisted = (scriptProps.getProperty(blacklistKey) || "").split(",").filter(Boolean);
    if (blacklisted.indexOf(cleanTarget) === -1) {
      blacklisted.push(cleanTarget);
      scriptProps.setProperty(blacklistKey, blacklisted.join(","));
    }
    if (_blacklistMapCache[cleanChatId]) {
      _blacklistMapCache[cleanChatId][cleanTarget] = true;
    }
  } catch (e) {}
}

function getAllData(chatId, passedGroupTitle) {
  var cleanChatId = normalizeChatId(chatId);
  var blacklistSet = getBlacklistSet(cleanChatId);

  // 1. Fetch Expenses
  var expSheet = getExpensesSheet();
  var expData = expSheet.getDataRange().getValues();
  var expenses = [];
  for (var i = 1; i < expData.length; i++) {
    var row = expData[i];
    if (!row[1]) continue;
    var rowChatId = normalizeChatId(row[13]);
    if (!cleanChatId || rowChatId === cleanChatId) {
      var splitDataObj = null;
      try { if (row[14]) splitDataObj = JSON.parse(row[14]); } catch(e){}

      expenses.push({
        timestamp: row[0],
        id: String(row[1]),
        description: row[2],
        amount: Number(row[3]) || 0,
        currency: row[4] || "₱",
        paidBy: row[5],
        splitMode: row[6] || "Equal",
        userAShare: Number(row[7]) || 0,
        userBShare: Number(row[8]) || 0,
        userAPercent: Number(row[9]) || 0,
        userBPercent: Number(row[10]) || 0,
        createdBy: row[11],
        category: row[12] || "General",
        chatId: rowChatId,
        splitMembers: (splitDataObj && splitDataObj.splitMembers) ? splitDataObj.splitMembers : undefined,
        shares: (splitDataObj && splitDataObj.shares) ? splitDataObj.shares : undefined,
        percentages: (splitDataObj && splitDataObj.percentages) ? splitDataObj.percentages : undefined,
        singleOwer: (splitDataObj && splitDataObj.singleOwer) ? splitDataObj.singleOwer : undefined
      });
    }
  }

  // 2. Fetch Settlements
  var setSheet = getSettlementsSheet();
  var setData = setSheet.getDataRange().getValues();
  var settlements = [];
  for (var j = 1; j < setData.length; j++) {
    var sRow = setData[j];
    if (!sRow[1]) continue;
    var sChatId = normalizeChatId(sRow[7]);
    if (!cleanChatId || sChatId === cleanChatId) {
      settlements.push({
        timestamp: sRow[0],
        id: String(sRow[1]),
        payer: sRow[2],
        receiver: sRow[3],
        amount: Number(sRow[4]) || 0,
        currency: sRow[5] || "₱",
        method: sRow[6] || "Cash",
        chatId: sChatId
      });
    }
  }

  // 3. Fetch Users
  var usrSheet = getUsersSheet();
  var usrData = usrSheet.getDataRange().getValues();
  var users = [];
  var seenUserKeys = {};

  for (var k = 1; k < usrData.length; k++) {
    var uRow = usrData[k];
    var uChatId = normalizeChatId(uRow[3]);
    if (!cleanChatId || uChatId === cleanChatId) {
      var uid = String(uRow[0] || "").trim();
      var uname = String(uRow[1] || "").trim();
      var fname = String(uRow[2] || "").trim();
      var cleanName = (fname || uname).toLowerCase().replace(/^@/, "");

      if (cleanName.indexOf("bot") === -1 && cleanName !== "alex" && cleanName !== "sam" && !blacklistSet[cleanName]) {
        var key = fname.toLowerCase() + "_" + uname.toLowerCase();
        if (!seenUserKeys[key]) {
          seenUserKeys[key] = true;
          users.push({
            userId: uid,
            username: uname,
            firstName: fname,
            name: fname,
            chatId: uChatId,
            lastSeen: uRow[4] || ""
          });
        }
      }
    }
  }

  var groupTitle = passedGroupTitle || _chatTitleCache[cleanChatId] || "";
  if (!groupTitle && cleanChatId) {
    try {
      var scriptProps = PropertiesService.getScriptProperties();
      var propKey = "CHAT_TITLE_" + cleanChatId.replace(/[^a-zA-Z0-9_]/g, "_");
      groupTitle = scriptProps.getProperty(propKey) || "";
    } catch(e){}
  }

  return {
    expenses: expenses,
    settlements: settlements,
    users: users,
    chatId: cleanChatId,
    groupTitle: groupTitle
  };
}

function saveExpenseToSheet(exp, chatId) {
  var sheet = getExpensesSheet();
  var timestamp = exp.timestamp || new Date().toISOString();
  var id = exp.id || ("EXP-" + Date.now());
  var description = exp.description || "Expense";
  var amount = Number(exp.amount) || 0;
  var currency = exp.currency || "₱";
  var paidBy = exp.paidBy || "Unknown";
  var splitMode = exp.splitMode || "Equal";
  var userAShare = Number(exp.userAShare) || 0;
  var userBShare = Number(exp.userBShare) || 0;
  var userAPercent = Number(exp.userAPercent) || 0;
  var userBPercent = Number(exp.userBPercent) || 0;
  var createdBy = exp.createdBy || paidBy;
  var category = exp.category || "General";
  var cleanChatId = normalizeChatId(chatId || exp.chatId || "");

  var splitData = JSON.stringify({
    splitMembers: exp.splitMembers,
    shares: exp.shares,
    percentages: exp.percentages,
    singleOwer: exp.singleOwer
  });

  sheet.appendRow([
    timestamp, id, description, amount, currency, paidBy,
    splitMode, userAShare, userBShare, userAPercent, userBPercent,
    createdBy, category, cleanChatId, splitData
  ]);
}

function updateExpenseInSheet(exp, chatId) {
  var sheet = getExpensesSheet();
  var data = sheet.getDataRange().getValues();
  var targetId = String(exp.id).trim();
  var cleanChatId = normalizeChatId(chatId || exp.chatId || "");

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim() === targetId) {
      var rowNum = i + 1;
      var splitData = JSON.stringify({
        splitMembers: exp.splitMembers,
        shares: exp.shares,
        percentages: exp.percentages,
        singleOwer: exp.singleOwer
      });

      sheet.getRange(rowNum, 1, 1, 15).setValues([[
        data[i][0] || exp.timestamp || new Date().toISOString(),
        targetId,
        exp.description || "Expense",
        Number(exp.amount) || 0,
        exp.currency || "₱",
        exp.paidBy || "Unknown",
        exp.splitMode || "Equal",
        Number(exp.userAShare) || 0,
        Number(exp.userBShare) || 0,
        Number(exp.userAPercent) || 0,
        Number(exp.userBPercent) || 0,
        exp.createdBy || exp.paidBy,
        exp.category || "General",
        cleanChatId || data[i][13],
        splitData
      ]]);
      return true;
    }
  }
  return false;
}

function deleteExpenseFromSheet(expenseId, chatId) {
  var sheet = getExpensesSheet();
  var data = sheet.getDataRange().getValues();
  var targetId = String(expenseId).trim();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim() === targetId) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

function saveSettlementToSheet(settle, chatId) {
  var sheet = getSettlementsSheet();
  var timestamp = settle.timestamp || new Date().toISOString();
  var id = settle.id || ("SET-" + Date.now());
  var payer = settle.payer || "Unknown";
  var receiver = settle.receiver || "Unknown";
  var amount = Number(settle.amount) || 0;
  var currency = settle.currency || "₱";
  var method = settle.method || "Cash";
  var cleanChatId = normalizeChatId(chatId || settle.chatId || "");

  sheet.appendRow([
    timestamp, id, payer, receiver, amount, currency, method, cleanChatId
  ]);
}

// ==============================================================================
// 8. NOTIFICATIONS & TELEGRAM UTILITIES
// ==============================================================================

function sendExpenseGroupNotification(chatId, exp) {
  var currency = exp.currency || "₱";
  var amountFormatted = currency + Number(exp.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var paidBy = exp.paidBy || "Someone";
  var description = exp.description || "Expense";
  var splitMode = exp.splitMode || "Equal";

  var splitDetails = "";
  if (splitMode === "Equal" || splitMode === "50/50 Equal") {
    if (exp.splitMembers && Array.isArray(exp.splitMembers) && exp.splitMembers.length > 0) {
      var perPerson = currency + (Number(exp.amount || 0) / exp.splitMembers.length).toFixed(2);
      var memberNames = exp.splitMembers.map(escapeHtml).join(", ");
      splitDetails = "• <b>Split (Equal among " + exp.splitMembers.length + ")</b>: " + memberNames + " (" + perPerson + " each)";
    } else {
      splitDetails = "• <b>Split</b>: Divided equally among group members";
    }
  } else {
    splitDetails = "• <b>Split Mode</b>: " + escapeHtml(splitMode);
  }

  var msg = "💸 <b>New expense added!</b>\n" +
            "━━━━━━━━━━━━━\n" +
            "🏷️ <b>Item</b>: " + escapeHtml(description) + "\n" +
            "💰 <b>Total</b>: <b>" + amountFormatted + "</b>\n" +
            "👤 <b>Paid By</b>: <b>" + escapeHtml(paidBy) + "</b>\n" +
            splitDetails + "\n" +
            "━━━━━━━━━━━━━\n" +
            "💡 <i>Tap below to view balances & settle up!</i>";

  sendTelegramMessage(chatId, msg, getAppReplyMarkup(chatId));
}

function sendExpenseUpdatedGroupNotification(chatId, exp) {
  var currency = exp.currency || "₱";
  var amountFormatted = currency + Number(exp.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var paidBy = exp.paidBy || "Someone";
  var description = exp.description || "Expense";

  var msg = "✏️ <b>Expense updated!</b>\n" +
            "━━━━━━━━━━━━━\n" +
            "🏷️ <b>Item</b>: " + escapeHtml(description) + "\n" +
            "💰 <b>Total</b>: <b>" + amountFormatted + "</b>\n" +
            "👤 <b>Paid By</b>: <b>" + escapeHtml(paidBy) + "</b>\n" +
            "━━━━━━━━━━━━━\n" +
            "💡 <i>Ledger & balances updated!</i>";

  sendTelegramMessage(chatId, msg, getAppReplyMarkup(chatId));
}

function sendSettlementGroupNotification(chatId, settle) {
  var currency = settle.currency || "₱";
  var amountFormatted = currency + Number(settle.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var payer = settle.payer || "Member";
  var receiver = settle.receiver || "Member";
  var method = settle.method || "Cash";

  var msg = "🤝 <b>Settlement recorded!</b>\n" +
            "━━━━━━━━━━━━━\n" +
            "💸 <b>Payer</b>: <b>" + escapeHtml(payer) + "</b>\n" +
            "📥 <b>Receiver</b>: <b>" + escapeHtml(receiver) + "</b>\n" +
            "💵 <b>Amount Paid</b>: <b>" + amountFormatted + "</b>\n" +
            "💳 <b>Method</b>: " + escapeHtml(method) + "\n" +
            "━━━━━━━━━━━━━\n" +
            "✅ <i>Debt marked as resolved!</i>";

  sendTelegramMessage(chatId, msg, getAppReplyMarkup(chatId));
}

function getGroupBalanceTextSummary(chatId, isDetailedSummary, passedGroupTitle) {
  var cleanChatId = normalizeChatId(chatId);
  var data = getAllData(cleanChatId, passedGroupTitle);
  var expenses = data.expenses || [];
  var settlements = data.settlements || [];
  var users = data.users || [];
  var groupTitle = passedGroupTitle || data.groupTitle || "";

  if (expenses.length === 0 && settlements.length === 0) {
    var emptyHeader = groupTitle 
      ? "📊 <b>" + escapeHtml(groupTitle) + " — Expense Summary</b>\n━━━━━━━━━━━━━\n"
      : "📊 <b>splitnest Group Expense Summary</b>\n━━━━━━━━━━━━━\n";
    return emptyHeader + "No expenses or settlements recorded yet.\n\n💡 <i>Send a receipt photo or tap below to log an expense!</i>";
  }

  var totalSpent = 0;
  for (var i = 0; i < expenses.length; i++) totalSpent += Number(expenses[i].amount || 0);

  var header = groupTitle 
    ? "📊 <b>" + escapeHtml(groupTitle) + " — Balance Summary</b>\n━━━━━━━━━━━━━\n"
    : "📊 <b>splitnest Group Balance Summary</b>\n━━━━━━━━━━━━━\n";

  var body = "💰 <b>Total Spending</b>: <b>₱" + totalSpent.toFixed(2) + "</b> (" + expenses.length + " expenses)\n\n" +
             "👥 <b>Active Members</b>: " + users.map(function(u){ return escapeHtml(u.firstName || u.username); }).join(", ") + "\n\n" +
             "━━━━━━━━━━━━━\n💡 <i>Tap below to open splitnest or record settlements!</i>";

  return header + body;
}

function sendTelegramMessage(chatId, text, replyMarkup) {
  if (!TELEGRAM_BOT_TOKEN) return { ok: false, description: "No bot token configured" };
  var url = TELEGRAM_API_BASE + "/sendMessage";
  var payload = {
    chat_id: String(chatId),
    text: text,
    parse_mode: "HTML",
    disable_web_page_preview: true
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;

  try {
    var res = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    return JSON.parse(res.getContentText());
  } catch (err) {
    Logger.log("Error sending Telegram message: " + err.toString());
    return { ok: false, description: err.toString() };
  }
}

function getAppReplyMarkup(chatId) {
  var cleanChatId = normalizeChatId(chatId);
  var appUrl = MINI_APP_URL;
  if (cleanChatId) {
    var param = cleanChatId.replace(/^-/, "g_");
    appUrl = MINI_APP_URL + (MINI_APP_URL.indexOf("?") === -1 ? "?" : "&") + "startapp=" + encodeURIComponent(param);
  }
  return {
    inline_keyboard: [[{ text: "🚀 Open splitnest", url: appUrl }]]
  };
}

function clearTelegramWebhookQueue() {
  if (!TELEGRAM_BOT_TOKEN) return { ok: false, description: "No bot token configured" };
  var appUrl = "";
  try { appUrl = ScriptApp.getService().getUrl(); } catch(e) {}
  if (!appUrl) {
    var delRes = UrlFetchApp.fetch(TELEGRAM_API_BASE + "/deleteWebhook?drop_pending_updates=true", { muteHttpExceptions: true });
    return JSON.parse(delRes.getContentText());
  }
  var res = UrlFetchApp.fetch(TELEGRAM_API_BASE + "/setWebhook", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ url: appUrl, drop_pending_updates: true }),
    muteHttpExceptions: true
  });
  return JSON.parse(res.getContentText());
}

function setWebhook() { return clearTelegramWebhookQueue(); }

function deleteAllProjectTriggers() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) ScriptApp.deleteTrigger(triggers[i]);
    return { ok: true, deleted: triggers.length };
  } catch (err) {
    return { ok: false, error: err.toString() };
  }
}

function normalizeChatId(id) {
  if (!id) return "";
  var s = String(id).trim();
  if (s.indexOf("g_") === 0) s = "-" + s.substring(2);
  if (s.indexOf("c_") === 0) s = s.substring(2);
  if (s.indexOf("group_") === 0) s = "-" + s.substring(6);
  if (/^100\d{7,}$/.test(s)) s = "-" + s;
  return s;
}

function escapeHtml(text) {
  if (!text) return "";
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
