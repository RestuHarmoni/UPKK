/**
 * UPKK SmartKids Firebase User Reset - Admin SDK
 *
 * Cara guna:
 * 1. npm install firebase-admin
 * 2. Download service account JSON dari Firebase Console > Project Settings > Service accounts.
 * 3. Simpan sebagai serviceAccountKey.json dalam folder yang sama.
 * 4. node firebase-admin-reset-users.js
 *
 * Script ini padam data user sahaja. Bank soalan tidak disentuh.
 */
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://upkksmartkids-app-default-rtdb.asia-southeast1.firebasedatabase.app/'
});

async function resetUsers(){
  const db = admin.database();
  const appRoot = 'apps/UPKK';
  await db.ref().update({
    [`${appRoot}/users`]: null,
    [`${appRoot}/usernames`]: null,
    [`${appRoot}/results`]: null,
    [`${appRoot}/leaderboard/global`]: null,
    [`${appRoot}/leaderboard/bySubject`]: null,
    [`${appRoot}/progress`]: null,
    [`${appRoot}/examSessions`]: null,
    [`${appRoot}/entitlements`]: null,
    [`${appRoot}/redeemHistory`]: null,
    [`${appRoot}/systemCounters/student26`]: 0,
    [`${appRoot}/settings/lastUserResetAt`]: new Date().toISOString(),
    [`${appRoot}/settings/userResetVersion`]: '2026-05-28-reset-01'
  });
  console.log('DONE: User Firebase reset complete. questionBank tidak dipadam.');
}

resetUsers().then(()=>process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
