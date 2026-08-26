/**
 * ==============================================================================
 * SPLITNEST TELEGRAM BOT & GOOGLE SHEETS BACKEND (Code.gs)
 * ==============================================================================
 * 
 * Features:
 * 1. Live Telegram API Group Member Fetching:
 *    - Queries Telegram Bot API (getChatAdministrators) directly on every request
 *      to fetch all group members and admins live from Telegram.
 *    - Auto-registers any member who opens the Mini App or chats in the group.
 * 2. Strict Group Chat Isolation:
 *    - Each Telegram group has a completely unique Splitnest ledger.
 *    - Expenses, settlements, and member dropdowns are strictly isolated by chatId.
 * 3. Anti-Spam Protection:
 *    - Deduplicates webhook updates and throttles /start and welcome join messages.
 * 4. Real-time Group Expense & Settlement Telegram Notifications.
 */

// ==============================================================================
// 1. CONFIGURATION
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

// ==============================================================================
// 2. SPREADSHEET DATABASE INITIALIZATION & OPTIMIZED RECOVERY
// ==============================================================================

function getDbSpreadsheet() {
  if (_cachedSpreadsheet) return _cachedSpreadsheet;
  var ss;
  if (SPREADSHEET_ID && SPREADSHEET_ID.trim() !== "" && SPREADSHEET_ID !== "YOUR_SPREADSHEET_ID_HERE") {
    try {
      ss = SpreadsheetApp.openById(SPREADSHEET_ID.trim());
    } catch(e) {
      Logger.log("Error opening spreadsheet by ID: " + e.toString());
      ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.create("splitnest Expense Database");
    }
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.create("splitnest Expense Database");
  }

  ensureSheetsExist(ss);
  _cachedSpreadsheet = ss;
  return ss;
}

function ensureSheetsExist(ss) {
  var expSheet = ss.getSheetByName(SHEET_EXPENSES);
  if (!expSheet) {
    expSheet = ss.insertSheet(SHEET_EXPENSES);
  }
  if (expSheet.getLastRow() === 0) {
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
  }
  if (setSheet.getLastRow() === 0) {
    setSheet.appendRow(["Timestamp", "ID", "Payer", "Receiver", "Amount", "Currency", "Method", "ChatID"]);
    try { setSheet.getRange(1, 1, 1, 8).setFontWeight("bold").setBackground("#e6f4ea"); } catch(e){}
  }

  var usrSheet = ss.getSheetByName(SHEET_USERS);
  if (!usrSheet) {
    usrSheet = ss.insertSheet(SHEET_USERS);
  }
  if (usrSheet.getLastRow() === 0) {
    usrSheet.appendRow(["UserID", "UserName", "FirstName", "ChatID", "LastSeen"]);
    try { usrSheet.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#feefc3"); } catch(e){}
  }
}

function getExpensesSheet() { return getDbSpreadsheet().getSheetByName(SHEET_EXPENSES); }
function getSettlementsSheet() { return getDbSpreadsheet().getSheetByName(SHEET_SETTLEMENTS); }
function getUsersSheet() { return getDbSpreadsheet().getSheetByName(SHEET_USERS); }

// ==============================================================================
// 3. HTTP GET HANDLER (API & Webhook setup & Queue Clearing)
// ==============================================================================

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "get_data";
    var chatId = (e && e.parameter) ? (e.parameter.chatId || e.parameter.chat_id || "") : "";
    var cleanChatId = normalizeChatId(chatId);

    // One-click queue clearance & webhook registration
    if (action === "clear_queue" || action === "drop_updates" || action === "reset_webhook") {
      var clearRes = clearTelegramWebhookQueue();
      return createJsonResponse({ status: "success", message: "Telegram queue cleared & webhook reset", result: clearRes });
    }

    if (action === "set_webhook") {
      var webhookRes = setWebhook();
      return createJsonResponse({ status: "success", message: "Webhook registration executed with drop_pending_updates", result: webhookRes });
    }

    if (action === "get_webhook_info" || action === "webhook_info") {
      var infoRes = UrlFetchApp.fetch(TELEGRAM_API_BASE + "/getWebhookInfo", { muteHttpExceptions: true });
      var infoJson = JSON.parse(infoRes.getContentText());
      return createJsonResponse({ status: "success", webhookInfo: infoJson });
    }

    if (action === "test_message" && cleanChatId) {
      var testRes = sendTelegramMessage(cleanChatId, "🔔 <b>splitnest Test Notification</b>\n\nYour Telegram bot is successfully connected and messaging this chat!", getAppReplyMarkup(cleanChatId));
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
        tokenConfigured: Boolean(TELEGRAM_BOT_TOKEN),
        spreadsheetId: SPREADSHEET_ID,
        botInfo: botInfo
      });
    }

    if (action === "clear_queue" || action === "flush_queue" || action === "reset_webhook") {
      var queueRes = clearTelegramWebhookQueue();
      return createJsonResponse({ status: "success", message: "Telegram queue purged successfully", result: queueRes });
    }

    if (action === "get_members" || action === "sync_members") {
      var members = fetchAndRegisterGroupAdmins(cleanChatId, true);
      var allData = getAllData(cleanChatId);
      return createJsonResponse({ status: "success", chatId: cleanChatId, data: allData, users: allData.users, telegramMembers: members });
    }

    if (action === "remove_member" || action === "delete_member") {
      var identifier = e.parameter.username || e.parameter.userId || e.parameter.name || e.parameter.member;
      if (!identifier) return createJsonResponse({ status: "error", message: "Missing member identifier" });
      removeUserFromChat(cleanChatId, identifier);
      var updatedData = getAllData(cleanChatId);
      return createJsonResponse({ status: "success", message: "Member removed", data: updatedData, users: updatedData.users });
    }

    if (action === "get_data") {
      var data = getAllData(cleanChatId);
      return createJsonResponse({ status: "success", data: data });
    }

    return createJsonResponse({ status: "success", message: "splitnest Google Apps Script Backend Online" });
  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString() });
  }
}

// ==============================================================================
// 4. HTTP POST HANDLER (Telegram Webhook & Mini App API)
// ==============================================================================

function doPost(e) {
  // Always return HTTP 200 OK fast so Telegram does not retry updates
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({ ok: true, status: "empty_body" });
    }

    var payload = JSON.parse(e.postData.contents);

    // CASE A: Mini App API Action
    if (payload.action) {
      return handleMiniAppAction(payload);
    }

    // CASE B: Telegram Webhook Update
    if (payload.update_id !== undefined) {
      return handleTelegramUpdate(payload);
    }

    return createJsonResponse({ ok: true, status: "ignored" });
  } catch (err) {
    Logger.log("doPost Error: " + err.toString());
    return createJsonResponse({ ok: true, error: err.toString() });
  }
}

