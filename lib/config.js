const GROQ_MODELS = [
  // Free tier friendly / popular models (2026)
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "llama-3.3-70b-specdec",
  "gemma2-9b-it",
  "mixtral-8x7b-32768"
];

const config = {
  botToken: process.env.BOT_TOKEN,
  groqApiKey: process.env.GROQ_API_KEY,          // ← Groq key
  groqModel: process.env.GROQ_MODEL || GROQ_MODELS[0],
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

  // Logger photos
  loggerPhotos: [
    "https://cdn.phototourl.com/member/2026-10-27-4fa85d9f-f13a-46d4-a240-393d8ff5be28.png",
    "https://cdn.phototourl.com/member/2026-10-27-e946f617-11e7-42ac-9250-828a75553972.jpg"
  ],

  greetingRegex: /\b(hi+|hello+|hey+|hii+|hiii+|hiya|good\s*morning|good\s*afternoon|good\s*evening|good\s*night|gm|gn|namaste|salaam|assalamualaikum|hola|bonjour|kaise\s*ho|kya\s*haal|sup|yo|wassup|start|shuru)\b/i,

  galiRegex: /\b(madarchod|bhosdike|chutiya|gandu|randi|lavde|bhenchod|mc|bc|chutiye|saale|kamina|harami|kutte|kutiya|bsdk|bhosdi|laude)\b/i,

  groqModels: GROQ_MODELS,
  groqApi: "https://api.groq.com/openai/v1/chat/completions"
};

function validateConfig() {
  const required = ["botToken", "groqApiKey", "ownerId", "firebaseUrl", "firebaseJson"];
  const missing = required.filter((k) => !config[k]);
  if (missing.length) {
    throw new Error(`Missing required env: ${missing.join(", ")}`);
  }
}

module.exports = { config, validateConfig };
