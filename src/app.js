const APP_VERSION = '8.26-ACHIEVEMENTS';
const PIN_LENGTH = 6;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_MINUTES = 10;
const APP_CODE = 'UPKK';
const ID_PREFIX = 'STU';
const APP_YEAR_SHORT = '26';
const DEVICE_LIMIT = 2;
const PREMIUM_STATUS = { FREE:'FREE', PREMIUM:'PREMIUM' };
const ACCESS_TYPES = { TRIAL:'trial_30_days', EXAM:'exam_yearly', FULL:'full_yearly' };
const TRIAL_DAYS = 30;
const EXAM_LICENSE_DAYS = 365;
const PROFILE_KEY = 'upkkSmartKidsProfile_v520';
const PROFILES_KEY = 'upkkSmartKidsProfiles_v520';
const CURRENT_PROFILE_ID_KEY = 'upkkSmartKidsCurrentStudentId_v520';
const DRAFT_PROFILE_KEY = 'upkkSmartKidsDraftProfile_v630';
const LOGGED_IN_KEY = 'upkkSmartKidsLoggedIn_v690';
const LEGACY_PROFILE_KEYS = ['upkkSmartKidsProfile_v511','upkkSmartKidsProfile_v500','upkkSmartKidsProfile_v410','upkkSmartKidsProfile_v400'];
const HISTORY_KEY = 'upkkSmartKidsHistory_v520';
const USED_KEY = 'upkkSmartKidsUsedQuestions_v520';
const EXAM_SESSION_KEY = 'upkkSmartKidsExamSessions_v110';
const ACHIEVEMENTS_KEY = 'upkkSmartKidsAchievements_v100';
const EXAM_TARGET_QUESTIONS = 40;
const EXAM_DURATION_SECONDS = 45 * 60;
const EXAM_SUBJECT_ORDER = ['aqidah','ibadah','sirah','jawi','arab','adab'];

const UPKK_SUBJECT_META = {
  aqidah:{key:'aqidah', title:'Aqidah', titleJawi:'عقيده', icon:'🛡️', exam:{}, questions:[], questionCount:40, lazyLoaded:false},
  ibadah:{key:'ibadah', title:'Ibadah', titleJawi:'عباده', icon:'🕌', exam:{}, questions:[], questionCount:40, lazyLoaded:false},
  sirah:{key:'sirah', title:'Sirah', titleJawi:'سيره', icon:'📜', exam:{}, questions:[], questionCount:40, lazyLoaded:false},
  jawi:{key:'jawi', title:'Jawi & Khat', titleJawi:'جاوي دان خط', icon:'✍️', exam:{}, questions:[], questionCount:40, lazyLoaded:false},
  arab:{key:'arab', title:'Bahasa Arab', titleJawi:'بهاس عرب', icon:'📘', exam:{}, questions:[], questionCount:40, lazyLoaded:false},
  adab:{key:'adab', title:'Adab', titleJawi:'ادب', icon:'🤲', exam:{}, questions:[], questionCount:40, lazyLoaded:false}
};
function resetQuestionBankShell(){
  DB = JSON.parse(JSON.stringify(UPKK_SUBJECT_META));
}

const FIREBASE_USER_RESET_VERSION = '2026-05-28-reset-01';
const RESET_MARKER_KEY = 'upkkSmartKidsFirebaseResetVersion';

/* Reset stabil: apabila versi reset berubah, semua session/profil/cache lama pada browser akan dibersihkan.
   Data sebenar user perlu dipadam di Firebase menggunakan reset-firebase.html atau Admin SDK script. */
(function forceCleanAfterFirebaseUserReset(){
  try{
    if(localStorage.getItem(RESET_MARKER_KEY) === FIREBASE_USER_RESET_VERSION) return;
    const keep = {
      [RESET_MARKER_KEY]: FIREBASE_USER_RESET_VERSION
    };
    localStorage.clear();
    sessionStorage.clear();
    Object.entries(keep).forEach(([k,v]) => localStorage.setItem(k,v));
    if('caches' in window){
      caches.keys().then(keys => keys.forEach(key => caches.delete(key))).catch(()=>{});
    }
    if('serviceWorker' in navigator){
      navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(reg => reg.update().catch(()=>{}))).catch(()=>{});
    }
  }catch(err){ console.warn('Reset cleanup skipped:', err); }
})();


let DB = JSON.parse(JSON.stringify(UPKK_SUBJECT_META));
// FIREBASE-FIRST: bank soalan, profil, sejarah, usedMap dan examSessions disimpan di Firebase.
// localStorage hanya cache/session sementara supaya UI tidak kosong ketika reload.
let page = 'splash';
let profile = loadProfile();
let currentQuiz = null;
let selectedAnswer = null;
const UPKK_APP_VERSION = '1.21';
const UPKK_APP_VERSION_NAME = 'UPKK_SmartKids_V2_USERNAME_SUBSCRIPTION';
let quizType = 'practice';
let examTimer = null;
let deviceListenerRef = null;
let deviceListenerAccountId = '';
let lastDeviceSignature = '';
let deviceRenderLock = false;


/* v8.02 Keyboard/Input Focus Guard
   Fix: elak page render semula ketika user sedang menaip nama/PIN/password.
   Re-render dari device realtime boleh menutup keyboard dan nampak seperti input tidak boleh diisi. */
function isTypingField(el=document.activeElement){
  if(!el) return false;
  const tag = String(el.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}
function guardRenderWhileTyping(delay=700){
  if(isTypingField()){
    clearTimeout(window.__UPKK_PENDING_RENDER_TIMER);
    window.__UPKK_PENDING_RENDER_TIMER = setTimeout(()=>{
      if(!isTypingField() && (page === 'settings' || page === 'profile')) render();
    }, delay);
    return true;
  }
  return false;
}
function bindSafeTextInput(id, handler){
  const el = document.getElementById(id);
  if(!el) return null;
  el.setAttribute('autocomplete','off');
  el.setAttribute('autocorrect','off');
  el.setAttribute('autocapitalize','off');
  el.setAttribute('spellcheck','false');
  el.addEventListener('pointerdown', ()=>{ setTimeout(()=>{ try{ el.focus({preventScroll:true}); }catch(e){ el.focus(); } }, 0); }, {passive:true});
  el.addEventListener('touchend', ()=>{ setTimeout(()=>{ try{ el.focus({preventScroll:true}); }catch(e){ el.focus(); } }, 0); }, {passive:true});
  if(typeof handler === 'function') el.addEventListener('input', handler);
  return el;
}

function isLoggedInSession(){
  return localStorage.getItem(LOGGED_IN_KEY) === '1';
}
function clearLoginSessionOnly(){
  // Production flow: buang session aktif sahaja.
  // Progress latihan/peperiksaan disimpan di Firebase dan local cache ikut accountId + studentId.
  // deviceId dikekalkan supaya device sama tidak dikira device baru selepas logout/login.
  localStorage.removeItem(LOGGED_IN_KEY);
  localStorage.removeItem(CURRENT_PROFILE_ID_KEY);
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(DRAFT_PROFILE_KEY);
  localStorage.removeItem('upkkSmartKidsLoginToken_v700');
  localStorage.removeItem('upkkSmartKidsActiveSession_v700');
  localStorage.removeItem('upkkSmartKidsSelectedSubject');
  localStorage.removeItem('upkkSmartKidsTempQuizState');
  sessionStorage.clear();
}

async function clearAppRuntimeCaches(){
  // Buang cache PWA lama supaya browser tidak terus guna app.js / index.html lama.
  // Tidak padam data Firebase dan tidak padam progress pelajar.
  try{
    if('caches' in window){
      const names = await caches.keys();
      await Promise.all(names.filter(name => String(name).includes('upkk-smartkids')).map(name => caches.delete(name)));
    }
  }catch(err){ console.warn('Cache cleanup failed:', err); }
  try{
    if(navigator.serviceWorker?.getRegistrations){
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(reg => reg.update().catch(()=>{})));
    }
  }catch(err){ console.warn('Service worker update failed:', err); }
}

function flushCurrentStudentProgressToFirebase(){
  // Firebase ialah data utama. LocalStorage hanya cache/offline backup.
  try{
    if(currentQuiz && quizType === 'exam') persistExamSession();
    flushExamSessionSync();
  }catch(err){ console.warn('Exam session flush failed:', err); }
  try{ syncHistoryToFirebase(history()); }catch(err){ console.warn('History flush failed:', err); }
  try{ syncUsedMapToFirebase(usedMap()); }catch(err){ console.warn('Used map flush failed:', err); }
  try{ syncExamSessionsMapToFirebase(localExamSessions()); }catch(err){ console.warn('Exam sessions flush failed:', err); }
}

/* v6.92 Custom Web Note System: buang popup browser/GitHub origin */
function ensureAppNoteLayer(){
  let layer = document.getElementById('appNoteLayer');
  if(layer) return layer;
  layer = document.createElement('div');
  layer.id = 'appNoteLayer';
  layer.className = 'app-note-layer';
  layer.innerHTML = `
    <div class="app-note-card" role="dialog" aria-modal="true">
      <div class="app-note-icon">🌿</div>
      <h3 id="appNoteTitle">Notis UPKK SmartKids</h3>
      <p id="appNoteMessage"></p>
      <input id="appNoteInput" class="input app-note-input" />
      <div class="app-note-actions">
        <button id="appNoteCancel" class="btn secondary" type="button">Batal</button>
        <button id="appNoteOk" class="btn" type="button">OK</button>
      </div>
    </div>`;
  document.body.appendChild(layer);
  return layer;
}
function closeAppNote(){
  const layer = document.getElementById('appNoteLayer');
  if(layer){
    layer.classList.remove('show');
    layer.onclick = null;
    setTimeout(()=>{ if(!layer.classList.contains('show')) layer.style.display='none'; }, 30);
  }
}
function showAppNote(message, opts={}){
  const layer = ensureAppNoteLayer();
  const titleEl = document.getElementById('appNoteTitle');
  const msgEl = document.getElementById('appNoteMessage');
  const inputEl = document.getElementById('appNoteInput');
  const okBtn = document.getElementById('appNoteOk');
  const cancelBtn = document.getElementById('appNoteCancel');
  const title = opts.title || 'Notis UPKK SmartKids';
  titleEl.textContent = title;
  msgEl.textContent = String(message || '');
  inputEl.style.display = opts.input ? 'block' : 'none';
  inputEl.value = opts.defaultValue || '';
  inputEl.placeholder = opts.placeholder || '';
  inputEl.type = opts.inputType || 'text';
  inputEl.inputMode = opts.inputMode || '';
  cancelBtn.style.display = opts.showCancel ? 'block' : 'none';
  okBtn.textContent = opts.okText || 'OK';
  cancelBtn.textContent = opts.cancelText || 'Batal';
  okBtn.onclick = null; cancelBtn.onclick = null;
  layer.style.display = 'flex';
  layer.classList.add('show');
  if(opts.input) setTimeout(()=>inputEl.focus(),80);
  return new Promise(resolve=>{
    okBtn.onclick = ()=>{ const value = opts.input ? inputEl.value : true; closeAppNote(); resolve(value); };
    cancelBtn.onclick = ()=>{ closeAppNote(); resolve(opts.input ? null : false); };
    layer.onclick = (e)=>{ if(e.target === layer && opts.dismissOnBackdrop){ closeAppNote(); resolve(opts.input ? null : false); } };
  });
}
function appAlert(message){ return showAppNote(message, {title:'Notis UPKK SmartKids'}); }
function appConfirm(message, onYes){ showAppNote(message, {title:'Sahkan Tindakan', showCancel:true, okText:'Ya', cancelText:'Batal'}).then(ok=>{ if(ok && typeof onYes==='function') onYes(); }); }
function appPrompt(message, opts={}){ return showAppNote(message, {title:opts.title||'Input UPKK SmartKids', input:true, showCancel:true, okText:opts.okText||'Teruskan', cancelText:'Batal', placeholder:opts.placeholder||'', defaultValue:opts.defaultValue||'', inputType:opts.inputType||'text', inputMode:opts.inputMode||''}); }
window.alert = appAlert;

function firebaseEnabled(){ return !!(window.UPKK_APP_CONFIG?.firebaseEnabled && window.firebase && window.UPKK_FIREBASE_CONFIG?.databaseURL); }
function firebaseDb(){
  if(!firebaseEnabled()) return null;
  try{
    if(!firebase.apps.length) firebase.initializeApp(window.UPKK_FIREBASE_CONFIG);
    return firebase.database();
  }catch(err){ console.warn('Firebase init error:', err); return null; }
}
function fbPath(group, tail=''){
  const base = (window.UPKK_DB_PATHS && window.UPKK_DB_PATHS[group]) || `apps/${APP_CODE}/${group}`;
  return tail ? `${base}/${tail}` : base;
}

