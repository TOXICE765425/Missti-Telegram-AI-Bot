# Missti — Naughty AI Girlfriend Telegram Bot

**Groq + Firebase** powered Hinglish AI Girlfriend bot  
Modular codebase • Multi-platform ready

---

## ✨ Features

- Full **AI Girlfriend** personality (naughty, attitude, possessive)
- Kabhi nahi bolti ki woh AI hai
- Private: 30 messages memory (rolling)
- Group: 20 messages per user memory
- Group mein sirf tag / reply / greeting pe reply (12-15 words max)
- Gali system + exact memory
- Full Admin Panel (`/admin`)
- Logger channel (errors + join/leave + block)
- `/start` with user DP + buttons

---

## 📁 Project Structure

```
├── api/
│   └── webhook.js          ← Vercel entry + main handler
├── lib/
│   ├── config.js           ← Env + constants
│   ├── firebase.js         ← Database helpers
│   ├── telegram.js         ← Telegram API helpers
│   ├── ai.js               ← Groq API call
│   └── admin.js            ← All admin commands
├── prompts/
│   └── system.js           ← Bot personality prompt (yahan edit karo)
├── server.js               ← For Render / Railway / VPS
├── package.json
├── vercel.json
├── render.yaml
├── railway.json
└── .env.example
```

---

## 🔑 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_TOKEN` | ✅ | @BotFather se |
| `GROQ_API_KEY` | ✅ | https://console.groq.com/keys |
| `OWNER_ID` | ✅ | Tera Telegram numeric ID |
| `FIREBASE_DATABASE_URL` | ✅ | Firebase RTDB URL |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | ✅ | Poora service account JSON |
| `BOT_NAME` | ❌ | Default: Missti |
| `LOGGER_ID` | ❌ | Logger channel ID |
| `SUPPORT_URL` | ❌ | Support link |
| `GROQ_MODEL` | ❌ | Override model |
| `TELEGRAM_WEBHOOK_SECRET` | ❌ | Extra security |
| `PORT` | ❌ | Default 3000 (VPS/Render) |

---

## 🚀 Deployment Guides

### 1. Vercel (Serverless)

1. GitHub pe repo push karo
2. [vercel.com](https://vercel.com) → Import project
3. Environment Variables add karo
4. Deploy
5. Webhook set karo:

```bash
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://YOUR-PROJECT.vercel.app/api/webhook
```

> **Note:** Vercel pe Deployment Protection band rakho (Settings → Deployment Protection → Disabled)

---

### 2. Render

1. [render.com](https://render.com) → New → Web Service
2. Repo connect karo
3. Settings:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Environment Variables add karo
5. Deploy
6. Webhook:

```bash
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://YOUR-APP.onrender.com/api/webhook
```

`render.yaml` already included hai.

---

### 3. Railway

1. [railway.app](https://railway.app) → New Project → GitHub repo
2. Variables add karo
3. Deploy (auto detect hota hai)
4. Webhook:

```bash
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://YOUR-APP.up.railway.app/api/webhook
```

---

### 4. VPS / Any Linux Server

```bash
git clone <your-repo>
cd missti-telegram-ai-bot
cp .env.example .env
nano .env          # values bharo
npm install
npm start
```

Phir nginx + certbot se HTTPS lagao aur webhook set karo.

**PM2 se chalane ke liye:**
```bash
npm install -g pm2
pm2 start server.js --name missti
pm2 save
```

---

### 5. Other Platforms

| Platform | Support | Notes |
|----------|---------|-------|
| **Fly.io** | ✅ | `fly launch` + env secrets |
| **DigitalOcean App Platform** | ✅ | Node service |
| **Google Cloud Run** | ✅ | Containerize |
| **AWS Lambda + API Gateway** | ✅ | Serverless |
| **Heroku** | ✅ | `npm start` |
| **Deta Space / Cyclic** | ✅ | Similar to Vercel |
| **Replit** | ✅ | Secrets + always-on |

Almost har jagah kaam karega jahan Node.js 18+ chalta ho.

---

## 🧠 System Prompt

Poora personality prompt `prompts/system.js` mein hai.  
Wahan se edit kar sakte ho attitude, language, rules etc.

---

## 🛠 Admin Commands

Owner only (`OWNER_ID`):

```
/admin          → Full panel
/user           → All private users
/group          → All groups
/broadcast      → Groups
/ubroadcast     → Private users
/block /unblock
/gblock /gunblock
/bot on|off
/gbot on|off
/stats
/kill memory
/ukill memory
/kill all
```

---

## ⚠️ Common Issues

| Error | Fix |
|-------|-----|
| 404 Not Found | Route `/api/webhook` check karo + redeploy |
| 401 Unauthorized | `TELEGRAM_WEBHOOK_SECRET` hatao ya sahi secret ke saath set karo |
| DEPLOYMENT_NOT_FOUND | Galat domain use ho raha hai |
| Wrong response 500 | Environment variables missing / Firebase JSON galat |

---

## License

Private / Personal use.
