# Missti — Telegram AI Chatbot

## Features
- `/start`: personalized welcome video and caption
- Bot name: Missti
- Natural, casual Hinglish chat style
- Per-user preferred name and recent chat context in Firebase
- `/name Misstu` explicitly sets the name
- Recognizes simple messages such as “mera naam Misstu hai”
- `/newchat` clears chat history but keeps preferred name
- `/help`, typing indicator, long-response splitting
- Keeps up to 16 recent messages; history resets after 7 days of inactivity

## Setup
1. Create a bot with [@BotFather](https://t.me/BotFather).
2. Create a Firebase project and Realtime Database.
3. Firebase Project Settings → Service Accounts → generate a private key JSON.
4. Put the entire service-account JSON in Vercel's `FIREBASE_SERVICE_ACCOUNT_JSON` variable. Never commit this secret to GitHub.
5. Copy the exact Realtime Database URL shown by Firebase.
6. Upload this repo to GitHub and import it into Vercel.
7. Set these Vercel environment variables:

| Variable | Value |
|---|---|
| `BOT_TOKEN` | BotFather token |
| `AI_API_URL` | `https://anshapi.vercel.app/api/deepseek` |
| `AI_API_KEY` | `ansh` |
| `AI_MODEL` | `deepseek-v4-flash` |
| `FIREBASE_DATABASE_URL` | Exact Firebase RTDB URL |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Entire service account JSON |
| `TELEGRAM_WEBHOOK_SECRET` | Optional secret: letters/numbers/underscore/hyphen |

Redeploy after setting variables. Then set the webhook, replacing placeholders:

`https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://YOUR-PROJECT.vercel.app/api/webhook`

If using `TELEGRAM_WEBHOOK_SECRET`, set the webhook with a POST request containing both `url` and `secret_token`. Keep tokens private.

Check webhook status at:

`https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo`

## Welcome video
Configured URL: `https://yourimageshare.com/ib/aLiKKKuG3P.mp4`. Telegram must be able to fetch it directly. If it fails, host the MP4 at another public HTTPS URL or send it using Telegram `file_id`.

## API note
The code reads the AI response from `data.response`, with fallbacks to `response`, `data.answer`, and `answer`, based on the API format provided.
