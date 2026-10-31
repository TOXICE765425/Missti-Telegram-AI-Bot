const { config, validateConfig } = require("../lib/config");
const { tg, send, logToChannel, logError } = require("../lib/telegram");
const {
  db,
  getPrivateHistory,
  savePrivateHistory,
  getGroupHistory,
  saveGroupHistory,
  updateUser,
  isBlocked,
  isGroupBlocked,
  getBotPower
} = require("../lib/firebase");
const { askGrok } = require("../lib/ai");
const { isOwner, handleAdmin } = require("../lib/admin");

module.exports = async (req, res) => {
  // Health check / GET
  if (req.method !== "POST") {
    return res.status(200).send(`${config.botName} is running ✅`);
  }

  try {
    validateConfig();
  } catch (e) {
    return res.status(500).send(e.message);
  }

  // Optional webhook secret (only if set)
  if (config.webhookSecret) {
    const header = req.headers["x-telegram-bot-api-secret-token"];
    if (header !== config.webhookSecret) {
      return res.status(401).send("Unauthorized");
    }
  }

  try {
    const update = req.body;

    // ========== Bot added / removed ==========
    if (update.my_chat_member) {
      const m = update.my_chat_member;
      const chat = m.chat;
      const from = m.from;
      const oldStatus = m.old_chat_member?.status;
      const newStatus = m.new_chat_member?.status;

      const me = await tg("getMe");
      if (m.new_chat_member?.user?.id !== me.id) {
        return res.status(200).json({ ok: true });
      }

      // Added to group
      if (["left", "kicked"].includes(oldStatus) && ["member", "administrator"].includes(newStatus)) {
        const title = chat.title || "Unknown";
        const username = chat.username ? `@${chat.username}` : "Private";
        const link = chat.username ? `https://t.me/${chat.username}` : "Private";
        let members = "?";
        try { members = await tg("getChatMemberCount", { chat_id: chat.id }); } catch {}

        await db().ref(`groups/${chat.id}`).update({
          title,
          username: chat.username || null,
          members,
          addedBy: from.id,
          addedAt: Date.now()
        });

        const caption =
          `📝 <b>${config.botName} bot added in a new group</b>\n\n` +
          `❅─────✧❅✦❅✧─────❅\n\n` +
          `📌 chat name: ${title}\n` +
          `🍂 chat id: <code>${chat.id}</code>\n` +
          `🔐 chat username: ${username}\n` +
          `🛰 chat link: ${link}\n` +
          `📈 group members: ${members}\n` +
          `🤔 added by: ${from.first_name || ""} ${from.last_name || ""}`;

        await logToChannel(caption, true);
      }

      // Removed from group
      if (["member", "administrator"].includes(oldStatus) && ["left", "kicked"].includes(newStatus)) {
        const caption =
          `✫ #left_group ✫\n\n` +
          `📌 chat name: ${chat.title || "Unknown"}\n` +
          `🆔 chat id: <code>${chat.id}</code>\n` +
          `👤 removed by: ${from.first_name || ""} ${from.last_name || ""}\n` +
          `🤖 bot: @${me.username}`;
        await logToChannel(caption, true);
      }

      return res.status(200).json({ ok: true });
    }

    // ========== Normal message ==========
    const msg = update.message || update.edited_message;
    if (!msg?.chat || !msg?.from || !msg.text) {
      return res.status(200).json({ ok: true });
    }

    const text = msg.text.trim();
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const isPrivate = msg.chat.type === "private";
    const isGroup = ["group", "supergroup"].includes(msg.chat.type);

    // Blocks
    if (await isBlocked(userId)) return res.status(200).json({ ok: true });
    if (isGroup && await isGroupBlocked(chatId)) return res.status(200).json({ ok: true });

    // Bot power switches
    const power = await getBotPower();
    if (isPrivate && !power.privateOn && !isOwner(userId)) return res.status(200).json({ ok: true });
    if (isGroup && !power.groupOn && !isOwner(userId)) return res.status(200).json({ ok: true });

    // Profile
    let profile = (await db().ref(`users/${userId}`).once("value")).val() || {};
    profile.firstName = msg.from.first_name || "jaan";
    profile.username = msg.from.username || "";
    profile.name = profile.name || profile.firstName;

    // Command parse
    const cmdMatch = text.match(/^[/!.](\w+)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
    const cmd = cmdMatch ? cmdMatch[1].toLowerCase() : null;
    const args = cmdMatch ? (cmdMatch[2] || "").trim() : "";

    // Admin
    if (cmd && isOwner(userId)) {
      if (await handleAdmin(msg, cmd, args)) {
        return res.status(200).json({ ok: true });
      }
    }

    // /start
    if (cmd === "start") {
      await updateUser(userId, {
        firstName: profile.firstName,
        username: profile.username,
        name: profile.name,
        lastActive: Date.now()
      });

      let photo = null;
      try {
        const photos = await tg("getUserProfilePhotos", { user_id: userId, limit: 1 });
        if (photos.total_count > 0) photo = photos.photos[0][0].file_id;
      } catch {}

      const caption =
        `👋 Hey ${profile.name} ❤️\n\n` +
        `Main <b>${config.botName}</b> hoon... teri naughty girlfriend 😘\n` +
        `Mujhse baat kar, dil ki baat kar, ya phir mood kharab hai to galiyan bhi de sakta hai 😏\n\n` +
        `Bas yaad rakh... main tujhe kabhi nahi bhoolungi.`;

      const me = await tg("getMe");
      const keyboard = {
        inline_keyboard: [
          [{ text: "➕ Add Your Group", url: `https://t.me/${me.username}?startgroup=true` }],
          [{ text: "💬 Support", url: config.supportUrl }],
          [{ text: "👨‍💻 Coder", url: `tg://user?id=${config.ownerId}` }]
        ]
      };

      if (photo) {
        await tg("sendPhoto", { chat_id: chatId, photo, caption, parse_mode: "HTML", reply_markup: keyboard });
      } else {
        await send(chatId, caption, { parse_mode: "HTML", reply_markup: keyboard });
      }
      return res.status(200).json({ ok: true });
    }

    // /name
    if (isPrivate && cmd === "name") {
      if (!args) await send(chatId, "Use: /name TeraNaam");
      else {
        profile.name = args.slice(0, 40);
        await updateUser(userId, { name: profile.name });
        await send(chatId, `Theek hai ${profile.name}... ab se main tujhe yahi bolungi ❤️`);
      }
      return res.status(200).json({ ok: true });
    }

    // /newchat
    if (isPrivate && cmd === "newchat") {
      await db().ref(`users/${userId}/history`).remove();
      await send(chatId, "Purani baatein bhool gayi... ab nayi shuruaat ❤️");
      return res.status(200).json({ ok: true });
    }

    // /help
    if (cmd === "help") {
      await send(chatId,
        `❤️ <b>${config.botName} Help</b>\n\n` +
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

    // Detect gali
    if (config.galiRegex.test(text)) {
      const found = text.match(config.galiRegex);
      if (found) {
        profile.lastAbuse = found[0];
        await updateUser(userId, { lastAbuse: found[0] });
      }
    }

    // ===== GROUP =====
    if (isGroup) {
      const me = await tg("getMe");
      const botUsername = (me.username || "").toLowerCase();
      const botId = me.id;

      const isMention = botUsername && text.toLowerCase().includes(`@${botUsername}`);
      const isReplyToBot = msg.reply_to_message?.from?.id === botId;
      const isGreeting = config.greetingRegex.test(text);

      await db().ref(`groups/${chatId}/members/${userId}`).set({
        name: profile.name,
        username: profile.username,
        lastActive: Date.now()
      });

      if (!isMention && !isReplyToBot && !isGreeting) {
        return res.status(200).json({ ok: true });
      }

      const clean = text.replace(new RegExp(`@${botUsername}`, "ig"), "").trim() || "Haan bol";

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

    // ===== PRIVATE =====
    if (isPrivate) {
      await tg("sendChatAction", { chat_id: chatId, action: "typing" });

      let history = await getPrivateHistory(userId);
      const answer = await askGrok(text, history, profile, false);

      history.push(
        { role: "user", text, at: Date.now() },
        { role: "assistant", text: answer, at: Date.now() }
      );
      await savePrivateHistory(userId, history);
      await updateUser(userId, {
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
    try { await logError(error, { fn: "main", msg: req.body?.message }); } catch {}
    try {
      const msg = req.body?.message;
      if (msg?.chat?.type === "private") {
        await send(msg.chat.id, "Abhi thoda issue aa gaya baby... thodi der baad try karna 😘");
      }
    } catch {}
    return res.status(200).json({ ok: true });
  }
};
