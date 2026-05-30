/* UPKK SmartKids Admin Core - TASK015
   Main admin logic extracted from admin/index.html.
   This keeps the HTML lighter while preserving existing function names and Firebase paths. */

firebase.initializeApp(window.UPKK_FIREBASE_CONFIG);
const db = firebase.database();
const APP_ROOT = 'apps/UPKK';
const codeRoot = APP_ROOT + '/accessCodes';
const userRoot = APP_ROOT + '/users';
const usernameRoot = APP_ROOT + '/usernames';
const entRoot = APP_ROOT + '/entitlements';
const historyRoot = APP_ROOT + '/redeemHistory';
const adminLogRoot = APP_ROOT + '/adminLogs';
const settingsRoot = APP_ROOT + '/settings';
const paymentRoot = APP_ROOT + '/payments';
const subscriptionRoot = APP_ROOT + '/subscriptions';
const notificationRoot = APP_ROOT + '/notifications';
let paymentActionMap = {};
const ADMIN_SESSION_KEY = 'upkkSmartKidsAdminSession_v2';
let currentAdminSession = null;

const $ = id => document.getElementById(id);
const log = msg => $('log').textContent = new Date().toLocaleString('ms-MY') + ' - ' + msg;
const safeKey = s => String(s||'').trim().toUpperCase().replace(/[.#$\[\]\/]/g,'-');
const safeFirebaseKey = safeKey;
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

async function sha256(text){
  const data = new TextEncoder().encode(String(text || ''));
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2,'0')).join('');
}

function redirectAdminLogin(reason){
  try{ if(reason) sessionStorage.setItem('upkkAdminRedirectReason', reason); }catch(e){}
  location.href = 'login.html';
}
async function verifyAdminSession(){
  let session = null;
  try{ session = JSON.parse(localStorage.getItem(ADMIN_SESSION_KEY) || 'null'); }catch(e){}
  if(!session || !session.sessionId || !session.adminId || !session.sessionToken || Date.now() > Number(session.expiresAt || 0)){
    localStorage.removeItem(ADMIN_SESSION_KEY);
    redirectAdminLogin('Sesi admin tamat atau belum login.');
    return false;
  }

  const [adminSnap, sessionSnap] = await Promise.all([
    db.ref(APP_ROOT + '/adminAccounts/' + session.adminId).get(),
    db.ref(APP_ROOT + '/adminSessions/' + session.sessionId).get()
  ]);

  if(!adminSnap.exists() || !sessionSnap.exists()){
    localStorage.removeItem(ADMIN_SESSION_KEY);
    redirectAdminLogin('Akaun / sesi admin tidak wujud.');
    return false;
  }

  const admin = adminSnap.val() || {};
  const savedSession = sessionSnap.val() || {};

  if(admin.status !== 'active' || admin.role !== 'admin'){
    localStorage.removeItem(ADMIN_SESSION_KEY);
    redirectAdminLogin('Akaun admin tidak aktif.');
    return false;
  }

  if(savedSession.status !== 'active' || savedSession.adminId !== session.adminId || savedSession.sessionToken !== session.sessionToken || Date.now() > Number(savedSession.expiresAt || 0)){
    localStorage.removeItem(ADMIN_SESSION_KEY);
    redirectAdminLogin('Sesi admin tidak sah / sudah tamat.');
    return false;
  }

  await db.ref(APP_ROOT + '/adminSessions/' + session.sessionId).update({lastSeenAt:new Date().toISOString()});
  currentAdminSession = session;
  if($('adminBadge')) $('adminBadge').textContent = 'Admin: ' + session.adminId;
  await db.ref(adminLogRoot).push({action:'admin_panel_open', adminId:session.adminId, sessionId:session.sessionId, at:new Date().toISOString()});
  return true;
}
async function logoutAdmin(){
  try{
    if(currentAdminSession?.adminId){
      await db.ref(adminLogRoot).push({action:'admin_logout', adminId:currentAdminSession.adminId, at:new Date().toISOString()});
    }
  }catch(e){}
  try{
    if(currentAdminSession?.sessionId){
      await db.ref(APP_ROOT + '/adminSessions/' + currentAdminSession.sessionId).update({status:'revoked', logoutAt:new Date().toISOString()});
    }
  }catch(e){}
  localStorage.removeItem(ADMIN_SESSION_KEY);
  location.href = 'login.html';
}


function showTab(id, btn){
  document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  const button = btn || [...document.querySelectorAll('.tab')].find(b => (b.getAttribute('onclick')||'').includes("'" + id + "'"));
  if(button) button.classList.add('active');
  if($(id)) $(id).classList.add('active');
  if(id === 'codes') loadCodes();
  if(id === 'questions') loadQuestionSubjects();
  if(id === 'users') loadUsers();
  if(id === 'history') loadHistory();
  if(id === 'subscriptionSettings') loadSubscriptionSettings();
  if(id === 'payments') loadPayments();
  if(id === 'soundSettings') loadSoundSettings();
  
  if(id === 'questionNotes') loadQuestionNoteSubjects();
  if(id === 'licenseManager') loadLicenseManager(true);
  if(id === 'resultsManager') loadResultsManager();
  if(id === 'appContent') loadAppContent();
  if(id === 'settings') loadSystemControl();
  if(id === 'systemControl') loadSystemControl();
  if(id === 'examReport') { loadStudentSearchOptions().then(loadExamReport); }
}
function applyTypeDefaults(){
  const type = $('type').value;
  if(type === 'trial_30_days'){ $('validDays').value = 30; if(!$('maxUse').value || $('maxUse').value === '1') $('maxUse').value = 500; }
  if(type === 'exam_yearly'){ $('validDays').value = 365; $('maxUse').value = 1; }
  if(type === 'full_yearly'){ $('validDays').value = 365; $('maxUse').value = 1; }
}
function quickCode(kind){
  const rand = Math.random().toString(36).slice(2,6).toUpperCase();
  if(kind === 'trial'){
    $('code').value = 'TRIAL-UPKK-' + new Date().getFullYear();
    $('type').value = 'trial_30_days'; $('maxUse').value = 500; $('validDays').value = 30;
  }else{
    $('code').value = 'EXAM-' + rand + '-' + Date.now().toString(36).slice(-4).toUpperCase();
    $('type').value = 'exam_yearly'; $('maxUse').value = 1; $('validDays').value = 365;
  }
}
async function createCode(){
  const code = safeKey($('code').value);
  if(!code) return alert('Isi kod dahulu.');
  const expires = $('expiresAt').value;
  const existing = await db.ref(codeRoot + '/' + code).get();
  const data = {
    code, type:$('type').value, status:'active',
    maxUse:Number($('maxUse').value||1), used: existing.exists() ? Number(existing.val().used||0) : 0,
    validDays:Number($('validDays').value||365),
    expiresAt: expires ? new Date(expires + 'T23:59:59').toISOString() : '',
    description: $('description').value || '',
    updatedAt: new Date().toISOString(),
    createdAt: existing.exists() ? (existing.val().createdAt || new Date().toISOString()) : new Date().toISOString(),
    createdBy:'admin-panel'
  };
  await db.ref(codeRoot + '/' + code).set(data);
  await db.ref(adminLogRoot).push({action:'create_or_update_code', code, adminId:currentAdminSession?.adminId||'', at:new Date().toISOString()});
  log('Kod disimpan: ' + code); loadCodes(); loadSummary();
}
async function revokeCode(){
  const code = safeKey($('revokeCode').value);
  if(!code) return alert('Isi kod.');
  await db.ref(codeRoot + '/' + code).update({status:'revoked', revokedAt:new Date().toISOString()});
  await db.ref(adminLogRoot).push({action:'revoke_code', code, adminId:currentAdminSession?.adminId||'', at:new Date().toISOString()});
  log('Kod ditarik sah: ' + code); loadCodes(); loadSummary();
}
async function reactivateCode(){
  const code = safeKey($('revokeCode').value);
  if(!code) return alert('Isi kod.');
  await db.ref(codeRoot + '/' + code).update({status:'active', reactivatedAt:new Date().toISOString()});
  await db.ref(adminLogRoot).push({action:'reactivate_code', code, adminId:currentAdminSession?.adminId||'', at:new Date().toISOString()});
  log('Kod diaktifkan semula: ' + code); loadCodes(); loadSummary();
}
async function loadCodes(){
  const snap = await db.ref(codeRoot).get();
  const data = snap.exists() ? snap.val() : {};
  const rows = Object.entries(data).sort((a,b)=>a[0].localeCompare(b[0])).map(([code,v])=>`
    <tr><td><code>${esc(code)}</code></td><td>${esc(v.type||'-')}</td><td class="${v.status==='active'?'status-ok':'status-bad'}">${esc(v.status||'-')}</td>
    <td>${Number(v.used||0)} / ${Number(v.maxUse||0)}</td><td>${esc(v.validDays||'-')} hari</td>
    <td>${v.expiresAt?new Date(v.expiresAt).toLocaleDateString('ms-MY'):'-'}</td><td>${esc(v.description||'')}</td>
    <td><div class="actions"><button class="danger mini" onclick="$('revokeCode').value='${esc(code)}';revokeCode()">Tarik Sah</button><button class="secondary mini" onclick="$('revokeCode').value='${esc(code)}';reactivateCode()">Aktif</button></div></td></tr>`).join('');
  $('tableBox').innerHTML = `<table><thead><tr><th>Kod</th><th>Jenis</th><th>Status</th><th>Guna</th><th>Tempoh</th><th>Tamat Kod</th><th>Catatan</th><th>Aksi</th></tr></thead><tbody>${rows || '<tr><td colspan="8">Belum ada kod.</td></tr>'}</tbody></table>`;
}
function usernameSubscriptionFromIndex(indexMap={}, username=''){
  const raw = indexMap[safeKey(username)] || indexMap[String(username||'').trim().toLowerCase()] || {};
  if(raw && typeof raw === 'object') return raw.subscription || {};
  return {};
}
function dateText(iso){
  return iso ? new Date(iso).toLocaleDateString('ms-MY') : '-';
}
async function loadUsers(){
  const [usersSnap, entSnap, usernameSnap] = await Promise.all([
    db.ref(userRoot).limitToLast(200).get(),
    db.ref(entRoot).get(),
    db.ref(usernameRoot).get()
  ]);
  const users = usersSnap.exists()?usersSnap.val():{};
  const ents = entSnap.exists()?entSnap.val():{};
  const usernameIndex = usernameSnap.exists()?usernameSnap.val():{};
  const rows = Object.entries(users).sort((a,b)=>a[0].localeCompare(b[0])).map(([uid,u])=>{
    const username = u.username || '-';
    const sub = u.subscription || usernameSubscriptionFromIndex(usernameIndex, username) || {};
    const e = ents[uid] || u.entitlements || {};
    const trialUntil = sub.trialUntil || sub.latihanTrialUntil || sub.trial?.endDate || e.latihanTrial?.endDate || '';
    const examUntil = sub.examUntil || sub.examLicenseUntil || sub.exam?.endDate || e.examLicense?.endDate || '';
    const scope = (sub.scope || (sub.trialUntil || sub.examUntil ? 'username' : 'legacy')).toUpperCase();
    return `<tr><td><code>${esc(uid)}</code></td><td>${esc(username)}</td><td>${esc(u.status||u.accountStatus||'active')}</td><td>${dateText(trialUntil)}</td><td>${dateText(examUntil)}</td><td>${esc(scope)}</td></tr>`;
  }).join('');
  $('usersBox').innerHTML = `<table><thead><tr><th>User ID</th><th>Username</th><th>Status</th><th>Trial Tamat</th><th>Exam Tamat</th><th>Scope</th></tr></thead><tbody>${rows || '<tr><td colspan="6">Belum ada user.</td></tr>'}</tbody></table>`;
}
async function loadHistory(){
  const snap = await db.ref(historyRoot).limitToLast(200).get();
  const data = snap.exists()?snap.val():{};
  const rows = Object.entries(data).reverse().map(([id,v])=>`<tr><td><code>${esc(id)}</code></td><td><code>${esc(v.code||'-')}</code></td><td>${esc(v.userId||v.uid||'-')}</td><td>${esc(v.type||'-')}</td><td>${v.redeemedAt?new Date(v.redeemedAt).toLocaleString('ms-MY'):'-'}</td></tr>`).join('');
  $('historyBox').innerHTML = `<table><thead><tr><th>ID</th><th>Kod</th><th>User</th><th>Jenis</th><th>Masa</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Belum ada rekod redeem.</td></tr>'}</tbody></table>`;
}
async function loadSummary(){
  const [codes, users, hist] = await Promise.all([db.ref(codeRoot).get(), db.ref(userRoot).get(), db.ref(historyRoot).get()]);
  const codeVals = codes.exists()?Object.values(codes.val()):[];
  const activeCodes = codeVals.filter(c=>c.status==='active').length;
  const revokedCodes = codeVals.filter(c=>c.status==='revoked').length;
  $('summaryBox').innerHTML = `<table><tbody>
    <tr><th>Total Code</th><td>${codeVals.length}</td></tr>
    <tr><th>Active Code</th><td>${activeCodes}</td></tr>
    <tr><th>Revoked Code</th><td>${revokedCodes}</td></tr>
    <tr><th>Total User</th><td>${users.exists()?Object.keys(users.val()).length:0}</td></tr>
    <tr><th>Redeem History</th><td>${hist.exists()?Object.keys(hist.val()).length:0}</td></tr>
  </tbody></table>`;
}

