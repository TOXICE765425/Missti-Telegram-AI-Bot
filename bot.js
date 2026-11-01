const { config } = require("./lib/config");
const { tg, send, logToChannel, logError } = require("./lib/telegram");
const {
  db, getPrivateHistory, savePrivateHistory,
  getGroupHistory, saveGroupHistory, updateUser,
  isBlocked, isGroupBlocked, getBotPower
} = require("./lib/firebase");
const { askAI } = require("./lib/ai");
const { isOwner, handleAdmin } = require("./lib/admin");

async function handleUpdate(update) {
  // Bot added / removed
  if (update.my_chat_member) {
    const m = update.my_chat_member;
    const chat = m.chat;
    const from = m.from;
    const oldStatus = m.old_chat_member?.status;
    const newStatus = m.new_chat_member?.status;
    const me = await tg("getMe");

    if (m.new_chat_member?.user?.id !== me.id) return;

    if (["left", "kicked"].includes(oldStatus) && ["member", "administrator"].includes(newStatus)) {
      let members = "?";
      try { members = await tg("getChatMemberCount", { chat_id: chat.id }); } catch {}
      await db().ref("groups/" + chat.id).update({
        title: chat.title || "Unknown",
        username: chat.username || null,
        members,
        addedBy: from.id,
        addedAt: Date.now()
      });
      await logToChannel(
        `📝 <b>${config.botName} bot added in a new group</b>\n\n❅─────✧❅✦❅✧─────❅\n\n📌 chat name: ${chat.title || "?"}\n🍂 chat id: <code>${chat.id}</code>\n🔐 chat username: ${chat.username ? "@" + chat.username : "Private"}\n🛰 chat link: ${chat.username ? "https://t.me/" + chat.username : "Private"}\n📈 group members: ${members}\n🤔 added by: ${from.first_name || ""}`,
        true
      );
    }

    if (["member", "administrator"].includes(oldStatus) && ["left", "kicked"].includes(newStatus)) {
      await logToChannel(
        `✫ #left_group ✫\n\n📌 chat name: ${chat.title || "?"}\n🆔 chat id: <code>${chat.id}</code>\n👤 removed by: ${from.first_name || ""}\n🤖 bot: @${me.username}`,
        true
      );
    }
    return;
  }

  const msg = update.message || update.edited_message;
  if (!msg?.chat || !msg?.from || !msg.text) return;

  const text = msg.text.trim();
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const isPrivate = msg.chat.type === "private";
  const isGroup = ["group", "supergroup"].includes(msg.chat.type);

  if (await isBlocked(userId)) return;
  if (isGroup && await isGroupBlocked(chatId)) return;

  const power = await getBotPower();
  if (isPrivate && !power.privateOn && !isOwner(userId)) return;
  if (isGroup && !power.groupOn && !isOwner(userId)) return;

  let profile = (await db().ref("users/" + userId).once("value")).val() || {};
  profile.firstName = msg.from.first_name || "jaan";
  profile.username = msg.from.username || "";
  profile.name = profile.name || profile.firstName;

  const cmdMatch = text.match(/^[/!.](\w+)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
  const cmd = cmdMatch ? cmdMatch[1].toLowerCase() : null;
  const args = cmdMatch ? (cmdMatch[2] || "").trim() : "";

  if (cmd && isOwner(userId)) {
    if (await handleAdmin(msg, cmd, args)) return;
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

    const caption = `👋 Hey ${profile.name} ❤️\n\nMain <b>${config.botName}</b> hoon... teri naughty girlfriend 😘\nMujhse baat kar, dil ki baat kar, ya phir mood kharab hai to galiyan bhi de sakta hai 😏\n\nBas yaad rakh... main tujhe kabhi nahi bhoolungi.`;
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
    return;
  }

  if (isPrivate && cmd === "name") {
    if (!args) await send(chatId, "Use: /name TeraNaam");
    else {
      profile.name = args.slice(0, 40);
      await updateUser(userId, { name: profile.name });
      await send(chatId, `Theek hai ${profile.name}... ab se main tujhe yahi bolungi ❤️`);
    }
    return;
  }

  if (isPrivate && cmd === "newchat") {
    await db().ref("users/" + userId + "/history").remove();
    await send(chatId, "Purani baatein bhool gayi... ab nayi shuruaat ❤️");
    return;
  }

  if (cmd === "help") {
    await send(chatId, `❤️ <b>${config.botName} Help</b>\n\n/name TeraNaam\n/newchat\n/help\n\nGroup: tag / reply / hello etc.`, { parse_mode: "HTML" });
    return;
  }

  // Gali
  if (config.galiRegex.test(text)) {
    const found = text.match(config.galiRegex);
    if (found) {
      profile.lastAbuse = found[0];
      await updateUser(userId, { lastAbuse: found[0] });
    }
  }

  // GROUP
  if (isGroup) {
    const me = await tg("getMe");
    const botUsername = (me.username || "").toLowerCase();
    const isMention = botUsername && text.toLowerCase().includes("@" + botUsername);
    const isReplyToBot = msg.reply_to_message?.from?.id === me.id;
    const isGreeting = config.greetingRegex.test(text);

    await db().ref("groups/" + chatId + "/members/" + userId).set({
      name: profile.name,
      username: profile.username,
      lastActive: Date.now()
    });

    if (!isMention && !isReplyToBot && !isGreeting) return;

    const clean = text.replace(new RegExp("@" + botUsername, "ig"), "").trim() || "Haan bol";

    try {
      await tg("sendChatAction", { chat_id: chatId, action: "typing" });

      let history = await getGroupHistory(chatId, userId);
      let answer = await askAI(clean, history, profile, true);

      if (!answer || !String(answer).trim()) {
        answer = "Haan bol na 😏";
      }

      history.push(
        { role: "user", text: clean, at: Date.now() },
        { role: "assistant", text: answer, at: Date.now() }
      );
      await saveGroupHistory(chatId, userId, history, profile.name);

      // Always try to reply as slide (reply_to)
      try {
        await tg("sendMessage", {
          chat_id: chatId,
          text: answer,
          reply_to_message_id: msg.message_id,
          allow_sending_without_reply: true
        });
      } catch (sendErr) {
        // fallback without reply
        await tg("sendMessage", { chat_id: chatId, text: answer });
      }
    } catch (err) {
      console.error("Group reply error:", err.message);
      // Structured logger error (same style as private errors)
      try {
        await logError(err, { fn: "group_reply", msg });
      } catch (e) {}
      // Do NOT spam group with error message every time
    }
    return;
  }

  // PRIVATE
  if (isPrivate) {
    await tg("sendChatAction", { chat_id: chatId, action: "typing" });
    let history = await getPrivateHistory(userId);
    const answer = await askAI(text, history, profile, false);
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
}

module.exports = { handleUpdate };
