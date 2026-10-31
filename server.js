/**
 * Long-running server for Render / Railway / VPS / any Node host
 * For Vercel → api/webhook.js is used directly
 */

const http = require("http");
const webhook = require("./api/webhook");
const { config } = require("./lib/config");

const server = http.createServer(async (req, res) => {
  // Simple body parser
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      if (body) {
        try { req.body = JSON.parse(body); } catch { req.body = {}; }
      } else {
        req.body = {};
      }
      await webhook(req, res);
    } catch (e) {
      console.error(e);
      res.statusCode = 500;
      res.end("Internal Error");
    }
  });
});

const PORT = config.port || 3000;
server.listen(PORT, () => {
  console.log(`${config.botName} running on port ${PORT}`);
  console.log(`Webhook endpoint: http://0.0.0.0:${PORT}/api/webhook`);
});