async function revokeOldAdminSessions(){
  const snap = await db.ref(APP_ROOT + '/adminSessions').get();
  const sessions = snap.exists() ? snap.val() : {};
  const now = Date.now();
  let count = 0;
  const updates = {};
  Object.entries(sessions).forEach(([sid,s])=>{
    if(s.status === 'active' && Number(s.expiresAt||0) < now){
      updates[sid + '/status'] = 'expired';
      updates[sid + '/expiredAt'] = new Date().toISOString();
      count++;
    }
  });
  if(count) await db.ref(APP_ROOT + '/adminSessions').update(updates);
  await db.ref(adminLogRoot).push({action:'revoke_old_admin_sessions', count, adminId:currentAdminSession?.adminId||'', at:new Date().toISOString()});
  log('Sesi admin lama diproses: ' + count);
}

async function runExpiryCheck(){
  const snap = await db.ref(entRoot).get();
  const ents = snap.exists()?snap.val():{};
  const now = Date.now();
  let count = 0;
  const updates = {};
  Object.entries(ents).forEach(([uid,ent])=>{
    ['latihanTrial','examLicense'].forEach(kind=>{
      const item = ent && ent[kind];
      if(item && item.active !== false && item.endDate){
        const end = new Date(item.endDate).getTime();
        if(!Number.isNaN(end) && end < now){
          updates[uid + '/' + kind + '/active'] = false;
          updates[uid + '/' + kind + '/expiredAt'] = new Date().toISOString();
          count++;
        }
      }
    });
  });
  if(count) await db.ref(entRoot).update(updates);
  await db.ref(adminLogRoot).push({action:'run_expiry_check', count, adminId:currentAdminSession?.adminId||'', at:new Date().toISOString()});
  log('Entitlement tamat tempoh dikunci: ' + count);
}


async function changeAdminPassword(){
  const msgBox = $('passwordChangeMsg');
  const setPassMsg = (text) => { if(msgBox) msgBox.textContent = new Date().toLocaleString('ms-MY') + ' - ' + text; };

  try{
    if(!currentAdminSession || !currentAdminSession.adminId){
      setPassMsg('Sesi admin tidak sah. Sila login semula.');
      return redirectAdminLogin('Sila login semula untuk tukar password.');
    }

    const currentPassword = $('currentAdminPassword').value || '';
    const newPassword = $('newAdminPassword').value || '';
    const confirmPassword = $('confirmAdminPassword').value || '';

    if(!currentPassword || !newPassword || !confirmPassword){
      return setPassMsg('Sila isi semua ruangan password.');
    }

    if(newPassword.length < 8){
      return setPassMsg('Password baru mesti minimum 8 aksara.');
    }

    if(newPassword !== confirmPassword){
      return setPassMsg('Password baru dan pengesahan tidak sama.');
    }

    if(currentPassword === newPassword){
      return setPassMsg('Password baru tidak boleh sama dengan password semasa.');
    }

    const adminPath = APP_ROOT + '/adminAccounts/' + currentAdminSession.adminId;
    const snap = await db.ref(adminPath).get();

    if(!snap.exists()){
      setPassMsg('Akaun admin tidak dijumpai.');
      return redirectAdminLogin('Akaun admin tidak dijumpai.');
    }

    const admin = snap.val() || {};
    const currentHash = await sha256(currentPassword);
    const newHash = await sha256(newPassword);

    if(admin.passwordHash){
      if(currentHash !== admin.passwordHash){
        return setPassMsg('Password semasa salah.');
      }
    }else if(admin.password){
      if(currentPassword !== admin.password){
        return setPassMsg('Password semasa salah.');
      }
    }else{
      return setPassMsg('Rekod admin tidak lengkap. Reset melalui repair-login.html atau script admin.');
    }

    const now = new Date().toISOString();

    await db.ref(adminPath).update({
      passwordHash: newHash,
      password: null,
      passwordChangedAt: now,
      updatedAt: now
    });

    const sessionsSnap = await db.ref(APP_ROOT + '/adminSessions').get();
    const sessions = sessionsSnap.exists() ? sessionsSnap.val() : {};
    const updates = {};
    Object.entries(sessions).forEach(([sid, s]) => {
      if(s && s.adminId === currentAdminSession.adminId && sid !== currentAdminSession.sessionId && s.status === 'active'){
        updates[sid + '/status'] = 'revoked_password_changed';
        updates[sid + '/revokedAt'] = now;
      }
    });
    if(Object.keys(updates).length){
      await db.ref(APP_ROOT + '/adminSessions').update(updates);
    }

    await db.ref(adminLogRoot).push({
      action: 'admin_change_password',
      adminId: currentAdminSession.adminId,
      sessionId: currentAdminSession.sessionId,
      revokedOtherSessions: Object.keys(updates).length / 2,
      at: now
    });

    $('currentAdminPassword').value = '';
    $('newAdminPassword').value = '';
    $('confirmAdminPassword').value = '';

    setPassMsg('Password admin berjaya ditukar. Sesi admin lain sudah ditarik sah.');
  }catch(err){
    console.error(err);
    setPassMsg('Gagal tukar password: ' + err.message);
  }
}


const questionRoot = APP_ROOT + '/questionBank';
let currentQuestionIndex = -1;
let currentSubjectData = null;

function qMsg(text){
  const box = $('questionMsg');
  if(box) box.textContent = new Date().toLocaleString('ms-MY') + ' - ' + text;
}

async function loadQuestionSubjects(){
  const snap = await db.ref(questionRoot).get();
  const data = snap.exists() ? snap.val() : {};
  const subjects = Object.keys(data).sort();
  const sel = $('qmSubject');
  sel.innerHTML = subjects.map(s => `<option value="${esc(s)}">${esc(data[s].title || s)}</option>`).join('');
  if(!subjects.length){
    $('questionListBox').innerHTML = 'Belum ada subject dalam questionBank.';
    return;
  }
  if(!sel.value) sel.value = subjects[0];
  await loadQuestionsForSubject();
}

async function loadQuestionsForSubject(){
  const subject = $('qmSubject').value;
  if(!subject) return;
  const snap = await db.ref(questionRoot + '/' + subject).get();
  currentSubjectData = snap.exists() ? snap.val() : {};
  const questions = Array.isArray(currentSubjectData.questions) ? currentSubjectData.questions : [];
  const rows = questions.map((q, idx) => `
    <tr>
      <td data-label="No">${idx + 1}</td>
      <td data-label="ID"><code>${esc(q.id || '-')}</code></td>
      <td data-label="Soalan">${esc(q.qRumi || '').slice(0,120)}</td>
      <td data-label="Tahap">${esc(q.level || '-')}</td>
      <td data-label="Aksi"><button class="mini secondary" onclick="editQuestion(${idx})">Edit</button></td>
    </tr>
  `).join('');
  $('questionListBox').innerHTML = `<table><thead><tr><th>No</th><th>ID</th><th>Soalan</th><th>Tahap</th><th>Aksi</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Belum ada soalan.</td></tr>'}</tbody></table>`;
  qMsg(`Subjek ${subject} dimuatkan. Jumlah soalan: ${questions.length}`);
}

function clearQuestionForm(){
  currentQuestionIndex = -1;
  ['qId','qRumi','qJawi','optRumi0','optRumi1','optRumi2','optRumi3','optJawi0','optJawi1','optJawi2','optJawi3'].forEach(id => { if($(id)) $(id).value = ''; });
  $('qAnswer').value = '0';
  $('qLevel').value = 'mudah';
  $('qMarks').value = '1';
  $('qSection').value = 'BAHAGIAN A';
  $('qInstruction').value = 'Jawab semua soalan. Pilih jawapan yang paling tepat.';
  qMsg('Borang dikosongkan.');
}

function newQuestionForm(){
  const subject = $('qmSubject').value || 'subject';
  const questions = Array.isArray(currentSubjectData?.questions) ? currentSubjectData.questions : [];
  clearQuestionForm();
  const nextNo = String(questions.length + 1).padStart(3,'0');
  $('qId').value = `${subject}-${nextNo}`;
  qMsg('Soalan baru disediakan.');
}

function editQuestion(idx){
  const questions = Array.isArray(currentSubjectData?.questions) ? currentSubjectData.questions : [];
  const q = questions[idx];
  if(!q) return qMsg('Soalan tidak dijumpai.');
  currentQuestionIndex = idx;
  $('qId').value = q.id || '';
  $('qRumi').value = q.qRumi || '';
  $('qJawi').value = q.qJawi || '';
  const r = q.optionsRumi || [];
  const j = q.optionsJawi || [];
  [0,1,2,3].forEach(i => {
    $('optRumi'+i).value = r[i] || '';
    $('optJawi'+i).value = j[i] || '';
  });
  $('qAnswer').value = String(Number(q.answer || 0));
  $('qLevel').value = q.level || 'mudah';
  $('qMarks').value = Number(q.marks || 1);
  $('qSection').value = q.section || q.sectionRumi || 'BAHAGIAN A';
  $('qInstruction').value = q.instruction || q.instructionRumi || 'Jawab semua soalan. Pilih jawapan yang paling tepat.';
  qMsg('Edit soalan: ' + (q.id || idx));
}

function buildQuestionFromForm(){
  const id = ($('qId').value || '').trim();
  if(!id) throw new Error('ID soalan wajib diisi.');
  const optionsRumi = [0,1,2,3].map(i => $('optRumi'+i).value.trim());
  const optionsJawi = [0,1,2,3].map(i => $('optJawi'+i).value.trim());
  if(!($('qRumi').value || '').trim()) throw new Error('Soalan Rumi wajib diisi.');
  if(optionsRumi.some(v => !v)) throw new Error('Semua 4 pilihan Rumi wajib diisi.');
  return {
    id,
    qRumi: $('qRumi').value.trim(),
    qJawi: $('qJawi').value.trim(),
    optionsRumi,
    optionsJawi,
    answer: Number($('qAnswer').value || 0),
    level: $('qLevel').value || 'mudah',
    sourceNo: currentQuestionIndex >= 0 ? currentQuestionIndex + 1 : ((currentSubjectData?.questions || []).length + 1),
    marks: Number($('qMarks').value || 1),
    type: 'objective',
    section: $('qSection').value.trim() || 'BAHAGIAN A',
    instruction: $('qInstruction').value.trim() || 'Jawab semua soalan. Pilih jawapan yang paling tepat.',
    sectionRumi: $('qSection').value.trim() || 'BAHAGIAN A',
    instructionRumi: $('qInstruction').value.trim() || 'Jawab semua soalan. Pilih jawapan yang paling tepat.',
    updatedAt: new Date().toISOString(),
    updatedBy: currentAdminSession?.adminId || 'admin'
  };
}

async function saveQuestion(){
  try{
    const subject = $('qmSubject').value;
    if(!subject) throw new Error('Pilih subjek dahulu.');
    const q = buildQuestionFromForm();
    const snap = await db.ref(questionRoot + '/' + subject + '/questions').get();
    const questions = snap.exists() && Array.isArray(snap.val()) ? snap.val() : [];
    const existingIndex = questions.findIndex(item => item && item.id === q.id);
    const index = currentQuestionIndex >= 0 ? currentQuestionIndex : (existingIndex >= 0 ? existingIndex : questions.length);
    questions[index] = {...(questions[index] || {}), ...q};
    await db.ref(questionRoot + '/' + subject + '/questions').set(questions);
    await db.ref(questionRoot + '/' + subject + '/exam/targetQuestions').set(questions.length);
    await db.ref(adminLogRoot).push({action:'save_question', subject, questionId:q.id, index, adminId:currentAdminSession?.adminId||'', at:new Date().toISOString()});
    currentQuestionIndex = index;
    qMsg('Soalan berjaya disimpan: ' + q.id);
    await loadQuestionsForSubject();
  }catch(err){
    console.error(err);
    qMsg('Gagal simpan soalan: ' + err.message);
  }
}

