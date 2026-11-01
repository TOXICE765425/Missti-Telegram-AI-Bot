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
  const trimmed = history.slice(-config.privateHistoryLimit);
  await db().ref(`users/${userId}/history`).set(trimmed);
  await db().ref(`users/${userId}/lastActive`).set(Date.now());
}

async function getGroupHistory(chatId, userId) {
  const snap = await db().ref(`groups/${chatId}/memory/${userId}/history`).once("value");
  return Array.isArray(snap.val()) ? snap.val() : [];
}

async function saveGroupHistory(chatId, userId, history, name) {
  const trimmed = history.slice(-config.groupHistoryLimit);
  await db().ref(`groups/${chatId}/memory/${userId}`).set({
    history: trimmed,
    name: name || "User",
    lastActive: Date.now()
  });
}

/**
 * Build rich context of OTHER users in this group from Firebase.
 * Used when someone asks "kya hua / kon tang kar raha / kya bol raha".
 */
async function getGroupOthersContext(chatId, currentUserId) {
  const snap = await db().ref(`groups/${chatId}/memory`).once("value");
  const all = snap.val() || {};
  const rows = [];

  for (const [uid, data] of Object.entries(all)) {
    if (String(uid) === String(currentUserId)) continue;
    if (!data || !Array.isArray(data.history) || !data.history.length) continue;

    const recent = data.history.slice(-6);
    const userLines = [];
    for (const h of recent) {
      const role = h.role === "assistant" ? "Bot" : (data.name || "User");
      const t = String(h.text || "").trim();
      if (t) userLines.push(role + ": " + t.slice(0, 100));
    }
    if (!userLines.length) continue;

    rows.push({
      name: data.name || ("User" + uid),
      lastActive: data.lastActive || 0,
      text: userLines.join(" | ")
    });
  }

  rows.sort((a, b) => b.lastActive - a.lastActive);
  const top = rows.slice(0, 5);
  if (!top.length) return "";

  return top
    .map((r, i) => (i + 1) + ". " + r.name + " → " + r.text)
    .join("\n")
    .slice(0, 1500);
}

/**
 * Detect if current message is asking about others / drama in group
 */
function isAskingAboutOthers(text) {
  return /\b(kya\s*hua|kya\s*huya|kya\s*baat|kon|kaun|kaunsa|kisne|kis\s*ne|tang|pareshan|kya\s*bol|kya\s*keh|usne\s*kya|usne\s*bola|batao\s*kya|kya\s*chal|drama|larai|ladayi|jhamela)\b/i.test(
    String(text || "")
  );
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
  isAskingAboutOthers,
  updateUser,
  isBlocked,
  isGroupBlocked,
  getBotPower
};
