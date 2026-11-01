const { config } = require("./config");
const { buildSystemPrompt } = require("../prompts/system");

// Free / commonly available Groq models (tried in order if one fails / empty)
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
      temperature: 0.9,
      max_tokens: maxTokens,
      stream: false
    })
  });

  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON from Groq: " + raw.slice(0, 150));
  }

  if (!res.ok) {
    const msg = data?.error?.message || data?.message || raw.slice(0, 250);
    const err = new Error("Groq " + res.status + ": " + msg);
    err.status = res.status;
    err.model = model;
    throw err;
  }

  const answer = (
    data?.choices?.[0]?.message?.content ||
    data?.choices?.[0]?.text ||
    ""
  ).trim();

  return { answer, model, raw: data };
}

async function askAI(userText, history, profile, groupMode = false) {
  const messages = [
    {
      role: "system",
      content: buildSystemPrompt({
        botName: config.botName,
        userName: profile.name || profile.firstName,
        groupMode,
        lastAbuse: profile.lastAbuse || ""
      })
    }
  ];

  const limit = groupMode ? config.groupHistoryLimit : config.privateHistoryLimit;
  for (const h of history.slice(-limit)) {
    const t = String(h.text || "").trim();
    if (!t) continue;
    messages.push({
      role: h.role === "assistant" ? "assistant" : "user",
      content: t.slice(0, 600)
    });
  }

  const userContent = String(userText || "").trim() || "Haan bol";
  messages.push({
    role: "user",
    content: groupMode
      ? userContent + "\n\nReply short: max 15 words, complete, Hinglish, attitude, no AI mention."
      : userContent
  });

  const maxTokens = groupMode ? 150 : 1400;

  // Model order: env override first (if set), then free list
  const modelsToTry = [];
  if (config.groqModel) modelsToTry.push(config.groqModel);
  for (const m of FREE_MODELS) {
    if (!modelsToTry.includes(m)) modelsToTry.push(m);
  }

  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const { answer } = await callGroq(model, messages, maxTokens);

      if (answer && answer.length > 0) {
        if (groupMode) {
          const words = answer.split(/\s+/).filter(Boolean);
          if (words.length > config.groupMaxWords) {
            return words.slice(0, config.groupMaxWords).join(" ");
          }
        }
        return answer;
      }

      // empty → try next model
      lastError = new Error("Empty from model " + model);
      console.warn("Empty response from", model);
    } catch (err) {
      lastError = err;
      console.warn("Model failed:", model, err.message);
      // 401/403 = key issue, no point trying more
      if (err.status === 401 || err.status === 403) throw err;
      // continue to next model
    }
  }

  throw lastError || new Error("All Groq models failed / empty");
}

module.exports = { askAI };