async function deleteQuestion(){
  try{
    const subject = $('qmSubject').value;
    if(!subject) throw new Error('Pilih subjek dahulu.');
    const id = ($('qId').value || '').trim();
    if(!id) throw new Error('Pilih/isi ID soalan untuk dipadam.');
    if(!confirm('Padam soalan ' + id + '?')) return;
    const snap = await db.ref(questionRoot + '/' + subject + '/questions').get();
    const questions = snap.exists() && Array.isArray(snap.val()) ? snap.val() : [];
    const filtered = questions.filter(q => q && q.id !== id);
    await db.ref(questionRoot + '/' + subject + '/questions').set(filtered);
    await db.ref(questionRoot + '/' + subject + '/exam/targetQuestions').set(filtered.length);
    await db.ref(adminLogRoot).push({action:'delete_question', subject, questionId:id, adminId:currentAdminSession?.adminId||'', at:new Date().toISOString()});
    clearQuestionForm();
    qMsg('Soalan dipadam: ' + id);
    await loadQuestionsForSubject();
  }catch(err){
    console.error(err);
    qMsg('Gagal padam soalan: ' + err.message);
  }
}


const JAWI_DRAFT_MAP = {
  'a':'ا','b':'ب','c':'چ','d':'د','e':'','f':'ف','g':'ݢ','h':'ه','i':'ي','j':'ج','k':'ک','l':'ل','m':'م','n':'ن','o':'و','p':'ڤ','q':'ق','r':'ر','s':'س','t':'ت','u':'و','v':'ۏ','w':'و','x':'کس','y':'ي','z':'ز'
};

const JAWI_PHRASE_MAP = [
  ['allah','الله'], ['muhammad','محمد'], ['saw','ﷺ'], ['nabi','نبي'], ['rasul','رسول'],
  ['islam','اسلام'], ['iman','ايمان'], ['rukun','روكون'], ['solat','صلاة'], ['puasa','ڤواسا'],
  ['zakat','زکاة'], ['haji','حج'], ['quran','قرءان'], ['al-quran','القرءان'], ['kitab','کتاب'],
  ['malaikat','ملائکة'], ['hari','هاري'], ['kiamat','قيامت'], ['akhirat','اخيرة'],
  ['apakah','اڤاکه'], ['siapakah','سياڤاکه'], ['berapakah','براڤاکه'], ['kepada','کڤد'],
  ['dengan','دڠن'], ['yang','يڠ'], ['ialah','اياله'], ['adalah','اداله'], ['disebut','دسبوت'],
  ['diturunkan','دتورونکن'], ['wajib','واجب'], ['sifat','صيفت'], ['maksud','مقصود']
];

