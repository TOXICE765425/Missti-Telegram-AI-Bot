const { config } = require("./config");
const { buildSystemPrompt } = require("../prompts/system");

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
    messages.push({
      role: h.role === "assistant" ? "assistant" : "user",
      content: String(h.text || "").slice(0, 500)
    });
  }

  // Group mein prompt thoda clear
  const finalUserText = groupMode
    ? (userText || "Haan bol") + "\n\n(Reply in max 15 words, complete sentence, Hinglish, attitude)"
    : (userText || "Haan");

  messages.push({ role: "user", content: finalUserText });

  const body = {
    model: config.groqModel,
    messages,
    temperature: groupMode ? 0.9 : 0.85,
    max_tokens: groupMode ? 120 : 1400,
    stream: false
  };

  const res = await fetch(config.groqApi, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + config.groqApiKey
    },
    body: JSON.stringify(body)
  });

  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Groq invalid JSON: " + raw.slice(0, 200));
  }

  if (!res.ok) {
    const msg = data?.error?.message || data?.message || raw.slice(0, 300);
    throw new Error("Groq API " + res.status + ": " + msg);
  }

  let answer = (
    data?.choices?.[0]?.message?.content ||
    data?.choices?.[0]?.text ||
    data?.content ||
    ""
  ).trim();

  // Empty response handling
  if (!answer) {
    // Try alternative fields
    if (data?.choices?.[0]?.message?.refusal) {
      throw new Error("Groq refused: " + String(data.choices[0].message.refusal).slice(0, 200));
    }
    console.error("Groq empty raw:", JSON.stringify(data).slice(0, 500));
    // Fallback instead of throwing hard error in group
    if (groupMode) {
      return "Haan bol na 😏 kya haal hai?";
    }
    throw new Error("Empty response from Groq");
  }

  if (groupMode) {
    const words = answer.split(/\s+/).filter(Boolean);
    if (words.length > config.groupMaxWords) {
      answer = words.slice(0, config.groupMaxWords).join(" ");
    }
    // Ensure something remains
    if (!answer.trim()) answer = "Haan 😏";
  }

  return answer;
}

module.exports = { askAI };
