<!doctype html>
<html lang="ms">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>UPKK SmartKids - Admin Login</title>
  <style>
    :root{--green:#16a34a;--dark:#0f172a;--muted:#64748b;--line:#e5e7eb;--bg:#f5fff8;--card:#fff}
    *{box-sizing:border-box}body{font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;background:var(--bg);color:#10231a;margin:0;min-height:100vh;display:grid;place-items:center;padding:22px}
    .box{width:min(480px,100%);background:var(--card);border:1px solid #d9f2e3;border-radius:22px;padding:24px;box-shadow:0 16px 45px rgba(0,0,0,.08)}
    h1{margin:0 0 8px;font-size:28px}.hint{color:var(--muted);line-height:1.55}label{font-weight:800;font-size:14px}
    input{width:100%;padding:13px;border:1px solid #cbd5e1;border-radius:12px;margin:7px 0 14px;font-size:15px;background:white}
    button{width:100%;border:0;border-radius:12px;padding:13px 16px;font-weight:900;cursor:pointer;background:var(--green);color:white}
    .msg{margin-top:14px;padding:12px;border-radius:12px;background:#f1f5f9;white-space:pre-wrap}.bad{background:#fee2e2;color:#991b1b}.ok{background:#dcfce7;color:#166534}
    code{background:#f1f5f9;border-radius:8px;padding:2px 6px}
  </style>
</head>
<body>
  <main class="box">
    <h1>Admin Login</h1>
    <p class="hint">Masuk menggunakan ID admin khas. Akaun pelajar tidak boleh membuka panel admin.</p>
    <label>Admin ID</label>
    <input id="adminId" autocomplete="username" placeholder="contoh: admin" />
    <label>Password Admin</label>
    <input id="adminPassword" type="password" autocomplete="current-password" placeholder="Password admin" />
    <button onclick="loginAdmin()">Login Admin</button>
    <div id="msg" class="msg">Sedia.</div>
    <p class="hint" style="font-size:13px">Nota: Cipta akaun admin melalui <code>firebase-admin-create-admin.js</code> atau tambah rekod <code>adminAccounts</code> di Firebase.</p>
  </main>

<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js"></script>
<script src="firebase-config.js?v=1.42"></script>
<script>
firebase.initializeApp(window.UPKK_FIREBASE_CONFIG);
const db = firebase.database();
const APP_ROOT = 'apps/UPKK';
const ADMIN_SESSION_KEY = 'upkkSmartKidsAdminSession_v2';

const $ = id => document.getElementById(id);
const safeKey = s => String(s||'').trim().toLowerCase().replace(/[.#$\[\]\/]/g,'-');
function setMsg(text, type=''){ $('msg').className = 'msg ' + type; $('msg').textContent = text; }

async function sha256(text){
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2,'0')).join('');
}

async function loginAdmin(){
  try{
    const adminId = safeKey($('adminId').value);
    const password = $('adminPassword').value;
    if(!adminId || !password) return setMsg('Isi Admin ID dan password.', 'bad');

    const snap = await db.ref(APP_ROOT + '/adminAccounts/' + adminId).get();
    if(!snap.exists()) return setMsg('Admin ID tidak wujud.', 'bad');

    const admin = snap.val() || {};
    if(admin.status !== 'active') return setMsg('Akaun admin tidak aktif / ditarik sah.', 'bad');

    const passwordHash = await sha256(password);

    // Support rekod lama (password plain) dan rekod baru (passwordHash).
    // Jika rekod lama login berjaya, sistem auto-upgrade kepada passwordHash.
    if(admin.passwordHash){
      if(passwordHash !== admin.passwordHash) return setMsg('Password admin salah.', 'bad');
    }else if(admin.password){
      if(password !== admin.password) return setMsg('Password admin salah.', 'bad');
      await db.ref(APP_ROOT + '/adminAccounts/' + adminId).update({
        passwordHash,
        password: null,
        updatedAt: new Date().toISOString()
      });
    }else{
      return setMsg('Rekod admin belum lengkap. Tiada passwordHash.', 'bad');
    }

    const now = new Date();
    const expiresAtMs = Date.now() + (8 * 60 * 60 * 1000);
    const sessionId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2)) + '-' + Math.random().toString(36).slice(2);
    const sessionToken = await sha256(sessionId + ':' + adminId + ':' + passwordHash + ':' + expiresAtMs);

    await db.ref(APP_ROOT + '/adminSessions/' + sessionId).set({
      adminId,
      role: admin.role || 'admin',
      sessionToken,
      status: 'active',
      loginAt: now.toISOString(),
      expiresAt: expiresAtMs,
      userAgent: navigator.userAgent || '',
      lastSeenAt: now.toISOString()
    });

    const session = {
      sessionId,
      adminId,
      role: admin.role || 'admin',
      sessionToken,
      loginAt: now.toISOString(),
      expiresAt: expiresAtMs
    };
    localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
    await db.ref(APP_ROOT + '/adminLogs').push({action:'admin_login', adminId, sessionId, at:now.toISOString()});
    setMsg('Login berjaya. Membuka admin panel...', 'ok');
    location.href = 'admin.html';
  }catch(err){
    console.error(err);
    setMsg('Login gagal: ' + err.message, 'bad');
  }
}

try{
  const reason = sessionStorage.getItem('upkkAdminRedirectReason');
  if(reason){ sessionStorage.removeItem('upkkAdminRedirectReason'); setMsg(reason, 'bad'); }
}catch(e){}
document.addEventListener('keydown', e => {
  if(e.key === 'Enter') loginAdmin();
});
</script>
</body>
</html>
