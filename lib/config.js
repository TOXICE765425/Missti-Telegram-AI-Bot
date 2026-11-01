const GROQ_MODELS = [
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant"
];

const config = {
  botToken: process.env.BOT_TOKEN,
  groqApiKey: process.env.GROQ_API_KEY,
  groqModel: process.env.GROQ_MODEL || "",  // optional; hardcoded free models used automatically
  botName: process.env.BOT_NAME || "Missti",
  ownerId: process.env.OWNER_ID,
  loggerId: process.env.LOGGER_ID,
  supportUrl: process.env.SUPPORT_URL || "https://t.me/",
  firebaseUrl: process.env.FIREBASE_DATABASE_URL,
  firebaseJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  port: Number(process.env.PORT) || 3000,
  privateHistoryLimit: 30,
  groupHistoryLimit: 20,
  groupMaxWords: 15,
  loggerPhotos: [
    "https://cdn.phototourl.com/member/2026-10-27-4fa85d9f-f13a-46d4-a240-393d8ff5be28.png",
    "https://cdn.phototourl.com/member/2026-10-27-e946f617-11e7-42ac-9250-828a75553972.jpg"
  ],
  greetingRegex: /\b(hi+|hello+|hey+|hii+|hiii+|hiya|good\s*morning|good\s*afternoon|good\s*evening|good\s*night|gm|gn|namaste|salaam|assalamualaikum|hola|bonjour|kaise\s*ho|kya\s*haal|sup|yo|wassup|start|shuru)\b/i,
  galiRegex: /\b(madarchod|bhosdike|chutiya|gandu|randi|lavde|bhenchod|mc|bc|chutiye|saale|kamina|harami|kutte|kutiya|bsdk|bhosdi|laude)\b/i,
  groqApi: "https://api.groq.com/openai/v1/chat/completions",
  groqModels: GROQ_MODELS
};

function validateConfig() {
  const required = [
    "botToken",
    "groqApiKey",
    "ownerId",
    "loggerId",
    "firebaseUrl",
    "firebaseJson"
  ];
  const missing = required.filter((k) => !config[k]);
  if (missing.length) {
    throw new Error("Missing required env: " + missing.join(", "));
  }
}

module.exports = { config, validateConfig };
