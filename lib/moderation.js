/**
 * Rose-like group moderation commands
 * Works when bot is admin. Group admins / owner can use.
 */
const { config } = require("./config");
const { db } = require("./firebase");
const { tg, send } = require("./telegram");

async function isGroupAdmin(chatId, userId) {
  if (String(userId) === String(config.ownerId)) return true;
  try {
    const m = await tg("getChatMember", { chat_id: chatId, user_id: userId });
    return ["creator", "administrator"].includes(m.status);
  } catch {
    return false;
  }
}

function targetFromMsg(msg, args) {
  // reply → that user
  if (msg.reply_to_message?.from) {
    return {
      id: msg.reply_to_message.from.id,
      name: msg.reply_to_message.from.first_name || "User"
    };
  }
  // mention entities
  if (msg.entities) {
    for (const e of msg.entities) {
      if (e.type === "text_mention" && e.user) {
        return { id: e.user.id, name: e.user.first_name || "User" };
      }
    }
  }
  // /cmd 123456
  const parts = (args || "").trim().split(/\s+/);
  if (parts[0] && /^\d+$/.test(parts[0])) {
    return { id: Number(parts[0]), name: parts[0] };
  }
  return null;
}

function parseTime(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^(\d+)([smhdw])$/i);
  if (!m) return null;
  const n = Number(m[1]);
  const u = m[2].toLowerCase();
  const mult = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  return Math.floor(Date.now() / 1000) + n * (mult[u] || 60);
}

