const { config } = require("./config");
const { buildSystemPrompt } = require("../prompts/system");

async function askGrok(userText, history, profile, groupMode = false) {
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
      content: h.text
    });
  }

  messages.push({ role: "user", content: userText });

  const body = {
    model: config.grokModel,
    messages,
    temperature: 0.85,
    max_tokens: groupMode ? 90 : 1400,
    stream: false
  };

  const res = await fetch(config.grokApi, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.grokApiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Grok API ${res.status}: ${errText.slice(0, 400)}`);
  }

  const data = await res.json();
  let answer = data?.choices?.[0]?.message?.content?.trim() || "";

  if (!answer) throw new Error("Empty response from Grok");

  if (groupMode) {
    const words = answer.split(/\s+/);
    if (words.length > config.groupMaxWords) {
      answer = words.slice(0, config.groupMaxWords).join(" ");
    }
  }

  return answer;
}

module.exports = { askGrok };
