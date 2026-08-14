/**
 * ==============================================================================
 * SPLITSQUAD - TELEGRAM EXPENSE TRACKER & GEMINI RECEIPT SCANNER (Code.gs)
 * ==============================================================================
 */

// CONFIGURATION - REPLACE WITH YOUR KEYS & CREDENTIALS
var TELEGRAM_BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN_HERE";
var GEMINI_API_KEY = "YOUR_GEMINI_API_KEY_HERE";
var SPREADSHEET_ID = "YOUR_SPREADSHEET_ID_HERE";

// SHEET NAMES
var SHEET_EXPENSES = "Expenses";
var SHEET_SETTLEMENTS = "Settlements";
var SHEET_USERS = "Users";

function getDbSpreadsheet() {
  var ss;
  if (SPREADSHEET_ID && SPREADSHEET_ID !== "YOUR_SPREADSHEET_ID_HERE" && SPREADSHEET_ID.trim() !== "") {
    try {
      ss = SpreadsheetApp.openById(SPREADSHEET_ID.trim());
    } catch(e) {
      ss = SpreadsheetApp.create("SplitSquad Expense Database");
    }
  } else {
    var props = PropertiesService.getScriptProperties();
    var savedId = props.getProperty("SPREADSHEET_ID");
    if (savedId) {
      try {
        ss = SpreadsheetApp.openById(savedId);
      } catch(e) {
        ss = SpreadsheetApp.create("SplitSquad Expense Database");
        props.setProperty("SPREADSHEET_ID", ss.getId());
      }
    } else {
      ss = SpreadsheetApp.create("SplitSquad Expense Database");
      props.setProperty("SPREADSHEET_ID", ss.getId());
    }
  }
  
  ensureSheetsExist(ss);
  return ss;
}

function ensureSheetsExist(ss) {
  var expSheet = ss.getSheetByName(SHEET_EXPENSES);
  if (!expSheet) {
    expSheet = ss.insertSheet(SHEET_EXPENSES);
    expSheet.appendRow(["Timestamp", "ID", "Description", "Amount", "Currency", "PaidBy", "SplitMode", "UserAShare", "UserBShare", "CreatedBy", "Category"]);
    expSheet.getRange(1, 1, 1, 11).setFontWeight("bold").setBackground("#e8f0fe");
  }
  
  var setSheet = ss.getSheetByName(SHEET_SETTLEMENTS);
  if (!setSheet) {
    setSheet = ss.insertSheet(SHEET_SETTLEMENTS);
    setSheet.appendRow(["Timestamp", "ID", "Payer", "Receiver", "Amount", "Currency", "Method"]);
    setSheet.getRange(1, 1, 1, 7).setFontWeight("bold").setBackground("#e6f4ea");
  }
  
  var usrSheet = ss.getSheetByName(SHEET_USERS);
  if (!usrSheet) {
    usrSheet = ss.insertSheet(SHEET_USERS);
    usrSheet.appendRow(["UserID", "UserName", "FirstName", "ChatID", "LastSeen"]);
    usrSheet.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#feefc3");
  }
}

function doGet(e) {
  try {
    var ss = getDbSpreadsheet();
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "get_data";
    
    if (action === "get_data" || action === "export") {
      var data = getAllData(ss);
      return createJsonResponse({ status: "success", data: data });
    }
    
    return createJsonResponse({ status: "success", message: "SplitSquad GAS API Operational" });
  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString() });
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({ status: "error", message: "No post data received" });
    }
    
    var contents = JSON.parse(e.postData.contents);
    
    if (contents.action) {
      return handleMiniAppAction(contents);
    }
    
    if (contents.update_id || contents.message) {
      return handleTelegramWebhook(contents);
    }
    
    return createJsonResponse({ status: "success", message: "Payload received" });
  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString() });
  }
}

function handleMiniAppAction(contents) {
  var ss = getDbSpreadsheet();
  var action = contents.action;
  
  if (action === "add_expense") {
    var exp = contents.expense;
    addExpenseToSheet(ss, exp);
    var balanceMsg = calculateNetBalance(ss);
    if (contents.chatId) {
      sendGroupSummary(contents.chatId, "💵 *New Expense Added*\n\n" + exp.description + ": " + (exp.currency || "₱") + Number(exp.amount).toFixed(2) + " (Paid by " + exp.paidBy + ")\n\n" + balanceMsg);
    }
    return createJsonResponse({ status: "success", data: getAllData(ss), balanceSummary: balanceMsg });
  }
  
  if (action === "settle_up") {
    var settlement = contents.settlement;
    addSettlementToSheet(ss, settlement);
    var balanceMsg = calculateNetBalance(ss);
    if (contents.chatId) {
      sendGroupSummary(contents.chatId, "🤝 *Balance Settled Up!*\n\n" + settlement.payer + " paid " + settlement.receiver + " " + (settlement.currency || "₱") + Number(settlement.amount).toFixed(2) + "\n\n" + balanceMsg);
    }
    return createJsonResponse({ status: "success", data: getAllData(ss), balanceSummary: balanceMsg });
  }
  
  if (action === "get_data") {
    return createJsonResponse({ status: "success", data: getAllData(ss) });
  }
  
  return createJsonResponse({ status: "error", message: "Unknown action" });
}

