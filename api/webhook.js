const admin = require("firebase-admin");

const BOT_TOKEN = process.env.BOT_TOKEN;
const AI_API_URL = process.env.AI_API_URL;
const AI_API_KEY = process.env.AI_API_KEY;
const AI_MODEL = process.env.AI_MODEL;
const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const FIREBASE_SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const TG = `https://api.telegram.org/bot${BOT_TOKEN}`;
const WELCOME_VIDEO_URL = "https://yourimageshare.com/ib/aLiKKKuG3P.mp4";
const MAX_HISTORY_MESSAGES = 16;
const MEMORY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getDb() {
  if (!FIREBASE_DATABASE_URL || !FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error("Firebase env vars missing");
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON)),
      databaseURL: FIREBASE_DATABASE_URL
    });
  }
  return admin.database();
}

async function telegram(method, body) {
  const r = await fetch(`${TG}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.description || `Telegram ${method} failed`);
  return j.result;
}

const clean = v => String(v || "").trim().replace(/\s+/g, " ").slice(0, 60);

function detectName(text) {
  const patterns = [
    /(?:mera naam|my name is|call me|naam hai)\s+(?:to|hi)?\s*["']?([a-zA-Z][a-zA-Z0-9 _.-]{0,35})/i,
    /(?:main|mai|me)\s+([a-zA-Z][a-zA-Z0-9_-]{1,25})\s+(?:hoon|hun|hu)\b/i
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]) {
      const name = clean(m[1])
        .split(/\s+(?:hai|hoon|hun|hu|aur|please|bulao)\b/i)[0]
        .replace(/[.!?,;:]+$/, "").trim();
      if (name && name.length <= 36) return name;
    }
  }
  return null;
}

function welcomeCaption(name) {
  return `👋 Welcome ${name} ❤️\n\nHey ${name}! 😎\nMain Missti hoon, tumhari AI dost. 💖\n\nMujhse kuch bhi pooch sakte ho, apni baatein share kar sakte ho ya bas chill karke chatting kar sakte ho.\n\n🧠 Main tumhara naam aur pichhli baaton ka context yaad rakhne ki koshish karungi.\n\nChalo ${name}, batao kya chal raha hai? 🫶`;
}

function splitMessage(text) {
  const chunks = [];
  while (text.length > 4000) {
    let cut = text.lastIndexOf("\n", 4000);
    if (cut < 1000) cut = 4000;
    chunks.push(text.slice(0, cut));
    text = text.slice(cut).trimStart();
  }
  if (text) chunks.push(text);
  return chunks;
}

async function askAI(text, profile, history) {
  const preferredName = profile.preferredName || profile.firstName || "dost";
  const past = history.map(m => `${m.role === "user" ? "User" : "Missti"}: ${m.content}`).join("\n");
  const prompt = [
    "Tumhara naam Missti hai. Tum ek friendly, natural, casual Hinglish chatting dost ho.",
    "User jis language mein baat kare, usi mein jawab do. Har baar lamba lecture mat do; context ke hisaab se chhota ya detailed reply do.",
    `User ka preferred name ${preferredName} hai. Naam kabhi-kabhi naturally use karo, har message mein nahi.`,
    "Friendly humour, empathy aur limited emojis use karo. Robotic replies se bacho. Khud ko real human hone ka jhootha claim mat karo.",
    "Conversation context yaad rakho, lekin user ke baare mein wahi facts bolo jo chat mein diye gaye hain.",
    past ? `Recent conversation:\n${past}` : "",
    `Latest user message: ${text}`,
    "Missti ka natural reply:"
  ].filter(Boolean).join("\n\n");

  const url = new URL(AI_API_URL);
  url.searchParams.set("key", AI_API_KEY);
  url.searchParams.set("prompt", prompt);
  url.searchParams.set("model", AI_MODEL);

  const r = await fetch(url.toString(), { headers: { accept: "application/json" } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`AI API returned HTTP ${r.status}`);
  const answer = data?.data?.response || data?.response || data?.data?.answer || data?.answer;
  if (typeof answer !== "string" || !answer.trim()) throw new Error("AI response field missing");
  return answer.trim();
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(200).send("Missti Telegram AI webhook is running.");
  const missing = ["BOT_TOKEN", "AI_API_URL", "AI_API_KEY", "AI_MODEL", "FIREBASE_DATABASE_URL", "FIREBASE_SERVICE_ACCOUNT_JSON"].filter(k => !process.env[k]);
  if (missing.length) return res.status(500).send(`Missing environment variables: ${missing.join(", ")}`);
  if (TELEGRAM_WEBHOOK_SECRET &&
      req.headers["x-telegram-bot-api-secret-token"] !== TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).send("Unauthorized");
  }

  try {
    const update = req.body || {};
    const msg = update.message || update.edited_message;
    if (!msg?.chat || typeof msg.text !== "string" || !msg.from?.id) {
      return res.status(200).json({ ok: true });
    }

    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text.trim();
    const ref = getDb().ref(`misstiUsers/${userId}`);
    const snap = await ref.once("value");
    const profile = snap.val() || {};
    profile.firstName = clean(msg.from.first_name) || "dost";
    profile.username = clean(msg.from.username) || null;
    profile.telegramUserId = userId;
    profile.preferredName = profile.preferredName || profile.firstName;
    profile.updatedAt = Date.now();

    if (text === "/start" || text.startsWith("/start ")) {
      await ref.update(profile);
      await telegram("sendVideo", {
        chat_id: chatId,
        video: WELCOME_VIDEO_URL,
        caption: welcomeCaption(profile.preferredName)
      });
      return res.status(200).json({ ok: true });
    }

    if (text === "/help") {
      await telegram("sendMessage", {
        chat_id: chatId,
        text: "Main Missti hoon ❤️ Bas message bhejo aur hum baat karenge.\n/name Misstu — apna naam set karo\n/newchat — chat history clear\n/help — help"
      });
      return res.status(200).json({ ok: true });
    }

    if (text === "/newchat") {
      profile.history = [];
      profile.memoryUpdatedAt = Date.now();
      await ref.set(profile);
      await telegram("sendMessage", {
        chat_id: chatId,
        text: `Ho gaya ${profile.preferredName} 😄 Purani chat memory clear kar di. Ab nayi baat shuru karein? ❤️`
      });
      return res.status(200).json({ ok: true });
    }

    if (text.startsWith("/name ")) {
      const newName = clean(text.slice(6));
      if (!newName) {
        await telegram("sendMessage", { chat_id: chatId, text: "Aise bhejo: /name Misstu" });
      } else {
        profile.preferredName = newName;
        await ref.update(profile);
        await telegram("sendMessage", { chat_id: chatId, text: `Achha ${newName} 😄 Ab se main tumhe ${newName} bulaungi! ❤️` });
      }
      return res.status(200).json({ ok: true });
    }

    if (text.startsWith("/")) {
      await telegram("sendMessage", { chat_id: chatId, text: "Ye command abhi nahi jaanti 😅 /help try karo." });
      return res.status(200).json({ ok: true });
    }

    const nameMatch = text.match(/(?:mera naam|my name is|call me|naam hai)\s+(?:to|hi)?\s*["']?([a-zA-Z][a-zA-Z0-9 _.-]{0,35})/i);
    if (nameMatch && nameMatch[1]) {
      const name = clean(nameMatch[1]).split(/\s+(?:hai|hoon|hun|aur|please|bulao)\b/i)[0].replace(/[.!?,;:]+$/, "").trim();
      if (name) profile.preferredName = name;
    }

    if (!profile.memoryUpdatedAt || Date.now() - profile.memoryUpdatedAt > MEMORY_TTL_MS) profile.history = [];
    const history = Array.isArray(profile.history) ? profile.history.slice(-MAX_HISTORY_MESSAGES) : [];
    await ref.update(profile);
    await telegram("sendChatAction", { chat_id: chatId, action: "typing" });

    const answer = await askAI(text, profile, history);
    history.push({ role: "user", content: text }, { role: "assistant", content: answer });
    profile.history = history.slice(-MAX_HISTORY_MESSAGES);
    profile.memoryUpdatedAt = Date.now();
    profile.updatedAt = Date.now();
    await ref.set(profile);

    for (const part of splitMessage(answer)) {
      await telegram("sendMessage", { chat_id: chatId, text: part, disable_web_page_preview: true });
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Missti webhook error:", error);
    try {
      const msg = req.body?.message || req.body?.edited_message;
      if (msg?.chat?.id) await telegram("sendMessage", {
        chat_id: msg.chat.id,
        text: "⚠️ Abhi reply nahi aa paaya bhai. Thodi der baad phir try karna."
      });
    } catch (e) { console.error("Could not send error:", e); }
    if (!res.headersSent) return res.status(200).json({ ok: true });
  }
};
