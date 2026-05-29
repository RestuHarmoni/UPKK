/**
 * UPKK SmartKids - Auto Expiry Checker
 * ---------------------------------------------------------
 * Locks expired trial/exam entitlements in Realtime Database.
 *
 * Path checked:
 * apps/UPKK/entitlements/{userId}/latihanTrial
 * apps/UPKK/entitlements/{userId}/examLicense
 *
 * How to use:
 * 1. npm install firebase-admin
 * 2. Put serviceAccountKey.json in this folder
 * 3. Run: node firebase-auto-expiry-checker.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

const DATABASE_URL = 'https://upkksmartkids-app-default-rtdb.asia-southeast1.firebasedatabase.app';
const APP_CODE = 'UPKK';

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: DATABASE_URL
});

const db = admin.database();

async function main(){
  const entRoot = `apps/${APP_CODE}/entitlements`;
  const snap = await db.ref(entRoot).once('value');
  const ents = snap.val() || {};
  const now = Date.now();
  const nowIso = new Date().toISOString();
  const updates = {};
  let count = 0;

  for(const [uid, ent] of Object.entries(ents)){
    for(const kind of ['latihanTrial','examLicense']){
      const item = ent && ent[kind];
      if(!item || item.active === false || !item.endDate) continue;
      const end = new Date(item.endDate).getTime();
      if(!Number.isNaN(end) && end < now){
        updates[`${uid}/${kind}/active`] = false;
        updates[`${uid}/${kind}/expiredAt`] = nowIso;
        count++;
      }
    }
  }

  if(count){
    await db.ref(entRoot).update(updates);
  }

  await db.ref(`apps/${APP_CODE}/adminLogs`).push({
    action:'auto_expiry_checker',
    count,
    by:'firebase-auto-expiry-checker.js',
    at:nowIso
  });

  console.log(`✅ Expiry check complete. Locked: ${count}`);
  process.exit(0);
}

main().catch(err=>{
  console.error('❌ Expiry check failed:', err);
  process.exit(1);
});
