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
    switch (cmd) {
      case "admin": {
        const panel = `🛠 <b>${config.botName} Admin Panel</b>

👥 <b>Users / Groups</b>
• /user — saare private users
• /group — saare groups

📢 <b>Broadcast</b>
• /broadcast msg
• /broadcast chat_id msg
• /ubroadcast msg
• /ubroadcast user_id msg
• reply + /broadcast ya /ubroadcast

🚫 <b>Block</b>
• /block user_id
• /unblock user_id
• /gblock group_id [reason]
• /gunblock group_id

⏻ <b>Bot power</b>
• /bot on|off
• /gbot on|off

📊 <b>Stats</b>
• /stats
• /stats user_id
• /stats -100xxx

🧠 <b>Memory</b>
• /kill memory
• /kill memory chat_id
• /ukill memory
• /ukill memory user_id
• /kill all

• /admin — ye panel`;
        await send(chatId, panel, { parse_mode: "HTML" });
        return true;
      }

      case "user": {
        const snap = await database.ref("users").once("value");
        const users = snap.val() || {};
        const list = Object.entries(users)
          .slice(0, 50)
          .map(([id, u]) => `• ${u.name || u.firstName || "User"} | @${u.username || "none"} | <code>${id}</code>`)
          .join("\n");
        await send(chatId, `👥 <b>Private Users</b> (${Object.keys(users).length})\n\n${list || "Empty"}`, { parse_mode: "HTML" });
        return true;
      }

      case "group": {
        const snap = await database.ref("groups").once("value");
        const groups = snap.val() || {};
        const list = Object.entries(groups)
          .slice(0, 50)
          .map(([id, g]) => `• ${g.title || "Group"} | <code>${id}</code>`)
          .join("\n");
        await send(chatId, `👥 <b>Groups</b> (${Object.keys(groups).length})\n\n${list || "Empty"}`, { parse_mode: "HTML" });
        return true;
      }

      case "broadcast": {
        if (!args && !msg.reply_to_message) {
          await send(chatId, "Usage: /broadcast msg  |  /broadcast chat_id msg  |  reply + /broadcast");
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
          if (msg.reply_to_message) {
            await tg("copyMessage", { chat_id: targetChat, from_chat_id: chatId, message_id: msg.reply_to_message.message_id });
          } else {
            await send(targetChat, messageText);
          }
          await send(chatId, `✅ Sent to ${targetChat}`);
          await logToChannel(`📢 Single broadcast → <code>${targetChat}</code>`, false);
        } else {
          const snap = await database.ref("groups").once("value");
          const groups = snap.val() || {};
          let ok = 0, fail = 0;
          for (const id of Object.keys(groups)) {
            try {
              if (msg.reply_to_message) {
                await tg("copyMessage", { chat_id: id, from_chat_id: chatId, message_id: msg.reply_to_message.message_id });
              } else {
                await send(id, messageText);
              }
              ok++;
            } catch { fail++; }
          }
          await send(chatId, `✅ Group Broadcast\nSuccess: ${ok}\nFailed: ${fail}`);
          await logToChannel(`📢 Group Broadcast → Success ${ok} | Fail ${fail}`, false);
        }
        return true;
      }

      case "ubroadcast": {
        if (!args && !msg.reply_to_message) {
          await send(chatId, "Usage: /ubroadcast msg  |  /ubroadcast user_id msg");
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
            await tg("copyMessage", { chat_id: targetUser, from_chat_id: chatId, message_id: msg.reply_to_message.message_id });
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
                await tg("copyMessage", { chat_id: id, from_chat_id: chatId, message_id: msg.reply_to_message.message_id });
              } else {
                await send(id, messageText);
              }
              ok++;
            } catch { fail++; }
          }
          await send(chatId, `✅ User Broadcast\nSuccess: ${ok}\nFailed: ${fail}`);
          await logToChannel(`📢 User Broadcast → Success ${ok} | Fail ${fail}`, false);
        }
        return true;
      }

      case "block": {
        const uid = args.trim();
        if (!uid) return send(chatId, "Usage: /block user_id");
        await database.ref(`blocked/users/${uid}`).set({ by: userId, at: Date.now() });
        await send(chatId, `🚫 User <code>${uid}</code> blocked.`, { parse_mode: "HTML" });

        const uSnap = await database.ref(`users/${uid}`).once("value");
        const u = uSnap.val() || {};
        const me = await tg("getMe");
        await logToChannel(
          `🚫 <b>Block The Bot</b> 🚫\n\n• Name: ${u.name || u.firstName || "Unknown"}\n• Username: @${u.username || "none"}\n• User ID: <code>${uid}</code>\n• Bot: ${config.botName}\n• Bot Username: @${me.username}`,
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
        const me = await tg("getMe");
        await logToChannel(
          `Unblock The Bot 😅\n\n• Name: ${u.name || u.firstName || "Unknown"}\n• Username: @${u.username || "none"}\n• User ID: <code>${uid}</code>\n• Bot: ${config.botName}\n• Bot Username: @${me.username}`,
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
          await send(chatId, `📊 <b>Overall Stats</b>\n\n👥 Private Users: ${Object.keys(uSnap.val() || {}).length}\n👥 Groups: ${Object.keys(gSnap.val() || {}).length}`, { parse_mode: "HTML" });
        } else if (/^-?\d+$/.test(args)) {
          if (args.startsWith("-")) {
            const gSnap = await database.ref(`groups/${args}`).once("value");
            const g = gSnap.val();
            if (!g) return send(chatId, "Group not found");
            await send(chatId, `📊 Group\nTitle: ${g.title || "N/A"}\nID: <code>${args}</code>\nMembers: ${g.members || "?"}`, { parse_mode: "HTML" });
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
        if (args.startsWith("all")) {
          await database.ref("groups").remove();
          await database.ref("users").remove();
          await send(chatId, "💀 All memory deleted.");
          await logToChannel("💀 /kill all executed", false);
        } else if (args.startsWith("memory")) {
          const parts = args.split(/\s+/);
          if (parts[1]) {
            await database.ref(`groups/${parts[1]}/memory`).remove();
            await send(chatId, `💀 Group memory cleared: ${parts[1]}`);
          } else {
            const snap = await database.ref("groups").once("value");
            for (const id of Object.keys(snap.val() || {})) {
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
        if (args.startsWith("memory")) {
          const parts = args.split(/\s+/);
          if (parts[1]) {
            await database.ref(`users/${parts[1]}/history`).remove();
            await send(chatId, `💀 Private memory cleared: ${parts[1]}`);
          } else {
            const snap = await database.ref("users").once("value");
            for (const id of Object.keys(snap.val() || {})) {
              await database.ref(`users/${id}/history`).remove();
            }
            await send(chatId, "💀 All private history cleared (names kept).");
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
    return true;
  }
}

module.exports = { isOwner, handleAdmin };
