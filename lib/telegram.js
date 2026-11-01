const { config } = require("./config");

const TG = `https://api.telegram.org/bot${config.botToken}`;

async function tg(method, body = {}) {
  const res = await fetch(`${TG}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.description || method + " failed");
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
    extra = {};
  }
  if (text) await tg("sendMessage", { chat_id: chatId, text, ...extra });
}

async function sendPhoto(chatId, photo, caption = "", extra = {}) {
  return tg("sendPhoto", {
    chat_id: chatId,
    photo,
    caption: String(caption).slice(0, 1024),
    parse_mode: "HTML",
    ...extra
  });
}

function randomLoggerPhoto() {
  return config.loggerPhotos[Math.floor(Math.random() * config.loggerPhotos.length)];
}

async function logToChannel(text, withPhoto = true) {
  if (!config.loggerId) return;
  try {
    if (withPhoto) await sendPhoto(config.loggerId, randomLoggerPhoto(), text);
    else await send(config.loggerId, text, { parse_mode: "HTML" });
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
    `🤖 Bot: ${config.botName}`
  ];
  await logToChannel(lines.join("\n"), true);
}

module.exports = { tg, send, sendPhoto, logToChannel, logError };