function basicRumiToJawi(input){
  if(!input) return '';
  let text = String(input);

  JAWI_PHRASE_MAP.forEach(([r,j]) => {
    const re = new RegExp('\\b' + r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
    text = text.replace(re, j);
  });

  return text.split(/(\s+|[.,!?;:()\-\/]+)/).map(part => {
    if(!part || /^\s+$/.test(part) || /^[.,!?;:()\-\/]+$/.test(part)) return part;
    if(/[\u0600-\u06FF]/.test(part)) return part;
    if(/[0-9]/.test(part)) return part;

    let w = part.toLowerCase();

    w = w
      .replace(/ngg/g, 'ڠݢ')
      .replace(/ng/g, 'ڠ')
      .replace(/ny/g, 'ڽ')
      .replace(/sy/g, 'ش')
      .replace(/kh/g, 'خ')
      .replace(/gh/g, 'غ')
      .replace(/zh/g, 'ذ')
      .replace(/th/g, 'ث');

    let out = '';
    for(const ch of w){
      out += JAWI_DRAFT_MAP[ch] !== undefined ? JAWI_DRAFT_MAP[ch] : ch;
    }

    out = out
      .replace(/کک/g, 'ک')
      .replace(/اا/g, 'ا')
      .replace(/يي/g, 'ي')
      .replace(/وو/g, 'و');

    return out;
  }).join('');
}

function generateJawiDraft(){
  const rumi = $('qRumi')?.value || '';
  if(!rumi.trim()){
    qMsg('Isi soalan Rumi dahulu sebelum generate Jawi.');
    return;
  }
  const draft = basicRumiToJawi(rumi);
  if(($('qJawi').value || '').trim()){
    if(!confirm('Soalan Jawi sedia ada akan diganti dengan draft baru. Teruskan?')) return;
  }
  $('qJawi').value = draft;
  qMsg('Draft Jawi dijana. Sila semak ejaan sebelum simpan.');
}

function generateOptionJawiDraft(){
  [0,1,2,3].forEach(i => {
    const src = $('optRumi'+i)?.value || '';
    const target = $('optJawi'+i);
    if(target && src.trim()){
      target.value = basicRumiToJawi(src);
    }
  });
  qMsg('Draft pilihan Jawi dijana. Sila semak sebelum simpan.');
}

function openEJawiMakmur(){
  const url = 'https://www.ejawimakmur.my/';
  window.open(url, '_blank', 'noopener,noreferrer');
  qMsg('eJawiMakmur dibuka di tab baru untuk semakan manual.');
}

async function exportQuestionBank(){
  const snap = await db.ref(questionRoot).get();
  const data = snap.exists() ? snap.val() : {};
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'questionBank-export-' + new Date().toISOString().slice(0,10) + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  await db.ref(adminLogRoot).push({action:'export_question_bank', adminId:currentAdminSession?.adminId||'', at:new Date().toISOString()});
}


/* ADMIN EXPANSION COMPLETE v3.17 */
const contentRoot = APP_ROOT + '/content';
const resultsRoot = APP_ROOT + '/results';
const examHistoryRoot = APP_ROOT + '/examHistory';
let cachedResultsRows = [];
let cachedReportRows = [];
let cachedAdminStudents = [];
function setLogBox(id,msg){ const el=$(id); if(el) el.textContent = new Date().toLocaleString('ms-MY') + ' - ' + msg; }
function reportScoreClass(pct){ pct=Number(pct||0); return pct>=80?'score-good':pct>=50?'score-mid':'score-low'; }
function monthNameMs(mm){ const names={"01":"Januari","02":"Februari","03":"Mac","04":"April","05":"Mei","06":"Jun","07":"Julai","08":"Ogos","09":"September","10":"Oktober","11":"November","12":"Disember"}; return names[String(mm||'').padStart(2,'0')] || 'Semua Bulan'; }
function cleanSearch(v){ return String(v||'').toLowerCase().replace(/\s+/g,' ').trim(); }
async function loadStudentSearchOptions(){
  const snap = await db.ref(userRoot).get();
  const users = snap.exists() ? snap.val() : {};
  cachedAdminStudents = [];
  Object.entries(users||{}).forEach(([accountId,u])=>{
    Object.entries((u&&u.students)||{}).forEach(([studentSlot,st])=>{
      cachedAdminStudents.push({accountId, username:u.username||'', studentSlot, studentName:st.name||'', label:`${st.name||'Nama belum diisi'} — ${u.username||accountId} (${studentSlot})`});
    });
  });
  const dl = $('studentSearchList');
  if(dl) dl.innerHTML = cachedAdminStudents.map(s=>`<option value="${esc(s.studentName || s.username || s.accountId)}">${esc(s.label)}</option>`).join('');
  renderStudentSuggestions($('reportSearch')?.value || '');
}
function renderStudentSuggestions(term=''){
  const box = $('studentSuggestionBox');
  if(!box) return;
  const q = cleanSearch(term);
  const list = cachedAdminStudents.filter(s=>!q || JSON.stringify(s).toLowerCase().includes(q)).slice(0,8);
  box.innerHTML = list.map(s=>`<button type="button" class="student-suggest-card" onclick="selectReportStudent('${esc(s.studentName||s.username||s.accountId)}')"><b>${esc(s.studentName||'Nama belum diisi')}</b><span>Parent: ${esc(s.username||'-')} • ${esc(s.accountId)} • ${esc(s.studentSlot)}</span><em>Pilih pelajar</em></button>`).join('');
}
function selectReportStudent(value){ if($('reportSearch')) $('reportSearch').value = value; renderStudentSuggestions(value); loadExamReport(); }

function normalizeMsPhone(v){ return String(v||'').replace(/[^0-9]/g,'').replace(/^0/,'60'); }
function waUrl(number,msg){ return 'https://wa.me/' + normalizeMsPhone(number) + '?text=' + encodeURIComponent(msg||''); }
async function loadWhatsAppSettings(){
  const snap = await db.ref(settingsRoot + '/whatsapp').get();
  const w = snap.exists()?snap.val():{};
  if($('waNumber')) $('waNumber').value = w.number || w.whatsappNumber || '';
  if($('waSupportMsg')) $('waSupportMsg').value = w.supportMessage || 'Assalamualaikum, saya perlukan bantuan UPKK SmartKids.';
  if($('waBuyMsg')) $('waBuyMsg').value = w.buyLicenseMessage || 'Assalamualaikum, saya ingin membeli lesen peperiksaan UPKK SmartKids.';
  if($('waRenewMsg')) $('waRenewMsg').value = w.renewLicenseMessage || 'Assalamualaikum, saya ingin renew lesen peperiksaan UPKK SmartKids.';
  if($('waProblemMsg')) $('waProblemMsg').value = w.problemMessage || 'Assalamualaikum, saya ingin laporkan masalah aplikasi UPKK SmartKids.';
  setLogBox('waMsg','WhatsApp settings dimuatkan.');
}
async function saveWhatsAppSettings(){
  const data={number:normalizeMsPhone($('waNumber').value),supportMessage:$('waSupportMsg').value,buyLicenseMessage:$('waBuyMsg').value,renewLicenseMessage:$('waRenewMsg').value,problemMessage:$('waProblemMsg').value,updatedAt:new Date().toISOString()};
  await db.ref(settingsRoot + '/whatsapp').update(data);
  await db.ref(adminLogRoot).push({action:'save_whatsapp_settings',adminId:currentAdminSession?.adminId||'',at:new Date().toISOString()});
  setLogBox('waMsg','WhatsApp settings disimpan.');
}
function testWhatsAppLink(type){
  const n=$('waNumber').value; const msg= type==='buy' ? $('waBuyMsg').value : type==='renew' ? $('waRenewMsg').value : $('waSupportMsg').value;
  if(!n) return alert('Isi nombor WhatsApp dahulu.'); window.open(waUrl(n,msg),'_blank','noopener,noreferrer');
}
async function loadQuestionNoteSubjects(){
  const snap=await db.ref(questionRoot).get(); const data=snap.exists()?snap.val():{}; const subjects=Object.keys(data);
  const sel=$('noteSubject'); if(sel) sel.innerHTML=subjects.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('') || '<option value="">Tiada subjek</option>';
}
async function getSubjectQuestions(subject){ const snap=await db.ref(questionRoot + '/' + subject + '/questions').get(); return snap.exists() ? snap.val() : []; }
async function saveSubjectQuestions(subject,questions){ await db.ref(questionRoot + '/' + subject + '/questions').set(questions); }
async function loadQuestionNoteList(){
  const subject=$('noteSubject').value; if(!subject) return; const qs=await getSubjectQuestions(subject);
  const rows=(Array.isArray(qs)?qs:Object.values(qs)).map((q,i)=> q && (q.note || q.internalNote || q.hideNote!==undefined) ? `<tr><td>${i+1}</td><td>${esc(q.id||q.questionId||'-')}</td><td>${esc((q.rumi||q.question||q.text||'').slice(0,90))}</td><td>${esc(q.note||q.internalNote||'')}</td><td>${q.hideNote?'Hidden':'Visible'}</td><td><button class="mini warning" onclick="toggleQuestionNote('${esc(subject)}',${i},true)">Hide</button> <button class="mini secondary" onclick="toggleQuestionNote('${esc(subject)}',${i},false)">Show</button> <button class="mini danger" onclick="removeQuestionNote('${esc(subject)}',${i})">Remove</button></td></tr>` : '').join('');
  $('questionNoteBox').innerHTML=`<table><thead><tr><th>No</th><th>ID</th><th>Soalan</th><th>Note</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${rows||'<tr><td colspan="6">Tiada note ditemui.</td></tr>'}</tbody></table>`;
}
async function toggleQuestionNote(subject,index,hide){ const qs=await getSubjectQuestions(subject); if(qs[index]) qs[index].hideNote=!!hide; await saveSubjectQuestions(subject,qs); await loadQuestionNoteList(); }
async function removeQuestionNote(subject,index){ if(!confirm('Remove note soalan ini?')) return; const qs=await getSubjectQuestions(subject); if(qs[index]){ delete qs[index].note; delete qs[index].internalNote; qs[index].hideNote=true; } await saveSubjectQuestions(subject,qs); await loadQuestionNoteList(); }
async function bulkHideQuestionNotes(){ const subject=$('noteSubject').value; if(!subject) return; const qs=await getSubjectQuestions(subject); qs.forEach(q=>{ if(q && (q.note||q.internalNote)) q.hideNote=true; }); await saveSubjectQuestions(subject,qs); await loadQuestionNoteList(); }
async function bulkRemoveQuestionNotes(){ const subject=$('noteSubject').value; if(!subject || !confirm('Remove semua note untuk subjek ini?')) return; const qs=await getSubjectQuestions(subject); qs.forEach(q=>{ if(q){ delete q.note; delete q.internalNote; q.hideNote=true; } }); await saveSubjectQuestions(subject,qs); await loadQuestionNoteList(); }
async function loadLicenseManager(all=false){
  const [usersSnap, entSnap]=await Promise.all([db.ref(userRoot).get(),db.ref(entRoot).get()]); const users=usersSnap.exists()?usersSnap.val():{}; const ents=entSnap.exists()?entSnap.val():{}; const term=String($('licenseSearch')?.value||'').toLowerCase();
  const rows=Object.entries(users).filter(([id,u])=>all || !term || id.toLowerCase().includes(term) || String(u.username||'').toLowerCase().includes(term)).map(([id,u])=>{ const e=ents[id]||u.entitlements||{}; const sub=u.subscription||{}; return `<tr><td><code>${esc(id)}</code></td><td>${esc(u.username||'-')}</td><td>${dateText(sub.trialUntil||e.latihanTrial?.endDate||'')}</td><td>${dateText(sub.examUntil||e.exam?.endDate||'')}</td><td><button class="mini" onclick="fillLicenseForm('${esc(id)}','${esc(u.username||'')}')">Pilih</button></td></tr>`; }).join('');
  $('licenseBox').innerHTML=`<table><thead><tr><th>User ID</th><th>Username</th><th>Trial Tamat</th><th>Exam Tamat</th><th>Aksi</th></tr></thead><tbody>${rows||'<tr><td colspan="5">Tiada user ditemui.</td></tr>'}</tbody></table>`;
}
function fillLicenseForm(id,username){ $('licenseUserId').value=id; $('licenseUsername').value=username; }
async function saveManualLicense(){
  const id=$('licenseUserId').value.trim(); const username=$('licenseUsername').value.trim(); const kind=$('licenseKind').value; const days=Number($('licenseDays').value||365); if(!id && !username) return alert('Isi User ID atau Username.');
  const until=new Date(Date.now()+days*86400000).toISOString(); const data={updatedAt:new Date().toISOString(),scope:'username'}; if(kind==='trial') data.trialUntil=until; if(kind==='exam') data.examUntil=until; if(kind==='full'){data.trialUntil=until; data.examUntil=until;}
  if(id) await db.ref(userRoot + '/' + safeFirebaseKey(id) + '/subscription').update(data);
  if(username) await db.ref(usernameRoot + '/' + safeKey(username) + '/subscription').update(data);
  await db.ref(adminLogRoot).push({action:'manual_license_update',id,username,kind,days,adminId:currentAdminSession?.adminId||'',at:new Date().toISOString()});
  setLogBox('licenseMsg','License/Trial dikemaskini sehingga ' + dateText(until)); await loadLicenseManager(true);
}
async function loadResultsManager(){
  const snap=await db.ref(resultsRoot).get(); const data=snap.exists()?snap.val():{}; const term=String($('resultSearch')?.value||'').toLowerCase(); cachedResultsRows=[];
  Object.entries(data).forEach(([key,val])=>{ const list=Array.isArray(val)?val:Object.values(val||{}); list.forEach((r,i)=>{ if(typeof r==='object'){ const row={key,attempt:i+1,studentName:r.studentName||r.name||'',subject:r.subject||'',score:r.score??r.percent??'',type:r.type||'',date:r.at||r.date||r.createdAt||''}; const hay=JSON.stringify(row).toLowerCase(); if(!term || hay.includes(term)) cachedResultsRows.push(row); } }); });
  const rows=cachedResultsRows.slice(-300).reverse().map(r=>`<tr><td><code>${esc(r.key)}</code></td><td>${esc(r.studentName)}</td><td>${esc(r.subject)}</td><td>${esc(r.type)}</td><td>${esc(r.score)}</td><td>${r.date?new Date(r.date).toLocaleString('ms-MY'):'-'}</td></tr>`).join('');
  $('resultBox').innerHTML=`<table><thead><tr><th>Result Key</th><th>Pelajar</th><th>Subjek</th><th>Jenis</th><th>Markah</th><th>Tarikh</th></tr></thead><tbody>${rows||'<tr><td colspan="6">Belum ada result.</td></tr>'}</tbody></table>`;
}
function downloadCSV(filename, rows){ const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n'); const blob=new Blob([csv],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url); }
function exportResultsCSV(){ downloadCSV('upkk-results-'+new Date().toISOString().slice(0,10)+'.csv', [['Result Key','Attempt','Pelajar','Subjek','Jenis','Markah','Tarikh'],...cachedResultsRows.map(r=>[r.key,r.attempt,r.studentName,r.subject,r.type,r.score,r.date])]); }
function openParentPasswordReset(){ alert('Isi Username Parent, Password Parent dan Result Key di kotak sebelah kanan, kemudian tekan Sahkan & Reset.'); }
async function confirmParentPassword(username,password){
  const snap=await db.ref(userRoot).get(); const users=snap.exists()?snap.val():{}; const entry=Object.entries(users).find(([id,u])=>String(u.username||id).toLowerCase()===String(username||'').toLowerCase()); if(!entry) return false; const u=entry[1]||{};
  if(u.password && String(u.password)===String(password)) return true; if(u.pin && String(u.pin)===String(password)) return true; return false;
}
async function confirmResetResultWithParentPassword(){
  const username=$('parentConfirmUsername').value.trim(); const pass=$('parentConfirmPassword').value; const key=$('resetResultKey').value.trim(); if(!username||!pass||!key) return setLogBox('resetMsg','Isi username, password dan result key.');
  const ok=await confirmParentPassword(username,pass); if(!ok) return setLogBox('resetMsg','Password parent salah atau user tidak ditemui.'); if(!confirm('Reset/padam result key ini? Rekod ini akan dibuang dari node results.')) return;
  await db.ref(resultsRoot + '/' + safeFirebaseKey(key)).remove(); await db.ref(adminLogRoot).push({action:'reset_result_with_parent_password',key,username,adminId:currentAdminSession?.adminId||'',at:new Date().toISOString()}); setLogBox('resetMsg','Result berjaya direset.'); await loadResultsManager();
}
async function loadAppContent(){ const snap=await db.ref(contentRoot).get(); const c=snap.exists()?snap.val():{}; $('contentBanner').value=c.banner||''; $('contentPopup').value=c.popupNotice||''; $('contentMotivation').value=Array.isArray(c.motivation)?c.motivation.join('\n'):(c.motivation||''); $('contentPreview').textContent=JSON.stringify(c,null,2)||'Tiada content.'; }
async function saveAppContent(){ const data={banner:$('contentBanner').value,popupNotice:$('contentPopup').value,motivation:String($('contentMotivation').value||'').split('\n').map(x=>x.trim()).filter(Boolean),updatedAt:new Date().toISOString()}; await db.ref(contentRoot).update(data); setLogBox('contentMsg','App content disimpan.'); await loadAppContent(); }
function firebaseDateTimeLocal(v){ if(!v) return ''; const d=new Date(v); if(isNaN(d.getTime())) return ''; const pad=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function dateTimeLocalToIso(id){ const v=$(id)?.value||''; return v ? new Date(v).toISOString() : ''; }
async function loadSystemControl(){ const snap=await db.ref(settingsRoot + '/systemControl').get(); const s=snap.exists()?snap.val():{}; $('sysMaintenance').value=String(!!s.maintenanceMode); $('sysMaintenanceTitle').value=s.maintenanceTitle||'Sistem Sedang Diselenggara'; $('sysMaintenanceMsg').value=s.maintenanceMessage||'Kami sedang membuat penambahbaikan sistem. Sila cuba semula sebentar lagi.'; $('sysMaintenanceStart').value=firebaseDateTimeLocal(s.maintenanceStart); $('sysMaintenanceEnd').value=firebaseDateTimeLocal(s.maintenanceEnd); $('sysVersionNotice').value=s.versionNotice||''; $('sysForceNotice').value=s.forceRefreshNotice||'Versi baru tersedia. Sila refresh aplikasi.'; setLogBox('systemMsg', s.maintenanceMode ? 'Maintenance sedang ON. User biasa akan nampak paparan maintenance.' : 'Maintenance OFF. Web dibuka kepada user biasa.'); }
async function saveSystemControl(){ const data={maintenanceMode:$('sysMaintenance').value==='true',maintenanceTitle:$('sysMaintenanceTitle').value.trim()||'Sistem Sedang Diselenggara',maintenanceMessage:$('sysMaintenanceMsg').value.trim()||'Kami sedang membuat penambahbaikan sistem. Sila cuba semula sebentar lagi.',maintenanceStart:dateTimeLocalToIso('sysMaintenanceStart'),maintenanceEnd:dateTimeLocalToIso('sysMaintenanceEnd'),allowAdminBypass:true,versionNotice:$('sysVersionNotice').value,forceRefreshNotice:$('sysForceNotice').value,updatedAt:new Date().toISOString(),updatedBy:currentAdminSession?.adminId||''}; await db.ref(settingsRoot + '/systemControl').update(data); await db.ref(adminLogRoot).push({action:data.maintenanceMode?'maintenance_on':'maintenance_off',adminId:currentAdminSession?.adminId||'',at:new Date().toISOString()}); setLogBox('systemMsg',data.maintenanceMode?'Maintenance ON disimpan. User biasa kini disekat.':'Maintenance OFF disimpan. Web dibuka semula.'); }
async function quickMaintenanceOn(){ $('sysMaintenance').value='true'; if(!$('sysMaintenanceTitle').value.trim()) $('sysMaintenanceTitle').value='Sistem Sedang Diselenggara'; if(!$('sysMaintenanceMsg').value.trim()) $('sysMaintenanceMsg').value='Kami sedang membuat penambahbaikan sistem. Sila cuba semula sebentar lagi.'; await saveSystemControl(); }
async function quickMaintenanceOff(){ $('sysMaintenance').value='false'; await saveSystemControl(); }
async function bumpForceRefreshVersion(){ await db.ref(settingsRoot + '/systemControl').update({forceRefreshVersion:Date.now(),forceRefreshNotice:$('sysForceNotice').value,updatedAt:new Date().toISOString(),updatedBy:currentAdminSession?.adminId||''}); setLogBox('systemMsg','Force refresh version dinaikkan.'); }
function normalizeReportDate(raw){
  if(!raw) return new Date();
  if(raw instanceof Date) return raw;
  const direct = new Date(raw);
  if(!isNaN(direct.getTime())) return direct;
  const m = String(raw).match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if(m) return new Date(Number(m[3]), Number(m[2])-1, Number(m[1]));
  return new Date();
}
function normalizeExamReportRow(r,key,attempt,source){
  if(!r || typeof r !== 'object') return null;
  const type = String(r.type || r.quizType || '').toLowerCase();
  const subject = r.subject || r.title || r.subjectKey || '';
  const d = normalizeReportDate(r.createdAt || r.rawCreatedAt || r.at || r.date || r.completedAt);
  const score = Number(r.score ?? r.percent ?? 0);
  const total = Number(r.total ?? r.totalQuestions ?? r.questions ?? 100) || 100;
  const percent = Number(r.percent ?? Math.round((score/Math.max(total,1))*100));
  return {
    key, attempt, source,
    accountId: r.accountId || r.parentId || '',
    username: r.username || r.accountUsername || r.parentUsername || '',
    studentSlot: r.studentSlot || r.studentId || '',
    studentName: r.studentName || r.name || key || '',
    subject, type: r.type || (type.includes('exam') ? 'Peperiksaan' : 'Peperiksaan'),
    score, total, percent,
    date: d.toISOString().slice(0,10),
    monthKey: d.toISOString().slice(0,7),
    createdAt: d.toISOString(),
    migrated: !!r.migrated
  };
}
async function collectExamReportRows(){
  const rows=[];
  const [resSnap, histSnap, usersSnap] = await Promise.all([db.ref(resultsRoot).get(), db.ref(examHistoryRoot).get(), db.ref(userRoot).get()]);
  const res=resSnap.exists()?resSnap.val():{};
  Object.entries(res||{}).forEach(([key,val])=>{ const list=Array.isArray(val)?val:Object.values(val||{}); list.forEach((r,i)=>{ const row=normalizeExamReportRow(r,key,i+1,'results'); if(row) rows.push(row); }); });
  const hist=histSnap.exists()?histSnap.val():{};
  Object.entries(hist||{}).forEach(([accountId,students])=>Object.entries(students||{}).forEach(([studentSlot,years])=>Object.entries(years||{}).forEach(([yy,months])=>Object.entries(months||{}).forEach(([mm,items])=>{ const list=Array.isArray(items)?items:Object.values(items||{}); list.forEach((r,i)=>{ const row=normalizeExamReportRow({...r,accountId,studentSlot},`${accountId}_${studentSlot}`,i+1,'examHistory'); if(row) rows.push(row); }); }))));
  const users=usersSnap.exists()?usersSnap.val():{};
  Object.entries(users||{}).forEach(([accountId,u])=>Object.entries((u&&u.students)||{}).forEach(([studentSlot,st])=>{
    const localHist = st.history || st.historyCache || {};
    const list=Array.isArray(localHist)?localHist:Object.values(localHist||{});
    list.forEach((r,i)=>{ if(String(r?.type||'').toLowerCase().includes('exam') || String(r?.type||'').toLowerCase().includes('peperiksaan')){ const row=normalizeExamReportRow({...r,accountId,studentSlot,username:u.username||'',studentName:st.name||r.studentName},`${accountId}_${studentSlot}`,i+1,'studentHistory'); if(row) rows.push(row); } });
  }));
  const unique=new Map();
  rows.forEach(r=>{ const k=[r.accountId,r.username,r.studentSlot,r.studentName,r.subject,r.score,r.total,r.date,r.source].join('|'); if(!unique.has(k)) unique.set(k,r); });
  return Array.from(unique.values()).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
}
async function loadExamReport(){
  await loadStudentSearchOptions().catch(()=>{});
  const year=String($('reportYear').value||new Date().getFullYear());
  const month=$('reportMonth').value;
  const term=cleanSearch($('reportSearch').value||'');
  const allRows = await collectExamReportRows();
  cachedReportRows=allRows.filter(r=>{
    if(!String(r.monthKey||'').startsWith(year)) return false;
    if(month && String(r.monthKey||'').slice(5,7)!==month) return false;
    const hay=[r.key,r.accountId,r.username,r.studentSlot,r.studentName,r.subject,r.type,r.date,r.source].join(' ').toLowerCase();
    return !term || hay.includes(term);
  });
  const total=cachedReportRows.length;
  const avg=total?Math.round(cachedReportRows.reduce((a,b)=>a+Number(b.percent||0),0)/total):0;
  const high=total?Math.max(...cachedReportRows.map(r=>Number(r.percent||0))):0;
  const low=total?Math.min(...cachedReportRows.map(r=>Number(r.percent||0))):0;
  const students=new Set(cachedReportRows.map(r=>r.key)).size;
  const migrated=cachedReportRows.filter(r=>r.migrated).length;
  const monthLabel = month ? monthNameMs(month) : 'Tahunan';
  const selectedStudent = term ? ($('reportSearch').value||'Semua Pelajar') : 'Semua Pelajar';
  const byStudent = {};
  cachedReportRows.forEach(r=>{ const k=r.key||r.studentName||'unknown'; byStudent[k]=byStudent[k]||{name:r.studentName||'-',username:r.username||'-',count:0,total:0,high:0}; byStudent[k].count++; byStudent[k].total+=Number(r.percent||0); byStudent[k].high=Math.max(byStudent[k].high,Number(r.percent||0)); });
  const studentSummary = Object.values(byStudent).sort((a,b)=>b.count-a.count).slice(0,6).map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.username)}</td><td>${s.count}</td><td>${Math.round(s.total/Math.max(s.count,1))}%</td><td>${s.high}%</td></tr>`).join('');
  const rows=cachedReportRows.map((r,idx)=>`<tr><td>${idx+1}</td><td>${esc(r.date)}</td><td>${esc(r.username||'-')}</td><td>${esc(r.studentName)}</td><td>${esc(r.subject)}</td><td>${esc(r.type)}</td><td>${esc(r.score)}/${esc(r.total)}</td><td><span class="score-pill ${reportScoreClass(r.percent)}">${esc(r.percent)}%</span></td><td>${esc(r.source)}${r.migrated?' • migrated':''}</td></tr>`).join('');
  $('examReportBox').innerHTML=`<div id="upkkPrintableReport" class="report-template">
    <div class="report-cover"><img src="../assets/images/logo.webp" class="report-logo-img" alt="UPKK SmartKids"/><span class="report-chip">UPKK SmartKids Official Report</span><h2>Laporan Peperiksaan ${esc(monthLabel)} ${esc(year)}</h2><p>Template laporan A4 untuk rekod bulanan/tahunan pelajar, jumlah attempt, purata markah dan prestasi peperiksaan.</p></div>
    <div class="report-meta-grid"><div><b>Pelajar</b><span>${esc(selectedStudent)}</span></div><div><b>Tempoh</b><span>${esc(monthLabel)} ${esc(year)}</span></div><div><b>Dijana</b><span>${new Date().toLocaleDateString('ms-MY')}</span></div><div><b>Sistem</b><span>UPKK SmartKids</span></div></div>
    <div class="report-summary"><div><b>${total}</b><span>Jumlah Exam</span></div><div><b>${students}</b><span>Pelajar</span></div><div><b>${avg}%</b><span>Purata</span></div><div><b>${high}%</b><span>Tertinggi</span></div><div><b>${total?low:0}%</b><span>Terendah</span></div></div>
    <div class="report-section-title"><div><h3>Ringkasan Pelajar</h3><p>Senarai pelajar paling aktif dalam filter semasa.</p></div><span class="admin-badge">${migrated} Migrated</span></div>
    <div class="report-table-wrap"><table><thead><tr><th>Pelajar</th><th>Parent</th><th>Jumlah Exam</th><th>Purata</th><th>Tertinggi</th></tr></thead><tbody>${studentSummary||'<tr><td colspan="5">Tiada ringkasan pelajar.</td></tr>'}</tbody></table></div>
    <div class="report-section-title"><div><h3>Rekod Peperiksaan</h3><p>Butiran setiap attempt peperiksaan mengikut tarikh.</p></div></div>
    <div class="report-table-wrap"><table><thead><tr><th>No</th><th>Tarikh</th><th>Parent</th><th>Pelajar</th><th>Subjek</th><th>Jenis</th><th>Markah</th><th>%</th><th>Sumber</th></tr></thead><tbody>${rows||'<tr><td colspan="9">Tiada rekod ditemui. Tekan Auto Detect Rekod Lama jika ada result lama, atau pastikan pelajar tamat peperiksaan selepas update.</td></tr>'}</tbody></table></div>
    <div class="report-footer"><span>Generated: ${new Date().toLocaleString('ms-MY')}</span><span class="report-watermark">UPKK SmartKids</span></div>
  </div>`;
  if($('reportMsg')) $('reportMsg').textContent = total ? `Report berjaya dimuatkan: ${total} rekod. Tekan Download / Print PDF untuk simpan A4.` : 'Tiada rekod. Cuba Auto Detect Rekod Lama atau pastikan pelajar tamat peperiksaan selepas update.';
}
function downloadExamReportCSV(){ downloadCSV('upkk-exam-report-'+new Date().toISOString().slice(0,10)+'.csv', [['Result Key','Attempt','Parent','Pelajar','Subjek','Jenis','Markah','Total','Percent','Tarikh','Sumber','Migrated'],...cachedReportRows.map(r=>[r.key,r.attempt,r.username,r.studentName,r.subject,r.type,r.score,r.total,r.percent,r.date,r.source,r.migrated])]); }
function printExamReportPDF(){
  if(!cachedReportRows.length) return alert('Generate Report dahulu sebelum download/print PDF.');
  const node = document.getElementById('upkkPrintableReport');
  if(!node) return alert('Report belum dijana.');
  const css = document.querySelector('style').textContent;
  const w = window.open('', '_blank');
  w.document.write(`<!doctype html><html><head><title>UPKK SmartKids A4 Report</title><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="assets/admin-panel.css?v=3.66-task015-admin-modular" />
</head><body><main class="print-area">${node.outerHTML}</main><script>window.onload=()=>setTimeout(()=>{window.print()},450)<\/script></body></html>`);
  w.document.close();
}
async function migrateExistingExamResultsToHistory(){
  if(!confirm('Auto detect rekod lama akan scan results dan history pelajar sedia ada, kemudian salin ke examHistory sebagai migrated:true. Teruskan?')) return;
  const rows = await collectExamReportRows();
  let count=0; const updates={};
  rows.forEach(r=>{
    if(!r || r.source==='examHistory') return;
    const accountId=safeFirebaseKey(r.accountId || String(r.key||'').split('_')[0] || 'unknown');
    const studentSlot=safeFirebaseKey(r.studentSlot || String(r.key||'').split('_').slice(1).join('_') || 'student_1');
    const monthKey = r.monthKey || String(r.date).slice(0,7); const [yy,mm]=monthKey.split('-');
    const migrateKey = safeFirebaseKey([r.source,r.date,r.subject,r.score,r.total].join('_'));
    updates[`${accountId}/${studentSlot}/${yy}/${mm}/${migrateKey}`] = {...r,migrated:true,source:'migration',migratedAt:new Date().toISOString()}; count++;
  });
  if(!count) { if($('reportMsg')) $('reportMsg').textContent='Tiada rekod lama untuk migrasi.'; return; }
  await db.ref(examHistoryRoot).update(updates);
  await db.ref(adminLogRoot).push({action:'migrate_exam_history',count,adminId:currentAdminSession?.adminId||'',at:new Date().toISOString()});
  if($('reportMsg')) $('reportMsg').textContent=`Migrasi siap: ${count} rekod lama disalin ke examHistory.`;
  await loadExamReport();
}



const soundSettingsRoot = APP_ROOT + '/settings/sound';
const SOUND_TONE_OPTIONS = {
  click: 'tone:click',
  correct: 'tone:correct',
  wrong: 'tone:wrong',
  switch: 'tone:switch',
  avatar: 'tone:avatar',
  examStart: 'tone:examStart',
  examFinish: 'tone:examFinish'
};
const LOCAL_AUDIO_SLOTS = {
  '': 'Tiada MP3 / guna tone fallback',
  UI_CLICK: 'UI - Click',
  UI_TAB_SWITCH: 'UI - Tab Switch',
  UI_PAGE_OPEN: 'UI - Page Open',
  UI_NOTIFICATION: 'UI - Notification',
  QUIZ_CORRECT: 'Quiz - Jawapan Betul',
  QUIZ_WRONG: 'Quiz - Jawapan Salah',
  QUIZ_FINISH: 'Quiz - Tamat Latihan',
  EXAM_START: 'Exam - Mula Peperiksaan',
  EXAM_WARNING: 'Exam - Amaran Masa',
  EXAM_FINISH: 'Exam - Tamat Peperiksaan',
  EXAM_SUBMIT: 'Exam - Submit',
  ACHIEVEMENT_UNLOCK: 'Achievement - Unlock',
  STREAK_REWARD: 'Achievement - Streak',
  REWARD: 'Achievement - Reward',
  VOICE_WELCOME: 'Voice - Selamat Datang',
  VOICE_CORRECT: 'Voice - Betul',
  VOICE_WRONG: 'Voice - Cuba Lagi',
  VOICE_CONGRATS: 'Voice - Tahniah',
  VOICE_EXAM_FINISH: 'Voice - Tamat Peperiksaan'
};
const LOCAL_AUDIO_PATHS = {
  UI_CLICK: '../assets/audio/ui/click.mp3',
  UI_TAB_SWITCH: '../assets/audio/ui/tab-switch.mp3',
  UI_PAGE_OPEN: '../assets/audio/ui/open-page.mp3',
  UI_NOTIFICATION: '../assets/audio/ui/notification.mp3',
  QUIZ_CORRECT: '../assets/audio/quiz/correct.mp3',
  QUIZ_WRONG: '../assets/audio/quiz/wrong.mp3',
  QUIZ_FINISH: '../assets/audio/quiz/quiz-finish.mp3',
  EXAM_START: '../assets/audio/exam/exam-start.mp3',
  EXAM_WARNING: '../assets/audio/exam/time-warning.mp3',
  EXAM_FINISH: '../assets/audio/exam/exam-finish.mp3',
  EXAM_SUBMIT: '../assets/audio/exam/submit.mp3',
  ACHIEVEMENT_UNLOCK: '../assets/audio/achievement/unlock.mp3',
  STREAK_REWARD: '../assets/audio/achievement/streak.mp3',
  REWARD: '../assets/audio/achievement/reward.mp3',
  VOICE_WELCOME: '../assets/audio/voice/selamat-datang.mp3',
  VOICE_CORRECT: '../assets/audio/voice/betul.mp3',
  VOICE_WRONG: '../assets/audio/voice/cuba-lagi.mp3',
  VOICE_CONGRATS: '../assets/audio/voice/tahniah.mp3',
  VOICE_EXAM_FINISH: '../assets/audio/voice/tamat-peperiksaan.mp3'
};
function localAudioSlotOptions(selected=''){
  return Object.entries(LOCAL_AUDIO_SLOTS).map(([k,label])=>`<option value="${esc(k)}" ${k===selected?'selected':''}>${esc(label)}</option>`).join('');
}
function localAudioPathForSlot(slot){ return LOCAL_AUDIO_PATHS[String(slot||'').trim()] || ''; }

const SOUND_EVENT_META = [
  {key:'buttonClick', label:'Button Click', desc:'Bunyi umum untuk tekan button / navigasi.', fallback:'click'},
  {key:'correctAnswer', label:'Jawapan Betul', desc:'Bunyi apabila latihan dijawab betul.', fallback:'correct'},
  {key:'wrongAnswer', label:'Jawapan Salah', desc:'Bunyi apabila latihan dijawab salah.', fallback:'wrong'},
  {key:'switchStudent', label:'Tukar Pelajar', desc:'Bunyi apabila parent tukar profil pelajar.', fallback:'switch'},
  {key:'selectAvatar', label:'Pilih Avatar', desc:'Bunyi semasa pilih avatar pelajar.', fallback:'avatar'},
  {key:'examStart', label:'Exam Start', desc:'Bunyi permulaan peperiksaan.', fallback:'examStart'},
  {key:'examFinish', label:'Exam Finish', desc:'Bunyi selesai latihan / peperiksaan.', fallback:'examFinish'},
  {key:'notificationSound', label:'Notification Sound', desc:'Future slot untuk popup/hebahaan/pembayaran.', fallback:'click'},
  {key:'paymentNotice', label:'Payment Notice', desc:'Future slot untuk status pembayaran ToyyibPay.', fallback:'correct'},
  {key:'voiceCongrats', label:'Suara Tahniah', desc:'Future slot suara ucapan tahniah pelajar cemerlang.', fallback:'correct'},
  {key:'voiceMotivation', label:'Suara Motivasi', desc:'Future slot suara motivasi selepas result.', fallback:'correct'},
  {key:'backgroundMusic', label:'Background Music', desc:'Future slot muzik latar lembut, boleh OFF bila perlu.', fallback:'switch'},
  {key:'voiceReward', label:'Voice Reward', desc:'Suara motivasi ringkas selepas keputusan / markah tinggi.', fallback:'correct'}
];
function defaultSoundSettings(){
  return {
    enabled:true,
    engine:'web_audio',
    mode:'soft_kids',
    volume:0.9,
    volumeBoost:1.5,
    events:{
      buttonClick:{enabled:true,tone:SOUND_TONE_OPTIONS.click,volume:0.6},
      correctAnswer:{enabled:true,tone:SOUND_TONE_OPTIONS.correct,volume:1},
      wrongAnswer:{enabled:true,tone:SOUND_TONE_OPTIONS.wrong,volume:0.8},
      switchStudent:{enabled:true,tone:SOUND_TONE_OPTIONS.switch,volume:0.75},
      selectAvatar:{enabled:true,tone:SOUND_TONE_OPTIONS.avatar,volume:0.75},
      examStart:{enabled:true,tone:SOUND_TONE_OPTIONS.examStart,volume:0.95},
      examFinish:{enabled:true,tone:SOUND_TONE_OPTIONS.examFinish,volume:1},
      notificationSound:{enabled:true,tone:SOUND_TONE_OPTIONS.click,volume:0.7},
      paymentNotice:{enabled:true,tone:SOUND_TONE_OPTIONS.correct,volume:0.8},
      voiceCongrats:{enabled:true,tone:SOUND_TONE_OPTIONS.correct,volume:0.9,voiceEnabled:true},
      voiceMotivation:{enabled:false,tone:SOUND_TONE_OPTIONS.correct,volume:0.8,voiceEnabled:true},
      backgroundMusic:{enabled:false,tone:SOUND_TONE_OPTIONS.switch,volume:0.35},
      voiceReward:{enabled:true,tone:SOUND_TONE_OPTIONS.correct,volume:0.9,voiceEnabled:true}
    }
  };
}
function soundMsg(text){ const box=$('soundMsg'); if(box) box.textContent = new Date().toLocaleString('ms-MY') + ' - ' + text; }
function updateSoundVolumeLabels(){
  const vol = Number($('soundVolume')?.value || 90);
  const boost = Number($('soundBoost')?.value || 150);
  if($('soundVolumeLabel')) $('soundVolumeLabel').textContent = vol + '%';
  if($('soundBoostLabel')) $('soundBoostLabel').textContent = boost + '%';
  SOUND_EVENT_META.forEach(meta=>{
    const el = $('snd_' + meta.key + '_volume');
    const label = $('snd_' + meta.key + '_volume_label');
    if(el && label) label.textContent = el.value + '%';
  });
}
function soundToneOptions(selected){
  const labels = {click:'Click',correct:'Correct Chime',wrong:'Wrong Soft',switch:'Switch Whoosh',avatar:'Avatar Pop',examStart:'Exam Start',examFinish:'Finish Success'};
  return Object.entries(SOUND_TONE_OPTIONS).map(([k,v])=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(labels[k] || k)}</option>`).join('');
}
function normalizeToneValue(item, fallback){ return item?.tone || item?.file || SOUND_TONE_OPTIONS[fallback] || SOUND_TONE_OPTIONS.click; }
function renderSoundEventGrid(settings=defaultSoundSettings()){
  const grid=$('soundEventGrid'); if(!grid) return;
  const events = settings.events || {};
  grid.innerHTML = SOUND_EVENT_META.map(meta=>{
    const item = events[meta.key] || defaultSoundSettings().events[meta.key];
    const tone = normalizeToneValue(item, meta.fallback);
    const audioSlot = item.audioSlot || '';
    const localPath = item.localPath || localAudioPathForSlot(audioSlot);
    return `<div class="sound-card">
      <h3>${esc(meta.label)}</h3><p>${esc(meta.desc)}</p>
      <div class="sound-toggle-row"><label><input type="checkbox" id="snd_${esc(meta.key)}_enabled" ${item.enabled!==false?'checked':''}> Aktif</label></div>
      <div style="margin:8px 0"><label>Event Volume: <b id="snd_${esc(meta.key)}_volume_label">${Math.round(Number(item.volume ?? 0.85)*100)}%</b></label><input type="range" id="snd_${esc(meta.key)}_volume" min="0" max="100" step="5" value="${Math.round(Number(item.volume ?? 0.85)*100)}" oninput="updateSoundVolumeLabels()"></div>
      <div class="sound-preview-row"><div><label>Web Audio Tone Fallback</label><select id="snd_${esc(meta.key)}_tone">${soundToneOptions(tone)}</select></div><button class="secondary" onclick="previewAdminSound($('snd_${esc(meta.key)}_tone').value, Number($('snd_${esc(meta.key)}_volume')?.value || 85)/100)">Preview Tone</button></div>
      <div class="sound-upload-box">
        <label>Slot MP3 Tempatan ${meta.key==='voiceReward'?'(Voice Popup)':''}</label>
        <select id="snd_${esc(meta.key)}_slot" onchange="updateLocalAudioPath('${esc(meta.key)}')">${localAudioSlotOptions(audioSlot)}</select>
        <input id="snd_${esc(meta.key)}_local" type="hidden" value="${esc(localPath)}">
        <div class="actions">
          <button class="secondary mini" onclick="previewLocalAudioSlot('${esc(meta.key)}')">Preview MP3 Slot</button>
          <button class="warning mini" onclick="clearLocalAudioSlot('${esc(meta.key)}')">Kosongkan Slot</button>
        </div>
        <p class="sound-upload-hint" id="snd_${esc(meta.key)}_status">${audioSlot ? 'Slot aktif: ' + esc(audioSlot) + ' → ' + esc(localPath) : 'Belum pilih slot MP3. Jika kosong, app guna tone fallback.'}</p>
      </div>
    </div>`;
  }).join('');
}
function collectSoundSettingsFromForm(){
  const data = defaultSoundSettings();
  data.enabled = $('soundEnabled').value === 'true';
  data.engine = 'web_audio';
  data.mode = $('soundMode').value || 'soft_kids';
  data.volume = Number($('soundVolume').value || 90) / 100;
  data.volumeBoost = Number($('soundBoost')?.value || 150) / 100;
  data.events = {};
  SOUND_EVENT_META.forEach(meta=>{
    const audioSlot = String($('snd_' + meta.key + '_slot')?.value || '').trim();
    const localPath = localAudioPathForSlot(audioSlot);
    data.events[meta.key] = {
      enabled: !!$('snd_' + meta.key + '_enabled')?.checked,
      tone: $('snd_' + meta.key + '_tone')?.value || defaultSoundSettings().events[meta.key].tone,
      volume: Number($('snd_' + meta.key + '_volume')?.value || 85) / 100,
      audioSlot,
      localPath
    };
    if(meta.key === 'voiceReward') data.events[meta.key].voiceEnabled = true;
  });
  data.updatedAt = new Date().toISOString();
  data.updatedBy = currentAdminSession?.adminId || 'admin-panel';
  return data;
}
function applySoundForm(settings){
  const data = {...defaultSoundSettings(), ...(settings||{})};
  data.events = {...defaultSoundSettings().events, ...(settings?.events||{})};
  $('soundEnabled').value = String(data.enabled !== false);
  $('soundMode').value = data.mode || 'soft_kids';
  $('soundVolume').value = String(Math.round(Number(data.volume ?? 0.9)*100));
  if($('soundBoost')) $('soundBoost').value = String(Math.round(Number(data.volumeBoost ?? 1.5)*100));
  renderSoundEventGrid(data);
  updateSoundVolumeLabels();
}
function applySoundMoodPreset(force=true){
  const mode = $('soundMode')?.value || 'soft_kids';
  const current = collectSoundSettingsFromForm();
  if(mode === 'silent_mode'){
    current.enabled = false;
    Object.keys(current.events).forEach(k=>current.events[k].enabled=false);
  }else if(mode === 'islamic_calm'){
    current.enabled = true; current.volume = 0.6; current.volumeBoost = 1.15;
    current.events.correctAnswer.tone = SOUND_TONE_OPTIONS.examFinish;
    current.events.wrongAnswer.tone = SOUND_TONE_OPTIONS.click;
    current.events.examStart.tone = SOUND_TONE_OPTIONS.examStart;
    current.events.examFinish.tone = SOUND_TONE_OPTIONS.examFinish;
  }else if(mode === 'fun_cartoon'){
    current.enabled = true; current.volume = 1; current.volumeBoost = 1.8;
    current.events.correctAnswer.tone = SOUND_TONE_OPTIONS.correct;
    current.events.wrongAnswer.tone = SOUND_TONE_OPTIONS.wrong;
    current.events.selectAvatar.tone = SOUND_TONE_OPTIONS.avatar;
  }else if(mode === 'soft_kids'){
    current.enabled = true; current.volume = 0.9; current.volumeBoost = 1.5;
  }
  current.engine = 'web_audio';
  current.mode = mode;
  applySoundForm(current);
  if(force) soundMsg('Preset mood sound digunakan: ' + mode);
}
let ADMIN_AUDIO_CTX = null;
function adminAudioCtx(){ ADMIN_AUDIO_CTX = ADMIN_AUDIO_CTX || new (window.AudioContext || window.webkitAudioContext)(); return ADMIN_AUDIO_CTX; }
function playAdminTone(tone, volume=0.8){
  try{
    const ctx = adminAudioCtx();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), now);
    master.connect(ctx.destination);
    const sequence = {
      'tone:click': [[640,0,0.055,'square']],
      'tone:correct': [[660,0,0.11,'sine'],[880,0.09,0.14,'sine'],[1170,0.19,0.16,'triangle']],
      'tone:wrong': [[220,0,0.12,'sine'],[165,0.11,0.16,'sine']],
      'tone:switch': [[380,0,0.08,'triangle'],[520,0.06,0.10,'triangle']],
      'tone:avatar': [[740,0,0.08,'sine'],[980,0.06,0.10,'sine']],
      'tone:examStart': [[523,0,0.12,'triangle'],[659,0.12,0.12,'triangle'],[784,0.24,0.18,'triangle']],
      'tone:examFinish': [[523,0,0.12,'sine'],[659,0.10,0.14,'sine'],[784,0.22,0.16,'sine'],[1046,0.36,0.22,'triangle']]
    }[tone] || [[600,0,0.08,'sine']];
    sequence.forEach(([freq,delay,duration,type])=>{
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type; osc.frequency.setValueAtTime(freq, now + delay);
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.25, now + delay + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration);
      osc.connect(gain); gain.connect(master);
      osc.start(now + delay); osc.stop(now + delay + duration + 0.03);
    });
  }catch(e){}
}
function previewAdminSound(tone,eventVolume=1){
  const master = Number($('soundVolume')?.value || 90) / 100;
  const boost = Number($('soundBoost')?.value || 150) / 100;
  playAdminTone(tone, Math.max(0, Math.min(1, master * eventVolume * boost)));
}
function previewAdminAudioUrl(url,eventVolume=1){
  try{
    const clean = String(url||'').trim();
    if(!clean){ soundMsg('Pilih slot MP3 dahulu.'); return; }
    const master = Number($('soundVolume')?.value || 90) / 100;
    const boost = Number($('soundBoost')?.value || 150) / 100;
    const audio = new Audio(clean);
    audio.volume = Math.max(0, Math.min(1, master * eventVolume * boost));
    audio.play().then(()=>soundMsg('Preview MP3 slot dimainkan.')).catch(err=>soundMsg('Gagal preview MP3. Pastikan fail wujud di folder assets/audio. Detail: ' + err.message));
  }catch(err){ soundMsg('Gagal preview MP3: ' + err.message); }
}
function updateLocalAudioPath(eventKey){
  const slot = String($('snd_' + eventKey + '_slot')?.value || '').trim();
  const path = localAudioPathForSlot(slot);
  if($('snd_' + eventKey + '_local')) $('snd_' + eventKey + '_local').value = path;
  const status = $('snd_' + eventKey + '_status');
  if(status) status.textContent = slot ? ('Slot aktif: ' + slot + ' → ' + path) : 'Belum pilih slot MP3. Jika kosong, app guna tone fallback.';
}
function previewLocalAudioSlot(eventKey){
  updateLocalAudioPath(eventKey);
  const path = $('snd_' + eventKey + '_local')?.value || '';
  previewAdminAudioUrl(path, Number($('snd_' + eventKey + '_volume')?.value || 85)/100);
}
function clearLocalAudioSlot(eventKey){
  if($('snd_' + eventKey + '_slot')) $('snd_' + eventKey + '_slot').value = '';
  updateLocalAudioPath(eventKey);
  soundMsg('Slot MP3 dikosongkan. Tekan Simpan Sound Settings.');
}


