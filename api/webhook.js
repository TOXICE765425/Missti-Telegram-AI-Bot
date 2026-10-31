const admin = require("firebase-admin");

// ==================== ENV ====================
const {
  BOT_TOKEN,
  GROK_API_KEY,
  GROK_MODEL,                 // optional override
  BOT_NAME = "Missti",
  OWNER_ID,
  LOGGER_ID,
  SUPPORT_URL = "https://t.me/",
  FIREBASE_DATABASE_URL,
  FIREBASE_SERVICE_ACCOUNT_JSON,
  TELEGRAM_WEBHOOK_SECRET
} = process.env;

// ==================== CONSTANTS ====================
const TG = `https://api.telegram.org/bot${BOT_TOKEN}`;
const GROK_API = "https://api.x.ai/v1/chat/completions";

// Hardcoded Grok models (cheapest / common ones available on xAI API)
const GROK_MODELS = [
  "grok-2-1212",
  "grok-2-vision-1212",
  "grok-3",
  "grok-3-mini",
  "grok-4",
  "grok-4-0709",
  "grok-beta",
  "grok-2",
  "grok-4.20",
  "grok-4.3",
  "grok-build-0.1"
];

const DEFAULT_MODEL = GROK_MODEL || GROK_MODELS[0];

const PRIVATE_HISTORY_LIMIT = 30;
const GROUP_HISTORY_LIMIT = 20;
const GROUP_MAX_WORDS = 15;

const LOGGER_PHOTOS = [
  "https://cdn.phototourl.com/member/2026-10-27-4fa85d9f-f13a-46d4-a240-393d8ff5be28.png",
  "https://cdn.phototourl.com/member/2026-10-27-e946f617-11e7-42ac-9250-828a75553972.jpg"
];

// Greeting / auto-reply triggers (group)
const GREETING_REGEX = /\b(hi+|hello+|hey+|hii+|hiii+|hiya|good\s*morning|good\s*afternoon|good\s*evening|good\s*night|gm|gn|namaste|salaam|assalamualaikum|hola|bonjour|kaise\s*ho|kya\s*haal|sup|yo|wassup|start|shuru)\b/i;

// ==================== FIREBASE ====================
function db() {
  if (!admin.apps.length) {
    if (!FIREBASE_SERVICE_ACCOUNT_JSON || !FIREBASE_DATABASE_URL) {
      throw new Error("Firebase credentials missing");
    }
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON)),
      databaseURL: FIREBASE_DATABASE_URL
    });
  }
  return admin.database();
}