async function handleModeration(msg, cmd, args) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const isGroup = ["group", "supergroup"].includes(msg.chat.type);
  if (!isGroup) return false;

  const modCmds = new Set([
    "ban", "tban", "unban", "kick", "mute", "tmute", "unmute",
    "warn", "unwarn", "warns", "resetwarns",
    "promote", "demote", "adminlist",
    "pin", "unpin", "del", "purge",
    "id", "info",
    "setwelcome", "welcome", "resetwelcome",
    "setrules", "rules", "resetrules",
    "lock", "unlock", "locks", "locktypes",
    "filter", "filters", "stop",
    "notes", "save", "get", "clear",
    "report", "admins"
  ]);

  if (!modCmds.has(cmd)) return false;

  // Public-ish
  if (["id", "info", "rules", "adminlist", "admins", "locks", "locktypes", "filters", "notes", "get", "warns", "report"].includes(cmd)) {
    // ok for all
  } else {
    if (!(await isGroupAdmin(chatId, userId))) {
      await send(chatId, "⛔ Sirf group admin use kar sakta hai.");
      return true;
    }
  }

  const database = db();
  const gRef = database.ref("groups/" + chatId + "/mod");

  try {
    // ===== ID / INFO =====
    if (cmd === "id") {
      const t = targetFromMsg(msg, args);
      if (t) await send(chatId, `👤 User ID: <code>${t.id}</code>\n💬 Chat ID: <code>${chatId}</code>`, { parse_mode: "HTML" });
      else await send(chatId, `💬 Chat ID: <code>${chatId}</code>\n👤 Your ID: <code>${userId}</code>`, { parse_mode: "HTML" });
      return true;
    }

    if (cmd === "info") {
      const t = targetFromMsg(msg, args) || { id: userId, name: msg.from.first_name };
      let member;
      try { member = await tg("getChatMember", { chat_id: chatId, user_id: t.id }); } catch {}
      const warns = (await gRef.child("warns/" + t.id).once("value")).val() || 0;
      await send(chatId,
        `ℹ️ <b>Info</b>\nName: ${t.name}\nID: <code>${t.id}</code>\nStatus: ${member?.status || "?"}\nWarns: ${warns}`,
        { parse_mode: "HTML" }
      );
      return true;
    }

    // ===== BAN / KICK / MUTE =====
    if (cmd === "ban" || cmd === "tban") {
      const t = targetFromMsg(msg, args);
      if (!t) { await send(chatId, "Reply karo ya user id do.\n/ban | /tban 1h"); return true; }
      const until = cmd === "tban" ? parseTime(args.split(/\s+/).pop()) : 0;
      await tg("banChatMember", {
        chat_id: chatId,
        user_id: t.id,
        until_date: until || undefined
      });
      await send(chatId, `🚫 ${t.name} banned.` + (until ? " (temporary)" : ""));
      return true;
    }

    if (cmd === "unban") {
      const t = targetFromMsg(msg, args);
      if (!t) { await send(chatId, "Reply / user id: /unban"); return true; }
      await tg("unbanChatMember", { chat_id: chatId, user_id: t.id, only_if_banned: true });
      await send(chatId, `✅ ${t.name} unbanned.`);
      return true;
    }

    if (cmd === "kick") {
      const t = targetFromMsg(msg, args);
      if (!t) { await send(chatId, "Reply / user id: /kick"); return true; }
      await tg("banChatMember", { chat_id: chatId, user_id: t.id });
      await tg("unbanChatMember", { chat_id: chatId, user_id: t.id });
      await send(chatId, `👢 ${t.name} kicked.`);
      return true;
    }

    if (cmd === "mute" || cmd === "tmute") {
      const t = targetFromMsg(msg, args);
      if (!t) { await send(chatId, "Reply / user id: /mute | /tmute 10m"); return true; }
      const until = cmd === "tmute" ? parseTime(args.split(/\s+/).pop()) : Math.floor(Date.now() / 1000) + 31622400;
      await tg("restrictChatMember", {
        chat_id: chatId,
        user_id: t.id,
        permissions: {
          can_send_messages: false,
          can_send_media_messages: false,
          can_send_other_messages: false,
          can_add_web_page_previews: false
        },
        until_date: until
      });
      await send(chatId, `🔇 ${t.name} muted.` + (cmd === "tmute" ? " (temporary)" : ""));
      return true;
    }

    if (cmd === "unmute") {
      const t = targetFromMsg(msg, args);
      if (!t) { await send(chatId, "Reply / user id: /unmute"); return true; }
      await tg("restrictChatMember", {
        chat_id: chatId,
        user_id: t.id,
        permissions: {
          can_send_messages: true,
          can_send_media_messages: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true
        }
      });
      await send(chatId, `🔊 ${t.name} unmuted.`);
      return true;
    }

    // ===== WARNS =====
    if (cmd === "warn") {
      const t = targetFromMsg(msg, args);
      if (!t) { await send(chatId, "Reply / user id: /warn"); return true; }
      const snap = await gRef.child("warns/" + t.id).once("value");
      const count = (snap.val() || 0) + 1;
      await gRef.child("warns/" + t.id).set(count);
      const max = (await gRef.child("warnLimit").once("value")).val() || 3;
      await send(chatId, `⚠️ ${t.name} warned (${count}/${max})`);
      if (count >= max) {
        try {
          await tg("banChatMember", { chat_id: chatId, user_id: t.id });
          await gRef.child("warns/" + t.id).set(0);
          await send(chatId, `🚫 ${t.name} banned (warn limit).`);
        } catch {}
      }
      return true;
    }

    if (cmd === "unwarn" || cmd === "resetwarns") {
      const t = targetFromMsg(msg, args);
      if (!t) { await send(chatId, "Reply / user id"); return true; }
      if (cmd === "resetwarns") await gRef.child("warns/" + t.id).set(0);
      else {
        const c = (await gRef.child("warns/" + t.id).once("value")).val() || 0;
        await gRef.child("warns/" + t.id).set(Math.max(0, c - 1));
      }
      await send(chatId, `✅ Warn updated for ${t.name}`);
      return true;
    }

    if (cmd === "warns") {
      const t = targetFromMsg(msg, args) || { id: userId, name: msg.from.first_name };
      const c = (await gRef.child("warns/" + t.id).once("value")).val() || 0;
      await send(chatId, `⚠️ ${t.name}: ${c} warns`);
      return true;
    }

    // ===== PROMOTE / DEMOTE =====
    if (cmd === "promote") {
      const t = targetFromMsg(msg, args);
      if (!t) { await send(chatId, "Reply / user id: /promote"); return true; }
      await tg("promoteChatMember", {
        chat_id: chatId,
        user_id: t.id,
        can_manage_chat: true,
        can_delete_messages: true,
        can_restrict_members: true,
        can_pin_messages: true,
        can_manage_video_chats: true
      });
      await send(chatId, `⬆️ ${t.name} promoted.`);
      return true;
    }

    if (cmd === "demote") {
      const t = targetFromMsg(msg, args);
      if (!t) { await send(chatId, "Reply / user id: /demote"); return true; }
      await tg("promoteChatMember", {
        chat_id: chatId,
        user_id: t.id,
        can_manage_chat: false,
        can_delete_messages: false,
        can_restrict_members: false,
        can_promote_members: false,
        can_change_info: false,
        can_invite_users: false,
        can_pin_messages: false
      });
      await send(chatId, `⬇️ ${t.name} demoted.`);
      return true;
    }

    if (cmd === "adminlist" || cmd === "admins") {
      const admins = await tg("getChatAdministrators", { chat_id: chatId });
      const list = admins.map((a) => {
        const u = a.user;
        return `• ${u.first_name || ""} ${u.last_name || ""}` + (u.username ? ` @${u.username}` : "") + ` — ${a.status}`;
      }).join("\n");
      await send(chatId, `👮 <b>Admins</b>\n\n${list}`, { parse_mode: "HTML" });
      return true;
    }

    // ===== PIN / DEL / PURGE =====
    if (cmd === "pin") {
      if (!msg.reply_to_message) { await send(chatId, "Message pe reply karke /pin"); return true; }
      await tg("pinChatMessage", { chat_id: chatId, message_id: msg.reply_to_message.message_id });
      await send(chatId, "📌 Pinned.");
      return true;
    }

    if (cmd === "unpin") {
      await tg("unpinChatMessage", { chat_id: chatId });
      await send(chatId, "📍 Unpinned.");
      return true;
    }

    if (cmd === "del") {
      if (!msg.reply_to_message) { await send(chatId, "Reply karke /del"); return true; }
      try { await tg("deleteMessage", { chat_id: chatId, message_id: msg.reply_to_message.message_id }); } catch {}
      try { await tg("deleteMessage", { chat_id: chatId, message_id: msg.message_id }); } catch {}
      return true;
    }

    if (cmd === "purge") {
      if (!msg.reply_to_message) { await send(chatId, "Jis message tak delete karna hai uspe reply + /purge"); return true; }
      const fromId = msg.reply_to_message.message_id;
      const toId = msg.message_id;
      let deleted = 0;
      for (let id = fromId; id <= toId; id++) {
        try {
          await tg("deleteMessage", { chat_id: chatId, message_id: id });
          deleted++;
        } catch {}
      }
      const info = await send(chatId, `🗑 Purged ~${deleted} messages`);
      setTimeout(async () => {
        try { await tg("deleteMessage", { chat_id: chatId, message_id: info.message_id }); } catch {}
      }, 3000);
      return true;
    }

    // ===== WELCOME =====
    if (cmd === "setwelcome") {
      const text = (args || "").trim();
      if (!text) { await send(chatId, "Usage: /setwelcome Welcome {first} to {chatname}"); return true; }
      await gRef.child("welcome").set({ on: true, text });
      await send(chatId, "✅ Welcome set.\nUse {first} {chatname}");
      return true;
    }

    if (cmd === "welcome") {
      const arg = (args || "").toLowerCase();
      const cur = (await gRef.child("welcome").once("value")).val() || {};
      if (arg === "on") { await gRef.child("welcome/on").set(true); await send(chatId, "✅ Welcome ON"); }
      else if (arg === "off") { await gRef.child("welcome/on").set(false); await send(chatId, "🛑 Welcome OFF"); }
      else await send(chatId, `Welcome: ${cur.on ? "ON" : "OFF"}\n${cur.text || "(default)"}`);
      return true;
    }

    if (cmd === "resetwelcome") {
      await gRef.child("welcome").remove();
      await send(chatId, "✅ Welcome reset");
      return true;
    }

    // ===== RULES =====
    if (cmd === "setrules") {
      const text = (args || "").trim();
      if (!text) { await send(chatId, "Usage: /setrules rules text..."); return true; }
      await gRef.child("rules").set(text);
      await send(chatId, "✅ Rules saved");
      return true;
    }

    if (cmd === "rules") {
      const rules = (await gRef.child("rules").once("value")).val();
      await send(chatId, rules ? `📜 <b>Rules</b>\n\n${rules}` : "No rules set.", { parse_mode: "HTML" });
      return true;
    }

    if (cmd === "resetrules") {
      await gRef.child("rules").remove();
      await send(chatId, "✅ Rules cleared");
      return true;
    }

    // ===== LOCKS (simple flags) =====
    if (cmd === "locktypes") {
      await send(chatId, "Lock types:\nall, media, photos, videos, stickers, gifs, links, forwards, games, voice");
      return true;
    }

    if (cmd === "lock") {
      const type = (args || "").trim().toLowerCase();
      if (!type) { await send(chatId, "Usage: /lock media|links|stickers|..."); return true; }
      await gRef.child("locks/" + type).set(true);
      await send(chatId, `🔒 Locked: ${type}`);
      return true;
    }

    if (cmd === "unlock") {
      const type = (args || "").trim().toLowerCase();
      if (!type) { await send(chatId, "Usage: /unlock media|links|..."); return true; }
      await gRef.child("locks/" + type).remove();
      await send(chatId, `🔓 Unlocked: ${type}`);
      return true;
    }

    if (cmd === "locks") {
      const locks = (await gRef.child("locks").once("value")).val() || {};
      const list = Object.keys(locks).filter((k) => locks[k]);
      await send(chatId, list.length ? "🔒 " + list.join(", ") : "No locks.");
      return true;
    }

    // ===== FILTERS =====
    if (cmd === "filter") {
      // /filter keyword reply text
      const sp = (args || "").indexOf(" ");
      if (sp < 1) { await send(chatId, "Usage: /filter hello Hi there!"); return true; }
      const key = args.slice(0, sp).toLowerCase();
      const val = args.slice(sp + 1);
      await gRef.child("filters/" + encodeURIComponent(key)).set(val);
      await send(chatId, `✅ Filter saved: ${key}`);
      return true;
    }

    if (cmd === "stop") {
      const key = (args || "").trim().toLowerCase();
      if (!key) { await send(chatId, "Usage: /stop keyword"); return true; }
      await gRef.child("filters/" + encodeURIComponent(key)).remove();
      await send(chatId, `✅ Filter removed: ${key}`);
      return true;
    }

    if (cmd === "filters") {
      const filters = (await gRef.child("filters").once("value")).val() || {};
      const keys = Object.keys(filters).map((k) => decodeURIComponent(k));
      await send(chatId, keys.length ? "Filters:\n• " + keys.join("\n• ") : "No filters.");
      return true;
    }

    // ===== NOTES =====
    if (cmd === "save") {
      const sp = (args || "").indexOf(" ");
      if (sp < 1) { await send(chatId, "Usage: /save notename content"); return true; }
      const key = args.slice(0, sp).toLowerCase();
      const val = args.slice(sp + 1);
      await gRef.child("notes/" + encodeURIComponent(key)).set(val);
      await send(chatId, `✅ Note saved: #${key}`);
      return true;
    }

    if (cmd === "get") {
      const key = (args || "").trim().toLowerCase();
      if (!key) { await send(chatId, "Usage: /get notename"); return true; }
      const val = (await gRef.child("notes/" + encodeURIComponent(key)).once("value")).val();
      await send(chatId, val || "Note not found.");
      return true;
    }

    if (cmd === "clear") {
      const key = (args || "").trim().toLowerCase();
      if (!key) { await send(chatId, "Usage: /clear notename"); return true; }
      await gRef.child("notes/" + encodeURIComponent(key)).remove();
      await send(chatId, `✅ Note cleared: ${key}`);
      return true;
    }

    if (cmd === "notes") {
      const notes = (await gRef.child("notes").once("value")).val() || {};
      const keys = Object.keys(notes).map((k) => "#" + decodeURIComponent(k));
      await send(chatId, keys.length ? "Notes:\n" + keys.join("\n") : "No notes.");
      return true;
    }

    if (cmd === "report") {
      if (!msg.reply_to_message) { await send(chatId, "Report karne ke liye message pe reply + /report"); return true; }
      const admins = await tg("getChatAdministrators", { chat_id: chatId });
      const mentions = admins
        .filter((a) => !a.user.is_bot)
        .map((a) => a.user.username ? "@" + a.user.username : a.user.first_name)
        .slice(0, 10)
        .join(" ");
      await send(chatId, `🚨 Reported to admins\n${mentions || "admins"}`);
      return true;
    }

    return false;
  } catch (e) {
    await send(chatId, "⚠️ " + (e.message || "Moderation error"));
    return true;
  }
}

