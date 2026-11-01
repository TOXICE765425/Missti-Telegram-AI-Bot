const admin = require("firebase-admin");
const { config } = require("./config");

function db() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(config.firebaseJson)),
      databaseURL: config.firebaseUrl
    });
  }
  return admin.database();
}

async function getPrivateHistory(userId) {
  const snap = await db().ref(`users/${userId}/history`).once("value");
  return Array.isArray(snap.val()) ? snap.val() : [];
}

async function savePrivateHistory(userId, history) {
  await db().ref(`users/${userId}/history`).set(history.slice(-config.privateHistoryLimit));
  await db().ref(`users/${userId}/lastActive`).set(Date.now());
}

async function getGroupHistory(chatId, userId) {
  const snap = await db().ref(`groups/${chatId}/memory/${userId}/history`).once("value");
  return Array.isArray(snap.val()) ? snap.val() : [];
}

async function saveGroupHistory(chatId, userId, history, name) {
  await db().ref(`groups/${chatId}/memory/${userId}`).set({
    history: history.slice(-config.groupHistoryLimit),
    name: name || "",
    lastActive: Date.now()
  });
}

/**
 * Recent activity of OTHER users in this group (for cross-user awareness)
 * Returns a short text summary for the system prompt.
 */
async function getGroupOthersContext(chatId, currentUserId, limitUsers = 4) {
  const snap = await db().ref(`groups/${chatId}/memory`).once("value");
  const all = snap.val() || {};
  const entries = [];

  for (const [uid, data] of Object.entries(all)) {
    if (String(uid) === String(currentUserId)) continue;
    if (!data || !Array.isArray(data.history) || data.history.length === 0) continue;

    const lastFew = data.history.slice(-4);
    const lines = lastFew.map((h) => {
      const who = h.role === "assistant" ? "Bot" : (data.name || "User");
      return who + ": " + String(h.text || "").slice(0, 80);
    });
    entries.push({
      uid,
      name: data.name || "User",
      lastActive: data.lastActive || 0,
      lines
    });
  }

  // most recently active first
  entries.sort((a, b) => b.lastActive - a.lastActive);
  const top = entries.slice(0, limitUsers);

  if (!top.length) return "";

  return top
    .map((e) => {
      return "[" + e.name + "]\n" + e.lines.join("\n");
    })
    .join("\n\n")
    .slice(0, 1200);
}

async function updateUser(userId, data) {
  await db().ref(`users/${userId}`).update({ ...data, updatedAt: Date.now() });
}

async function isBlocked(userId) {
  return !!(await db().ref(`blocked/users/${userId}`).once("value")).val();
}

async function isGroupBlocked(chatId) {
  return !!(await db().ref(`blocked/groups/${chatId}`).once("value")).val();
}

async function getBotPower() {
  const s = (await db().ref("settings").once("value")).val() || {};
  return { privateOn: s.privateOn !== false, groupOn: s.groupOn !== false };
}

module.exports = {
  db,
  getPrivateHistory,
  savePrivateHistory,
  getGroupHistory,
  saveGroupHistory,
  getGroupOthersContext,
  updateUser,
  isBlocked,
  isGroupBlocked,
  getBotPower
};