const UPKK_DEFAULT_WHATSAPP = {
  number: '',
  supportMessage: 'Assalamualaikum, saya perlukan bantuan UPKK SmartKids.',
  buyLicenseMessage: 'Assalamualaikum, saya ingin membeli lesen peperiksaan UPKK SmartKids.',
  renewLicenseMessage: 'Assalamualaikum, saya ingin renew lesen peperiksaan UPKK SmartKids.',
  problemMessage: 'Assalamualaikum, saya ingin laporkan masalah aplikasi UPKK SmartKids.'
};
let UPKK_WHATSAPP_CACHE = null;
function normalizeMsPhoneNumber(v){ return String(v||'').replace(/[^0-9]/g,'').replace(/^0/,'60'); }
function buildWhatsAppUrl(number, message){ return 'https://wa.me/' + normalizeMsPhoneNumber(number) + '?text=' + encodeURIComponent(message || ''); }
async function loadWhatsAppSettingsForUser(){
  if(UPKK_WHATSAPP_CACHE) return UPKK_WHATSAPP_CACHE;
  const db = firebaseDb();
  if(!db) return UPKK_DEFAULT_WHATSAPP;
  try{
    const snap = await firebaseGetOnce(fbPath('settings','whatsapp'));
    UPKK_WHATSAPP_CACHE = {...UPKK_DEFAULT_WHATSAPP, ...(snap.exists()?snap.val():{})};
    return UPKK_WHATSAPP_CACHE;
  }catch(err){ console.warn('WhatsApp settings load failed:', err); return UPKK_DEFAULT_WHATSAPP; }
}
async function openUpkkWhatsApp(type='support'){
  upkkPlaySound('tap');
  const w = await loadWhatsAppSettingsForUser();
  const number = normalizeMsPhoneNumber(w.number || w.whatsappNumber || '');
  if(!number){ alert('Nombor WhatsApp support belum ditetapkan oleh admin.'); return; }
  const msg = type==='buy' ? w.buyLicenseMessage : type==='renew' ? w.renewLicenseMessage : type==='problem' ? w.problemMessage : w.supportMessage;
  window.open(buildWhatsAppUrl(number,msg),'_blank','noopener,noreferrer');
}
function formatStudentId(num){ return `${ID_PREFIX}-${APP_YEAR_SHORT}-` + String(num).padStart(5,'0'); }
function isOfficialStudentId(id){ return new RegExp(`^${ID_PREFIX}-${APP_YEAR_SHORT}-\\d{5}$`).test(String(id||'')); }
function isStudentProfileId(id){ return /^student_\d+$/i.test(String(id||'')); }
function isValidStudentId(id){ return isOfficialStudentId(id) || isStudentProfileId(id); }
function nextStudentProfileId(username){
  const baseAccountId = profile.accountId || '';
  const list = Object.values(loadProfiles()).map(normalizeProfile).filter(p => baseAccountId ? p.accountId === baseAccountId : (p.username||'') === cleanUsername(username));
  let max = 0;
  list.forEach(p=>{ const m = String(p.studentId||'').match(/^student_(\d+)$/i); if(m) max = Math.max(max, Number(m[1])); });
  if(max === 0 && list.length) max = list.length;
  return `student_${max + 1}`;
}
async function generateSequentialStudentId(){
  const db = firebaseDb();
  if(!db){
    return randomId();
  }
  const counterRef = db.ref(fbPath('systemCounters', `student20${APP_YEAR_SHORT}`));
  try{
    const result = await counterRef.transaction(current => (Number(current)||0) + 1);
    if(result && result.committed && result.snapshot){
      return formatStudentId(result.snapshot.val());
    }
  }catch(err){
    console.warn('Student ID counter failed:', err);
  }
  return randomId();
}
function safeFirebaseKey(v){ return String(v||'').replace(/[.#$\[\]/]/g,'_'); }
function accountKey(username=profile.username){ return safeFirebaseKey(cleanUsername(username || '')); }
function mainAccountKey(){ return safeFirebaseKey(profile.accountId || profile.mainId || accountKey(profile.username)); }
function accountPath(id=profile.accountId){ return fbPath('users', safeFirebaseKey(id || profile.accountId || accountKey(profile.username))); }
function studentSlotPath(accountId=profile.accountId, studentId=profile.studentId){ return `${accountPath(accountId)}/students/${safeFirebaseKey(studentId||'student_1')}`; }
function firebaseAccountPayload(){
  return {
    appCode: APP_CODE,
    accountId: profile.accountId || '',
    username: profile.username || '',
    pin: profile.pin || '',
    activeStudent: profile.studentId || 'student_1',
    maxLoginAttempt: MAX_LOGIN_ATTEMPTS,
    temporaryLock: !!profile.temporaryLock,
    loginAttempts: Number(profile.loginAttempts||0),
    lockedUntil: profile.lockedUntil || '',
    plan: profile.plan || PREMIUM_STATUS.FREE,
    premiumCode: profile.premiumCode || '',
    entitlements: profile.entitlements || {},
    subscription: profile.subscription || {},
    deviceLimit: DEVICE_LIMIT,
    lastDeviceId: deviceId(),
    updatedAt: new Date().toISOString(),
    createdAt: profile.createdAt || new Date().toISOString()
  };
}
function firebaseStudentPayload(){
  return {
    slot: profile.studentId || 'student_1',
    name: profile.name || '',
    avatar: profile.avatar || '',
    mode: profile.mode || 'rumi',
    updatedAt: new Date().toISOString(),
    createdAt: profile.createdAt || new Date().toISOString()
  };
}

// CLOUD-FIRST SYNC v2.00
// Firebase menjadi data master. localStorage hanya cache/offline backup.
function cloudStudentBasePath(p=profile){
  return studentSlotPath(p.accountId, p.studentId || 'student_1');
}
function normalizeCloudHistory(rows){
  if(Array.isArray(rows)) return rows.filter(Boolean);
  if(rows && typeof rows === 'object') return Object.values(rows).filter(Boolean);
  return [];
}
function mergeHistoryRows(localRows, remoteRows){
  const map = new Map();
  [...normalizeCloudHistory(localRows), ...normalizeCloudHistory(remoteRows)].forEach((r,i)=>{
    if(!r || typeof r !== 'object') return;
    const key = [r.date,r.type,r.subject,r.subjectKey,r.score,r.total,r.durationSec].map(x=>String(x??'')).join('|') || String(i);
    map.set(key, r);
  });
  return Array.from(map.values()).slice(-80);
}
function syncHistoryToFirebase(h){
  const db=firebaseDb();
  if(!db || !profile?.accountId || !profile?.studentId) return;
  db.ref(`${cloudStudentBasePath()}/historyCache`).set(normalizeCloudHistory(h).slice(-80)).catch(err=>console.warn('Firebase history cache sync failed:',err));
}
function syncUsedMapToFirebase(u){
  const db=firebaseDb();
  if(!db || !profile?.accountId || !profile?.studentId) return;
  db.ref(`${cloudStudentBasePath()}/usedMap`).set(u||{}).catch(err=>console.warn('Firebase usedMap sync failed:',err));
}
async function refreshCurrentStudentCloudCache(){
  const db=firebaseDb();
  if(!db || !profile?.accountId || !profile?.studentId) return false;
  try{
    const base = cloudStudentBasePath();
    const snap = await firebaseGetOnce(base);
    if(!snap.exists()) return false;
    const data = snap.val() || {};
    if(data.name || data.avatar || data.mode){
      profile = normalizeProfile({...profile, name:data.name||profile.name, avatar:data.avatar||profile.avatar, mode:data.mode||profile.mode, createdAt:data.createdAt||profile.createdAt});
      const profiles = loadProfiles();
      profiles[accountLocalKey(profile)] = profile;
      saveProfiles(profiles);
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    }
    const localH = history();
    const remoteH = normalizeCloudHistory(data.historyCache || data.history);
    const mergedH = mergeHistoryRows(localH, remoteH);
    if(mergedH.length) localStorage.setItem(studentKey(HISTORY_KEY), JSON.stringify(mergedH.slice(-80)));
    if(data.usedMap && typeof data.usedMap === 'object') localStorage.setItem(studentKey(USED_KEY), JSON.stringify(data.usedMap));
    if(data.examSessions && typeof data.examSessions === 'object') localStorage.setItem(studentKey(EXAM_SESSION_KEY), JSON.stringify(data.examSessions));
    if(data.achievements && typeof data.achievements === 'object') localStorage.setItem(achievementStorageKey(), JSON.stringify(data.achievements));
    return true;
  }catch(err){ console.warn('Firebase student cloud cache refresh failed:',err); return false; }
}
async function refreshAllAccountProfilesFromFirebase(accountId=profile.accountId){
  const db=firebaseDb();
  if(!db || !accountId) return false;
  try{
    const snap = await firebaseGetOnce(accountPath(accountId));
    if(!snap.exists()) return false;
    const account = snap.val() || {};
    const students = account.students || {};
    const profiles = loadProfiles();
    Object.keys(students).forEach(slot=>{
      const st = students[slot] || {};
      profiles[accountLocalKey({accountId:account.accountId||accountId, studentId:slot})] = normalizeProfile({
        ...profile,
        accountId: account.accountId || accountId,
        username: account.username || profile.username,
        pin: account.pin || profile.pin || '',
        plan: account.plan || profile.plan || PREMIUM_STATUS.FREE,
        premiumCode: account.premiumCode || profile.premiumCode || '',
        entitlements: account.entitlements || profile.entitlements || {},
        subscription: account.subscription || profile.subscription || {},
        devices: account.devices || profile.devices || {},
        allowedDevices: account.allowedDevices || profile.allowedDevices || [],
        studentId: slot,
        name: st.name || '',
        avatar: st.avatar || '',
        mode: st.mode || 'rumi',
        createdAt: st.createdAt || account.createdAt || new Date().toISOString()
      });
    });
    saveProfiles(profiles);
    return true;
  }catch(err){ console.warn('Firebase account profiles refresh failed:',err); return false; }
}
function syncExamSessionsMapToFirebase(map){
  const db=firebaseDb();
  if(!db || !profile?.accountId || !profile?.studentId) return;
  db.ref(`${cloudStudentBasePath()}/examSessions`).set(map||{}).catch(err=>console.warn('Firebase exam sessions map sync failed:',err));
}
function syncProfileToFirebase(){
  const db=firebaseDb();
  if(!db || !profile?.username || !profile?.studentId) return;
  const ak = accountKey(profile.username);
  Promise.all([
    db.ref(fbPath('usernames', ak)).set({accountId: profile.accountId || ak, username: profile.username || '', subscription: profile.subscription || {}, updatedAt: new Date().toISOString()}),
    db.ref(accountPath(profile.accountId)).update(firebaseAccountPayload()),
    db.ref(studentSlotPath(profile.accountId, profile.studentId)).update(firebaseStudentPayload())
  ]).catch(err=>console.warn('Firebase profile sync failed:', err));
}
function resultStudentKey(p=profile){
  return `${safeFirebaseKey(p.accountId || p.username || 'LOCAL')}_${safeFirebaseKey(p.studentId || 'student_1')}`;
}
function calculateStudentStats(h){
  const rows = Array.isArray(h) ? h : [];
  const totalRecords = rows.length;
  const totalExam = rows.filter(x => isExamQuizType(x.type)).length;
  const totalPractice = rows.filter(x => String(x.type||'').toLowerCase().includes('practice')).length;
  const bestPercent = rows.length ? Math.max(...rows.map(x => Math.round((Number(x.score||0)/Math.max(Number(x.total||1),1))*100))) : 0;
  const averageScore = rows.length ? Math.round(rows.reduce((sum,x)=>sum+Math.round((Number(x.score||0)/Math.max(Number(x.total||1),1))*100),0)/rows.length) : 0;
  const xp = rows.reduce((sum,x)=>sum+(Number(x.score||0)*10),0) + totalExam*25 + totalPractice*10;
  return { totalRecords, totalExam, totalPractice, bestPercent, averageScore, xp };
}

const ACHIEVEMENT_DEFINITIONS = [
  {id:'first_practice', icon:'🌟', title:'Mula Hebat', desc:'Selesaikan latihan pertama.'},
  {id:'first_exam', icon:'📝', title:'Berani Exam', desc:'Selesaikan peperiksaan pertama.'},
  {id:'perfect_score', icon:'💯', title:'Perfect Score', desc:'Dapat 100% dalam mana-mana latihan atau peperiksaan.'},
  {id:'aqidah_star', icon:'🛡️', title:'Bijak Aqidah', desc:'Skor 80% atau lebih dalam subjek Aqidah.'},
  {id:'ibadah_star', icon:'🕌', title:'Bijak Ibadah', desc:'Skor 80% atau lebih dalam subjek Ibadah.'},
  {id:'sirah_star', icon:'📜', title:'Bijak Sirah', desc:'Skor 80% atau lebih dalam subjek Sirah.'},
  {id:'jawi_star', icon:'✍️', title:'Bijak Jawi', desc:'Skor 80% atau lebih dalam subjek Jawi.'},
  {id:'master_upkk', icon:'🏆', title:'Master UPKK', desc:'Skor 80% atau lebih untuk semua subjek utama.'}
];

function achievementStorageKey(){ return studentKey(ACHIEVEMENTS_KEY); }
function achievementDefinition(id){ return ACHIEVEMENT_DEFINITIONS.find(x=>x.id===id) || null; }
function loadAchievements(){
  try{ return JSON.parse(localStorage.getItem(achievementStorageKey()) || '{}') || {}; }
  catch(e){ return {}; }
}
function saveAchievementsLocal(a){
  localStorage.setItem(achievementStorageKey(), JSON.stringify(a || {}));
}
function unlockAchievement(existing, id, sourceRec=null){
  const def = achievementDefinition(id);
  if(!def || existing[id]) return false;
  existing[id] = {
    id:def.id,
    title:def.title,
    icon:def.icon,
    desc:def.desc,
    unlockedAt:new Date().toISOString(),
    source: sourceRec ? {
      type: sourceRec.type || '',
      subject: sourceRec.subject || '',
      subjectKey: sourceRec.subjectKey || '',
      score: Number(sourceRec.score || 0),
      total: Number(sourceRec.total || 0)
    } : null
  };
  return true;
}
function syncAchievementsToFirebase(achievements){
  const db=firebaseDb();
  if(!db || !profile?.accountId || !profile?.studentId) return;
  const payload = {
    achievements: achievements || {},
    achievementStats: {
      unlocked: Object.keys(achievements || {}).length,
      total: ACHIEVEMENT_DEFINITIONS.length,
      updatedAt: new Date().toISOString()
    }
  };
  db.ref(cloudStudentBasePath()).update(payload).catch(err=>console.warn('Firebase achievements sync failed:', err));
}
function evaluateAndSaveAchievements(rec=null){
  if(!profile?.accountId || !profile?.studentId) return {};
  const rows = history();
  const achievements = loadAchievements();
  const before = Object.keys(achievements).length;
  const pct = r => Math.round((Number(r.score||0) / Math.max(Number(r.total||1),1)) * 100);
  const isExamRow = r => isExamQuizType(r.type);
  const subjectOf = r => String(r.subjectKey || r.subject || '').toLowerCase();

  if(rows.some(r=>!isExamRow(r))) unlockAchievement(achievements, 'first_practice', rec);
  if(rows.some(r=>isExamRow(r))) unlockAchievement(achievements, 'first_exam', rec);
  if(rows.some(r=>pct(r) >= 100)) unlockAchievement(achievements, 'perfect_score', rec);

  ['aqidah','ibadah','sirah','jawi'].forEach(key=>{
    if(rows.some(r=>subjectOf(r).includes(key) && pct(r) >= 80)){
      unlockAchievement(achievements, `${key}_star`, rec);
    }
  });

  const required = ['aqidah','ibadah','sirah','jawi'];
  const masteredAll = required.every(key => rows.some(r=>subjectOf(r).includes(key) && pct(r) >= 80));
  if(masteredAll) unlockAchievement(achievements, 'master_upkk', rec);

  if(Object.keys(achievements).length !== before){
    saveAchievementsLocal(achievements);
    syncAchievementsToFirebase(achievements);
    window.__UPKK_LAST_UNLOCKED_BADGE = true;
  }
  return achievements;
}
function achievementsHtml(limit=8){
  const achievements = loadAchievements();
  const unlocked = Object.keys(achievements || {}).length;
  const cards = ACHIEVEMENT_DEFINITIONS.slice(0, limit).map(def=>{
    const got = achievements[def.id];
    return `<div class="stat" style="text-align:left;opacity:${got?'1':'0.48'}"><b>${def.icon} ${escapeHtml(def.title)}</b><span>${got?'Unlocked':'Locked'} • ${escapeHtml(def.desc)}</span></div>`;
  }).join('');
  return `<section class="card achievements-card"><span class="badge">🏅 ACHIEVEMENT</span><h2 class="title">Pencapaian Pelajar</h2><p class="small">${unlocked}/${ACHIEVEMENT_DEFINITIONS.length} badge sudah dibuka.</p><div style="height:8px"></div>${cards}</section>`;
}


function syncResultToFirebase(rec){
  const db=firebaseDb();
  if(!db || !profile?.studentId || !rec) return;
  const accountId = safeFirebaseKey(profile.accountId || profile.username);
  const studentSlot = safeFirebaseKey(profile.studentId || 'student_1');
  const leaderboardKey = `${accountId}_${studentSlot}`;
  const allHistory = history();
  const stats = calculateStudentStats(allHistory);
  const percent = Math.round((Number(rec.score||0)/Math.max(Number(rec.total||1),1))*100);
  const nowIso = new Date().toISOString();
  const payload = {
    ...rec,
    appCode: APP_CODE,
    accountId: profile.accountId || '',
    accountUsername: profile.username || '',
    username: profile.username || '',
    studentSlot: profile.studentId || 'student_1',
    studentId: profile.studentId || 'student_1',
    studentName: profile.name || '',
    parentUsername: profile.username || '',
    createdAt: rec.createdAt || nowIso,
    rawCreatedAt: nowIso,
    deviceId: deviceId()
  };
  const studentBase = studentSlotPath(profile.accountId, profile.studentId);
  db.ref(`${studentBase}/history`).push(payload).catch(err=>console.warn('Firebase history sync failed:', err));
  db.ref(`${studentBase}/stats`).update({...stats, lastPercent:percent, lastSubject:rec.subject, lastType:rec.type, updatedAt:nowIso}).catch(err=>console.warn('Firebase stats sync failed:', err));
  if(String(rec.type||'').toLowerCase().includes('exam')){
    const d = new Date(payload.createdAt || payload.rawCreatedAt || Date.now());
    const year = String(d.getFullYear());
    const month = String(d.getMonth()+1).padStart(2,'0');
    const examHistoryPayload = {
      ...payload,
      year,
      month,
      monthKey: `${year}-${month}`,
      percent,
      totalQuestions: Number(rec.total||0),
      source: 'finishQuiz',
      migrated: false
    };
    db.ref(fbPath('results', resultStudentKey())).push(examHistoryPayload).catch(err=>console.warn('Firebase exam result sync failed:', err));
    db.ref(fbPath('examHistory', `${safeFirebaseKey(profile.accountId || profile.username)}/${safeFirebaseKey(profile.studentId || 'student_1')}/${year}/${month}`)).push(examHistoryPayload).catch(err=>console.warn('Firebase exam history sync failed:', err));
  }
  db.ref(fbPath('leaderboard', `global/${leaderboardKey}`)).update({
    key: leaderboardKey,
    accountId: profile.accountId || '',
    accountUsername: profile.username || '',
    username: profile.username || '',
    studentSlot: profile.studentId || 'student_1',
    studentNo: Number(String(profile.studentId||'student_1').replace(/\D/g,'')) || 1,
    name: profile.name || 'NAMA BELUM DIISI',
    avatar: profile.avatar || '',
    mode: profile.mode || 'rumi',
    plan: profile.plan || PREMIUM_STATUS.FREE,
    xp: stats.xp,
    bestPercent: stats.bestPercent,
    averageScore: stats.averageScore,
    totalRecords: stats.totalRecords,
    totalExam: stats.totalExam,
    totalPractice: stats.totalPractice,
    lastScore: rec.score,
    lastTotal: rec.total,
    lastPercent: percent,
    lastSubject: rec.subject,
    lastType: rec.type,
    updatedAt: new Date().toISOString()
  }).catch(err=>console.warn('Firebase leaderboard sync failed:', err));
}

function addDaysIso(days){
  const d = new Date();
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString();
}
function isFutureIso(iso){
  if(!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t > Date.now();
}
function getUsernameSubscription(){
  return profile.subscription || profile.accountSubscription || {};
}
function normalizeSubscriptionRecord(sub={}){
  const trialUntil = sub.trialUntil || sub.latihanTrialUntil || sub.trial?.endDate || sub.latihanTrial?.endDate || '';
  const examUntil = sub.examUntil || sub.examLicenseUntil || sub.exam?.endDate || sub.examLicense?.endDate || '';
  return {
    trialActive: !!(sub.trialActive ?? sub.latihanTrialActive ?? sub.trial?.active ?? sub.latihanTrial?.active),
    trialUntil,
    trialCode: sub.trialCode || sub.trial?.code || sub.latihanTrial?.code || '',
    examActive: !!(sub.examActive ?? sub.examLicenseActive ?? sub.exam?.active ?? sub.examLicense?.active),
    examUntil,
    examCode: sub.examCode || sub.exam?.code || sub.examLicense?.code || '',
    updatedAt: sub.updatedAt || ''
  };
}
function latestEntitlement(a,b){
  if(!a) return b || null;
  if(!b) return a || null;
  const ta = new Date(a.endDate || '').getTime() || 0;
  const tb = new Date(b.endDate || '').getTime() || 0;
  return tb > ta ? b : a;
}
function subscriptionToEntitlements(sub={}){
  const s = normalizeSubscriptionRecord(sub);
  const out = {};
  if(s.trialUntil || s.trialActive){
    out.latihanTrial = {active: !!s.trialActive, code: s.trialCode || '', startDate: sub.trialStartDate || '', endDate: s.trialUntil || '', validDays: Number(sub.trialValidDays || TRIAL_DAYS)};
  }
  if(s.examUntil || s.examActive){
    out.examLicense = {active: !!s.examActive, code: s.examCode || '', startDate: sub.examStartDate || '', endDate: s.examUntil || '', validDays: Number(sub.examValidDays || EXAM_LICENSE_DAYS), package:'yearly_exam'};
  }
  return out;
}
function entitlementsToSubscription(entitlements={}, base={}){
  const e = entitlements || {};
  const current = normalizeSubscriptionRecord(base || {});
  const trialEnd = e.latihanTrial?.endDate || current.trialUntil || '';
  const examEnd = e.examLicense?.endDate || current.examUntil || '';
  return {
    ...base,
    trialActive: !!((e.latihanTrial?.active && isFutureIso(trialEnd)) || (current.trialActive && isFutureIso(current.trialUntil))),
    trialUntil: trialEnd || '',
    trialCode: e.latihanTrial?.code || current.trialCode || '',
    trialValidDays: Number(e.latihanTrial?.validDays || base.trialValidDays || TRIAL_DAYS),
    examActive: !!((e.examLicense?.active && isFutureIso(examEnd)) || (current.examActive && isFutureIso(current.examUntil))),
    examUntil: examEnd || '',
    examCode: e.examLicense?.code || current.examCode || '',
    examValidDays: Number(e.examLicense?.validDays || base.examValidDays || EXAM_LICENSE_DAYS),
    scope: 'username',
    updatedAt: new Date().toISOString()
  };
}
function mergeSubscriptionWithEntitlements(subscription={}, entitlements={}){
  const fromSub = subscriptionToEntitlements(subscription);
  const merged = {...(entitlements || {})};
  merged.latihanTrial = latestEntitlement(merged.latihanTrial, fromSub.latihanTrial) || merged.latihanTrial;
  merged.examLicense = latestEntitlement(merged.examLicense, fromSub.examLicense) || merged.examLicense;
  return entitlementsToSubscription(merged, subscription || {});
}
function getProfileEntitlements(){
  const subEnt = subscriptionToEntitlements(getUsernameSubscription());
  const e = profile.entitlements || {};
  return {
    ...e,
    latihanTrial: latestEntitlement(e.latihanTrial, subEnt.latihanTrial),
    examLicense: latestEntitlement(e.examLicense, subEnt.examLicense)
  };
}
function hasActiveLatihanAccess(){
  const e = getProfileEntitlements();
  const s = normalizeSubscriptionRecord(getUsernameSubscription());
  return !!(e.latihanTrial && e.latihanTrial.active && isFutureIso(e.latihanTrial.endDate)) ||
         !!(e.examLicense && e.examLicense.active && isFutureIso(e.examLicense.endDate)) ||
         !!(s.trialActive && isFutureIso(s.trialUntil)) ||
         !!(s.examActive && isFutureIso(s.examUntil)) ||
         profile.plan === PREMIUM_STATUS.PREMIUM;
}
function hasActiveExamAccess(){
  const e = getProfileEntitlements();
  const s = normalizeSubscriptionRecord(getUsernameSubscription());
  return !!(e.examLicense && e.examLicense.active && isFutureIso(e.examLicense.endDate)) ||
         !!(s.examActive && isFutureIso(s.examUntil)) ||
         profile.plan === PREMIUM_STATUS.PREMIUM;
}
function entitlementLabel(){
  const e = getProfileEntitlements();
  const trial = e.latihanTrial?.active && e.latihanTrial.endDate ? new Date(e.latihanTrial.endDate).toLocaleDateString('ms-MY') : '';
  const exam = e.examLicense?.active && e.examLicense.endDate ? new Date(e.examLicense.endDate).toLocaleDateString('ms-MY') : '';
  if(hasActiveExamAccess()) return `Exam aktif hingga ${exam || 'premium'}`;
  if(hasActiveLatihanAccess()) return `Trial latihan hingga ${trial}`;
  return 'Tiada akses aktif';
}
function usernameIndexAccountId(v){
  if(!v) return '';
  if(typeof v === 'string') return v;
  if(typeof v === 'object') return v.accountId || v.uid || v.userId || '';
  return '';
}
async function loadUsernameSubscriptionFromFirebase(username=profile.username, accountId=profile.accountId, accountData=null){
  const db = firebaseDb();
  if(!db || !username) return profile.subscription || {};
  const key = safeFirebaseKey(cleanUsername(username));
  const usernameRef = db.ref(fbPath('usernames', key));
  const usernameSnap = await usernameRef.get();
  const usernameVal = usernameSnap.exists() ? usernameSnap.val() : {};
  let sub = (usernameVal && typeof usernameVal === 'object' && usernameVal.subscription) ? usernameVal.subscription : {};
  let legacyEntitlements = {};
  try{
    if(accountData && accountData.entitlements) legacyEntitlements = {...legacyEntitlements, ...accountData.entitlements};
    if(accountId){
      const legacySnap = await db.ref(fbPath('entitlements', safeFirebaseKey(accountId))).get();
      if(legacySnap.exists()) legacyEntitlements = {...legacyEntitlements, ...(legacySnap.val() || {})};
    }
  }catch(e){ console.warn('Legacy entitlement read failed:', e); }
  const merged = mergeSubscriptionWithEntitlements(sub, legacyEntitlements);
  const hasMergedData = merged.trialUntil || merged.examUntil || merged.trialActive || merged.examActive;
  if(hasMergedData || typeof usernameVal === 'string'){
    await usernameRef.set({
      accountId: accountId || usernameIndexAccountId(usernameVal) || '',
      username: cleanUsername(username),
      subscription: merged,
      migratedAt: new Date().toISOString()
    }).catch(err=>console.warn('Username subscription migration failed:', err));
  }
  return merged;
}
async function syncEntitlementsToFirebase(){
  const db = firebaseDb();
  if(!db || !profile.accountId) return;
  const username = cleanUsername(profile.username || '');
  const subscription = mergeSubscriptionWithEntitlements(profile.subscription || {}, profile.entitlements || {});
  profile.subscription = subscription;
  await db.ref(fbPath('entitlements', safeFirebaseKey(profile.accountId))).set(profile.entitlements || {});
  if(username){
    await db.ref(fbPath('usernames', safeFirebaseKey(username))).set({
      accountId: profile.accountId || '',
      username,
      subscription,
      updatedAt: new Date().toISOString()
    });
  }
  await db.ref(accountPath(profile.accountId)).update({
    plan: profile.plan || PREMIUM_STATUS.FREE,
    entitlements: profile.entitlements || {},
    subscription,
    updatedAt: new Date().toISOString()
  });
}
function normalizeAccessCodeData(data, code){
  const nowIso = new Date().toISOString();
  const type = data.type || data.codeType || ACCESS_TYPES.TRIAL;
  const validDays = Number(data.validDays || (type === ACCESS_TYPES.EXAM ? EXAM_LICENSE_DAYS : TRIAL_DAYS));
  return {
    code,
    type,
    status: data.status || 'active',
    maxUse: Number(data.maxUse || 1),
    used: Number(data.used || 0),
    validDays,
    expiresAt: data.expiresAt || data.expiryDate || '',
    createdAt: data.createdAt || nowIso
  };
}
async function redeemAccessCode(code, mode='register'){
  const clean = String(code||'').trim().toUpperCase();
  if(!clean) throw new Error('Sila masukkan access code.');
  const db = firebaseDb();
  if(!db) throw new Error('Firebase belum aktif. Semak internet/config.');
  const codeKey = safeFirebaseKey(clean);
  const codeRef = db.ref(fbPath('accessCodes', codeKey));
  const snap = await codeRef.get();
  if(!snap.exists()) throw new Error('Access code tidak sah.');
  const data = normalizeAccessCodeData(snap.val() || {}, clean);
  if(data.status !== 'active') throw new Error('Access code tidak aktif atau telah ditarik sah.');
  if(data.expiresAt && new Date(data.expiresAt).getTime() < Date.now()) throw new Error('Access code telah tamat tempoh.');
  if(data.used >= data.maxUse) throw new Error('Kuota access code telah penuh.');

  const startDate = new Date().toISOString();
  const endDate = addDaysIso(data.validDays);
  profile.entitlements = profile.entitlements || {};
  if(data.type === ACCESS_TYPES.EXAM || data.type === 'exam_yearly'){
    profile.entitlements.examLicense = {active:true, code:clean, startDate, endDate, validDays:data.validDays, package:'yearly_exam'};
    profile.plan = PREMIUM_STATUS.PREMIUM;
    profile.premiumCode = clean;
  }else if(data.type === ACCESS_TYPES.FULL || data.type === 'full_yearly'){
    profile.entitlements.latihanTrial = {active:true, code:clean, startDate, endDate, validDays:data.validDays};
    profile.entitlements.examLicense = {active:true, code:clean, startDate, endDate, validDays:data.validDays, package:'full_yearly'};
    profile.plan = PREMIUM_STATUS.PREMIUM;
    profile.premiumCode = clean;
  }else{
    profile.entitlements.latihanTrial = {active:true, code:clean, startDate, endDate, validDays:data.validDays};
    if(profile.plan !== PREMIUM_STATUS.PREMIUM) profile.plan = PREMIUM_STATUS.FREE;
  }
  await codeRef.update({
    used: data.used + 1,
    lastUsedAt: startDate,
    [`usedBy/${safeFirebaseKey(profile.accountId || profile.username || deviceId())}`]: {
      accountId: profile.accountId || '',
      username: profile.username || '',
      studentId: profile.studentId || 'student_1',
      deviceId: deviceId(),
      redeemedAt: startDate,
      mode
    }
  });
  profile.subscription = mergeSubscriptionWithEntitlements(profile.subscription || {}, profile.entitlements || {});
  await syncEntitlementsToFirebase().catch(()=>{});
  saveProfile();
  return data;
}
async function redeemExamLicenseFromSettings(){
  if(!profile.accountId){ alert('Sila login dahulu.'); return; }
  const code = await appPrompt('Masukkan kod lesen peperiksaan 1 tahun:', {title:'Redeem Lesen Peperiksaan', placeholder:'Contoh: EXAM-AB12-XK92'});
  if(code === null) return;
  try{
    const data = await redeemAccessCode(code, 'upgrade');
    alert(data.type === ACCESS_TYPES.TRIAL ? 'Kod trial berjaya diredeem.' : 'Lesen peperiksaan berjaya diaktifkan.');
    page='exam'; render();
  }catch(err){ alert(err.message || 'Gagal redeem code.'); }
}

async function activatePremiumCode(code){
  const clean = String(code||'').trim().toUpperCase();
  if(!clean){ alert('Sila masukkan kod premium.'); return; }
  const db=firebaseDb();
  if(!db){ alert('Firebase belum aktif. Semak firebase-config.js dan internet.'); return; }
  const codeKey = safeFirebaseKey(clean);
  const codeRef = db.ref(fbPath('premiumCodes', codeKey));
  try{
    const snap = await codeRef.get();
    if(!snap.exists()){ alert('Kod premium tidak sah.'); return; }
    const data = snap.val() || {};
    if(data.status === 'used' && data.usedBy !== profile.studentId){ alert('Kod ini telah digunakan oleh murid lain.'); return; }
    const expiry = data.expiryDate ? new Date(data.expiryDate + 'T23:59:59') : null;
    if(expiry && expiry < new Date()){ alert('Kod premium ini telah tamat tempoh.'); return; }
    profile.plan = PREMIUM_STATUS.PREMIUM;
    profile.premiumCode = clean;
    const deviceCheck = ensureCurrentDeviceAllowed(profile);
    if(!deviceCheck.ok){ alert('Akaun ini sudah digunakan pada 2 device. Buang device lama di Setting.'); return; }
    profile.devices = deviceCheck.devices;
    profile.allowedDevices = Object.values(profile.devices).filter(d=>d.active!==false).map(d=>d.deviceId);
    saveProfile();
    await codeRef.update({status:'used', usedBy:profile.studentId, deviceId:deviceId(), activatedAt:new Date().toISOString(), appCode:APP_CODE});
    alert('Premium berjaya diaktifkan. Peperiksaan telah dibuka.');
    page='exam'; render();
  }catch(err){ console.warn(err); alert('Gagal semak kod premium. Semak internet atau Firebase Rules.'); }
}
async function showPremiumModal(){
  const code = await appPrompt('Masukkan kod premium unik:', {title:'Kod Premium', placeholder:'Contoh: PREMIUM-XXXXX'});
  if(code !== null) activatePremiumCode(code);
}


const $app = document.getElementById('app');
const $splash = document.getElementById('splashScreen');
const $phoneShell = document.getElementById('phoneShell');

function randomId(){ return `${ID_PREFIX}-${APP_YEAR_SHORT}-` + String(Math.floor(10000 + Math.random()*90000)); }
function nextMainAccountId(){
  const key='upkkSmartKidsMainAccountCounter_v700';
  let n=Number(localStorage.getItem(key)||'0')+1;
  localStorage.setItem(key, String(n));
  return `${ID_PREFIX}-${APP_YEAR_SHORT}-` + String(n).padStart(5,'0');
}

async function nextMainAccountIdFirebaseFirst(){
  const db = firebaseDb();
  if(!db) return nextMainAccountId();
  const counterPath = fbPath('systemCounters', `student${APP_YEAR_SHORT}`);
  try{
    const ref = db.ref(counterPath);
    const result = await ref.transaction(current => (Number(current || 0) + 1));
    const n = Number(result?.snapshot?.val?.() || 1);
    return `${ID_PREFIX}-${APP_YEAR_SHORT}-` + String(n).padStart(5,'0');
  }catch(err){
    console.warn('Firebase counter failed, fallback local counter:', err);
    return nextMainAccountId();
  }
}
function accountLocalKey(p=profile){ return `${safeFirebaseKey(p.accountId || p.mainId || p.username || 'LOCAL')}_${safeFirebaseKey(p.studentId || 'student_1')}`; }
function displayStudentId(){ return profile.accountId || profile.mainId || `${ID_PREFIX}-${APP_YEAR_SHORT}-AUTO`; }
function deviceId(){ const k='upkkSmartKidsDeviceId_v600'; let id=localStorage.getItem(k); if(!id){ id='DEV-' + Math.random().toString(36).slice(2,8).toUpperCase() + '-' + Date.now().toString(36).slice(-4).toUpperCase(); localStorage.setItem(k,id); } return id; }
function simpleHash(str){
  let h = 0;
  const text = String(str||'');
  for(let i=0;i<text.length;i++){ h = ((h<<5)-h) + text.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(36).toUpperCase();
}
function deviceFingerprint(){
  // Fingerprint ini bukan untuk tracking iklan; hanya supaya device yang sama tidak dikira device baru selepas logout/login semula.
  const parts = [
    navigator.userAgent || '',
    navigator.platform || '',
    navigator.language || '',
    screen?.width || '',
    screen?.height || '',
    screen?.colorDepth || '',
    Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  ];
  return 'FP-' + simpleHash(parts.join('|'));
}

function deviceKey(id=deviceId()){ return safeFirebaseKey(id); }
function detectDeviceName(){
  const ua = navigator.userAgent || '';
  if(/Android/i.test(ua)) return 'Android Phone';
  if(/iPhone/i.test(ua)) return 'iPhone';
  if(/iPad/i.test(ua)) return 'iPad';
  if(/Windows/i.test(ua)) return 'Windows PC';
  if(/Mac/i.test(ua)) return 'Mac';
  return 'Device';
}
function detectPlatform(){
  const ua = navigator.userAgent || '';
  if(/Android/i.test(ua)) return 'Android';
  if(/iPhone|iPad/i.test(ua)) return 'iOS';
  if(/Windows/i.test(ua)) return 'Windows';
  if(/Mac/i.test(ua)) return 'MacOS';
  return navigator.platform || 'Unknown';
}
function detectBrowser(){
  const ua = navigator.userAgent || '';
  if(/Edg\//i.test(ua)) return 'Edge';
  if(/Chrome\//i.test(ua)) return 'Chrome';
  if(/Safari\//i.test(ua)) return 'Safari';
  if(/Firefox\//i.test(ua)) return 'Firefox';
  return 'Browser';
}
function currentDeviceRecord(existing={}){
  return {
    ...existing,
    deviceId: deviceId(),
    fingerprint: deviceFingerprint(),
    deviceName: detectDeviceName(),
    platform: detectPlatform(),
    browser: detectBrowser(),
    firstLogin: existing.firstLogin || existing.createdAt || new Date().toISOString(),
    lastLogin: new Date().toISOString(),
    lastActive: new Date().toISOString(),
    active: true
  };
}
function normalizeDeviceMap(devices, fallbackAllowed){
  const out = {};
  if(devices && typeof devices === 'object' && !Array.isArray(devices)){
    Object.entries(devices).forEach(([k,v])=>{
      if(!v) return;
      const rec = typeof v === 'string' ? {deviceId:v, deviceName:v, active:true} : {...v};
      const id = rec.deviceId || k;
      out[deviceKey(id)] = {
        deviceId: id,
        deviceName: rec.deviceName || id,
        fingerprint: rec.fingerprint || '',
        platform: rec.platform || '',
        browser: rec.browser || '',
        lastLogin: rec.lastLogin || '',
        lastActive: rec.lastActive || rec.lastLogin || '',
        active: rec.active !== false
      };
    });
  }
  if(Array.isArray(fallbackAllowed)){
    fallbackAllowed.forEach(id=>{
      if(!id) return;
      const k = deviceKey(id);
      if(!out[k]) out[k] = {deviceId:id, fingerprint:id===deviceId()?deviceFingerprint():'', deviceName:id===deviceId()?detectDeviceName():id, platform:'', browser:'', lastLogin:'', lastActive:'', active:true};
    });
  }
  return out;
}
function activeDeviceCount(devices){ return Object.values(normalizeDeviceMap(devices)).filter(d=>d.active !== false).length; }
function findSamePhysicalDeviceKey(devices){
  const normalized = normalizeDeviceMap(devices);
  const k = deviceKey();
  if(normalized[k]) return k;
  const fp = deviceFingerprint();
  const platform = detectPlatform();
  const browser = detectBrowser();
  const name = detectDeviceName();
  return Object.keys(normalized).find(key=>{
    const d = normalized[key] || {};
    if(d.fingerprint && d.fingerprint === fp) return true;
    // Fallback untuk record lama v7.08 yang belum ada fingerprint.
    return !d.fingerprint && d.platform === platform && d.browser === browser && d.deviceName === name;
  }) || '';
}
function upsertCurrentDevice(devices){
  const normalized = normalizeDeviceMap(devices);
  const currentKey = deviceKey();
  const sameKey = findSamePhysicalDeviceKey(normalized);
  const previous = sameKey ? normalized[sameKey] : {};
  if(sameKey && sameKey !== currentKey) delete normalized[sameKey];
  normalized[currentKey] = currentDeviceRecord(previous);
  return normalized;
}
function ensureCurrentDeviceAllowed(accountData={}){
  let devices = normalizeDeviceMap(accountData.devices, accountData.allowedDevices);
  const currentKey = deviceKey();
  const sameKey = findSamePhysicalDeviceKey(devices);
  if(!devices[currentKey] && !sameKey && activeDeviceCount(devices) >= DEVICE_LIMIT) return {ok:false, devices};
  devices = upsertCurrentDevice(devices);
  return {ok:true, devices};
}
async function syncDevicesToFirebase(devices=profile.devices){
  const db = firebaseDb();
  if(!db || !profile?.accountId) return false;
  try{
    await db.ref(`${accountPath(profile.accountId)}/devices`).set(normalizeDeviceMap(devices));
    return true;
  }catch(err){ console.warn('Device sync failed:', err); return false; }
}

function deviceSignature(devices){
  try{ return JSON.stringify(normalizeDeviceMap(devices)); }catch(e){ return ''; }
}
function stopDeviceRealtimeListener(){
  try{ if(deviceListenerRef) deviceListenerRef.off('value'); }catch(e){}
  deviceListenerRef = null;
  deviceListenerAccountId = '';
}
function startDeviceRealtimeListener(){
  const db = firebaseDb();
  if(!db || !profile?.accountId) return;
  const accountId = safeFirebaseKey(profile.accountId);
  if(deviceListenerRef && deviceListenerAccountId === accountId) return;
  stopDeviceRealtimeListener();
  deviceListenerAccountId = accountId;
  deviceListenerRef = db.ref(`${accountPath(accountId)}/devices`);
  deviceListenerRef.on('value', snap=>{
    const remote = snap.exists() ? normalizeDeviceMap(snap.val()) : normalizeDeviceMap(profile.devices, profile.allowedDevices);
    const sig = deviceSignature(remote);
    if(sig === lastDeviceSignature) return;
    lastDeviceSignature = sig;
    profile.devices = remote;
    profile.allowedDevices = Object.values(remote).filter(d=>d.active!==false).map(d=>d.deviceId);
    saveProfile();
    if(page === 'settings' && !deviceRenderLock){
      if(guardRenderWhileTyping()) return;
      deviceRenderLock = true;
      setTimeout(()=>{ deviceRenderLock = false; if(page === 'settings' && !isTypingField()) render(); }, 180);
    }
  }, err=>console.warn('Device realtime listener failed:', err));
}
function firebaseErrorText(err){
  const code = String(err?.code || err?.message || err || '').toLowerCase();
  if(code.includes('permission') || code.includes('denied')) return 'Firebase Rules belum benarkan baca/tulis node device/login.';
  if(code.includes('network') || code.includes('offline')) return 'Internet tidak stabil atau Firebase tidak dapat dicapai.';
  return 'Ralat Firebase. Semak Rules dan databaseURL.';
}
async function firebaseGetOnce(path){
  const db = firebaseDb();
  if(!db) throw new Error('FIREBASE_NOT_ENABLED');
  const ref = db.ref(path);
  if(typeof ref.get === 'function') return await ref.get();
  return await new Promise((resolve,reject)=>ref.once('value', resolve, reject));
}
async function registerCurrentDeviceOnLogin(accountId, devices={}, fallbackAllowed=[]){
  const db = firebaseDb();
  const safeAccountId = safeFirebaseKey(accountId || profile.accountId || '');
  let remoteDevices = normalizeDeviceMap(devices, fallbackAllowed);
  if(db && safeAccountId){
    try{
      const snap = await firebaseGetOnce(`${fbPath('users', safeAccountId)}/devices`);
      if(snap.exists()) remoteDevices = normalizeDeviceMap(snap.val());
    }catch(err){
      console.warn('Device read failed:', err);
      return {ok:false, devices:remoteDevices, reason:firebaseErrorText(err)};
    }
  }
  const k = deviceKey();
  const sameKey = findSamePhysicalDeviceKey(remoteDevices);
  if(!remoteDevices[k] && !sameKey && activeDeviceCount(remoteDevices) >= DEVICE_LIMIT){
    return {ok:false, devices:remoteDevices, reason:'Akaun ini sudah mencapai had 2 device. Buang device lama di Setting atau tekan Reset All Devices daripada device yang masih boleh login.'};
  }
  remoteDevices = upsertCurrentDevice(remoteDevices);
  if(db && safeAccountId){
    try{
      // Wajib tulis device semasa dahulu. Kalau ini gagal, setting tidak akan papar device PC/phone.
      await db.ref(`${fbPath('users', safeAccountId)}/devices`).set(remoteDevices);
      // Update metadata akaun. Jika metadata gagal, jangan gagalkan login sebab device sudah berjaya direkod.
      await db.ref(`${fbPath('users', safeAccountId)}`).update({
        lastDeviceId: deviceId(),
        lastLoginAt: new Date().toISOString(),
        deviceLimit: DEVICE_LIMIT
      }).catch(err=>console.warn('Device metadata update failed:', err));
    }catch(err){
      console.warn('Device auto register failed:', err);
      return {ok:false, devices:remoteDevices, reason:firebaseErrorText(err)};
    }
  }
  return {ok:true, devices:remoteDevices};
}
async function refreshDevicesFromFirebase(silent=false){
  const db = firebaseDb();
  if(!db || !profile?.accountId) return;
  try{
    const snap = await firebaseGetOnce(`${accountPath(profile.accountId)}/devices`);
    const remote = snap.exists() ? normalizeDeviceMap(snap.val()) : normalizeDeviceMap(profile.devices, profile.allowedDevices);
    const currentKey = deviceKey();
    const sameKey = findSamePhysicalDeviceKey(remote);
    if(remote[currentKey] || sameKey || activeDeviceCount(remote) < DEVICE_LIMIT){
      const merged = upsertCurrentDevice(remote);
      await db.ref(`${accountPath(profile.accountId)}/devices`).set(merged);
      Object.keys(remote).forEach(k=>delete remote[k]);
      Object.assign(remote, merged);
    }
    profile.devices = remote;
    profile.allowedDevices = Object.values(remote).filter(d=>d.active!==false).map(d=>d.deviceId);
    saveProfile();
    if(page === 'settings' && !silent) render();
  }catch(err){ console.warn('Device refresh failed:', err); if(!silent) alert('Gagal refresh device. Semak internet/Firebase Rules.'); }
}
async function removeDevice(deviceIdToRemove){
  if(!deviceIdToRemove) return;
  const devices = normalizeDeviceMap(profile.devices, profile.allowedDevices);
  if(deviceIdToRemove === deviceId()) { alert('Device ini sedang digunakan. Guna Reset All Devices jika mahu kekalkan device ini sahaja.'); return; }
  appConfirm('Buang device ini daripada akaun?', async ()=>{
    delete devices[deviceKey(deviceIdToRemove)];
    profile.devices = devices;
    profile.allowedDevices = Object.values(devices).filter(d=>d.active!==false).map(d=>d.deviceId);
    saveProfile();
    await syncDevicesToFirebase(devices);
    alert('Device berjaya dibuang.');
    page='settings'; render();
  });
}
function blankProfile(){ return { appCode:APP_CODE, accountId:'', studentId: '', username:'', name:'', avatar:'', mode:'rumi', pin:'', plan:PREMIUM_STATUS.FREE, premiumCode:'', allowedDevices:[deviceId()], devices:{[deviceKey()]:currentDeviceRecord()}, maxLoginAttempt:MAX_LOGIN_ATTEMPTS, temporaryLock:false, loginAttempts:0, lockedUntil:'', seed: Math.floor(Math.random()*999999999), createdAt: new Date().toISOString() }; }
function loadProfiles(){
  try{
    const raw = JSON.parse(localStorage.getItem(PROFILES_KEY)||'{}') || {};
    const cleaned = {};
    Object.values(raw).forEach(item=>{
      const p = normalizeProfile(item);
      if(p.studentId && (p.accountId || p.username)) cleaned[accountLocalKey(p)] = p;
    });
    if(Object.keys(cleaned).length !== Object.keys(raw).length || Object.keys(raw).some(k=>!cleaned[k])) saveProfiles(cleaned);
    return cleaned;
  }catch(e){return{}}
}
function saveProfiles(map){
  const cleaned = {};
  Object.values(map||{}).forEach(item=>{
    const p = normalizeProfile(item);
    if(p.studentId && (p.accountId || p.username)) cleaned[accountLocalKey(p)] = p;
  });
  localStorage.setItem(PROFILES_KEY, JSON.stringify(cleaned));
}
function normalizeProfile(p){
  const out={...blankProfile(), ...(p||{})};
  out.appCode=APP_CODE;
  out.accountId = String(out.accountId || out.mainId || '').trim().toUpperCase();
  if(isOfficialStudentId(out.studentId) && !out.accountId){ out.accountId = out.studentId; out.studentId = 'student_1'; }
  if(!out.studentId && out.accountId) out.studentId = 'student_1';
  if(out.studentId && !isStudentProfileId(out.studentId)) out.studentId='student_1';
  out.username=cleanUsername(out.username || out.name || '');
  if(!out.mode || out.mode==='dual') out.mode='rumi';
  out.pin=String(out.pin||'').replace(/\D/g,'').slice(0,PIN_LENGTH);
  out.plan=out.plan===PREMIUM_STATUS.PREMIUM?PREMIUM_STATUS.PREMIUM:PREMIUM_STATUS.FREE;
  out.devices = normalizeDeviceMap(out.devices, out.allowedDevices);
  out.allowedDevices = Object.values(out.devices).filter(d=>d.active!==false).map(d=>d.deviceId);
  if(!out.devices[deviceKey()] && activeDeviceCount(out.devices)<DEVICE_LIMIT){ out.devices[deviceKey()] = currentDeviceRecord(); }
  out.allowedDevices = Object.values(out.devices).filter(d=>d.active!==false).map(d=>d.deviceId);
  out.subscription = normalizeSubscriptionRecord(out.subscription || out.accountSubscription || {});
  if(!out.entitlements || typeof out.entitlements !== 'object') out.entitlements = {};
  out.name=uppercaseName(out.name||'').trim();
  out.maxLoginAttempt=MAX_LOGIN_ATTEMPTS;
  out.loginAttempts=Number(out.loginAttempts||0);
  out.temporaryLock=!!out.temporaryLock;
  out.lockedUntil=out.lockedUntil||'';
  if(out.lockedUntil && new Date(out.lockedUntil) <= new Date()){ out.temporaryLock=false; out.loginAttempts=0; out.lockedUntil=''; }
  return out;
}
function saveDraftProfile(){
  const draft = normalizeProfile(profile);
  draft.studentId = '';
  localStorage.setItem(DRAFT_PROFILE_KEY, JSON.stringify(draft));
  localStorage.setItem(PROFILE_KEY, JSON.stringify(draft));
}
function loadDraftProfile(){
  try{
    const raw = localStorage.getItem(DRAFT_PROFILE_KEY) || localStorage.getItem(PROFILE_KEY);
    if(!raw) return null;
    const draft = normalizeProfile(JSON.parse(raw));
    if(draft.studentId) return null;
    return draft;
  }catch(e){ return null; }
}
function profileMatchKey(p){ return cleanUsername(p.username || p.name || ''); }
function findExistingProfile(username){
  const key = cleanUsername(username);
  return Object.values(loadProfiles()).map(normalizeProfile).find(p=>profileMatchKey(p)===key) || null;
}
function cleanupDuplicateProfiles(){
  // v6.98: Jangan gabungkan profil berdasarkan username.
  // Satu username memang boleh ada student_1, student_2 dan student_3.
  const cleaned = {};
  Object.values(loadProfiles()).map(normalizeProfile).filter(p=>p.studentId).forEach(p=>{
    cleaned[accountLocalKey(p)] = p;
  });
  saveProfiles(cleaned);
  return cleaned;
}
function loadProfile(){
  const profiles = cleanupDuplicateProfiles();

  // v6.93: Jangan auto buka profil tersimpan selepas logout.
  // Profil murid kekal disimpan dalam device, tetapi UI index hanya paparkan Login / Daftar Baru
  // sehingga user login semula menggunakan username + PIN.
  if(!isLoggedInSession()){
    const draft = loadDraftProfile();
    if(draft && (draft.username || draft.pin || draft.avatar)) return draft;
    return blankProfile();
  }

  const currentId = localStorage.getItem(CURRENT_PROFILE_ID_KEY);
  if(currentId && profiles[currentId]) return normalizeProfile(profiles[currentId]);

  // Jika session masih login tetapi current profile hilang, baru fallback ke profil pertama.
  const firstId = Object.keys(profiles)[0];
  if(firstId){ localStorage.setItem(CURRENT_PROFILE_ID_KEY, firstId); return normalizeProfile(profiles[firstId]); }

  for(const key of LEGACY_PROFILE_KEYS){
    const raw = localStorage.getItem(key);
    if(raw){ try { const migrated=normalizeProfile(JSON.parse(raw)); if(!migrated.studentId){ saveDraftProfile(); return migrated; } const m=loadProfiles(); m[migrated.studentId]=migrated; saveProfiles(m); localStorage.setItem(CURRENT_PROFILE_ID_KEY, migrated.studentId); localStorage.setItem(PROFILE_KEY, JSON.stringify(migrated)); return migrated; } catch(e){} }
  }
  return blankProfile();
}
function saveProfile(){
  profile=normalizeProfile(profile);
  if(!profile.studentId){ saveDraftProfile(); return; }
  const profiles=loadProfiles(); profiles[accountLocalKey(profile)]=profile; saveProfiles(profiles); localStorage.setItem(CURRENT_PROFILE_ID_KEY, accountLocalKey(profile)); localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); localStorage.setItem(LOGGED_IN_KEY, '1'); localStorage.removeItem(DRAFT_PROFILE_KEY); syncProfileToFirebase();
}
function activeStudentId(){ return accountLocalKey(profile); }
function historyForProfile(p){ try{return JSON.parse(localStorage.getItem(`${HISTORY_KEY}_${accountLocalKey(p)}`)||'[]')}catch(e){return[]} }
function historyForId(id){ const p = Object.values(loadProfiles()).map(normalizeProfile).find(x => x.studentId === id || accountLocalKey(x) === id); return p ? historyForProfile(p) : []; }
function studentKey(base){ return `${base}_${activeStudentId()}`; }
function history(){ try{return JSON.parse(localStorage.getItem(studentKey(HISTORY_KEY))||'[]')}catch(e){return[]} }
function saveHistory(h){ const rows=normalizeCloudHistory(h).slice(-80); localStorage.setItem(studentKey(HISTORY_KEY), JSON.stringify(rows)); syncHistoryToFirebase(rows); }
function usedMap(){ try{return JSON.parse(localStorage.getItem(studentKey(USED_KEY))||'{}')}catch(e){return{}} }
function saveUsed(u){ localStorage.setItem(studentKey(USED_KEY), JSON.stringify(u||{})); syncUsedMapToFirebase(u||{}); }
async function switchProfile(profileKey){
  upkkPlaySound('switchStudent');
  const profiles=loadProfiles();
  if(!profiles[profileKey]) return;
  const previousPage = page;
  const stablePages = ['home','subjects','exam','result','settings'];
  profile=normalizeProfile(profiles[profileKey]);
  localStorage.setItem(CURRENT_PROFILE_ID_KEY, accountLocalKey(profile));
  localStorage.setItem(LOGGED_IN_KEY, '1');
  saveProfile();
  currentQuiz=null;
  selectedAnswer=null;
  await refreshCurrentStudentCloudCache();
  if(previousPage === 'settings'){
    // Keep the Settings screen stable when switching student.
    // Do not inject the old "Nota" hero card because it can overlap on small screens/PWA cached layouts.
    window.__UPKK_SETTING_NOTICE = '';
  }
  page = stablePages.includes(previousPage) ? previousPage : 'home';
  render();
  if(page==='exam') setTimeout(scrollMainToTop, 0);
}
function startAddStudentProfile(){
  if(!profile.studentId){ alert('Sila login dahulu.'); return; }
  const parentUsername = profile.username || '';
  const sameFamily = Object.values(loadProfiles()).map(normalizeProfile).filter(p => p.accountId === profile.accountId);
  if(sameFamily.length >= 3){ alert('Maksimum 3 pelajar untuk satu username.'); return; }
  window.__UPKK_ADD_STUDENT_FORM = true;
  window.__UPKK_NEW_STUDENT = { name:'', avatar:'', mode: profile.mode || 'rumi' };
  page='settings';
  render();
}
async function addStudentProfile(){ startAddStudentProfile(); }
function cancelAddStudentProfile(){
  window.__UPKK_ADD_STUDENT_FORM = false;
  window.__UPKK_NEW_STUDENT = null;
  page='settings';
  render();
}
function syncNewStudentDraftFromForm(){
  window.__UPKK_NEW_STUDENT = window.__UPKK_NEW_STUDENT || {name:'', avatar:'', mode:'rumi'};
  const nameInput = document.getElementById('newStudentFullNameInput');
  if(nameInput) window.__UPKK_NEW_STUDENT.name = uppercaseName(nameInput.value || '');
  return window.__UPKK_NEW_STUDENT;
}
function updateNewStudentPickerUI(){
  const draft = window.__UPKK_NEW_STUDENT || {};
  document.querySelectorAll('[data-new-student-avatar]').forEach(btn=>{
    btn.classList.toggle('active', btn.getAttribute('data-new-student-avatar') === draft.avatar);
  });
  document.querySelectorAll('[data-new-student-mode]').forEach(btn=>{
    const mode = btn.getAttribute('data-new-student-mode');
    btn.classList.toggle('active', mode === (draft.mode === 'jawi' ? 'jawi' : 'rumi'));
  });
}
function selectNewStudentAvatar(a){
  upkkPlaySound('selectAvatar');
  const draft = syncNewStudentDraftFromForm();
  draft.avatar = a;
  updateNewStudentPickerUI();
}
function selectNewStudentMode(m){
  const draft = syncNewStudentDraftFromForm();
  draft.mode = (m==='jawi') ? 'jawi' : 'rumi';
  updateNewStudentPickerUI();
}
async function saveNewStudentProfile(){
  if(!profile.studentId){ alert('Sila login dahulu.'); return; }
  const parent = normalizeProfile(profile);
  const parentUsername = parent.username || '';
  const sameFamily = Object.values(loadProfiles()).map(normalizeProfile).filter(p => p.accountId === profile.accountId);
  if(sameFamily.length >= 3){ alert('Maksimum 3 pelajar untuk satu username.'); return; }
  const draft = window.__UPKK_NEW_STUDENT || {};
  const fullName = uppercaseName(document.getElementById('newStudentFullNameInput')?.value || draft.name || '').trim();
  if(!fullName){ alert('Sila isi nama penuh pelajar.'); return; }
  if(!draft.avatar){ alert('Sila pilih avatar pelajar.'); return; }
  const newProfile = blankProfile();
  newProfile.accountId = parent.accountId;
  newProfile.username = parentUsername;
  newProfile.pin = parent.pin || '';
  newProfile.plan = parent.plan || PREMIUM_STATUS.FREE;
  newProfile.premiumCode = parent.premiumCode || '';
  newProfile.devices = normalizeDeviceMap(parent.devices, parent.allowedDevices);
  newProfile.allowedDevices = Object.values(newProfile.devices).filter(d=>d.active!==false).map(d=>d.deviceId);
  newProfile.studentId = nextStudentProfileId(parentUsername);
  newProfile.name = fullName;
  newProfile.avatar = draft.avatar;
  newProfile.mode = (draft.mode==='jawi') ? 'jawi' : 'rumi';
  profile = normalizeProfile(newProfile);
  saveProfile();
  try{ await updateCurrentStudentFirebase(); await refreshAllAccountProfilesFromFirebase(profile.accountId); }
  catch(err){ console.warn('Firebase new student sync failed:', err); alert('Profil pelajar disimpan di device, tetapi gagal sync ke Firebase. Semak internet atau Firebase Rules.'); return; }
  window.__UPKK_ADD_STUDENT_FORM = false;
  window.__UPKK_NEW_STUDENT = null;
  currentQuiz=null; selectedAnswer=null;
  alert('Profil pelajar baru berjaya disimpan.');
  page='settings';
  render();
}

// Backward compatible aliases for older inline buttons/routes
const startAddChildProfile = startAddStudentProfile;
const addChildProfile = addStudentProfile;
const cancelAddChildProfile = cancelAddStudentProfile;
const selectNewChildAvatar = selectNewStudentAvatar;
const selectNewChildMode = selectNewStudentMode;
const saveNewChildProfile = saveNewStudentProfile;

async function logoutStudent(){
  stopDeviceRealtimeListener();
  flushCurrentStudentProgressToFirebase();
  clearTimer();
  await clearAppRuntimeCaches();
  clearLoginSessionOnly();
  profile = blankProfile();
  currentQuiz=null; selectedAnswer=null; window.__UPKK_LOGIN_STEP='start'; page='profile'; setActiveNav(); render();
}
async function updateCurrentStudentFirebase(){
  const db = firebaseDb();
  if(!db || !profile?.accountId || !profile?.studentId) return;
  const accId = safeFirebaseKey(profile.accountId);
  const slot = safeFirebaseKey(profile.studentId || 'student_1');
  const resultKey = `${accId}_${slot}`;
  const now = new Date().toISOString();
  const studentPayload = firebaseStudentPayload();
  studentPayload.updatedAt = now;

  // v1.15 HOTFIX:
  // Profil pelajar adalah data utama Settings. Jangan gagalkan simpan profil
  // hanya kerana node optional results/leaderboard ditolak oleh Firebase Rules.
  await db.ref(studentSlotPath(profile.accountId, profile.studentId)).update(studentPayload);
  await db.ref(accountPath(profile.accountId)).update({activeStudent: profile.studentId, updatedAt: now}).catch(err=>console.warn('Firebase account active student update skipped:', err));

  const publicProfilePayload = {
    accountId: profile.accountId,
    studentId: profile.studentId,
    studentName: profile.name || '',
    avatar: profile.avatar || '',
    mode: profile.mode || 'rumi',
    updatedAt: now
  };

  db.ref(fbPath('results', resultKey)).update(publicProfilePayload).catch(err=>console.warn('Optional Firebase results profile sync skipped:', err));
  db.ref(fbPath('leaderboard', `global/${resultKey}`)).update({
    studentName: profile.name || '',
    avatar: profile.avatar || '',
    mode: profile.mode || 'rumi',
    updatedAt: now
  }).catch(err=>console.warn('Optional Firebase leaderboard profile sync skipped:', err));
}
async function updateAccountPinFirebase(){
  const db = firebaseDb();
  if(!db || !profile?.accountId) return;
  await db.ref(accountPath(profile.accountId)).update({pin:profile.pin || '', updatedAt:new Date().toISOString()});
}
async function deleteCurrentProfileFromFirebase(accountId, studentId){
  const db = firebaseDb();
  if(!db || !accountId || !studentId) return;
  const accId = safeFirebaseKey(accountId);
  const slot = safeFirebaseKey(studentId || 'student_1');
  const resultKey = `${accId}_${slot}`;

  // Core delete: wajib berjaya supaya pelajar hilang di semua device.
  await db.ref(`${accountPath(accId)}/students/${slot}`).remove();

  // Optional public nodes: jangan gagalkan delete jika Rules tidak benarkan.
  db.ref(fbPath('results', resultKey)).remove().catch(err=>console.warn('Optional Firebase results delete skipped:', err));
  db.ref(fbPath('leaderboard', `global/${resultKey}`)).remove().catch(err=>console.warn('Optional Firebase leaderboard delete skipped:', err));
}
async function deleteCurrentProfile(){
  if(!profile.studentId){ alert('Tiada profil pelajar untuk dipadam.'); return; }
  appConfirm('Padam profil pelajar ini? Rekod pelajar ini juga akan dipadam dari peranti ini dan Firebase.', async ()=>{
    const id=accountLocalKey(profile);
    const currentAccountId = profile.accountId;
    const currentStudentId = profile.studentId;
    const db=firebaseDb();
    try{ await deleteCurrentProfileFromFirebase(currentAccountId, currentStudentId); }
    catch(err){ console.warn('Firebase delete profile failed:', err); alert('Gagal padam profil di Firebase. Semak internet atau Firebase Rules.'); return; }
    const profiles=loadProfiles();
    delete profiles[id];
    saveProfiles(profiles);
    localStorage.removeItem(`${HISTORY_KEY}_${id}`);
    localStorage.removeItem(`${USED_KEY}_${id}`);
    Object.keys(localStorage).forEach(k=>{ if(k.includes(id)) localStorage.removeItem(k); });
    const next=Object.keys(profiles).find(k=>profiles[k].accountId===currentAccountId);
    if(next){
      profile=normalizeProfile(profiles[next]);
      localStorage.setItem(CURRENT_PROFILE_ID_KEY,next);
      localStorage.setItem(LOGGED_IN_KEY,'1');
      if(db) await db.ref(accountPath(currentAccountId)).update({activeStudent: profile.studentId, updatedAt:new Date().toISOString()}).catch(()=>{});
    } else {
      profile=blankProfile();
      localStorage.removeItem(CURRENT_PROFILE_ID_KEY);
      localStorage.removeItem(PROFILE_KEY);
      localStorage.removeItem(LOGGED_IN_KEY);
      if(db) await db.ref(accountPath(currentAccountId)).update({activeStudent:'', updatedAt:new Date().toISOString()}).catch(()=>{});
    }
    currentQuiz=null; selectedAnswer=null;
    page=profile.studentId?'settings':'profile';
    alert('Profil pelajar berjaya dipadam.');
    render();
  });
}
function resetCurrentStudentProgress(){ appConfirm('Reset sejarah soalan dan keputusan untuk pelajar ini sahaja?', ()=>{ localStorage.removeItem(studentKey(HISTORY_KEY)); localStorage.removeItem(studentKey(USED_KEY)); render(); }); }
function uppercaseName(v){ return (v||'').toLocaleUpperCase('ms-MY').replace(/\s+/g,' ').trimStart(); }
function avatarSrc(){ return profile.avatar === 'girl' ? 'assets/images/avatar-girl.webp' : 'assets/images/avatar-boy.webp'; }
function modeLabel(){ return profile.mode === 'jawi' ? 'JAWI' : 'RUMI'; }
function isExamQuizType(t){ const v=String(t||'').toLowerCase(); return v.includes('exam') || v.includes('peperiksaan'); }
function isPremium(){ return true; } // v7.03: Peperiksaan unlock sementara; boleh lock semula bila ready
function planLabel(){ return entitlementLabel ? entitlementLabel() : (isPremium() ? 'PREMIUM' : 'FREE'); }
function lang(){ return profile.mode === 'jawi' ? 'jawi' : 'rumi'; }
function textByMode(q, rumiKey, jawiKey){ return lang()==='jawi' ? (q[jawiKey] || q[rumiKey] || '') : (q[rumiKey] || q[jawiKey] || ''); }
function subjectTitle(s){ return lang()==='jawi' ? (s.titleJawi || s.title) : s.title; }
function rtlClass(){ return lang()==='jawi' ? ' rtl jawi' : ''; }
function questionSignature(q){
  return String((q.qRumi || q.qJawi || '')).toLowerCase().replace(/<[^>]*>/g,'').replace(/[^a-z0-9؀-ۿ]+/gi,' ').trim();
}
function allQuestions(subjectKey){
  const s = DB[subjectKey];
  return (s && Array.isArray(s.questions)) ? s.questions : [];
}
function uniqueQuestions(subjectKey){
  // v5.12: buang soalan berulang berdasarkan isi soalan, bukan ID.
  // Ini penting kerana questions.json ada ID berbeza tetapi teks soalan sama.
  const s = DB[subjectKey];
  if(!s || !s.questions) return [];
  const seen = new Set();
  const out = [];
  s.questions.forEach(q=>{
    const sigRumi = String(q.qRumi || '').toLowerCase().replace(/<[^>]*>/g,'').replace(/[^a-z0-9؀-ۿ]+/gi,' ').trim();
    const sigJawi = String(q.qJawi || '').toLowerCase().replace(/<[^>]*>/g,'').replace(/[^a-z0-9؀-ۿ]+/gi,' ').trim();
    const sig = `${sigRumi}|${sigJawi}`;
    if(!sig.trim() || seen.has(sig)) return;
    seen.add(sig);
    out.push(q);
  });
  return out;
}
function subjectQuestionCount(subjectKey){ const s=DB[subjectKey]; const loaded=uniqueQuestions(subjectKey).length; return loaded || Number(s?.questionCount||0); }
function totalQuestions(){ return Object.keys(DB).reduce((a,key)=>a+subjectQuestionCount(key),0); }
function escapeHtml(str=''){ return String(str).replace(/[&<>"]/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s])); }
function shuffle(arr){ const a=[...arr]; for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function nowMs(){ return Date.now(); }

function waitForFirebaseQuestionBank(timeoutMs=6500){
  return new Promise(resolve=>{
    const started = Date.now();
    const check = ()=>{
      if(firebaseEnabled()) return resolve(true);
      if(Date.now() - started >= timeoutMs) return resolve(false);
      setTimeout(check, 100);
    };
    check();
  });
}

function rawSubjectQuestions(subject){
  if(!subject || typeof subject !== 'object') return [];
  if(Array.isArray(subject.questions)) return subject.questions;
  if(Array.isArray(subject.items)) return subject.items;
  return Object.entries(subject)
    .filter(([k,v]) => v && typeof v === 'object' && /^(q\d+|soalan\d+|question\d+)/i.test(k))
    .map(([id,v]) => ({ id, ...v }));
}
function rawQuestionSignature(q){
  return String(q.qRumi || q.question || q.text || q.qJawi || '').toLowerCase().replace(/<[^>]*>/g,'').replace(/[^a-z0-9؀-ۿ]+/gi,' ').trim();
}
function countUniqueRawSubjectQuestions(subject){
  const seen = new Set();
  rawSubjectQuestions(subject).forEach(q=>{
    const sig = rawQuestionSignature(q);
    if(sig) seen.add(sig);
  });
  return seen.size;
}

async function loadFirebaseQuestionBank(){
  const ready = await waitForFirebaseQuestionBank(6500);
  if(!ready) throw new Error('Firebase SDK belum siap. Semak sambungan internet atau script Firebase.');
  const snap = await firebaseGetOnce(fbPath('questionBank'));
  const data = snap && snap.exists && snap.exists() ? snap.val() : null;
  if(!data || !Object.keys(data).length) throw new Error('Firebase questionBank kosong. Import firebase-database-seed.json ke Realtime Database.');
  return data;
}

async function loadFirebaseSubjectQuestionBank(subjectKey){
  const ready = await waitForFirebaseQuestionBank(6500);
  if(!ready) throw new Error('Firebase SDK belum siap. Semak sambungan internet atau script Firebase.');
  const snap = await firebaseGetOnce(fbPath('questionBank', subjectKey));
  const data = snap && snap.exists && snap.exists() ? snap.val() : null;
  if(!data || !Object.keys(data).length) throw new Error(`Firebase questionBank/${subjectKey} kosong.`);
  return data;
}

function normalizeSubject(subjectKey){
  const s = DB[subjectKey];
  if(!s || typeof s !== 'object') return;
  s.key=subjectKey; s.exam=s.exam||{};
  let rawQuestions = [];
  if(Array.isArray(s.questions)) rawQuestions = s.questions;
  else if(Array.isArray(s.items)) rawQuestions = s.items;
  else {
    rawQuestions = Object.entries(s)
      .filter(([k,v]) => v && typeof v === 'object' && /^(q\d+|soalan\d+|question\d+)/i.test(k))
      .map(([id,v]) => ({ id, ...v }));
  }
  s.questions=rawQuestions.map((q,i)=>({
    section:q.section||'BAHAGIAN A',
    instruction:q.instruction||'Jawab soalan berikut.',
    qRumi:q.qRumi||q.question||q.text||'',
    qJawi:q.qJawi||q.jawi||q.qRumi||q.question||'',
    optionsRumi:q.optionsRumi||q.options||[],
    optionsJawi:q.optionsJawi||q.optionsRumi||q.options||[],
    answer: typeof q.answer==='number'?q.answer: Number(q.answer||0),
    explain:q.explain||q.explanation||'',
    sourceNo:q.sourceNo||q.no||i+1,
    id:q.id||`${subjectKey}-${i+1}`
  })).filter(q=>q.qRumi && q.optionsRumi && q.optionsRumi.length);
  s.questionCount = Math.max(Number(s.questionCount||0), s.questions.length);
  s.lazyLoaded = s.questions.length > 0;
}

async function ensureSubjectLoaded(subjectKey, options={}){
  if(!subjectKey) return null;
  if(!DB || !Object.keys(DB).length) resetQuestionBankShell();
  if(DB[subjectKey]?.lazyLoaded && Array.isArray(DB[subjectKey]?.questions) && DB[subjectKey].questions.length) return DB[subjectKey];
  try{
    const subjectData = await loadFirebaseSubjectQuestionBank(subjectKey);
    DB[subjectKey] = {...(UPKK_SUBJECT_META[subjectKey]||{}), ...subjectData, key:subjectKey};
    normalizeSubject(subjectKey);
    window.__UPKK_QUESTION_SOURCE = 'firebase-lazy';
    return DB[subjectKey];
  }catch(err){
    console.warn('Lazy subject load failed:', subjectKey, err);
    if(options.alert !== false) alert('Bank soalan subjek ini belum dapat dimuat. Sila semak internet/Firebase dan cuba lagi.');
    return DB[subjectKey] || null;
  }
}

async function boot(){
  // FAST LOGIN MODE:
  // Paparkan login/register dahulu. Bank soalan dan cloud sync dimuat di background
  // supaya user tidak nampak splash terlalu lama semasa Firebase/questionBank besar.
  window.__UPKK_FAST_LOGIN_MODE = true;
  window.__UPKK_QUESTION_SOURCE = 'loading';

  try{ bindNav(); }catch(err){ console.warn('Bind nav failed:', err); }

  // UI masuk dahulu, bukan tunggu questionBank siap.
  startSplashFlow();

  // Firebase/questionBank sync berjalan selepas first paint.
  setTimeout(async ()=>{
    try{ await loadUpkkSoundSettingsForUser(); }catch(soundErr){ console.warn('Sound settings load skipped:', soundErr); }
    try{
      // Performance v8.25: jangan load semua questionBank semasa boot.
      // DB dimulakan sebagai shell subjek; soalan sebenar dimuat bila user pilih subjek.
      resetQuestionBankShell();
      window.__UPKK_QUESTION_SOURCE = 'lazy-shell';
    }catch(firebaseErr){
      console.warn('QuestionBank shell init failed:', firebaseErr);
      resetQuestionBankShell();
      window.__UPKK_QUESTION_SOURCE = 'firebase-error';
      window.__UPKK_DATA_LOAD_ERROR = firebaseErr.message || String(firebaseErr);
    }

    try{
      if(isLoggedInSession() && profile?.accountId){
        await refreshAllAccountProfilesFromFirebase(profile.accountId);
        await refreshCurrentStudentCloudCache();
      }
    }catch(err){ console.warn('Boot cloud sync skipped:', err); }

    try{
      if(['home','subjects','exam','result','settings','profile'].includes(page) && !isTypingField()){
        render();
      }
    }catch(err){ console.warn('Background render skipped:', err); }
  }, 60);
}

function normalizeAnswerIndex(answer, options=[]){
  if(typeof answer === 'number') return answer;
  const ans = String(answer ?? '').trim();
  if(!ans) return 0;
  const asNumber = Number(ans);
  if(Number.isFinite(asNumber)) return asNumber;
  const idx = (options || []).findIndex(x => String(x).trim() === ans);
  return idx >= 0 ? idx : 0;
}

function normalizeDB(){
  Object.entries(DB).forEach(([key,s])=>{
    if(!s || typeof s !== 'object') return;
    s.key=key; s.exam=s.exam||{};

    // v1.04: support both latest full structure and simple Firebase JSON structure.
    // Accepted formats:
    // 1) questionBank/aqidah/questions: [ ... ]
    // 2) questionBank/aqidah/q001: { question/options/answer }
    // 3) questionBank/aqidah/items: [ ... ]
    let rawQuestions = [];
    if(Array.isArray(s.questions)) rawQuestions = s.questions;
    else if(Array.isArray(s.items)) rawQuestions = s.items;
    else {
      rawQuestions = Object.entries(s)
        .filter(([k,v]) => v && typeof v === 'object' && /^(q\d+|soalan\d+|question\d+)/i.test(k))
        .map(([id,v]) => ({ id, ...v }));
    }

    s.questions=rawQuestions.map((q,i)=>({
      section:q.section||'BAHAGIAN A',
      instruction:q.instruction||'Jawab semua soalan. Pilih jawapan yang paling tepat.',
      sectionRumi:q.sectionRumi||q.section||'BAHAGIAN A',
      sectionJawi:q.sectionJawi||q.section||'بهاڬين A',
      instructionRumi:q.instructionRumi||q.instruction||'Jawab semua soalan. Pilih jawapan yang paling tepat.',
      instructionJawi:q.instructionJawi||q.instruction||'جاوب سموا سوالن. ڤيليه جواڤن يڠ ڤالين تيڤت.',
      sourceNo:q.sourceNo||i+1,
      marks:q.marks||1,
      type:q.type||'objective',
      ...q
    }));
  });
}
function isProfileComplete(){ return !!(profile.name && profile.name.trim() && profile.avatar); }
function setProfileLock(on){ document.body.classList.toggle('profile-lock', !!on); }
function startSplashFlow(){
  setProfileLock(true);
  page = 'splash';
  const requested = new URLSearchParams(location.search).get('page');
  const routeMap = {dashboard:'home',practice:'subjects',latihan:'subjects',subjects:'subjects',exam:'exam',result:'result',leaderboard:'result',profile:'settings',setting:'settings',settings:'settings',about:'home'};
  setTimeout(()=>{
    try{
      if($splash) $splash.classList.add('hide');
      if($phoneShell) $phoneShell.classList.remove('app-hidden');
      page = isLoggedInSession() ? (isProfileComplete() ? (routeMap[requested] || 'home') : 'settings') : 'profile';
      render();
    }catch(err){
      console.error('Startup render failed:', err);
      if($splash) $splash.classList.add('hide');
      if($phoneShell) $phoneShell.classList.remove('app-hidden');
      if($app){
        $app.innerHTML = `<section class="card hero"><span class="badge">⚠️ STARTUP FIX</span><h2 class="title">Sistem berjaya dibuka semula</h2><p class="subtitle">Ada komponen lama yang gagal dimuat. Tekan butang di bawah untuk masuk semula ke profil.</p><button class="btn" onclick="page='profile';currentQuiz=null;render()">Masuk Profil / Login</button></section>`;
      }
    }
  }, 250);
}
function resetProfileFlow(){ newStudentProfile(); }

function scrollMainToTop(){
  try{
    const appMain = document.querySelector('.app-main');
    const phoneShell = document.getElementById('phoneShell');
    window.scrollTo({ top: 0, behavior: 'auto' });
    if(appMain) appMain.scrollTo({ top: 0, behavior: 'auto' });
    if(phoneShell) phoneShell.scrollTo({ top: 0, behavior: 'auto' });
    const appNode = document.getElementById('app');
    if(appNode) appNode.scrollIntoView({ block: 'start', behavior: 'auto' });
  }catch(e){}
}

function bindNav(){
  document.querySelectorAll('.nav-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{ upkkPlaySound('tap'); clearTimer(); page=btn.dataset.nav; currentQuiz=null; selectedAnswer=null; setActiveNav(); render(); if(page==='exam') setTimeout(scrollMainToTop, 0); });
  });
}
function setActiveNav(){ document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.nav===page)); }
function requireProfile(){
  if(!profile.name.trim()){ alert('Sila isi nama pelajar dahulu di Setting.'); page='settings'; setActiveNav(); render(); return false; }
  if(!profile.avatar){ alert('Sila pilih avatar dahulu di Setting.'); page='settings'; setActiveNav(); render(); return false; }
  if(!profile.pin || String(profile.pin).length !== PIN_LENGTH){ alert('Sila tetapkan PIN 6 angka untuk akaun murid.'); page='settings'; setActiveNav(); render(); return false; }
  return true;
}
function resetUiLocks(){
  const app = document.getElementById('app');
  if(app){ app.style.pointerEvents='auto'; app.style.opacity='1'; }
  const hiddenNote = document.getElementById('appNoteLayer');
  if(hiddenNote && !hiddenNote.classList.contains('show')) hiddenNote.style.display='none';
}
function render(){
  resetUiLocks();
  setProfileLock(page==='profile' || !isProfileComplete());
  setActiveNav();
  if(currentQuiz) return renderQuiz();
  if(page==='subjects') return renderSubjects();
  if(page==='exam') return renderExamMenu();
  if(page==='result') return renderResult();
  if(page==='profile') return renderProfile();
  if(page==='settings') return renderSettings();
  return renderHome();
}

function familyProfiles(){
  const currentAccountId = profile.accountId || '';
  return Object.values(loadProfiles())
    .map(normalizeProfile)
    .filter(p=>p.studentId && (!currentAccountId || p.accountId===currentAccountId))
    .sort((a,b)=>String(a.studentId||'').localeCompare(String(b.studentId||''), undefined, {numeric:true}));
}
function nextStudentProfileKey(){
  const profiles = familyProfiles();
  if(profiles.length <= 1) return '';
  const activeKey = accountLocalKey(profile);
  const idx = profiles.findIndex(p=>accountLocalKey(p)===activeKey);
  const next = profiles[(idx >= 0 ? idx + 1 : 0) % profiles.length];
  return next ? accountLocalKey(next) : '';
}
function profileSummary(){
  const has = profile.name && profile.avatar;
  const studentNo = escapeHtml(String(profile.studentId||'student_1').replace('student_',''));
  const totalStudents = familyProfiles().length;
  const switchDisabled = totalStudents <= 1 ? ' disabled' : '';
  return `<div class="card profile-card dashboard-profile-card">
    <div class="profile-avatar-box">
      <img class="profile-avatar-live" src="${has?avatarSrc():'assets/images/avatar-boy.webp'}" alt="Avatar" />
    </div>
    <div class="profile-info">
      <div class="profile-name-row">
        <h3>${has?escapeHtml(profile.name):'SILA KEMASKINI NAMA PELAJAR'}</h3>
        <small class="profile-student-label">Pelajar ${studentNo}${totalStudents>1?` / ${totalStudents}`:''}</small>
      </div>
      <button class="mini-btn switch-student-btn profile-switch-main-btn" onclick="switchToNextStudent()"${switchDisabled}>🔄 Tukar Pelajar</button>
      <div class="profile-detail-grid compact-profile-detail">
        <span><b>ID</b>${escapeHtml(profile.accountId||'-')}</span>
        <span><b>Username</b>${escapeHtml(profile.username||'-')}</span>
        <span><b>Status</b>Pelajar ${studentNo}</span>
        <span><b>Mode</b>${modeLabel()}</span>
        <span><b>Plan</b>${planLabel()}</span>
      </div>
    </div>
  </div>`;
}
async function switchToNextStudent(){
  const nextKey = nextStudentProfileKey();
  if(!nextKey){ alert('Tiada pelajar lain untuk ditukar.'); return; }
  await switchProfile(nextKey);
}
function toggleStudentSwitcherPanel(){ switchToNextStudent(); }
function closeStudentSwitcherPanel(){ window.__UPKK_SHOW_STUDENT_SWITCHER = false; }
function renderDashboardStudentSwitcher(){ return ''; }
function progressCards(){
  const h=history();
  const subjectKeys=Object.keys(DB);
  if(!subjectKeys.length) return '';
  return subjectKeys.map(key=>{
    const sub=DB[key];
    const rows=h.filter(x=>x.subject===subjectTitle(sub));
    const best=rows.length?Math.max(...rows.map(x=>Math.round((x.score/x.total)*100))):0;
    return `<div class="stat" style="text-align:left"><b>${escapeHtml(subjectTitle(sub))}</b><span>${rows.length} rekod • Best ${best}%</span></div>`;
  }).join('');
}
function learningAnalysisHtml(){
  const h = history();
  const last = h.length ? h[h.length - 1] : null;
  const subjectKeys = Object.keys(DB);
  const totalSubject = subjectKeys.length || 1;
  const doneSubjects = new Set(h.map(x=>x.subject)).size;
  const progress = Math.min(100, Math.round((doneSubjects / totalSubject) * 100));
  const focusSubject = last ? last.subject : 'Belum mula';
  const focusMode = last ? last.type : 'Pilih Latihan / Peperiksaan';
  const scoreText = last ? `${last.score}/${last.total}` : '-';
  const pending = Math.max(0, totalSubject - doneSubjects);
  const streak = calculateLearningStreak(h);
  const statusText = last
    ? (pending > 0 ? `${pending} subjek belum selesai` : 'Semua subjek sudah dicuba')
    : 'Mula latihan pertama hari ini';

  return `<section class="card learning-analysis-card">
    <div class="analysis-head">
      <div>
        <span class="badge">📘 ANALISA PEMBELAJARAN</span>
        <h2 class="title">Aktiviti semasa pelajar</h2>
      </div>
      <div class="analysis-percent">${progress}%</div>
    </div>
    <div class="analysis-progress"><span style="width:${progress}%"></span></div>
    <div class="analysis-grid">
      <div class="analysis-item"><b>Subjek Fokus</b><span>${escapeHtml(focusSubject)}</span></div>
      <div class="analysis-item"><b>Mode Terakhir</b><span>${escapeHtml(focusMode)}</span></div>
      <div class="analysis-item"><b>Markah Terkini</b><span>${escapeHtml(scoreText)}</span></div>
      <div class="analysis-item"><b>Belum Selesai</b><span>${pending} Subjek</span></div>
      <div class="analysis-item"><b>Streak</b><span>${streak} Hari 🔥</span></div>
      <div class="analysis-item"><b>Status</b><span>${escapeHtml(statusText)}</span></div>
    </div>
  </section>`;
}
function calculateLearningStreak(rows){
  if(!rows || !rows.length) return 0;
  const daySet = new Set(rows.map(r=>{
    const d = new Date(r.date || r.createdAt || Date.now());
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0,10);
  }).filter(Boolean));
  let streak = 0;
  const cursor = new Date();
  for(let i=0;i<365;i++){
    const key = cursor.toISOString().slice(0,10);
    if(daySet.has(key)) streak++;
    else if(streak>0) break;
    cursor.setDate(cursor.getDate()-1);
  }
  return streak;
}
function leaderboardHtml(limit=5){
  const rows=[];
  const activeAccountId = profile.accountId || '';
  Object.values(loadProfiles()).map(normalizeProfile)
    .filter(p=>p.studentId && (!activeAccountId || p.accountId === activeAccountId))
    .forEach(p=>{
    const h=historyForProfile(p);
    const stats=calculateStudentStats(h);
    rows.push({
      name:p.name||'NAMA BELUM DIISI',
      avatar:p.avatar,
      studentId:p.studentId,
      accountId:p.accountId,
      best:stats.bestPercent,
      average:stats.averageScore,
      xp:stats.xp,
      total:stats.totalRecords,
      active:accountLocalKey(p)===accountLocalKey(profile)
    });
  });
  rows.sort((a,b)=> b.xp-a.xp || b.best-a.best || b.average-a.average || b.total-a.total || a.name.localeCompare(b.name));
  if(!rows.length) return `<div class="empty">Belum ada leaderboard.</div>`;
  return rows.slice(0,limit).map((r,i)=>`<div class="exam-row ${r.active?'active':''}"><div><b>${i+1}. ${escapeHtml(r.name)}</b><br><span>Pelajar ${escapeHtml(String(r.studentId||'student_1').replace('student_',''))} • ${r.total} rekod • Avg ${r.average}%</span></div><div class="pill">${r.xp} XP</div></div>`).join('');
}
function renderHome(){
  const h=history(); const best=h.length?Math.max(...h.map(x=>Math.round((x.score/x.total)*100))):0; const last=h.at(-1);
  const switcher = renderDashboardStudentSwitcher();
  $app.innerHTML = `<div class="settings-page-clean">${profileSummary()}
  ${switcher}
  ${learningAnalysisHtml()}
  ${achievementsHtml(8)}
  <section class="card dashboard-action-card">
    <span class="badge">📚 MASUK SUBJEK</span>
    <div class="dashboard-stats-row"><div class="stat"><b>${totalQuestions()}</b><span>Total Soalan</span></div><div class="stat"><b>${h.length}</b><span>Rekod</span></div><div class="stat"><b>${best}%</b><span>Best</span></div></div>
    <button class="btn" onclick="goSubjects()">Mula Practice Mode</button><div style="height:10px"></div>
    <button class="btn gold" onclick="goExam()">Mula Peperiksaan</button>
    ${last?`<p class="small dashboard-last-result" style="margin-top:10px">Keputusan terakhir: ${escapeHtml(last.type)} • ${escapeHtml(last.subject)} — ${last.score}/${last.total}</p>`:''}
  </section>
  <section class="card">
    <button class="btn secondary" onclick="page='settings';render()">⚙️ Setting / Profil Murid</button><div style="height:10px"></div>
    <button class="btn danger" onclick="logoutStudent()">Logout</button>
  </section>`;
}
function goSubjects(){ if(requireProfile()){ page='subjects'; render(); } }
function goExam(){ if(requireProfile()){ page='exam'; render(); } }

function renderProfile(){
  const savedList = (isLoggedInSession() && profile.studentId) ? renderProfileSwitcher() : '';
  const step = window.__UPKK_LOGIN_STEP || 'start';
  const startCard = `<section class="card hero profile-start-card">
    <img src="assets/images/logo.webp" alt="UPKK SmartKids" class="brand-logo-big app-logo-icon" />
    <h2 class="title">Selamat Datang Ke UPKK SmartKids</h2>
    <p class="subtitle">Login murid lama untuk masuk. Daftar murid baru untuk pelajar pertama sahaja.</p>
    <div style="height:14px"></div>
    <button class="btn gold" onclick="showLoginForm()">Login Murid Lama</button>
    <div style="height:10px"></div>
    <button class="btn secondary" onclick="showRegisterForm()">Daftar Murid Baru</button>
  </section>`;

  const registerCard = `<section class="card simple-login-card">
    <span class="badge">➕ DAFTAR MURID BARU</span>
    <p class="small">Untuk pelajar pertama sahaja. Username hanya untuk login. Nama penuh pelajar boleh diisi selepas daftar di Kemaskini Profil.</p>
    <div class="field" style="margin-top:12px"><label>Username Login</label><input id="usernameInput" class="input" type="text" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" value="${escapeHtml(profile.studentId?'':profile.username||'')}" placeholder="CONTOH: ali01" /></div>
    <div class="field" style="margin-top:12px"><label>PIN 6 Angka</label><input id="pinInput" class="input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password" value="${escapeHtml(profile.studentId?'':profile.pin||'')}" placeholder="CONTOH: 482913" /></div>
    <div class="field" style="margin-top:12px"><label>Access Code / Trial Code</label><input id="accessCodeInput" class="input" type="text" autocapitalize="characters" autocomplete="one-time-code" value="" placeholder="CONTOH: TRIAL-UPKK-2026" /></div>
    <p class="small">Kod trial membuka Latihan 30 hari. Kod exam membuka Peperiksaan 1 tahun.</p>
    <p class="small" style="margin-top:10px">Avatar dan mode tulisan boleh ditukar selepas daftar di bahagian Setting.</p>
    <div style="height:14px"></div>
    <button class="btn" onclick="saveProfileFromForm()">Daftar</button>
    <div style="height:10px"></div>
    <button class="btn secondary" onclick="showLoginStart()">Kembali</button>
  </section>`;

  const loginCard = `<section class="card simple-login-card">
    <span class="badge">🔐 LOGIN MURID LAMA</span>
    <div class="field" style="margin-top:12px"><label>Username Login</label><input id="oldUsernameInput" class="input" type="text" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" value="" placeholder="CONTOH: ali01" /></div>
    <div class="field" style="margin-top:12px"><label>PIN 6 Angka</label><input id="oldPinInput" class="input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="current-password" value="" placeholder="CONTOH: 482913" /></div>
    <p class="small" style="margin-top:10px">Phone dan komputer boleh guna username yang sama. Limit maksimum 2 device.</p>
    <button class="btn gold" onclick="loginExistingStudentFromForm()">Login Murid Lama</button>
    <div style="height:10px"></div>
    <button class="btn secondary" onclick="showLoginStart()">Kembali</button>
  </section>`;

  const editCard = profile.studentId ? `<section class="card simple-login-card">
    <span class="badge">👤 KEMASKINI PROFIL PELAJAR</span>
    <p class="small">Username hanya untuk login: <b>${escapeHtml(profile.username||'-')}</b></p>
    <div class="field" style="margin-top:12px"><label>Nama Penuh Pelajar</label><input id="studentFullNameInput" class="input" type="text" autocomplete="name" value="${escapeHtml(profile.name||'')}" placeholder="CONTOH: MUHAMMAD ALI BIN AHMAD" /></div>
    <div style="height:12px"></div>
    <label class="small"><b>Avatar Pelajar</b></label>
    <div style="height:8px"></div>
    <div class="grid2"><button class="choice ${profile.avatar==='boy'?'active':''}" onclick="selectAvatar('boy')"><img class="avatar" src="assets/images/avatar-boy.webp">Lelaki</button><button class="choice ${profile.avatar==='girl'?'active':''}" onclick="selectAvatar('girl')"><img class="avatar" src="assets/images/avatar-girl.webp">Perempuan</button></div>
    <div style="height:12px"></div>
    <label class="small"><b>Mode Tulisan</b></label>
    <div style="height:8px"></div>
    <div class="grid2"><button class="choice ${profile.mode==='rumi'?'active':''}" onclick="selectMode('rumi')"><div class="mode mode-rumi">Aa</div><b>RUMI</b></button><button class="choice ${profile.mode==='jawi'?'active':''}" onclick="selectMode('jawi')"><div class="mode mode-jawi">ا ب</div><b>JAWI</b></button></div>
    <div style="height:14px"></div>
    <button class="btn" onclick="saveStudentProfileDetails()">Simpan Profil</button>
  </section>` : '';

  $app.innerHTML = (profile.studentId ? profileSummary() + editCard : startCard + (step==='register'?registerCard:'') + (step==='login'?loginCard:'')) + savedList +
  (profile.studentId?`<section class="card"><button class="btn secondary" onclick="page='home';render()">Masuk Dashboard</button><div style="height:10px"></div><button class="btn secondary" onclick="page='settings';render()">Setting Profil Pelajar</button><div style="height:10px"></div><button class="btn secondary" onclick="resetCurrentStudentProgress()">Reset Rekod Pelajar Ini</button><div style="height:10px"></div><button class="btn danger" onclick="deleteCurrentProfile()">Padam Profil Pelajar Ini</button><div style="height:10px"></div><button class="btn danger" onclick="logoutStudent()">Logout</button></section>`:'');

  bindSafeTextInput('usernameInput', e=>{ e.target.value = cleanUsername(e.target.value); profile.username=e.target.value; if(profile.studentId) profile=blankProfile(); saveDraftProfile(); });
  bindSafeTextInput('pinInput', e=>{ e.target.value = cleanPin(e.target.value); profile.pin=e.target.value; if(profile.studentId) profile=blankProfile(); saveDraftProfile(); });
  bindSafeTextInput('studentFullNameInput', e=>{ e.target.value = uppercaseName(e.target.value); profile.name=e.target.value; });
  bindSafeTextInput('oldUsernameInput', e=>{ e.target.value=cleanUsername(e.target.value); });
  bindSafeTextInput('oldPinInput', e=>{ e.target.value=cleanPin(e.target.value); });
}

function showRegisterForm(){ window.__UPKK_LOGIN_STEP='register'; if(profile.studentId) profile=blankProfile(); renderProfile(); }
function showLoginForm(){ window.__UPKK_LOGIN_STEP='login'; renderProfile(); }
function showLoginStart(){ window.__UPKK_LOGIN_STEP='start'; renderProfile(); }
function renderProfileSwitcher(title='Pengurusan Pelajar', showAdd=false){
  if(!showAdd) return '';
  const profiles = familyProfiles();
  const total = profiles.length;
  const studentNo = escapeHtml(String(profile.studentId||'student_1').replace('student_',''));
  return `<section class="card settings-student-card settings-student-card-compact">
    <div class="settings-student-head">
      <div>
        <span class="badge">👨‍🎓 PROFIL PELAJAR</span>
        <h2 class="settings-student-title">${escapeHtml(title)}</h2>
        <p class="small settings-student-subtitle">Pelajar aktif sekarang: <b>${escapeHtml(profile.name||'NAMA BELUM DIISI')}</b> • Pelajar ${studentNo}${total?` daripada ${total}`:''}. Gunakan butang <b>Tukar Pelajar</b> pada kad profil di atas untuk bergerak ke pelajar seterusnya.</p>
      </div>
    </div>
    <div class="settings-student-list single-action">
      <button class="settings-add-student-card" onclick="startAddStudentProfile()" title="Tambah Profil Pelajar">
        <span class="settings-add-student-icon">+</span>
        <strong>Tambah Pelajar</strong>
        <small>Daftar profil anak / pelajar baru</small>
      </button>
    </div>
  </section>`;
}
function selectAvatar(a){ upkkPlaySound('selectAvatar'); profile.avatar=a; if(profile.studentId) saveProfile(); else saveDraftProfile(); render(); }
function selectMode(m){ profile.mode=(m==='jawi')?'jawi':'rumi'; if(profile.studentId) saveProfile(); else saveDraftProfile(); render(); }

async function saveStudentProfileDetails(){
  if(!profile.studentId){ alert('Sila daftar atau login dahulu.'); return; }
  const nameInput = document.getElementById('studentFullNameInput');
  const fullName = uppercaseName(nameInput?.value || profile.name || '').trim();
  if(!fullName){ alert('Sila isi nama penuh pelajar.'); return; }
  if(!profile.avatar){ alert('Sila pilih avatar pelajar.'); return; }
  profile.name = fullName;
  profile.updatedAt = new Date().toISOString();
  saveProfile();
  try{ await updateCurrentStudentFirebase(); }
  catch(err){ console.warn('Firebase profile update failed:', err); alert('Profil disimpan di device, tetapi gagal sync ke Firebase. Semak internet atau Firebase Rules.'); return; }
  alert('Profil pelajar berjaya disimpan.');
  page = (page==='settings') ? 'settings' : 'home';
  render();
}


function renderSettings(){
  if(!isLoggedInSession() || !profile.studentId){ page='profile'; renderProfile(); return; }
  refreshDevicesFromFirebase(true);
  startDeviceRealtimeListener();
  const savedList = renderProfileSwitcher('Pelajar', true);
  const draftChild = window.__UPKK_NEW_STUDENT || {name:'', avatar:'', mode: profile.mode || 'rumi'};
  const addChildCard = window.__UPKK_ADD_STUDENT_FORM ? `<section class="card simple-login-card add-child-card settings-clean-form-card">
    <div class="settings-form-head">
      <span class="badge">➕ TAMBAH PROFIL PELAJAR</span>
      <h2 class="settings-form-title">Tambah Pelajar Baru</h2>
      <p class="small">Isi profil anak/pelajar baru. Username dan PIN kekal sama dengan akaun utama.</p>
    </div>
    <div class="field" style="margin-top:12px"><label>Nama Penuh Pelajar</label><input id="newStudentFullNameInput" class="input" type="text" autocomplete="name" value="${escapeHtml(draftChild.name||'')}" placeholder="CONTOH: AISYAH BINTI AHMAD" /></div>
    <div style="height:12px"></div>
    <label class="small"><b>Avatar Pelajar</b></label>
    <div style="height:8px"></div>
    <div class="grid2"><button type="button" class="choice ${draftChild.avatar==='boy'?'active':''}" data-new-student-avatar="boy" onclick="selectNewStudentAvatar('boy')"><img class="avatar" src="assets/images/avatar-boy.webp">Lelaki</button><button type="button" class="choice ${draftChild.avatar==='girl'?'active':''}" data-new-student-avatar="girl" onclick="selectNewStudentAvatar('girl')"><img class="avatar" src="assets/images/avatar-girl.webp">Perempuan</button></div>
    <div style="height:12px"></div>
    <label class="small"><b>Mode Tulisan</b></label>
    <div style="height:8px"></div>
    <div class="grid2"><button type="button" class="choice ${draftChild.mode!=='jawi'?'active':''}" data-new-student-mode="rumi" onclick="selectNewStudentMode('rumi')"><div class="mode mode-rumi">Aa</div><b>RUMI</b></button><button type="button" class="choice ${draftChild.mode==='jawi'?'active':''}" data-new-student-mode="jawi" onclick="selectNewStudentMode('jawi')"><div class="mode mode-jawi">ا ب</div><b>JAWI</b></button></div>
    <div style="height:14px"></div>
    <button class="btn" onclick="saveNewStudentProfile()">Simpan Profil Pelajar</button>
    <div style="height:10px"></div>
    <button class="btn secondary" onclick="cancelAddStudentProfile()">Batal</button>
  </section>` : '';
  const deviceList = Object.values(normalizeDeviceMap(profile.devices, profile.allowedDevices)).filter(d=>d.active!==false);
  const deviceRows = deviceList.map((d,i)=>`<div class="exam-row"><div><b>${escapeHtml(d.deviceName || ('Device '+(i+1)))} ${d.deviceId===deviceId()?'<span class="badge">THIS DEVICE</span>':''}</b><br><span>${escapeHtml(d.platform||'')} ${escapeHtml(d.browser||'')}</span><br><span class="small">${escapeHtml(d.deviceId||'')} ${d.lastActive?('• Last: '+escapeHtml(new Date(d.lastActive).toLocaleString())):''}</span></div>${d.deviceId===deviceId()?'':`<button class="mini-btn danger" onclick="removeDevice('${escapeHtml(d.deviceId)}')">Remove</button>`}</div>`).join('');
  window.__UPKK_SETTING_NOTICE = '';
  $app.innerHTML = `${profileSummary()}
  ${savedList}
  ${addChildCard}
  <section class="card simple-login-card settings-clean-form-card">
    <div class="settings-form-head">
      <span class="badge">👤 EDIT PROFIL PELAJAR</span>
      <h2 class="settings-form-title">Profil Pelajar Aktif</h2>
      <p class="small">Kemaskini nama, avatar dan mode tulisan pelajar yang sedang dipilih.</p>
    </div>
    <p class="small">Username login: <b>${escapeHtml(profile.username||'-')}</b></p>
    <div class="field" style="margin-top:12px"><label>Nama Penuh Pelajar</label><input id="studentFullNameInput" class="input" type="text" autocomplete="name" value="${escapeHtml(profile.name||'')}" placeholder="CONTOH: MUHAMMAD ALI BIN AHMAD" /></div>
    <div style="height:12px"></div>
    <label class="small"><b>Tukar Avatar</b></label>
    <div style="height:8px"></div>
    <div class="grid2"><button class="choice ${profile.avatar==='boy'?'active':''}" onclick="selectAvatar('boy')"><img class="avatar" src="assets/images/avatar-boy.webp">Lelaki</button><button class="choice ${profile.avatar==='girl'?'active':''}" onclick="selectAvatar('girl')"><img class="avatar" src="assets/images/avatar-girl.webp">Perempuan</button></div>
    <div style="height:12px"></div>
    <label class="small"><b>Mode Tulisan</b></label>
    <div style="height:8px"></div>
    <div class="grid2"><button class="choice ${profile.mode==='rumi'?'active':''}" onclick="selectMode('rumi')"><div class="mode mode-rumi">Aa</div><b>RUMI</b></button><button class="choice ${profile.mode==='jawi'?'active':''}" onclick="selectMode('jawi')"><div class="mode mode-jawi">ا ب</div><b>JAWI</b></button></div>
    <div style="height:14px"></div>
    <button class="btn" onclick="saveStudentProfileDetails()">Simpan Profil Pelajar</button>
  </section>
  <section class="card">
    <span class="badge">🎟️ ACCESS / LESEN</span>
    <p class="small">Status akses: <b>${escapeHtml(planLabel())}</b></p>
    <button class="btn gold" onclick="redeemExamLicenseFromSettings()">Redeem Kod Trial / Lesen Exam</button>
    <div style="height:10px"></div>
    <button class="btn secondary" onclick="openUpkkWhatsApp('buy')">💬 Beli Lesen Melalui WhatsApp</button>
    <div style="height:10px"></div>
    <button class="btn secondary" onclick="openUpkkWhatsApp('support')">📱 Hubungi Admin</button>
  </section>
  <section class="card">
    <span class="badge">🗑️ DELETE PROFIL PELAJAR</span>
    <p class="small">Padam profil pelajar yang sedang dipilih sahaja.</p>
    <button class="btn danger" onclick="deleteCurrentProfile()">Delete Profil Pelajar Ini</button>
  </section>
  <section class="card">
    <span class="badge">📱 DEVICE MANAGEMENT</span>
    <p class="small">Maksimum 2 device untuk username ini. Semua pelajar dalam username sama berkongsi had device ini.</p>
    <div id="deviceListBox">${deviceRows || '<div class="empty">Tiada device direkodkan.</div>'}</div>
    <div style="height:10px"></div><button class="btn secondary" onclick="refreshDevicesFromFirebase(false)">Refresh Device</button>
    <div style="height:10px"></div><button class="btn secondary" onclick="resetDevicesToCurrent()">Reset All Devices</button>
  </section>
  <section class="card">
    <span class="badge">🔐 TUKAR PASSWORD / PIN</span>
    <div class="field" style="margin-top:12px"><label>Password / PIN Semasa</label><input id="currentPinInput" class="input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="current-password" placeholder="6 angka" /></div>
    <div class="field" style="margin-top:12px"><label>Password / PIN Baru</label><input id="newPinInput" class="input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password" placeholder="6 angka" /></div>
    <div style="height:12px"></div><button class="btn gold" onclick="changeCurrentPin()">Simpan Password / PIN Baru</button>
  </section>
  <section class="card">
    <span class="badge">♻️ RESET PROGRESS</span>
    <button class="btn secondary" onclick="resetCurrentStudentProgress()">Reset Progress Pelajar Ini</button><div style="height:10px"></div>
    <button class="btn" onclick="page='home';render()">Kembali Dashboard</button><div style="height:10px"></div>
    <button class="btn danger" onclick="logoutStudent()">Logout</button>
  </section></div>`;
  bindSafeTextInput('studentFullNameInput', e=>{ e.target.value = uppercaseName(e.target.value); profile.name=e.target.value; });
  bindSafeTextInput('newStudentFullNameInput', e=>{ e.target.value = uppercaseName(e.target.value); window.__UPKK_NEW_STUDENT = window.__UPKK_NEW_STUDENT || {name:'', avatar:'', mode:'rumi'}; window.__UPKK_NEW_STUDENT.name=e.target.value; });
  bindSafeTextInput('currentPinInput', e=>{ e.target.value=cleanPin(e.target.value); });
  bindSafeTextInput('newPinInput', e=>{ e.target.value=cleanPin(e.target.value); });
}
function resetDevicesToCurrent(){
  if(!profile.studentId){ alert('Sila login dahulu.'); return; }
  appConfirm('Reset semua device dan kekalkan device ini sahaja?', async ()=>{
    profile.devices = {[deviceKey()]: currentDeviceRecord()};
    profile.allowedDevices = [deviceId()];
    saveProfile();
    await syncDevicesToFirebase(profile.devices);
    alert('Device berjaya direset.');
    page='settings'; render();
  });
}
async function changeCurrentPin(){
  const oldPin=cleanPin(document.getElementById('currentPinInput')?.value||'');
  const newPin=cleanPin(document.getElementById('newPinInput')?.value||'');
  if(oldPin !== profile.pin){ alert('PIN semasa salah.'); return; }
  if(newPin.length !== PIN_LENGTH){ alert('PIN baru mesti 6 angka.'); return; }
  profile.pin=newPin;
  profile.updatedAt = new Date().toISOString();
  saveProfile();
  try{ await updateAccountPinFirebase(); }
  catch(err){ console.warn('Firebase PIN update failed:', err); alert('PIN disimpan di device, tetapi gagal sync ke Firebase. Semak internet atau Firebase Rules.'); return; }
  alert('PIN berjaya ditukar.'); page='settings'; render();
}

function cleanUsername(v){ return String(v||'').toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,20); }
function cleanPin(v){ return String(v||'').replace(/\D/g,'').slice(0,PIN_LENGTH); }
function lockRemainingText(lockedUntil){
  const ms = new Date(lockedUntil).getTime() - Date.now();
  const min = Math.max(1, Math.ceil(ms/60000));
  return `${min} minit`;
}
function isAccountLocked(data){
  const d = normalizeProfile(data);
  return !!(d.temporaryLock && d.lockedUntil && new Date(d.lockedUntil) > new Date());
}
async function recordFailedLogin(studentId, data, isRemote){
  const d = normalizeProfile(data);
  d.loginAttempts = Number(d.loginAttempts||0) + 1;
  d.maxLoginAttempt = MAX_LOGIN_ATTEMPTS;
  if(d.loginAttempts >= MAX_LOGIN_ATTEMPTS){
    d.temporaryLock = true;
    d.lockedUntil = new Date(Date.now() + LOCK_MINUTES*60*1000).toISOString();
  }
  if(isRemote){
    const db=firebaseDb();
    if(db) await db.ref(data?.username ? accountPath(data.accountId || profile.accountId) : fbPath('users', safeFirebaseKey(studentId))).update({
      loginAttempts:d.loginAttempts,
      maxLoginAttempt:MAX_LOGIN_ATTEMPTS,
      temporaryLock:d.temporaryLock,
      lockedUntil:d.lockedUntil,
      lastFailedLoginAt:new Date().toISOString()
    }).catch(err=>console.warn('Failed login update failed:', err));
  }else{
    const profiles=loadProfiles();
    profiles[accountLocalKey(d)]=d;
    saveProfiles(profiles);
  }
  if(d.temporaryLock){ alert(`PIN salah 5 kali. Akaun dikunci sementara selama ${LOCK_MINUTES} minit.`); }
  else { alert(`PIN salah. Percubaan ${d.loginAttempts}/${MAX_LOGIN_ATTEMPTS}.`); }
}
async function resetLoginState(username, isRemote){
  if(isRemote){
    const db=firebaseDb();
    if(db){
      try{
        const idx = await firebaseGetOnce(fbPath('usernames', safeFirebaseKey(username)));
        const accountId = idx.exists() ? usernameIndexAccountId(idx.val()) : profile.accountId;
        await db.ref(accountPath(accountId)).update({loginAttempts:0, temporaryLock:false, lockedUntil:'', lastLoginAt:new Date().toISOString()});
      }catch(err){ console.warn('Login reset failed:', err); }
    }
  }
}
async function loginExistingStudentFromForm(){
  const username = cleanUsername(document.getElementById('oldUsernameInput')?.value || '');
  const pin = cleanPin(document.getElementById('oldPinInput')?.value || '');
  if(!username){ alert('Sila isi username.'); return; }
  if(pin.length !== PIN_LENGTH){ alert('PIN mesti 6 angka.'); return; }
  await loginExistingStudentByUsername(username, pin);
}

async function showOldStudentLogin(){
  const el = document.getElementById('oldStudentIdInput');
  if(el){ el.focus(); el.scrollIntoView({behavior:'smooth', block:'center'}); return; }
  const studentIdRaw = await appPrompt('Masukkan Student ID lama / sedia ada:', {title:'Login ID Lama', placeholder:'Contoh: STU-26-00001'});
  const studentId = String(studentIdRaw || '').trim().toUpperCase();
  if(!studentId) return;
  const pinRaw = await appPrompt('Masukkan PIN 6 angka:', {title:'PIN Murid', inputType:'password', inputMode:'numeric', placeholder:'6 angka'});
  const pin = cleanPin(pinRaw || '');
  if(pin.length !== PIN_LENGTH){ alert('PIN mesti 6 angka.'); return; }
  await loginExistingStudent(studentId, pin);
}
async function findStudentIdByUsername(username){
  username = cleanUsername(username);
  const local = Object.values(loadProfiles()).map(normalizeProfile).find(p=>p.username===username);
  if(local?.studentId) return accountLocalKey(local);
  return '';
}
async function loginExistingStudentByUsername(username, pin){
  username = cleanUsername(username);
  const db = firebaseDb();

  // v7.08: Utamakan Firebase login jika tersedia.
  // Ini elak masalah user perlu delete history/browser cache sebab local profile lama rosak/stale.
  if(db){
    try{
      const userIndexSnap = await firebaseGetOnce(fbPath('usernames', safeFirebaseKey(username)));
      const usernameIndexValue = userIndexSnap.exists() ? userIndexSnap.val() : '';
      const accountIdFromIndex = usernameIndexAccountId(usernameIndexValue);
      const snap = accountIdFromIndex ? await firebaseGetOnce(accountPath(accountIdFromIndex)) : {exists:()=>false};
      if(!snap.exists()){
        // Kalau Firebase tiada data, baru fallback local cache.
        const localStudentId = await findStudentIdByUsername(username);
        if(localStudentId){ await loginExistingStudent(localStudentId, pin); return; }
        alert('Username tidak dijumpai. Semak semula atau daftar murid baru.');
        return;
      }
      const account = snap.val() || {};
      const accountData = normalizeProfile({
        accountId: account.accountId || accountIdFromIndex,
        username,
        pin: account.pin || '',
        plan: account.plan || PREMIUM_STATUS.FREE,
        premiumCode: account.premiumCode || '',
        entitlements: account.entitlements || {},
        subscription: account.subscription || {},
        allowedDevices: account.allowedDevices || [],
        devices: account.devices || {},
        loginAttempts: account.loginAttempts || 0,
        temporaryLock: !!account.temporaryLock,
        lockedUntil: account.lockedUntil || ''
      });
      accountData.subscription = await loadUsernameSubscriptionFromFirebase(username, accountData.accountId, account);
      if(isAccountLocked(accountData)){ alert(`Akaun dikunci sementara. Cuba semula dalam ${lockRemainingText(accountData.lockedUntil)}.`); return; }
      if(accountData.pin && accountData.pin !== pin){ await recordFailedLogin(username, accountData, true); return; }

      const deviceAccess = await registerCurrentDeviceOnLogin(accountData.accountId, accountData.devices, accountData.allowedDevices);
      if(!deviceAccess.ok){ alert(deviceAccess.reason || 'Akaun ini sudah digunakan pada 2 device. Buang device lama di Setting atau minta reset device.'); return; }
      accountData.devices = deviceAccess.devices;
      accountData.allowedDevices = Object.values(accountData.devices).filter(d=>d.active!==false).map(d=>d.deviceId);

      const students = account.students || {};
      const slots = Object.keys(students).length ? Object.keys(students) : ['student_1'];
      const profiles = loadProfiles();
      slots.forEach(slot=>{
        const st = students[slot] || {};
        profiles[accountLocalKey({accountId:accountData.accountId, studentId:slot})] = normalizeProfile({
          ...accountData,
          accountId: accountData.accountId,
          studentId: slot,
          name: st.name || '',
          avatar: st.avatar || account.avatar || 'boy',
          mode: st.mode || account.mode || 'rumi',
          createdAt: st.createdAt || account.createdAt || new Date().toISOString()
        });
      });
      saveProfiles(profiles);
      const activeSlot = account.activeStudent || slots[0];
      const activeKey = accountLocalKey({accountId:accountData.accountId, studentId:activeSlot});
      profile = normalizeProfile({...profiles[activeKey], pin, loginAttempts:0, temporaryLock:false, lockedUntil:'', allowedDevices:accountData.allowedDevices, devices:accountData.devices, subscription:accountData.subscription || {}});
      saveProfile();
      await resetLoginState(username, true);
      startDeviceRealtimeListener();
      await refreshDevicesFromFirebase(true);
      await refreshAllAccountProfilesFromFirebase(profile.accountId);
      await refreshCurrentStudentCloudCache();
      page=isProfileComplete()?'home':'settings'; render();
      return;
    }catch(err){
      console.warn(err);
      alert('Gagal login. ' + firebaseErrorText(err));
      return;
    }
  }

  // Offline/local fallback sahaja.
  const localStudentId = await findStudentIdByUsername(username);
  if(localStudentId){ await loginExistingStudent(localStudentId, pin); return; }
  alert('Username tidak dijumpai pada device ini. Semak internet/Firebase atau daftar murid baru.');
}

async function loginExistingStudent(profileKey, pin){
  profileKey = String(profileKey||'').trim();
  pin = cleanPin(pin);
  const local = loadProfiles()[profileKey];
  if(local){
    const p = normalizeProfile(local);
    if(isAccountLocked(p)){ alert(`Akaun dikunci sementara. Cuba semula dalam ${lockRemainingText(p.lockedUntil)}.`); return; }
    if(p.pin && p.pin !== pin){ await recordFailedLogin(profileKey, p, false); return; }
    profile = normalizeProfile({...p, pin: p.pin || pin, loginAttempts:0, temporaryLock:false, lockedUntil:''});
    const deviceAccess = await registerCurrentDeviceOnLogin(profile.accountId, profile.devices, profile.allowedDevices);
    if(!deviceAccess.ok){ alert(deviceAccess.reason || 'Akaun ini sudah digunakan pada 2 device. Buang device lama di Setting atau minta reset device.'); return; }
    profile.devices = deviceAccess.devices;
    profile.allowedDevices = Object.values(profile.devices).filter(d=>d.active!==false).map(d=>d.deviceId);
    saveProfile(); startDeviceRealtimeListener(); await refreshDevicesFromFirebase(true); await refreshAllAccountProfilesFromFirebase(profile.accountId); await refreshCurrentStudentCloudCache(); page=isProfileComplete()?'home':'settings'; render(); return;
  }
  alert('Profil pelajar tidak dijumpai pada device ini. Sila login guna username utama.');
}

async function saveProfileFromForm(){
  const username=cleanUsername(document.getElementById('usernameInput')?.value||profile.username||'');
  const pin=cleanPin(document.getElementById('pinInput')?.value||profile.pin||'');
  const accessCode=String(document.getElementById('accessCodeInput')?.value||'').trim().toUpperCase();
  if(!username){ alert('Sila isi username.'); return; }
  if(username.length < 3){ alert('Username minimum 3 aksara.'); return; }
  if(!profile.avatar) profile.avatar = 'boy';
  if(!profile.mode) profile.mode = 'rumi';
  if(pin.length !== PIN_LENGTH){ alert('Sila tetapkan PIN 6 angka.'); return; }
  if(!accessCode){ alert('Sila masukkan access code / trial code untuk daftar.'); return; }

  const existing = findExistingProfile(username);
  if(existing){
    alert('Username ini sudah digunakan pada device ini. Sila login murid lama.');
    window.__UPKK_LOGIN_STEP='login';
    renderProfile();
    return;
  }

  const db = firebaseDb();
  if(db){
    try{
      const usernameSnap = await db.ref(fbPath('usernames', safeFirebaseKey(username))).get();
      if(usernameSnap.exists()){
        alert('Username ini sudah digunakan. Cuba username lain, contoh ali01 atau ali2026.');
        return;
      }
    }catch(err){ console.warn('Username check failed:', err); alert('Gagal semak username. Semak internet atau Firebase Rules.'); return; }
  }

  if(db){
    try{
      const codeSnap = await db.ref(fbPath('accessCodes', safeFirebaseKey(accessCode))).get();
      if(!codeSnap.exists()){ alert('Access code tidak sah. Sila dapatkan code daripada admin/guru.'); return; }
      const codeData = normalizeAccessCodeData(codeSnap.val() || {}, accessCode);
      if(codeData.status !== 'active'){ alert('Access code tidak aktif / telah ditarik sah.'); return; }
      if(codeData.expiresAt && new Date(codeData.expiresAt).getTime() < Date.now()){ alert('Access code telah tamat tempoh.'); return; }
      if(codeData.used >= codeData.maxUse){ alert('Kuota access code telah penuh.'); return; }
    }catch(err){ console.warn('Access code check failed:', err); alert('Gagal semak access code. Semak internet atau Firebase Rules.'); return; }
  }

  profile.accountId = await nextMainAccountIdFirebaseFirst();
  profile.username=username;
  profile.name='';
  profile.pin=pin;
  profile.studentId = 'student_1';
  if(!profile.mode || profile.mode==='dual') profile.mode='rumi';
  profile.devices = {[deviceKey()]: currentDeviceRecord()};
  profile.allowedDevices=[deviceId()];
  profile.loginAttempts=0;
  profile.temporaryLock=false;
  profile.lockedUntil='';
  profile.entitlements = {};
  try{
    await redeemAccessCode(accessCode, 'register');
  }catch(err){
    alert(err.message || 'Access code gagal diredeem.');
    profile = blankProfile();
    return;
  }
  saveProfile();

  if(db){
    try{
      await db.ref(fbPath('usernames', safeFirebaseKey(username))).set({accountId: profile.accountId, username, subscription: profile.subscription || {}, createdAt: new Date().toISOString()});
      await db.ref(accountPath(profile.accountId)).update(firebaseAccountPayload());
      await db.ref(`${accountPath(profile.accountId)}/devices`).set(normalizeDeviceMap(profile.devices, profile.allowedDevices));
      await db.ref(studentSlotPath(profile.accountId, profile.studentId)).update(firebaseStudentPayload());
    }catch(err){ console.warn('Register sync failed:', err); alert('Profil disimpan di device, tetapi gagal sync Firebase. Semak Rules/internet.'); }
  }
  window.__UPKK_LOGIN_STEP='start';
  window.__UPKK_SETTING_NOTICE = 'Sila isi nama penuh pelajar';
  startDeviceRealtimeListener();
  page='settings';
  render();
}

function latihanFilter(){ return window.__UPKK_LATIHAN_FILTER || 'semua'; }
function setLatihanFilter(filter){ window.__UPKK_LATIHAN_FILTER = filter || 'semua'; renderSubjects(); }
function latihanSubjectOrder(){ return ['aqidah','ibadah','sirah','jawi','arab','adab'].filter(k=>DB[k]); }
function latihanTheme(key){
  const map={
    aqidah:{tone:'emerald',emoji:'🛡️',desc:'Kuatkan asas iman dan kefahaman tauhid.'},
    ibadah:{tone:'sky',emoji:'🤲',desc:'Latihan amali solat, puasa, zakat dan ibadah harian.'},
    sirah:{tone:'amber',emoji:'🌙',desc:'Kenali kisah Rasulullah SAW dan pengajaran sirah.'},
    jawi:{tone:'violet',emoji:'✍️',desc:'Mantapkan bacaan Jawi dan asas Khat.'},
    arab:{tone:'rose',emoji:'🔤',desc:'Perkataan, ayat mudah dan kefahaman Bahasa Arab.'},
    adab:{tone:'lime',emoji:'🌸',desc:'Bina akhlak, hormat dan adab harian.'}
  };
  return map[key] || {tone:'emerald',emoji:'📚',desc:'Latihan subjek UPKK.'};
}
function latihanSubjectRows(){
  const h = history();
  return latihanSubjectOrder().map(key=>{
    const s = DB[key];
    const title = subjectTitle(s);
    const rows = h.filter(x=>x.subject===title && !isExamQuizType(x.type));
    const best = rows.length ? Math.max(...rows.map(x=>Math.round((Number(x.score||0)/Math.max(1,Number(x.total||1)))*100))) : 0;
    const latest = rows.length ? rows[rows.length-1] : null;
    const totalDone = rows.reduce((a,x)=>a+Number(x.total||0),0);
    const correctDone = rows.reduce((a,x)=>a+Number(x.score||0),0);
    const accuracy = totalDone ? Math.round((correctDone/totalDone)*100) : 0;
    const status = !rows.length ? 'belum' : (best >= 80 ? 'selesai' : 'sedang');
    const statusLabel = status==='belum' ? 'Belum Cuba' : status==='selesai' ? 'Selesai' : 'Sedang Belajar';
    const theme = latihanTheme(key);
    return {key,s,title,rows,best,latest,status,statusLabel,total:subjectQuestionCount(key),accuracy,totalDone,theme};
  });
}
function latihanProgressSummary(rows){
  const done = rows.filter(r=>r.rows.length).length;
  const total = rows.length || 1;
  const avg = rows.length ? Math.round(rows.reduce((a,r)=>a+r.best,0)/rows.length) : 0;
  const needFocus = rows.filter(r=>r.status!=='selesai').sort((a,b)=>a.best-b.best)[0] || rows[0];
  const continueRow = rows.find(r=>r.rows.length && r.status==='sedang') || rows.find(r=>r.rows.length) || null;
  const completed = rows.filter(r=>r.status==='selesai').length;
  return {done,total,avg,needFocus,continueRow,completed,percent:Math.round((done/total)*100)};
}
function latihanFilterButton(id,label,emoji){
  const active = latihanFilter()===id ? 'active' : '';
  return `<button class="latihan-filter ${active}" onclick="setLatihanFilter('${id}')"><span>${emoji}</span>${label}</button>`;
}
function latihanModeButton(key,mode,count,label,icon,cls=''){
  return `<button class="latihan-mode-pill ${cls}" onclick="startPracticeMode('${key}','${mode}',${count})"><b>${icon}</b><span>${label}</span></button>`;
}
function renderSubjects(){
  if(!requireProfile()) return;
  const rowsAll = latihanSubjectRows();
  const filter = latihanFilter();
  const rows = rowsAll.filter(r=> filter==='semua' || r.status===filter);
  const summary = latihanProgressSummary(rowsAll);
  const today = summary.needFocus || rowsAll[0];
  const continueRow = summary.continueRow;
  const filters = `${latihanFilterButton('semua','Semua','🌈')}${latihanFilterButton('belum','Belum Cuba','✨')}${latihanFilterButton('sedang','Sedang Belajar','📖')}${latihanFilterButton('selesai','Selesai','✅')}`;
  const cards = rows.map(r=>`<article class="latihan-modern-card tone-${r.theme.tone} status-${r.status}">
    <div class="latihan-card-bg"></div>
    <div class="latihan-card-head title-inline">
      <div class="latihan-title-inline">
        <div class="latihan-subject-badge"><span>${r.theme.emoji}</span></div>
        <h3>${escapeHtml(r.title)}</h3>
      </div>
      <div class="latihan-ring modern" style="--p:${r.best}"><span>${r.best}%</span></div>
    </div>
    <div class="latihan-card-body">
      <div class="latihan-status-row"><span class="latihan-status-dot"></span>${r.statusLabel}</div>
      <p>${escapeHtml(r.theme.desc)}</p>
      <div class="latihan-progress modern"><span style="width:${r.best}%"></span></div>
      <div class="latihan-mini-stats">
        <div><b>10</b><span>Soalan/Sesi</span></div>
        <div><b>${r.rows.length}</b><span>Rekod</span></div>
        <div><b>${r.accuracy}%</b><span>Tepat</span></div>
      </div>
    </div>
    <div class="latihan-action-row">
      <button class="btn latihan-start-btn" onclick="startPractice('${r.key}')">Mula Latihan • 10 Soalan</button>
    </div>
  </article>`).join('');
  const empty = `<section class="card latihan-empty modern"><div class="latihan-empty-icon">🌱</div><h3>Belum ada progress untuk paparan ini</h3><p>Pilih filter Semua atau mula latihan pertama hari ini.</p><button class="btn" onclick="setLatihanFilter('semua')">Lihat Semua Subjek</button></section>`;
  const switcher = renderDashboardStudentSwitcher();
  $app.innerHTML = `${profileSummary()}
  ${switcher}
  <section class="latihan-hero-modern">
    <div class="latihan-hero-glow"></div>
    <div class="latihan-hero-content">
      <span class="latihan-kicker">📚 LATIHAN PINTAR</span>
      <h2>Pilih latihan ikut subjek UPKK</h2>
      <p>Reka bentuk baru lebih kemas, moden dan mesra telefon. Setiap sesi latihan akan papar 10 soalan rawak daripada bank soalan tanpa ulang dalam sesi yang sama.</p>
      <div class="latihan-overview-cards">
        <div><b>${summary.done}/${summary.total}</b><span>Subjek Dicuba</span></div>
        <div><b>${summary.avg}%</b><span>Purata Terbaik</span></div>
        <div><b>${summary.completed}</b><span>Selesai</span></div>
      </div>
      <div class="latihan-hero-progress modern"><span style="width:${summary.percent}%"></span></div>
    </div>
  </section>

  <section class="latihan-smart-panel">
    <div class="latihan-smart-card primary">
      <span class="latihan-kicker small">⭐ CADANGAN HARI INI</span>
      <h3>${today?escapeHtml(today.title):'Aqidah'}</h3>
      <p>${today?`Fokus terbaik: ${today.statusLabel} • Best ${today.best}%`:'Mula latihan pertama hari ini.'}</p>
      <button class="btn" onclick="startPractice('${today?today.key:'aqidah'}')">Mula Latihan Cadangan</button>
    </div>
    <div class="latihan-smart-card secondary">
      <span class="latihan-kicker small">▶️ SAMBUNG LATIHAN</span>
      <h3>${continueRow?escapeHtml(continueRow.title):'Belum ada latihan'}</h3>
      <p>${continueRow?`Rekod tersedia: ${continueRow.rows.length} latihan • Best ${continueRow.best}%`:'Progress masih kosong untuk pelajar ini.'}</p>
      <button class="btn secondary" onclick="${continueRow?`startPracticeMode('${continueRow.key}','Sambung Latihan',10)`:`setLatihanFilter('belum')`}">${continueRow?'Sambung Sekarang':'Lihat Subjek'}</button>
    </div>
  </section>

  <section class="latihan-toolbar">
    <div><b>Subjek Latihan</b><span>${rows.length} daripada ${rowsAll.length} subjek dipaparkan</span></div>
    <div class="latihan-filter-wrap">${filters}</div>
  </section>
  <div class="latihan-modern-grid">${cards || empty}</div>`;
}
function examSubjectOrder(){ return EXAM_SUBJECT_ORDER.filter(k=>DB[k]); }
function localExamSessions(){ try{return JSON.parse(localStorage.getItem(studentKey(EXAM_SESSION_KEY))||'{}')||{};}catch(e){return{};} }
function saveLocalExamSessions(map){ localStorage.setItem(studentKey(EXAM_SESSION_KEY), JSON.stringify(map||{})); scheduleExamSessionsMapSync(map||{}); }
function examSessionLocal(subjectKey){ return localExamSessions()[subjectKey] || null; }
function examSessionPath(subjectKey){ return fbPath('examSessions', `${safeFirebaseKey(profile.accountId || profile.username || 'LOCAL')}/${safeFirebaseKey(profile.studentId || 'student_1')}/${safeFirebaseKey(subjectKey)}`); }
function scheduleExamSessionsMapSync(map){
  clearTimeout(window.__UPKK_EXAM_MAP_SYNC_TIMER);
  window.__UPKK_EXAM_MAP_SYNC_TIMER = setTimeout(()=>syncExamSessionsMapToFirebase(map||localExamSessions()), 1200);
}
function syncExamSessionToFirebaseNow(subjectKey, session){ const db=firebaseDb(); if(!db||!subjectKey||!session) return; db.ref(examSessionPath(subjectKey)).set(session).catch(err=>console.warn('Firebase exam session sync failed:',err)); }
function syncExamSessionToFirebase(subjectKey, session){
  clearTimeout(window.__UPKK_EXAM_SESSION_SYNC_TIMER);
  window.__UPKK_EXAM_SESSION_SYNC_TIMER = setTimeout(()=>syncExamSessionToFirebaseNow(subjectKey, session), 1200);
}
function flushExamSessionSync(){
  try{
    clearTimeout(window.__UPKK_EXAM_MAP_SYNC_TIMER);
    clearTimeout(window.__UPKK_EXAM_SESSION_SYNC_TIMER);
    const map = localExamSessions();
    syncExamSessionsMapToFirebase(map);
    if(currentQuiz && quizType==='exam'){
      const subjectKey=currentQuiz.subjectKey;
      const remainingSeconds=Math.max(0, Math.ceil((currentQuiz.endsAt-nowMs())/1000));
      syncExamSessionToFirebaseNow(subjectKey, {
        appCode:APP_CODE, version:UPKK_APP_VERSION_NAME, status:'in_progress', subjectKey,
        title:currentQuiz.title, icon:currentQuiz.icon, accountId:profile.accountId||'', studentId:profile.studentId||'student_1', studentName:profile.name||'',
        startedAt:currentQuiz.startedAtIso || new Date(currentQuiz.startedAt||nowMs()).toISOString(), updatedAt:new Date().toISOString(),
        currentIndex:currentQuiz.index, remainingSeconds, durationSeconds:EXAM_DURATION_SECONDS,
        questionIds:currentQuiz.questions.map(q=>q.id || q.sourceNo), answers:currentQuiz.answers||[]
      });
    }
  }catch(err){ console.warn('Flush exam sync skipped:', err); }
}
window.addEventListener('beforeunload', flushExamSessionSync);

function clearExamSession(subjectKey){ const map=localExamSessions(); delete map[subjectKey]; saveLocalExamSessions(map); const db=firebaseDb(); if(db) db.ref(examSessionPath(subjectKey)).remove().catch(err=>console.warn('Firebase exam session clear failed:',err)); }
function examCompletedSubjectKeys(){
  try{
    return new Set(history()
      .filter(x => isExamQuizType(x.type) && x.subjectKey && EXAM_SUBJECT_ORDER.includes(x.subjectKey))
      .map(x => x.subjectKey));
  }catch(e){ return new Set(); }
}
function examAllSubjectsCompleted(){
  const order = examSubjectOrder();
  const done = examCompletedSubjectKeys();
  return order.length > 0 && order.every(k => done.has(k));
}
function examRepeatLockedMessage(){
  return 'Untuk ulang peperiksaan penuh, sila lengkapkan semua subjek terlebih dahulu.';
}
function showExamRepeatLocked(){ appAlert(examRepeatLockedMessage()); }
function canStartExamSubject(subjectKey){
  const done = examCompletedSubjectKeys();
  return !done.has(subjectKey) || examAllSubjectsCompleted();
}
function repeatExamOrNotify(subjectKey){
  if(canStartExamSubject(subjectKey)) return startExam(subjectKey);
  showExamRepeatLocked();
}
function persistExamSession(){
  if(!currentQuiz || quizType!=='exam') return;
  const subjectKey=currentQuiz.subjectKey;
  const remainingSeconds=Math.max(0, Math.ceil((currentQuiz.endsAt-nowMs())/1000));
  const session={
    appCode:APP_CODE, version:UPKK_APP_VERSION_NAME, status:'in_progress', subjectKey,
    title:currentQuiz.title, icon:currentQuiz.icon, accountId:profile.accountId||'', studentId:profile.studentId||'student_1', studentName:profile.name||'',
    startedAt:currentQuiz.startedAtIso || new Date(currentQuiz.startedAt||nowMs()).toISOString(), updatedAt:new Date().toISOString(),
    currentIndex:currentQuiz.index, remainingSeconds, durationSeconds:EXAM_DURATION_SECONDS,
    questionIds:currentQuiz.questions.map(q=>q.id || q.sourceNo), answers:currentQuiz.answers||[]
  };
  const map=localExamSessions(); map[subjectKey]=session; saveLocalExamSessions(map); syncExamSessionToFirebase(subjectKey,session);
}
function examSubjectRows(){
  const completedSet = examCompletedSubjectKeys();
  const allCompleted = examAllSubjectsCompleted();
  return examSubjectOrder().map(key=>{
    const s = DB[key];
    const saved = examSessionLocal(key);
    const available = uniqueQuestions(key).length;
    const total = Math.min(EXAM_TARGET_QUESTIONS, available);
    const answered = saved?.answers ? saved.answers.filter(a=>typeof a.selected==='number').length : 0;
    const current = saved ? Math.min(Number(saved.currentIndex||0)+1, Math.max(total,1)) : 0;
    const remaining = saved ? `${Math.floor(Number(saved.remainingSeconds||0)/60)}:${String(Number(saved.remainingSeconds||0)%60).padStart(2,'0')}` : '45:00';
    const completed = completedSet.has(key);
    const progress = saved && total ? Math.round((answered/total)*100) : (completed ? 100 : 0);
    const theme = latihanTheme(key);
    return {key,s,title:subjectTitle(s),saved,available,total,answered,current,remaining,progress,theme,completed,allCompleted};
  });
}
function renderExamMenu(){
  if(!requireProfile()) return;
  if(!hasActiveExamAccess()){
    $app.innerHTML = `${profileSummary()}<section class="card">
      <span class="badge">🔒 PEPERIKSAAN BERLESEN</span>
      <h2>Peperiksaan memerlukan lesen 1 tahun</h2>
      <p class="small">Akaun trial boleh guna modul Latihan. Untuk buka Peperiksaan, redeem kod lesen exam daripada admin/guru selepas subscribe.</p>
      <button class="btn gold" onclick="redeemExamLicenseFromSettings()">Redeem Kod Lesen Peperiksaan</button>
      <div style="height:10px"></div><button class="btn secondary" onclick="openUpkkWhatsApp('buy')">💬 Beli Lesen Melalui WhatsApp</button>
      <div style="height:10px"></div><button class="btn secondary" onclick="openUpkkWhatsApp('support')">📱 Hubungi Admin</button>
      <div style="height:10px"></div><button class="btn secondary" onclick="page='subjects';render()">Pergi ke Latihan</button>
    </section>`;
    return;
  }
  const rowsAll = examSubjectRows();
  const activeSessions = rowsAll.filter(r=>r.saved).length;
  const completedSubjects = rowsAll.filter(r=>r.completed).length;
  const totalQuestions = rowsAll.reduce((a,r)=>a+r.total,0);
  const readySubjects = rowsAll.filter(r=>r.total>0).length;
  const switcher = renderDashboardStudentSwitcher();
  const cards = rowsAll.map(r=>{
    const savedNote = r.saved
      ? `<div class="exam-resume-note"><b>Sesi belum selesai</b><span>Soalan ${r.current}/${r.total} • ${r.answered} dijawab • baki ${r.remaining}</span></div>`
      : r.completed
        ? `<div class="exam-ready-note exam-completed-note"><b>Subjek telah selesai</b><span>${r.allCompleted?'Semua subjek selesai. Ulang peperiksaan dibenarkan.':'Ulang dikunci sehingga 6 subjek selesai.'}</span></div>`
        : `<div class="exam-ready-note"><b>Sedia dimulakan</b><span>45 minit • random tanpa ulang • autosave aktif</span></div>`;
    const action = r.saved
      ? `<button class="btn exam-start-btn" onclick="resumeExam('${r.key}')">Sambung Peperiksaan</button><button class="btn danger exam-reset-btn" onclick="restartExam('${r.key}')">Reset</button>`
      : r.completed
        ? `<button class="btn exam-start-btn ${r.allCompleted?'':'locked'}" onclick="repeatExamOrNotify('${r.key}')">Ulang Peperiksaan</button>`
        : `<button class="btn exam-start-btn" onclick="startExam('${r.key}')" ${r.total<=0?'disabled':''}>Mula Peperiksaan</button>`;
    return `<article class="exam-modern-card tone-${r.theme.tone} ${r.saved?'has-session':'no-session'}">
      <div class="exam-card-bg"></div>
      <div class="exam-card-head title-inline">
        <div class="exam-title-inline">
          <div class="exam-subject-badge"><span>${r.s.icon || r.theme.emoji}</span></div>
          <div><h3>${escapeHtml(r.title)}</h3><p>Kertas rasmi UPKK SmartKids</p></div>
        </div>
        <div class="exam-ring modern" style="--p:${r.progress}"><span>${r.progress}%</span></div>
      </div>
      <div class="exam-card-body">
        ${savedNote}
        <div class="exam-progress modern"><span style="width:${r.progress}%"></span></div>
        <div class="exam-mini-stats">
          <div><b>45</b><span>Minit</span></div>
          <div><b>${r.total}</b><span>Soalan</span></div>
        </div>
      </div>
      <div class="exam-action-row">${action}</div>
    </article>`;
  }).join('');
  $app.innerHTML = `${profileSummary()}
  ${switcher}
  <section class="exam-hero-modern">
    <div class="exam-hero-glow"></div>
    <div class="exam-hero-content">
      <span class="latihan-kicker">📝 PEPERIKSAAN RASMI</span>
      <h2>Peperiksaan UPKK SmartKids</h2>
      
      <div class="exam-overview-cards">
        <div><b>${readySubjects}/6</b><span>Subjek Sedia</span></div>
        <div><b>${completedSubjects}/6</b><span>Subjek Selesai</span></div>
        <div><b>${activeSessions}</b><span>Sesi Sambung</span></div>
      </div>
      <div class="exam-rule-strip"><span>⏱️ 45 minit/subjek</span><span>🎯 Target 40 soalan</span><span>💾 Autosave aktif</span></div>
    </div>
  </section>

  <section class="exam-smart-panel">
    <div class="exam-smart-card primary">
      <span class="latihan-kicker small">📌 ARAHAN PEPERIKSAAN</span>
      <h3>Jawab dengan tenang dan teliti</h3>
      <p>Jawapan disimpan automatik. Jika app tertutup, pelajar boleh sambung semula tanpa reset timer.</p>
    </div>
    <div class="exam-smart-card secondary">
      <span class="latihan-kicker small">💾 SAMBUNG SESI</span>
      <h3>${activeSessions?`${activeSessions} sesi belum selesai`:'Tiada sesi tertangguh'}</h3>
      <p>${activeSessions?'Tekan Sambung Peperiksaan pada subjek berkaitan.':'Mula mana-mana subjek untuk cipta sesi peperiksaan baharu.'}</p>
    </div>
  </section>

  <section class="latihan-toolbar exam-toolbar">
    <div><b>Subjek Peperiksaan</b><span>${rowsAll.length} subjek rasmi dipaparkan</span></div>
  </section>
  <div class="exam-modern-grid">${cards}</div>`;
}

function showPremiumInfo(){ alert('Untuk versi live: setiap pembeli akan dapat kod unik sekali pakai. Firebase akan ikat kod kepada username ' + (profile.username||'-') + ' dan maksimum 2 device. Tiada kod umum seperti UPKK2026.'); }

function pickQuestions(subjectKey, count=10){
  // v8.07: Practice/Latihan wajib cuba ambil 10 soalan random daripada bank soalan Firebase.
  // Jika baki cycle tidak cukup, cycle digunakan semula supaya tidak tersangkut pada 5/8 soalan lama.
  const targetCount = Math.max(10, Number(count)||10);
  const pool = uniqueQuestions(subjectKey);
  const u = usedMap();
  const usedKey = `${subjectKey}_${profile.mode||'rumi'}_${quizType||'practice'}`;
  const used = new Set(u[usedKey] || []);
  let available = pool.filter(q => !used.has(questionSignature(q)));

  if(!pool.length){
    alert('Bank soalan subjek ini belum tersedia. Sila semak Firebase Realtime Database path apps/UPKK/questionBank.');
    return [];
  }

  // Jika baki tidak cukup untuk satu session 10 soalan, reset cycle.
  if (available.length < Math.min(targetCount, pool.length)) {
    available = [...pool];
    u[usedKey] = [];
  }

  let selected = shuffle(available).slice(0, Math.min(targetCount, available.length));
  // Jangan ulang soalan yang sama dalam satu sesi. Jika bank unik belum cukup 10,
  // papar soalan unik yang ada sahaja dan beritahu admin supaya tambah bank soalan.
  if(selected.length < targetCount){
    console.warn(`Bank soalan unik ${subjectKey} hanya ${selected.length}/${targetCount}. Tambah questionBank unik di Firebase.`);
  }
  const usedSigs = selected.map(q => questionSignature(q));
  u[usedKey] = [...new Set([...(u[usedKey] || []), ...usedSigs])];
  saveUsed(u);
  return selected.map(q => prepareQuestion(q, true));
}
function prepareQuestion(q, shuffleOptions){
  const opts=q.optionsRumi.map((rumi,i)=>({rumi,jawi:q.optionsJawi[i],correct:i===q.answer, originalIndex:i}));
  const prepared=shuffleOptions?shuffle(opts):opts;
  return {...q, preparedOptions:prepared, preparedAnswer:prepared.findIndex(o=>o.correct)};
}
function startPractice(subjectKey){ return startPracticeMode(subjectKey,'Latihan Ringkas',10); }
async function startPracticeMode(subjectKey, modeName='Latihan Ringkas', count=10){
  if(!requireProfile()) return; clearTimer(); quizType='practice';
  const s=await ensureSubjectLoaded(subjectKey); if(!s) return;
  const questions = pickQuestions(subjectKey,count);
  if(!questions.length) return;
  currentQuiz={ type:modeName, subjectKey, title:subjectTitle(s), icon:s.icon, questions, index:0, score:0, answers:[], startedAt:nowMs() };
  selectedAnswer=null; renderQuiz();
}
function buildExamQuestions(subjectKey){
  const pool = uniqueQuestions(subjectKey);
  const selected = shuffle(pool).slice(0, EXAM_TARGET_QUESTIONS);
  if(selected.length < EXAM_TARGET_QUESTIONS){ console.warn(`Peperiksaan ${subjectKey} hanya ada ${selected.length}/${EXAM_TARGET_QUESTIONS} soalan unik. Semak Firebase questionBank.`); }
  return selected.map(q=>prepareQuestion(q,false));
}
function restoreExamQuestions(subjectKey, ids=[]){
  const prepared = uniqueQuestions(subjectKey).map(q=>prepareQuestion(q,false));
  const byId = new Map(prepared.map(q=>[String(q.id || q.sourceNo), q]));
  const restored = (ids||[]).map(id=>byId.get(String(id))).filter(Boolean);
  return restored.length ? restored : buildExamQuestions(subjectKey);
}
function applySavedAnswerToQuestion(q, saved){
  if(!saved || typeof saved.selected !== 'number') return q;
  return {...q, savedAnswer:saved.selected};
}
async function startExam(subjectKey){
  upkkPlaySound('examStart');
  if(!requireProfile()) return;
  if(!hasActiveExamAccess()){ alert('Peperiksaan memerlukan lesen aktif 1 tahun.'); return redeemExamLicenseFromSettings(); }
  if(!canStartExamSubject(subjectKey)) return showExamRepeatLocked();
  clearTimer(); quizType='exam';
  const s=await ensureSubjectLoaded(subjectKey); if(!s) return;
  const questions=buildExamQuestions(subjectKey);
  currentQuiz={ type:'Peperiksaan', subjectKey, title:subjectTitle(s), icon:s.icon, exam:{...(s.exam||{}), durationMinutes:45, marks:questions.length}, questions, index:0, score:0, answers:[], startedAt:nowMs(), startedAtIso:new Date().toISOString(), endsAt: nowMs()+(EXAM_DURATION_SECONDS*1000) };
  selectedAnswer=null; persistExamSession(); startTimer(); renderQuiz();
}
async function resumeExam(subjectKey){
  if(!requireProfile()) return; clearTimer(); quizType='exam';
  const s=await ensureSubjectLoaded(subjectKey); const saved=examSessionLocal(subjectKey); if(!s||!saved) return startExam(subjectKey);
  let questions=restoreExamQuestions(subjectKey, saved.questionIds);
  const answerMap=new Map((saved.answers||[]).map(a=>[String(a.id),a]));
  questions=questions.map(q=>applySavedAnswerToQuestion(q, answerMap.get(String(q.id||q.sourceNo))));
  const remainingSeconds=Math.max(1, Number(saved.remainingSeconds||EXAM_DURATION_SECONDS));
  currentQuiz={ type:'Peperiksaan', subjectKey, title:subjectTitle(s), icon:s.icon, exam:{...(s.exam||{}), durationMinutes:45, marks:questions.length}, questions, index:Math.min(Number(saved.currentIndex||0), Math.max(questions.length-1,0)), score:0, answers:saved.answers||[], startedAt: Date.parse(saved.startedAt)||nowMs(), startedAtIso:saved.startedAt||new Date().toISOString(), endsAt: nowMs()+(remainingSeconds*1000) };
  const q=currentQuiz.questions[currentQuiz.index]; const a=answerMap.get(String(q?.id||q?.sourceNo)); selectedAnswer=(a&&typeof a.selected==='number')?a.selected:null;
  startTimer(); renderQuiz();
}
function restartExam(subjectKey){ appConfirm('Reset sesi peperiksaan subjek ini dan mula semula?', ()=>{ clearExamSession(subjectKey); startExam(subjectKey); }); }
function clearTimer(){ if(examTimer){ clearInterval(examTimer); examTimer=null; } }
function startTimer(){ clearTimer(); examTimer=setInterval(()=>{ if(!currentQuiz||quizType!=='exam') return clearTimer(); const remaining=Math.max(0, Math.ceil((currentQuiz.endsAt-nowMs())/1000)); const el=document.getElementById('timerText'); if(el) el.textContent=timeLeftText(); if(remaining<=0){ persistExamSession(); alert('Masa tamat. Jawapan akan dihantar secara automatik.'); finishQuiz(true); } },1000); }
function timeLeftText(){ if(!currentQuiz?.endsAt) return ''; const ms=Math.max(0,currentQuiz.endsAt-nowMs()); const m=Math.floor(ms/60000), s=Math.floor((ms%60000)/1000); return `${m}:${String(s).padStart(2,'0')}`; }

function questionHtml(q){
  const isJawi = lang()==='jawi';
  const qText = textByMode(q,'qRumi','qJawi');
  const main = `<div class="question exam-question-text${isJawi?' jawi rtl':''}">${escapeHtml(qText)}</div>`;
  if(quizType==='exam'){
    const sectionText = textByMode(q,'sectionRumi','sectionJawi') || currentQuiz.title;
    const instText = textByMode(q,'instructionRumi','instructionJawi') || (isJawi ? 'ڤيليه جاواڤن يڠ بتول' : 'Pilih jawapan yang betul');
    const nameLabel = isJawi ? 'نام' : 'Nama';
    const markLabel = isJawi ? 'مرکه' : 'Markah';
    const answered = examAnsweredCount();
    return `<div class="exam-head exam-official-head${isJawi?' rtl jawi':''}">
      <div class="exam-head-main">
        <div>
          <span class="exam-kertas-label">KERTAS PEPERIKSAAN</span>
          <h2>${currentQuiz.icon} ${escapeHtml(currentQuiz.title)}</h2>
          <p class="small">${nameLabel}: <b>${escapeHtml(profile.name)}</b> • ${markLabel}: ${currentQuiz.exam?.marks||currentQuiz.questions.length} • Dijawab ${answered}/${currentQuiz.questions.length}</p>
        </div>
        <div class="exam-timer-box"><span>Masa Berbaki</span><b id="timerText">${timeLeftText()}</b></div>
      </div>
      <div class="exam-meta exam-meta-official"><div>No. ${currentQuiz.index+1}</div><div>Auto-save Aktif</div><div>${Math.round(((currentQuiz.index+1)/currentQuiz.questions.length)*100)}%</div></div>
    </div><div class="section-title exam-section-title${isJawi?' rtl jawi':''}">${escapeHtml(sectionText)} — ${escapeHtml(instText)}</div>${main}`;
  }
  return main;
}

function examAnsweredCount(){
  if(!currentQuiz?.answers) return 0;
  return currentQuiz.answers.filter(a=>typeof a.selected==='number').length;
}
function examQuestionPalette(){
  if(!currentQuiz?.questions) return '';
  const answered = new Set((currentQuiz.answers||[]).filter(a=>typeof a.selected==='number').map(a=>String(a.id)));
  const buttons = currentQuiz.questions.map((q,i)=>{
    const cls = ['exam-qdot'];
    if(i===currentQuiz.index) cls.push('current');
    if(answered.has(String(q.id))) cls.push('answered');
    return `<button class="${cls.join(' ')}" onclick="jumpExamQuestion(${i})">${i+1}</button>`;
  }).join('');
  return `<div class="exam-palette"><div class="exam-palette-title"><b>Navigasi Soalan</b><span>${examAnsweredCount()} dijawab</span></div><div class="exam-qgrid">${buttons}</div></div>`;
}
function jumpExamQuestion(i){
  if(quizType!=='exam' || !currentQuiz) return;
  currentQuiz.index=Math.max(0, Math.min(Number(i)||0, currentQuiz.questions.length-1));
  selectedAnswer=selectedForCurrent();
  persistExamSession();
  renderQuiz();
}
function optionText(o,idx){ const label=String.fromCharCode(65+idx); if(profile.mode==='jawi') return `<b>${label}.</b> ${escapeHtml(o.jawi || o.rumi)}`; return `<b>${label}.</b> ${escapeHtml(o.rumi)}`; }
function renderQuiz(){
  const q=currentQuiz.questions[currentQuiz.index]; const isExam=quizType==='exam'; const done=isExam ? selectedAnswer!==null : selectedAnswer!==null; const pct=Math.round(((currentQuiz.index+1)/currentQuiz.questions.length)*100);
  const opts=q.preparedOptions.map((o,i)=>{ let cls='option'; if(profile.mode==='jawi') cls+=' rtl'; if(isExam && i===selectedAnswer) cls+=' active'; if(!isExam && done&&i===q.preparedAnswer) cls+=' correct'; if(!isExam && done&&i===selectedAnswer&&i!==q.preparedAnswer) cls+=' wrong'; return `<button class="${cls}" ${(!isExam&&done)?'disabled':''} onclick="chooseAnswer(${i})">${optionText(o,i)}</button>`; }).join('');
  const paperClass=isExam?' exam-paper':'';
  const examNav = isExam ? `<div class="exam-actions"><button class="btn secondary exam-prev-btn" ${currentQuiz.index<=0?'disabled':''} onclick="prevQuestion()">← Sebelum</button><button class="btn secondary exam-next-btn" ${currentQuiz.index>=currentQuiz.questions.length-1?'disabled':''} onclick="nextQuestion()">Seterusnya →</button><button class="btn danger exam-submit-btn" onclick="confirmSubmitExam()">Hantar Peperiksaan</button></div>` : '';
  const practiceNext = (!isExam && done) ? `<div class="feedback ${selectedAnswer===q.preparedAnswer?'':'bad'}">${selectedAnswer===q.preparedAnswer?'Betul!':'Belum tepat. Jawapan betul telah ditanda.'}</div>${(q.note && !q.hideNote)?`<div class="answer-note">${escapeHtml(q.note)}</div>`:''}<button class="btn" onclick="nextQuestion()">${currentQuiz.index===currentQuiz.questions.length-1?'Lihat Keputusan':'Soalan Seterusnya'}</button>` : '';
  const examPalette = isExam ? examQuestionPalette() : '';
  $app.innerHTML = `<section class="card${paperClass}"><div class="quiz-top exam-quiz-top"><span class="pill">${currentQuiz.icon} ${escapeHtml(currentQuiz.type)}</span><span class="pill">${currentQuiz.index+1}/${currentQuiz.questions.length}</span></div><div class="progress exam-progress"><span style="width:${pct}%"></span></div>${questionHtml(q)}<div style="height:12px"></div>${opts}${practiceNext}${examNav}${examPalette}</section>`;
}
function upsertExamAnswer(q, selected){
  const correct=selected===q.preparedAnswer;
  const rec={id:q.id, sourceNo:q.sourceNo, selected, correct, answeredAt:new Date().toISOString()};
  const idx=currentQuiz.answers.findIndex(a=>String(a.id)===String(q.id));
  if(idx>=0) currentQuiz.answers[idx]=rec; else currentQuiz.answers.push(rec);
  q.savedAnswer=selected;
}
function chooseAnswer(i){
  const q=currentQuiz.questions[currentQuiz.index];
  if(quizType==='exam'){
    upkkPlaySound('tap'); selectedAnswer=i; upsertExamAnswer(q,i); persistExamSession(); renderQuiz(); return;
  }
  if(selectedAnswer!==null) return; selectedAnswer=i; const correct=i===q.preparedAnswer; upkkPlaySound(correct?'correct':'wrong'); if(correct) currentQuiz.score++; currentQuiz.answers.push({id:q.id, sourceNo:q.sourceNo, correct}); renderQuiz();
}
function selectedForCurrent(){ const q=currentQuiz?.questions?.[currentQuiz.index]; if(!q) return null; const a=(currentQuiz.answers||[]).find(x=>String(x.id)===String(q.id)); return a&&typeof a.selected==='number'?a.selected:null; }
function nextQuestion(){ upkkPlaySound('tap'); if(quizType==='exam'){ if(currentQuiz.index<currentQuiz.questions.length-1){ currentQuiz.index++; selectedAnswer=selectedForCurrent(); persistExamSession(); renderQuiz(); } return; } selectedAnswer=null; if(currentQuiz.index<currentQuiz.questions.length-1){ currentQuiz.index++; renderQuiz(); return; } finishQuiz(); }
function prevQuestion(){ upkkPlaySound('tap'); if(quizType!=='exam') return; if(currentQuiz.index>0){ currentQuiz.index--; selectedAnswer=selectedForCurrent(); persistExamSession(); renderQuiz(); } }
function confirmSubmitExam(){ upkkPlaySound('tap'); appConfirm('Hantar jawapan peperiksaan sekarang?', ()=>finishQuiz(false)); }
function finishQuiz(autoSubmit=false){
  if(!currentQuiz) return; clearTimer(); const qz=currentQuiz;
  const durationSec=Math.round((nowMs()-qz.startedAt)/1000);
  qz.durationSec=durationSec;
  if(isExamQuizType(qz.type)){
    qz.score=(qz.answers||[]).filter(a=>a.correct).length;
    qz.autoSubmit=!!autoSubmit;
  }
  const rec={ date:new Date().toLocaleString('ms-MY'), name:profile.name, studentId:profile.studentId, type:qz.type, subject:qz.title, subjectKey:qz.subjectKey, score:qz.score, total:qz.questions.length, answered:(qz.answers||[]).length, mode:modeLabel(), autoSubmit:!!autoSubmit, durationSec };
  const h=history(); h.push(rec); saveHistory(h); syncResultToFirebase(rec); evaluateAndSaveAchievements(rec); if(isExamQuizType(qz.type)) clearExamSession(qz.subjectKey); currentQuiz=null; selectedAnswer=null; renderFinish(qz);
}
function examDurationText(seconds){
  const total=Math.max(0, Number(seconds)||0);
  const m=Math.floor(total/60);
  const s=total%60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function examNextSubjectKey(currentKey){
  const order=examSubjectOrder();
  const idx=order.indexOf(currentKey);
  if(idx<0) return order.find(k=>!examCompletedSubjectKeys().has(k)) || '';
  for(let i=idx+1;i<order.length;i++){ if(!examCompletedSubjectKeys().has(order[i])) return order[i]; }
  return order.find(k=>!examCompletedSubjectKeys().has(k)) || '';
}
function examPerformanceMessage(pct){
  if(pct>=80) return 'Tahniah! Prestasi sangat baik.';
  if(pct>=50) return 'Bagus, teruskan usaha.';
  return 'Jangan putus asa, cuba lagi.';
}
function renderExamCompletionModal(qz,pct,grade){
  const duration=examDurationText(qz.durationSec);
  const nextKey=examNextSubjectKey(qz.subjectKey);
  const nextBtn=nextKey ? `<button class="btn" onclick="startExam('${nextKey}')">Subjek Seterusnya</button>` : `<button class="btn" onclick="page='exam';render()">Lihat Semua Subjek</button>`;
  return `<div class="exam-complete-modal" role="dialog" aria-modal="true">
    <div class="exam-complete-card">
      <div class="exam-complete-icon">🏆</div>
      <span class="badge">PEPERIKSAAN SELESAI</span>
      <h2>Alhamdulillah, ${escapeHtml(profile.name)}!</h2>
      <p class="exam-complete-message">${escapeHtml(profile.name)} berjaya menjawab ${qz.questions.length} soalan ${escapeHtml(qz.title)} dalam masa ${duration}. Teruskan berusaha sehingga berjaya dunia dan akhirat.</p>
      <div class="exam-complete-stats">
        <div><b>${qz.score}/${qz.questions.length}</b><span>Markah</span></div>
        <div><b>${pct}%</b><span>${grade}</span></div>
        <div><b>${duration}</b><span>Masa</span></div>
      </div>
      <p class="exam-complete-performance">${examPerformanceMessage(pct)}</p>
      <div class="exam-complete-actions">
        ${nextBtn}
        <button class="btn secondary" onclick="page='dashboard';render()">Kembali Dashboard</button>
        <button class="btn danger" onclick="repeatExamOrNotify('${qz.subjectKey}')">Ulang Peperiksaan</button>
      </div>
    </div>
  </div>`;
}
function renderFinish(qz){ const pct=Math.round(qz.score/qz.questions.length*100); const grade=pct>=80?'Cemerlang':pct>=60?'Baik':pct>=40?'Usaha lagi':'Perlu ulang kaji';
  const isExamResult = isExamQuizType(qz.type);
  const repeatAction = isExamResult ? `repeatExamOrNotify('${qz.subjectKey}')` : `startPractice('${qz.subjectKey}')`;
  const repeatNote = isExamResult && !examAllSubjectsCompleted() ? `<div class="exam-repeat-note">Untuk ulang peperiksaan penuh, sila lengkapkan semua subjek terlebih dahulu.</div>` : '';
  const examModal = isExamResult ? renderExamCompletionModal(qz,pct,grade) : '';
  const celebration = upkkResultAnimationHtml(qz,pct,grade);
  const nextKey = isExamResult ? examNextSubjectKey(qz.subjectKey) : '';
  const nextAction = nextKey ? `<button class="btn" onclick="upkkPlaySound('tap');startExam('${nextKey}')">Subjek Seterusnya</button><div style="height:10px"></div>` : '';
  $app.innerHTML = `${examModal}${celebration}<section class="card hero upkk-slip-card"><span class="badge">🏆 SLIP KEPUTUSAN</span><h2 class="title">Tahniah, ${escapeHtml(profile.name)}!</h2><p class="subtitle">${escapeHtml(qz.type)} • ${escapeHtml(qz.title)} • Mode ${modeLabel()}</p><div class="stats"><div class="stat"><b data-upkk-count="${qz.score}">0</b><span>Betul</span></div><div class="stat"><b data-upkk-count="${qz.questions.length-qz.score}">0</b><span>Salah</span></div><div class="stat"><b data-upkk-count="${pct}">0</b><span>${grade}</span></div></div><p class="upkk-motivasi">${escapeHtml(upkkMotivationMessage(pct))}</p></section><section class="card upkk-result-actions">${repeatNote}${nextAction}<button class="btn" onclick="upkkPlaySound('tap');${repeatAction}">Ulang ${isExamResult?'Peperiksaan':escapeHtml(qz.title)}</button><div style="height:10px"></div><button class="btn secondary" onclick="upkkPlaySound('tap');page='${isExamResult?'exam':'subjects'}';render()">${isExamResult?'Pilih Subjek Lain':'Pilih Subjek Lain'}</button></section>`;
  upkkCelebrateFinish(qz);
}
function renderResult(){
  const h=history().reverse();
  $app.innerHTML = `${profileSummary()}
  <section class="card">
    <span class="badge">🏆 LEADERBOARD</span>
    <h2 class="title">Ranking Pelajar Keluarga</h2>
    <p class="small">Paparan ini hanya menunjukkan pelajar di bawah akaun parent yang sama.</p>
    ${leaderboardHtml(50)}
  </section>
  <section class="card">
    <span class="badge">📊 REKOD SAYA</span>
    <h2 class="title">Sejarah latihan & exam murid ini</h2>
    ${h.length ? h.slice(0,8).map(x=>`<div class="stat" style="text-align:left;margin-top:8px"><b>${escapeHtml(x.type)} • ${escapeHtml(x.subject)} — ${x.score}/${x.total}</b><span>${escapeHtml(x.date)} • ${escapeHtml(x.mode)}</span></div>`).join('') : '<div class="empty">Belum ada rekod keputusan.</div>'}
    ${h.length ? '<div style="height:12px"></div><button class="btn danger" onclick="clearResults()">Padam Rekod</button>' : ''}
  </section>`;
}
function clearResults(){ appConfirm('Padam semua rekod keputusan?', ()=>{ localStorage.removeItem(studentKey(HISTORY_KEY)); syncHistoryToFirebase([]); renderResult(); }); }

// Development helper only: enablePremiumForTesting() can be run from browser console by developer.
function enablePremiumForTesting(){ profile.plan=PREMIUM_STATUS.PREMIUM; profile.premiumCode='DEV-LOCAL-ONLY'; saveProfile(); render(); }


/* =========================================================
   UPKK SmartKids v3.18 - Exam History + PDF Report Ready
   Frontend only: no Firebase/database structure change.
========================================================= */

const UPKK_UI_SOUND = {
  enabled: true,
  engine: 'web_audio',
  mode: 'soft_kids',
  volume: 0.9,
  volumeBoost: 1.5,
  events: {
    buttonClick:{enabled:true,tone:'tone:click',volume:0.6},
    correctAnswer:{enabled:true,tone:'tone:correct',volume:1},
    wrongAnswer:{enabled:true,tone:'tone:wrong',volume:0.8},
    switchStudent:{enabled:true,tone:'tone:switch',volume:0.75},
    selectAvatar:{enabled:true,tone:'tone:avatar',volume:0.75},
    examStart:{enabled:true,tone:'tone:examStart',volume:0.95},
    examFinish:{enabled:true,tone:'tone:examFinish',volume:1},
    voiceReward:{enabled:true,tone:'tone:correct',volume:0.9,voiceEnabled:true}
  }
};
const UPKK_SOUND_ALIAS = {
  tap:'buttonClick',
  correct:'correctAnswer',
  wrong:'wrongAnswer',
  finish:'examFinish',
  popup:'buttonClick'
};
let UPKK_SOUND_SETTINGS_LOADED = false;
let UPKK_AUDIO_CTX = null;
function normalizeUpkkSoundSettings(raw){
  const merged = {
    ...UPKK_UI_SOUND,
    ...(raw || {}),
    events: {...UPKK_UI_SOUND.events, ...((raw||{}).events||{})}
  };
  merged.enabled = merged.enabled !== false;
  merged.engine = 'web_audio';
  merged.volume = Math.max(0, Math.min(1, Number(merged.volume ?? 0.9)));
  merged.volumeBoost = Math.max(1, Math.min(2, Number(merged.volumeBoost ?? 1.5)));
  Object.keys(merged.events || {}).forEach(k=>{
    merged.events[k] = {...(UPKK_UI_SOUND.events[k]||{}), ...(merged.events[k]||{})};
    if(!merged.events[k].tone && merged.events[k].file){
      const f = String(merged.events[k].file).toLowerCase();
      if(f.includes('correct')) merged.events[k].tone = 'tone:correct';
      else if(f.includes('wrong')) merged.events[k].tone = 'tone:wrong';
      else if(f.includes('finish')) merged.events[k].tone = 'tone:examFinish';
      else if(f.includes('popup')) merged.events[k].tone = 'tone:switch';
      else merged.events[k].tone = 'tone:click';
    }
    merged.events[k].volume = Math.max(0, Math.min(1, Number(merged.events[k].volume ?? 0.85)));
  });
  return merged;
}
async function loadUpkkSoundSettingsForUser(force=false){
  if(UPKK_SOUND_SETTINGS_LOADED && !force) return UPKK_UI_SOUND;
  const db = firebaseDb();
  if(!db) return UPKK_UI_SOUND;
  try{
    const snap = await firebaseGetOnce(fbPath('settings','sound'));
    if(snap.exists()) Object.assign(UPKK_UI_SOUND, normalizeUpkkSoundSettings(snap.val()));
    UPKK_SOUND_SETTINGS_LOADED = true;
  }catch(err){ console.warn('Sound settings unavailable:', err); }
  return UPKK_UI_SOUND;
}
function upkkSoundEvent(name){
  const eventKey = UPKK_SOUND_ALIAS[name] || name;
  return (UPKK_UI_SOUND.events && UPKK_UI_SOUND.events[eventKey]) || null;
}
function upkkAudioCtx(){
  UPKK_AUDIO_CTX = UPKK_AUDIO_CTX || new (window.AudioContext || window.webkitAudioContext)();
  return UPKK_AUDIO_CTX;
}
function upkkPlayTone(tone, volume=0.8){
  try{
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx) return;
    const ctx = upkkAudioCtx();
    if(ctx.state === 'suspended') ctx.resume().catch(()=>{});
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
function upkkPlaySound(name){
  try{
    if(!UPKK_UI_SOUND.enabled) return;
    const event = upkkSoundEvent(name) || {};
    if(event.enabled === false) return;
    const finalVolume = Math.max(0, Math.min(1, Number(UPKK_UI_SOUND.volume ?? 0.9) * Number(event.volume ?? 0.85) * Number(UPKK_UI_SOUND.volumeBoost ?? 1.5)));
    upkkPlayTone(event.tone || 'tone:click', finalVolume);
  }catch(e){}
}
function upkkVoiceReward(pct){
  try{
    const event = upkkSoundEvent('voiceReward');
    if(!UPKK_UI_SOUND.enabled || !event || event.enabled === false || event.voiceEnabled === false) return;
    if(!('speechSynthesis' in window)) return;
    const msg = pct>=90 ? 'Tahniah, hebat sangat!' : pct>=80 ? 'Alhamdulillah, cemerlang!' : pct>=60 ? 'Bagus, teruskan usaha!' : 'Cuba lagi ya, jangan putus asa.';
    const u = new SpeechSynthesisUtterance(msg);
    u.lang = 'ms-MY';
    u.rate = 0.95;
    u.pitch = 1.05;
    u.volume = Math.max(0, Math.min(1, Number(UPKK_UI_SOUND.volume ?? 0.85) * Number(event.volume ?? 0.9)));
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }catch(e){}
}
function upkkMotivationMessage(pct){
  if(pct>=90) return 'Mumtaz! Hebat sungguh usaha adik. Teruskan istiqamah belajar.';
  if(pct>=80) return 'Cemerlang! Ilmu yang diamalkan akan menjadi cahaya.';
  if(pct>=60) return 'Bagus! Teruskan ulang kaji, kejayaan makin dekat.';
  if(pct>=40) return 'Usaha yang baik. Cuba lagi dan jangan putus asa.';
  return 'Tidak mengapa, belajar perlahan-lahan. Setiap usaha ada ganjaran.';
}
function upkkStarRating(pct){
  const count = pct>=90 ? 5 : pct>=75 ? 4 : pct>=55 ? 3 : pct>=35 ? 2 : 1;
  return Array.from({length:5},(_,i)=>`<span class="${i<count?'active':''}">★</span>`).join('');
}
function upkkConfettiLayer(){
  const pieces = ['✨','⭐','🎉','🌟','💫'];
  return `<div class="upkk-confetti" aria-hidden="true">${Array.from({length:34},(_,i)=>`<i style="--i:${i};--x:${(i*37)%100};--d:${(i%9)*.08}s">${pieces[i%pieces.length]}</i>`).join('')}</div>`;
}
function upkkResultPercent(qz){ return Math.round((Number(qz.score||0)/Math.max(Number(qz.questions?.length||1),1))*100); }
function upkkResultAnimationHtml(qz, pct, grade){
  return `<div class="upkk-result-celebration" role="status">
    ${upkkConfettiLayer()}
    <div class="upkk-result-card">
      <div class="upkk-result-orbit"><span>🏆</span></div>
      <span class="upkk-result-badge">Alhamdulillah, selesai!</span>
      <h2>${escapeHtml(profile.name || 'Pelajar Hebat')}</h2>
      <p>${escapeHtml(upkkMotivationMessage(pct))}</p>
      <div class="upkk-score-ring" style="--score:${pct}"><b>${pct}%</b><small>${escapeHtml(grade)}</small></div>
      <div class="upkk-stars">${upkkStarRating(pct)}</div>
    </div>
  </div>`;
}
function upkkEnhanceResultNumbers(){
  try{
    document.querySelectorAll('[data-upkk-count]').forEach(el=>{
      const target = Number(el.getAttribute('data-upkk-count')||0);
      let start = null;
      const dur = 850;
      const step = (ts)=>{
        if(start===null) start=ts;
        const p=Math.min(1,(ts-start)/dur);
        el.textContent = String(Math.round(target*(1-Math.pow(1-p,3))));
        if(p<1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }catch(e){}
}
function upkkCelebrateFinish(qz){
  try{
    const pct = upkkResultPercent(qz);
    upkkPlaySound('examFinish');
    if(navigator.vibrate) navigator.vibrate([40,30,40]);
    setTimeout(upkkEnhanceResultNumbers, 60);
    setTimeout(()=>upkkVoiceReward(pct), 420);
  }catch(e){}
}

window.addEventListener('beforeunload', ()=>{ try{ persistExamSession(); }catch(e){} });
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden'){ try{ persistExamSession(); }catch(e){} } });
boot();