// ==============================================================================
// 5. MINI APP ACTIONS (add_expense, settle_up, get_data, sync_user)
// ==============================================================================

function handleMiniAppAction(payload) {
  var action = payload.action;
  var chatId = normalizeChatId(payload.chatId || "");
  var tgUser = payload.user || null;

  if (tgUser && chatId) {
    registerUsersBatch(chatId, [tgUser]);
  }

  if (action === "get_data" || action === "sync_user" || action === "sync_members") {
    var allData = getAllData(chatId);
    return createJsonResponse({ status: "success", data: allData });
  }

  if (action === "add_expense") {
    var expense = payload.expense;
    if (!expense) return createJsonResponse({ status: "error", message: "Missing expense payload" });

    saveExpenseToSheet(expense, chatId);

    if (chatId) {
      if (expense.paidBy) registerSimpleName(chatId, expense.paidBy);
      if (expense.createdBy) registerSimpleName(chatId, expense.createdBy);
    }

    if (chatId && (chatId.indexOf("-") === 0 || Number(chatId) < 0)) {
      sendExpenseGroupNotification(chatId, expense);
    }

    var updatedData = getAllData(chatId);
    return createJsonResponse({ status: "success", message: "Expense logged successfully", data: updatedData });
  }

  if (action === "edit_expense" || action === "update_expense") {
    var expense = payload.expense;
    if (!expense) return createJsonResponse({ status: "error", message: "Missing expense payload" });

    updateExpenseInSheet(expense, chatId);

    if (chatId) {
      if (expense.paidBy) registerSimpleName(chatId, expense.paidBy);
      if (expense.createdBy) registerSimpleName(chatId, expense.createdBy);
    }

    if (chatId && (chatId.indexOf("-") === 0 || Number(chatId) < 0)) {
      sendExpenseUpdateGroupNotification(chatId, expense);
    }

    var updatedData = getAllData(chatId);
    return createJsonResponse({ status: "success", message: "Expense updated successfully", data: updatedData });
  }

  if (action === "delete_expense" || action === "remove_expense") {
    var expenseId = payload.id || payload.expenseId || (payload.expense ? payload.expense.id : "");
    if (!expenseId) return createJsonResponse({ status: "error", message: "Missing expense ID" });

    deleteExpenseFromSheet(expenseId, chatId);
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

  return createJsonResponse({ status: "error", message: "Unknown action: " + action });
}

// ==============================================================================
// 6. TELEGRAM WEBHOOK HANDLER WITH ANTI-SPAM & FAST DISPATCH
// ==============================================================================

function handleTelegramUpdate(update) {
  // 1. DEDUPLICATION: Drop duplicate update_ids
  if (update.update_id !== undefined) {
    try {
      var updateIdStr = String(update.update_id);
      var cache = CacheService.getScriptCache();
      var cachedUpdate = cache.get("TG_UPD_" + updateIdStr);
      if (cachedUpdate) {
        return createJsonResponse({ ok: true, status: "duplicate_ignored" });
      }
      cache.put("TG_UPD_" + updateIdStr, "1", 3600);
    } catch (e) {}
  }

  // 2. Bot added to a group or member status changed (my_chat_member)
  if (update.my_chat_member) {
    var mcm = update.my_chat_member;
    var chatId = String(mcm.chat.id);
    var oldStatus = mcm.old_chat_member ? mcm.old_chat_member.status : "";
    var newStatus = mcm.new_chat_member ? mcm.new_chat_member.status : "";

    var cleanChatKey = chatId.replace(/[^a-zA-Z0-9_]/g, "_");
    var welcomePropKey = "JOIN_WELCOMED_" + cleanChatKey;
    var scriptProps = PropertiesService.getScriptProperties();

    // If bot was kicked or left, clean up
    if (newStatus === "kicked" || newStatus === "left") {
      try {
        scriptProps.deleteProperty(welcomePropKey);
      } catch(e){}
      return createJsonResponse({ ok: true, status: "bot_removed" });
    }

    // STRICT JOIN CHECK: Only send ONCE when newly promoted from non-member to member/admin
    var wasInGroup = (oldStatus === "member" || oldStatus === "administrator" || oldStatus === "restricted");
    var isNowInGroup = (newStatus === "member" || newStatus === "administrator");
    var alreadyWelcomed = (scriptProps.getProperty(welcomePropKey) === "true");

    if (!wasInGroup && isNowInGroup && !alreadyWelcomed) {
      try {
        scriptProps.setProperty(welcomePropKey, "true");
      } catch(e){}

      var welcomeText = "👋 <b>splitnest joined the group!</b>\n\n" +
                        "All group members and admins are ready to split expenses.\n" +
                        "Tap below to open your group's shared ledger!";
      sendTelegramMessage(chatId, welcomeText, getAppReplyMarkup(chatId));
    }
    return createJsonResponse({ ok: true, status: "my_chat_member_processed" });
  }

  // 3. Incoming message in group or private chat
  var msg = update.message || update.edited_message || update.channel_post;
  if (!msg) {
    return createJsonResponse({ ok: true, status: "no_message" });
  }

  var chatId = String(msg.chat.id);
  var cleanChatId = normalizeChatId(chatId);

  // Store group title if present
  if (msg.chat && msg.chat.title) {
    try {
      var scriptProps = PropertiesService.getScriptProperties();
      var propKey = "CHAT_TITLE_" + cleanChatId.replace(/[^a-zA-Z0-9_]/g, "_");
      scriptProps.setProperty(propKey, msg.chat.title);
    } catch (e) {}
  }

  // Auto-register sender into group roster
  if (msg.from && !msg.from.is_bot && cleanChatId) {
    try {
      registerUsersBatch(cleanChatId, [msg.from]);
    } catch (e) {}
  }

  var rawText = (msg.text || msg.caption || "").trim();

  // If no text, ignore immediately without heavy processing
  if (!rawText) {
    return createJsonResponse({ ok: true, status: "non_text_message" });
  }

  var lowerText = rawText.toLowerCase().trim();

  // Normalize command token: e.g. "/balance@splitnest_bot" or "/balance" or "/bal"
  var firstToken = lowerText.split(/\s+/)[0];
  var commandOnly = firstToken.split("@")[0].trim();

  // FAST COMMAND ROUTING:

  // A. /start
  if (commandOnly === "/start" || commandOnly === "!start") {
    var startReply = "✨ <b>Welcome to splitnest!</b>\n\n" +
                     "Split bills, track shared expenses, and settle balances effortlessly with your group.\n\n" +
                     "👥 <b>Group Members Ready</b>: Tap below to open your group's expense ledger!";
    var resStart = sendTelegramMessage(chatId, startReply, getAppReplyMarkup(chatId));
    return createJsonResponse({ ok: true, status: "start_handled", sendResult: resStart });
  }

  // B. /help
  if (commandOnly === "/help" || commandOnly === "!help" || lowerText === "help") {
    var helpText = "📖 <b>splitnest Bot Commands:</b>\n\n" +
                   "• <code>/balance</code> - View net balances & who owes whom\n" +
                   "• <code>/summary</code> - View total group spending & recent expense breakdown\n" +
                   "• <code>/start</code> - Open Mini App & ledger\n" +
                   "• <code>/help</code> - Show this guide\n\n" +
                   "💡 <i>Tip: Tap the button below anytime to log expenses or settle up!</i>";
    var helpRes = sendTelegramMessage(chatId, helpText, getAppReplyMarkup(chatId));
    return createJsonResponse({ ok: true, status: "help_handled", sendResult: helpRes });
  }

  // C. /balance and /summary
  var isBalance = (
    commandOnly === "/balance" ||
    commandOnly === "/balances" ||
    commandOnly === "/bal" ||
    commandOnly === "/ledger" ||
    commandOnly === "/debts" ||
    commandOnly === "/owes" ||
    commandOnly === "!balance" ||
    lowerText === "balance" ||
    lowerText === "balances" ||
    lowerText === "who owes" ||
    lowerText.indexOf("check balance") !== -1 ||
    lowerText.indexOf("group balance") !== -1 ||
    lowerText.indexOf("how much do i owe") !== -1
  );

  var isSummary = (
    commandOnly === "/summary" ||
    commandOnly === "/summaries" ||
    commandOnly === "/report" ||
    commandOnly === "/stats" ||
    commandOnly === "!summary" ||
    lowerText === "summary" ||
    lowerText === "group summary" ||
    lowerText === "total spent"
  );

  if (isBalance || isSummary) {
    try {
      var summaryText = getGroupBalanceTextSummary(chatId, isSummary);
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
// 7. LIVE TELEGRAM API MEMBER FETCHING
// ==============================================================================

function fetchAndRegisterGroupAdmins(chatId, force) {
  if (!chatId) return [];
  var cleanChatId = normalizeChatId(chatId);
  if (cleanChatId.indexOf("-") !== 0) return [];

  var cacheKey = "TG_ADMINS_" + cleanChatId.replace(/[^a-zA-Z0-9_]/g, "_");
  var cache = CacheService.getScriptCache();

  if (!force) {
    var cached = cache.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch(e) {}
    }
  }

  var url = TELEGRAM_API_BASE + "/getChatAdministrators";
  var payload = { chat_id: cleanChatId };
  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var res = UrlFetchApp.fetch(url, options);
    var json = JSON.parse(res.getContentText());
    if (json.ok && json.result && Array.isArray(json.result)) {
      var adminUsers = [];
      for (var i = 0; i < json.result.length; i++) {
        var u = json.result[i].user;
        if (u && !u.is_bot) {
          adminUsers.push(u);
        }
      }
      if (adminUsers.length > 0) {
        registerUsersBatch(cleanChatId, adminUsers);
      }
      cache.put(cacheKey, JSON.stringify(adminUsers), 900);
      return adminUsers;
    }
  } catch (err) {
    Logger.log("Error in fetchAndRegisterGroupAdmins: " + err.toString());
  }
  return [];
}

function getChatTitleFromTelegram(chatId) {
  if (!chatId) return "";
  var cleanChatId = normalizeChatId(chatId);
  var scriptProps = PropertiesService.getScriptProperties();
  var propKey = "CHAT_TITLE_" + cleanChatId.replace(/[^a-zA-Z0-9_]/g, "_");
  var savedTitle = scriptProps.getProperty(propKey);
  if (savedTitle) return savedTitle;

  // If group chat, query Telegram Bot API getChat
  if (cleanChatId.indexOf("-") === 0) {
    try {
      var url = TELEGRAM_API_BASE + "/getChat";
      var payload = { chat_id: cleanChatId };
      var options = {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      };
      var res = UrlFetchApp.fetch(url, options);
      var json = JSON.parse(res.getContentText());
      if (json.ok && json.result && json.result.title) {
        var title = json.result.title;
        scriptProps.setProperty(propKey, title);
        return title;
      }
    } catch (e) {
      Logger.log("getChatTitleFromTelegram error: " + e.toString());
    }
  }
  return "";
}

function isUserBlacklisted(chatId, identifier) {
  if (!identifier) return false;
  try {
    var cleanChatId = normalizeChatId(chatId);
    var scriptProps = PropertiesService.getScriptProperties();
    var blacklistKey = "BLACKLIST_" + (cleanChatId ? cleanChatId.replace(/[^a-zA-Z0-9_]/g, "_") : "GLOBAL");
    var blacklisted = (scriptProps.getProperty(blacklistKey) || "").toLowerCase().split(",").filter(Boolean);
    var target = String(identifier).trim().toLowerCase().replace(/^@/, "");
    for (var b = 0; b < blacklisted.length; b++) {
      var item = blacklisted[b].replace(/^@/, "");
      if (item === target) return true;
    }
  } catch(e) {}
  return false;
}

function removeUserFromChat(chatId, identifier) {
  if (!identifier) return false;
  var cleanChatId = normalizeChatId(chatId);
  var target = String(identifier).trim().toLowerCase();
  var sheet = getUsersSheet();
  var data = sheet.getDataRange().getValues();
  var rowsToDelete = [];

  for (var i = 1; i < data.length; i++) {
    var uId = String(data[i][0] || "").trim().toLowerCase();
    var uName = String(data[i][1] || "").trim().toLowerCase().replace(/^@/, "");
    var fName = String(data[i][2] || "").trim().toLowerCase();
    var cId = normalizeChatId(data[i][3]);

    if (cleanChatId && cId !== cleanChatId) continue;

    var cleanTarget = target.replace(/^@/, "");
    if (uId === target || uName === cleanTarget || fName === target || fName.replace(/^@/, "") === cleanTarget) {
      rowsToDelete.push(i + 1);
    }
  }

  for (var r = rowsToDelete.length - 1; r >= 0; r--) {
    sheet.deleteRow(rowsToDelete[r]);
  }

  try {
    var scriptProps = PropertiesService.getScriptProperties();
    var blacklistKey = "BLACKLIST_" + (cleanChatId ? cleanChatId.replace(/[^a-zA-Z0-9_]/g, "_") : "GLOBAL");
    var blacklisted = (scriptProps.getProperty(blacklistKey) || "").split(",").filter(Boolean);
    if (blacklisted.indexOf(target) === -1) {
      blacklisted.push(target);
      scriptProps.setProperty(blacklistKey, blacklisted.join(","));
    }
  } catch(e) {}

  return true;
}

function registerUsersBatch(chatId, users) {
  if (!users || users.length === 0) return;
  var sheet = getUsersSheet();
  var data = sheet.getDataRange().getValues();
  var cleanChatId = normalizeChatId(chatId);

  var existingMap = {};
  for (var i = 1; i < data.length; i++) {
    var uId = String(data[i][0]).trim();
    var cId = normalizeChatId(data[i][3]);
    var fName = String(data[i][2]).trim().toLowerCase();
    if (cId === cleanChatId) {
      if (uId) existingMap[uId] = true;
      if (fName) existingMap[fName] = true;
    }
  }

  var now = new Date().toISOString();
  for (var j = 0; j < users.length; j++) {
    var user = users[j];
    var userIdStr = String(user.id || user.userId || "").trim();
    var username = user.username ? ("@" + user.username.replace(/^@/, "")) : "";
    var firstName = (user.first_name || user.firstName || "") + (user.last_name ? (" " + user.last_name) : "");
    firstName = firstName.trim();
    if (!firstName) firstName = username || ("User " + userIdStr);

    var nameKey = firstName.toLowerCase();

    if (isUserBlacklisted(cleanChatId, userIdStr) || isUserBlacklisted(cleanChatId, username) || isUserBlacklisted(cleanChatId, firstName)) {
      continue;
    }

    if ((userIdStr && !existingMap[userIdStr]) || (!userIdStr && !existingMap[nameKey])) {
      sheet.appendRow([userIdStr || ("ID-" + Date.now()), username, firstName, cleanChatId, now]);
      if (userIdStr) existingMap[userIdStr] = true;
      existingMap[nameKey] = true;
    }
  }
}

function registerSimpleName(chatId, name) {
  if (!name || !name.trim()) return;
  var cleanName = name.trim();
  if (cleanName.toLowerCase().includes("bot") || cleanName === "Alex" || cleanName === "Sam") return;

  registerUsersBatch(chatId, [{
    id: "NAME-" + cleanName.replace(/[^a-zA-Z0-9]/g, ""),
    first_name: cleanName
  }]);
}

// ==============================================================================
// 8. HIGH-PERFORMANCE GROUP DATA RETRIEVAL
// ==============================================================================

function getAllData(chatId) {
  var cleanChatId = normalizeChatId(chatId);
  var ss = getDbSpreadsheet();

  // Load all sheets in a single execution
  var userSheet = ss.getSheetByName(SHEET_USERS);
  var expSheet = ss.getSheetByName(SHEET_EXPENSES);
  var setSheet = ss.getSheetByName(SHEET_SETTLEMENTS);

  var userData = userSheet ? userSheet.getDataRange().getValues() : [];
  var expData = expSheet ? expSheet.getDataRange().getValues() : [];
  var setData = setSheet ? setSheet.getDataRange().getValues() : [];

  var usersList = [];
  var seen = {};

  for (var i = 1; i < userData.length; i++) {
    var row = userData[i];
    var uId = String(row[0] || "").trim();
    var uName = String(row[1] || "").trim();
    var fName = String(row[2] || "").trim();
    var cId = normalizeChatId(row[3]);
    var lastSeen = String(row[4] || "");

    if (cleanChatId && cId !== cleanChatId) continue;

    var display = fName || uName || (uId ? ("User " + uId) : "");
    if (!display || display.toLowerCase().includes("bot") || display === "Alex" || display === "Sam") continue;
    if (isUserBlacklisted(cleanChatId, display) || isUserBlacklisted(cleanChatId, uName) || isUserBlacklisted(cleanChatId, uId)) continue;

    var key = display.toLowerCase();
    if (!seen[key]) {
      seen[key] = true;
      usersList.push({
        userId: uId,
        username: uName,
        firstName: fName || display,
        name: fName || display,
        chatId: cId,
        lastSeen: lastSeen
      });
    }
  }

  // Parse expenses
  var expenses = [];
  for (var e = 1; e < expData.length; e++) {
    var erow = expData[e];
    var expId = String(erow[1] || ("EXP-" + e)).trim();
    if (!expId) continue;
    var expChatId = normalizeChatId(erow[13]);

    if (cleanChatId && expChatId !== cleanChatId) continue;

    var paidBy = String(erow[5] || "").trim();
    var createdBy = String(erow[11] || "").trim();
    [paidBy, createdBy].forEach(function(n) {
      if (n && !n.toLowerCase().includes("bot") && n !== "Alex" && n !== "Sam" && !isUserBlacklisted(cleanChatId, n) && !seen[n.toLowerCase()]) {
        seen[n.toLowerCase()] = true;
        usersList.push({
          userId: "EXP-" + n.replace(/[^a-zA-Z0-9]/g, ""),
          username: "",
          firstName: n,
          name: n,
          chatId: cleanChatId,
          lastSeen: ""
        });
      }
    });

    var expItem = {
      id: expId,
      timestamp: String(erow[0] || ""),
      description: String(erow[2] || "Expense"),
      amount: Number(erow[3]) || 0,
      currency: String(erow[4] || "₱"),
      paidBy: paidBy,
      splitMode: String(erow[6] || "50/50 Equal"),
      userAShare: erow[7] !== "" ? Number(erow[7]) : undefined,
      userBShare: erow[8] !== "" ? Number(erow[8]) : undefined,
      userAPercent: erow[9] !== "" ? Number(erow[9]) : undefined,
      userBPercent: erow[10] !== "" ? Number(erow[10]) : undefined,
      createdBy: createdBy,
      category: String(erow[12] || "General"),
      chatId: expChatId
    };

    if (erow[14]) {
      try {
        var parsedSplit = JSON.parse(erow[14]);
        if (parsedSplit.shares) expItem.shares = parsedSplit.shares;
        if (parsedSplit.percentages) expItem.percentages = parsedSplit.percentages;
        if (parsedSplit.singleOwer) expItem.singleOwer = parsedSplit.singleOwer;
        if (parsedSplit.splitMembers && Array.isArray(parsedSplit.splitMembers)) expItem.splitMembers = parsedSplit.splitMembers;
      } catch (ex) {}
    }

    expenses.push(expItem);
  }

  // Parse settlements
  var settlements = [];
  for (var s = 1; s < setData.length; s++) {
    var srow = setData[s];
    var setId = String(srow[1] || ("SET-" + s)).trim();
    if (!setId) continue;
    var setChatId = normalizeChatId(srow[7]);

    if (cleanChatId && setChatId !== cleanChatId) continue;

    settlements.push({
      id: setId,
      timestamp: String(srow[0] || ""),
      payer: String(srow[2] || ""),
      receiver: String(srow[3] || ""),
      amount: Number(srow[4]) || 0,
      currency: String(srow[5] || "₱"),
      method: String(srow[6] || "Cash"),
      chatId: setChatId
    });
  }

  var groupTitle = getChatTitleFromTelegram(cleanChatId);

  return {
    chatId: cleanChatId,
    groupTitle: groupTitle,
    chatTitle: groupTitle,
    users: usersList,
    expenses: expenses.reverse(),
    settlements: settlements.reverse()
  };
}

// ==============================================================================
// 9. EXPENSE NOTIFICATION
// ==============================================================================

function saveExpenseToSheet(exp, chatId) {
  var sheet = getExpensesSheet();
  var timestamp = exp.timestamp || new Date().toISOString();
  var id = exp.id || ("EXP-" + Date.now());
  var description = exp.description || "Expense";
  var amount = Number(exp.amount) || 0;
  var currency = exp.currency || "₱";
  var paidBy = exp.paidBy || "Unknown";
  var splitMode = exp.splitMode || "Equal";
  var userAShare = exp.userAShare || "";
  var userBShare = exp.userBShare || "";
  var userAPercent = exp.userAPercent || "";
  var userBPercent = exp.userBPercent || "";
  var createdBy = exp.createdBy || paidBy;
  var category = exp.category || "General";
  var cleanChatId = normalizeChatId(chatId || exp.chatId || "");

  var splitData = "";
  if (exp.shares || exp.percentages || exp.singleOwer || exp.splitMembers) {
    try {
      splitData = JSON.stringify({
        shares: exp.shares,
        percentages: exp.percentages,
        singleOwer: exp.singleOwer,
        splitMembers: exp.splitMembers
      });
    } catch (e) {}
  }

  sheet.appendRow([
    timestamp, id, description, amount, currency, paidBy,
    splitMode, userAShare, userBShare, userAPercent, userBPercent,
    createdBy, category, cleanChatId, splitData
  ]);
}

function sendExpenseGroupNotification(chatId, exp) {
  var currency = exp.currency || "₱";
  var amountFormatted = currency + Number(exp.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var paidBy = exp.paidBy || "Someone";
  var description = exp.description || "Expense";
  var category = exp.category || "General";
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
  } else if (splitMode === "Exact Amounts") {
    if (exp.shares && Object.keys(exp.shares).length > 0) {
      var shareEntries = [];
      for (var u in exp.shares) {
        shareEntries.push(escapeHtml(u) + ": " + currency + Number(exp.shares[u] || 0).toFixed(2));
      }
      splitDetails = "• <b>Split (Exact)</b>: " + shareEntries.join(", ");
    } else {
      splitDetails = "• <b>Split</b>: Exact Amounts (" + currency + (exp.userAShare || 0) + " / " + currency + (exp.userBShare || 0) + ")";
    }
  } else if (splitMode === "Percentages") {
    if (exp.percentages && Object.keys(exp.percentages).length > 0) {
      var pctEntries = [];
      for (var p in exp.percentages) {
        pctEntries.push(escapeHtml(p) + ": " + Number(exp.percentages[p] || 0) + "%");
      }
      splitDetails = "• <b>Split (Percentages)</b>: " + pctEntries.join(", ");
    } else {
      splitDetails = "• <b>Split</b>: Custom % (" + (exp.userAPercent || 50) + "% / " + (exp.userBPercent || 50) + "%)";
    }
  } else if (splitMode === "Single Payer (100% owed)") {
    var debtor = exp.singleOwer || "Group Member";
    splitDetails = "• <b>Split</b>: 100% owed by <b>" + escapeHtml(debtor) + "</b>";
  } else {
    splitDetails = "• <b>Split</b>: " + splitMode;
  }

  var msg = "🧾 <b>New expense logged!</b>\n" +
            "━━━━━━━━━━━━━\n" +
            "🏷️ <b>Item</b>: " + escapeHtml(description) + "\n" +
            "💰 <b>Total</b>: <b>" + amountFormatted + "</b>\n" +
            "👤 <b>Paid By</b>: <b>" + escapeHtml(paidBy) + "</b>\n" +
            splitDetails + "\n" +
            "━━━━━━━━━━━━━\n" +
            "💡 <i>History updated!</i>";

  sendTelegramMessage(chatId, msg, getAppReplyMarkup(chatId));
}

function updateExpenseInSheet(exp, chatId) {
  var sheet = getExpensesSheet();
  var data = sheet.getDataRange().getValues();
  var targetId = String(exp.id || "").trim();
  var cleanChatId = normalizeChatId(chatId || exp.chatId || "");

  var timestamp = exp.timestamp || new Date().toISOString();
  var id = targetId || ("EXP-" + Date.now());
  var description = exp.description || "Expense";
  var amount = Number(exp.amount) || 0;
  var currency = exp.currency || "₱";
  var paidBy = exp.paidBy || "Unknown";
  var splitMode = exp.splitMode || "Equal";
  var userAShare = (exp.userAShare !== undefined && exp.userAShare !== null) ? exp.userAShare : "";
  var userBShare = (exp.userBShare !== undefined && exp.userBShare !== null) ? exp.userBShare : "";
  var userAPercent = (exp.userAPercent !== undefined && exp.userAPercent !== null) ? exp.userAPercent : "";
  var userBPercent = (exp.userBPercent !== undefined && exp.userBPercent !== null) ? exp.userBPercent : "";
  var createdBy = exp.createdBy || paidBy;
  var category = exp.category || "General";

  var splitData = "";
  if (exp.shares || exp.percentages || exp.singleOwer || exp.splitMembers) {
    try {
      splitData = JSON.stringify({
        shares: exp.shares,
        percentages: exp.percentages,
        singleOwer: exp.singleOwer,
        splitMembers: exp.splitMembers
      });
    } catch (e) {}
  }

  var foundRow = -1;
  for (var i = 1; i < data.length; i++) {
    var rowId = String(data[i][1] || "").trim();
    if (rowId && targetId && rowId === targetId) {
      foundRow = i + 1;
      break;
    }
  }

  var rowValues = [
    timestamp, id, description, amount, currency, paidBy,
    splitMode, userAShare, userBShare, userAPercent, userBPercent,
    createdBy, category, cleanChatId, splitData
  ];

  if (foundRow > 0) {
    sheet.getRange(foundRow, 1, 1, 15).setValues([rowValues]);
    return true;
  } else {
    sheet.appendRow(rowValues);
    return true;
  }
}

function deleteExpenseFromSheet(expenseId, chatId) {
  if (!expenseId) return false;
  var sheet = getExpensesSheet();
  var data = sheet.getDataRange().getValues();
  var targetId = String(expenseId).trim();

  for (var i = 1; i < data.length; i++) {
    var rowId = String(data[i][1] || "").trim();
    if (rowId && rowId === targetId) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

function sendExpenseUpdateGroupNotification(chatId, exp) {
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
  } else if (splitMode === "Exact Amounts") {
    if (exp.shares && Object.keys(exp.shares).length > 0) {
      var shareEntries = [];
      for (var u in exp.shares) {
        shareEntries.push(escapeHtml(u) + ": " + currency + Number(exp.shares[u] || 0).toFixed(2));
      }
      splitDetails = "• <b>Split (Exact)</b>: " + shareEntries.join(", ");
    } else {
      splitDetails = "• <b>Split</b>: Exact Amounts (" + currency + (exp.userAShare || 0) + " / " + currency + (exp.userBShare || 0) + ")";
    }
  } else if (splitMode === "Percentages") {
    if (exp.percentages && Object.keys(exp.percentages).length > 0) {
      var pctEntries = [];
      for (var p in exp.percentages) {
        pctEntries.push(escapeHtml(p) + ": " + Number(exp.percentages[p] || 0) + "%");
      }
      splitDetails = "• <b>Split (Percentages)</b>: " + pctEntries.join(", ");
    } else {
      splitDetails = "• <b>Split</b>: Custom % (" + (exp.userAPercent || 50) + "% / " + (exp.userBPercent || 50) + "%)";
    }
  } else if (splitMode === "Single Payer (100% owed)") {
    var debtor = exp.singleOwer || "Group Member";
    splitDetails = "• <b>Split</b>: 100% owed by <b>" + escapeHtml(debtor) + "</b>";
  } else {
    splitDetails = "• <b>Split</b>: " + splitMode;
  }

  var msg = "✏️ <b>Expense updated!</b>\n" +
            "━━━━━━━━━━━━━\n" +
            "🏷️ <b>Item</b>: " + escapeHtml(description) + "\n" +
            "💰 <b>Total</b>: <b>" + amountFormatted + "</b>\n" +
            "👤 <b>Paid By</b>: <b>" + escapeHtml(paidBy) + "</b>\n" +
            splitDetails + "\n" +
            "━━━━━━━━━━━━━\n" +
            "💡 <i>Ledger & balances updated!</i>";

  sendTelegramMessage(chatId, msg, getAppReplyMarkup(chatId));
}

// ==============================================================================
// 10. SETTLEMENT NOTIFICATION
// ==============================================================================

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
            "✅ <i>Debt marked as resolved in settlements!</i>";

  sendTelegramMessage(chatId, msg, getAppReplyMarkup(chatId));
}

// ==============================================================================
// 11. BALANCE CALCULATIONS & TEXT SUMMARY
// ==============================================================================

function getGroupBalanceTextSummary(chatId, isDetailedSummary) {
  var cleanChatId = normalizeChatId(chatId);
  var data = getAllData(cleanChatId);
  var expenses = data.expenses || [];
  var settlements = data.settlements || [];
  var users = data.users || [];
  var groupTitle = data.groupTitle || data.chatTitle || "";

  if (expenses.length === 0 && settlements.length === 0) {
    var emptyHeader = groupTitle 
      ? "📊 <b>" + escapeHtml(groupTitle) + " — Expense Summary</b>\n━━━━━━━━━━━━━\n"
      : "📊 <b>splitnest Group Expense Summary</b>\n━━━━━━━━━━━━━\n";
    return emptyHeader +
           "No expenses or settlements recorded yet for this chat.\n\n" +
           "💡 <i>Tap the button below to log an expense or split a bill!</i>";
  }

  // 1. Canonical Member Roster & Case-Insensitive Alias Resolver
  var canonicalUsers = [];
  var nameToCanonical = {};

  for (var u = 0; u < users.length; u++) {
    var rawName = String(users[u].firstName || users[u].name || users[u].username || "").trim();
    if (rawName && rawName.toLowerCase().indexOf("bot") === -1 && rawName !== "Alex" && rawName !== "Sam" && !isUserBlacklisted(cleanChatId, rawName)) {
      var key = rawName.toLowerCase();
      if (!nameToCanonical[key]) {
        nameToCanonical[key] = rawName;
        if (users[u].username) {
          var uClean = users[u].username.toLowerCase().replace(/^@/, "");
          nameToCanonical[uClean] = rawName;
          nameToCanonical["@" + uClean] = rawName;
        }
        if (users[u].userId) {
          nameToCanonical[String(users[u].userId).toLowerCase()] = rawName;
        }
        canonicalUsers.push(rawName);
      }
    }
  }

  function resolveCanonical(raw) {
    if (!raw) return "";
    var s = String(raw).trim();
    if (!s) return "";
    var low = s.toLowerCase();
    if (nameToCanonical[low]) return nameToCanonical[low];
    var lowClean = low.replace(/^@/, "");
    if (nameToCanonical[lowClean]) return nameToCanonical[lowClean];

    // Check fuzzy startsWith match (e.g. "Kate" for "Kate Rustia")
    for (var k = 0; k < canonicalUsers.length; k++) {
      var cUser = canonicalUsers[k];
      var cLow = cUser.toLowerCase();
      if (cLow === low || cLow.indexOf(low) === 0 || low.indexOf(cLow) === 0) {
        nameToCanonical[low] = cUser;
        return cUser;
      }
    }

    if (low.indexOf("bot") === -1 && s !== "Alex" && s !== "Sam" && !isUserBlacklisted(cleanChatId, s)) {
      nameToCanonical[low] = s;
      canonicalUsers.push(s);
      return s;
    }
    return s;
  }

  // Pre-seed all members from expenses & settlements
  for (var iex = 0; iex < expenses.length; iex++) {
    var expObj = expenses[iex];
    if (expObj.paidBy) resolveCanonical(expObj.paidBy);
    if (expObj.createdBy) resolveCanonical(expObj.createdBy);
    if (expObj.singleOwer) resolveCanonical(expObj.singleOwer);
    if (expObj.splitMembers && Array.isArray(expObj.splitMembers)) {
      for (var sm = 0; sm < expObj.splitMembers.length; sm++) {
        resolveCanonical(expObj.splitMembers[sm]);
      }
    }
    if (expObj.shares && typeof expObj.shares === "object") {
      for (var sh in expObj.shares) resolveCanonical(sh);
    }
    if (expObj.percentages && typeof expObj.percentages === "object") {
      for (var pct in expObj.percentages) resolveCanonical(pct);
    }
  }

  for (var ist = 0; ist < settlements.length; ist++) {
    var stObj = settlements[ist];
    if (stObj.payer) resolveCanonical(stObj.payer);
    if (stObj.receiver) resolveCanonical(stObj.receiver);
  }

  if (canonicalUsers.length === 0) {
    canonicalUsers = ["Member"];
  }

  // 2. Discover all distinct currencies
  var currencyMap = {};
  for (var eIdx = 0; eIdx < expenses.length; eIdx++) {
    currencyMap[expenses[eIdx].currency || "₱"] = true;
  }
  for (var sIdx = 0; sIdx < settlements.length; sIdx++) {
    currencyMap[settlements[sIdx].currency || "₱"] = true;
  }
  var currencyList = Object.keys(currencyMap);
  if (currencyList.length === 0) currencyList = ["₱"];

  var outputSections = [];

  // 3. Process calculations per currency
  for (var c = 0; c < currencyList.length; c++) {
    var curr = currencyList[c];
    var currExpenses = [];
    var currSettlements = [];
    var totalSpent = 0;

    for (var ie = 0; ie < expenses.length; ie++) {
      if ((expenses[ie].currency || "₱") === curr) {
        currExpenses.push(expenses[ie]);
        totalSpent += (Number(expenses[ie].amount) || 0);
      }
    }

    for (var is = 0; is < settlements.length; is++) {
      if ((settlements[is].currency || "₱") === curr) {
        currSettlements.push(settlements[is]);
      }
    }

    var netMap = {};
    for (var m = 0; m < canonicalUsers.length; m++) {
      netMap[canonicalUsers[m]] = 0;
    }

    for (var ex = 0; ex < currExpenses.length; ex++) {
      var item = currExpenses[ex];
      var amt = Number(item.amount) || 0;
      var payer = resolveCanonical(item.paidBy) || canonicalUsers[0];
      if (netMap[payer] === undefined) netMap[payer] = 0;
      netMap[payer] += amt;

      var splitMode = String(item.splitMode || "Equal");

      if (splitMode === "Equal" || splitMode === "50/50 Equal" || !splitMode) {
        var participants = (item.splitMembers && Array.isArray(item.splitMembers) && item.splitMembers.length > 0)
          ? item.splitMembers.map(resolveCanonical).filter(Boolean)
          : canonicalUsers;
        if (participants.length === 0) participants = [payer];
        var equalShare = amt / participants.length;
        for (var pi = 0; pi < participants.length; pi++) {
          var uName = participants[pi];
          if (netMap[uName] === undefined) netMap[uName] = 0;
          netMap[uName] -= equalShare;
        }
      } else if (splitMode === "Exact Amounts") {
        if (item.shares && Object.keys(item.shares).length > 0) {
          for (var exactKey in item.shares) {
            var exactUser = resolveCanonical(exactKey);
            if (netMap[exactUser] === undefined) netMap[exactUser] = 0;
            netMap[exactUser] -= (Number(item.shares[exactKey]) || 0);
          }
        } else {
          var userA = payer;
          var userB = "";
          for (var bIdx = 0; bIdx < canonicalUsers.length; bIdx++) {
            if (canonicalUsers[bIdx] !== payer) {
              userB = canonicalUsers[bIdx];
              break;
            }
          }
          if (!userB && canonicalUsers.length > 1) userB = canonicalUsers[1];

          var shareA = item.userAShare !== undefined ? Number(item.userAShare) : (amt / 2);
          var shareB = item.userBShare !== undefined ? Number(item.userBShare) : (amt / 2);
          netMap[userA] -= shareA;
          if (userB) {
            if (netMap[userB] === undefined) netMap[userB] = 0;
            netMap[userB] -= shareB;
          }
        }
      } else if (splitMode === "Percentages") {
        if (item.percentages && Object.keys(item.percentages).length > 0) {
          for (var pctKey in item.percentages) {
            var pctUser = resolveCanonical(pctKey);
            if (netMap[pctUser] === undefined) netMap[pctUser] = 0;
            netMap[pctUser] -= amt * ((Number(item.percentages[pctKey]) || 0) / 100);
          }
        } else {
          var uA = payer;
          var uB = "";
          for (var ubIdx = 0; ubIdx < canonicalUsers.length; ubIdx++) {
            if (canonicalUsers[ubIdx] !== payer) {
              uB = canonicalUsers[ubIdx];
              break;
            }
          }
          if (!uB && canonicalUsers.length > 1) uB = canonicalUsers[1];

          var pA = (item.userAPercent !== undefined ? Number(item.userAPercent) : 50) / 100;
          var pB = (item.userBPercent !== undefined ? Number(item.userBPercent) : 50) / 100;
          netMap[uA] -= amt * pA;
          if (uB) {
            if (netMap[uB] === undefined) netMap[uB] = 0;
            netMap[uB] -= amt * pB;
          }
        }
      } else if (splitMode === "Single Payer (100% owed)") {
        var debtor = resolveCanonical(item.singleOwer);
        if (!debtor) {
          for (var dIdx = 0; dIdx < canonicalUsers.length; dIdx++) {
            if (canonicalUsers[dIdx] !== payer) {
              debtor = canonicalUsers[dIdx];
              break;
            }
          }
        }
        if (debtor) {
          if (netMap[debtor] === undefined) netMap[debtor] = 0;
          netMap[debtor] -= amt;
        }
      } else {
        var defaultShare = amt / Math.max(canonicalUsers.length, 1);
        for (var dm = 0; dm < canonicalUsers.length; dm++) {
          var dmName = canonicalUsers[dm];
          if (netMap[dmName] === undefined) netMap[dmName] = 0;
          netMap[dmName] -= defaultShare;
        }
      }
    }

    for (var stIdx = 0; stIdx < currSettlements.length; stIdx++) {
      var setObj = currSettlements[stIdx];
      var setAmt = Number(setObj.amount) || 0;
      var setPayer = resolveCanonical(setObj.payer);
      var setReceiver = resolveCanonical(setObj.receiver);
      if (setPayer) {
        if (netMap[setPayer] === undefined) netMap[setPayer] = 0;
        netMap[setPayer] += setAmt;
      }
      if (setReceiver) {
        if (netMap[setReceiver] === undefined) netMap[setReceiver] = 0;
        netMap[setReceiver] -= setAmt;
      }
    }

    var lines = [];
    var totalFormatted = formatMoney(totalSpent, curr);
    
    lines.push("💰 <b>Total Spending (" + curr + ")</b>: <b>" + totalFormatted + "</b> (" + currExpenses.length + " " + (currExpenses.length === 1 ? "expense" : "expenses") + ")");
    lines.push("");
    lines.push("👥 <b>Net Balances:</b>");

    var debtors = [];
    var creditors = [];
    var activeMembers = Object.keys(netMap);

    for (var k = 0; k < activeMembers.length; k++) {
      var memberName = activeMembers[k];
      var rawNet = netMap[memberName];
      var netVal = Math.round(rawNet * 100) / 100;
      var formattedAmt = formatMoney(netVal, curr);

      if (netVal >= 0.01) {
        lines.push("• 🟢 <b>" + escapeHtml(memberName) + "</b> is owed <b>+" + formattedAmt + "</b>");
        creditors.push({ name: memberName, bal: netVal });
      } else if (netVal <= -0.01) {
        lines.push("• 🔴 <b>" + escapeHtml(memberName) + "</b> owes <b>-" + formattedAmt + "</b>");
        debtors.push({ name: memberName, bal: Math.abs(netVal) });
      } else {
        lines.push("• ⚪ <b>" + escapeHtml(memberName) + "</b> is settled up");
      }
    }

    // Sort descending by balance magnitude for minimal transaction count
    debtors.sort(function(a, b) { return b.bal - a.bal; });
    creditors.sort(function(a, b) { return b.bal - a.bal; });

    var debtPairs = [];
    var dPointer = 0;
    var cPointer = 0;

    while (dPointer < debtors.length && cPointer < creditors.length) {
      var deb = debtors[dPointer];
      var cred = creditors[cPointer];
      var payAmt = Math.min(deb.bal, cred.bal);
      payAmt = Math.round(payAmt * 100) / 100;

      if (payAmt >= 0.01) {
        debtPairs.push({
          debtor: deb.name,
          creditor: cred.name,
          amount: payAmt
        });
        deb.bal = Math.round((deb.bal - payAmt) * 100) / 100;
        cred.bal = Math.round((cred.bal - payAmt) * 100) / 100;
      }

      if (deb.bal < 0.01) dPointer++;
      if (cred.bal < 0.01) cPointer++;
    }

    lines.push("");
    lines.push("🤝 <b>Suggested Settlements:</b>");
    if (debtPairs.length === 0) {
      lines.push("✅ <i>All settled up! No outstanding debts in " + curr + ".</i>");
    } else {
      for (var dp = 0; dp < debtPairs.length; dp++) {
        var pair = debtPairs[dp];
        var pairFormatted = formatMoney(pair.amount, curr);
        lines.push("• <b>" + escapeHtml(pair.debtor) + "</b> ➔ <b>" + escapeHtml(pair.creditor) + "</b>: <b>" + pairFormatted + "</b>");
      }
    }

    if (isDetailedSummary && currExpenses.length > 0) {
      lines.push("");
      lines.push("🧾 <b>Recent Expenses:</b>");
      var countToShow = Math.min(3, currExpenses.length);
      for (var r = 0; r < countToShow; r++) {
        var rExp = currExpenses[r];
        var rAmt = formatMoney(rExp.amount || 0, rExp.currency || "₱");
        lines.push("• " + escapeHtml(rExp.description || "Expense") + " — <b>" + rAmt + "</b> (Paid by " + escapeHtml(rExp.paidBy || "Member") + ")");
      }
    }

    outputSections.push(lines.join("\n"));
  }

  var header = groupTitle 
    ? "📊 <b>" + escapeHtml(groupTitle) + " — Balance & Summary</b>\n━━━━━━━━━━━━━\n"
    : "📊 <b>splitnest Group Balance & Summary</b>\n━━━━━━━━━━━━━\n";
  var footer = "\n━━━━━━━━━━━━━\n💡 <i>Tap below to open splitnest or record settlements!</i>";

  return header + outputSections.join("\n\n") + footer;
}

// ==============================================================================
// 12. TELEGRAM API UTILITIES & QUEUE FLUSHING
// ==============================================================================

function sendTelegramMessage(chatId, text, replyMarkup) {
  if (!TELEGRAM_BOT_TOKEN) return { ok: false, description: "No bot token configured" };
  var url = TELEGRAM_API_BASE + "/sendMessage";
  var payload = {
    chat_id: String(chatId),
    text: text,
    parse_mode: "HTML",
    disable_web_page_preview: true
  };
  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var res = UrlFetchApp.fetch(url, options);
    var resText = res.getContentText();
    var resJson = JSON.parse(resText);
    
    if (!resJson.ok) {
      Logger.log("Telegram sendMessage error: " + resText);
      if (resJson.description && resJson.description.indexOf("can't parse entities") !== -1) {
        delete payload.parse_mode;
        payload.text = text.replace(/<[^>]+>/g, "");
        var retryRes = UrlFetchApp.fetch(url, {
          method: "post",
          contentType: "application/json",
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });
        return JSON.parse(retryRes.getContentText());
      }
      if (resJson.description && resJson.description.indexOf("BUTTON_URL_INVALID") !== -1) {
        delete payload.reply_markup;
        var retryRes2 = UrlFetchApp.fetch(url, {
          method: "post",
          contentType: "application/json",
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });
        return JSON.parse(retryRes2.getContentText());
      }
    }
    return resJson;
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
    appUrl = MINI_APP_URL + "?startapp=" + encodeURIComponent(param);
  }

  return {
    inline_keyboard: [
      [
        {
          text: "🚀 Open splitnest",
          url: appUrl
        }
      ]
    ]
  };
}

/**
 * Instantly purges all pending/stuck updates in the Telegram queue
 * and re-binds the current Apps Script web app URL.
 */
function clearTelegramWebhookQueue() {
  var appUrl = ScriptApp.getService().getUrl();
  var url = TELEGRAM_API_BASE + "/setWebhook?url=" + encodeURIComponent(appUrl) + "&drop_pending_updates=true";
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  return JSON.parse(res.getContentText());
}

function setWebhook() {
  return clearTelegramWebhookQueue();
}

function formatMoney(amount, currency) {
  var num = Number(amount) || 0;
  var symbol = currency || "₱";
  var parts = Math.abs(num).toFixed(2).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return symbol + parts.join(".");
}

function normalizeChatId(id) {
  if (!id) return "";
  var s = String(id).trim();
  if (s.indexOf("g_") === 0) s = "-" + s.substring(2);
  if (s.indexOf("c_") === 0) s = s.substring(2);
  if (s.indexOf("group_") === 0) s = "-" + s.substring(6);
  return s;
}

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
