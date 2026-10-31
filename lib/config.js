const GROK_MODELS = [
  "grok-2-1212",
  "grok-2-vision-1212",
  "grok-3",
  "grok-3-mini",
  "grok-4",
  "grok-4-0709",
  "grok-beta",
  "grok-2",
  "grok-4.20",
  "grok-4.3",
  "grok-build-0.1"
];

const config = {
  botToken: process.env.BOT_TOKEN,
  grokApiKey: process.env.GROK_API_KEY,
  grokModel: process.env.GROK_MODEL || GROK_MODELS[0],
  botName: process.env.BOT_NAME || "Missti",
  ownerId: process.env.OWNER_ID,
  loggerId: process.env.LOGGER_ID,
  supportUrl: process.env.SUPPORT_URL || "https://t.me/",
  firebaseUrl: process.env.FIREBASE_DATABASE_URL,
  firebaseJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || "",
  port: process.env.PORT || 3000,

  // Limits
  privateHistoryLimit: 30,
  groupHistoryLimit: 20,
  groupMaxWords: 15,

  // Logger photos (rotate)
  loggerPhotos: [
    "https://cdn.phototourl.com/member/2026-10-27-4fa85d9f-f13a-46d4-a240-393d8ff5be28.png",
    "https://cdn.phototourl.com/member/2026-10-27-e946f617-11e7-42ac-9250-828a75553972.jpg"
  ],

  // Greeting triggers for group auto-reply
  greetingRegex: /\b(hi+|hello+|hey+|hii+|hiii+|hiya|good\s*morning|good\s*afternoon|good\s*evening|good\s*night|gm|gn|namaste|salaam|assalamualaikum|hola|bonjour|kaise\s*ho|kya\s*haal|sup|yo|wassup|start|shuru)\b/i,

  // Gali detection
  galiRegex: /\b(madarchod|bhosdike|chutiya|gandu|randi|lavde|bhenchod|mc|bc|chutiye|saale|kamina|harami|kutte|kutiya|bsdk|bhosdi|randi|laude)\b/i,

  grokModels: GROK_MODELS,
  grokApi: "https://api.x.ai/v1/chat/completions"
};

function validateConfig() {
  const required = ["botToken", "grokApiKey", "ownerId", "firebaseUrl", "firebaseJson"];
  const missing = required.filter((k) => !config[k]);
  if (missing.length) {
    throw new Error(`Missing required env: ${missing.join(", ")}`);
  }
}

module.exports = { config, validateConfig };
