# Missti — AI Girlfriend Telegram Bot

**Custom Chat API + Firebase** | Modular | Long Polling  
Supports: **Render • Railway • Heroku • VPS • Koyeb • Fly.io** etc.

Vercel **removed** (bahut problems the).

---

## Chat API
Hardcoded in code (no API key):
`https://misstupapachataiapi.vercel.app/api/chat?prompt=...&model=gpt-5.2`

## Required Environment Variables

```
BOT_TOKEN
OWNER_ID
LOGGER_ID                 ← required (startup message yahan jayega)
SUPPORT_URL
FIREBASE_DATABASE_URL
FIREBASE_SERVICE_ACCOUNT_JSON
```

Optional: `BOT_NAME`, `GROQ_MODEL`, `PORT`

---

## Startup Logger Message

Bot start hote hi LOGGER_ID pe yeh message aayega:

```
» ✨Missti✨ bot started :

id : 8820085246
name : ✨Missti✨
username : @yourbot
logger_id : -1004092257215
```

---

## Deploy Guides

### 1. Render (Recommended + Free)
1. https://render.com → New → Web Service
2. Repo connect karo
3. **Build**: `npm install`
4. **Start**: `npm start`
5. Environment Variables add karo
6. Deploy
7. **UptimeRobot** se `https://your-app.onrender.com/health` ko 5 min pe ping karo (free plan sleep na kare)

### 2. Railway
1. https://railway.app → New Project → GitHub
2. Variables add karo
3. Deploy (auto)

### 3. Heroku
```bash
heroku create
heroku config:set BOT_TOKEN=... =... OWNER_ID=... LOGGER_ID=... ...
git push heroku main
```

### 4. VPS (Ubuntu)
```bash
git clone <repo>
cd missti-telegram-ai-bot
cp .env.example .env
nano .env
npm install
npm start

# PM2 se:
npm i -g pm2
pm2 start server.js --name missti
pm2 save && pm2 startup
```

### 5. Other platforms
Koyeb, Fly.io, DigitalOcean App Platform, Google Cloud Run — sab jagah `npm start` chalega.

---

## Features
- Naughty AI Girlfriend (never reveals AI)
- Private 30 msg / Group 20 msg memory
- Group: only tag/reply/greetings (12-15 words)
- Full Admin Panel (`/admin`)
- Logger channel (errors + join/leave + block + **startup**)
- Long polling (no webhook headache)
- Health endpoint `/` and `/health` for UptimeRobot

---

## Structure
```
server.js          → entry + long polling + health
bot.js             → update handler
lib/
  config.js
  firebase.js
  telegram.js
  ai.js
  admin.js
prompts/
  system.js        ← personality yahan se edit karo
```
