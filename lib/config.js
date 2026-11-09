const config = {
  botToken: process.env.BOT_TOKEN,
  botName: process.env.BOT_NAME || "Missti",
  ownerId: process.env.OWNER_ID,
  loggerId: process.env.LOGGER_ID,
  supportUrl: process.env.SUPPORT_URL || "https://t.me/",
  firebaseUrl: process.env.FIREBASE_DATABASE_URL,
  firebaseJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  port: Number(process.env.PORT) || 3000,

  chatApiBase: "https://misstupapachataiapi.vercel.app/api/chat",
  chatModel: "gpt-5.2",

  privateHistoryLimit: 30,
  groupHistoryLimit: 20,
  groupMaxWords: 15,

  // Selfie / photo links (hardcoded)
  photos: [
    "https://cdn.phototourl.com/member/2026-11-09-d467c9af-6115-410e-8434-dd48b745513e.jpg",
    "https://cdn.phototourl.com/member/2026-11-09-859b4ffe-a6e3-4fbb-9d75-bf6619d2ce2e.webp",
    "https://cdn.phototourl.com/member/2026-11-09-ebfd9d2f-5ef7-4a2c-ac23-5416af287b36.jpg"
  ],

  loggerPhotos: [
    "https://cdn.phototourl.com/member/2026-10-27-4fa85d9f-f13a-46d4-a240-393d8ff5be28.png",
    "https://cdn.phototourl.com/member/2026-10-27-e946f617-11e7-42ac-9250-828a75553972.jpg"
  ],

  greetingRegex: /\b(hi+|hello+|hey+|hii+|hiii+|hiya|good\s*morning|good\s*afternoon|good\s*evening|good\s*night|gm|gn|namaste|salaam|assalamualaikum|hola|bonjour|kaise\s*ho|kya\s*haal|sup|yo|wassup|start|shuru)\b/i,

  galiRegex: /\b(madarchod|bhosdike|chutiya|gandu|randi|lavde|bhenchod|mc|bc|chutiye|saale|kamina|harami|kutte|kutiya|bsdk|bhosdi|laude|bhosdika|lavda)\b/i,

  photoAskRegex: /\b(photo|pic|pics|selfie|tasveer|tasvir|image|img|send\s*pic|pic\s*bhej|photo\s*bhej|apni\s*photo|apna\s*photo|dikha\s*photo|ek\s*photo|aur\s*photo|one\s*more\s*photo|another\s*photo)\b/i
};

function validateConfig() {
  const required = ["botToken", "ownerId", "loggerId", "firebaseUrl", "firebaseJson"];
  const missing = required.filter((k) => !config[k]);
  if (missing.length) throw new Error("Missing required env: " + missing.join(", "));
}

module.exports = { config, validateConfig };
