const admin = require("firebase-admin");

const {
  BOT_TOKEN,
  AI_API_URL,
  AI_API_KEY,
  AI_MODEL,
  FIREBASE_DATABASE_URL,
  FIREBASE_SERVICE_ACCOUNT_JSON,
  TELEGRAM_WEBHOOK_SECRET
} = process.env;

const TG = `https://api.telegram.org/bot${BOT_TOKEN}`;
const WELCOME_VIDEO_URL = "https://yourimageshare.com/ib/aLiKKKuG3P.mp4";

const GROUP_LIMIT = 25;
const PRIVATE_LIMIT = 16;
const IDLE_MS = 12 * 60 * 60 * 1000;
const MEMORY_MS = 7 * 24 * 60 * 60 * 1000;

const GREETING =
  /\b(hi+|hello+|hey+|hiya|good morning|good afternoon|good evening|good night|gm|gn|namaste|salaam|assalamualaikum|hola|bonjour)\b/i;

function db() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(
        JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON)
      ),
      databaseURL: FIREBASE_DATABASE_URL
    });
  }
  return admin.database();
}

async function tg(method, body) {
  const response = await fetch(`${TG}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(result.description || `${method} failed`);
  }

  return result.result;
}

async function send(chatId, text, extra = {}) {
  text = String(text || "").trim();

  while (text.length > 4000) {
    let cut = text.lastIndexOf("\n", 4000);
    if (cut < 1000) cut = 4000;

    await tg("sendMessage", {
      chat_id: chatId,
      text: text.slice(0, cut),
      ...extra
    });

    text = text.slice(cut).trim();
    extra = {};
  }

  if (text) {
    await tg("sendMessage", {
      chat_id: chatId,
      text,
      ...extra
    });
  }
}

function parseCommand(text) {
  const match = text.match(
    /^[.!/](\w+)(?:@\w+)?(?:\s+([\s\S]*))?$/
  );

  return match
    ? { cmd: match[1].toLowerCase(), args: (match[2] || "").trim() }
    : null;
}

function getName(text) {
  const match = text.match(
    /(?:mera naam|my name is|call me|naam hai)\s+([a-zA-Z][a-zA-Z0-9 _-]{0,30})/i
  );

  if (!match) return null;

  return match[1]
    .split(/\s+(hai|hoon|hun|hu|please)\b/i)[0]
    .trim()
    .slice(0, 35);
}

function shortGroupReply(text) {
  return String(text).trim().split(/\s+/).slice(0, 17).join(" ");
}

async function askAI(text, profile, history, groupMode) {
  const recent = history.map(item =>
    `${item.role}: ${item.text}`
  ).join("\n");

  const prompt = `
Tum Missti ho, ek friendly, warm aur natural conversational AI dost.

User jis language aur script mein baat kare, usi mein jawab do.
Hinglish aaye toh natural Hinglish mein reply karo.
Friendly, casual aur helpful raho. Kabhi-kabhi emoji use karo.
User ke preferred name ko naturally yaad rakho.
Khud ko real human hone ka jhootha claim mat karna.

User ka naam: ${profile.name || profile.firstName || "dost"}

${groupMode
  ? "Group reply maximum 17 words ka rakho. Short aur friendly jawab do."
  : "Private chat mein context ke hisaab se jawab do."}

Pichhli conversation:
${recent || "(Abhi koi history nahi hai)"}

Latest message:
${text}

Missti ka reply:
`;

  const url = new URL(AI_API_URL);
  url.searchParams.set("key", AI_API_KEY);
  url.searchParams.set("prompt", prompt);
  url.searchParams.set("model", AI_MODEL);

  const response = await fetch(url, {
    headers: { accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`AI API HTTP ${response.status}`);
  }

  const data = await response.json();
  const answer =
    data?.data?.response ||
    data?.response ||
    data?.data?.answer ||
    data?.answer;

  if (typeof answer !== "string" || !answer.trim()) {
    throw new Error("AI API response missing");
  }

  return groupMode
    ? shortGroupReply(answer)
    : answer.trim();
}

async function isAdmin(chatId, userId) {
  const member = await tg("getChatMember", {
    chat_id: chatId,
    user_id: userId
  });

  return ["creator", "administrator"].includes(member.status);
}

async function getTarget(msg, args) {
  if (msg.reply_to_message?.from) {
    return msg.reply_to_message.from;
  }

  if (/^\d+$/.test(args)) {
    return {
      id: Number(args),
      first_name: args
    };
  }

  throw new Error(
    "User ke message par reply karke command chalao, ya numeric user ID do."
  );
}

function durationSeconds(text) {
  const match = String(text).match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;

  return Number(match[1]) * ({
    s: 1,
    m: 60,
    h: 3600,
    d: 86400
  }[match[2].toLowerCase()]);
}

async function moderation(msg, cmd, args) {
  const chatId = msg.chat.id;

  if (!["group", "supergroup"].includes(msg.chat.type)) {
    await send(chatId, "Ye command group mein use karo 🙂");
    return true;
  }

  if (!await isAdmin(chatId, msg.from.id)) {
    await send(chatId, "Ye command sirf group admins/owner use kar sakte hain.");
    return true;
  }

  try {
    let target;
    const getUser = () => getTarget(msg, args);

    switch (cmd) {
      case "help":
        await send(chatId,
          "🛡️ MISSTI ADMIN COMMANDS\n\n" +
          ".ban / .sban / .dban\n" +
          ".unban / .kick / .skick\n" +
          ".mute 30m / .dmute 30m / .smute / .unmute\n" +
          ".warn / .unwarn / .warns\n" +
          ".pin / .unpin / .d\n" +
          ".promote / .demote / .demote_all\n" +
          ".add power / .remove power / .title\n" +
          ".res messages|media|links\n\n" +
          "Target ke message par reply karna recommended hai."
        );
        return true;

      case "d":
        if (!msg.reply_to_message) {
          throw new Error("Delete karne wale message par reply karo.");
        }
        await tg("deleteMessage", {
          chat_id: chatId,
          message_id: msg.reply_to_message.message_id
        });
        return true;

      case "pin":
        if (!msg.reply_to_message) {
          throw new Error("Pin karne wale message par reply karo.");
        }
        await tg("pinChatMessage", {
          chat_id: chatId,
          message_id: msg.reply_to_message.message_id
        });
        await send(chatId, "📌 Pinned!");
        return true;

      case "unpin":
        await tg("unpinChatMessage", { chat_id: chatId });
        await send(chatId, "📌 Unpinned.");
        return true;

      case "ban":
      case "sban":
      case "dban":
      case "kick":
      case "skick":
      case "unban": {
        target = await getUser();

        if (cmd === "dban" && msg.reply_to_message) {
          await tg("deleteMessage", {
            chat_id: chatId,
            message_id: msg.reply_to_message.message_id
          });
        }

        if (cmd === "unban") {
          await tg("unbanChatMember", {
            chat_id: chatId,
            user_id: target.id,
            only_if_banned: true
          });
          await send(chatId, "✅ User unbanned.");
          return true;
        }

        await tg("banChatMember", {
          chat_id: chatId,
          user_id: target.id
        });

        if (["kick", "skick"].includes(cmd)) {
          await tg("unbanChatMember", {
            chat_id: chatId,
            user_id: target.id,
            only_if_banned: true
          });
        }

        if (["ban", "kick"].includes(cmd)) {
          await send(chatId, "Done ✅");
        }

        return true;
      }

      case "mute":
      case "dmute":
      case "smute":
      case "unmute": {
        target = await getUser();

        if (cmd === "dmute" && msg.reply_to_message) {
          await tg("deleteMessage", {
            chat_id: chatId,
            message_id: msg.reply_to_message.message_id
          });
        }

        if (cmd === "unmute") {
          await tg("restrictChatMember", {
            chat_id: chatId,
            user_id: target.id,
            use_independent_chat_permissions: true,
            permissions: {
              can_send_messages: true,
              can_send_audios: true,
              can_send_documents: true,
              can_send_photos: true,
              can_send_videos: true,
              can_send_video_notes: true,
              can_send_voice_notes: true,
              can_send_polls: true,
              can_send_other_messages: true,
              can_add_web_page_previews: true
            }
          });

          await send(chatId, "🔊 User unmuted.");
          return true;
        }

        const seconds = durationSeconds(args.split(/\s+/).pop());
        const body = {
          chat_id: chatId,
          user_id: target.id,
          use_independent_chat_permissions: true,
          permissions: { can_send_messages: false }
        };

        if (seconds) {
          body.until_date = Math.floor(Date.now() / 1000) + seconds;
        }

        await tg("restrictChatMember", body);

        if (cmd === "mute") {
          await send(chatId, "🔇 User muted.");
        }

        return true;
      }

      case "warn":
      case "unwarn":
      case "warns": {
        target = await getUser();

        const ref = db().ref(
          `misstiWarnings/${chatId}/${target.id}`
        );

        const snapshot = await ref.once("value");
        let count = Number(snapshot.val() || 0);

        if (cmd === "warn") count++;
        if (cmd === "unwarn") count = Math.max(0, count - 1);

        await ref.set(count);
        await send(chatId, `⚠️ Warnings: ${count}/3`);

        if (cmd === "warn" && count >= 3) {
          await tg("banChatMember", {
            chat_id: chatId,
            user_id: target.id
          });
          await ref.set(0);
          await send(chatId, "🚫 3 warnings ke baad user banned.");
        }

        return true;
      }

      case "promote":
      case "demote": {
        target = await getUser();

        const enable = cmd === "promote";

        await tg("promoteChatMember", {
          chat_id: chatId,
          user_id: target.id,
          can_manage_chat: enable,
          can_delete_messages: enable,
          can_manage_video_chats: enable,
          can_restrict_members: enable,
          can_invite_users: enable,
          can_pin_messages: enable,
          can_change_info: false,
          can_promote_members: false
        });

        if (enable) {
          await db().ref(
            `misstiPromotedAdmins/${chatId}/${target.id}`
          ).set(true);
        } else {
          await db().ref(
            `misstiPromotedAdmins/${chatId}/${target.id}`
          ).remove();
        }

        await send(chatId, enable ? "⬆️ Promoted." : "⬇️ Demoted.");
        return true;
      }

      case "demote_all": {
        const ref = db().ref(`misstiPromotedAdmins/${chatId}`);
        const snapshot = await ref.once("value");
        const admins = snapshot.val() || {};

        let count = 0;

        for (const id of Object.keys(admins)) {
          try {
            await tg("promoteChatMember", {
              chat_id: chatId,
              user_id: Number(id),
              can_manage_chat: false,
              can_delete_messages: false,
              can_manage_video_chats: false,
              can_restrict_members: false,
              can_invite_users: false,
              can_pin_messages: false,
              can_change_info: false,
              can_promote_members: false
            });

            await ref.child(id).remove();
            count++;
          } catch (error) {
            console.error("demote_all:", id, error.message);
          }
        }

        await send(chatId, `Demoted ${count} tracked admin(s).`);
        return true;
      }

      case "title": {
        target = await getUser();

        if (!msg.reply_to_message) {
          throw new Error("Admin ke message par reply karke .title Legend bhejo.");
        }

        const title = args.trim();

        if (!title || title.length > 16) {
          throw new Error("Title 1 se 16 characters ka hona chahiye.");
        }

        await tg("setChatAdministratorCustomTitle", {
          chat_id: chatId,
          user_id: target.id,
          custom_title: title
        });

        await send(chatId, "✅ Custom title updated.");
        return true;
      }

      case "add":
      case "remove": {
        target = await getUser();

        const power = args.split(/\s+/).pop().toLowerCase();

        const map = {
          delete: "can_delete_messages",
          ban: "can_restrict_members",
          invite: "can_invite_users",
          pin: "can_pin_messages",
          video: "can_manage_video_chats",
          changeinfo: "can_change_info",
          managechat: "can_manage_chat"
        };

        const permission = map[power];

        if (!permission) {
          throw new Error(
            "Power: delete, ban, invite, pin, video, changeinfo, managechat"
          );
        }

        const member = await tg("getChatMember", {
          chat_id: chatId,
          user_id: target.id
        });

        if (member.status !== "administrator") {
          throw new Error("Target ko pehle admin promote karo.");
        }

        const powers = Object.values(map);
        const permissions = {};

        for (const key of powers) {
          permissions[key] = Boolean(member[key]);
        }

        permissions[permission] = cmd === "add";

        await tg("promoteChatMember", {
          chat_id: chatId,
          user_id: target.id,
          ...permissions
        });

        await send(chatId, `✅ ${power}: ${cmd} complete.`);
        return true;
      }

      case "res": {
        target = await getUser();
        const power = args.split(/\s+/).pop().toLowerCase();

        const presets = {
          messages: {
            can_send_messages: false,
            can_send_audios: false,
            can_send_documents: false,
            can_send_photos: false,
            can_send_videos: false,
            can_send_video_notes: false,
            can_send_voice_notes: false,
            can_send_polls: false,
            can_send_other_messages: false,
            can_add_web_page_previews: false
          },
          media: {
            can_send_messages: true,
            can_send_audios: false,
            can_send_documents: false,
            can_send_photos: false,
            can_send_videos: false,
            can_send_video_notes: false,
            can_send_voice_notes: false,
            can_send_other_messages: false,
            can_add_web_page_previews: true
          },
          links: {
            can_send_messages: true,
            can_send_audios: true,
            can_send_documents: true,
            can_send_photos: true,
            can_send_videos: true,
            can_send_video_notes: true,
            can_send_voice_notes: true,
            can_send_other_messages: true,
            can_add_web_page_previews: false
          }
        };

        if (!presets[power]) {
          throw new Error("Use .res messages, .res media or .res links");
        }

        await tg("restrictChatMember", {
          chat_id: chatId,
          user_id: target.id,
          use_independent_chat_permissions: true,
          permissions: presets[power]
        });

        await send(chatId, `Restriction applied: ${power}`);
        return true;
      }

      default:
        return false;
    }
  } catch (error) {
    await send(chatId, `⚠️ ${error.message}`);
    return true;
  }
}

async function funCommand(msg, cmd, args) {
  const chatId = msg.chat.id;
  const target = msg.reply_to_message?.from;

  if (cmd === "setintro") {
    if (!args) {
      await send(chatId, "Use: /setintro I love music");
      return true;
    }

    await db().ref(`misstiUsers/${msg.from.id}`)
      .update({ intro: args.slice(0, 500) });

    await send(chatId, "Intro save ho gaya 😎");
    return true;
  }

  if (cmd === "intro") {
    const user = target || msg.from;
    const snap = await db()
      .ref(`misstiUsers/${user.id}/intro`)
      .once("value");

    await send(chatId, snap.val()
      ? `${user.first_name || "User"} ka intro:\n${snap.val()}`
      : "Intro abhi set nahi hai.");

    return true;
  }

  const interactions = {
    kiss: "😘 Flying kiss to",
    hug: "🫂 Warm hug to",
    slap: "😅 Playfully slapped",
    punch: "🥊 Playfully challenged",
    bite: "😬 Playfully bit",
    murder: "🎭 Pretend-game dramatic defeat:",
    love: "💚 Sent love to",
    crush: "💘 Mystery crush:",
    look: "👀 Looking at",
    brain: "🧠 Brain score for",
    stupid_meter: "🤪 Silly-meter result for"
  };

  if (interactions[cmd]) {
    if (!target) {
      await send(chatId, `Kisi user ke message par reply karke /${cmd} bhejo.`);
      return true;
    }

    let score = "";

    if (["brain", "stupid_meter"].includes(cmd)) {
      score = `: ${Math.floor(Math.random() * 101)}/100`;
    }

    await send(chatId,
      `${interactions[cmd]} ${target.first_name || "user"}${score}!`
    );

    return true;
  }

  const games = {
    truth: [
      "Tumhari favourite memory kya hai?",
      "Kaunsa song tumhara mood achha kar deta hai?"
    ],
    dare: [
      "Kisi ko ek genuine compliment do 😄",
      "Apna favourite emoji bhejo!"
    ],
    puzzle: [
      "What has keys but no locks? A piano 🎹",
      "What gets wetter as it dries? A towel."
    ]
  };

  if (games[cmd]) {
    const list = games[cmd];
    await send(chatId, list[Math.floor(Math.random() * list.length)]);
    return true;
  }

  if (cmd === "couples") {
    const snapshot = await db()
      .ref(`misstiActiveMembers/${chatId}`)
      .once("value");

    const members = Object.entries(snapshot.val() || {})
      .filter(([id]) => Number(id) !== msg.from.id);

    if (!members.length) {
      await send(chatId, "Abhi enough active members nahi hain 💞");
      return true;
    }

    const first = members[Math.floor(Math.random() * members.length)];
    const rest = members.filter(([id]) => id !== first[0]);

    if (!rest.length) {
      await send(chatId, "Couples ke liye aur active members chahiye 💞");
      return true;
    }

    const second = rest[Math.floor(Math.random() * rest.length)];

    await send(chatId,
      `💞 Today's random couple:\n${first[1].name || first[0]} + ${second[1].name || second[0]}`
    );

    return true;
  }

  return false;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(200).send("Missti Telegram AI webhook is running.");
  }

  const required = [
    "BOT_TOKEN",
    "AI_API_URL",
    "AI_API_KEY",
    "AI_MODEL",
    "FIREBASE_DATABASE_URL",
    "FIREBASE_SERVICE_ACCOUNT_JSON"
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length) {
    return res.status(500).send(
      `Missing environment variables: ${missing.join(", ")}`
    );
  }

  if (
    TELEGRAM_WEBHOOK_SECRET &&
    req.headers["x-telegram-bot-api-secret-token"] !== TELEGRAM_WEBHOOK_SECRET
  ) {
    return res.status(401).send("Unauthorized");
  }

  try {
    const msg = req.body?.message;

    if (!msg?.chat || !msg?.from || !msg.text) {
      return res.status(200).json({ ok: true });
    }

    const text = msg.text.trim();
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const privateChat = msg.chat.type === "private";
    const groupChat = ["group", "supergroup"].includes(msg.chat.type);

    const database = db();
    const userRef = database.ref(`misstiUsers/${userId}`);
    const snapshot = await userRef.once("value");
    const profile = snapshot.val() || {};

    profile.firstName = msg.from.first_name || "dost";
    profile.username = msg.from.username || "";
    profile.name = profile.name || profile.firstName;

    const bot = await tg("getMe", {});
    const botId = bot.id;
    const botUsername = bot.username || "";

    const command = parseCommand(text);

    if (command?.cmd === "start") {
      await userRef.update(profile);

      await tg("sendVideo", {
        chat_id: chatId,
        video: WELCOME_VIDEO_URL,
        caption:
          `👋 Welcome ${profile.name} ❤️\n\n` +
          "Main Missti hoon, tumhari AI dost! 😎\n" +
          "Mujhse friendly chat kar sakte ho.\n" +
          "Private chat mein /name Misstu se apna naam set karo."
      });

      return res.status(200).json({ ok: true });
    }

    if (privateChat && command?.cmd === "name") {
      if (!command.args) {
        await send(chatId, "Use: /name Misstu");
      } else {
        profile.name = command.args.slice(0, 35);
        await userRef.update(profile);
        await send(chatId, `Done ${profile.name}! Naam yaad rakhungi ❤️`);
      }

      return res.status(200).json({ ok: true });
    }

    if (privateChat && command?.cmd === "newchat") {
      profile.history = [];
      profile.historyAt = Date.now();
      await userRef.set(profile);
      await send(chatId, "Purani chat history clear kar di ❤️");
      return res.status(200).json({ ok: true });
    }

    if (command) {
      if (groupChat) {
        const handled = await moderation(msg, command.cmd, command.args);
        if (handled) return res.status(200).json({ ok: true });
      }

      if (await funCommand(msg, command.cmd, command.args)) {
        return res.status(200).json({ ok: true });
      }

      if (privateChat && command.cmd === "help") {
        await send(chatId,
          "❤️ Missti Help\n" +
          "/name Misstu — naam save\n" +
          "/newchat — history clear\n" +
          "/hug /kiss /love /truth /dare /puzzle\n" +
          "/setintro aur /intro\n\n" +
          "Group: greetings, @mention ya mere message par reply."
        );
      }

      return res.status(200).json({ ok: true });
    }

    const name = getName(text);
    if (name) profile.name = name;

    if (groupChat) {
      const greeting = GREETING.test(text);
      const mention = botUsername &&
        text.toLowerCase().includes(`@${botUsername.toLowerCase()}`);
      const replyToBot = msg.reply_to_message?.from?.id === botId;

      // Remember active members even if Missti does not reply.
      await database.ref(`misstiActiveMembers/${chatId}/${userId}`)
        .set({
          name: profile.name,
          username: profile.username,
          lastActiveAt: Date.now()
        });

      await userRef.update(profile);

      if (!greeting && !mention && !replyToBot) {
        return res.status(200).json({ ok: true });
      }

      const memoryRef = database.ref(
        `misstiGroupMemory/${chatId}/${userId}`
      );

      const memorySnapshot = await memoryRef.once("value");
      const memory = memorySnapshot.val() || {};
      let history = Array.isArray(memory.history) ? memory.history : [];

      if (
        memory.lastActiveAt &&
        Date.now() - memory.lastActiveAt >= IDLE_MS
      ) {
        // Persist the trimmed history as well.
        history = history.slice(-2);

        await memoryRef.update({
          history,
          lastActiveAt: memory.lastActiveAt
        });
      }

      const cleanText = text.replace(
        new RegExp(`@${botUsername}`, "ig"),
        ""
      ).trim();

      await tg("sendChatAction", {
        chat_id: chatId,
        action: "typing"
      });

      const answer = await askAI(
        cleanText || "Reply naturally to the message.",
        profile,
        history,
        true
      );

      history.push(
        { role: "user", text, at: Date.now() },
        { role: "assistant", text: answer, at: Date.now() }
      );

      history = history.slice(-GROUP_LIMIT);

      await memoryRef.set({
        history,
        lastActiveAt: Date.now(),
        name: profile.name
      });

      await tg("sendMessage", {
        chat_id: chatId,
        text: answer,
        reply_to_message_id: msg.message_id,
        allow_sending_without_reply: true
      });

      if (Math.random() < 0.2) {
        const reactions = ["❤️", "🔥", "👍", "😂", "🥰", "👏"];

        try {
          await tg("setMessageReaction", {
            chat_id: chatId,
            message_id: msg.message_id,
            reaction: [{
              type: "emoji",
              emoji: reactions[Math.floor(Math.random() * reactions.length)]
            }]
          });
        } catch (error) {
          console.error("Reaction unavailable:", error.message);
        }
      }

      return res.status(200).json({ ok: true });
    }

    if (privateChat) {
      let history = Array.isArray(profile.history) ? profile.history : [];

      if (
        profile.historyAt &&
        Date.now() - profile.historyAt > MEMORY_MS
      ) {
        history = [];
      }

      await tg("sendChatAction", {
        chat_id: chatId,
        action: "typing"
      });

      const answer = await askAI(text, profile, history, false);

      history.push(
        { role: "user", text, at: Date.now() },
        { role: "assistant", text: answer, at: Date.now() }
      );

      profile.history = history.slice(-PRIVATE_LIMIT);
      profile.historyAt = Date.now();

      await userRef.set(profile);
      await send(chatId, answer);
    }

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error("Missti webhook error:", error);

    try {
      const msg = req.body?.message;

      if (msg?.chat?.type === "private") {
        await send(
          msg.chat.id,
          "Abhi reply nahi aa paaya 😕 Thodi der baad try karna."
        );
      }
    } catch (_) {}

    return res.status(200).json({ ok: true });
  }
};
