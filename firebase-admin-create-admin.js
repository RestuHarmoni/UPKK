/**
 * UPKK SmartKids - Create / Reset Admin Account
 *
 * Cara guna:
 * 1. npm install firebase-admin
 * 2. Letak serviceAccountKey.json dalam folder projek ini.
 * 3. Edit ADMIN_ID dan ADMIN_PASSWORD di bawah.
 * 4. node firebase-admin-create-admin.js
 *
 * Password akan disimpan sebagai SHA-256 hash dalam:
 * apps/UPKK/adminAccounts/{ADMIN_ID}
 */
const admin = require('firebase-admin');
const crypto = require('crypto');
const serviceAccount = require('./serviceAccountKey.json');

const DATABASE_URL = 'https://upkksmartkids-app-default-rtdb.asia-southeast1.firebasedatabase.app'; // tukar ikut Firebase anda
const ADMIN_ID = 'admin';              // tukar jika mahu
const ADMIN_PASSWORD = 'CHANGE_ME_NOW'; // wajib tukar sebelum run

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: DATABASE_URL
});

function safeKey(s){
  return String(s || '').trim().toLowerCase().replace(/[.#$\[\]\/]/g, '-');
}
function sha256(text){
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

async function main(){
  if(!ADMIN_PASSWORD || ADMIN_PASSWORD === 'CHANGE_ME_NOW'){
    throw new Error('Sila tukar ADMIN_PASSWORD dahulu.');
  }

  const adminId = safeKey(ADMIN_ID);
  const ref = admin.database().ref(`apps/UPKK/adminAccounts/${adminId}`);
  await ref.set({
    adminId,
    role: 'admin',
    status: 'active',
    passwordHash: sha256(ADMIN_PASSWORD),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  await admin.database().ref('apps/UPKK/adminLogs').push({
    action: 'create_or_reset_admin_account',
    adminId,
    at: new Date().toISOString()
  });

  console.log(`Admin account siap: ${adminId}`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
