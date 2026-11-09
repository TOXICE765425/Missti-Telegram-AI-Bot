/**
 * Rose-style help menu — edit same message on button click
 */
const { config } = require("./config");
const { tg } = require("./telegram");

const DOCS = {
  home: {
    text:
      `🌹 <b>${config.botName} — Help Centre</b>\n\n` +
      `AI Girlfriend + full group management.\n` +
      `Commands work with <code>/</code> or <code>!</code>\n\n` +
      `Neeche se module choose karo 👇`,
    rows: [
      ["Admin", "Antiflood", "AntiRaid"],
      ["Approval", "Bans", "Blocklists"],
      ["CAPTCHA", "Filters", "Greetings"],
      ["Locks", "Notes", "Pin"],
      ["Purges", "Reports", "Rules"],
      ["Warnings", "AI Chat", "Owner"],
      ["User", "Docs"]
    ]
  },

  Admin: {
    text: `👮 <b>Admin</b>

<code>/promote</code> — reply/username/id
<code>/demote</code> — reply/username/id
<code>/adminlist</code> — list admins
<code>/admincache</code> — refresh admin cache
<code>/anonadmin on|off</code> — anonymous admin cmds
<code>/adminerror on|off</code> — error msg for non-admins`,
    rows: [["Back"]]
  },

  Antiflood: {
    text: `🌊 <b>Antiflood</b>

<code>/flood</code> — current settings
<code>/setflood 5</code> — action after 5 msgs
<code>/setflood off</code> — disable
<code>/setfloodmode mute|ban|kick</code>
<code>/floodtimer 10m</code> — temp action time`,
    rows: [["Back"]]
  },

  AntiRaid: {
    text: `🛡 <b>AntiRaid</b>

<code>/antiraid on</code> — temp block new joins
<code>/antiraid off</code>
<code>/antiraidtime 1h</code> — raid window
<code>/raidmode</code> — status`,
    rows: [["Back"]]
  },

  Approval: {
    text: `✅ <b>Approval (Whitelist)</b>

<code>/approve</code> — whitelist user (reply/id)
<code>/unapprove</code> — remove whitelist
<code>/approval</code> — check status
<code>/approvedlist</code> — list approved`,
    rows: [["Back"]]
  },

  Bans: {
    text: `🚫 <b>Bans</b>

<code>/ban</code> — permanent ban
<code>/tban 2h</code> — temp ban (m/h/d/w)
<code>/unban</code>
<code>/kick</code>
<code>/kickme</code> — self kick
<code>/mute</code> · <code>/tmute 10m</code> · <code>/unmute</code>
<code>/sban</code> — silent ban (no msg)`,
    rows: [["Back"]]
  },

  Blocklists: {
    text: `🧱 <b>Blocklists</b>

<code>/addblocklist word</code>
<code>/rmblocklist word</code>
<code>/blocklist</code> — show list
<code>/blocklistdelete on|off</code>
<code>/blocklistmode ban|mute|warn</code>`,
    rows: [["Back"]]
  },

  CAPTCHA: {
    text: `🤖 <b>CAPTCHA</b>

<code>/captcha on|off</code>
<code>/captchamode button|math|text</code>
<code>/captchatime 2m</code>
New members must verify before chatting.`,
    rows: [["Back"]]
  },

  Filters: {
    text: `🔤 <b>Filters</b>

<code>/filter hello Hi there!</code>
<code>/stop hello</code>
<code>/filters</code> — list
Auto-reply when keyword is said.`,
    rows: [["Back"]]
  },

  Greetings: {
    text: `👋 <b>Greetings</b>

<code>/setwelcome text</code>
Variables: <code>{first}</code> <code>{chatname}</code>
<code>/welcome on|off</code>
<code>/resetwelcome</code>
<code>/setgoodbye text</code>
<code>/goodbye on|off</code>`,
    rows: [["Back"]]
  },

  Locks: {
    text: `🔒 <b>Locks</b>

<code>/lock media|photos|videos|stickers|gifs|links|forwards|games|voice|all</code>
<code>/unlock ...</code>
<code>/locks</code> — active locks
<code>/locktypes</code> — all types`,
    rows: [["Back"]]
  },

  Notes: {
    text: `📝 <b>Notes</b>

<code>/save name content</code>
<code>/get name</code> or <code>#name</code>
<code>/notes</code>
<code>/clear name</code>`,
    rows: [["Back"]]
  },

  Pin: {
    text: `📌 <b>Pin</b>

<code>/pin</code> — reply to message
<code>/unpin</code>
<code>/unpinall</code>
<code>/permapin</code> — pin without notification`,
    rows: [["Back"]]
  },

  Purges: {
    text: `🗑 <b>Purges</b>

<code>/del</code> — delete replied msg
<code>/purge</code> — delete from replied msg to here
<code>/purge 20</code> — last 20 messages`,
    rows: [["Back"]]
  },

  Reports: {
    text: `🚨 <b>Reports</b>

<code>/report</code> — reply to msg, ping admins
<code>/reports on|off</code> — enable/disable`,
    rows: [["Back"]]
  },

  Rules: {
    text: `📜 <b>Rules</b>

<code>/setrules your rules...</code>
<code>/rules</code>
<code>/resetrules</code>
<code>/privaterules on|off</code> — send rules in DM`,
    rows: [["Back"]]
  },

  Warnings: {
    text: `⚠️ <b>Warnings</b>

<code>/warn</code> · <code>/unwarn</code>
<code>/warns</code> · <code>/resetwarns</code>
<code>/warnlimit 3</code>
<code>/warnmode ban|mute|kick</code>`,
    rows: [["Back"]]
  },

  "AI Chat": {
    text: `💬 <b>AI Chat</b>

Private: real girlfriend style, mood match, adult ok.
Group: tag / reply / hello — 8-15 words.
Photo: maango, bahane ke baad bhejegi.
Gali: bot gali nahi degi — soft please.

<code>/name YourName</code>
<code>/newchat</code> — clear memory`,
    rows: [["Back"]]
  },

  Owner: {
    text: `👑 <b>Owner only</b>

<code>/admin</code>
<code>/broadcast msg</code>
<code>/broadcast group_id msg</code>
<code>/ubroadcast msg</code>
<code>/ubroadcast user_id msg</code>
<code>/bot on|off [group_id]</code>
<code>/ubot on|off [user_id]</code>
<code>/block group_id</code> · <code>/block user_id</code>
<code>/unblock</code> · <code>/gunblock</code>
<code>/user</code> · <code>/group</code> · <code>/stats</code>
<code>/kill</code> · <code>/ukill</code>`,
    rows: [["Back"]]
  },

  User: {
    text: `👤 <b>User</b>

<code>/start</code> — welcome + buttons
<code>/name YourName</code>
<code>/newchat</code>
<code>/help</code> — this menu
<code>/id</code> · <code>/info</code>`,
    rows: [["Back"]]
  },

  Docs: {
    text: `📚 <b>Docs</b>

Bot ko group mein <b>Admin</b> banao:
• Delete messages
• Ban users
• Pin messages
• Invite users

Support: env SUPPORT_URL
Coder: Owner ID button on /start`,
    rows: [["Back"]]
  }
};

