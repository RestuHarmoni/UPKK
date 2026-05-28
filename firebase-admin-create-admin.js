/**
 * UPKK SmartKids - Create / Reset Custom Admin Account
 *
 * Login admin menggunakan Admin ID + Password dalam Firebase Realtime Database.
 * TIDAK menggunakan Firebase Authentication.
 *
 * Cara guna:
 * 1. npm install firebase-admin
 * 2. Letak serviceAccountKey.json dalam folder projek ini.
 * 3. Semak DATABASE_URL di bawah.
 * 4. node firebase-admin-create-admin.js
 *
 * Akaun default:
 * ID       : superadmin
 * Password : Admin123!
 *
 * Data akan disimpan dalam:
 * apps/UPKK/adminAccounts/{ADMIN_ID}
 */
const admin = require('firebase-admin');
const crypto = require('crypto');
const serviceAccount = require('./serviceAccountKey.json');

const DATABASE_URL = 'https://upkksmartkids-app-default-rtdb.asia-southeast1.firebasedatabase.app';
const APP_CODE = 'UPKK';

const ADMIN_ID = 'superadmin';
const ADMIN_PASSWORD = 'Admin123!';
const ADMIN_NAME = 'Super Admin';

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
  const adminId = safeKey(ADMIN_ID);
  const now = new Date().toISOString();

  if(!adminId || !ADMIN_PASSWORD){
    throw new Error('ADMIN_ID dan ADMIN_PASSWORD wajib diisi.');
  }

  const ref = admin.database().ref(`apps/${APP_CODE}/adminAccounts/${adminId}`);
  const oldSnap = await ref.once('value');
  const old = oldSnap.val() || {};

  await ref.set({
    adminId,
    username: adminId,
    role: 'admin',
    name: ADMIN_NAME,
    status: 'active',
    passwordHash: sha256(ADMIN_PASSWORD),
    createdAt: old.createdAt || now,
    updatedAt: now
  });

  await admin.database().ref(`apps/${APP_CODE}/adminLogs`).push({
    action: oldSnap.exists() ? 'reset_admin_account' : 'create_admin_account',
    adminId,
    by: 'firebase-admin-create-admin.js',
    at: now
  });

  console.log('✅ Admin account siap.');
  console.log('Path     : apps/' + APP_CODE + '/adminAccounts/' + adminId);
  console.log('Admin ID : ' + adminId);
  console.log('Password : ' + ADMIN_PASSWORD);
  console.log('Login    : /admin-login.html');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Gagal create/reset admin:', err.message);
  process.exit(1);
});
