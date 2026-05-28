<!doctype html>
<html lang="ms">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>UPKK SmartKids - Firebase User Reset</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;background:#f4fff8;color:#123;margin:0;padding:24px}
    main{max-width:760px;margin:auto;background:#fff;border-radius:18px;padding:24px;box-shadow:0 10px 30px rgba(0,0,0,.08)}
    code,pre{background:#f1f5f9;border-radius:10px;padding:3px 6px}
    button{border:0;border-radius:12px;padding:14px 18px;font-weight:700;cursor:pointer}
    .danger{background:#dc2626;color:white}.secondary{background:#e2e8f0;color:#0f172a}
    input{width:100%;box-sizing:border-box;padding:14px;border:1px solid #cbd5e1;border-radius:12px;margin:8px 0 16px;font-size:16px}
    .log{white-space:pre-wrap;background:#0f172a;color:#e2e8f0;padding:14px;border-radius:12px;min-height:120px}
    .warn{border-left:5px solid #dc2626;background:#fff1f2;padding:12px;border-radius:12px}
  </style>
</head>
<body>
<main>
  <h1>UPKK SmartKids Firebase User Reset</h1>
  <p class="warn"><b>Amaran:</b> halaman ini akan memadam data user dalam Firebase Realtime Database. Bank soalan <code>questionBank</code> tidak dipadam.</p>
  <p>Taip <b>RESET UPKK USERS</b> untuk aktifkan butang reset.</p>
  <input id="confirmText" placeholder="RESET UPKK USERS" autocomplete="off" />
  <label><input id="deletePremium" type="checkbox" /> Padam juga premiumCodes</label>
  <br><br>
  <button class="danger" id="resetBtn" disabled>Padam User Firebase Sekarang</button>
  <button class="secondary" onclick="location.href='index.html?v=1.38'">Kembali ke App</button>
  <h3>Log</h3>
  <div id="log" class="log">Belum mula.</div>
</main>

<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js"></script>
<script src="firebase-config.js?v=1.38"></script>
<script>
(function(){
  const logBox = document.getElementById('log');
  const btn = document.getElementById('resetBtn');
  const input = document.getElementById('confirmText');
  const writeLog = msg => logBox.textContent += "\n" + msg;
  input.addEventListener('input', () => btn.disabled = input.value.trim() !== 'RESET UPKK USERS');

  btn.addEventListener('click', async () => {
    if(input.value.trim() !== 'RESET UPKK USERS') return;
    btn.disabled = true;
    logBox.textContent = 'Memulakan reset...';
    try{
      firebase.initializeApp(window.UPKK_FIREBASE_CONFIG);
      const db = firebase.database();
      const appRoot = 'apps/UPKK';
      const updates = {
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
      };
      if(document.getElementById('deletePremium').checked){
        updates[`${appRoot}/premiumCodes`] = null;
      }
      await db.ref().update(updates);
      writeLog('✅ Firebase user data berjaya dipadam.');
      writeLog('✅ Counter STU-26 diset semula kepada 0.');
      writeLog('✅ Buka index.html semula. App akan clear session/cache lama pada browser user.');
    }catch(err){
      console.error(err);
      writeLog('❌ Gagal reset: ' + (err.message || err));
      btn.disabled = false;
    }
  });
})();
</script>
</body>
</html>