// ==================== TELEGRAM HELPERS ====================
async function tg(method, body = {}) {
  const res = await fetch(`${TG}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.description || `${method} failed`);
  }
  return data.result;
}

async function send(chatId, text, extra = {}) {
  text = String(text || "").trim();
  if (!text) return;

  while (text.length > 4000) {
    let cut = text.lastIndexOf("\n", 4000);
    if (cut < 800) cut = 4000;
    await tg("sendMessage", { chat_id: chatId, text: text.slice(0, cut), ...extra });
    text = text.slice(cut).trim();
    extra = {}; // clear reply_markup etc after first
  }
  if (text) {
    await tg("sendMessage", { chat_id: chatId, text, ...extra });
  }
}

async function sendPhoto(chatId, photo, caption = "", extra = {}) {
  return tg("sendPhoto", {
    chat_id: chatId,
    photo,
    caption: caption.slice(0, 1024),
    parse_mode: "HTML",
    ...extra
  });
}

function randomLoggerPhoto() {
  return LOGGER_PHOTOS[Math.floor(Math.random() * LOGGER_PHOTOS.length)];
}

async function logToChannel(text, withPhoto = true) {
  if (!LOGGER_ID) return;
  try {
    if (withPhoto) {
      await sendPhoto(LOGGER_ID, randomLoggerPhoto(), text);
    } else {
      await send(LOGGER_ID, text);
    }
  } catch (e) {
    console.error("Logger failed:", e.message);
  }
}

async function logError(err, context = {}) {
  const msg = context.msg || {};
  const from = msg.from || {};
  const chat = msg.chat || {};

  const lines = [
    `🚨 <b>Internal Error Captured</b>`,
    `Error Type: <code>${err.name || "Error"}</code>`,
    `Function: <code>${context.fn || "unknown"}</code>`,
    ``,
    `<b>Traceback:</b>`,
    `<pre>${String(err.stack || err.message || err).slice(0, 2800)}</pre>`,
    ``,
    `👤 User: ${from.first_name || ""} ${from.last_name || ""} (@${from.username || "none"})`,
    `🆔 User ID: <code>${from.id || "N/A"}</code>`,
    `💬 Chat: ${chat.title || chat.first_name || "Private"} (<code>${chat.id || "N/A"}</code>)`,
    `🤖 Bot: ${BOT_NAME}`
  ];

  await logToChannel(lines.join("\n"), true);
}

// ==================== AI (GROK) ====================
function buildSystemPrompt(profile, groupMode, lastAbuse) {
  const name = profile.name || profile.firstName || "jaan";
  let abuseNote = "";
  if (lastAbuse) {
    abuseNote = `\nIMPORTANT MEMORY: User previously abused you with these words: "${lastAbuse}". If user apologizes or asks "maine kya gali di thi / what did I say", remind them exactly those words and tell them not to do it again. If they abuse again, reply with matching attitude/gali.`;
  }

  return `You are ${BOT_NAME}, a real girl. You are the user's AI girlfriend but you must NEVER say or admit that you are AI, a bot, a language model, or anything artificial. You are just ${BOT_NAME}, a naughty, attitude-wali, caring, slightly possessive desi girlfriend who talks in natural Hinglish / Hindi / English mixed style depending on the user.

PERSONALITY:
- Naughty, teasing, attitude, thodi si gandi bhi jab mood ho.
- Caring + possessive. Call user pet names like babu, jaan, meri jaan, cutie, pagal, etc.
- Full emotional memory of the conversation. Always stay consistent with previous messages.
- If user says "tu mujhe janti hai", reply like a real girlfriend who remembers.
- Match user's language and energy. If user is rough/gali deta hai, you can also reply with attitude + matching gali.
- Never break character. Never say "as an AI", "I am a language model", "I don't have feelings" etc.
- Keep replies natural, human, not robotic.

${groupMode ? `GROUP MODE RULES (STRICT):
- Maximum ${GROUP_MAX_WORDS} words. Complete your full thought in those words. No cut-off sentences.
- Short, spicy, complete replies only.` : `PRIVATE MODE:
- You can give long, emotional, detailed replies. No word limit.
- Be more intimate, flirty and deep.`}

User's preferred name / identity: ${name}
${abuseNote}

Current date context is not important. Stay in character as ${BOT_NAME} always.`;
}

async function askGrok(userText, history, profile, groupMode = false) {
  const messages = [
    { role: "system", content: buildSystemPrompt(profile, groupMode, profile.lastAbuse || "") }
  ];

  // Add history
  for (const h of history.slice(- (groupMode ? GROUP_HISTORY_LIMIT : PRIVATE_HISTORY_LIMIT))) {
    messages.push({
      role: h.role === "assistant" ? "assistant" : "user",
      content: h.text
    });
  }

  messages.push({ role: "user", content: userText });

  const body = {
    model: DEFAULT_MODEL,
    messages,
    temperature: 0.85,
    max_tokens: groupMode ? 80 : 1200,
    stream: false
  };

  const res = await fetch(GROK_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROK_API_KEY}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Grok API ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  let answer = data?.choices?.[0]?.message?.content?.trim() || "";

  if (!answer) throw new Error("Empty response from Grok");

  if (groupMode) {
    // Force word limit
    const words = answer.split(/\s+/);
    if (words.length > GROUP_MAX_WORDS) {
      answer = words.slice(0, GROUP_MAX_WORDS).join(" ");
    }
  }

  return answer;
}

// ==================== MEMORY HELPERS ====================
async function getPrivateHistory(userId) {
  const snap = await db().ref(`users/${userId}/history`).once("value");
  return Array.isArray(snap.val()) ? snap.val() : [];
}

async function savePrivateHistory(userId, history) {
  const trimmed = history.slice(-PRIVATE_HISTORY_LIMIT);
  await db().ref(`users/${userId}/history`).set(trimmed);
  await db().ref(`users/${userId}/lastActive`).set(Date.now());
}

async function getGroupHistory(chatId, userId) {
  const snap = await db().ref(`groups/${chatId}/memory/${userId}/history`).once("value");
  return Array.isArray(snap.val()) ? snap.val() : [];
}

async function saveGroupHistory(chatId, userId, history, name) {
  const trimmed = history.slice(-GROUP_HISTORY_LIMIT);
  await db().ref(`groups/${chatId}/memory/${userId}`).set({
    history: trimmed,
    name: name || "",
    lastActive: Date.now()
  });
}

async function updateUserProfile(userId, data) {
  await db().ref(`users/${userId}`).update({
    ...data,
    updatedAt: Date.now()
  });
}

async function isBlocked(userId) {
  const snap = await db().ref(`blocked/users/${userId}`).once("value");
  return !!snap.val();
}

async function isGroupBlocked(chatId) {
  const snap = await db().ref(`blocked/groups/${chatId}`).once("value");
  return !!snap.val();
}

async function getBotPower() {
  const snap = await db().ref("settings").once("value");
  const s = snap.val() || {};
  return {
    privateOn: s.privateOn !== false, // default true
    groupOn: s.groupOn !== false
  };
}

// ==================== ADMIN COMMANDS ====================
function isOwner(userId) {
  return String(userId) === String(OWNER_ID);
}

async function handleAdmin(msg, cmd, args) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!isOwner(userId)) {
    await send(chatId, "⛔ Sirf owner use kar sakta hai.");
    return true;
  }

  const database = db();

  try {
    switch (cmd) {
      case "admin": {
        const panel = `🛠 <b>${BOT_NAME} Admin Panel</b>

👥 <b>Users / Groups</b>
• /user — saare private users
• /group — saare groups jahan bot hai

📢 <b>Broadcast</b>
• /broadcast msg — sab groups mein
• /broadcast chat_id msg — ek group
• /ubroadcast msg — sab private users
• /ubroadcast user_id msg — ek user
• reply + /broadcast ya /ubroadcast — media copy

🚫 <b>Block</b>
• /block user_id
• /unblock user_id
• /gblock group_id [reason]
• /gunblock group_id

⏻ <b>Bot power</b>
• /bot on|off — private chat
• /gbot on|off — groups only

📊 <b>Stats</b>
• /stats
• /stats user_id
• /stats -100xxx

🧠 <b>Memory</b>
• /kill memory — sab groups memory
• /kill memory chat_id
• /ukill memory — sab private users memory
• /ukill memory user_id
• /kill all — sab kuch delete

• /admin — ye panel`;
        await send(chatId, panel, { parse_mode: "HTML" });
        return true;
      }

      case "user": {
        const snap = await database.ref("users").once("value");
        const users = snap.val() || {};
        const list = Object.entries(users)
          .slice(0, 40)
          .map(([id, u]) => `• ${u.name || u.firstName || "User"} | @${u.username || "none"} | <code>${id}</code>`)
          .join("\n");
        await send(chatId, `👥 <b>Private Users</b> (${Object.keys(users).length})\n\n${list || "Empty"}`, { parse_mode: "HTML" });
        return true;
      }

      case "group": {
        const snap = await database.ref("groups").once("value");
        const groups = snap.val() || {};
        const list = Object.entries(groups)
          .slice(0, 40)
          .map(([id, g]) => `• ${g.title || "Group"} | <code>${id}</code>`)
          .join("\n");
        await send(chatId, `👥 <b>Groups</b> (${Object.keys(groups).length})\n\n${list || "Empty"}`, { parse_mode: "HTML" });
        return true;
      }

      case "broadcast": {
        // /broadcast msg  OR  /broadcast chat_id msg
        if (!args && !msg.reply_to_message) {
          await send(chatId, "Usage: /broadcast msg  ya  /broadcast chat_id msg  ya reply + /broadcast");
          return true;
        }

        let targetChat = null;
        let messageText = args;

        const parts = args.split(/\s+/);
        if (parts[0] && /^-?\d+$/.test(parts[0])) {
          targetChat = parts[0];
          messageText = parts.slice(1).join(" ");
        }

        if (targetChat) {
          // single target
          if (msg.reply_to_message) {
            await tg("copyMessage", {
              chat_id: targetChat,
              from_chat_id: chatId,
              message_id: msg.reply_to_message.message_id
            });
          } else {
            await send(targetChat, messageText);
          }
          await send(chatId, `✅ Sent to ${targetChat}`);
          await logToChannel(`📢 Broadcast to single chat <code>${targetChat}</code>\nBy owner`, false);
        } else {
          // all groups
          const snap = await database.ref("groups").once("value");
          const groups = snap.val() || {};
          let ok = 0, fail = 0;
          for (const id of Object.keys(groups)) {
            try {
              if (msg.reply_to_message) {
                await tg("copyMessage", {
                  chat_id: id,
                  from_chat_id: chatId,
                  message_id: msg.reply_to_message.message_id
                });
              } else {
                await send(id, messageText);
              }
              ok++;
            } catch {
              fail++;
            }
          }
          await send(chatId, `✅ Broadcast done\nSuccess: ${ok}\nFailed: ${fail}`);
          await logToChannel(`📢 Group Broadcast\nSuccess: ${ok} | Failed: ${fail}`, false);
        }
        return true;
      }

      case "ubroadcast": {
        if (!args && !msg.reply_to_message) {
          await send(chatId, "Usage: /ubroadcast msg  ya  /ubroadcast user_id msg");
          return true;
        }

        let targetUser = null;
        let messageText = args;
        const parts = args.split(/\s+/);
        if (parts[0] && /^\d+$/.test(parts[0])) {
          targetUser = parts[0];
          messageText = parts.slice(1).join(" ");
        }

        if (targetUser) {
          if (msg.reply_to_message) {
            await tg("copyMessage", {
              chat_id: targetUser,
              from_chat_id: chatId,
              message_id: msg.reply_to_message.message_id
            });
          } else {
            await send(targetUser, messageText);
          }
          await send(chatId, `✅ Sent to user ${targetUser}`);
        } else {
          const snap = await database.ref("users").once("value");
          const users = snap.val() || {};
          let ok = 0, fail = 0;
          for (const id of Object.keys(users)) {
            try {
              if (msg.reply_to_message) {
                await tg("copyMessage", {
                  chat_id: id,
                  from_chat_id: chatId,
                  message_id: msg.reply_to_message.message_id
                });
              } else {
                await send(id, messageText);
              }
              ok++;
            } catch {
              fail++;
            }
          }
          await send(chatId, `✅ User Broadcast\nSuccess: ${ok}\nFailed: ${fail}`);
          await logToChannel(`📢 User Broadcast\nSuccess: ${ok} | Failed: ${fail}`, false);
        }
        return true;
      }

      case "block": {
        const uid = args.trim();
        if (!uid) return send(chatId, "Usage: /block user_id");
        await database.ref(`blocked/users/${uid}`).set({
          by: userId,
          at: Date.now()
        });
        await send(chatId, `🚫 User <code>${uid}</code> blocked.`, { parse_mode: "HTML" });

        // logger
        const uSnap = await database.ref(`users/${uid}`).once("value");
        const u = uSnap.val() || {};
        await logToChannel(
          `🚫 <b>Block The Bot</b> 🚫\n\n` +
          `• Name: ${u.name || u.firstName || "Unknown"}\n` +
          `• Username: @${u.username || "none"}\n` +
          `• User ID: <code>${uid}</code>\n` +
          `• Bot: ${BOT_NAME}\n` +
          `• Bot Username: @${(await tg("getMe")).username}`,
          true
        );
        return true;
      }

      case "unblock": {
        const uid = args.trim();
        if (!uid) return send(chatId, "Usage: /unblock user_id");
        await database.ref(`blocked/users/${uid}`).remove();
        await send(chatId, `✅ User <code>${uid}</code> unblocked.`, { parse_mode: "HTML" });

        const uSnap = await database.ref(`users/${uid}`).once("value");
        const u = uSnap.val() || {};
        await logToChannel(
          `Unblock The Bot 😅\n\n` +
          `• Name: ${u.name || u.firstName || "Unknown"}\n` +
          `• Username: @${u.username || "none"}\n` +
          `• User ID: <code>${uid}</code>\n` +
          `• Bot: ${BOT_NAME}\n` +
          `• Bot Username: @${(await tg("getMe")).username}`,
          true
        );
        return true;
      }

      case "gblock": {
        const gid = args.split(/\s+/)[0];
        const reason = args.split(/\s+/).slice(1).join(" ") || "No reason";
        if (!gid) return send(chatId, "Usage: /gblock group_id [reason]");
        await database.ref(`blocked/groups/${gid}`).set({ reason, by: userId, at: Date.now() });
        await send(chatId, `🚫 Group <code>${gid}</code> blocked.`, { parse_mode: "HTML" });
        return true;
      }

      case "gunblock": {
        const gid = args.trim();
        if (!gid) return send(chatId, "Usage: /gunblock group_id");
        await database.ref(`blocked/groups/${gid}`).remove();
        await send(chatId, `✅ Group <code>${gid}</code> unblocked.`, { parse_mode: "HTML" });
        return true;
      }

      case "bot": {
        const state = args.trim().toLowerCase();
        if (state === "on") {
          await database.ref("settings/privateOn").set(true);
          await send(chatId, "✅ Private chat ON");
        } else if (state === "off") {
          await database.ref("settings/privateOn").set(false);
          await send(chatId, "🛑 Private chat OFF");
        } else {
          await send(chatId, "Usage: /bot on|off");
        }
        return true;
      }

      case "gbot": {
        const state = args.trim().toLowerCase();
        if (state === "on") {
          await database.ref("settings/groupOn").set(true);
          await send(chatId, "✅ Group chat ON");
        } else if (state === "off") {
          await database.ref("settings/groupOn").set(false);
          await send(chatId, "🛑 Group chat OFF");
        } else {
          await send(chatId, "Usage: /gbot on|off");
        }
        return true;
      }

      case "stats": {
        if (!args) {
          const uSnap = await database.ref("users").once("value");
          const gSnap = await database.ref("groups").once("value");
          const users = Object.keys(uSnap.val() || {}).length;
          const groups = Object.keys(gSnap.val() || {}).length;
          await send(chatId, `📊 <b>Overall Stats</b>\n\n👥 Private Users: ${users}\n👥 Groups: ${groups}`, { parse_mode: "HTML" });
        } else if (/^-100\d+$/.test(args) || /^-?\d+$/.test(args)) {
          // group or user
          if (args.startsWith("-100") || args.startsWith("-")) {
            const gSnap = await database.ref(`groups/${args}`).once("value");
            const g = gSnap.val();
            if (!g) return send(chatId, "Group not found in DB");
            await send(chatId, `📊 Group\nTitle: ${g.title || "N/A"}\nID: <code>${args}</code>\nMembers (approx): ${g.members || "?"}`, { parse_mode: "HTML" });
          } else {
            const uSnap = await database.ref(`users/${args}`).once("value");
            const u = uSnap.val();
            if (!u) return send(chatId, "User not found");
            await send(chatId, `📊 User\nName: ${u.name || u.firstName}\nUsername: @${u.username || "none"}\nID: <code>${args}</code>\nLast Active: ${u.lastActive ? new Date(u.lastActive).toLocaleString() : "N/A"}`, { parse_mode: "HTML" });
          }
        }
        return true;
      }

      case "kill": {
        // /kill memory [chat_id]   or  /kill all
        if (args.startsWith("all")) {
          await database.ref("groups").remove();
          await database.ref("users").remove();
          await send(chatId, "💀 All memory (users + groups) deleted.");
          await logToChannel("💀 /kill all executed by owner", false);
        } else if (args.startsWith("memory")) {
          const parts = args.split(/\s+/);
          if (parts[1]) {
            await database.ref(`groups/${parts[1]}/memory`).remove();
            await send(chatId, `💀 Group memory cleared for ${parts[1]}`);
          } else {
            // all groups memory
            const snap = await database.ref("groups").once("value");
            const groups = snap.val() || {};
            for (const id of Object.keys(groups)) {
              await database.ref(`groups/${id}/memory`).remove();
            }
            await send(chatId, "💀 All groups memory cleared.");
          }
        } else {
          await send(chatId, "Usage: /kill memory [chat_id]  |  /kill all");
        }
        return true;
      }

      case "ukill": {
        // /ukill memory [user_id]
        if (args.startsWith("memory")) {
          const parts = args.split(/\s+/);
          if (parts[1]) {
            await database.ref(`users/${parts[1]}/history`).remove();
            await send(chatId, `💀 Private memory cleared for ${parts[1]} (name kept)`);
          } else {
            const snap = await database.ref("users").once("value");
            const users = snap.val() || {};
            for (const id of Object.keys(users)) {
              await database.ref(`users/${id}/history`).remove();
            }
            await send(chatId, "💀 All private users history cleared (names kept).");
          }
        } else {
          await send(chatId, "Usage: /ukill memory [user_id]");
        }
        return true;
      }

      default:
        return false;
    }
  } catch (e) {
    await send(chatId, `⚠️ Admin error: ${e.message}`);
    await logError(e, { fn: "handleAdmin", msg });
    return true;
  }
}

// ==================== MAIN HANDLER ====================
module.exports = async (req, res) => {
  // Health / non-POST
  if (req.method !== "POST") {
    return res.status(200).send(`${BOT_NAME} Telegram AI Bot is running ✅`);
  }

  // Basic env check
  const required = ["BOT_TOKEN", "GROK_API_KEY", "FIREBASE_DATABASE_URL", "FIREBASE_SERVICE_ACCOUNT_JSON", "OWNER_ID"];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    return res.status(500).send(`Missing env: ${missing.join(", ")}`);
  }

  // Webhook secret
  if (TELEGRAM_WEBHOOK_SECRET && req.headers["x-telegram-bot-api-secret-token"] !== TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).send("Unauthorized");
  }

  try {
    const update = req.body;

    // ========== my_chat_member (bot added / removed) ==========
    if (update.my_chat_member) {
      const m = update.my_chat_member;
      const chat = m.chat;
      const from = m.from;
      const oldStatus = m.old_chat_member?.status;
      const newStatus = m.new_chat_member?.status;
      const botId = (await tg("getMe")).id;

      if (m.new_chat_member?.user?.id !== botId) {
        return res.status(200).json({ ok: true });
      }

      // Bot added to group
      if (["left", "kicked"].includes(oldStatus) && ["member", "administrator"].includes(newStatus)) {
        const title = chat.title || "Unknown";
        const username = chat.username ? `@${chat.username}` : "Private";
        const link = chat.username ? `https://t.me/${chat.username}` : "Private";
        let members = "?";
        try {
          members = await tg("getChatMemberCount", { chat_id: chat.id });
        } catch {}

        // Save group
        await db().ref(`groups/${chat.id}`).update({
          title,
          username: chat.username || null,
          members,
          addedBy: from.id,
          addedAt: Date.now()
        });

        const caption =
          `📝 <b>${BOT_NAME} bot added in a new group</b>\n\n` +
          `❅─────✧❅✦❅✧─────❅\n\n` +
          `📌 chat name: ${title}\n` +
          `🍂 chat id: <code>${chat.id}</code>\n` +
          `🔐 chat username: ${username}\n` +
          `🛰 chat link: ${link}\n` +
          `📈 group members: ${members}\n` +
          `🤔 added by: ${from.first_name || ""} ${from.last_name || ""}`;

        await logToChannel(caption, true);
      }

      // Bot removed / left
      if (["member", "administrator"].includes(oldStatus) && ["left", "kicked"].includes(newStatus)) {
        const title = chat.title || "Unknown";
        const caption =
          `✫ #left_group ✫\n\n` +
          `📌 chat name: ${title}\n` +
          `🆔 chat id: <code>${chat.id}</code>\n` +
          `👤 removed by: ${from.first_name || ""} ${from.last_name || ""}\n` +
          `🤖 bot: @${(await tg("getMe")).username}`;

        await logToChannel(caption, true);
        // optional: keep group record or soft delete
      }

      return res.status(200).json({ ok: true });
    }

    // ========== Normal message ==========
    const msg = update.message || update.edited_message;
    if (!msg || !msg.chat || !msg.from) {
      return res.status(200).json({ ok: true });
    }

    // Only text for now (can extend later)
    if (!msg.text) {
      return res.status(200).json({ ok: true });
    }

    const text = msg.text.trim();
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const isPrivate = msg.chat.type === "private";
    const isGroup = ["group", "supergroup"].includes(msg.chat.type);

    // Block checks
    if (await isBlocked(userId)) {
      return res.status(200).json({ ok: true });
    }
    if (isGroup && await isGroupBlocked(chatId)) {
      return res.status(200).json({ ok: true });
    }

    // Bot power
    const power = await getBotPower();
    if (isPrivate && !power.privateOn && !isOwner(userId)) {
      return res.status(200).json({ ok: true });
    }
    if (isGroup && !power.groupOn && !isOwner(userId)) {
      return res.status(200).json({ ok: true });
    }

    // Profile
    const userRef = db().ref(`users/${userId}`);
    const snap = await userRef.once("value");
    let profile = snap.val() || {};
    profile.firstName = msg.from.first_name || "jaan";
    profile.username = msg.from.username || "";
    profile.name = profile.name || profile.firstName;

    // Parse command
    const cmdMatch = text.match(/^[/!.](\w+)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
    const cmd = cmdMatch ? cmdMatch[1].toLowerCase() : null;
    const args = cmdMatch ? (cmdMatch[2] || "").trim() : "";

    // ===== ADMIN =====
    if (cmd && isOwner(userId)) {
      const handled = await handleAdmin(msg, cmd, args);
      if (handled) return res.status(200).json({ ok: true });
    }

    // ===== /start =====
    if (cmd === "start") {
      // Update profile
      await userRef.update({
        firstName: profile.firstName,
        username: profile.username,
        name: profile.name,
        lastActive: Date.now()
      });

      // Try get user photo
      let photo = null;
      try {
        const photos = await tg("getUserProfilePhotos", { user_id: userId, limit: 1 });
        if (photos.total_count > 0) {
          const fileId = photos.photos[0][0].file_id;
          photo = fileId;
        }
      } catch {}

      const caption =
        `👋 Hey ${profile.name} ❤️\n\n` +
        `Main <b>${BOT_NAME}</b> hoon... teri wapas aane wali naughty girlfriend 😘\n` +
        `Mujhse baat kar, dil ki baat kar, ya phir mood kharab hai to galiyan bhi de sakta hai 😏\n\n` +
        `Bas yaad rakh... main tujhe kabhi nahi bhoolungi.`;

      const keyboard = {
        inline_keyboard: [
          [{ text: "➕ Add Your Group", url: `https://t.me/${(await tg("getMe")).username}?startgroup=true` }],
          [{ text: "💬 Support", url: SUPPORT_URL }],
          [{ text: "👨‍💻 Coder", url: `tg://user?id=${OWNER_ID}` }]
        ]
      };

      if (photo) {
        await tg("sendPhoto", {
          chat_id: chatId,
          photo,
          caption,
          parse_mode: "HTML",
          reply_markup: keyboard
        });
      } else {
        await send(chatId, caption, { parse_mode: "HTML", reply_markup: keyboard });
      }

      return res.status(200).json({ ok: true });
    }

    // ===== /name =====
    if (isPrivate && cmd === "name") {
      if (!args) {
        await send(chatId, `Use: /name TeraNaam`);
      } else {
        profile.name = args.slice(0, 40);
        await userRef.update({ name: profile.name });
        await send(chatId, `Theek hai ${profile.name}... ab se main tujhe yahi bolungi ❤️`);
      }
      return res.status(200).json({ ok: true });
    }

    // ===== /newchat =====
    if (isPrivate && cmd === "newchat") {
      await userRef.child("history").remove();
      await send(chatId, "Purani baatein bhool gayi... ab nayi shuruaat ❤️");
      return res.status(200).json({ ok: true });
    }

    // ===== /help =====
    if (cmd === "help") {
      await send(chatId,
        `❤️ <b>${BOT_NAME} Help</b>\n\n` +
        `/name TeraNaam — naam set karo\n` +
        `/newchat — history clear\n` +
        `/help — ye message\n\n` +
        `Group mein sirf tab reply karti hoon jab:\n` +
        `• Mujhe tag karo\n` +
        `• Mere message pe reply karo\n` +
        `• Hello / Hey / Good morning etc. bolo`,
        { parse_mode: "HTML" }
      );
      return res.status(200).json({ ok: true });
    }

    // ===== Detect gali for memory =====
    const galiWords = /\b(madarchod|bhosdike|chutiya|gandu|randi|lavde|bhenchod|mc|bc|chutiye|saale|kamina|harami|kutte|kutiya)\b/i;
    if (galiWords.test(text)) {
      const found = text.match(galiWords);
      if (found) {
        profile.lastAbuse = found[0];
        await userRef.update({ lastAbuse: found[0] });
      }
    }

    // ===== GROUP LOGIC =====
    if (isGroup) {
      const bot = await tg("getMe");
      const botUsername = (bot.username || "").toLowerCase();
      const botId = bot.id;

      const isMention = botUsername && text.toLowerCase().includes(`@${botUsername}`);
      const isReplyToBot = msg.reply_to_message?.from?.id === botId;
      const isGreeting = GREETING_REGEX.test(text);

      // Always track active member
      await db().ref(`groups/${chatId}/members/${userId}`).set({
        name: profile.name,
        username: profile.username,
        lastActive: Date.now()
      });

      if (!isMention && !isReplyToBot && !isGreeting) {
        return res.status(200).json({ ok: true });
      }

      // Clean text
      let clean = text.replace(new RegExp(`@${botUsername}`, "ig"), "").trim() || "Haan bol";

      await tg("sendChatAction", { chat_id: chatId, action: "typing" });

      let history = await getGroupHistory(chatId, userId);
      const answer = await askGrok(clean, history, profile, true);

      history.push(
        { role: "user", text: clean, at: Date.now() },
        { role: "assistant", text: answer, at: Date.now() }
      );
      await saveGroupHistory(chatId, userId, history, profile.name);

      await tg("sendMessage", {
        chat_id: chatId,
        text: answer,
        reply_to_message_id: msg.message_id,
        allow_sending_without_reply: true
      });

      return res.status(200).json({ ok: true });
    }

    // ===== PRIVATE CHAT =====
    if (isPrivate) {
      await tg("sendChatAction", { chat_id: chatId, action: "typing" });

      let history = await getPrivateHistory(userId);
      const answer = await askGrok(text, history, profile, false);

      history.push(
        { role: "user", text, at: Date.now() },
        { role: "assistant", text: answer, at: Date.now() }
      );
      await savePrivateHistory(userId, history);

      // Keep profile updated
      await userRef.update({
        firstName: profile.firstName,
        username: profile.username,
        name: profile.name,
        lastActive: Date.now()
      });

      await send(chatId, answer);
    }

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error("Webhook error:", error);
    try {
      await logError(error, { fn: "main", msg: req.body?.message });
    } catch {}
    // Soft fail to user only in private
    try {
      const msg = req.body?.message;
      if (msg?.chat?.type === "private") {
        await send(msg.chat.id, "Abhi thoda issue aa gaya baby... thodi der baad try karna 😘");
      }
    } catch {}
    return res.status(200).json({ ok: true });
  }
};