/** Auto: welcome new members + filter triggers */
async function onGroupMessageExtras(msg) {
  const chatId = msg.chat.id;
  if (!["group", "supergroup"].includes(msg.chat.type)) return;

  const database = db();
  const gRef = database.ref("groups/" + chatId + "/mod");

  // New members welcome
  if (msg.new_chat_members && msg.new_chat_members.length) {
    const wel = (await gRef.child("welcome").once("value")).val();
    if (wel && wel.on !== false) {
      for (const u of msg.new_chat_members) {
        if (u.is_bot) continue;
        let text = wel.text || "Welcome {first} to {chatname}!";
        text = text
          .replace(/\{first\}/gi, u.first_name || "User")
          .replace(/\{chatname\}/gi, msg.chat.title || "group");
        try { await send(chatId, text); } catch {}
      }
    }
  }

  // Filters
  if (msg.text) {
    const filters = (await gRef.child("filters").once("value")).val() || {};
    const lower = msg.text.toLowerCase();
    for (const [enc, reply] of Object.entries(filters)) {
      const key = decodeURIComponent(enc).toLowerCase();
      if (key && lower.includes(key)) {
        try { await send(chatId, reply); } catch {}
        break;
      }
    }
  }
}

function moderationHelpText() {
  return `🛡 <b>Group Moderation (Rose-style)</b>

<b>Punish</b>
/ban /tban 1h /unban
/kick
/mute /tmute 10m /unmute
/warn /unwarn /warns /resetwarns

<b>Admin</b>
/promote /demote /adminlist

<b>Messages</b>
/pin /unpin /del /purge

<b>Welcome & Rules</b>
/setwelcome text — {first} {chatname}
/welcome on|off
/setrules text
/rules

<b>Locks</b>
/lock media|links|stickers|...
/unlock ...
/locks /locktypes

<b>Filters & Notes</b>
/filter keyword reply
/stop keyword
/filters
/save name content
/get name
/notes /clear name

<b>Info</b>
/id /info /report

Bot ko group mein <b>Admin</b> banao (Delete, Ban, Pin, Invite).`;
}

module.exports = { handleModeration, onGroupMessageExtras, moderationHelpText, isGroupAdmin };
