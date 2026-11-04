const { config } = require("./config");
const { buildSystemPrompt } = require("../prompts/system");

/**
 * Custom API (hardcoded, no API key):
 * GET https://misstupapachataiapi.vercel.app/api/chat?prompt=...&model=gpt-5.2
 */
async function callChatApi(promptText) {
  const url =
    config.chatApiBase +
    "?prompt=" +
    encodeURIComponent(promptText) +
    "&model=" +
    encodeURIComponent(config.chatModel);

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json, text/plain, */*" }
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error("Chat API " + res.status + ": " + raw.slice(0, 250));
  }

  // Try JSON first
  try {
    const data = JSON.parse(raw);
    const answer = (
      data.reply ||
      data.response ||
      data.answer ||
      data.message ||
      data.content ||
      data.text ||
      data.result ||
      data.output ||
      (data.choices && data.choices[0] && (data.choices[0].message?.content || data.choices[0].text)) ||
      ""
    );
    if (typeof answer === "string" && answer.trim()) return answer.trim();
    // sometimes whole object stringified useful fields
    if (typeof data === "string" && data.trim()) return data.trim();
  } catch {
    // plain text response
  }

  const text = String(raw || "").trim();
  if (!text) throw new Error("Empty response from Chat API");
  return text;
}

function historyToPrompt(system, history, userText, groupMode) {
  const lines = [];
  lines.push("SYSTEM:\n" + system);
  lines.push("");

  const limit = groupMode ? config.groupHistoryLimit : config.privateHistoryLimit;
  for (const h of history.slice(-limit)) {
    const t = String(h.text || "").trim();
    if (!t) continue;
    const role = h.role === "assistant" ? "ASSISTANT" : "USER";
    lines.push(role + ": " + t.slice(0, 400));
  }

  lines.push("USER: " + String(userText || "").trim());
  lines.push("");
  lines.push("ASSISTANT:");
  return lines.join("\n");
}

async function askAI(userText, history, profile, groupMode = false, groupContext = "") {
  const system = buildSystemPrompt({
    botName: config.botName,
    userName: profile.name || profile.firstName,
    groupMode,
    lastAbuse: profile.lastAbuse || "",
    groupContext: groupContext || ""
  });

  let finalUser = String(userText || "").trim() || "Haan bol";
  if (groupMode && groupContext) {
    finalUser +=
      "\n\n[Group context]\n" +
      groupContext.slice(0, 700) +
      "\n[Use if user asks kya hua / kon / kya bol raha]";
  }
  if (groupMode) {
    finalUser += "\n\n(Reply 8-15 words only, complete, match user mood)";
  }

  const prompt = historyToPrompt(system, history, finalUser, groupMode);
  let answer = await callChatApi(prompt);

  if (!answer || !answer.trim()) {
    throw new Error("Empty response from Chat API");
  }

  // Strip common prefixes if API echoes role
  answer = answer.replace(/^(ASSISTANT|BOT|AI)\s*:\s*/i, "").trim();

  if (groupMode) {
    const words = answer.split(/\s+/).filter(Boolean);
    if (words.length > config.groupMaxWords) {
      answer = words.slice(0, config.groupMaxWords).join(" ");
    }
  }

  return answer;
}

module.exports = { askAI };
