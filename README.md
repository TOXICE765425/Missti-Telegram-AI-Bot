# Missti — Naughty AI Girlfriend Telegram Bot

Powered by **xAI Grok** + **Firebase Realtime Database**  
Works on **Vercel • Render • Railway • VPS • any Node.js host**

---

## ✨ Features

### Personality
- Full AI Girlfriend vibe — naughty, attitude, possessive, caring
- Natural Hinglish / Hindi / English
- **Never** reveals she is AI
- Remembers previous conversation perfectly
- If user abuses (gali), bot also replies with attitude + remembers the exact words
- When user apologizes & asks “maine kya gali di thi”, bot recalls the exact word

### Memory (Firebase RTDB)
| Mode     | Limit | Behaviour                          |
|----------|-------|------------------------------------|
| Private  | 30    | Oldest messages auto-deleted       |
| Group    | 20    | Per-user rolling window            |

### Group Behaviour
- Replies **only** when:
  - User tags the bot
  - User replies to bot’s message
  - User says: hello, hey, hii, good morning, good night, good evening, kaise ho, etc.
- Max **12-15 words**, complete thought (no cut-off)

### Private Chat
- Unlimited length emotional replies

### Admin Panel (`/admin` — Owner only)
```
🛠 Admin Panel

👥 Users / Groups
• /user
• /group

📢 Broadcast
• /broadcast msg
• /broadcast chat_id msg
• /ubroadcast msg
• /ubroadcast user_id msg
• reply + /broadcast or /ubroadcast

🚫 Block
• /block user_id
• /unblock user_id
• /gblock group_id [reason]
• /gunblock group_id

⏻ Bot power
• /bot on|off
• /gbot on|off

📊 Stats
• /stats
• /stats user_id
• /stats -100xxx

🧠 Memory
• /kill memory
• /kill memory chat_id
• /ukill memory
• /ukill memory user_id
• /kill all
```

### Logger Channel
- Every error with full traceback + user info
- Bot added to new group (photo + details)
- Bot removed from group
- User blocked / unblocked
- Broadcast logs

---

## 🔑 Environment Variables

| Variable                        | Required | Description                                      |
|--------------------------------|----------|--------------------------------------------------|
| `BOT_TOKEN`                    | ✅       | From @BotFather                                  |
| `GROK_API_KEY`                 | ✅       | xAI API Key (https://console.x.ai)               |
| `BOT_NAME`                     | ❌       | Default: `Missti`                                |
| `OWNER_ID`                     | ✅       | Your Telegram numeric user ID                    |
| `LOGGER_ID`                    | ❌       | Channel / group ID for logs (recommend channel)  |
| `SUPPORT_URL`                  | ❌       | Support group/channel link                       |
| `FIREBASE_DATABASE_URL`        | ✅       | Firebase Realtime Database URL                   |
| `FIREBASE_SERVICE_ACCOUNT_JSON`| ✅       | Full service account JSON as string              |
| `GROK_MODEL`                   | ❌       | Override model (default uses first from list)    |
| `TELEGRAM_WEBHOOK_SECRET`      | ❌       | Extra webhook security                           |

### Hardcoded Grok Models
```js
[
  "grok-2-1212",
  "grok-2```

---

## 🚀 Deployment

### 1. Vercel (Recommended)
1. Push repo to GitHub
2. Import in Vercel
3. Add all Environment Variables
4. Deploy
5. Set webhook:
```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://YOUR-PROJECT.vercel.app/api/webhook"
```

### 2. Render
- New → Web Service
- Build: `npm install`
- Start: `node api/webhook.js` (or use their Node detection)
- Better to use a small Express wrapper if needed, or keep as serverless-style.

### 3. Railway
- New Project → Deploy from GitHub
- Add variables
- Railway auto-detects Node

### 4. VPS / Any Linux
```bash
git clone <repo>
cd missti-telegram-ai-bot
npm install
# create .env
node api/webhook.js   # for long polling you need extra code
# OR use pm2 + webhook with nginx + certbot
```

> For pure webhook on VPS you still need a reverse proxy (nginx/caddy) pointing to the Node process.

### 5. Other platforms
Any platform that supports Node.js 18+ and can receive HTTPS webhooks works (Fly.io, DigitalOcean App Platform, Google Cloud Run, AWS Lambda + API Gateway, etc.).

---

## 🔥 Firebase Setup
1. Create project → Realtime Database → Start in **locked mode**
2. Project Settings → Service Accounts → Generate new private key
3. Copy the **entire JSON** into `FIREBASE_SERVICE_ACCOUNT_JSON`
4. Copy Database URL into `FIREBASE_DATABASE_URL`

Suggested rules (adjust as needed):
```json
{
  "rules": {
    ".read": false,
    ".write": false
  }
}
```
(Bot uses Admin SDK so rules can stay locked)

---

## 📸 Logger Photos
Bot automatically rotates between these two images for logger messages:
- https://cdn.phototourl.com/member/2026-10-27-4fa85d9f-f13a-46d4-a240-393d8ff5be28.png
- https://cdn.phototourl.com/member/2026-10-27-e946f617-11e7-42ac-9250-828a75553972.jpg

---

## ⚠️ Notes
- Grok API is paid (no free unlimited tier as of late 2026). Keep an eye on usage.
- Group replies are intentionally short (12-15 words) so conversation stays clean.
- Owner commands only work for the ID set in `OWNER_ID`.
- Bot never says “I am AI”.

---

Made with ❤️ for the culture
