const http = require("http");
const { config, validateConfig } = require("./lib/config");
const { tg, logToChannel } = require("./lib/telegram");
const { handleUpdate } = require("./bot");

let offset = 0;
let isPolling = false;

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
    console.log("Startup message sent to logger");
  } catch (e) {
    console.error("Failed to send startup logger message:", e.message);
  }
}

async function poll() {
  if (isPolling) return;
  isPolling = true;

  try {
    const updates = await tg("getUpdates", {
      offset,
      timeout: 30,
      allowed_updates: ["message", "edited_message", "my_chat_member"]
    });

    for (const update of updates) {
      offset = update.update_id + 1;
      try {
        await handleUpdate(update);
      } catch (err) {
        console.error("Update error:", err.message);
      }
    }
  } catch (err) {
    console.error("Polling error:", err.message);
    await new Promise((r) => setTimeout(r, 3000));
  } finally {
    isPolling = false;
    setImmediate(poll);
  }
}

// Simple HTTP server for health check + UptimeRobot
const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/health" || req.url === "/ping") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end((config.botName || "Missti") + " is alive ✅");
  } else {
    res.writeHead(404);
    res.end("Not Found");
  }
});

async function main() {
  try {
    validateConfig();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  // Delete any old webhook so long polling works
  try {
    await tg("deleteWebhook", { drop_pending_updates: false });
    console.log("Webhook cleared (using long polling)");
  } catch (e) {
    console.log("Webhook clear:", e.message);
  }

  // Start HTTP server (for Render/Railway/Heroku health checks + UptimeRobot)
  server.listen(config.port, () => {
    console.log(`${config.botName} HTTP server on port ${config.port}`);
  });

  // Send startup message to logger
  await startLoggerMessage();

  // Start long polling
  console.log("Starting long polling...");
  poll();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
