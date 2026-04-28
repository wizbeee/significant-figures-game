// 유효숫자 마스터 - PC방 스타일 네트워크 서버 (zero-dependency)
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const os = require('os');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT) || 8093;
const ROOT = __dirname;
// DATA_DIR을 환경변수로 덮어쓸 수 있음 — 클라우드 배포 시 영구 디스크 경로로 지정
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const CLASSROOMS_FILE = path.join(DATA_DIR, 'classrooms.json');
const LB_FILE = path.join(DATA_DIR, 'leaderboards.json');
const STUDENTS_FILE = path.join(DATA_DIR, 'students.json');
const ATTEND_FILE = path.join(DATA_DIR, 'attendance.json');
const TOKENS_FILE = path.join(DATA_DIR, 'tokens.json');
const PRESETS_FILE = path.join(DATA_DIR, 'presets.json');
const WRONGS_FILE = path.join(DATA_DIR, 'wrongs.json');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
// (레거시) 단일 교실용 파일 — 있으면 자동으로 default 교실로 이관
const LEGACY_CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const DEFAULT_CLASSROOM = 'default';
const STUDENT_TOKEN_TTL_MS = 1000 * 60 * 60 * 6;   // 6시간 — 정규수업 한 차시 + 여유
const TEACHER_TOKEN_TTL_MS = 1000 * 60 * 60 * 12;  // 12시간

// ==================== 영구 데이터 ====================
function safeLoad(file, def) {
  if (!fs.existsSync(file)) return def;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) {
    console.error('[load] corrupt:', file, '→ 백업 후 기본값 사용');
    try { fs.copyFileSync(file, file + '.corrupt.' + Date.now()); } catch(_) {}
    return def;
  }
}
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

// 비밀번호 해싱 — PBKDF2 + salt (sha256은 약함)
// 형식: "pbkdf2$<salt>$<hash>"  레거시: 64자 hex(sha256)도 지원
function hashPwWithSalt(pw, saltHex) {
  const salt = saltHex || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(pw||''), salt, 100000, 32, 'sha256').toString('hex');
  return `pbkdf2$${salt}$${hash}`;
}
function hashPw(pw) { return hashPwWithSalt(pw); }
function verifyPw(pw, stored) {
  if (!stored) return false;
  if (stored.startsWith('pbkdf2$')) {
    const [, salt, hash] = stored.split('$');
    const cand = crypto.pbkdf2Sync(String(pw||''), salt, 100000, 32, 'sha256').toString('hex');
    try { return crypto.timingSafeEqual(Buffer.from(cand, 'hex'), Buffer.from(hash, 'hex')); } catch { return false; }
  }
  // 레거시 sha256
  const cand = crypto.createHash('sha256').update(String(pw||'')).digest('hex');
  return cand === stored;
}
// HTML 안전 문자열 (서버측 — 저장 전 기본 sanitize)
function sanitizeStr(v, max = 50) {
  return [...String(v || '')].filter(c => { const code = c.charCodeAt(0); return code >= 32 && code !== 127; }).join('').trim().slice(0, max);
}
// 차단어 (서버측 — 클라이언트 우회 대비)
const BAD_WORDS = ['시발','씨발','병신','개새','존나','좆','꺼져','지랄','새끼','fuck','shit','bitch','asshole','damn'];
function hasBadWord(s) {
  if (!s) return false;
  const t = String(s).toLowerCase().replace(/\s/g,'');
  return BAD_WORDS.some(w => t.includes(w));
}

// 교실 정의: { [code]: { code, name, passwordHash, createdAt, config: { autoApproveRooms, sheetsUrl } } }
let classrooms = {};
if (fs.existsSync(CLASSROOMS_FILE)) {
  classrooms = safeLoad(CLASSROOMS_FILE, {});
}
const saveClassrooms = () => { try { atomicWrite(CLASSROOMS_FILE, JSON.stringify(classrooms, null, 2)); } catch (e) { console.error('[save] classrooms:', e.message); }};

// 레거시 config.json → default 교실로 자동 이관 (첫 실행 시만)
if (fs.existsSync(LEGACY_CONFIG_FILE) && !classrooms[DEFAULT_CLASSROOM]) {
  try {
    const old = JSON.parse(fs.readFileSync(LEGACY_CONFIG_FILE, 'utf8'));
    classrooms[DEFAULT_CLASSROOM] = {
      code: DEFAULT_CLASSROOM,
      name: '기본 교실',
      passwordHash: hashPw(old.teacherPassword || process.env.TEACHER_PASSWORD || '3000'),
      createdAt: Date.now(),
      config: { autoApproveRooms: !!old.autoApproveRooms, sheetsUrl: old.sheetsUrl || '' },
    };
    saveClassrooms();
    console.log('[이관] 레거시 config.json → default 교실로 이전 완료');
  } catch (e) { /* ignore */ }
}

// 교실이 하나도 없으면 기본 교실 자동 생성 (초기 설정 친화)
if (Object.keys(classrooms).length === 0) {
  classrooms[DEFAULT_CLASSROOM] = {
    code: DEFAULT_CLASSROOM,
    name: '기본 교실',
    passwordHash: hashPw(process.env.TEACHER_PASSWORD || '3000'),
    createdAt: Date.now(),
    config: { autoApproveRooms: false, sheetsUrl: '' },
  };
  saveClassrooms();
}

// 데이터 구조:
// leaderboards (글로벌): { single: [...entries], multi: [...entries], battle: [...entries] } — 각 entry에 classroomCode 포함
// studentsDb  (교실별): { [code]: { [studentId]: {studentId,name,joinedAt,stats,blocked} } }
// attendance  (교실별): { [code]: { [YYYY-MM-DD]: { [studentId]: {firstSeen,lastSeen,games,name} } } }
let leaderboards = safeLoad(LB_FILE, { single: [], multi: [], battle: [] });
let studentsDb   = safeLoad(STUDENTS_FILE, {});
let attendance   = safeLoad(ATTEND_FILE, {});

// 레거시 → 새 구조로 이관
function migrateLegacyIfNeeded() {
  // 1) 학생/출결: 플랫 → default 교실 감싸기
  const sKeys = Object.keys(studentsDb || {});
  if (sKeys.length > 0 && studentsDb[sKeys[0]] && typeof studentsDb[sKeys[0]].studentId === 'string') {
    studentsDb = { [DEFAULT_CLASSROOM]: studentsDb };
    fs.writeFileSync(STUDENTS_FILE, JSON.stringify(studentsDb, null, 2));
    console.log('[이관] 레거시 studentsDb → default 교실로 이전 완료');
  }
  const aKeys = Object.keys(attendance || {});
  if (aKeys.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(aKeys[0])) {
    attendance = { [DEFAULT_CLASSROOM]: attendance };
    fs.writeFileSync(ATTEND_FILE, JSON.stringify(attendance, null, 2));
    console.log('[이관] 레거시 attendance → default 교실로 이전 완료');
  }
  // 2) 점수판: 교실별({code:{single:...}}) → 글로벌 플랫으로 다시 평탄화
  if (leaderboards && !Array.isArray(leaderboards.single) && !Array.isArray(leaderboards.multi) && !Array.isArray(leaderboards.battle)) {
    // 현재 형태가 { [code]: { single, multi, battle } }인 경우
    const keys = Object.keys(leaderboards);
    const isClassroomScoped = keys.length > 0 && leaderboards[keys[0]] && Array.isArray(leaderboards[keys[0]].single);
    if (isClassroomScoped) {
      const flat = { single: [], multi: [], battle: [] };
      for (const code of keys) {
        for (const type of ['single','multi','battle']) {
          (leaderboards[code][type] || []).forEach(e => {
            flat[type].push({ ...e, classroomCode: e.classroomCode || code });
          });
        }
      }
      for (const t of ['single','multi','battle']) flat[t].sort((a,b) => b.score - a.score);
      leaderboards = flat;
      fs.writeFileSync(LB_FILE, JSON.stringify(leaderboards, null, 2));
      console.log('[이관] 점수판 → 글로벌 구조로 평탄화 완료 (' + (flat.single.length+flat.multi.length+flat.battle.length) + '건)');
    } else {
      // 완전히 비어있는 경우 기본값 세팅
      leaderboards = { single: [], multi: [], battle: [] };
    }
  }
  // 안전망: 누락된 타입 채우기
  for (const t of ['single','multi','battle']) if (!Array.isArray(leaderboards[t])) leaderboards[t] = [];
}
migrateLegacyIfNeeded();

// Atomic write: temp file → rename (race condition 방지)
function atomicWrite(target, data) {
  const tmp = target + '.tmp.' + process.pid;
  try { fs.writeFileSync(tmp, data); fs.renameSync(tmp, target); }
  catch (e) { try { fs.unlinkSync(tmp); } catch(_) {} throw e; }
}
// 디바운스 저장 — 자주 호출되어도 1초당 최대 1회 디스크 쓰기
function makeDebouncedSaver(target, getData, ms = 600) {
  let pending = false;
  return () => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      try { atomicWrite(target, JSON.stringify(getData())); } catch (e) { console.error('[save] failed:', target, e.message); }
    }, ms);
  };
}
const saveLB         = makeDebouncedSaver(LB_FILE,       () => leaderboards, 800);
const saveStudentsDb = makeDebouncedSaver(STUDENTS_FILE, () => studentsDb, 800);
const saveAttendance = makeDebouncedSaver(ATTEND_FILE,   () => attendance, 800);

// ==================== 토큰 영속화 (서버 재시작 시에도 로그인 유지) ====================
let persistedTokens = safeLoad(TOKENS_FILE, { student: {}, teacher: {} });
if (!persistedTokens.student) persistedTokens.student = {};
if (!persistedTokens.teacher) persistedTokens.teacher = {};
let _tokenSaveTimer = null;
function saveTokens() {
  if (_tokenSaveTimer) return;
  _tokenSaveTimer = setTimeout(() => {
    _tokenSaveTimer = null;
    try { atomicWrite(TOKENS_FILE, JSON.stringify(persistedTokens)); } catch (e) { console.error('[tokens] save failed:', e.message); }
  }, 1500);
}
function pruneExpiredTokens() {
  const now = Date.now();
  for (const t of Object.keys(persistedTokens.student)) if ((persistedTokens.student[t].expiresAt || 0) < now) delete persistedTokens.student[t];
  for (const t of Object.keys(persistedTokens.teacher)) if ((persistedTokens.teacher[t].expiresAt || 0) < now) delete persistedTokens.teacher[t];
  saveTokens();
}
pruneExpiredTokens();
setInterval(pruneExpiredTokens, 1000 * 60 * 30);

// 학습 분석/오답노트용 — 학생별 누적 오답 (교실 단위)
let wrongsDb = safeLoad(WRONGS_FILE, {});
function saveWrongs() { try { atomicWrite(WRONGS_FILE, JSON.stringify(wrongsDb)); } catch (e) {} }
function clsWrongs(code) { if (!wrongsDb[code]) wrongsDb[code] = {}; return wrongsDb[code]; }

// 교사 프리셋 (자주 쓰는 방 설정)
let presetsDb = safeLoad(PRESETS_FILE, {});
function savePresets() { try { atomicWrite(PRESETS_FILE, JSON.stringify(presetsDb, null, 2)); } catch (e) {} }
function clsPresets(code) { if (!presetsDb[code]) presetsDb[code] = []; return presetsDb[code]; }

// ==================== Rate Limiter (DoS / brute-force 방어) ====================
const rateBuckets = new Map();
function rateLimitOK(key, max, windowMs) {
  const now = Date.now();
  const b = rateBuckets.get(key);
  if (!b || now >= b.resetAt) { rateBuckets.set(key, { count: 1, resetAt: now + windowMs }); return true; }
  b.count++;
  return b.count <= max;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of rateBuckets) if (now >= v.resetAt) rateBuckets.delete(k); }, 1000 * 60);

// ==================== 자동 백업 (매일 0시 + 시작 1분 후) ====================
function makeBackupSnapshot() {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = path.join(BACKUPS_DIR, 'auto_' + stamp + '.json');
    const bundle = {
      classrooms, leaderboards,
      students: studentsDb, attendance, wrongs: wrongsDb, presets: presetsDb,
      backedUpAt: Date.now(),
    };
    fs.writeFileSync(file, JSON.stringify(bundle));
    const all = fs.readdirSync(BACKUPS_DIR).filter(n => n.startsWith('auto_')).sort();
    while (all.length > 14) { try { fs.unlinkSync(path.join(BACKUPS_DIR, all.shift())); } catch (e) {} }
    console.log('[backup] snapshot saved:', file);
  } catch (e) { console.error('[backup] failed:', e.message); }
}
function scheduleBackups() {
  setTimeout(makeBackupSnapshot, 60 * 1000);
  let lastBackupDay = -1;
  setInterval(() => {
    const d = new Date();
    if (d.getHours() === 0 && d.getDate() !== lastBackupDay) {
      lastBackupDay = d.getDate();
      makeBackupSnapshot();
    }
  }, 1000 * 60 * 30);
}
scheduleBackups();


// 교실별 접근 헬퍼 — 없으면 자동 생성
function clsroom(code) { return classrooms[code]; }
function clsStudents(code) {
  if (!studentsDb[code]) studentsDb[code] = {};
  return studentsDb[code];
}
function clsAttendance(code) {
  if (!attendance[code]) attendance[code] = {};
  return attendance[code];
}
function clsCfg(code) {
  const c = classrooms[code];
  if (!c) return null;
  if (!c.config) c.config = { autoApproveRooms: false, sheetsUrl: '' };
  return c.config;
}