async function loadSoundSettings(){
  try{
    renderSoundEventGrid(defaultSoundSettings());
    const snap = await db.ref(soundSettingsRoot).get();
    applySoundForm(snap.exists()?snap.val():defaultSoundSettings());
    soundMsg(snap.exists()?'Sound settings dimuatkan.':'Default sound settings digunakan.');
  }catch(err){ console.error(err); soundMsg('Gagal load sound settings: ' + err.message); }
}
async function saveSoundSettings(){
  try{
    const data = collectSoundSettingsFromForm();
    await db.ref(soundSettingsRoot).set(data);
    await db.ref(adminLogRoot).push({action:'save_sound_settings', adminId:currentAdminSession?.adminId||'', at:new Date().toISOString()});
    soundMsg('Sound settings berjaya disimpan.');
  }catch(err){ console.error(err); soundMsg('Gagal simpan sound settings: ' + err.message); }
}
async function resetSoundSettingsDefault(){
  if(!confirm('Reset Sound Settings kepada default?')) return;
  applySoundForm(defaultSoundSettings());
  await saveSoundSettings();
}


async function writeDefaultSettings(){
  await db.ref(APP_ROOT + '/settings/accessControl').update({registrationRequiresCode:true, defaultTrialDays:30, defaultExamDays:365, updatedAt:new Date().toISOString()});
  const soundSnap = await db.ref(soundSettingsRoot).get();
  if(!soundSnap.exists()) await db.ref(soundSettingsRoot).set(defaultSoundSettings());
  alert('Default settings disimpan.');
}

