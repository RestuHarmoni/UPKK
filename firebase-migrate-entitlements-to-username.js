/**
 * UPKK SmartKids - Migrate Entitlements to Username Subscription
 * -------------------------------------------------------------
 * Moves old trial/exam access from:
 * apps/UPKK/entitlements/{accountId}
 *
 * into new username-level path:
 * apps/UPKK/usernames/{username}/subscription
 *
 * Safe migration:
 * - Does not delete old entitlements
 * - Keeps latest/longest date if subscription already exists
 * - Allows all student profiles under the same username to share trial/exam access
 *
 * How to use:
 * 1. npm install firebase-admin
 * 2. Put serviceAccountKey.json in the same folder
 * 3. Run: node firebase-migrate-entitlements-to-username.js
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

function isFuture(iso){
  if(!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t > Date.now();
}

function later(a,b){
  const ta = new Date(a || '').getTime() || 0;
  const tb = new Date(b || '').getTime() || 0;
  return tb > ta ? b : a;
}

function buildSubscription(existing={}, entitlements={}){
  const e = entitlements || {};
  const trialUntil = later(existing.trialUntil, e.latihanTrial && e.latihanTrial.endDate);
  const examUntil = later(existing.examUntil, e.examLicense && e.examLicense.endDate);

  return {
    ...existing,
    trialActive: !!((existing.trialActive && isFuture(existing.trialUntil)) || (e.latihanTrial && e.latihanTrial.active && isFuture(e.latihanTrial.endDate))),
    trialUntil: trialUntil || '',
    trialCode: existing.trialCode || (e.latihanTrial && e.latihanTrial.code) || '',
    trialValidDays: Number(existing.trialValidDays || (e.latihanTrial && e.latihanTrial.validDays) || 30),

    examActive: !!((existing.examActive && isFuture(existing.examUntil)) || (e.examLicense && e.examLicense.active && isFuture(e.examLicense.endDate))),
    examUntil: examUntil || '',
    examCode: existing.examCode || (e.examLicense && e.examLicense.code) || '',
    examValidDays: Number(existing.examValidDays || (e.examLicense && e.examLicense.validDays) || 365),

    scope: 'username',
    migratedFrom: 'entitlements',
    migratedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

async function main(){
  const root = `apps/${APP_CODE}`;
  const [usersSnap, usernamesSnap, entSnap] = await Promise.all([
    db.ref(`${root}/users`).once('value'),
    db.ref(`${root}/usernames`).once('value'),
    db.ref(`${root}/entitlements`).once('value')
  ]);

  const users = usersSnap.val() || {};
  const usernames = usernamesSnap.val() || {};
  const entitlements = entSnap.val() || {};
  const updates = {};
  let count = 0;

  for(const [accountId, user] of Object.entries(users)){
    const username = String(user && user.username || '').trim().toLowerCase();
    if(!username) continue;

    const usernameKey = username.replace(/[.#$\[\]\/]/g, '_');
    const usernameRow = usernames[usernameKey] || usernames[username] || {};
    const existingSub = (usernameRow && typeof usernameRow === 'object' && usernameRow.subscription) ? usernameRow.subscription : {};
    const oldEnt = {
      ...(user.entitlements || {}),
      ...(entitlements[accountId] || {})
    };

    if(!oldEnt.latihanTrial && !oldEnt.examLicense && !existingSub.trialUntil && !existingSub.examUntil) continue;

    const subscription = buildSubscription(existingSub, oldEnt);

    updates[`usernames/${usernameKey}`] = {
      accountId,
      username,
      subscription
    };
    updates[`users/${accountId}/subscription`] = subscription;
    count++;
  }

  if(count){
    await db.ref(root).update(updates);
  }

  await db.ref(`${root}/adminLogs`).push({
    action: 'migrate_entitlements_to_username_subscription',
    count,
    by: 'firebase-migrate-entitlements-to-username.js',
    at: new Date().toISOString()
  });

  console.log(`✅ Migration completed. Updated username subscriptions: ${count}`);
  console.log('Old entitlements were not deleted.');
  process.exit(0);
}

main().catch(err=>{
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
