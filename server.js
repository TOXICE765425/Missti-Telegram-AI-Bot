const http = require("http");
const { config, validateConfig } = require("./lib/config");
const { tg, logToChannel } = require("./lib/telegram");
const { handleUpdate } = require("./bot");

let offset = 0;
let polling = false;
let consecutiveErrors = 0;

async function startLoggerMessage() {
  try {
    const me = await tg("getMe");
    const text =
      `» ✨${config.botName}✨ bot started :\n\n` +
      `id : <code>${me.id}</code>\n` +
      `name : ${me.first_name || config.botName}\n` +
      `username : @${me.username}\n` +
      `logger_id : <code>${config.loggerId}</code>`;
    await logToChannel(text, true);
    console.log("Startup logger message sent");
  } catch (e) {
    console.error("Startup logger failed:", e.message);
  }
}

async function pollOnce() {
  const updates = await tg("getUpdates", {
    offset,
    timeout: 25,
    allowed_updates: ["message", "edited_message", "my_chat_member"]
  });

  consecutiveErrors = 0;

  for (const update of updates) {
    offset = update.update_id + 1;
    try {
      await handleUpdate(update);
    } catch (err) {
      console.error("Update handler error:", err.message);
    }
  }
}

async function pollLoop() {
  if (polling) return;
  polling = true;

  while (true) {
    try {
      await pollOnce();
    } catch (err) {
      consecutiveErrors += 1;
      console.error("Poll error #" + consecutiveErrors + ":", err.message);

      // Network / Telegram hiccup → wait and continue (never exit)
      const wait = Math.min(15000, 2000 * consecutiveErrors);
      await new Promise((r) => setTimeout(r, wait));

      // After many failures try clearing webhook again
      if (consecutiveErrors % 10 === 0) {
        try {
          await tg("deleteWebhook", { drop_pending_updates: false });
        } catch (e) {}
      }
    }

    // tiny yield so event loop stays healthy
    await new Promise((r) => setTimeout(r, 50));
  }
}

// Health server for UptimeRobot / Render
const server = http.createServer(async (req, res) => {
  const url = (req.url || "/").split("?")[0];

  if (url === "/" || url === "/health" || url === "/ping") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end((config.botName || "Missti") + " is alive ✅");
    return;
  }

  // Optional: manual wake
  if (url === "/wake") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("wake ok");
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

// Self keep-alive (helps on some free hosts even with UptimeRobot)
function selfPing() {
  const port = config.port || 3000;
  const url = "http://127.0.0.1:" + port + "/health";
  const httpLib = require("http");
  try {
    httpLib.get(url, (r) => { r.resume(); }).on("error", () => {});
  } catch (e) {}
}

async function main() {
  try {
    validateConfig();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  // Ensure long polling mode
  try {
    await tg("deleteWebhook", { drop_pending_updates: false });
    console.log("Webhook cleared");
  } catch (e) {
    console.log("Webhook clear:", e.message);
  }

  server.listen(config.port, () => {
    console.log(config.botName + " listening on " + config.port);
  });

  await startLoggerMessage();

  // Internal keep-alive every 4 minutes
  setInterval(selfPing, 4 * 60 * 1000);

  // Never-die polling
  console.log("Long polling started");
  pollLoop().catch((err) => {
    console.error("Poll loop crashed, restarting in 3s:", err.message);
    setTimeout(() => pollLoop(), 3000);
  });
}

// Process-level safety nets
process.on("uncaughtException", (err) => {
  console.error("uncaughtException:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("unhandledRejection:", err);
});

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