// 교실 코드 정규화 (2~20자, 한글/영문/숫자/하이픈/언더스코어)
function normCode(v) {
  return String(v || '').trim().slice(0, 20);
}
function validCode(v) {
  const s = normCode(v);
  if (s.length < 2 || s.length > 20) return false;
  // 허용 문자: 한글, 영문, 숫자, -, _
  return /^[\u3131-\u318E\uAC00-\uD7A3A-Za-z0-9_\-]+$/.test(s);
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function emptyStats() {
  return {
    totalGames: 0, totalCorrect: 0, totalWrong: 0,
    bestScore: 0, maxStreak: 0, lastPlayedAt: 0,
    totalScore: 0,
    singleGames: 0, multiGames: 0, battleGames: 0,
    battleWins: 0, battleLosses: 0,
  };
}
// 기존 레코드 마이그레이션: 누락된 필드 채우기
function ensureStatsShape(s) {
  if (!s) return emptyStats();
  const d = emptyStats();
  for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
  return s;
}
function registerOrTouchStudent(classroomCode, studentId, name) {
  const sdb = clsStudents(classroomCode);
  let rec = sdb[studentId];
  if (rec) rec.stats = ensureStatsShape(rec.stats);
  if (!rec) {
    rec = { studentId, name, joinedAt: Date.now(), stats: emptyStats(), blocked: false };
    sdb[studentId] = rec;
  } else {
    rec.name = name; // 이름은 최신 로그인으로 갱신
  }
  // 출결 기록 (교실별)
  const adb = clsAttendance(classroomCode);
  const day = todayKey();
  if (!adb[day]) adb[day] = {};
  const a = adb[day][studentId] || { firstSeen: Date.now(), lastSeen: Date.now(), games: 0 };
  a.lastSeen = Date.now();
  a.name = name;
  adb[day][studentId] = a;
  saveStudentsDb();
  saveAttendance();
  return rec;
}
function accumulateStats(classroomCode, studentId, finalPlayer, roomType, battleResult) {
  const sdb = clsStudents(classroomCode);
  const rec = sdb[studentId];
  if (!rec) return;
  const s = ensureStatsShape(rec.stats);
  rec.stats = s;
  s.totalGames += 1;
  s.totalCorrect += finalPlayer.correct || 0;
  s.totalWrong += (finalPlayer.wrong || 0);
  s.totalScore += finalPlayer.score || 0;
  if ((finalPlayer.score || 0) > s.bestScore) s.bestScore = finalPlayer.score;
  if ((finalPlayer.maxStreak || 0) > s.maxStreak) s.maxStreak = finalPlayer.maxStreak;
  s.lastPlayedAt = Date.now();
  if (roomType === 'single') s.singleGames += 1;
  else if (roomType === 'multi') s.multiGames += 1;
  else if (roomType === 'battle') {
    s.battleGames += 1;
    if (battleResult === 'win') s.battleWins += 1;
    else if (battleResult === 'lose') s.battleLosses += 1;
  }
  const adb = clsAttendance(classroomCode);
  const day = todayKey();
  if (adb[day] && adb[day][studentId]) adb[day][studentId].games = (adb[day][studentId].games||0) + 1;
  saveStudentsDb();
  saveAttendance();
}

// ==================== 메모리 상태 ====================
const rooms = new Map();            // code → room (room.classroomCode 포함)
const students = new Map();         // (classroomCode + ':' + studentId) → session { classroomCode, studentId, name, token, lastSeen, currentRoom }
const studentTokens = new Map();    // token → { classroomCode, studentId }
const teacherTokens = new Map();    // token → classroomCode

function studentSessKey(classroomCode, studentId) { return classroomCode + ':' + studentId; }

// ==================== 유효숫자 로직 ====================
function analyze(str) {
  let s = String(str).replace(/^[+-]/, '');
  const hasDot = s.includes('.');
  const digs = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '.') { digs.push({ c: '.', i, sig: false, pt: true }); continue; }
    if (c >= '0' && c <= '9') digs.push({ c, i, sig: false, pt: false });
  }
  const nd = digs.filter(d => !d.pt);
  let fNZ = -1, lNZ = -1;
  for (let i = 0; i < nd.length; i++) {
    if (nd[i].c !== '0') { if (fNZ < 0) fNZ = i; lNZ = i; }
  }
  if (fNZ < 0) { if (nd.length) nd[nd.length - 1].sig = true; }
  else {
    for (let i = 0; i < nd.length; i++) {
      if (i < fNZ) nd[i].sig = false;
      else if (i <= lNZ) nd[i].sig = true;
      else nd[i].sig = hasDot;
    }
  }
  let ni = 0;
  for (let i = 0; i < digs.length; i++) if (!digs[i].pt) { digs[i].sig = nd[ni].sig; ni++; }
  return { digs, count: nd.filter(d => d.sig).length };
}

const pools = {
  easy: ['3','7','25','42','89','6.1','3.7','0.5','0.8','1.5','16','34','91','73','58','4.2','9.3','2.6','8.4','5.9','123','456','789','234','567','12','99','0.45','0.73','7.3','2.0','3.0','5.0','8.0','1.0','14','67','0.31','0.62','4.8','510','270','38','0.9','6.5','47','82','0.17','0.28','3.4'],
  medium: ['0.0034','0.0072','0.0091','0.00056','0.0018','0.0045','0.00083','0.0067','100.0','200.0','300.0','70.0','50.0','40.0','10.0','80.0','3.040','5.060','2.010','8.070','1.030','9.020','4.050','7.080','0.502','0.709','0.304','0.608','0.901','0.107','0.805','0.203','1200','3400','5600','2500','6800','7200','4100','9300','30.06','50.09','10.03','70.01','20.08','40.05','60.07','80.02','0.0780','0.0340','0.0560','0.0120','0.0910','0.0450','0.0670','0.0230','6500','8200','4700','1300','9100','3600','2800','5400','20.10','30.20','40.50','50.30','60.40','70.80','80.60','10.90'],
  hard: ['0.001020','0.003040','0.005060','0.002010','0.007080','0.009010','10.0040','20.0060','30.0020','50.0080','40.0010','60.0050','300600','502000','701000','103000','204000','805000','0.00008050','0.00003020','0.00006040','0.00001090','0.00005010','20010.0','30020.0','50040.0','10070.0','40060.0','0.0000340','0.0000560','0.0000120','0.0000890','0.0000710','104000','207000','308000','506000','901000','60.0200','30.0500','80.0100','20.0700','40.0300','0.003004','0.005007','0.001009','0.008002','0.006003','1000.00','2000.00','3000.00','5000.00','4000.00','0.00100200','0.00300400','0.00500600','0.00200100','0.00700800','5006000','2003000','8001000','3004000','7002000','0.0700800','0.0300400','0.0500200','0.0100600','0.0900100','0.0000010','0.0000030','0.0000050','0.0000020','0.0000070','400.010','600.020','800.050','200.030','900.040','30200','50400','70100','20300','80600','100200.0','200300.0','400500.0','300100.0','500200.0','7000.040','3000.020','5000.060','1000.080','9000.010'],
};
// 절차 생성기 — 유효숫자 규칙 모든 패턴 커버 (효과적으로 무한대)
function genNumberStr(d) {
  const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const dig = () => String(rnd(0, 9));
  const nz = () => String(rnd(1, 9));
  const tpls = {
    easy: ['intS','intM','decS','decS2','intTZ1','decT0','int2','int3','dec2','intMid2','decTwoZero','int4',
           'int5','dec3','dec4','intDec1','intDec2','dec01','dec02','intLong','decLong'],
    medium: ['intTZ','decLZ','decTZ','decMix','decMZ','intMid','decZmix','int3TZ',
             'intMidLong','decZ4','decZ5','intDecZ','intMidZeros','decZmid','intZmid','intZend','decFlex','intFlex','decTwoNZ','decThreeNZ'],
    hard: ['longDecLZ','longDecTZ','longIntTZ','longMix','deepLZ','decMultiZ','hugeInt','longDeep','complexMix',
           'mega','superDec','superInt','complexZ','deepMixed','wideRange','extreme1','extreme2','extreme3','extreme4'],
  };
  const list = tpls[d] || tpls.medium;
  const t = list[rnd(0, list.length - 1)];
  switch (t) {
    case 'intS':   return nz() + (Math.random()<0.5 ? '' : dig());
    case 'int2':   return nz() + dig();
    case 'int3':   return nz() + dig() + dig();
    case 'int4':   return nz() + dig() + dig() + dig();
    case 'dec2':   return nz() + dig() + '.' + dig();
    case 'intMid2':return nz() + '0' + dig();
    case 'decTwoZero': return '0.0' + nz();
    case 'intM':   return nz() + dig() + dig();
    case 'decS':   return nz() + '.' + dig();
    case 'decS2':  return '0.' + nz() + (Math.random()<0.5 ? '' : dig());
    case 'intTZ1': return nz() + '0';
    case 'decT0':  return nz() + '.0';
    case 'intTZ':  return nz() + dig() + '00';
    case 'int3TZ': return nz() + '00';
    case 'decLZ':  return '0.0' + nz() + (Math.random()<0.5 ? '' : dig());
    case 'decTZ':  return nz() + dig() + '.' + dig() + '0';
    case 'decMix': return nz() + '.0' + nz();
    case 'decMZ':  return nz() + dig() + '.0' + nz();
    case 'intMid': return nz() + '0' + nz();
    case 'decZmix':return nz() + '.' + nz() + '0' + nz();
    case 'longDecLZ': {
      const z = '0'.repeat(rnd(3, 5));
      return '0.' + z + nz() + dig() + (Math.random()<0.5 ? '' : dig());
    }
    case 'longDecTZ': return nz() + dig() + '.' + dig() + dig() + '00';
    case 'longIntTZ': {
      const len = rnd(5, 7);
      let s = nz();
      for (let i = 1; i < len - 1; i++) s += Math.random() < 0.5 ? '0' : dig();
      s += '0';
      return s;
    }
    case 'longMix': return nz() + '0' + nz() + '.0' + nz() + dig();
    case 'deepLZ': {
      const z = '0'.repeat(rnd(4, 6));
      return '0.' + z + nz() + dig();
    }
    case 'decMultiZ': return nz() + '.' + dig() + '0' + nz() + '0';
    case 'hugeInt': {
      const len = rnd(6, 8);
      let s = nz();
      for (let i = 1; i < len; i++) s += Math.random() < 0.4 ? '0' : dig();
      if (!s.endsWith('0')) s = s.slice(0, -1) + '0';
      return s;
    }
    case 'longDeep': return '0.00' + nz() + dig() + dig() + '0';
    case 'complexMix': return nz() + dig() + dig() + '.' + '0' + dig() + dig();
    // 추가 easy 템플릿
    case 'int5':   return nz() + dig() + dig() + dig() + dig();
    case 'dec3':   return nz() + dig() + '.' + dig() + dig();
    case 'dec4':   return nz() + dig() + dig() + '.' + dig();
    case 'intDec1':return nz() + '.' + dig() + dig();
    case 'intDec2':return nz() + dig() + '.' + dig() + dig() + dig();
    case 'dec01':  return '0.' + nz() + dig();
    case 'dec02':  return '0.' + nz() + dig() + dig();
    case 'intLong': return nz() + dig() + dig() + dig() + dig() + dig();
    case 'decLong': return nz() + dig() + dig() + '.' + dig() + dig() + dig();
    // 추가 medium 템플릿
    case 'intMidLong': return nz() + dig() + '0' + dig() + dig();
    case 'decZ4':  return '0.000' + nz() + dig();
    case 'decZ5':  return '0.0000' + nz() + dig();
    case 'intDecZ':return nz() + dig() + '.' + dig() + '00';
    case 'intMidZeros': return nz() + '00' + dig();
    case 'decZmid':return nz() + '.' + dig() + '00' + dig();
    case 'intZmid':return nz() + '0' + dig() + '0' + dig();
    case 'intZend':return nz() + dig() + dig() + '000';
    case 'decFlex':return nz() + dig() + '.' + dig() + dig() + dig() + '0';
    case 'intFlex':return nz() + dig() + dig() + '0' + dig() + '0';
    case 'decTwoNZ':  return nz() + '.' + nz() + dig() + nz();
    case 'decThreeNZ':return nz() + dig() + '.' + nz() + dig() + nz();
    // 추가 hard 템플릿
    case 'mega': {
      const len = rnd(7, 10);
      let s = nz(); for (let i = 1; i < len - 1; i++) s += Math.random() < 0.5 ? '0' : dig();
      s += '0'; return s;
    }
    case 'superDec': {
      const z = '0'.repeat(rnd(2, 4));
      return nz() + dig() + dig() + '.' + z + nz() + dig();
    }
    case 'superInt': {
      const len = rnd(8, 12);
      let s = nz(); for (let i = 1; i < len; i++) s += Math.random() < 0.45 ? '0' : dig();
      return s;
    }
    case 'complexZ': return nz() + '0' + dig() + '.' + '0' + nz() + '0' + dig();
    case 'deepMixed': {
      const z = '0'.repeat(rnd(3, 6));
      return '0.' + z + nz() + dig() + dig() + '0';
    }
    case 'wideRange': {
      const intL = rnd(4, 8); const decL = rnd(2, 5);
      let s = nz(); for (let i = 1; i < intL; i++) s += Math.random() < 0.5 ? '0' : dig();
      s += '.'; for (let i = 0; i < decL; i++) s += Math.random() < 0.4 ? '0' : dig();
      return s;
    }
    case 'extreme1': return nz() + dig() + dig() + dig() + '.' + dig() + '0' + dig();
    case 'extreme2': return '0.00' + nz() + '0' + dig() + nz();
    case 'extreme3': return nz() + '00' + dig() + dig() + '.' + dig() + '0';
    case 'extreme4': {
      const z = '0'.repeat(rnd(2, 5));
      return nz() + dig() + '.' + z + nz() + dig() + dig();
    }
  }
  return nz();
}
// ==================== 대용량 문제 풀 사전 생성 (10,000+ 보장) ====================
// 서버 시작 시 절차생성기로 풀을 확장한다. 중복 없이 난이도별 수천 개씩 채워서
// 한 수업 중 같은 숫자가 거의 나오지 않도록 한다.
function expandPool(d, target) {
  const set = new Set(pools[d] || []);
  let tries = 0;
  while (set.size < target && tries < target * 30) {
    set.add(genNumberStr(d));
    tries++;
  }
  pools[d] = Array.from(set);
}
// 100k+ 문제풀 — 학기 전체 사용해도 중복 거의 없음
expandPool('easy', 25000);
expandPool('medium', 35000);
expandPool('hard', 45000);
const _totalPool = pools.easy.length + pools.medium.length + pools.hard.length;
console.log(`[문제풀] 쉬움 ${pools.easy.length} · 보통 ${pools.medium.length} · 어려움 ${pools.hard.length} · 합계 ${_totalPool.toLocaleString()}개`);

function randNum(d) {
  if (d === 'mixed') d = ['easy','medium','hard'][Math.floor(Math.random()*3)];
  if (Math.random() < 0.7) {
    const p = pools[d]; return p[Math.floor(Math.random()*p.length)];
  }
  return genNumberStr(d);
}
const SUP = {'-':'⁻','0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹'};
function toSup(n) { return String(n).split('').map(c => SUP[c] || c).join(''); }
function genSciNum(d) {
  const rnd = (a,b) => Math.floor(Math.random()*(b-a+1))+a;
  const dig = () => String(rnd(0,9));
  const nz  = () => String(rnd(1,9));
  // 가수: 1.X ~ 9.XXXXX 형태. 유효숫자 2~5개
  const sfLen = rnd(2, 5);
  let mant = nz() + '.';
  for (let i = 1; i < sfLen; i++) mant += dig();
  // 끝이 0이 되어 모호해지지 않도록 최소 한 자리 보장
  // 지수: -6..6, 0 제외
  let exp; do { exp = rnd(-6, 6); } while (exp === 0);
  return { display: mant + '×10' + toSup(exp), sf: sfLen };
}
// ==================== 유효숫자 덧셈/뺄셈 (gameMode 4) ====================
// 규칙: 덧셈·뺄셈 결과는 소수점 이하 자리수가 가장 적은 항을 따른다.
//       과학적 표기법이면 같은 지수로 맞춘 뒤 같은 규칙을 적용한다.