function keyboardFromRows(rows) {
  return {
    inline_keyboard: rows.map((row) =>
      row.map((label) => ({
        text: label === "Back" ? "◀️ Back" : label,
        callback_data: "help:" + (label === "Back" ? "home" : label)
      }))
    )
  };
}

function page(key) {
  const p = DOCS[key] || DOCS.home;
  return {
    text: p.text,
    reply_markup: keyboardFromRows(p.rows)
  };
}

async function sendHelpMenu(chatId, messageId = null) {
  const p = page("home");
  if (messageId) {
    try {
      await tg("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: p.text,
        parse_mode: "HTML",
        reply_markup: p.reply_markup,
        disable_web_page_preview: true
      });
      return;
    } catch (e) {
      // fall through to send new
    }
  }
  await tg("sendMessage", {
    chat_id: chatId,
    text: p.text,
    parse_mode: "HTML",
    reply_markup: p.reply_markup,
    disable_web_page_preview: true
  });
}

async function handleHelpCallback(cq) {
  const data = cq.data || "";
  if (!data.startsWith("help:")) return false;

  const key = data.slice(5);
  const p = page(key);
  try {
    await tg("answerCallbackQuery", { callback_query_id: cq.id });
  } catch {}

  try {
    await tg("editMessageText", {
      chat_id: cq.message.chat.id,
      message_id: cq.message.message_id,
      text: p.text,
      parse_mode: "HTML",
      reply_markup: p.reply_markup,
      disable_web_page_preview: true
    });
  } catch (e) {
    // ignore "message is not modified"
  }
  return true;
}

module.exports = { sendHelpMenu, handleHelpCallback, page };