function handleTelegramWebhook(update) {
  var message = update.message;
  if (!message) return createJsonResponse({ status: "ignored" });
  
  var chatId = message.chat.id;
  var fromUser = message.from || {};
  var senderName = fromUser.first_name || fromUser.username || "User";
  
  registerUser(chatId, fromUser);
  
  if (message.photo && message.photo.length > 0) {
    var photo = message.photo[message.photo.length - 1];
    var fileId = photo.file_id;
    processReceiptImage(fileId, chatId, senderName);
    return createJsonResponse({ status: "success", message: "Receipt scan queued" });
  }
  
  if (message.text) {
    var text = message.text.trim();
    
    if (text.indexOf("/start") === 0 || text.indexOf("/help") === 0) {
      var welcomeMsg = "👋 *Welcome to SplitSquad Bot!*\n\n" +
                       "• Open the Mini App to log expenses with multi-currency support (Default: ₱ PHP).\n" +
                       "• Snap & send a receipt photo directly to this group to auto-scan with Gemini AI Vision!\n" +
                       "• Type /balance to see who owes whom per currency.";
      sendGroupSummary(chatId, welcomeMsg);
    } else if (text.indexOf("/balance") === 0) {
      var ss = getDbSpreadsheet();
      var summary = calculateNetBalance(ss);
      sendGroupSummary(chatId, "📊 *Current Balance Summary*\n\n" + summary);
    }
  }
  
  return createJsonResponse({ status: "success" });
}

function processReceiptImage(fileId, chatId, senderName) {
  try {
    var getFileUrl = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/getFile?file_id=" + fileId;
    var fileRes = UrlFetchApp.fetch(getFileUrl);
    var fileData = JSON.parse(fileRes.getContentText());
    
    if (!fileData.ok || !fileData.result || !fileData.result.file_path) {
      sendGroupSummary(chatId, "⚠️ Could not retrieve receipt photo from Telegram.");
      return;
    }
    
    var filePath = fileData.result.file_path;
    var downloadUrl = "https://api.telegram.org/file/bot" + TELEGRAM_BOT_TOKEN + "/" + filePath;
    var imgBlob = UrlFetchApp.fetch(downloadUrl).getBlob();
    var base64Img = Utilities.base64Encode(imgBlob.getBytes());
    var mimeType = imgBlob.getContentType() || "image/jpeg";
    
    if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_GEMINI_API_KEY_HERE") {
      sendGroupSummary(chatId, "⚠️ Gemini API key missing in Code.gs! Please configure GEMINI_API_KEY.");
      return;
    }
    
    var geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + GEMINI_API_KEY;
    
    var promptText = "Analyze this receipt image carefully. Extract:\n" +
                      "1. Merchant/Store Name\n" +
                      "2. Total Amount (number only)\n" +
                      "3. Currency Symbol (e.g. ₱, $, €, £)\n" +
                      "4. Category (Groceries, Dining, Utilities, Entertainment, Travel, Misc)\n\n" +
                      "Return strictly a valid JSON object without markdown formatting, e.g.:\n" +
                      "{\"merchant\": \"Supermarket\", \"total\": 450.00, \"currency\": \"₱\", \"category\": \"Groceries\"}";

    var payload = {
      contents: [{
        parts: [
          { text: promptText },
          { inlineData: { mimeType: mimeType, data: base64Img } }
        ]
      }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };
    
    var options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    var geminiRes = UrlFetchApp.fetch(geminiUrl, options);
    var geminiJson = JSON.parse(geminiRes.getContentText());
    
    if (!geminiJson.candidates || !geminiJson.candidates[0]) {
      sendGroupSummary(chatId, "⚠️ AI receipt scan failed. Please log manually via Mini App.");
      return;
    }
    
    var rawText = geminiJson.candidates[0].content.parts[0].text;
    var parsedReceipt = JSON.parse(rawText);
    
    var merchant = parsedReceipt.merchant || "Scanned Receipt";
    var totalAmount = parseFloat(parsedReceipt.total) || 0;
    var currency = parsedReceipt.currency || "₱";
    var category = parsedReceipt.category || "General";
    
    if (totalAmount <= 0) {
      sendGroupSummary(chatId, "⚠️ Could not identify total amount on receipt. Please log manually.");
      return;
    }
    
    var ss = getDbSpreadsheet();
    var exp = {
      description: "Receipt: " + merchant,
      amount: totalAmount,
      currency: currency,
      paidBy: senderName,
      splitMode: "50/50 Equal",
      createdBy: senderName + " (Gemini AI Vision)",
      category: category
    };
    
    addExpenseToSheet(ss, exp);
    var balanceMsg = calculateNetBalance(ss);
    
    var confirmationMsg = "🧾 *AI Receipt Scanned & Logged!*\n\n" +
                          "• *Merchant:* " + merchant + "\n" +
                          "• *Total Amount:* " + currency + totalAmount.toFixed(2) + "\n" +
                          "• *Category:* " + category + "\n" +
                          "• *Paid By:* " + senderName + " (Split 50/50)\n\n" +
                          balanceMsg;
                          
    sendGroupSummary(chatId, confirmationMsg);
  } catch (err) {
    sendGroupSummary(chatId, "⚠️ Error processing receipt: " + err.toString());
  }
}