function roundToDP(x, dp) {
  const f = Math.pow(10, dp);
  return Math.round(x * f) / f;
}
// 표기 정규화: "3.47x10^3", "3.47×10³", "3.47e3", "3.47E3" 모두 허용
const SUP2 = {'⁻':'-','⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9'};
function parseUserNum(str) {
  if (str === null || str === undefined) return null;
  let s = String(str).trim().replace(/\s/g, '');
  if (!s) return null;
  s = s.replace(/[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]/g, c => SUP2[c]);
  s = s.replace(/×/g, 'x').replace(/\*/g, 'x').replace(/X/g, 'x');
  // sci: MANT x 10 ^? EXP  or  MANT e EXP
  let m = s.match(/^(-?\d+(?:\.\d+)?)x10\^?(-?\d+)$/);
  if (!m) m = s.match(/^(-?\d+(?:\.\d+)?)e(-?\d+)$/i);
  if (m) {
    const mantStr = m[1], exp = parseInt(m[2]);
    const mant = parseFloat(mantStr);
    if (isNaN(mant) || isNaN(exp)) return null;
    const dotI = mantStr.indexOf('.');
    const mantDP = dotI < 0 ? 0 : mantStr.length - dotI - 1;
    return { value: mant * Math.pow(10, exp), form: 'sci', mantStr, mant, exp, mantDP };
  }
  // plain
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const v = parseFloat(s);
    const dotI = s.indexOf('.');
    const dp = dotI < 0 ? 0 : s.length - dotI - 1;
    return { value: v, form: 'plain', plainStr: s, dp };
  }
  return null;
}
// 무작위 정수(1~9 시작) + 랜덤 끝자리 + 지정 소수점 자리수
function genPlainOperand(intDigits, dp) {
  const rnd = (a,b)=>Math.floor(Math.random()*(b-a+1))+a;
  let s = String(rnd(1,9));
  for (let i = 1; i < intDigits; i++) s += String(rnd(0,9));
  if (dp > 0) {
    s += '.';
    for (let i = 0; i < dp; i++) s += String(rnd(0,9));
  }
  return s;
}
function genSciOperand(sfLen, exp) {
  const rnd = (a,b)=>Math.floor(Math.random()*(b-a+1))+a;
  let mant = String(rnd(1,9));
  if (sfLen > 1) { mant += '.'; for (let i = 1; i < sfLen; i++) mant += String(rnd(0,9)); }
  return { display: mant + '×10' + toSup(exp), mantStr: mant, exp, value: parseFloat(mant) * Math.pow(10, exp) };
}
function formatSci(value, mantDP, targetExp) {
  const mant = value / Math.pow(10, targetExp);
  const rounded = roundToDP(mant, mantDP);
  return rounded.toFixed(mantDP) + '×10' + toSup(targetExp);
}
// mode: 'mixed','plainOnly','sciOnly','sameDP','diffDP','sameExp','diffExp'
function genAddSubQ(d, mode) {
  const rnd = (a,b)=>Math.floor(Math.random()*(b-a+1))+a;
  const op = Math.random() < 0.5 ? '+' : '-';
  let kind = 'plain';
  if (mode === 'sciOnly' || mode === 'sameExp' || mode === 'diffExp') kind = 'sci';
  else if (mode === 'plainOnly' || mode === 'sameDP' || mode === 'diffDP') kind = 'plain';
  else kind = Math.random() < 0.5 ? 'plain' : 'sci';

  const intRange = d === 'easy' ? [1,2] : d === 'hard' ? [1,3] : [1,3];
  const dpRange  = d === 'easy' ? [0,2] : d === 'hard' ? [0,4] : [0,3];

  if (kind === 'plain') {
    let dpA, dpB;
    if (mode === 'sameDP') { dpA = dpB = rnd(dpRange[0]+1, dpRange[1]); }
    else if (mode === 'diffDP') {
      dpA = rnd(dpRange[0], dpRange[1]);
      do { dpB = rnd(dpRange[0], dpRange[1]); } while (dpB === dpA);
    } else { dpA = rnd(dpRange[0], dpRange[1]); dpB = rnd(dpRange[0], dpRange[1]); }
    let A = genPlainOperand(rnd(intRange[0], intRange[1]), dpA);
    let B = genPlainOperand(rnd(intRange[0], intRange[1]), dpB);
    let va = parseFloat(A), vb = parseFloat(B);
    if (op === '-' && va < vb) { const t=A; A=B; B=t; const tv=va; va=vb; vb=tv; const td=dpA; dpA=dpB; dpB=td; }
    const result = op === '+' ? va + vb : va - vb;
    const dpResult = Math.min(dpA, dpB);
    const rounded = roundToDP(result, dpResult);
    const answer = rounded.toFixed(dpResult);
    return {
      gameMode: 4, kind: 'plain',
      display: `${A} ${op} ${B}`,
      A, B, op, dpA, dpB, dpResult,
      answer, value: rounded,
    };
  } else {
    // sci
    const expRange = d === 'easy' ? [0,3] : d === 'hard' ? [-5,6] : [-3,4];
    const sfRange  = d === 'easy' ? [2,3] : d === 'hard' ? [3,5] : [2,4];
    const sfA = rnd(sfRange[0], sfRange[1]);
    const sfB = rnd(sfRange[0], sfRange[1]);
    const expA = rnd(expRange[0], expRange[1]);
    let expB;
    if (mode === 'sameExp') expB = expA;
    else if (mode === 'diffExp') { do { expB = rnd(expRange[0], expRange[1]); } while (expB === expA || Math.abs(expB - expA) > 3); }
    else { expB = rnd(expRange[0], expRange[1]); if (Math.abs(expB - expA) > 3) expB = expA + (expB>expA?1:-1); }
    let a = genSciOperand(sfA, expA);
    let b = genSciOperand(sfB, expB);
    let va = a.value, vb = b.value;
    if (op === '-' && va < vb) { const t=a; a=b; b=t; va = a.value; vb = b.value; }
    const result = op === '+' ? va + vb : va - vb;
    // 같은 지수(targetExp)로 정렬: 큰 쪽
    const targetExp = Math.max(a.exp, b.exp);
    // 각 항의 "targetExp에서의 소수점 자리수"
    const dpAtExp = (mantStr, origExp) => {
      const d = mantStr.indexOf('.') < 0 ? 0 : mantStr.length - mantStr.indexOf('.') - 1;
      return d + (targetExp - origExp);
    };
    const dpA2 = dpAtExp(a.mantStr, a.exp);
    const dpB2 = dpAtExp(b.mantStr, b.exp);
    const mantDP = Math.max(0, Math.min(dpA2, dpB2));
    const answer = formatSci(result, mantDP, targetExp);
    return {
      gameMode: 4, kind: 'sci',
      display: `${a.display} ${op} ${b.display}`,
      A: a.display, B: b.display, op,
      targetExp, mantDP,
      answer, value: result,
    };
  }
}


// ==================== 게임 모드 5 — 과학적 표기법 변환 ====================
// 일반 숫자 → 과학적 표기법 / 또는 그 반대.
// 정답: { mant, exp } 튜플. 가수 1<=|mant|<10, 유효숫자 보존.
function genSciConvertQ(d) {
  const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  // 두 방향 — 'toSci' (일반→과학) 또는 'toPlain' (과학→일반)
  const direction = Math.random() < 0.5 ? 'toSci' : 'toPlain';
  // 일반 숫자 생성 (모드 1과 비슷하지만 과학적 표기로 변환 가능한 패턴 위주)
  let plain;
  if (d === 'easy') {
    // 1500, 0.025, 480 등 — 유효숫자 2~3개
    const tpls = ['intTZ', 'decLZ', 'intMid', 'plain2'];
    const t = tpls[rnd(0, tpls.length - 1)];
    const nz = () => String(rnd(1, 9));
    if (t === 'intTZ') plain = nz() + nz() + '00';
    else if (t === 'decLZ') plain = '0.0' + nz() + nz();
    else if (t === 'intMid') plain = nz() + '0' + nz();
    else plain = nz() + '.' + nz();
  } else if (d === 'hard') {
    const nz = () => String(rnd(1, 9));
    const tpls = ['longTZ', 'deepLZ', 'mixDeep'];
    const t = tpls[rnd(0, tpls.length - 1)];
    if (t === 'longTZ') plain = nz() + String(rnd(0,9)) + String(rnd(0,9)) + '0000';
    else if (t === 'deepLZ') plain = '0.000' + nz() + String(rnd(0,9)) + String(rnd(0,9));
    else plain = nz() + '.' + String(rnd(0,9)) + '0' + nz() + '0';
  } else {
    plain = randNum('medium');
  }
  // 분석해서 mant/exp 산출 (10진 시프트)
  const a = analyze(plain);
  const sf = a.count;
  // mantStr 만들기 — 첫 유효숫자가 1자리, 나머지는 소수
  const nd = a.digs.filter(x => !x.pt);
  let firstSig = nd.findIndex(x => x.sig);
  if (firstSig < 0) firstSig = nd.findIndex(x => x.c !== '0');
  if (firstSig < 0) firstSig = 0;
  // 유효숫자만 추출
  const sigDigits = [];
  for (const x of nd) if (x.sig) sigDigits.push(x.c);
  if (sigDigits.length === 0) sigDigits.push(nd[nd.length - 1] ? nd[nd.length - 1].c : '0');
  let mantStr = sigDigits[0];
  if (sigDigits.length > 1) mantStr += '.' + sigDigits.slice(1).join('');
  const numVal = parseFloat(plain);
  const exp = numVal === 0 ? 0 : Math.floor(Math.log10(Math.abs(numVal)));
  return {
    gameMode: 5, direction, plain, mantStr, exp, sf,
    display: direction === 'toSci' ? plain : (mantStr + '×10' + toSup(exp)),
    // 정답 표시 — 반대 형태
    answer: direction === 'toSci' ? (mantStr + '×10' + toSup(exp)) : plain,
  };
}
function judgeSciConvert(q, ansStr) {
  const p = parseUserNum(ansStr);
  if (!p) return { ok: false, reason: '형식 오류' };
  const target = parseFloat(q.plain);
  const tol = Math.max(Math.abs(target) * 1e-3, 1e-12);
  if (Math.abs(p.value - target) > tol) return { ok: false, reason: '값이 맞지 않음' };
  if (q.direction === 'toSci') {
    if (p.form !== 'sci') return { ok: false, reason: '과학적 표기법으로 입력하세요' };
    // 가수가 1<=|m|<10 인지
    if (Math.abs(p.mant) < 1 || Math.abs(p.mant) >= 10) return { ok: false, reason: '가수는 1 이상 10 미만이어야 해요' };
    // 유효숫자 보존
    const givenSf = p.mantStr.replace(/[^0-9]/g, '').replace(/^0+/, '').length;
    if (givenSf !== q.sf) return { ok: false, reason: `유효숫자 ${q.sf}개여야 해요` };
  } else {
    if (p.form !== 'plain') return { ok: false, reason: '일반 표기로 입력하세요' };
    if (p.plainStr !== q.plain && parseFloat(p.plainStr) !== parseFloat(q.plain)) {
      // 표기 차이 허용 (선후 0)
    }
  }
  return { ok: true };
}

// ==================== 게임 모드 6 — 유효숫자 반올림 ====================
// 입력 숫자를 지정 유효숫자 개수로 반올림. 예: 5.367 → 3개로 = 5.37
function genRoundQ(d) {
  const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  // 적당히 긴 숫자 (유효숫자 4~7개)
  const nz = () => String(rnd(1, 9));
  const dg = () => String(rnd(0, 9));
  let s, intLen, dpLen;
  if (d === 'easy') { intLen = rnd(1, 2); dpLen = rnd(1, 2); }
  else if (d === 'hard') { intLen = rnd(1, 4); dpLen = rnd(2, 4); }
  else { intLen = rnd(1, 3); dpLen = rnd(2, 3); }
  s = nz();
  for (let i = 1; i < intLen; i++) s += dg();
  if (dpLen > 0) { s += '.'; for (let i = 0; i < dpLen; i++) s += dg(); }
  const a = analyze(s);
  const totalSf = a.count;
  // 목표 유효숫자: 1~totalSf-1
  const target = rnd(1, Math.max(1, totalSf - 1));
  // 정답 산출 — toPrecision은 충분, 단 trailing 0 처리
  const v = parseFloat(s);
  const rounded = parseFloat(v.toPrecision(target));
  // 표기: 큰 수 → 과학적, 작은 수 → 일반
  const exp = rounded === 0 ? 0 : Math.floor(Math.log10(Math.abs(rounded)));
  let answerStr;
  if (Math.abs(exp) >= 4) {
    const mant = rounded / Math.pow(10, exp);
    let mantStr = mant.toString();
    // 가수의 유효숫자가 target개 이도록 강제
    const need = target - 1;
    if (mantStr.indexOf('.') < 0 && need > 0) mantStr += '.' + '0'.repeat(need);
    else if (mantStr.indexOf('.') >= 0) {
      const dpCur = mantStr.length - mantStr.indexOf('.') - 1;
      if (dpCur < need) mantStr += '0'.repeat(need - dpCur);
    }
    answerStr = mantStr + '×10' + toSup(exp);
  } else {
    answerStr = rounded.toPrecision(target);
    // 0.00250 같은 trailing 0이 빠져나간 경우 보정
    if (answerStr.includes('e')) {
      const [m, e] = answerStr.split('e');
      answerStr = parseFloat(m).toFixed(Math.max(0, target - 1 - parseInt(e)));
    }
  }
  return { gameMode: 6, num: s, target, answer: answerStr, value: rounded };
}
function judgeRound(q, ansStr) {
  const p = parseUserNum(ansStr);
  if (!p) return { ok: false, reason: '형식 오류' };
  const tol = Math.max(Math.abs(q.value) * 5e-4, 1e-12);
  if (Math.abs(p.value - q.value) > tol) return { ok: false, reason: '값이 맞지 않음' };
  // 유효숫자 개수 검증
  const sigDigits = (p.form === 'sci' ? p.mantStr : p.plainStr).replace(/[^0-9]/g, '').replace(/^0+/, '');
  const givenSf = sigDigits.length || 1;
  if (givenSf !== q.target) return { ok: false, reason: `유효숫자 ${q.target}개여야 해요` };
  return { ok: true };
}

function judgeAddSub(q, ansStr) {
  const p = parseUserNum(ansStr);
  if (!p) return { ok: false, reason: '형식 오류' };
  // 수치 비교 (상대오차 또는 0에 가까운 절대오차)
  const expected = q.value;
  const tol = Math.max(Math.abs(expected) * 1e-3, Math.pow(10, -(q.kind==='plain'?q.dpResult:q.mantDP)) * 0.55);
  if (Math.abs(p.value - expected) > tol) return { ok: false, reason: '값이 맞지 않음' };
  // 자리수/유효숫자 규칙 체크
  if (q.kind === 'plain') {
    if (p.form !== 'plain') return { ok: false, reason: '일반 숫자로 입력하세요' };
    if (p.dp !== q.dpResult) return { ok: false, reason: `소수점 이하 ${q.dpResult}자리여야 해요` };
  } else {
    if (p.form !== 'sci') return { ok: false, reason: '과학적 표기법으로 입력하세요 (예: 3.4×10³)' };
    if (p.exp !== q.targetExp) return { ok: false, reason: `지수는 10^${q.targetExp}로 맞춰주세요` };
    if (p.mantDP !== q.mantDP) return { ok: false, reason: `가수의 소수점 이하 ${q.mantDP}자리여야 해요` };
  }
  return { ok: true };
}