const DEFAULT_SUBSCRIPTION_SETTINGS = {
  title: 'PROMO Pakej UPKK SmartKids',
  promoLabel: '🔥 PROMO TERHAD - JIMAT 67%',
  originalPrice: 150,
  promoPrice: 49.90,
  durationDays: 365,
  paymentMode: 'toyyibpay_link',
  paymentUrl: 'https://toyyibpay.com/Lesen-Peperiksaan-Unlock',
  note: 'Unlock Peperiksaan UPKK SmartKids dengan harga promo RM49.90 sahaja.',
  paymentInstruction: 'Klik Bayar Sekarang untuk membuat bayaran ToyyibPay. Selepas selesai, kembali ke app dan tekan Saya Sudah Bayar supaya admin boleh approve 1 klik.',
  features: [
    'Semua Peperiksaan UPKK',
    '6 Subjek Lengkap',
    'Analisa Prestasi Automatik',
    'Leaderboard Keluarga',
    'Resume Progress',
    'Akses 12 Bulan'
  ]
};
function rm(v){ return 'RM' + Number(v||0).toFixed(2); }
function getSubFormData(){
  return {
    title: $('subTitle').value.trim() || DEFAULT_SUBSCRIPTION_SETTINGS.title,
    promoLabel: $('subPromoLabel').value.trim() || DEFAULT_SUBSCRIPTION_SETTINGS.promoLabel,
    originalPrice: Number($('subOriginalPrice').value || 150),
    promoPrice: Number($('subPromoPrice').value || 49.90),
    paymentMode: 'toyyibpay_link',
    paymentUrl: $('subPaymentUrl').value.trim(),
    durationDays: Number($('subDurationDays').value || 365),
    note: $('subNote').value.trim(),
    paymentInstruction: $('subPaymentInstruction').value.trim(),
    features: $('subFeatures').value.split('\n').map(s=>s.trim()).filter(Boolean),
    updatedAt: new Date().toISOString()
  };
}
function renderSubPreview(s){
  const features = (s.features||[]).map(f=>`<li>✔ ${esc(f)}</li>`).join('');
  const save = Math.max(0, Number(s.originalPrice||0)-Number(s.promoPrice||0));
  return `<div class="premium-admin-preview">
    <div class="promo-label">${esc(s.promoLabel||'🔥 PROMOSI TERHAD')}</div>
    <h2>${esc(s.title||'UPKK SmartKids Premium')}</h2>
    <div class="price-old"><span>${rm(s.originalPrice)}</span></div>
    <div class="price-now">${rm(s.promoPrice)}</div>
    <div class="save-pill">Jimat ${rm(save)}</div>
    <p>${esc(s.note||'')}</p>
    <ul>${features}</ul>
    <p class="hint">${esc(s.paymentInstruction||'')}</p>
    <p class="hint"><b>Link ToyyibPay:</b> <code>${esc(s.paymentUrl||'-')}</code></p>
  </div>`;
}
async function loadSubscriptionSettings(){
  const snap = await db.ref(settingsRoot + '/subscription').get();
  const s = {...DEFAULT_SUBSCRIPTION_SETTINGS, ...(snap.exists()?snap.val():{})};
  $('subTitle').value = s.title || '';
  $('subPromoLabel').value = s.promoLabel || '';
  $('subOriginalPrice').value = Number(s.originalPrice || 150).toFixed(2);
  $('subPromoPrice').value = Number(s.promoPrice || 49.90).toFixed(2);
  $('subDurationDays').value = Number(s.durationDays || 365);
  $('subPaymentUrl').value = s.paymentUrl || DEFAULT_SUBSCRIPTION_SETTINGS.paymentUrl || '';
  $('subNote').value = s.note || '';
  $('subPaymentInstruction').value = s.paymentInstruction || '';
  $('subFeatures').value = Array.isArray(s.features) ? s.features.join('\n') : String(s.features || DEFAULT_SUBSCRIPTION_SETTINGS.features.join('\n'));
  $('subPreviewBox').innerHTML = renderSubPreview(s);
  $('subSettingsLog').textContent = 'Subscription settings dimuatkan.';
}
async function saveSubscriptionSettings(){
  const data = getSubFormData();
  if(!data.features.length) data.features = DEFAULT_SUBSCRIPTION_SETTINGS.features;
  await db.ref(settingsRoot + '/subscription').update(data);
  $('subSettingsLog').textContent = 'Berjaya disimpan pada ' + new Date().toLocaleString('ms-MY');
  $('subPreviewBox').innerHTML = renderSubPreview(data);
}
async function loadPayments(){
  const box = $('paymentsBox');
  if(!box) return;
  box.innerHTML = 'Memuatkan pembayaran...';

  // TASK-013: Baca permohonan bayaran ToyyibPay dan kekalkan sokongan data resit lama.
  const candidateRoots = [
    paymentRoot,
    APP_ROOT + '/payments',
    APP_ROOT + '/payment',
    'payments',
    'payment'
  ];

  const rows = [];
  paymentActionMap = {};

  function pushPaymentRow(root, id, val){
    if(!val || typeof val !== 'object') return;

    // Format biasa: apps/UPKK/payments/{paymentId}
    const looksLikePayment =
      val.receiptBase64 ||
      val.paymentMethod ||
      val.paymentReference ||
      val.amount ||
      val.plan ||
      val.status ||
      val.accountId ||
      val.username ||
      val.parentUsername ||
      val.submittedAt;

    if(looksLikePayment){
      rows.push({ id, _root: root, ...val });
      return;
    }

    // Format nested fallback: payments/{uid}/{paymentId}
    Object.entries(val).forEach(([childId, childVal])=>{
      if(childVal && typeof childVal === 'object'){
        const nestedLooksLikePayment =
          childVal.receiptBase64 ||
          childVal.paymentMethod ||
          childVal.paymentReference ||
          childVal.amount ||
          childVal.plan ||
          childVal.status ||
          childVal.accountId ||
          childVal.username ||
          childVal.parentUsername ||
          childVal.submittedAt;

        if(nestedLooksLikePayment){
          rows.push({
            id: childId,
            _root: root + '/' + id,
            accountId: childVal.accountId || id,
            username: childVal.username || childVal.parentUsername || '',
            ...childVal
          });
        }
      }
    });
  }

  for(const root of [...new Set(candidateRoots)]){
    try{
      const snap = await db.ref(root).get();
      if(!snap.exists()) continue;
      snap.forEach(child => pushPaymentRow(root, child.key, child.val() || {}));
    }catch(err){
      console.warn('Payment path skipped:', root, err.message || err);
    }
  }

  const unique = [];
  const seen = new Set();
  rows.forEach(p => {
    const key = `${p._root}/${p.id}`;
    if(!seen.has(key)){
      seen.add(key);
      unique.push(p);
    }
  });

  unique.sort((a,b)=>{
    const bd = new Date(b.submittedAt || b.updatedAt || b.approvedAt || 0).getTime() || 0;
    const ad = new Date(a.submittedAt || a.updatedAt || a.approvedAt || 0).getTime() || 0;
    return bd - ad;
  });

  if(!unique.length){
    box.innerHTML = `<div class="empty-state">
      <b>Tiada pembayaran dipaparkan.</b>
      <p class="hint">Sistem sedang membaca path utama <code>apps/UPKK/payments</code>. Jika Firebase sudah ada rekod tetapi masih kosong, tekan Debug Path Pembayaran.</p>
      <button class="secondary mini" onclick="debugPaymentsPath()">Debug Path Pembayaran</button>
    </div>`;
    return;
  }

  box.innerHTML = `<div class="hint" style="margin-bottom:10px">Jumlah rekod dikesan: <b>${unique.length}</b></div>
  <table><thead><tr><th>Parent</th><th>Pelan</th><th>Jumlah</th><th>Status</th><th>Kaedah/Ref</th><th>Path</th><th>Tindakan</th></tr></thead><tbody>${unique.map((p,idx)=>{
    const token = 'pay_' + idx;
    paymentActionMap[token] = {root:p._root, id:p.id};
    const status = String(p.status || 'pending').toLowerCase();
    const submitted = p.submittedAt || p.updatedAt || p.approvedAt || '';
    return `
    <tr>
      <td><b>${esc(p.username||p.parentUsername||p.accountId||'-')}</b><br><span class="hint">${esc(p.parentName||p.studentName||'')}</span><br><span class="hint">${submitted ? esc(new Date(submitted).toLocaleString('ms-MY')) : '-'}</span></td>
      <td>${esc(p.plan||'-')}</td>
      <td>${rm(p.amount)}</td>
      <td><b>${esc(status)}</b>${p.adminRemark?'<br><span class="hint">'+esc(p.adminRemark)+'</span>':''}</td>
      <td><span class="payment-method-pill">${esc(p.paymentMethod||'manual')}</span>${p.paymentReference?'<div class="payment-ref-box">Ref: '+esc(p.paymentReference)+'</div>':''}${p.receiptBase64?`<div style="margin-top:6px"><button class="secondary mini" onclick="viewReceipt('${token}')">Lihat Resit Lama</button></div>`:''}</td>
      <td><code>${esc(p._root)}</code></td>
      <td class="actions">${status==='approved'?'✅ Diluluskan':status==='rejected'?'❌ Ditolak':`<button class="mini" onclick="approvePayment('${token}')">Luluskan 1 Klik</button><button class="danger mini" onclick="rejectPayment('${token}')">Tolak</button>`}</td>
    </tr>`}).join('')}</tbody></table>`;
}
async function debugPaymentsPath(){
  const candidateRoots = [paymentRoot, APP_ROOT + '/payments', APP_ROOT + '/payment', 'payments', 'payment'];
  const lines = [];
  for(const root of candidateRoots){
    try{
      const snap = await db.ref(root).limitToLast(5).get();
      lines.push(`${root}: ${snap.exists() ? snap.numChildren() + ' rekod' : 'kosong'}`);
    }catch(err){
      lines.push(`${root}: ERROR - ${err.message || err}`);
    }
  }
  alert(lines.join('\n'));
}