function addExpenseToSheet(ss, exp) {
  var sheet = ss.getSheetByName(SHEET_EXPENSES);
  var amount = parseFloat(exp.amount) || 0;
  var currency = exp.currency || "₱";
  var splitMode = exp.splitMode || "50/50 Equal";
  var paidBy = exp.paidBy || "Alex";
  
  var userAShare = 0;
  var userBShare = 0;
  
  if (splitMode === "50/50 Equal") {
    userAShare = amount / 2;
    userBShare = amount / 2;
  } else if (splitMode === "Exact Amounts") {
    userAShare = parseFloat(exp.userAShare) || 0;
    userBShare = parseFloat(exp.userBShare) || 0;
  } else if (splitMode === "Percentages") {
    var pctA = (parseFloat(exp.userAPercent) || 50) / 100;
    var pctB = (parseFloat(exp.userBPercent) || 50) / 100;
    userAShare = amount * pctA;
    userBShare = amount * pctB;
  } else if (splitMode === "Single Payer (100% owed)") {
    if (paidBy.toLowerCase().indexOf("alex") !== -1) {
      userAShare = 0;
      userBShare = amount;
    } else {
      userAShare = amount;
      userBShare = 0;
    }
  } else {
    userAShare = amount / 2;
    userBShare = amount / 2;
  }
  
  var timestamp = new Date();
  var id = "EXP-" + timestamp.getTime();
  
  sheet.appendRow([
    timestamp,
    id,
    exp.description || "Expense",
    amount,
    currency,
    paidBy,
    splitMode,
    userAShare,
    userBShare,
    exp.createdBy || paidBy,
    exp.category || "General"
  ]);
}

function addSettlementToSheet(ss, settlement) {
  var sheet = ss.getSheetByName(SHEET_SETTLEMENTS);
  var timestamp = new Date();
  var id = "SET-" + timestamp.getTime();
  
  sheet.appendRow([
    timestamp,
    id,
    settlement.payer,
    settlement.receiver,
    parseFloat(settlement.amount) || 0,
    settlement.currency || "₱",
    settlement.method || "Settled Up"
  ]);
}