function genMeas(d) {
  const t = ['ruler','cylinder','thermometer'][Math.floor(Math.random()*3)];
  let val, dv, unit;
  if (t === 'ruler') {
    // 쉬움: 정수 근처 정렬, 하드: 끝자리 1~9 강제(어림 필요)
    const b = d==='easy'?Math.random()*5+1:d==='hard'?Math.random()*12+1:Math.random()*8+1;
    val = Math.floor(b*100)/100;
    if (d === 'hard') {
      // 끝자리(소수 둘째자리)를 1~9로 강제 — 어림하지 않으면 못 맞춤
      const last = Math.floor(Math.random()*9)+1;
      val = Math.floor(val*10)/10 + last/100;
    }
    dv = val.toFixed(2); unit = 'cm';
  } else if (t === 'cylinder') {
    const b = d==='easy'?Math.random()*30+10:d==='hard'?Math.random()*80+5:Math.random()*50+10;
    val = Math.floor(b*10)/10;
    if (d === 'hard') {
      const last = Math.floor(Math.random()*9)+1;
      val = Math.floor(val) + last/10;
    }
    dv = val.toFixed(1); unit = 'mL';
  } else {
    const b = d==='easy'?Math.random()*30+15:d==='hard'?Math.random()*80-10:Math.random()*50+10;
    val = Math.floor(b*10)/10;
    if (d === 'hard') {
      const last = Math.floor(Math.random()*9)+1;
      val = Math.floor(val) + last/10;
    }
    dv = val.toFixed(1); unit = '°C';
  }
  return { type: t, val, dv, unit, sf: analyze(dv).count };
}
function makeQuestion(gm, diff, recent, addSubMode) {
  const d = diff === 'mixed' ? ['easy','medium','hard'][Math.floor(Math.random()*3)] : diff;
  if (gm === 5) {
    for (let tries = 0; tries < 20; tries++) {
      const q = genSciConvertQ(d);
      const key = q.direction + ':' + q.display;
      if (recent && recent.has(key)) continue;
      if (recent) recent.add(key);
      return q;
    }
    return genSciConvertQ(d);
  }
  if (gm === 6) {
    for (let tries = 0; tries < 20; tries++) {
      const q = genRoundQ(d);
      const key = q.num + ':' + q.target;
      if (recent && recent.has(key)) continue;
      if (recent) recent.add(key);
      return q;
    }
    return genRoundQ(d);
  }
  if (gm === 4) {
    for (let tries = 0; tries < 20; tries++) {
      const q = genAddSubQ(d, addSubMode || 'mixed');
      if (recent && recent.has(q.display)) continue;
      if (recent) recent.add(q.display);
      return q;
    }
    return genAddSubQ(d, addSubMode || 'mixed');
  }
  if (gm === 1 || gm === 2) {
    // 중복 회피 + 과학적 표기법(하드, 모드1만)
    for (let tries = 0; tries < 20; tries++) {
      // 하드 난이도 모드1: 25% 확률 과학적 표기법
      if (gm === 1 && d === 'hard' && Math.random() < 0.25) {
        const sci = genSciNum(d);
        if (recent && recent.has(sci.display)) continue;
        if (recent) recent.add(sci.display);
        return { gameMode: gm, num: sci.display, digs: [], count: sci.sf, scientific: true };
      }
      const ns = randNum(d);
      if (recent && recent.has(ns)) continue;
      if (recent) recent.add(ns);
      const a = analyze(ns);
      return { gameMode: gm, num: ns, digs: a.digs, count: a.count, scientific: false };
    }
    // 20회 시도 후에도 중복이면 그냥 하나 뽑아 반환
    const ns = randNum(d); const a = analyze(ns);
    return { gameMode: gm, num: ns, digs: a.digs, count: a.count, scientific: false };
  }
  // 측정값 — 중복 회피(수치·기구 조합 기준)
  for (let tries = 0; tries < 20; tries++) {
    const m = genMeas(d);
    const key = m.type + ':' + m.dv;
    if (recent && recent.has(key)) continue;
    if (recent) recent.add(key);
    return { gameMode: gm, meas: m };
  }
  return { gameMode: gm, meas: genMeas(d) };
}
function generateQuestions(gm, diff, n, addSubMode) {
  const qs = [];
  const recent = new Set();
  for (let i = 0; i < n; i++) qs.push(makeQuestion(gm, diff, recent, addSubMode));
  return qs;
}

function judge(q, answer) {
  if (q.gameMode === 1) return parseInt(answer && answer.count) === q.count;
  if (q.gameMode === 2) {
    const sel = new Set((answer && answer.selected) || []);
    for (let i = 0; i < q.digs.length; i++) {
      const d = q.digs[i]; if (d.pt) continue;
      if (d.sig !== sel.has(i)) return false;
    }
    return true;
  }
  if (q.gameMode === 4) {
    const r = judgeAddSub(q, answer && answer.result);
    return r.ok;
  }
  if (q.gameMode === 5) {
    const r = judgeSciConvert(q, answer && answer.result);
    return r.ok;
  }
  if (q.gameMode === 6) {
    const r = judgeRound(q, answer && answer.result);
    return r.ok;
  }
  const tol = q.meas.type === 'ruler' ? 0.03 : 0.2;
  const mv = parseFloat(answer && answer.meas);
  const sv = parseInt(answer && answer.sf);
  return !isNaN(mv) && Math.abs(mv - q.meas.val) <= tol && sv === q.meas.sf;
}
function viewQuestion(q, hide) {
  if (!q) return null;
  if (q.gameMode === 1) return { gameMode: 1, num: q.num, scientific: !!q.scientific, count: hide ? undefined : q.count };
  if (q.gameMode === 2) {
    if (hide) return { gameMode: 2, num: q.num, digs: q.digs.map(d => ({ c: d.c, pt: d.pt })) };
    return { gameMode: 2, num: q.num, digs: q.digs, count: q.count };
  }
  if (q.gameMode === 4) {
    if (hide) return { gameMode: 4, display: q.display, kind: q.kind, op: q.op };
    return { gameMode: 4, display: q.display, kind: q.kind, op: q.op, answer: q.answer, dpResult: q.dpResult, mantDP: q.mantDP, targetExp: q.targetExp };
  }
  if (q.gameMode === 5) {
    if (hide) return { gameMode: 5, direction: q.direction, display: q.display };
    return { gameMode: 5, direction: q.direction, display: q.display, plain: q.plain, mantStr: q.mantStr, exp: q.exp, sf: q.sf, answer: q.answer };
  }
  if (q.gameMode === 6) {
    if (hide) return { gameMode: 6, num: q.num, target: q.target };
    return { gameMode: 6, num: q.num, target: q.target, answer: q.answer };
  }
  return { gameMode: 3, meas: q.meas };
}

function pushLB(classroomCode, type, entry) {
  const list = leaderboards[type] || (leaderboards[type] = []);
  list.push({ ...entry, classroomCode, at: Date.now() });
  list.sort((a, b) => b.score - a.score);
  // 글로벌 점수판 — 상위 500건까지 유지
  if (list.length > 500) list.length = 500;
  saveLB();
}