function getPaymentTarget(token){
  const target = paymentActionMap[token];
  if(!target) throw new Error('Rekod pembayaran tidak dijumpai. Tekan Refresh Pembayaran dahulu.');
  return target;
}

async function viewReceipt(token){
  const target = getPaymentTarget(token);
  const snap = await db.ref(target.root + '/' + target.id).get();
  const p = snap.val() || {};
  if(!p.receiptBase64){ alert('Resit tidak dijumpai.'); return; }
  const w = window.open('', '_blank');
  w.document.write(`<title>Resit ${esc(target.id)}</title><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="${p.receiptBase64}" style="max-width:96vw;max-height:96vh;border-radius:12px;background:white"></body>`);
}


function formatDateMY(value){
  try{
    const d = value instanceof Date ? value : new Date(value);
    if(Number.isNaN(d.getTime())) return String(value || '-');
    return d.toLocaleDateString('ms-MY', {day:'2-digit', month:'long', year:'numeric'});
  }catch(err){ return String(value || '-'); }
}
function paymentNotificationPayload(type, title, message){
  return {
    type,
    title,
    message,
    read:false,
    createdAt:new Date().toISOString(),
    source:'admin_payment'
  };
}
function buildNotificationUpdate(accountId, payload){
  const key = db.ref().child(notificationRoot + '/' + safeKey(accountId)).push().key;
  const updates = {};
  updates[notificationRoot + '/' + safeKey(accountId) + '/' + key] = payload;
  return updates;
}

