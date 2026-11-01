const { config } = require("./config");
const { buildSystemPrompt } = require("../prompts/system");

const FREE_MODELS = [
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
  "gemma2-9b-it"
];

async function callGroq(model, messages, maxTokens) {
  const res = await fetch(config.groqApi, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + config.groqApiKey
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.85,
      max_tokens: maxTokens,
      stream: false
    })
  });

  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON from Groq");
  }

  if (!res.ok) {
    const msg = data?.error?.message || raw.slice(0, 200);
    const err = new Error("Groq " + res.status + ": " + msg);
    err.status = res.status;
    throw err;
  }

  return (data?.choices?.[0]?.message?.content || "").trim();
}

async function askAI(userText, history, profile, groupMode = false, groupContext = "") {
  const messages = [
    {
      role: "system",
      content: buildSystemPrompt({
        botName: config.botName,
        userName: profile.name || profile.firstName,
        groupMode,
        lastAbuse: profile.lastAbuse || "",
        groupContext: groupContext || ""
      })
    }
  ];

  const limit = groupMode ? config.groupHistoryLimit : config.privateHistoryLimit;

  // Put history clearly
  for (const h of history.slice(-limit)) {
    const t = String(h.text || "").trim();
    if (!t) continue;
    messages.push({
      role: h.role === "assistant" ? "assistant" : "user",
      content: t.slice(0, 400)
    });
  }

  let userContent = String(userText || "").trim() || "Haan bol";

  // If we have others context, remind model inside user turn too (stronger)
  if (groupMode && groupContext) {
    userContent +=
      "\n\n[Context from group Firebase]\n" +
      groupContext.slice(0, 800) +
      "\n[Use this if question is about others / kya hua / kon / kya bol raha]";
  }

  if (groupMode) {
    userContent += "\n\n(Reply 8-15 words only, complete, attitude, Hinglish)";
  }

  messages.push({ role: "user", content: userContent });

  const maxTokens = groupMode ? 90 : 1400;
  const modelsToTry = [];
  if (config.groqModel) modelsToTry.push(config.groqModel);
  for (const m of FREE_MODELS) {
    if (!modelsToTry.includes(m)) modelsToTry.push(m);
  }

  let lastError = null;
  for (const model of modelsToTry) {
    try {
      let answer = await callGroq(model, messages, maxTokens);
      if (!answer) {
        lastError = new Error("Empty from " + model);
        continue;
      }
      if (groupMode) {
        const words = answer.split(/\s+/).filter(Boolean);
        if (words.length > config.groupMaxWords) {
          answer = words.slice(0, config.groupMaxWords).join(" ");
        }
      }
      return answer;
    } catch (err) {
      lastError = err;
      if (err.status === 401 || err.status === 403) throw err;
    }
  }
  throw lastError || new Error("All models failed");
}

module.exports = { askAI };