// ==================== CSV 유틸 ====================
function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes('"') || s.includes(',') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function toCsv(headers, rows) {
  const lines = [headers.map(csvEscape).join(',')];
  for (const r of rows) lines.push(headers.map(h => csvEscape(r[h])).join(','));
  return '\uFEFF' + lines.join('\r\n'); // BOM → 엑셀 한글 호환
}
function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// ==================== Google Sheets 동기화 ====================
// 교사가 Apps Script 웹앱을 배포하고 URL을 cfg.sheetsUrl에 저장하면,
// 서버가 해당 URL로 JSON 이벤트를 POST한다. (npm 의존성 0 — Node 내장 https만 사용)
const https = require('https');
function httpsPost(targetUrl, payload) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(targetUrl);
      const data = Buffer.from(JSON.stringify(payload), 'utf8');
      const req = https.request({
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': data.length },
      }, r => {
        let chunks = [];
        r.on('data', c => chunks.push(c));
        r.on('end', () => resolve({ status: r.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('error', reject);
      req.write(data); req.end();
    } catch (e) { reject(e); }
  });
}
function maybePushSheets(classroomCode, event, payload) {
  const c = classrooms[classroomCode];
  const url = c?.config?.sheetsUrl;
  if (!url) return;
  httpsPost(url, { event, classroomCode, payload, at: Date.now() }).catch(e => {
    console.error('[sheets] push failed:', e.message);
  });
}

// ==================== 유틸 ====================
function genCode() {
  let c; do { c = String(Math.floor(100000 + Math.random()*900000)); } while (rooms.has(c));
  return c;
}
const tok = () => crypto.randomBytes(16).toString('hex');
const pid = () => crypto.randomBytes(5).toString('hex');

function sendJSON(res, obj, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function getAuth(req) {
  const h = req.headers['authorization'] || '';
  return h.replace(/^Bearer\s+/i, '');
}
function authStudent(req) {
  const t = getAuth(req);
  if (!t) return null;
  const info = studentTokens.get(t);
  if (!info) return null;
  const s = students.get(studentSessKey(info.classroomCode, info.studentId));
  if (s) s.lastSeen = Date.now();
  return s || null;
}
function authTeacher(req) {
  const t = getAuth(req);
  if (!t) return null;
  return teacherTokens.get(t) || null;  // 교실 코드 반환 (없으면 null)
}
// 교사가 맞는 교실에만 작업하는지 확인 — 토큰에서 교실 코드 반환, 없으면 false 반환
function teacherClassroom(req) { return authTeacher(req); }

// ==================== 방 로직 ====================
function createRoom(classroomCode, type, config, owner, autoApprove = false) {
  const code = genCode();
  const capMap = { single: 1, multi: 35, battle: 10 };
  const minMap = { single: 1, multi: 2, battle: 2 };
  const defCap = { single: 1, multi: 10, battle: 4 };
  const capacity = Math.max(minMap[type] || 1, Math.min(capMap[type] || 6, parseInt(config.capacity) || defCap[type] || 6));
  const hpAllowed = [1,2,3,5,8,10];
  const timedAllowed = [30,60,120,180,300,600];
  const room = {
    code, type,
    classroomCode,             // 이 방이 속한 교실
    approved: autoApprove,     // 교사가 승인해야 시작 가능
    phase: 'lobby',
    config: {
      gameMode: [1,2,3,4,5,6].includes(parseInt(config.gameMode)) ? parseInt(config.gameMode) : 1,
      difficulty: ['easy','medium','hard','mixed'].includes(config.difficulty) ? config.difficulty : 'medium',
      questionCount: Math.min(100, Math.max(1, parseInt(config.questionCount) || 10)),
      questionTime: Math.min(300, Math.max(5, parseInt(config.questionTime) || 30)),
      revealTime: Math.min(30, Math.max(1, parseInt(config.revealTime) || 3)),
      // 싱글 모드: 'count' (문제 수 기반, 빨리 끝내기) or 'timed' (시간 제한, 많이 맞히기)
      singleMode: ['count','timed'].includes(config.singleMode) ? config.singleMode : 'count',
      timeLimit: timedAllowed.includes(parseInt(config.timeLimit)) ? parseInt(config.timeLimit) : 60,
      // 멀티: class (학급 전체) / team (조별 협동) / individual (개인별)
      multiMode: ['class','team','individual'].includes(config.multiMode) ? config.multiMode : 'class',
      teamCount: Math.min(10, Math.max(2, parseInt(config.teamCount) || 2)),
      // 대전: survival (HP) / speed (속도전)
      battleMode: ['survival','speed'].includes(config.battleMode) ? config.battleMode : 'survival',
      hpStart: hpAllowed.includes(parseInt(config.hpStart)) ? parseInt(config.hpStart) : 3,
      // gameMode 4 하위 모드
      addSubMode: ['mixed','plainOnly','sciOnly','sameDP','diffDP','sameExp','diffExp'].includes(config.addSubMode) ? config.addSubMode : 'mixed',
      capacity,
      label: String(config.label || '').slice(0, 30),
    },
    ownerId: owner ? owner.studentId : null,
    players: {},
    questions: [],
    qIndex: -1,
    currentQStart: 0,
    phaseTimer: null,
    timedStartAt: 0,
    timedEndAt: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    submittedToLB: false,
    achievementsEarned: {},  // studentId → [badge]
  };
  rooms.set(code, room);
  return room;
}
function resetPlayersForRound(room) {
  const useHP = room.type === 'battle' && room.config.battleMode === 'survival';
  const startHP = useHP ? (room.config.hpStart || 3) : 0;
  const ps = Object.values(room.players);
  // 조별 팀 배정 (multi team 모드)
  if (room.type === 'multi' && room.config.multiMode === 'team') {
    const nTeams = room.config.teamCount || 2;
    // 셔플 후 라운드로빈
    const shuffled = ps.slice().sort(() => Math.random() - 0.5);
    shuffled.forEach((p, i) => { p.team = i % nTeams; });
  } else {
    ps.forEach(p => { p.team = 0; });
  }
  ps.forEach(p => {
    p.score = 0; p.streak = 0; p.maxStreak = 0;
    p.correct = 0; p.wrong = 0;
    p.answered = false; p.lastAnswer = null;
    p.hp = startHP; p.eliminated = false;
    p.wrongHistory = [];  // 오답 노트용
    p.badges = [];
    // 멀티 모드 — 플레이어별 문제 스트림 초기화
    if (room.type === 'multi') {
      p.pQuestions = generateQuestions(room.config.gameMode, room.config.difficulty, room.config.questionCount, room.config.addSubMode);
      p.pIdx = 0;
      p.pPhase = 'question';
      p.pStart = Date.now();
      p.pRevealAt = 0;
      p.pLastAnswer = null;
    }
  });
  // 멀티 학급 통계
  room.classCombo = 0; room.maxClassCombo = 0;
  room.classCorrect = 0; room.classTotal = 0;
}
function playerView(p, reveal) {
  return {
    id: p.id, studentId: p.studentId, name: p.name,
    score: p.score, answered: p.answered,
    streak: p.streak, maxStreak: p.maxStreak,
    correct: p.correct, wrong: p.wrong,
    hp: p.hp || 0, eliminated: !!p.eliminated,
    team: p.team || 0,
    badges: p.badges || [],
    lastAnswer: reveal ? p.lastAnswer : null,
    isOwner: false, // set below
  };
}
function roomView(room, forTeacher, viewerStudentId) {
  const players = Object.values(room.players).map(p => {
    const v = playerView(p, room.phase !== 'question' || forTeacher);
    v.isOwner = p.studentId === room.ownerId;
    // 멀티: 각 플레이어의 개인 진행 상태 노출 (관전 보드용)
    if (room.type === 'multi') {
      v.pIdx = p.pIdx || 0;
      v.pPhase = p.pPhase || 'question';
    }
    return v;
  });
  const view = {
    code: room.code, type: room.type, phase: room.phase,
    approved: room.approved,
    config: room.config, ownerId: room.ownerId,
    qIndex: room.qIndex, total: room.questions.length,
    currentQStart: room.currentQStart,
    serverNow: Date.now(),
    players,
  };
  // 멀티 — 요청자(학생)의 개인 문제/진행상태로 덮어쓴다
  if (room.type === 'multi' && viewerStudentId && room.phase === 'question') {
    const me = Object.values(room.players).find(p => p.studentId === viewerStudentId);
    if (me && me.pQuestions) {
      view.qIndex = me.pIdx || 0;
      view.total = room.config.questionCount;
      view.currentQStart = me.pStart || room.currentQStart;
      // 내 개인 페이즈로 덮어쓰기 — reveal/question/done
      view.phase = me.pPhase === 'done' ? 'waiting' : me.pPhase;
      const myQ = me.pQuestions[me.pIdx];
      if (myQ && view.phase === 'question') view.question = viewQuestion(myQ, true);
      if (myQ && view.phase === 'reveal') { view.question = viewQuestion(myQ, false); view.myLastAnswer = me.pLastAnswer; }
      view.revealEndsAt = me.pRevealAt || 0;
    }
  }
  if (room.type === 'multi') {
    view.classStats = {
      correct: room.classCorrect || 0,
      total: room.classTotal || 0,
      combo: room.classCombo || 0,
      maxCombo: room.maxClassCombo || 0,
    };
    // 조별 총점 집계
    if (room.config.multiMode === 'team') {
      const teams = {};
      for (let i = 0; i < room.config.teamCount; i++) teams[i] = { team: i, score: 0, correct: 0, total: 0, members: [] };
      Object.values(room.players).forEach(p => {
        const t = teams[p.team] || teams[0];
        t.score += p.score;
        t.correct += p.correct;
        t.total += p.correct + p.wrong;
        t.members.push({ name: p.name, studentId: p.studentId, score: p.score });
      });
      view.teamStats = Object.values(teams).sort((a,b) => b.score - a.score);
    }
  }
  if (room.config.singleMode === 'timed' && room.timedEndAt) {
    view.timedRemaining = Math.max(0, Math.ceil((room.timedEndAt - Date.now()) / 1000));
    view.timedTotal = room.config.timeLimit;
  }
  // 멀티는 위에서 각자 질문을 세팅했으므로 덮어쓰지 않는다
  if ((room.phase === 'question' || room.phase === 'reveal') && room.type !== 'multi') {
    view.question = viewQuestion(room.questions[room.qIndex], room.phase === 'question' && !forTeacher);
  }
  return view;
}

function joinRoom(room, student) {
  // 재입장 체크
  const existing = Object.values(room.players).find(p => p.studentId === student.studentId);
  if (existing) { existing.name = student.name; student.currentRoom = room.code; return existing; }
  if (Object.keys(room.players).length >= room.config.capacity) {
    throw new Error('방이 가득 찼습니다');
  }
  if (room.phase !== 'lobby' && room.type !== 'single') {
    throw new Error('이미 게임이 시작된 방입니다');
  }
  const id = pid();
  const useHP = room.type === 'battle' && room.config.battleMode === 'survival';
  const p = {
    id, studentId: student.studentId, name: student.name,
    score: 0, streak: 0, maxStreak: 0, correct: 0, wrong: 0,
    hp: useHP ? (room.config.hpStart || 3) : 0, eliminated: false,
    team: 0, wrongHistory: [], badges: [],
    answered: false, lastAnswer: null, joinedAt: Date.now(),
  };
  room.players[id] = p;
  if (!room.ownerId) room.ownerId = student.studentId;
  student.currentRoom = room.code;
  room.updatedAt = Date.now();
  return p;
}
function leaveRoom(room, student) {
  const p = Object.values(room.players).find(pp => pp.studentId === student.studentId);
  if (!p) return;
  delete room.players[p.id];
  if (student.currentRoom === room.code) student.currentRoom = null;
  // 방장 위임 or 방 삭제
  if (room.ownerId === student.studentId) {
    const rest = Object.values(room.players);
    room.ownerId = rest.length ? rest[0].studentId : null;
  }
  if (Object.keys(room.players).length === 0) {
    if (room.phaseTimer) clearTimeout(room.phaseTimer);
    if (room.multiTick) { clearInterval(room.multiTick); room.multiTick = null; }
    rooms.delete(room.code);
  }
  room.updatedAt = Date.now();
}

// ==================== 자동 진행 ====================
function startRoom(room) {
  const isTimed = room.type === 'single' && room.config.singleMode === 'timed';
  // 시간제한 모드: 예상 문제 수를 넉넉히 생성 (추가 필요 시 확장)
  const qc = isTimed ? Math.max(300, Math.ceil(room.config.timeLimit / 3)) : room.config.questionCount;
  room.questions = generateQuestions(room.config.gameMode, room.config.difficulty, qc, room.config.addSubMode);
  room.qIndex = 0;
  room.phase = 'question';
  room.currentQStart = Date.now();
  room.submittedToLB = false;
  if (isTimed) {
    room.timedStartAt = Date.now();
    room.timedEndAt = Date.now() + room.config.timeLimit * 1000;
  }
  resetPlayersForRound(room);
  if (room.type === 'multi') {
    // 멀티는 플레이어별로 진행 — 공용 타이머 대신 멀티틱을 돌린다
    if (room.multiTick) clearInterval(room.multiTick);
    room.multiTick = setInterval(() => multiTickRoom(room), 250);
  } else {
    scheduleQuestionEnd(room);
  }
}

// 멀티 모드 — 플레이어별 상태 머신 (question → reveal → next question | done)
function multiTickRoom(room) {
  if (room.phase !== 'question') { if (room.multiTick) { clearInterval(room.multiTick); room.multiTick = null; } return; }
  const ps = Object.values(room.players);
  if (ps.length === 0) { if (room.multiTick) { clearInterval(room.multiTick); room.multiTick = null; } return; }
  const now = Date.now();
  const qTimeMs = room.config.questionTime * 1000;
  const rTimeMs = room.config.revealTime * 1000;
  const qc = room.config.questionCount;
  ps.forEach(p => {
    if (p.pPhase === 'done') return;
    if (p.pPhase === 'question') {
      // 시간 초과 → 오답 처리 → reveal
      if (now - (p.pStart || now) >= qTimeMs) {
        const q = p.pQuestions[p.pIdx];
        p.wrong++; p.streak = 0;
        p.wrongHistory = p.wrongHistory || [];
        p.wrongHistory.push({ qIndex: p.pIdx, q: viewQuestion(q, false), submitted: null, timeout: true });
        p.pLastAnswer = { ok: false, elapsed: room.config.questionTime, points: 0, timeout: true, submitted: null };
        p.answered = true;
        p.pPhase = 'reveal';
        p.pRevealAt = now + rTimeMs;
        // 학급 통계 (누적 정확도) — 문항이 한 개 더 소화됨
        room.classTotal = (room.classTotal || 0) + 1;
      }
    } else if (p.pPhase === 'reveal') {
      if (now >= (p.pRevealAt || 0)) {
        p.pIdx += 1;
        if (p.pIdx >= qc) {
          p.pPhase = 'done';
        } else {
          p.pPhase = 'question';
          p.pStart = now;
          p.answered = false;
          p.pLastAnswer = null;
        }
      }
    }
  });
  // 모두 완료 → 결과로 이동
  if (ps.every(p => p.pPhase === 'done')) {
    if (room.multiTick) { clearInterval(room.multiTick); room.multiTick = null; }
    room.phase = 'results';
    finalizeRoom(room);
  }
}
function scheduleQuestionEnd(room) {
  if (room.phaseTimer) clearTimeout(room.phaseTimer);
  room.phaseTimer = setTimeout(() => revealAnswer(room), room.config.questionTime * 1000);
}
function revealAnswer(room) {
  if (room.phase !== 'question') return;
  // 시간 초과 처리
  const active = Object.values(room.players).filter(p => !p.eliminated);
  const useHP = room.type === 'battle' && room.config.battleMode === 'survival';
  if (useHP) {
    active.forEach(p => {
      if (!p.answered) {
        p.hp = Math.max(0, p.hp - 1);
        if (p.hp === 0) p.eliminated = true;
        p.streak = 0; p.wrong++;
        const q = room.questions[room.qIndex];
        p.wrongHistory = p.wrongHistory || [];
        p.wrongHistory.push({ qIndex: room.qIndex, q: viewQuestion(q, false), submitted: null, timeout: true });
        p.lastAnswer = { ok: false, elapsed: room.config.questionTime, points: 0, timeout: true, submitted: null };
      }
    });
  } else {
    active.forEach(p => {
      if (!p.answered) {
        p.streak = 0; p.wrong++;
        const q = room.questions[room.qIndex];
        p.wrongHistory = p.wrongHistory || [];
        p.wrongHistory.push({ qIndex: room.qIndex, q: viewQuestion(q, false), submitted: null, timeout: true });
        p.lastAnswer = { ok: false, elapsed: room.config.questionTime, points: 0, timeout: true, submitted: null };
      }
    });
  }
  // 멀티 학급 통계 업데이트
  if (room.type === 'multi') {
    const ps = Object.values(room.players);
    room.classTotal = (room.classTotal || 0) + ps.length;
    const nCorrect = ps.filter(p => p.lastAnswer?.ok).length;
    room.classCorrect = (room.classCorrect || 0) + nCorrect;
    if (ps.length > 0 && nCorrect === ps.length) {
      room.classCombo = (room.classCombo || 0) + 1;
      if (room.classCombo > (room.maxClassCombo || 0)) room.maxClassCombo = room.classCombo;
      // 전원 정답 보너스 — 모두에게 +50
      ps.forEach(p => { p.score += 50; if (p.lastAnswer) p.lastAnswer.classBonus = 50; });
    } else {
      room.classCombo = 0;
    }
  }
  room.phase = 'reveal';
  if (room.phaseTimer) clearTimeout(room.phaseTimer);
  // 배틀(서바이벌)에서 1명만 남으면 즉시 결과
  if (useHP) {
    const stillAlive = Object.values(room.players).filter(p => !p.eliminated);
    if (stillAlive.length <= 1 && Object.values(room.players).length >= 2) {
      room.phaseTimer = setTimeout(() => {
        room.phase = 'results';
        finalizeRoom(room);
      }, room.config.revealTime * 1000);
      return;
    }
  }
  // 싱글 시간제한 모드: 리빌 시간에 남은 시간 체크
  const isTimed = room.type === 'single' && room.config.singleMode === 'timed';
  if (isTimed && Date.now() >= room.timedEndAt - 500) {
    room.phaseTimer = setTimeout(() => {
      room.phase = 'results';
      finalizeRoom(room);
    }, Math.max(500, Math.min(2000, room.config.revealTime * 1000)));
    return;
  }
  room.phaseTimer = setTimeout(() => nextQuestion(room), room.config.revealTime * 1000);
}
function nextQuestion(room) {
  if (room.phase !== 'reveal') return;
  const isTimed = room.type === 'single' && room.config.singleMode === 'timed';
  // 시간제한 모드: 시간 만료 확인
  if (isTimed && Date.now() >= room.timedEndAt) {
    room.phase = 'results';
    finalizeRoom(room);
    return;
  }
  if (room.qIndex + 1 >= room.questions.length) {
    if (isTimed) {
      // 문제 풀 확장
      const more = generateQuestions(room.config.gameMode, room.config.difficulty, 200, room.config.addSubMode);
      room.questions = room.questions.concat(more);
    } else {
      room.phase = 'results';
      finalizeRoom(room);
      return;
    }
  }
  room.qIndex++;
  room.phase = 'question';
  room.currentQStart = Date.now();
  Object.values(room.players).forEach(p => { p.answered = false; p.lastAnswer = null; });
  scheduleQuestionEnd(room);
}
function finalizeRoom(room) {
  if (room.submittedToLB) return;
  room.submittedToLB = true;
  if (room.phaseTimer) clearTimeout(room.phaseTimer);
  if (room.multiTick) { clearInterval(room.multiTick); room.multiTick = null; }
  const type = room.type;
  const cCode = room.classroomCode;
  const players = Object.values(room.players);
  const perPlayerTotal = (p) => type === 'multi' ? (p.correct + p.wrong) : room.questions.length;
  if (type === 'single') {
    players.forEach(p => pushLB(cCode, 'single', {
      studentId: p.studentId, name: p.name, score: p.score,
      correct: p.correct, total: room.questions.length, maxStreak: p.maxStreak,
      gameMode: room.config.gameMode, difficulty: room.config.difficulty,
    }));
  } else if (type === 'multi') {
    players.forEach(p => pushLB(cCode, 'multi', {
      studentId: p.studentId, name: p.name, score: p.score,
      correct: p.correct, total: perPlayerTotal(p), maxStreak: p.maxStreak,
      gameMode: room.config.gameMode, difficulty: room.config.difficulty,
      roomLabel: room.config.label, playerCount: players.length,
    }));
  } else {
    const winner = players.slice().sort((a,b) => b.score - a.score)[0];
    players.forEach(p => pushLB(cCode, 'battle', {
      studentId: p.studentId, name: p.name, score: p.score,
      correct: p.correct, total: room.questions.length, maxStreak: p.maxStreak,
      gameMode: room.config.gameMode, difficulty: room.config.difficulty,
      result: p.id === winner.id ? 'win' : 'lose',
      playerCount: players.length,
    }));
  }
  // 학생 누적 통계 업데이트 (대전은 승패 포함) — 교실 범위
  if (type === 'battle') {
    const winnerId = players.slice().sort((a,b) => b.score - a.score)[0]?.id;
    players.forEach(p => accumulateStats(cCode, p.studentId, p, 'battle', p.id === winnerId ? 'win' : 'lose'));
  } else {
    players.forEach(p => accumulateStats(cCode, p.studentId, p, type));
  }
  // 학생별 오답노트 누적 (교실 단위) — 학생별 최근 100개
  for (const p of players) {
    const wh = p.wrongHistory || [];
    if (wh.length === 0) continue;
    const w = clsWrongs(cCode);
    if (!w[p.studentId]) w[p.studentId] = [];
    const stamp = Date.now();
    for (const item of wh) {
      w[p.studentId].push({
        at: stamp,
        gameMode: room.config.gameMode,
        difficulty: room.config.difficulty,
        roomType: room.type,
        q: item.q,
        submitted: item.submitted,
        timeout: !!item.timeout,
      });
    }
    if (w[p.studentId].length > 100) w[p.studentId] = w[p.studentId].slice(-100);
  }
  saveWrongs();
  // 구글 시트 동기화 (교실별 설정 있을 때)
  maybePushSheets(cCode, 'game', { type, classroomCode: cCode, players: players.map(p => ({
    studentId: p.studentId, name: p.name, score: p.score, correct: p.correct, total: room.questions.length,
    gameMode: room.config.gameMode, difficulty: room.config.difficulty,
    result: type === 'battle' ? (p.id === Object.values(room.players).sort((a,b)=>b.score-a.score)[0]?.id ? 'win' : 'lose') : null,
  })), roomLabel: room.config.label, at: Date.now() });
}

// 모두 답변 시 즉시 reveal
function checkAllAnswered(room) {
  if (room.phase !== 'question') return;
  const active = Object.values(room.players).filter(p => !p.eliminated);
  if (active.length === 0) return;
  if (active.every(p => p.answered)) {
    setTimeout(() => revealAnswer(room), 300);
  }
}

// ==================== API ====================
async function handleApi(req, res, pathname, query) {
  const method = req.method;

  // ---------- 교실 공개 정보 ----------
  if (method === 'GET' && pathname === '/api/classrooms') {
    // 학생이 교실 선택 시 사용 — 이름/코드만 공개 (비밀번호 X)
    const list = Object.values(classrooms).map(c => ({ code: c.code, name: c.name || c.code }));
    return sendJSON(res, { classrooms: list });
  }
  // ---------- 학생 로그인 ----------
  if (method === 'POST' && pathname === '/api/student/login') {
    const body = await readBody(req);
    const classroomCode = normCode(body.classroomCode || body.classCode);
    const studentId = String(body.studentId || '').trim().slice(0, 10);
    const name = String(body.name || '').trim().slice(0, 12);
    if (!classroomCode) return sendJSON(res, { error: '교실 코드가 필요해요. 선생님께 문의하세요.' }, 400);
    if (!clsroom(classroomCode)) return sendJSON(res, { error: '존재하지 않는 교실 코드예요.' }, 404);
    if (!studentId || !name) return sendJSON(res, { error: '학번과 이름을 입력하세요.' }, 400);
    if (!/^[0-9A-Za-z]+$/.test(studentId)) return sendJSON(res, { error: '학번은 숫자/영문만 가능' }, 400);
    if (hasBadWord(name)) return sendJSON(res, { error: '닉네임에 부적절한 단어가 포함되어 있어요.' }, 400);
    // Rate limit (학번+IP 기준)
    const ipKeyS = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString().split(',')[0].trim();
    if (!rateLimitOK('login:' + ipKeyS + ':' + studentId, 20, 60_000)) return sendJSON(res, { error: '잠시 후 다시 시도하세요' }, 429);
    // 차단 확인 (교실별)
    const sdb = clsStudents(classroomCode);
    const rec = sdb[studentId];
    if (rec && rec.blocked) return sendJSON(res, { error: '차단된 학생입니다. 교사에게 문의하세요.' }, 403);
    // 기존 세션이 있으면 토큰 갱신 (다중 탭 방지)
    const sKey = studentSessKey(classroomCode, studentId);
    let sess = students.get(sKey);
    if (sess && sess.token) { studentTokens.delete(sess.token); delete persistedTokens.student[sess.token]; }
    const token = tok();
    sess = { classroomCode, studentId, name, token, lastSeen: Date.now(), currentRoom: sess?.currentRoom || null };
    students.set(sKey, sess);
    studentTokens.set(token, { classroomCode, studentId });
    persistedTokens.student[token] = { classroomCode, studentId, expiresAt: Date.now() + STUDENT_TOKEN_TTL_MS };
    saveTokens();
    // 영구 DB + 출결 기록
    const wasNew = !sdb[studentId];
    registerOrTouchStudent(classroomCode, studentId, name);
    if (wasNew) maybePushSheets(classroomCode, 'student_register', { studentId, name, at: Date.now() });
    maybePushSheets(classroomCode, 'attendance', { studentId, name, date: todayKey(), at: Date.now() });
    return sendJSON(res, { token, classroomCode, studentId, name });
  }
  if (method === 'POST' && pathname === '/api/student/logout') {
    const s = authStudent(req);
    if (s) {
      studentTokens.delete(s.token);
      delete persistedTokens.student[s.token]; saveTokens();
      // 방에서 나가기
      if (s.currentRoom) {
        const r = rooms.get(s.currentRoom);
        if (r) leaveRoom(r, s);
      }
      students.delete(studentSessKey(s.classroomCode, s.studentId));
    }
    return sendJSON(res, { ok: true });
  }
  if (method === 'GET' && pathname === '/api/me') {
    const s = authStudent(req);
    if (!s) return sendJSON(res, { error: '로그인 필요' }, 401);
    return sendJSON(res, { classroomCode: s.classroomCode, studentId: s.studentId, name: s.name, currentRoom: s.currentRoom });
  }
  // 본인 또는 임의 학생의 누적 전적 조회 (공개 — 학번으로 조회 가능, 단 교실 범위 내)
  if (method === 'GET' && pathname === '/api/student/stats') {
    const sid = query.studentId;
    // 교실 코드 — 로그인된 학생이면 그의 교실, 아니면 쿼리에서 받음
    const sess = authStudent(req);
    const code = sess ? sess.classroomCode : normCode(query.classroomCode);
    if (!sid) return sendJSON(res, { error: 'studentId 필요' }, 400);
    if (!code || !clsroom(code)) return sendJSON(res, { error: '교실 코드 필요' }, 400);
    const sdb = clsStudents(code);
    const rec = sdb[sid];
    if (!rec) return sendJSON(res, { error: '존재하지 않는 학생' }, 404);
    const s = ensureStatsShape(rec.stats);
    // 글로벌 점수판에서 본인 기록 — 같은 교실 것만
    const allRecent = [];
    for (const t of ['single','multi','battle']) {
      for (const e of (leaderboards[t] || [])) {
        if (e.studentId === sid && (e.classroomCode || DEFAULT_CLASSROOM) === code) allRecent.push({ ...e, _type: t });
      }
    }
    allRecent.sort((a,b) => (b.at||0) - (a.at||0));
    const winRate = s.battleGames > 0 ? Math.round(s.battleWins / s.battleGames * 100) : 0;
    const accuracy = (s.totalCorrect + s.totalWrong) > 0 ? Math.round(s.totalCorrect / (s.totalCorrect + s.totalWrong) * 100) : 0;
    return sendJSON(res, {
      studentId: rec.studentId, name: rec.name, joinedAt: rec.joinedAt,
      stats: s, winRate, accuracy,
      recent: allRecent.slice(0, 10),
    });
  }

  // ---------- 방 목록 (교실 내에서만) ----------
  if (method === 'GET' && pathname === '/api/rooms') {
    // 요청자의 교실: 학생 세션이면 그 교실, 교사면 교사 교실, 아니면 query.classroomCode (공개 탐색용)
    const sess = authStudent(req);
    const teacherCls = teacherClassroom(req);
    const scope = sess ? sess.classroomCode : (teacherCls || normCode(query.classroomCode));
    const list = [...rooms.values()]
      .filter(r => !scope || r.classroomCode === scope)
      .map(r => ({
        code: r.code, type: r.type, phase: r.phase,
        approved: r.approved,
        label: r.config.label, gameMode: r.config.gameMode,
        difficulty: r.config.difficulty, questionCount: r.config.questionCount,
        capacity: r.config.capacity,
        playerCount: Object.keys(r.players).length,
        ownerName: (Object.values(r.players).find(p => p.studentId === r.ownerId) || {}).name || '',
        classroomCode: r.classroomCode,
        createdAt: r.createdAt,
      }));
    return sendJSON(res, { rooms: list });
  }

  // ---------- 방 생성 (학생 또는 교사) ----------
  if (method === 'POST' && pathname === '/api/room') {
    const s = authStudent(req);
    const teacherCls = teacherClassroom(req);
    if (!s && !teacherCls) return sendJSON(res, { error: '로그인 필요' }, 401);
    const body = await readBody(req);
    const classroomCode = s ? s.classroomCode : teacherCls;
    const type = ['single','multi','battle'].includes(body.type) ? body.type : 'single';
    const cCfg = clsCfg(classroomCode) || {};
    const autoApprove = !!teacherCls || !!cCfg.autoApproveRooms;
    const room = createRoom(classroomCode, type, body.config || {}, s, autoApprove);
    if (s) {
      // 학생은 생성 후 자동 입장
      try { joinRoom(room, s); } catch (e) {}
    }
    // 승인 완료된 single 방은 즉시 시작 (참여자 있을 때만)
    if (room.approved && type === 'single' && Object.keys(room.players).length > 0) startRoom(room);
    return sendJSON(res, { code: room.code, type: room.type, approved: room.approved });
  }

  // ---------- 방 입장 ----------
  if (method === 'POST' && pathname === '/api/room/join') {
    const s = authStudent(req);
    if (!s) return sendJSON(res, { error: '로그인 필요' }, 401);
    const body = await readBody(req);
    const room = rooms.get(String(body.code || ''));
    if (!room) return sendJSON(res, { error: '방을 찾을 수 없습니다' }, 404);
    // 다른 교실 방에는 입장 불가
    if (room.classroomCode && room.classroomCode !== s.classroomCode) {
      return sendJSON(res, { error: '다른 교실의 방에는 입장할 수 없습니다' }, 403);
    }
    // 이미 다른 방에 있다면 나가기
    if (s.currentRoom && s.currentRoom !== room.code) {
      const old = rooms.get(s.currentRoom);
      if (old) leaveRoom(old, s);
    }
    try { joinRoom(room, s); }
    catch (e) { return sendJSON(res, { error: e.message }, 400); }
    return sendJSON(res, { ok: true, code: room.code });
  }
  if (method === 'POST' && pathname === '/api/room/leave') {
    const s = authStudent(req);
    if (!s) return sendJSON(res, { error: '로그인 필요' }, 401);
    if (s.currentRoom) {
      const r = rooms.get(s.currentRoom);
      if (r) leaveRoom(r, s);
    }
    return sendJSON(res, { ok: true });
  }

  // ---------- 방장 시작 ----------
  if (method === 'POST' && pathname === '/api/room/start') {
    const s = authStudent(req);
    const isT = authTeacher(req);
    if (!s && !isT) return sendJSON(res, { error: '로그인 필요' }, 401);
    const body = await readBody(req);
    const room = rooms.get(body.code);
    if (!room) return sendJSON(res, { error: '방 없음' }, 404);
    if (!isT && s && room.ownerId !== s.studentId) return sendJSON(res, { error: '방장만 시작 가능' }, 403);
    if (!room.approved) return sendJSON(res, { error: '교사 승인 대기 중' }, 403);
    const n = Object.keys(room.players).length;
    if (n === 0) return sendJSON(res, { error: '참여자 없음' }, 400);
    if (room.type === 'battle' && n < 2) return sendJSON(res, { error: '대전은 최소 2명' }, 400);
    startRoom(room);
    return sendJSON(res, { ok: true });
  }

  // ---------- 답안 제출 ----------
  if (method === 'POST' && pathname === '/api/answer') {
    const s = authStudent(req);
    if (!s) return sendJSON(res, { error: '로그인 필요' }, 401);
    const body = await readBody(req);
    const room = rooms.get(body.code || s.currentRoom);
    if (!room) return sendJSON(res, { error: '방 없음' }, 404);
    if (room.phase !== 'question') return sendJSON(res, { error: '제출 불가' }, 400);
    const p = Object.values(room.players).find(x => x.studentId === s.studentId);
    if (!p) return sendJSON(res, { error: '참여자 아님' }, 400);
    if (p.eliminated) return sendJSON(res, { error: '이미 탈락했습니다' }, 400);
    // 멀티: 플레이어별 스트림 사용
    const isMulti = room.type === 'multi';
    if (isMulti && p.pPhase !== 'question') return sendJSON(res, { error: '제출 불가' }, 400);
    if (!isMulti && p.answered) return sendJSON(res, { error: '이미 제출' }, 400);
    const q = isMulti ? p.pQuestions[p.pIdx] : room.questions[room.qIndex];
    const ok = judge(q, body.answer);
    const elapsed = isMulti
      ? (Date.now() - (p.pStart || Date.now())) / 1000
      : (Date.now() - room.currentQStart) / 1000;
    p.answered = true;
    const useHP = room.type === 'battle' && room.config.battleMode === 'survival';
    const isSpeed = room.type === 'battle' && room.config.battleMode === 'speed';
    if (ok) {
      p.correct++; p.streak++;
      if (p.streak > p.maxStreak) p.maxStreak = p.streak;
      let pts;
      if (room.type === 'battle') {
        // 서바이벌 & 속도전 모두 속도/콤보 보너스 크게
        pts = 100 + Math.max(0, Math.floor((8 - elapsed) * 12)) + Math.min((p.streak - 1) * 30, 180);
        const others = Object.values(room.players).filter(x => x.id !== p.id && !x.eliminated);
        if (others.length && others.every(x => !x.answered)) pts += 80; // 가장 먼저 = 스틸 보너스
        // 속도전: 먼저 맞춘 사람만 점수 받기 — 나머지는 0점 처리 및 즉시 리빌
        if (isSpeed) {
          pts += 120; // 속도전 추가 보너스
        }
      } else {
        pts = 100 + Math.max(0, Math.floor((10 - elapsed) * 5)) + Math.min((p.streak - 1) * 20, 100);
      }
      p.score += pts;
      p.lastAnswer = { ok: true, elapsed, points: pts, submitted: body.answer };
      // 업적
      p.badges = p.badges || [];
      if (p.correct === 1 && !p.badges.includes('first-correct')) p.badges.push('first-correct');
      if (p.streak === 5 && !p.badges.includes('fever')) p.badges.push('fever');
      if (p.streak === 10 && !p.badges.includes('legend')) p.badges.push('legend');
      if (elapsed <= 2 && !p.badges.includes('lightning')) p.badges.push('lightning');
      // 속도전: 첫 정답 나오면 바로 리빌
      if (isSpeed) {
        setTimeout(() => revealAnswer(room), 150);
      }
    } else {
      p.wrong++; p.streak = 0;
      if (useHP) {
        p.hp = Math.max(0, p.hp - 1);
        if (p.hp === 0) p.eliminated = true;
      }
      p.lastAnswer = { ok: false, elapsed, points: 0, submitted: body.answer };
      // 오답 기록
      p.wrongHistory = p.wrongHistory || [];
      p.wrongHistory.push({ qIndex: isMulti ? p.pIdx : room.qIndex, q: viewQuestion(q, false), submitted: body.answer, timeout: false });
    }
    // 멀티: 플레이어 단독 상태 전이 (reveal → next question 은 multiTickRoom 이 처리)
    if (isMulti) {
      p.pLastAnswer = p.lastAnswer;
      p.pPhase = 'reveal';
      p.pRevealAt = Date.now() + room.config.revealTime * 1000;
      room.classTotal = (room.classTotal || 0) + 1;
      if (ok) room.classCorrect = (room.classCorrect || 0) + 1;
    } else {
      checkAllAnswered(room);
    }
    return sendJSON(res, { ok, points: p.lastAnswer.points, hp: p.hp, eliminated: p.eliminated });
  }

  // ---------- 상태 ----------
  if (method === 'GET' && pathname === '/api/state') {
    const room = rooms.get(query.code);
    if (!room) return sendJSON(res, { error: '방 없음' }, 404);
    const forTeacher = authTeacher(req);
    const viewerS = authStudent(req);
    return sendJSON(res, roomView(room, forTeacher, viewerS?.studentId));
  }

  // ---------- 점수판 (글로벌) ----------
  // GET: 전체 교실의 기록을 모두 보여줌 — 누구나 조회 가능. classroomCode 쿼리로 필터 가능.
  if (method === 'GET' && pathname === '/api/leaderboard') {
    const type = query.type;
    if (!['single','multi','battle'].includes(type)) return sendJSON(res, { error: 'type 필요' }, 400);
    let list = leaderboards[type] || [];
    if (query.classroomCode) {
      const f = normCode(query.classroomCode);
      list = list.filter(e => (e.classroomCode || DEFAULT_CLASSROOM) === f);
    }
    return sendJSON(res, { type, entries: list });
  }
  // 교사 수정/삭제는 "본인 교실의 기록"에만 가능
  if (method === 'POST' && pathname === '/api/leaderboard/clear') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const body = await readBody(req);
    if (['single','multi','battle'].includes(body.type)) {
      // 본인 교실 기록만 제거 (다른 교실은 보존)
      const before = leaderboards[body.type].length;
      leaderboards[body.type] = leaderboards[body.type].filter(e => (e.classroomCode || DEFAULT_CLASSROOM) !== cls);
      const removed = before - leaderboards[body.type].length;
      saveLB();
      return sendJSON(res, { ok: true, removed, scope: cls });
    }
    return sendJSON(res, { ok: true });
  }
  if (method === 'POST' && pathname === '/api/leaderboard/entry/bulk-delete') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const body = await readBody(req);
    if (!['single','multi','battle'].includes(body.type)) return sendJSON(res, { error: 'type 오류' }, 400);
    const keys = Array.isArray(body.keys) ? body.keys : [];
    if (keys.length === 0) return sendJSON(res, { error: '선택된 항목이 없음' }, 400);
    const keySet = new Set(keys.map(k => k.at + '|' + k.studentId));
    const list = leaderboards[body.type] || [];
    const before = list.length;
    // 내 교실의 기록만 삭제 허용
    leaderboards[body.type] = list.filter(e => {
      const k = e.at + '|' + e.studentId;
      if (!keySet.has(k)) return true;  // 선택되지 않음 → 유지
      if ((e.classroomCode || DEFAULT_CLASSROOM) !== cls) return true;  // 다른 교실 → 유지
      return false;  // 내 교실 + 선택됨 → 삭제
    });
    const removed = before - leaderboards[body.type].length;
    const denied = keys.length - removed;
    saveLB();
    return sendJSON(res, { ok: true, removed, denied, note: denied > 0 ? '다른 교실의 기록은 삭제할 수 없습니다' : undefined });
  }
  if (method === 'POST' && pathname === '/api/leaderboard/entry/delete') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const body = await readBody(req);
    if (!['single','multi','battle'].includes(body.type)) return sendJSON(res, { error: 'type 오류' }, 400);
    const list = leaderboards[body.type] || [];
    const idx = list.findIndex(e => e.at === body.at && e.studentId === body.studentId);
    if (idx < 0) return sendJSON(res, { error: '항목을 찾을 수 없음' }, 404);
    const entry = list[idx];
    if ((entry.classroomCode || DEFAULT_CLASSROOM) !== cls) return sendJSON(res, { error: '다른 교실의 기록은 삭제할 수 없습니다' }, 403);
    const removed = list.splice(idx, 1)[0];
    saveLB();
    return sendJSON(res, { ok: true, removed });
  }
  if (method === 'POST' && pathname === '/api/leaderboard/entry/update') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const body = await readBody(req);
    if (!['single','multi','battle'].includes(body.type)) return sendJSON(res, { error: 'type 오류' }, 400);
    const list = leaderboards[body.type] || [];
    const idx = list.findIndex(e => e.at === body.at && e.studentId === body.studentId);
    if (idx < 0) return sendJSON(res, { error: '항목을 찾을 수 없음' }, 404);
    const entry = list[idx];
    if ((entry.classroomCode || DEFAULT_CLASSROOM) !== cls) return sendJSON(res, { error: '다른 교실의 기록은 수정할 수 없습니다' }, 403);
    const patch = body.patch || {};
    const allowed = ['name','studentId','score','correct','total','maxStreak','result','roomLabel','playerCount'];
    for (const k of allowed) {
      if (patch[k] === undefined) continue;
      if (['score','correct','total','maxStreak','playerCount'].includes(k)) {
        const v = parseInt(patch[k]);
        if (!isNaN(v) && v >= 0) entry[k] = v;
      } else if (k === 'result') {
        if (['win','lose'].includes(patch[k])) entry.result = patch[k];
      } else {
        entry[k] = String(patch[k]).slice(0, 50);
      }
    }
    list.sort((a, b) => b.score - a.score);
    saveLB();
    return sendJSON(res, { ok: true, entry });
  }

  // ---------- 교사 인증/관리 (교실 스코프) ----------
  // 교실 로그인 — 교실이 없으면 이 비밀번호로 새로 생성 (claim 방식)
  if (method === 'POST' && pathname === '/api/teacher/login') {
    const body = await readBody(req);
    const code = normCode(body.classroomCode || body.classCode);
    const pw = String(body.password || '');
    const name = String(body.name || '').trim().slice(0, 30);
    if (!validCode(code)) return sendJSON(res, { error: '교실 코드는 2~20자 (한글/영문/숫자/-/_)' }, 400);
    if (pw.length < 4) return sendJSON(res, { error: '비밀번호는 4자 이상' }, 400);
    // Rate limit (교실+IP 기준 — 5분에 10회)
    const ipKey = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString().split(',')[0].trim();
    if (!rateLimitOK('teacherlogin:' + ipKey + ':' + code, 10, 5 * 60_000)) return sendJSON(res, { error: '비밀번호 시도 횟수 초과 — 5분 후 다시 시도하세요' }, 429);
    let c = clsroom(code);
    if (!c) {
      c = classrooms[code] = {
        code, name: name || code,
        passwordHash: hashPw(pw), createdAt: Date.now(),
        config: { autoApproveRooms: false, sheetsUrl: '' },
      };
      saveClassrooms();
    } else {
      if (!verifyPw(pw, c.passwordHash)) return sendJSON(res, { error: '비밀번호 오류' }, 401);
      // 자동 마이그레이션: 평문 sha256 → PBKDF2 (가입 후 첫 로그인에서 1회)
      if (!String(c.passwordHash).startsWith('pbkdf2$')) {
        c.passwordHash = hashPw(pw);
        saveClassrooms();
      }
    }
    const t = tok(); teacherTokens.set(t, code);
    persistedTokens.teacher[t] = { classroomCode: code, expiresAt: Date.now() + TEACHER_TOKEN_TTL_MS };
    saveTokens();
    return sendJSON(res, { token: t, classroomCode: code, name: c.name, created: !c.passwordHash ? false : undefined });
  }
  if (method === 'POST' && pathname === '/api/teacher/logout') {
    const tt = getAuth(req);
    teacherTokens.delete(tt);
    delete persistedTokens.teacher[tt]; saveTokens();
    return sendJSON(res, { ok: true });
  }
  // 학생 토큰 keep-alive (heartbeat) — 활동 중이면 만료 갱신
  if (method === 'POST' && pathname === '/api/student/touch') {
    const s = authStudent(req);
    if (!s) return sendJSON(res, { error: '로그인 필요' }, 401);
    if (persistedTokens.student[s.token]) {
      persistedTokens.student[s.token].expiresAt = Date.now() + STUDENT_TOKEN_TTL_MS;
      saveTokens();
    }
    return sendJSON(res, { ok: true });
  }
  if (method === 'POST' && pathname === '/api/teacher/password') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const body = await readBody(req);
    if (!body.newPassword || body.newPassword.length < 4) return sendJSON(res, { error: '4자 이상' }, 400);
    classrooms[cls].passwordHash = hashPw(body.newPassword);
    saveClassrooms();
    return sendJSON(res, { ok: true });
  }
  // 교실 이름 변경
  if (method === 'POST' && pathname === '/api/teacher/classroom/rename') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const body = await readBody(req);
    const n = String(body.name || '').trim().slice(0, 30);
    if (!n) return sendJSON(res, { error: '이름 필수' }, 400);
    classrooms[cls].name = n;
    saveClassrooms();
    return sendJSON(res, { ok: true, name: n });
  }
  // 자동 승인 토글 조회/변경
  if (method === 'GET' && pathname === '/api/teacher/auto-approve') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    return sendJSON(res, { enabled: !!clsCfg(cls).autoApproveRooms });
  }
  if (method === 'POST' && pathname === '/api/teacher/auto-approve') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const body = await readBody(req);
    const c = clsCfg(cls);
    c.autoApproveRooms = !!body.enabled;
    saveClassrooms();
    let approvedCount = 0;
    if (c.autoApproveRooms) {
      for (const room of rooms.values()) {
        if (room.classroomCode !== cls) continue;
        if (!room.approved) {
          room.approved = true;
          approvedCount++;
          if (room.type === 'single' && room.phase === 'lobby' && Object.keys(room.players).length > 0) {
            startRoom(room);
          }
        }
      }
    }
    return sendJSON(res, { ok: true, enabled: c.autoApproveRooms, approvedPending: approvedCount });
  }
  if (method === 'GET' && pathname === '/api/teacher/overview') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const now = Date.now();
    const studentList = [...students.values()].filter(s => s.classroomCode === cls).map(s => ({
      studentId: s.studentId, name: s.name,
      lastSeen: s.lastSeen, online: now - s.lastSeen < 10000,
      currentRoom: s.currentRoom,
    }));
    const roomList = [...rooms.values()].filter(r => r.classroomCode === cls).map(r => ({
      code: r.code, type: r.type, phase: r.phase,
      approved: r.approved,
      label: r.config.label, gameMode: r.config.gameMode,
      difficulty: r.config.difficulty, questionCount: r.config.questionCount,
      capacity: r.config.capacity,
      qIndex: r.qIndex, total: r.questions.length,
      playerCount: Object.keys(r.players).length,
      ownerId: r.ownerId,
      ownerName: (Object.values(r.players).find(p => p.studentId === r.ownerId) || {}).name || '',
      players: Object.values(r.players).map(p => ({ studentId: p.studentId, name: p.name, score: p.score, correct: p.correct, wrong: p.wrong })),
      createdAt: r.createdAt,
    }));
    // 점수판 숫자 — 본인 교실 기록만 카운트
    const myCount = t => (leaderboards[t] || []).filter(e => (e.classroomCode || DEFAULT_CLASSROOM) === cls).length;
    return sendJSON(res, {
      classroomCode: cls, classroomName: classrooms[cls].name,
      students: studentList, rooms: roomList,
      leaderboards: {
        single: myCount('single'),
        multi: myCount('multi'),
        battle: myCount('battle'),
      },
    });
  }
  if (method === 'POST' && pathname === '/api/teacher/room/approve') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const body = await readBody(req);
    const room = rooms.get(body.code);
    if (!room || room.classroomCode !== cls) return sendJSON(res, { error: '방 없음' }, 404);
    room.approved = body.approved !== false;
    if (room.approved && room.type === 'single' && room.phase === 'lobby' && Object.keys(room.players).length > 0) {
      startRoom(room);
    }
    return sendJSON(res, { ok: true, approved: room.approved });
  }
  if (method === 'POST' && pathname === '/api/teacher/room/stop') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const body = await readBody(req);
    const room = rooms.get(body.code);
    if (!room || room.classroomCode !== cls) return sendJSON(res, { error: '방 없음' }, 404);
    if (room.phaseTimer) clearTimeout(room.phaseTimer);
    room.phase = 'results';
    finalizeRoom(room);
    return sendJSON(res, { ok: true });
  }
  if (method === 'POST' && pathname === '/api/teacher/room/close') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const body = await readBody(req);
    const room = rooms.get(body.code);
    if (room && room.classroomCode === cls) {
      if (room.phaseTimer) clearTimeout(room.phaseTimer);
      if (room.multiTick) { clearInterval(room.multiTick); room.multiTick = null; }
      Object.values(room.players).forEach(p => {
        const s = students.get(studentSessKey(cls, p.studentId));
        if (s) s.currentRoom = null;
      });
      rooms.delete(body.code);
    }
    return sendJSON(res, { ok: true });
  }
  if (method === 'POST' && pathname === '/api/teacher/kick') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const body = await readBody(req);
    const s = students.get(studentSessKey(cls, body.studentId));
    if (s) {
      if (s.currentRoom) { const r = rooms.get(s.currentRoom); if (r) leaveRoom(r, s); }
      studentTokens.delete(s.token);
      students.delete(studentSessKey(cls, s.studentId));
    }
    return sendJSON(res, { ok: true });
  }

  // ---------- 학생 마스터 관리 (교실별) ----------
  if (method === 'GET' && pathname === '/api/teacher/students') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const sdb = clsStudents(cls);
    const list = Object.values(sdb).map(r => ({
      ...r, stats: ensureStatsShape(r.stats), online: students.has(studentSessKey(cls, r.studentId)),
    }));
    list.sort((a,b) => (a.studentId > b.studentId ? 1 : -1));
    return sendJSON(res, { students: list });
  }
  if (method === 'POST' && pathname === '/api/teacher/student/delete') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const body = await readBody(req);
    const sid = String(body.studentId || '');
    const sdb = clsStudents(cls);
    if (!sdb[sid]) return sendJSON(res, { error: '존재하지 않는 학생' }, 404);
    delete sdb[sid];
    saveStudentsDb();
    const s = students.get(studentSessKey(cls, sid));
    if (s) {
      if (s.currentRoom) { const r = rooms.get(s.currentRoom); if (r) leaveRoom(r, s); }
      studentTokens.delete(s.token);
      students.delete(studentSessKey(cls, sid));
    }
    maybePushSheets(cls, 'student_delete', { studentId: sid, at: Date.now() });
    return sendJSON(res, { ok: true });
  }
  if (method === 'POST' && pathname === '/api/teacher/student/block') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const body = await readBody(req);
    const sid = String(body.studentId || '');
    const sdb = clsStudents(cls);
    const rec = sdb[sid];
    if (!rec) return sendJSON(res, { error: '존재하지 않는 학생' }, 404);
    rec.blocked = !!body.blocked;
    saveStudentsDb();
    if (rec.blocked) {
      const s = students.get(studentSessKey(cls, sid));
      if (s) { studentTokens.delete(s.token); students.delete(studentSessKey(cls, sid)); }
    }
    return sendJSON(res, { ok: true, blocked: rec.blocked });
  }
  if (method === 'POST' && pathname === '/api/teacher/student/rename') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const body = await readBody(req);
    const sid = String(body.studentId || '');
    const newName = String(body.name || '').trim().slice(0, 12);
    if (!newName) return sendJSON(res, { error: '이름 필수' }, 400);
    const sdb = clsStudents(cls);
    const rec = sdb[sid];
    if (!rec) return sendJSON(res, { error: '존재하지 않는 학생' }, 404);
    rec.name = newName;
    saveStudentsDb();
    const s = students.get(studentSessKey(cls, sid));
    if (s) s.name = newName;
    return sendJSON(res, { ok: true });
  }

  // ---------- 내보내기 / 백업 (교실 스코프) ----------
  if (method === 'GET' && pathname === '/api/teacher/export') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const sdb = clsStudents(cls);
    const adb = clsAttendance(cls);
    // 점수판은 글로벌 — 본인 교실만 필터
    const lb = {
      single: (leaderboards.single||[]).filter(e => (e.classroomCode || DEFAULT_CLASSROOM) === cls),
      multi: (leaderboards.multi||[]).filter(e => (e.classroomCode || DEFAULT_CLASSROOM) === cls),
      battle: (leaderboards.battle||[]).filter(e => (e.classroomCode || DEFAULT_CLASSROOM) === cls),
    };
    const kind = query.kind || 'students';
    let filename, csv;
    if (kind === 'students') {
      const headers = ['studentId','name','joinedAt','totalGames','totalCorrect','totalWrong','bestScore','maxStreak','lastPlayedAt','blocked'];
      const rows = Object.values(sdb).map(r => ({
        studentId: r.studentId, name: r.name,
        joinedAt: fmtDate(r.joinedAt),
        totalGames: r.stats?.totalGames||0,
        totalCorrect: r.stats?.totalCorrect||0,
        totalWrong: r.stats?.totalWrong||0,
        bestScore: r.stats?.bestScore||0,
        maxStreak: r.stats?.maxStreak||0,
        lastPlayedAt: fmtDate(r.stats?.lastPlayedAt),
        blocked: r.blocked ? 'Y' : '',
      }));
      csv = toCsv(headers, rows);
      filename = `students_${cls}_${todayKey()}.csv`;
    } else if (kind === 'attendance') {
      const day = String(query.date || todayKey());
      const headers = ['date','studentId','name','firstSeen','lastSeen','games'];
      const rows = [];
      const dayData = adb[day] || {};
      for (const sid of Object.keys(dayData)) {
        const a = dayData[sid];
        rows.push({ date: day, studentId: sid, name: a.name || sdb[sid]?.name || '', firstSeen: fmtDate(a.firstSeen), lastSeen: fmtDate(a.lastSeen), games: a.games||0 });
      }
      csv = toCsv(headers, rows);
      filename = `attendance_${cls}_${day}.csv`;
    } else if (kind === 'leaderboard') {
      const type = ['single','multi','battle'].includes(query.type) ? query.type : 'single';
      const headers = ['rank','studentId','name','score','correct','total','maxStreak','gameMode','difficulty','at'];
      const rows = (lb[type]||[]).map((e,i) => ({
        rank: i+1, studentId: e.studentId, name: e.name, score: e.score,
        correct: e.correct, total: e.total, maxStreak: e.maxStreak,
        gameMode: e.gameMode, difficulty: e.difficulty, at: fmtDate(e.at),
      }));
      csv = toCsv(headers, rows);
      filename = `leaderboard_${cls}_${type}_${todayKey()}.csv`;
    } else {
      return sendJSON(res, { error: 'unknown kind' }, 400);
    }
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-cache',
    });
    res.end(csv);
    return;
  }
  if (method === 'GET' && pathname === '/api/teacher/backup') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const bundle = {
      exportedAt: new Date().toISOString(),
      classroomCode: cls,
      classroomName: classrooms[cls].name,
      config: { sheetsUrl: clsCfg(cls).sheetsUrl || '', autoApproveRooms: !!clsCfg(cls).autoApproveRooms },
      students: clsStudents(cls),
      attendance: clsAttendance(cls),
      leaderboards: {
        single: (leaderboards.single||[]).filter(e => (e.classroomCode || DEFAULT_CLASSROOM) === cls),
        multi: (leaderboards.multi||[]).filter(e => (e.classroomCode || DEFAULT_CLASSROOM) === cls),
        battle: (leaderboards.battle||[]).filter(e => (e.classroomCode || DEFAULT_CLASSROOM) === cls),
      },
    };
    const json = JSON.stringify(bundle, null, 2);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="sigfig_backup_${cls}_${todayKey()}.json"`,
      'Cache-Control': 'no-cache',
    });
    res.end(json);
    return;
  }

  // ---------- 구글 시트 연동 설정 (교실별) ----------
  if (method === 'GET' && pathname === '/api/teacher/sheets') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    return sendJSON(res, { sheetsUrl: clsCfg(cls).sheetsUrl || '' });
  }
  if (method === 'POST' && pathname === '/api/teacher/sheets') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const body = await readBody(req);
    const u = String(body.sheetsUrl || '').trim();
    if (u && !/^https:\/\/script\.google\.com\//.test(u)) {
      return sendJSON(res, { error: 'Google Apps Script URL만 허용 (https://script.google.com/...)' }, 400);
    }
    clsCfg(cls).sheetsUrl = u;
    saveClassrooms();
    return sendJSON(res, { ok: true, sheetsUrl: u });
  }
  if (method === 'POST' && pathname === '/api/teacher/sheets/test') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const u = clsCfg(cls).sheetsUrl;
    if (!u) return sendJSON(res, { error: '먼저 URL을 저장하세요' }, 400);
    try {
      const r = await httpsPost(u, { event: 'ping', classroomCode: cls, payload: { msg: 'sigfig test' }, at: Date.now() });
      return sendJSON(res, { ok: true, status: r.status, body: r.body.slice(0, 200) });
    } catch (e) {
      return sendJSON(res, { error: e.message }, 500);
    }
  }
  if (method === 'POST' && pathname === '/api/teacher/sheets/push-all') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const u = clsCfg(cls).sheetsUrl;
    if (!u) return sendJSON(res, { error: '시트 URL 미설정' }, 400);
    try {
      const r = await httpsPost(u, {
        event: 'full_sync',
        classroomCode: cls,
        payload: {
          students: Object.values(clsStudents(cls)),
          attendance: clsAttendance(cls),
          leaderboards: {
            single: (leaderboards.single||[]).filter(e => (e.classroomCode || DEFAULT_CLASSROOM) === cls),
            multi: (leaderboards.multi||[]).filter(e => (e.classroomCode || DEFAULT_CLASSROOM) === cls),
            battle: (leaderboards.battle||[]).filter(e => (e.classroomCode || DEFAULT_CLASSROOM) === cls),
          },
        },
        at: Date.now(),
      });
      return sendJSON(res, { ok: true, status: r.status });
    } catch (e) {
      return sendJSON(res, { error: e.message }, 500);
    }
  }

  // ---------- 학습 분석: 학급 종합 통계 ----------
  if (method === 'GET' && pathname === '/api/teacher/analytics') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const sdb = clsStudents(cls);
    const sList = Object.values(sdb);
    const adb = clsAttendance(cls);
    const byMode = {1:{c:0,t:0},2:{c:0,t:0},3:{c:0,t:0},4:{c:0,t:0},5:{c:0,t:0},6:{c:0,t:0}};
    const byDiff = {easy:{c:0,t:0},medium:{c:0,t:0},hard:{c:0,t:0},mixed:{c:0,t:0}};
    let totGames=0, totScore=0;
    const myLB = e => (e.classroomCode || DEFAULT_CLASSROOM) === cls;
    for (const t of ['single','multi','battle']) {
      for (const e of (leaderboards[t]||[])) {
        if (!myLB(e)) continue;
        totGames++; totScore += e.score || 0;
        if (byMode[e.gameMode]) { byMode[e.gameMode].c += e.correct||0; byMode[e.gameMode].t += e.total||0; }
        if (byDiff[e.difficulty]) { byDiff[e.difficulty].c += e.correct||0; byDiff[e.difficulty].t += e.total||0; }
      }
    }
    const today = new Date(); today.setHours(0,0,0,0); const todayMs = today.getTime();
    const hourly = Array(24).fill(0);
    for (const t of ['single','multi','battle']) {
      for (const e of (leaderboards[t]||[])) {
        if (!myLB(e)) continue;
        if (!e.at || e.at < todayMs) continue;
        hourly[new Date(e.at).getHours()]++;
      }
    }
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      days.push({ date: key, count: adb[key] ? Object.keys(adb[key]).length : 0 });
    }
    const studentAcc = sList.map(rec => {
      const st = ensureStatsShape(rec.stats);
      const tot = (st.totalCorrect||0) + (st.totalWrong||0);
      return { studentId: rec.studentId, name: rec.name, accuracy: tot>0?Math.round(st.totalCorrect/tot*100):null, games: st.totalGames||0, score: st.totalScore||0 };
    });
    return sendJSON(res, { totGames, totPlayers: sList.length, totScore, byMode, byDiff, hourly, attendance7d: days, studentAcc });
  }

  // ---------- 학습 분석: 자주 틀리는 문제 ----------
  if (method === 'GET' && pathname === '/api/teacher/analytics/wrongs') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const w = clsWrongs(cls);
    const counts = new Map();
    for (const sid of Object.keys(w)) {
      for (const item of (w[sid] || []).slice(-50)) {
        const key = (item.q && (item.q.num || item.q.display)) || '?';
        const e = counts.get(key) || { key, gm: item.gameMode, count: 0, sample: item };
        e.count++;
        counts.set(key, e);
      }
    }
    const list = [...counts.values()].sort((a,b) => b.count - a.count).slice(0, 30);
    return sendJSON(res, { items: list });
  }

  // ---------- 학생 오답노트 ----------
  if (method === 'GET' && pathname === '/api/wrong-notes') {
    const sess = authStudent(req);
    const tch = teacherClassroom(req);
    let code, sid;
    if (tch) {
      code = tch; sid = String(query.studentId || '');
      if (!sid) return sendJSON(res, { error: 'studentId 필요' }, 400);
    } else if (sess) {
      code = sess.classroomCode; sid = sess.studentId;
    } else return sendJSON(res, { error: '인증 필요' }, 401);
    const w = clsWrongs(code);
    return sendJSON(res, { items: (w[sid] || []).slice(-50).reverse() });
  }

  // ---------- 학생 CSV 일괄 등록 ----------
  if (method === 'POST' && pathname === '/api/teacher/students/import') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const body = await readBody(req);
    const csv = String(body.csv || '');
    if (!csv) return sendJSON(res, { error: 'csv 필요' }, 400);
    const lines = csv.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return sendJSON(res, { error: '빈 CSV' }, 400);
    const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/^\uFEFF/, ''));
    const sidIdx = header.indexOf('studentid') >= 0 ? header.indexOf('studentid') : header.indexOf('학번');
    const nameIdx = header.indexOf('name') >= 0 ? header.indexOf('name') : header.indexOf('이름');
    if (sidIdx < 0 || nameIdx < 0) return sendJSON(res, { error: '헤더에 studentId/name (또는 학번/이름) 필요' }, 400);
    const sdb = clsStudents(cls);
    let added = 0, updated = 0, skipped = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      const sid = sanitizeStr(cols[sidIdx], 10);
      const name = sanitizeStr(cols[nameIdx], 12);
      if (!sid || !name || !/^[0-9A-Za-z]+$/.test(sid) || hasBadWord(name)) { skipped++; continue; }
      if (sdb[sid]) { sdb[sid].name = name; updated++; }
      else { sdb[sid] = { studentId: sid, name, joinedAt: Date.now(), stats: emptyStats(), blocked: false }; added++; }
    }
    saveStudentsDb();
    return sendJSON(res, { ok: true, added, updated, skipped });
  }

  // ---------- 학생 일괄 차단/해제/삭제 ----------
  if (method === 'POST' && pathname === '/api/teacher/students/bulk') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const body = await readBody(req);
    const ids = Array.isArray(body.studentIds) ? body.studentIds : [];
    const op = body.op;
    if (!ids.length) return sendJSON(res, { error: '학번 없음' }, 400);
    const sdb = clsStudents(cls);
    let n = 0;
    const kickToken = (sid) => { const ss = students.get(studentSessKey(cls, sid)); if (ss) { studentTokens.delete(ss.token); delete persistedTokens.student[ss.token]; saveTokens(); students.delete(studentSessKey(cls, sid)); }};
    for (const sid of ids) {
      const rec = sdb[sid]; if (!rec) continue;
      if (op === 'block') { rec.blocked = true; n++; kickToken(sid); }
      else if (op === 'unblock') { rec.blocked = false; n++; }
      else if (op === 'delete') { delete sdb[sid]; n++; kickToken(sid); }
    }
    saveStudentsDb();
    return sendJSON(res, { ok: true, count: n });
  }

  // ---------- 방 일괄 ----------
  if (method === 'POST' && pathname === '/api/teacher/rooms/bulk') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const body = await readBody(req);
    const op = body.op;
    let n = 0;
    for (const room of Array.from(rooms.values())) {
      if (room.classroomCode !== cls) continue;
      if (op === 'approve-all' && !room.approved) {
        room.approved = true; n++;
        if (room.type === 'single' && room.phase === 'lobby' && Object.keys(room.players).length > 0) startRoom(room);
      } else if (op === 'stop-all' && (room.phase === 'question' || room.phase === 'reveal')) {
        if (room.phaseTimer) clearTimeout(room.phaseTimer);
        room.phase = 'results'; finalizeRoom(room); n++;
      } else if (op === 'close-all') {
        if (room.phaseTimer) clearTimeout(room.phaseTimer);
        if (room.multiTick) { clearInterval(room.multiTick); room.multiTick = null; }
        Object.values(room.players).forEach(p => { const ss = students.get(studentSessKey(cls, p.studentId)); if (ss) ss.currentRoom = null; });
        rooms.delete(room.code); n++;
      }
    }
    return sendJSON(res, { ok: true, count: n });
  }

  // ---------- 프리셋 ----------
  if (method === 'GET' && pathname === '/api/teacher/presets') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    return sendJSON(res, { presets: clsPresets(cls) });
  }
  if (method === 'POST' && pathname === '/api/teacher/presets') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const body = await readBody(req);
    const list = clsPresets(cls);
    const item = { id: 'p' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), name: sanitizeStr(body.name, 30) || '프리셋', config: body.config || {}, type: ['single','multi','battle'].includes(body.type) ? body.type : 'multi' };
    list.push(item);
    if (list.length > 30) list.shift();
    savePresets();
    return sendJSON(res, { ok: true, preset: item });
  }
  if (method === 'POST' && pathname === '/api/teacher/presets/delete') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const body = await readBody(req);
    presetsDb[cls] = (presetsDb[cls] || []).filter(p => p.id !== body.id);
    savePresets();
    return sendJSON(res, { ok: true });
  }

  // ---------- 백업 복원 ----------
  if (method === 'POST' && pathname === '/api/teacher/backup/restore') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const body = await readBody(req);
    const bundle = body.bundle;
    if (!bundle || typeof bundle !== 'object') return sendJSON(res, { error: '잘못된 백업 파일' }, 400);
    if (bundle.classroomCode && bundle.classroomCode !== cls) return sendJSON(res, { error: '다른 교실 백업 (백업: ' + bundle.classroomCode + ', 현재: ' + cls + ')' }, 400);
    let restored = { students: 0, attendance: 0, lb: 0 };
    if (bundle.students && typeof bundle.students === 'object') {
      studentsDb[cls] = bundle.students;
      restored.students = Object.keys(bundle.students).length;
      saveStudentsDb();
    }
    if (bundle.attendance && typeof bundle.attendance === 'object') {
      attendance[cls] = bundle.attendance;
      restored.attendance = Object.keys(bundle.attendance).length;
      saveAttendance();
    }
    if (bundle.leaderboards) {
      for (const t of ['single','multi','battle']) {
        if (Array.isArray(bundle.leaderboards[t])) {
          leaderboards[t] = (leaderboards[t] || []).filter(e => (e.classroomCode || DEFAULT_CLASSROOM) !== cls);
          for (const e of bundle.leaderboards[t]) { leaderboards[t].push({ ...e, classroomCode: cls }); restored.lb++; }
          leaderboards[t].sort((a,b) => b.score - a.score);
          if (leaderboards[t].length > 500) leaderboards[t].length = 500;
        }
      }
      saveLB();
    }
    return sendJSON(res, { ok: true, restored });
  }

  // ---------- 출결 — 월/주 ----------
  if (method === 'GET' && pathname === '/api/teacher/attendance') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const adb = clsAttendance(cls);
    const month = String(query.month || '');
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const days = Object.keys(adb).filter(d => d.startsWith(month)).sort();
      const rows = days.map(d => ({ date: d, count: Object.keys(adb[d]).length }));
      return sendJSON(res, { month, days: rows });
    }
    return sendJSON(res, { dates: Object.keys(adb).sort() });
  }

  // ---------- 점수판 일괄 보너스 ----------
  if (method === 'POST' && pathname === '/api/leaderboard/entry/bulk-bonus') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const body = await readBody(req);
    if (!['single','multi','battle'].includes(body.type)) return sendJSON(res, { error: 'type 오류' }, 400);
    const keys = Array.isArray(body.keys) ? body.keys : [];
    const bonus = parseInt(body.bonus) || 0;
    if (!keys.length) return sendJSON(res, { error: '선택 없음' }, 400);
    const keySet = new Set(keys.map(k => k.at + '|' + k.studentId));
    let n = 0;
    for (const e of leaderboards[body.type] || []) {
      const k = e.at + '|' + e.studentId;
      if (!keySet.has(k)) continue;
      if ((e.classroomCode || DEFAULT_CLASSROOM) !== cls) continue;
      e.score = Math.max(0, (e.score || 0) + bonus);
      n++;
    }
    leaderboards[body.type].sort((a,b) => b.score - a.score);
    saveLB();
    return sendJSON(res, { ok: true, count: n });
  }

  // ---------- 헬스체크 (Render warm-up) ----------
  if (method === 'GET' && pathname === '/api/health') {
    return sendJSON(res, { ok: true, uptime: Math.round(process.uptime()), classrooms: Object.keys(classrooms).length, rooms: rooms.size });
  }


  sendJSON(res, { error: 'unknown api' }, 404);
}

// ==================== 정적 파일 ====================
const mimes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};
function serveStatic(req, res, pathname) {
  const file = pathname === '/' ? '/home.html' : pathname;
  const fp = path.join(ROOT, file);
  if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(fp).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimes[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

// ==================== 서버 ====================
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }
  const u = url.parse(req.url, true);
  try {
    if (u.pathname.startsWith('/api/')) await handleApi(req, res, u.pathname, u.query);
    else serveStatic(req, res, u.pathname);
  } catch (e) {
    console.error(e);
    sendJSON(res, { error: String(e.message || e) }, 500);
  }
});

// 오프라인 학생 / 빈 방 정리
setInterval(() => {
  const now = Date.now();
  for (const [sid, s] of students) {
    if (now - s.lastSeen > STUDENT_TOKEN_TTL_MS) {  // 6시간 무반응
      if (s.currentRoom) { const r = rooms.get(s.currentRoom); if (r) leaveRoom(r, s); }
      studentTokens.delete(s.token);
      students.delete(sid);
    }
  }
  for (const [code, room] of rooms) {
    if (Object.keys(room.players).length === 0 && now - room.updatedAt > 1000 * 20) {
      if (room.phaseTimer) clearTimeout(room.phaseTimer);
      rooms.delete(code);
    }
  }
}, 1000 * 5);

// 클라우드 배포 시 0.0.0.0 에 바인딩 — 모든 인터페이스에서 수신
const HOST = process.env.HOST || '0.0.0.0';
// Graceful shutdown — 즉시 flush (디바운스 우회)
function flushAll() {
  try { atomicWrite(LB_FILE, JSON.stringify(leaderboards)); } catch(_){}
  try { atomicWrite(STUDENTS_FILE, JSON.stringify(studentsDb)); } catch(_){}
  try { atomicWrite(ATTEND_FILE, JSON.stringify(attendance)); } catch(_){}
  try { atomicWrite(TOKENS_FILE, JSON.stringify(persistedTokens)); } catch(_){}
  try { atomicWrite(WRONGS_FILE, JSON.stringify(wrongsDb)); } catch(_){}
  try { atomicWrite(PRESETS_FILE, JSON.stringify(presetsDb)); } catch(_){}
  console.log('[shutdown] all data flushed');
}
process.on('SIGTERM', () => { flushAll(); process.exit(0); });
process.on('SIGINT',  () => { flushAll(); process.exit(0); });
process.on('uncaughtException', (e) => { console.error('[uncaught]', e); flushAll(); });
process.on('unhandledRejection', (e) => { console.error('[unhandled]', e); });

server.listen(PORT, HOST, () => {
  console.log(`\n🔬 유효숫자 마스터 서버 실행 중 (port ${PORT})`);
  console.log(`  학생 입장: http://localhost:${PORT}/`);
  console.log(`  교사 카운터: http://localhost:${PORT}/teacher.html`);
  console.log(`  점수판: http://localhost:${PORT}/leaderboard.html`);
  const ifs = os.networkInterfaces();
  Object.values(ifs).flat().forEach(i => {
    if (i && i.family === 'IPv4' && !i.internal) console.log(`  네트워크 주소: http://${i.address}:${PORT}`);
  });
  const cList = Object.values(classrooms).map(c => `    - ${c.code} (${c.name})`).join('\n');
  console.log(`  등록된 교실:\n${cList || '    (아직 없음)'}\n`);
});
