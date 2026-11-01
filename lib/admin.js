const { config } = require("./config");
const { db } = require("./firebase");
const { tg, send, logToChannel } = require("./telegram");

function isOwner(userId) {
  return String(userId) === String(config.ownerId);
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
    if (cmd === "admin") {
      await send(chatId, `🛠 <b>${config.botName} Admin Panel</b>

👥 /user  /group
📢 /broadcast  /ubroadcast
🚫 /block  /unblock  /gblock  /gunblock
⏻ /bot on|off  /gbot on|off
📊 /stats
🧠 /kill memory  /ukill memory  /kill all
• /admin`, { parse_mode: "HTML" });
      return true;
    }

    if (cmd === "user") {
      const users = (await database.ref("users").once("value")).val() || {};
      const list = Object.entries(users).slice(0, 50).map(([id, u]) =>
        `• ${u.name || u.firstName || "User"} | @${u.username || "none"} | <code>${id}</code>`
      ).join("\n");
      await send(chatId, `👥 Users (${Object.keys(users).length})\n\n${list || "Empty"}`, { parse_mode: "HTML" });
      return true;
    }

    if (cmd === "group") {
      const groups = (await database.ref("groups").once("value")).val() || {};
      const list = Object.entries(groups).slice(0, 50).map(([id, g]) =>
        `• ${g.title || "Group"} | <code>${id}</code>`
      ).join("\n");
      await send(chatId, `👥 Groups (${Object.keys(groups).length})\n\n${list || "Empty"}`, { parse_mode: "HTML" });
      return true;
    }

    if (cmd === "broadcast" || cmd === "ubroadcast") {
      if (!args && !msg.reply_to_message) {
        await send(chatId, "Usage: /" + cmd + " msg | /" + cmd + " id msg");
        return true;
      }
      let target = null, textMsg = args;
      const parts = args.split(/\s+/);
      if (parts[0] && /^-?\d+$/.test(parts[0])) {
        target = parts[0];
        textMsg = parts.slice(1).join(" ");
      }
      const ref = cmd === "broadcast" ? "groups" : "users";

      if (target) {
        if (msg.reply_to_message) {
          await tg("copyMessage", { chat_id: target, from_chat_id: chatId, message_id: msg.reply_to_message.message_id });
        } else await send(target, textMsg);
        await send(chatId, "✅ Sent to " + target);
      } else {
        const all = (await database.ref(ref).once("value")).val() || {};
        let ok = 0, fail = 0;
        for (const id of Object.keys(all)) {
          try {
            if (msg.reply_to_message) {
              await tg("copyMessage", { chat_id: id, from_chat_id: chatId, message_id: msg.reply_to_message.message_id });
            } else await send(id, textMsg);
            ok++;
          } catch { fail++; }
        }
        await send(chatId, `✅ Done\nSuccess: ${ok}\nFailed: ${fail}`);
      }
      return true;
    }

    if (cmd === "block") {
      const uid = args.trim();
      if (!uid) return send(chatId, "Usage: /block user_id");
      await database.ref("blocked/users/" + uid).set({ by: userId, at: Date.now() });
      await send(chatId, "🚫 Blocked <code>" + uid + "</code>", { parse_mode: "HTML" });
      const u = (await database.ref("users/" + uid).once("value")).val() || {};
      const me = await tg("getMe");
      await logToChannel(`🚫 <b>Block The Bot</b>\n\n• Name: ${u.name || u.firstName || "?"}\n• Username: @${u.username || "none"}\n• User ID: <code>${uid}</code>\n• Bot: @${me.username}`, true);
      return true;
    }

    if (cmd === "unblock") {
      const uid = args.trim();
      if (!uid) return send(chatId, "Usage: /unblock user_id");
      await database.ref("blocked/users/" + uid).remove();
      await send(chatId, "✅ Unblocked", { parse_mode: "HTML" });
      return true;
    }

    if (cmd === "gblock") {
      const gid = args.split(/\s+/)[0];
      if (!gid) return send(chatId, "Usage: /gblock group_id");
      await database.ref("blocked/groups/" + gid).set({ by: userId, at: Date.now() });
      await send(chatId, "🚫 Group blocked", { parse_mode: "HTML" });
      return true;
    }

    if (cmd === "gunblock") {
      const gid = args.trim();
      if (!gid) return send(chatId, "Usage: /gunblock group_id");
      await database.ref("blocked/groups/" + gid).remove();
      await send(chatId, "✅ Group unblocked");
      return true;
    }

    if (cmd === "bot") {
      const s = args.trim().toLowerCase();
      if (s === "on") { await database.ref("settings/privateOn").set(true); await send(chatId, "✅ Private ON"); }
      else if (s === "off") { await database.ref("settings/privateOn").set(false); await send(chatId, "🛑 Private OFF"); }
      else await send(chatId, "Usage: /bot on|off");
      return true;
    }

    if (cmd === "gbot") {
      const s = args.trim().toLowerCase();
      if (s === "on") { await database.ref("settings/groupOn").set(true); await send(chatId, "✅ Group ON"); }
      else if (s === "off") { await database.ref("settings/groupOn").set(false); await send(chatId, "🛑 Group OFF"); }
      else await send(chatId, "Usage: /gbot on|off");
      return true;
    }

    if (cmd === "stats") {
      const u = Object.keys((await database.ref("users").once("value")).val() || {}).length;
      const g = Object.keys((await database.ref("groups").once("value")).val() || {}).length;
      await send(chatId, `📊 Users: ${u}\nGroups: ${g}`);
      return true;
    }

    if (cmd === "kill") {
      if (args.startsWith("all")) {
        await database.ref("groups").remove();
        await database.ref("users").remove();
        await send(chatId, "💀 All memory deleted");
      } else if (args.startsWith("memory")) {
        const parts = args.split(/\s+/);
        if (parts[1]) await database.ref("groups/" + parts[1] + "/memory").remove();
        else {
          const groups = (await database.ref("groups").once("value")).val() || {};
          for (const id of Object.keys(groups)) await database.ref("groups/" + id + "/memory").remove();
        }
        await send(chatId, "💀 Memory cleared");
      } else await send(chatId, "Usage: /kill memory [id] | /kill all");
      return true;
    }

    if (cmd === "ukill") {
      if (args.startsWith("memory")) {
        const parts = args.split(/\s+/);
        if (parts[1]) await database.ref("users/" + parts[1] + "/history").remove();
        else {
          const users = (await database.ref("users").once("value")).val() || {};
          for (const id of Object.keys(users)) await database.ref("users/" + id + "/history").remove();
        }
        await send(chatId, "💀 Private history cleared");
      } else await send(chatId, "Usage: /ukill memory [user_id]");
      return true;
    }

    return false;
  } catch (e) {
    await send(chatId, "⚠️ " + e.message);
    return true;
  }
}

module.exports = { isOwner, handleAdmin };
