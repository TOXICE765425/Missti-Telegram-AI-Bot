const { config } = require("./lib/config");
const { tg, send, sendPhoto, logToChannel, logError } = require("./lib/telegram");
const {
  db, getPrivateHistory, savePrivateHistory,
  getGroupHistory, saveGroupHistory, getGroupOthersContext,
  isAskingAboutOthers, getPhotoState, setPhotoState,
  updateUser, isBlocked, isGroupBlocked, getBotPower,
  isPrivateUserOff, isGroupIdOff
} = require("./lib/firebase");
const { askAI } = require("./lib/ai");
const { isOwner, handleAdmin, helpCommandsText } = require("./lib/admin");
const { handleModeration, onGroupMessageExtras, moderationHelpText } = require("./lib/moderation");

const ADULT_REGEX = /\b(sex|sexy|nude|nudes|boobs|breast|pussy|lund|lawda|lawde|chod|chud|chudai|sambhog|intimate|18\+|adult|horn|horny|cum|suck|blowjob|bj|bed|raat|nangi|kapde\s*uto|kiss\s*me|make\s*out)\b/i;

const PHOTO_EXCUSES_1 = [
  "Abhi nahi yaar... lighting kharab hai 🙈",
  "Haye sharma aa rahi hai... baad mein na",
  "Photo maang ke kya karoge 😏 thoda wait karo",
  "Mood nahi hai selfie ka abhi",
  "Baad mein bhejungi, abhi busy hoon thodi"
];
const PHOTO_EXCUSES_2 = [
  "Ek aur? Itni jaldi 😌 pehle wali dekho na",
  "Hmm... abhi nahi, thoda baad mein",
  "Tum bahut demanding ho ja rahe ho 😅",
  "Ruko na, abhi ready nahi"
];
const PHOTO_EXCUSES_3 = [
  "Yar tumko mere pe vishwas nahi ki ye main hoon? 😒",
  "Itni photos kyun chahiye... trust nahi hai kya",
  "Lagta hai tum photo collection bana rahe ho 😂",
  "Ek ek karke maang rahe ho... thoda sharm karo na"
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function handlePhotoRequest(chatId, userId, text) {
  let state = await getPhotoState(userId);
  // stage: 0 = none sent, 1 = first sent, 2 = second sent, 3 = third sent
  // asks: how many times asked in current stage
  // talksAfter: messages after last photo (for stage 2→3 delay)

  const isAsk = config.photoAskRegex.test(text);

  if (state.stage >= 3) {
    // already gave all 3
    if (isAsk) {
      await send(chatId, "Bas yaar... itni photos de chuki hoon. Ab baat karo na 😌");
      return true;
    }
    return false;
  }

  if (state.stage === 2) {
    // after 2nd photo, need ~10 talks then can give 3rd on ask
    state.talksAfter = (state.talksAfter || 0) + 1;
    await setPhotoState(userId, state);
  }

  if (!isAsk) return false;

  // STAGE 0 → need 10-15 asks before first photo
  if (state.stage === 0) {
    state.asks = (state.asks || 0) + 1;
    await setPhotoState(userId, state);
    if (state.asks < 10) {
      await send(chatId, pick(PHOTO_EXCUSES_1));
      return true;
    }
    // send photo 1
    await sendPhoto(chatId, config.photos[0], "Ye lo... ab khush? 🙈");
    state.stage = 1;
    state.asks = 0;
    await setPhotoState(userId, state);
    return true;
  }

  // STAGE 1 → second photo after a few more asks
  if (state.stage === 1) {
    state.asks = (state.asks || 0) + 1;
    await setPhotoState(userId, state);
    if (state.asks < 3) {
      await send(chatId, pick(PHOTO_EXCUSES_2));
      return true;
    }
    await sendPhoto(chatId, config.photos[1], "Theek hai... ek aur 😌");
    state.stage = 2;
    state.asks = 0;
    state.talksAfter = 0;
    await setPhotoState(userId, state);
    return true;
  }

  // STAGE 2 → third photo after ~10 talks + asks with trust excuses
  if (state.stage === 2) {
    state.asks = (state.asks || 0) + 1;
    await setPhotoState(userId, state);
    if ((state.talksAfter || 0) < 10 || state.asks < 3) {
      await send(chatId, pick(PHOTO_EXCUSES_3));
      return true;
    }
    await sendPhoto(chatId, config.photos[2], "Bas last... ab vishwas? ❤️");
    state.stage = 3;
    state.asks = 0;
    await setPhotoState(userId, state);
    return true;
  }

  return false;
}

async function handleUpdate(update) {
  // Inline button callbacks
  if (update.callback_query) {
    const cq = update.callback_query;
    if (cq.data === "help_commands") {
      try {
        await tg("answerCallbackQuery", { callback_query_id: cq.id });
        await send(cq.message.chat.id, helpCommandsText(), { parse_mode: "HTML" });
      } catch (e) {}
    }
    return;
  }

  // Bot added / removed
  if (update.my_chat_member) {
    const m = update.my_chat_member;
    const chat = m.chat;
    const from = m.from;
    const oldStatus = m.old_chat_member?.status;
    const newStatus = m.new_chat_member?.status;
    const me = await tg("getMe");
    if (m.new_chat_member?.user?.id !== me.id) return;

    // Added to group
    if (["left", "kicked"].includes(oldStatus) && ["member", "administrator"].includes(newStatus)) {
      // If group was blocked earlier → special message + leave
      if (await isGroupBlocked(chat.id)) {
        const uname = from.username ? "@" + from.username : (from.first_name || "User");
        try {
          await tg("sendMessage", {
            chat_id: chat.id,
            text: `@admin\n\nAre madarchodo bola na 1 baar mujhe nahi rehna tere group mein... to kyun add kiya hai ${uname}?`,
            reply_to_message_id: m.message_id || undefined
          });
        } catch (e) {
          try {
            await send(chat.id, `@admin\n\nAre madarchodo bola na 1 baar mujhe nahi rehna tere group mein... to kyun add kiya hai ${uname}?`);
          } catch (e2) {}
        }
        try { await tg("leaveChat", { chat_id: chat.id }); } catch (e) {}
        await logToChannel("🚫 Blocked group re-add attempt <code>" + chat.id + "</code> by " + uname, true);
        return;
      }

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
        `📝 <b>${config.botName} bot added in a new group</b>\n\n📌 ${chat.title || "?"}\n🆔 <code>${chat.id}</code>\n👤 ${from.first_name || ""}\n👥 ${members}`,
        true
      );
    }

    if (["member", "administrator"].includes(oldStatus) && ["left", "kicked"].includes(newStatus)) {
      await logToChannel(
        `✫ #left_group ✫\n📌 ${chat.title || "?"}\n🆔 <code>${chat.id}</code>\n👤 ${from.first_name || ""}`,
        true
      );
    }
    return;
  }

  const msg = update.message || update.edited_message;
  if (!msg?.chat || !msg?.from) return;

  // only text for AI path; ignore empty
  const text = (msg.text || "").trim();
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const isPrivate = msg.chat.type === "private";
  const isGroup = ["group", "supergroup"].includes(msg.chat.type);

  // Hard block user → total silence (no start, no reply)
  if (await isBlocked(userId)) return;

  if (isGroup && await isGroupBlocked(chatId)) return;

  const power = await getBotPower();

  // Global / per-target off
  if (isPrivate) {
    if (!power.privateOn && !isOwner(userId)) {
      await send(chatId, "Private ke liye bot off hai. Problem ho to bot owner se contact karo.");
      return;
    }
    if (await isPrivateUserOff(userId) && !isOwner(userId)) {
      await send(chatId, "Private ke liye bot off hai. Problem ho to bot owner se contact karo.");
      return;
    }
  }

  if (isGroup) {
    if (!power.groupOn && !isOwner(userId)) {
      // only reply if tagged etc - checked later; message when would have replied
    }
    if (await isGroupIdOff(chatId) && !isOwner(userId)) {
      // same
    }
  }

  if (!text) return;

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

  // Rose-style group moderation (group admins)
  if (cmd) {
    if (await handleModeration(msg, cmd, args)) return;
  }

  // Welcome + filters (group)
  if (isGroup) {
    try { await onGroupMessageExtras(msg); } catch (e) {}
  }

  // /start
  if (cmd === "start") {
    if (await isBlocked(userId)) return;
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
      `Main <b>${config.botName}</b> hoon...\n` +
      `Mujhse normal baat karo, dil ki baat karo.\n` +
      `Bas respectful raho 🌸`;

    const me = await tg("getMe");
    const keyboard = {
      inline_keyboard: [
        [{ text: "➕ Add To Your Group", url: "https://t.me/" + me.username + "?startgroup=true" }],
        [
          { text: "💬 Support", url: config.supportUrl },
          { text: "🧑‍💻 Coder", url: "tg://user?id=" + config.ownerId }
        ],
        [{ text: "📋 Help and Commands", callback_data: "help_commands" }]
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
      await send(chatId, "Theek hai " + profile.name + "... ab se yahi bolungi ❤️");
    }
    return;
  }

  if (isPrivate && cmd === "newchat") {
    await db().ref("users/" + userId + "/history").remove();
    await send(chatId, "Purani baatein clear... nayi shuruaat ❤️");
    return;
  }

  if (cmd === "help" || cmd === "helpcommands" || cmd === "commands") {
    await send(chatId, helpCommandsText(), { parse_mode: "HTML" });
    return;
  }

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
    const isMention = botUsername && text.toLowerCase().includes("@" + botUsername);
    const isReplyToBot = msg.reply_to_message?.from?.id === me.id;
    const isGreeting = config.greetingRegex.test(text);

    await db().ref("groups/" + chatId + "/members/" + userId).set({
      name: profile.name,
      username: profile.username,
      lastActive: Date.now()
    });

    if (!isMention && !isReplyToBot && !isGreeting) return;

    // Group off messages
    if ((!power.groupOn || await isGroupIdOff(chatId)) && !isOwner(userId)) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: "Group ke liye bot off kiya hai. Koi problem ho to bot owner se contact karo.",
        reply_to_message_id: msg.message_id,
        allow_sending_without_reply: true
      });
      return;
    }

    // Adult in group → redirect private
    if (ADULT_REGEX.test(text)) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: "Private mein aao... group mein aisi baat nahi karti 🙈",
        reply_to_message_id: msg.message_id,
        allow_sending_without_reply: true
      });
      return;
    }

    const clean = text.replace(new RegExp("@" + botUsername, "ig"), "").trim() || "Haan bol";

    try {
      await tg("sendChatAction", { chat_id: chatId, action: "typing" });
      let history = await getGroupHistory(chatId, userId);
      let othersCtx = await getGroupOthersContext(chatId, userId);
      if (isAskingAboutOthers(clean) && !othersCtx) {
        othersCtx = "Is group mein recent tang record nahi mila.";
      }
      let answer = await askAI(clean, history, profile, true, othersCtx);
      if (!answer?.trim()) throw new Error("Empty answer");

      history.push(
        { role: "user", text: clean, at: Date.now() },
        { role: "assistant", text: answer, at: Date.now() }
      );
      await saveGroupHistory(chatId, userId, history, profile.name);

      try {
        await tg("sendMessage", {
          chat_id: chatId,
          text: answer,
          reply_to_message_id: msg.message_id,
          allow_sending_without_reply: true
        });
      } catch {
        await tg("sendMessage", { chat_id: chatId, text: answer });
      }
    } catch (err) {
      console.error("Group error:", err.message);
      try { await logError(err, { fn: "group_reply", msg }); } catch {}
    }
    return;
  }

  // ===== PRIVATE =====
  if (isPrivate) {
    // Photo request system
    if (await handlePhotoRequest(chatId, userId, text)) {
      // still save minimal history for context
      let history = await getPrivateHistory(userId);
      history.push({ role: "user", text, at: Date.now() });
      await savePrivateHistory(userId, history);
      return;
    }

    // increment talksAfter if in photo stage 2
    try {
      const st = await getPhotoState(userId);
      if (st.stage === 2) {
        st.talksAfter = (st.talksAfter || 0) + 1;
        await setPhotoState(userId, st);
      }
    } catch {}

    await tg("sendChatAction", { chat_id: chatId, action: "typing" });
    let history = await getPrivateHistory(userId);
    const answer = await askAI(text, history, profile, false, "");
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