function calculateNetBalance(ss) {
  var expSheet = ss.getSheetByName(SHEET_EXPENSES);
  var setSheet = ss.getSheetByName(SHEET_SETTLEMENTS);
  
  var expData = expSheet.getDataRange().getValues();
  var setData = setSheet.getDataRange().getValues();
  
  var currencies = {};
  
  for (var i = 1; i < expData.length; i++) {
    var row = expData[i];
    if (!row[0]) continue;
    var amount = parseFloat(row[3]) || 0;
    var curr = String(row[4] || "₱").trim();
    var paidBy = String(row[5] || "").trim();
    var shareA = parseFloat(row[7]) || 0;
    var shareB = parseFloat(row[8]) || 0;
    
    if (!currencies[curr]) {
      currencies[curr] = { paidA: 0, shareA: 0, paidB: 0, shareB: 0, settlements: 0 };
    }
    
    if (paidBy.toLowerCase().indexOf("alex") !== -1) {
      currencies[curr].paidA += amount;
    } else {
      currencies[curr].paidB += amount;
    }
    currencies[curr].shareA += shareA;
    currencies[curr].shareB += shareB;
  }
  
  for (var j = 1; j < setData.length; j++) {
    var sRow = setData[j];
    if (!sRow[0]) continue;
    var payer = String(sRow[2] || "").trim();
    var setAmount = parseFloat(sRow[4]) || 0;
    var sCurr = String(sRow[5] || "₱").trim();
    
    if (!currencies[sCurr]) {
      currencies[sCurr] = { paidA: 0, shareA: 0, paidB: 0, shareB: 0, settlements: 0 };
    }
    
    if (payer.toLowerCase().indexOf("alex") !== -1) {
      currencies[sCurr].settlements += setAmount;
    } else {
      currencies[sCurr].settlements -= setAmount;
    }
  }
  
  var lines = [];
  var currKeys = Object.keys(currencies);
  if (currKeys.length === 0) currKeys = ["₱"];
  
  for (var k = 0; k < currKeys.length; k++) {
    var c = currKeys[k];
    var data = currencies[c] || { paidA: 0, shareA: 0, paidB: 0, shareB: 0, settlements: 0 };
    var netA = (data.paidA - data.shareA) + data.settlements;
    
    if (Math.abs(netA) >= 0.01) {
      if (netA > 0) {
        lines.push("💡 *Sam* owes *Alex* " + c + netA.toFixed(2));
      } else {
        lines.push("💡 *Alex* owes *Sam* " + c + Math.abs(netA).toFixed(2));
      }
    }
  }
  
  if (lines.length === 0) {
    return "✅ *All settled up!* No outstanding balances.";
  }
  return lines.join("\n");
}

function getAllData(ss) {
  var expSheet = ss.getSheetByName(SHEET_EXPENSES);
  var setSheet = ss.getSheetByName(SHEET_SETTLEMENTS);
  
  var expenses = [];
  var expRows = expSheet.getDataRange().getValues();
  for (var i = 1; i < expRows.length; i++) {
    var r = expRows[i];
    if (!r[0]) continue;
    expenses.push({
      timestamp: r[0],
      id: r[1],
      description: r[2],
      amount: r[3],
      currency: r[4] || "₱",
      paidBy: r[5],
      splitMode: r[6],
      userAShare: r[7],
      userBShare: r[8],
      createdBy: r[9],
      category: r[10] || "General"
    });
  }
  
  var settlements = [];
  var setRows = setSheet.getDataRange().getValues();
  for (var j = 1; j < setRows.length; j++) {
    var s = setRows[j];
    if (!s[0]) continue;
    settlements.push({
      timestamp: s[0],
      id: s[1],
      payer: s[2],
      receiver: s[3],
      amount: s[4],
      currency: s[5] || "₱",
      method: s[6]
    });
  }
  
  var balanceSummary = calculateNetBalance(ss);
  
  return {
    expenses: expenses.reverse(),
    settlements: settlements.reverse(),
    balanceSummary: balanceSummary,
    spreadsheetUrl: ss.getUrl()
  };
}

function registerUser(chatId, fromUser) {
  if (!fromUser || !fromUser.id) return;
  var ss = getDbSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_USERS);
  var rows = sheet.getDataRange().getValues();
  var userId = fromUser.id;
  
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] == userId) {
      sheet.getRange(i + 1, 5).setValue(new Date());
      return;
    }
  }
  
  sheet.appendRow([
    userId,
    fromUser.username || "",
    fromUser.first_name || "",
    chatId,
    new Date()
  ]);
}

function sendGroupSummary(chatId, messageText) {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN === "YOUR_TELEGRAM_BOT_TOKEN_HERE") {
    Logger.log("Telegram Bot Token missing.");
    return;
  }
  
  var url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage";
  var payload = {
    chat_id: chatId,
    text: messageText,
    parse_mode: "Markdown"
  };
  
  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    UrlFetchApp.fetch(url, options);
  } catch(e) {
    Logger.log("Telegram Message Error: " + e.toString());
  }
}

function setWebhook() {
  var webAppUrl = ScriptApp.getService().getUrl();
  if (!webAppUrl) {
    Logger.log("Please deploy script as Web App first to obtain Web App URL!");
    return;
  }
  
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN === "YOUR_TELEGRAM_BOT_TOKEN_HERE") {
    Logger.log("Please set TELEGRAM_BOT_TOKEN before binding webhook!");
    return;
  }
  
  var url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/setWebhook?url=" + encodeURIComponent(webAppUrl);
  var response = UrlFetchApp.fetch(url);
  Logger.log("Set Webhook Response: " + response.getContentText());
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
