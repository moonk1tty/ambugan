# splitnest API & Telegram Group Integration Documentation

## Overview
**splitnest** is a multi-currency expense tracker designed for Telegram group chats and private 1-on-1 chats. It uses **Google Sheets** as its cloud database via a **Google Apps Script (GAS)** Web App backend, providing zero-database-cost persistence, group member tracking, and net debt balance calculations.

---

## Database Architecture (Google Sheets)

The database consists of three primary sheets in a single Google Spreadsheet:

### 1. `Expenses` Sheet
Tracks all expenses logged in a group or private chat.

| Column Index | Field Name | Type | Description |
|---|---|---|---|
| A (0) | `Timestamp` | Date/String | ISO timestamp when expense was recorded |
| B (1) | `ID` | String | Unique expense ID (e.g. `exp_1723620000000`) |
| C (2) | `Description` | String | Short title/description of expense (e.g. "Dinner & Drinks") |
| D (3) | `Amount` | Number | Total cost (e.g. `1250.50`) |
| E (4) | `Currency` | String | Currency symbol (e.g. `₱`, `$`, `€`, `£`, `¥`) |
| F (5) | `PaidBy` | String | Display name/handle of the payer |
| G (6) | `SplitMode` | String | Split method: `50/50 Equal`, `Exact Amounts`, `Percentages`, `Single Payer (100% owed)` |
| H (7) | `UserAShare` | Number | Calculated share for User A |
| I (8) | `UserBShare` | Number | Calculated share for User B |
| J (9) | `CreatedBy` | String | Name of person who logged the record |
| K (10) | `Category` | String | Category (`Food`, `Groceries`, `Travel`, `Utilities`, `Entertainment`, `Misc`) |
| L (11) | `ChatID` | String | Telegram Chat ID (`-100...` for groups, or User ID for 1-on-1 chats) |

---

### 2. `Settlements` Sheet
Records payments made between group members to settle up debts.

| Column Index | Field Name | Type | Description |
|---|---|---|---|
| A (0) | `Timestamp` | Date/String | ISO timestamp when settlement was recorded |
| B (1) | `ID` | String | Unique settlement ID (e.g. `set_1723620000000`) |
| C (2) | `Payer` | String | Name of debtor paying off balance |
| D (3) | `Receiver` | String | Name of creditor receiving funds |
| E (4) | `Amount` | Number | Settlement amount paid |
| F (5) | `Currency` | String | Currency symbol |
| G (6) | `Method` | String | Payment method (e.g. `GCash / Bank Transfer`, `Cash`, `In-App Settle`) |
| H (7) | `ChatID` | String | Telegram Chat ID for group isolation |

---

### 3. `Users` Sheet
Logs Telegram group members and users who interact with the bot or participate in group chats.

| Column Index | Field Name | Type | Description |
|---|---|---|---|
| A (0) | `UserID` | String/Number | Unique Telegram User ID |
| B (1) | `UserName` | String | Telegram handle (e.g. `@john_doe`) |
| C (2) | `FirstName` | String | First & last display name (e.g. `John Doe`) |
| D (3) | `ChatID` | String | Telegram Group or Private Chat ID |
| E (4) | `LastSeen` | Date/String | Timestamp when user was last active |

---

## How Expenses & Settlements Tie Up to Telegram Groups (`ChatID`)

1. **Isolation by `ChatID`**:
   - Group chats in Telegram have negative numeric IDs starting with `-100` (e.g., `-1002422534571`).
   - Private 1-on-1 chats use the user's positive numeric Telegram User ID.
   - When fetching data (`getAllData(chatId)`), `Code.gs` filters rows in `Expenses`, `Settlements`, and `Users` so that **only records matching that exact `ChatID` are returned**.

2. **Telegram Mini App Link Parameter**:
   - When opening the Mini App via `https://t.me/splitnest_bot/ambugan?startapp=-1002422534571`, Telegram passes `-1002422534571` inside `Telegram.WebApp.initDataUnsafe.start_param`.
   - The React frontend normalizes this value into standard `-100...` format and includes `chatId` in all API requests.

3. **Automatic Member Detection**:
   - Whenever a Telegram user interacts with the bot or sends a message in a group, `Code.gs` logs the user into the `Users` sheet.
   - For group chats (`chatId < 0`), `Code.gs` also uses Telegram's `getChatAdministrators` API to automatically register group admins into the `Users` sheet.

---

## API Endpoints Reference (`Code.gs`)

### 1. `GET /exec?action=get_data&chatId=<CHAT_ID>`
Retrieves all expenses, settlements, user list, and net balance calculation for a given Telegram chat.

**Sample Request:**
`GET https://script.google.com/macros/s/.../exec?action=get_data&chatId=-1002422534571`

**Sample Response:**
```json
{
  "status": "success",
  "data": {
    "expenses": [
      {
        "id": "exp_1723620000000",
        "description": "Team Lunch",
        "amount": 1500,
        "currency": "₱",
        "paidBy": "Alex",
        "splitMode": "50/50 Equal",
        "userAShare": 750,
        "userBShare": 750,
        "createdBy": "Alex",
        "category": "Food",
        "chatId": "-1002422534571"
      }
    ],
    "settlements": [
      {
        "id": "set_1723620500000",
        "payer": "Sam",
        "receiver": "Alex",
        "amount": 750,
        "currency": "₱",
        "method": "GCash",
        "chatId": "-1002422534571"
      }
    ],
    "users": [
      {
        "userId": "582910482",
        "username": "@alex_dev",
        "firstName": "Alex",
        "chatId": "-1002422534571"
      }
    ],
    "balanceSummary": "All debts settled up!"
  }
}
```

---

### 2. `POST /exec` (Action: `add_expense`)
Adds a new expense entry to Google Sheets for the active group.

**Payload:**
```json
{
  "action": "add_expense",
  "chatId": "-1002422534571",
  "expense": {
    "description": "Groceries",
    "amount": 1200,
    "currency": "₱",
    "paidBy": "Alex",
    "splitMode": "50/50 Equal",
    "createdBy": "Alex",
    "category": "Groceries"
  }
}
```

---

### 3. `POST /exec` (Action: `settle_up`)
Records a settlement payment between group members.

**Payload:**
```json
{
  "action": "settle_up",
  "chatId": "-1002422534571",
  "settlement": {
    "payer": "Sam",
    "receiver": "Alex",
    "amount": 600,
    "currency": "₱",
    "method": "GCash"
  }
}
```

---

### 4. Telegram `/start` Command
When a user sends `/start` or adds the bot to a group chat, `Code.gs` responds with instructions and an inline button:

**Message Output:**
> 👋 **Welcome to splitnest!**
>
> Expense tracker for Telegram groups & 1-on-1 chats.
>
> • Tap the button below to launch the Mini App inside Telegram.
> • Log group expenses, track balances, and settle up easily.
> • Group members are automatically synced to your shared expense ledger.
>
> `[ 🚀 Open splitnest App ]`
