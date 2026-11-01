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
  db, getPrivateHistory, savePrivateHistory,
  getGroupHistory, saveGroupHistory, updateUser,
  isBlocked, isGroupBlocked, getBotPower
};
