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
    name: name || "User",
    lastActive: Date.now()
  });
}

async function getGroupOthersContext(chatId, currentUserId) {
  const snap = await db().ref(`groups/${chatId}/memory`).once("value");
  const all = snap.val() || {};
  const rows = [];
  for (const [uid, data] of Object.entries(all)) {
    if (String(uid) === String(currentUserId)) continue;
    if (!data?.history?.length) continue;
    const recent = data.history.slice(-6);
    const lines = recent.map((h) => {
      const role = h.role === "assistant" ? "Bot" : (data.name || "User");
      return role + ": " + String(h.text || "").slice(0, 90);
    });
    rows.push({ name: data.name || "User", lastActive: data.lastActive || 0, text: lines.join(" | ") });
  }
  rows.sort((a, b) => b.lastActive - a.lastActive);
  return rows.slice(0, 5).map((r, i) => (i + 1) + ". " + r.name + " → " + r.text).join("\n").slice(0, 1500);
}

function isAskingAboutOthers(text) {
  return /\b(kya\s*hua|kya\s*huya|kon|kaun|kisne|kis\s*ne|tang|pareshan|kya\s*bol|kya\s*keh|drama|jhamela)\b/i.test(String(text || ""));
}

// Photo progression state per user
async function getPhotoState(userId) {
  const snap = await db().ref(`users/${userId}/photoState`).once("value");
  return snap.val() || { stage: 0, asks: 0, talksAfter: 0 };
}

async function setPhotoState(userId, state) {
  await db().ref(`users/${userId}/photoState`).set(state);
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
  return {
    privateOn: s.privateOn !== false,
    groupOn: s.groupOn !== false
  };
}

async function isPrivateUserOff(userId) {
  const snap = await db().ref(`settings/privateUsersOff/${userId}`).once("value");
  return !!snap.val();
}

async function isGroupIdOff(chatId) {
  const snap = await db().ref(`settings/groupsOff/${chatId}`).once("value");
  return !!snap.val();
}

module.exports = {
  db,
  getPrivateHistory,
  savePrivateHistory,
  getGroupHistory,
  saveGroupHistory,
  getGroupOthersContext,
  isAskingAboutOthers,
  getPhotoState,
  setPhotoState,
  updateUser,
  isBlocked,
  isGroupBlocked,
  getBotPower,
  isPrivateUserOff,
  isGroupIdOff
};