async function approvePayment(token){
  const target = getPaymentTarget(token);
  const snap = await db.ref(target.root + '/' + target.id).get();
  const p = snap.val() || {};
  const duration = Number(p.durationDays || 365);
  const now = new Date();
  const expiry = new Date(now.getTime() + duration * 86400000);
  const accountId = p.accountId || p.username || p.parentUsername || '';
  if(!accountId){ alert('Account ID tidak lengkap.'); return; }
  const subscription = {
    status: 'active',
    plan: p.plan || 'UPKK SmartKids Premium',
    amount: Number(p.amount || 0),
    activatedAt: now.toISOString(),
    expiryDate: expiry.toISOString(),
    examActive: true,
    examUntil: expiry.toISOString(),
    paymentId: target.id,
    updatedAt: now.toISOString()
  };
  const updates = {};
  updates[target.root + '/' + target.id + '/status'] = 'approved';
  updates[target.root + '/' + target.id + '/approvedAt'] = now.toISOString();
  updates[target.root + '/' + target.id + '/updatedAt'] = now.toISOString();
  updates[target.root + '/' + target.id + '/adminRemark'] = 'Diluluskan oleh admin selepas semakan ToyyibPay.';
  updates[subscriptionRoot + '/' + safeKey(accountId)] = subscription;
  updates[userRoot + '/' + safeKey(accountId) + '/subscription'] = subscription;
  updates[userRoot + '/' + safeKey(accountId) + '/plan'] = 'PREMIUM';
  updates[userRoot + '/' + safeKey(accountId) + '/entitlements/examLicense'] = {active:true, startDate:now.toISOString(), endDate:expiry.toISOString(), package:'toyyibpay_link'};
  Object.assign(updates, buildNotificationUpdate(accountId, paymentNotificationPayload(
    'subscription_approved',
    '🎉 Peperiksaan Dibuka',
    `Slot peperiksaan anda telah dibuka. Sah sehingga ${formatDateMY(expiry)}. Selamat menjawab soalan.`
  )));
  await db.ref().update(updates);
  await loadPayments();
  alert('Pembayaran ToyyibPay diluluskan dan peperiksaan Premium diaktifkan.');
}

async function rejectPayment(token){
  const target = getPaymentTarget(token);
  const snap = await db.ref(target.root + '/' + target.id).get();
  const p = snap.val() || {};
  const accountId = p.accountId || p.username || p.parentUsername || '';
  const remark = prompt('Sebab penolakan:', 'Resit tidak jelas / bayaran tidak sah') || 'Ditolak oleh admin.';
  const updates = {};
  updates[target.root + '/' + target.id + '/status'] = 'rejected';
  updates[target.root + '/' + target.id + '/adminRemark'] = remark;
  updates[target.root + '/' + target.id + '/updatedAt'] = new Date().toISOString();
  if(accountId){
    Object.assign(updates, buildNotificationUpdate(accountId, paymentNotificationPayload(
      'subscription_rejected',
      '❌ Pengaktifan Tidak Berjaya',
      `Slot peperiksaan tidak berjaya diaktifkan kerana ${remark}. Sila hubungi support.`
    )));
  }
  await db.ref().update(updates);
  await loadPayments();
}

async function loadAll(){ await Promise.all([loadSummary(), loadCodes(), loadUsers(), loadHistory()]); }
async function initAdminPanel(){ const ok = await verifyAdminSession(); if(ok){ await loadAll(); const hash=(location.hash||'').replace('#',''); await loadStudentSearchOptions().catch(()=>{}); if(hash) showTab(hash); } }
initAdminPanel().catch(err=>{ console.error(err); alert('Admin load error: ' + err.message); redirectAdminLogin('Ralat akses admin.'); });


/* TASK-014 Admin UX helper functions */
function updateTask014DashboardKpi(){
  try{
    const box = $('adminKpiBox'); if(!box) return;
    const txt = $('summaryBox')?.innerText || '';
    const maint = $('sysMaintenance')?.value === 'true' ? 'ON' : (txt.toLowerCase().includes('maintenance') ? 'Check' : 'OFF');
    box.innerHTML = `
      <div class="admin-kpi"><b>${(window.__upkkUserCount||'—')}</b><span>Users / Parent</span></div>
      <div class="admin-kpi"><b>${(window.__upkkPendingPayment||'—')}</b><span>Pending Payment</span></div>
      <div class="admin-kpi"><b>${(window.__upkkQuestionCount||'—')}</b><span>Question Bank</span></div>
      <div class="admin-kpi"><b>${maint}</b><span>Maintenance</span></div>`;
  }catch(e){ console.warn(e); }
}
function cleanQuestionEditorText(){
  const ids=['qRumi','qJawi','optRumi0','optRumi1','optRumi2','optRumi3','optJawi0','optJawi1','optJawi2','optJawi3','qInstruction'];
  ids.forEach(id=>{ const el=$(id); if(!el) return; el.value = String(el.value||'').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/\s+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim(); });
  setLogBox('questionMsg','Text soalan telah dibersihkan daripada spacing/kotoran tersembunyi. Sila semak sebelum Simpan Soalan.');
}
function generateCertificatePreview(){
  const name = $('certStudentName')?.value?.trim() || 'Nama Pelajar';
  const ach = $('certAchievement')?.value?.trim() || 'Kecemerlangan UPKK SmartKids';
  const score = $('certScore')?.value?.trim() || 'Prestasi Cemerlang';
  const logo = '../assets/images/logo.webp';
  const html = `<div class="certificate-template" id="upkkCertificateTemplate"><div><img src="${logo}" class="report-logo-img" alt="UPKK SmartKids"/><div class="cert-seal">🏅</div><h1>Sijil Pencapaian</h1><p>Dengan bangganya dianugerahkan kepada</p><div class="cert-name">${esc(name)}</div><p>atas pencapaian <b>${esc(ach)}</b></p><h2 style="color:#047857;margin:8px 0">${esc(score)}</h2><p style="margin-top:20px">Semoga terus cemerlang, beradab dan berjaya.</p><b>UPKK SmartKids • Restu Harmoni</b><p class="hint">Dijana pada ${new Date().toLocaleDateString('ms-MY')}</p></div></div>`;
  if($('certificatePreview')) $('certificatePreview').innerHTML = html;
}
function printCertificatePDF(){
  generateCertificatePreview();
  const node = document.getElementById('upkkCertificateTemplate');
  if(!node) return alert('Preview sijil dahulu.');
  const css = document.querySelector('style').textContent;
  const w = window.open('', '_blank');
  w.document.write(`<!doctype html><html><head><title>Sijil UPKK SmartKids</title><meta charset="utf-8"><link rel="stylesheet" href="assets/admin-panel.css?v=3.66-task015-admin-modular" />
</head><body>${node.outerHTML}<script>window.onload=()=>setTimeout(()=>window.print(),450)<\/script></body></html>`);
  w.document.close();
}

// Patch: app content manager support notification fields
const __task014_loadAppContent = typeof loadAppContent === 'function' ? loadAppContent : null;
loadAppContent = async function(){
  const snap=await db.ref(contentRoot).get(); const c=snap.exists()?snap.val():{};
  if($('contentNoticeType')) $('contentNoticeType').value=c.noticeType||'announcement';
  if($('contentTarget')) $('contentTarget').value=c.target||'all';
  if($('contentTargetUsername')) $('contentTargetUsername').value=c.targetUsername||'';
  if($('contentTitle')) $('contentTitle').value=c.title||'';
  $('contentBanner').value=c.banner||''; $('contentPopup').value=c.popupNotice||''; $('contentMotivation').value=Array.isArray(c.motivation)?c.motivation.join('\n'):(c.motivation||''); $('contentPreview').textContent=JSON.stringify(c,null,2)||'Tiada content.';
}
const __task014_saveAppContent = typeof saveAppContent === 'function' ? saveAppContent : null;
saveAppContent = async function(){
  const data={
    noticeType:$('contentNoticeType')?.value||'announcement',
    target:$('contentTarget')?.value||'all',
    targetUsername:$('contentTargetUsername')?.value.trim()||'',
    title:$('contentTitle')?.value.trim()||'',
    banner:$('contentBanner').value.trim(),
    popupNotice:$('contentPopup').value.trim(),
    motivation:$('contentMotivation').value.split('\n').map(s=>s.trim()).filter(Boolean),
    updatedAt:new Date().toISOString(),
    updatedBy:currentAdminSession?.adminId||''
  };
  await db.ref(contentRoot).update(data);
  // also create latest notification pointer for future app notification popup flow
  await db.ref(notificationRoot + '/latest').set({type:data.noticeType,target:data.target,targetUsername:data.targetUsername,title:data.title,message:data.popupNotice||data.banner,createdAt:data.updatedAt,createdBy:data.updatedBy});
  $('contentMsg').textContent='Content & notification berjaya disimpan.'; $('contentPreview').textContent=JSON.stringify(data,null,2);
}

// Patch quick code: keep trial only for premium ToyyibPay workflow
const __task014_applyTypeDefaults = typeof applyTypeDefaults === 'function' ? applyTypeDefaults : null;
applyTypeDefaults = function(){ if($('type')) $('type').value='trial_30_days'; if($('validDays')) $('validDays').value=30; if($('maxUse')) $('maxUse').value=$('maxUse').value||500; };

// Patch loadSummary/loadUsers/loadPayments to refresh KPI if possible
if(typeof loadSummary === 'function'){
  const __oldLoadSummary = loadSummary;
  loadSummary = async function(){ await __oldLoadSummary(); updateTask014DashboardKpi(); };
}
