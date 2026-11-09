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
  const parts = (args || "").trim().split(/\s+/).filter(Boolean);

  try {
    // ===== HELP / ADMIN =====
    if (cmd === "admin" || cmd === "panel") {
      await send(chatId, `🛠 <b>${config.botName} Admin</b>

📢 <b>Broadcast</b>
/broadcast msg
/broadcast group_id msg
/ubroadcast msg
/ubroadcast user_id msg

🚫 <b>Block</b>
/block group_id
/block user_id
/unblock user_id
/gunblock group_id

⏻ <b>Power</b>
/bot on|off
/bot on|off group_id
/ubot on|off
/ubot on|off user_id
/gbot on|off

👥 /user  /group  /stats
🧠 /kill memory  /ukill memory  /kill all
📋 /helpcommands`, { parse_mode: "HTML" });
      return true;
    }

    if (cmd === "helpcommands" || cmd === "commands") {
      await send(chatId, helpCommandsText(), { parse_mode: "HTML" });
      return true;
    }

    // ===== LISTS =====
    if (cmd === "user") {
      const users = (await database.ref("users").once("value")).val() || {};
      const list = Object.entries(users).slice(0, 40).map(([id, u]) =>
        `• ${u.name || u.firstName || "User"} | @${u.username || "none"} | <code>${id}</code>`
      ).join("\n");
      await send(chatId, `👥 Users (${Object.keys(users).length})\n\n${list || "Empty"}`, { parse_mode: "HTML" });
      return true;
    }

    if (cmd === "group") {
      const groups = (await database.ref("groups").once("value")).val() || {};
      const list = Object.entries(groups).slice(0, 40).map(([id, g]) =>
        `• ${g.title || "Group"} | <code>${id}</code>`
      ).join("\n");
      await send(chatId, `👥 Groups (${Object.keys(groups).length})\n\n${list || "Empty"}`, { parse_mode: "HTML" });
      return true;
    }

    // ===== BROADCAST =====
    if (cmd === "broadcast") {
      // /broadcast msg  OR  /broadcast -100xxx msg
      let target = null;
      let textMsg = args;
      if (parts[0] && /^-?\d+$/.test(parts[0])) {
        target = parts[0];
        textMsg = parts.slice(1).join(" ");
      }
      if (!textMsg && !msg.reply_to_message) {
        await send(chatId, "Usage:\n/broadcast message\n/broadcast group_id message");
        return true;
      }

      if (target) {
        if (msg.reply_to_message) {
          await tg("copyMessage", { chat_id: target, from_chat_id: chatId, message_id: msg.reply_to_message.message_id });
        } else await send(target, textMsg);
        await send(chatId, "✅ Sent to group " + target);
        await logToChannel("📢 Broadcast → <code>" + target + "</code>", false);
      } else {
        const groups = (await database.ref("groups").once("value")).val() || {};
        let ok = 0, fail = 0;
        for (const id of Object.keys(groups)) {
          try {
            if (msg.reply_to_message) {
              await tg("copyMessage", { chat_id: id, from_chat_id: chatId, message_id: msg.reply_to_message.message_id });
            } else await send(id, textMsg);
            ok++;
          } catch { fail++; }
        }
        await send(chatId, `✅ Group broadcast\nSuccess: ${ok}\nFailed: ${fail}`);
        await logToChannel(`📢 Group broadcast S:${ok} F:${fail}`, false);
      }
      return true;
    }

    if (cmd === "ubroadcast") {
      let target = null;
      let textMsg = args;
      if (parts[0] && /^\d+$/.test(parts[0])) {
        target = parts[0];
        textMsg = parts.slice(1).join(" ");
      }
      if (!textMsg && !msg.reply_to_message) {
        await send(chatId, "Usage:\n/ubroadcast message\n/ubroadcast user_id message");
        return true;
      }
      if (target) {
        if (msg.reply_to_message) {
          await tg("copyMessage", { chat_id: target, from_chat_id: chatId, message_id: msg.reply_to_message.message_id });
        } else await send(target, textMsg);
        await send(chatId, "✅ Sent to user " + target);
      } else {
        const users = (await database.ref("users").once("value")).val() || {};
        let ok = 0, fail = 0;
        for (const id of Object.keys(users)) {
          try {
            if (msg.reply_to_message) {
              await tg("copyMessage", { chat_id: id, from_chat_id: chatId, message_id: msg.reply_to_message.message_id });
            } else await send(id, textMsg);
            ok++;
          } catch { fail++; }
        }
        await send(chatId, `✅ User broadcast\nSuccess: ${ok}\nFailed: ${fail}`);
        await logToChannel(`📢 User broadcast S:${ok} F:${fail}`, false);
      }
      return true;
    }

    // ===== BOT POWER =====
    // /bot on|off  OR  /bot on|off group_id
    if (cmd === "bot") {
      const state = (parts[0] || "").toLowerCase();
      const gid = parts[1];
      if (state !== "on" && state !== "off") {
        await send(chatId, "Usage: /bot on|off\n/bot on|off group_id");
        return true;
      }
      if (gid) {
        await database.ref("settings/groupsOff/" + gid).set(state === "off");
        await send(chatId, (state === "off" ? "🛑" : "✅") + " Group " + gid + " bot " + state.toUpperCase());
      } else {
        await database.ref("settings/groupOn").set(state === "on");
        await send(chatId, (state === "on" ? "✅" : "🛑") + " All groups bot " + state.toUpperCase());
      }
      return true;
    }

    // /ubot on|off  OR  /ubot on|off user_id
    if (cmd === "ubot") {
      const state = (parts[0] || "").toLowerCase();
      const uid = parts[1];
      if (state !== "on" && state !== "off") {
        await send(chatId, "Usage: /ubot on|off\n/ubot on|off user_id");
        return true;
      }
      if (uid) {
        await database.ref("settings/privateUsersOff/" + uid).set(state === "off");
        await send(chatId, (state === "off" ? "🛑" : "✅") + " User " + uid + " private bot " + state.toUpperCase());
      } else {
        await database.ref("settings/privateOn").set(state === "on");
        await send(chatId, (state === "on" ? "✅" : "🛑") + " All private bot " + state.toUpperCase());
      }
      return true;
    }

    if (cmd === "gbot") {
      const state = (parts[0] || "").toLowerCase();
      if (state === "on") { await database.ref("settings/groupOn").set(true); await send(chatId, "✅ Groups ON"); }
      else if (state === "off") { await database.ref("settings/groupOn").set(false); await send(chatId, "🛑 Groups OFF"); }
      else await send(chatId, "Usage: /gbot on|off");
      return true;
    }

    // ===== BLOCK =====
    // /block group_id  OR  /block user_id
    if (cmd === "block") {
      const id = parts[0];
      if (!id) {
        await send(chatId, "Usage:\n/block group_id\n/block user_id");
        return true;
      }

      // Group ids are negative
      if (id.startsWith("-")) {
        await database.ref("blocked/groups/" + id).set({ by: userId, at: Date.now() });
        // Insult + leave
        try {
          await send(id, "@admin\n\nAre bhosari ke group members aur group ke admin aur owner... main chali. Tum log gand marao.");
        } catch (e) {}
        try {
          await tg("leaveChat", { chat_id: id });
        } catch (e) {}
        await send(chatId, "🚫 Group blocked + left: " + id);
        await logToChannel("🚫 Group blocked & left <code>" + id + "</code>", true);
      } else {
        await database.ref("blocked/users/" + id).set({ by: userId, at: Date.now() });
        await send(chatId, "🚫 User blocked: <code>" + id + "</code>", { parse_mode: "HTML" });
        const u = (await database.ref("users/" + id).once("value")).val() || {};
        const me = await tg("getMe");
        await logToChannel(
          `🚫 <b>Block The Bot</b>\n\n• Name: ${u.name || u.firstName || "?"}\n• Username: @${u.username || "none"}\n• User ID: <code>${id}</code>\n• Bot: @${me.username}`,
          true
        );
      }
      return true;
    }

    if (cmd === "unblock") {
      const uid = parts[0];
      if (!uid) return send(chatId, "Usage: /unblock user_id");
      await database.ref("blocked/users/" + uid).remove();
      await send(chatId, "✅ User unblocked");
      return true;
    }

    if (cmd === "gunblock") {
      const gid = parts[0];
      if (!gid) return send(chatId, "Usage: /gunblock group_id");
      await database.ref("blocked/groups/" + gid).remove();
      await send(chatId, "✅ Group unblocked");
      return true;
    }

    if (cmd === "stats") {
      const u = Object.keys((await database.ref("users").once("value")).val() || {}).length;
      const g = Object.keys((await database.ref("groups").once("value")).val() || {}).length;
      await send(chatId, `📊 Users: ${u}\nGroups: ${g}`);
      return true;
    }

    if (cmd === "kill") {
      if ((args || "").startsWith("all")) {
        await database.ref("groups").remove();
        await database.ref("users").remove();
        await send(chatId, "💀 All memory deleted");
      } else if ((args || "").startsWith("memory")) {
        const gid = parts[1];
        if (gid) await database.ref("groups/" + gid + "/memory").remove();
        else {
          const groups = (await database.ref("groups").once("value")).val() || {};
          for (const id of Object.keys(groups)) await database.ref("groups/" + id + "/memory").remove();
        }
        await send(chatId, "💀 Group memory cleared");
      } else await send(chatId, "Usage: /kill memory [id] | /kill all");
      return true;
    }

    if (cmd === "ukill") {
      if ((args || "").startsWith("memory")) {
        const uid = parts[1];
        if (uid) await database.ref("users/" + uid + "/history").remove();
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

function helpCommandsText() {
  return `📋 <b>${config.botName} — Help & Commands</b>

👤 <b>User</b>
/start — welcome
/name YourName — set name
/newchat — clear private history
/help — this menu

👑 <b>Owner</b>
/admin
/broadcast · /ubroadcast
/bot on|off [group_id]
/ubot on|off [user_id]
/block group_id · /block user_id
/unblock · /gunblock
/user · /group · /stats
/kill · /ukill

🛡 <b>Group Moderation (Rose-style)</b>
/ban /tban /unban /kick
/mute /tmute /unmute
/warn /unwarn /warns
/promote /demote /adminlist
/pin /unpin /del /purge
/setwelcome /welcome /rules
/lock /unlock /filters /notes
/id /info /report

Bot ko group mein Admin rights do.
Private: AI girlfriend + adult allowed.
Group AI: tag / reply / hello.`;
}

module.exports = { isOwner, handleAdmin, helpCommandsText };
