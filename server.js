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
// (레거시) 단일 교실용 파일 — 있으면 자동으로 default 교실로 이관
const LEGACY_CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const DEFAULT_CLASSROOM = 'default';

// ==================== 영구 데이터 ====================
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// 비밀번호 해싱 (단방향 — sha256)
function hashPw(pw) { return crypto.createHash('sha256').update(String(pw||'')).digest('hex'); }

// ==================== 저장 스케줄러 (디바운스 + 원자적 교체) ====================
// 호출할 때마다 전체 JSON을 동기 기록하면 30명이 한꺼번에 게임을 끝낼 때 이벤트 루프가 멈춘다.
// 파일별로 "첫 변경 이후 최대 SAVE_DELAY_MS 안에 반드시 1회 기록"을 보장한다.
//   → 타이머를 연장(trailing debounce)하지 않는다. 연장하면 수업 내내 저장이 미뤄질 수 있다.
// 기록은 tmp 파일에 쓴 뒤 rename 으로 교체 — 도중에 죽어도 원본이 깨지지 않는다.
const SAVE_DELAY_MS = 1500;
const saveStates = new Map(); // 파일 경로 → { file, getData, timer, dirty, writing }

function saveStateFor(file, getData) {
  let st = saveStates.get(file);
  if (!st) { st = { file, getData, timer: null, dirty: false, writing: false }; saveStates.set(file, st); }
  st.getData = getData;   // getter 는 항상 클로저 — 값(재대입되는 변수)을 캡처하면 안 됨
  return st;
}

function armSaveTimer(st) {
  if (st.timer || st.writing) return;
  st.timer = setTimeout(() => { st.timer = null; writeSaveState(st); }, SAVE_DELAY_MS);
  if (typeof st.timer.unref === 'function') st.timer.unref();  // 종료 시 flush 가 있으므로 프로세스를 붙잡지 않음
}

function writeSaveState(st) {
  if (st.writing || !st.dirty) return;
  let json;
  try {
    json = JSON.stringify(st.getData(), null, 2);
  } catch (e) {
    st.dirty = false;   // 직렬화 자체가 실패하면 재시도해도 같은 결과 — 무한 루프 방지
    console.error('[저장] 직렬화 실패:', st.file, e.message);
    return;
  }
  st.dirty = false;
  st.writing = true;
  const tmp = st.file + '.tmp';
  fs.writeFile(tmp, json, 'utf8', (err) => {
    if (err) {
      st.writing = false; st.dirty = true;
      console.error('[저장] 임시파일 기록 실패:', tmp, err.message);
      armSaveTimer(st);
      return;
    }
    fs.rename(tmp, st.file, (err2) => {
      st.writing = false;
      if (err2) {
        st.dirty = true;
        console.error('[저장] 교체 실패:', st.file, err2.message);
      }
      if (st.dirty) armSaveTimer(st);   // 쓰는 중에 또 변경됐으면 재예약
    });
  });
}

// 저장 예약 — 기존 saveXxx() 들이 이 함수를 통해 동작한다 (호출부 시그니처는 그대로)
function scheduleSave(file, getData) {
  const st = saveStateFor(file, getData);
  st.dirty = true;
  armSaveTimer(st);
}

// 종료 시 남은 변경을 동기 기록 — 'exit' 핸들러에서는 동기 I/O 만 가능하다
function flushAllSync() {
  for (const st of saveStates.values()) {
    if (st.timer) { clearTimeout(st.timer); st.timer = null; }
    // writing=true 면 비동기 rename 이 아직 안 끝났을 수 있으므로 함께 동기 기록한다
    if (!st.dirty && !st.writing) continue;
    try {
      fs.writeFileSync(st.file, JSON.stringify(st.getData(), null, 2));
      st.dirty = false; st.writing = false;
    } catch (e) {
      console.error('[저장] 종료 시 기록 실패:', st.file, e.message);
    }
  }
}

let shuttingDown = false;
function shutdownAndExit(sig) {
  if (shuttingDown) return;
  shuttingDown = true;
  try { flushAllSync(); } catch (e) { /* ignore */ }
  console.log(`\n[종료] ${sig} — 저장 완료 후 종료합니다.`);
  process.exit(0);
}
process.on('exit', flushAllSync);
// SIGTERM 은 기본 동작이 즉시 종료라 핸들러가 없으면 'exit' 조차 돌지 않는다 (Render 재배포 시 SIGTERM)
process.on('SIGINT', () => shutdownAndExit('SIGINT'));
process.on('SIGTERM', () => shutdownAndExit('SIGTERM'));

// 교실 정의: { [code]: { code, name, passwordHash, createdAt, config: { autoApproveRooms, sheetsUrl } } }
let classrooms = {};
if (fs.existsSync(CLASSROOMS_FILE)) {
  classrooms = JSON.parse(fs.readFileSync(CLASSROOMS_FILE, 'utf8'));
}
const saveClassrooms = () => scheduleSave(CLASSROOMS_FILE, () => classrooms);

// 레거시 config.json → default 교실로 자동 이관 (첫 실행 시만)
if (fs.existsSync(LEGACY_CONFIG_FILE) && !classrooms[DEFAULT_CLASSROOM]) {
  try {
    const old = JSON.parse(fs.readFileSync(LEGACY_CONFIG_FILE, 'utf8'));
    classrooms[DEFAULT_CLASSROOM] = {
      code: DEFAULT_CLASSROOM,
      name: '기본 교실',
      passwordHash: hashPw(old.teacherPassword || process.env.TEACHER_PASSWORD || '3000'),
      createdAt: Date.now(),
      config: { autoApproveRooms: !!old.autoApproveRooms, sheetsUrl: old.sheetsUrl || '', locked: false, presets: [], journal: [] },
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
    config: { autoApproveRooms: false, sheetsUrl: '', locked: false, presets: [], journal: [] },
  };
  saveClassrooms();
}

// 데이터 구조:
// leaderboards (글로벌): { single: [...entries], multi: [...entries], battle: [...entries] } — 각 entry에 classroomCode 포함
// studentsDb  (교실별): { [code]: { [studentId]: {studentId,name,joinedAt,stats,blocked} } }
// attendance  (교실별): { [code]: { [YYYY-MM-DD]: { [studentId]: {firstSeen,lastSeen,games,name} } } }
let leaderboards = fs.existsSync(LB_FILE) ? JSON.parse(fs.readFileSync(LB_FILE, 'utf8')) : { single: [], multi: [], battle: [] };
let studentsDb = fs.existsSync(STUDENTS_FILE) ? JSON.parse(fs.readFileSync(STUDENTS_FILE, 'utf8')) : {};
let attendance = fs.existsSync(ATTEND_FILE) ? JSON.parse(fs.readFileSync(ATTEND_FILE, 'utf8')) : {};

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

// 교실 레코드 — 신규 필드 기본값 보정 (한 번 돌려두면 구 데이터도 안전)
function migrateClassroomShape() {
  let changed = false;
  for (const code of Object.keys(classrooms)) {
    const c = classrooms[code];
    if (!c.config) { c.config = {}; changed = true; }
    const cf = c.config;
    if (cf.autoApproveRooms === undefined) { cf.autoApproveRooms = false; changed = true; }
    if (cf.sheetsUrl === undefined) { cf.sheetsUrl = ''; changed = true; }
    if (cf.locked === undefined) { cf.locked = false; changed = true; }
    if (cf.rosterOnly === undefined) { cf.rosterOnly = false; changed = true; }
    if (!Array.isArray(cf.presets)) { cf.presets = []; changed = true; }
    if (!Array.isArray(cf.journal)) { cf.journal = []; changed = true; }
  }
  if (changed) saveClassrooms();
}
migrateClassroomShape();

// 저장은 전부 디바운스 — 이름/시그니처는 그대로 두어 호출부를 건드리지 않는다
const saveLB = () => scheduleSave(LB_FILE, () => leaderboards);
const saveStudentsDb = () => scheduleSave(STUDENTS_FILE, () => studentsDb);
const saveAttendance = () => scheduleSave(ATTEND_FILE, () => attendance);

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
// 명단(preregistered) 학생 수 — 구 레코드에는 필드가 없으므로 !! 로 처리
function countPreregistered(code) {
  const sdb = clsStudents(code);
  return Object.values(sdb).filter(r => !!r.preregistered).length;
}
function clsCfg(code) {
  const c = classrooms[code];
  if (!c) return null;
  if (!c.config) c.config = {};
  const cf = c.config;
  if (cf.autoApproveRooms === undefined) cf.autoApproveRooms = false;
  if (cf.sheetsUrl === undefined) cf.sheetsUrl = '';
  if (cf.locked === undefined) cf.locked = false;
  if (cf.rosterOnly === undefined) cf.rosterOnly = false;
  if (!Array.isArray(cf.presets)) cf.presets = [];
  if (!Array.isArray(cf.journal)) cf.journal = [];
  return cf;
}

// 교실 코드 정규화 (2~20자, 한글/영문/숫자/하이픈/언더스코어)
function normCode(v) {
  return String(v || '').trim().slice(0, 20);
}
// 이름 정규화 — 명단 대조용. 공백(유니코드 공백·폭 없는 공백 포함) 제거 + 소문자화 + NFC 정규화
// 예) '홍 길동' / '홍길동' / 'HONG' / 'hong' 을 같은 것으로 본다.
function normName(s) {
  return String(s == null ? '' : s)
    .normalize('NFC')
    .replace(/[\s\u00A0\u200B-\u200D\u2060\u3000\uFEFF]/g, '')
    .toLowerCase();
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
function emptyProfile() {
  return {
    level: 1, exp: 0,
    title: '', titlesOwned: [],
    avatar: '🙂', avatarsOwned: ['🙂'],
    dailyStreak: 0, lastDailyAt: 0,
    quests: {},                 // questId → { progress, completedAt }
    achievements: [],           // 뱃지 배열
    hintsUsed: 0,
    lastRevengeTarget: null,
    wrongBank: [],              // 오답 모음 (최대 100개)
  };
}
// 기존 레코드 마이그레이션: 누락된 필드 채우기
function ensureStatsShape(s) {
  if (!s) return emptyStats();
  const d = emptyStats();
  for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
  return s;
}
function ensureProfileShape(p) {
  if (!p) return emptyProfile();
  const d = emptyProfile();
  for (const k of Object.keys(d)) if (p[k] === undefined) p[k] = d[k];
  return p;
}
// 레벨 계산 — exp 100 * level 씩 증가 (간단 커브)
function expForLevel(n) { return 100 * n; }
function addExp(profile, amount) {
  profile.exp = (profile.exp || 0) + (amount || 0);
  let leveled = false;
  while (profile.exp >= expForLevel(profile.level)) {
    profile.exp -= expForLevel(profile.level);
    profile.level += 1;
    leveled = true;
  }
  return leveled;
}
function registerOrTouchStudent(classroomCode, studentId, name) {
  const sdb = clsStudents(classroomCode);
  let rec = sdb[studentId];
  if (rec) {
    rec.stats = ensureStatsShape(rec.stats);
    rec.profile = ensureProfileShape(rec.profile);
  }
  if (!rec) {
    rec = { studentId, name, joinedAt: Date.now(), stats: emptyStats(), profile: emptyProfile(), blocked: false };
    sdb[studentId] = rec;
  } else {
    rec.name = name; // 이름은 최신 로그인으로 갱신
  }
  // 출결 기록 (교실별) + 연속 출석(F2)
  const adb = clsAttendance(classroomCode);
  const day = todayKey();
  if (!adb[day]) adb[day] = {};
  const a = adb[day][studentId] || { firstSeen: Date.now(), lastSeen: Date.now(), games: 0 };
  a.lastSeen = Date.now();
  a.name = name;
  adb[day][studentId] = a;
  // 오늘 처음 출석 시 연속 출석 갱신
  if (a.firstSeen === a.lastSeen) {
    updateDailyStreak(rec, day);
  }
  saveStudentsDb();
  saveAttendance();
  return rec;
}
// 연속 출석 — 어제 또는 오늘 마지막 체크에서 하루 차이면 +1, 아니면 리셋
function updateDailyStreak(rec, todayStr) {
  rec.profile = ensureProfileShape(rec.profile);
  const lastDay = rec.profile._lastDailyDay || null;
  if (lastDay === todayStr) return; // 중복 호출 방어
  if (!lastDay) {
    rec.profile.dailyStreak = 1;
  } else {
    const d1 = new Date(lastDay + 'T00:00:00');
    const d2 = new Date(todayStr + 'T00:00:00');
    const diff = Math.round((d2 - d1) / 86400000);
    if (diff === 1) rec.profile.dailyStreak = (rec.profile.dailyStreak || 0) + 1;
    else rec.profile.dailyStreak = 1;
  }
  rec.profile._lastDailyDay = todayStr;
  rec.profile.lastDailyAt = Date.now();
  // 연속 출석 뱃지
  const s = rec.profile.dailyStreak;
  const badges = rec.profile.achievements || (rec.profile.achievements = []);
  const newBadges = [];
  if (s === 3 && !badges.includes('streak-3')) { badges.push('streak-3'); newBadges.push('streak-3'); }
  if (s === 7 && !badges.includes('streak-7')) { badges.push('streak-7'); newBadges.push('streak-7'); }
  if (s === 30 && !badges.includes('streak-30')) { badges.push('streak-30'); newBadges.push('streak-30'); }
  return newBadges;
}
function accumulateStats(classroomCode, studentId, finalPlayer, roomType, battleResult) {
  const sdb = clsStudents(classroomCode);
  const rec = sdb[studentId];
  if (!rec) return;
  const s = ensureStatsShape(rec.stats);
  const p = ensureProfileShape(rec.profile);
  rec.stats = s; rec.profile = p;
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
  // 경험치 (F3) — 점수 1/10 + 정답당 +5 + 승리 보너스
  const gained = Math.floor((finalPlayer.score || 0) / 10) + (finalPlayer.correct || 0) * 5 + (battleResult === 'win' ? 50 : 0);
  const leveled = addExp(p, gained);
  // 오답 은행(U5) — 최근 100개 유지
  if (Array.isArray(finalPlayer.wrongHistory) && finalPlayer.wrongHistory.length) {
    p.wrongBank = (p.wrongBank || []);
    for (const w of finalPlayer.wrongHistory) {
      p.wrongBank.push({ at: Date.now(), q: w.q, submitted: w.submitted, timeout: !!w.timeout });
    }
    if (p.wrongBank.length > 100) p.wrongBank = p.wrongBank.slice(-100);
  }
  // 퀘스트·업적 체크 (F16)
  checkQuestsAndAchievements(rec, finalPlayer, roomType, battleResult);
  // 칭호 자동 해금 (F4)
  autoUnlockTitles(rec);
  const adb = clsAttendance(classroomCode);
  const day = todayKey();
  if (adb[day] && adb[day][studentId]) adb[day][studentId].games = (adb[day][studentId].games||0) + 1;
  saveStudentsDb();
  saveAttendance();
  return { gained, leveled };
}

// ============ 퀘스트·업적·칭호 정의 ============
const QUEST_DEFS = {
  'daily-play-3': { name: '오늘 3판 플레이', target: 3, type: 'games-today', reward: { exp: 50 } },
  'daily-correct-20': { name: '오늘 20문제 정답', target: 20, type: 'correct-today', reward: { exp: 80 } },
  'streak-5': { name: '5문제 연속 정답', target: 5, type: 'streak', reward: { exp: 60, badge: 'streak-5' } },
  'lightning-5': { name: '2초 이내 정답 5회', target: 5, type: 'lightning', reward: { exp: 100, badge: 'lightning-master' } },
  'all-modes': { name: '3가지 모드 모두 플레이', target: 3, type: 'modes', reward: { exp: 120, badge: 'versatile' } },
  'battle-win-3': { name: '대전 3승', target: 3, type: 'battle-win', reward: { exp: 150, badge: 'warrior' } },
};
const TITLE_DEFS = [
  { id: 'novice', name: '🌱 새싹', cond: rec => rec.stats.totalGames >= 1 },
  { id: 'dedicated', name: '📚 꾸준히왕', cond: rec => (rec.profile.dailyStreak || 0) >= 7 },
  { id: 'sharpshooter', name: '🎯 명사수', cond: rec => { const s = rec.stats; return s.totalCorrect + s.totalWrong >= 50 && s.totalCorrect / Math.max(1, s.totalCorrect + s.totalWrong) >= 0.85; } },
  { id: 'lightning', name: '⚡ 번개왕', cond: rec => (rec.profile.achievements || []).includes('lightning-master') },
  { id: 'warrior', name: '⚔️ 전사', cond: rec => (rec.stats.battleWins || 0) >= 10 },
  { id: 'legend', name: '💎 레전드', cond: rec => rec.profile.level >= 20 },
  { id: 'master', name: '👑 유효숫자 마스터', cond: rec => rec.profile.level >= 50 },
];
function checkQuestsAndAchievements(rec, finalPlayer, roomType, battleResult) {
  const p = ensureProfileShape(rec.profile);
  rec.profile = p;
  p.quests = p.quests || {};
  const today = todayKey();
  // 일일 퀘스트 키에는 날짜 prefix — 다른 날이면 리셋
  const keyWith = (id) => `${today}/${id}`;
  const ensureQ = (id) => {
    const k = keyWith(id);
    if (!p.quests[k]) p.quests[k] = { progress: 0 };
    return p.quests[k];
  };
  // games-today
  { const q = ensureQ('daily-play-3'); if (!q.completedAt) { q.progress += 1; if (q.progress >= QUEST_DEFS['daily-play-3'].target) { q.completedAt = Date.now(); addExp(p, QUEST_DEFS['daily-play-3'].reward.exp); } } }
  // correct-today
  { const q = ensureQ('daily-correct-20'); if (!q.completedAt) { q.progress += (finalPlayer.correct || 0); if (q.progress >= QUEST_DEFS['daily-correct-20'].target) { q.completedAt = Date.now(); addExp(p, QUEST_DEFS['daily-correct-20'].reward.exp); } } }
  // streak (누적 — 역대 최대 연속 기록)
  {
    const id = 'streak-5';
    const k = keyWith(id);
    if (!p.quests[k]) p.quests[k] = { progress: 0 };
    const q = p.quests[k];
    if (!q.completedAt) {
      q.progress = Math.max(q.progress || 0, finalPlayer.maxStreak || 0);
      if (q.progress >= QUEST_DEFS[id].target) {
        q.completedAt = Date.now();
        addExp(p, QUEST_DEFS[id].reward.exp);
        if (!p.achievements.includes(QUEST_DEFS[id].reward.badge)) p.achievements.push(QUEST_DEFS[id].reward.badge);
      }
    }
  }
  // all-modes — 평생 누적(저장 플래그)
  {
    const modesSet = new Set(p._modesPlayed || []);
    if (roomType) modesSet.add(roomType);
    p._modesPlayed = Array.from(modesSet);
    const k = 'lifetime/all-modes';
    if (!p.quests[k]) p.quests[k] = { progress: 0 };
    const q = p.quests[k];
    if (!q.completedAt) {
      q.progress = p._modesPlayed.length;
      if (q.progress >= 3) {
        q.completedAt = Date.now();
        addExp(p, QUEST_DEFS['all-modes'].reward.exp);
        if (!p.achievements.includes('versatile')) p.achievements.push('versatile');
      }
    }
  }
  // battle-win-3 (lifetime)
  if (battleResult === 'win') {
    const k = 'lifetime/battle-win-3';
    if (!p.quests[k]) p.quests[k] = { progress: 0 };
    const q = p.quests[k];
    if (!q.completedAt) {
      q.progress = (q.progress || 0) + 1;
      if (q.progress >= 3) {
        q.completedAt = Date.now();
        addExp(p, QUEST_DEFS['battle-win-3'].reward.exp);
        if (!p.achievements.includes('warrior')) p.achievements.push('warrior');
      }
    }
  }
}
function autoUnlockTitles(rec) {
  const p = ensureProfileShape(rec.profile);
  rec.profile = p;
  p.titlesOwned = p.titlesOwned || [];
  for (const t of TITLE_DEFS) {
    if (!p.titlesOwned.includes(t.id) && t.cond(rec)) p.titlesOwned.push(t.id);
  }
}

// ==================== 메모리 상태 ====================
const rooms = new Map();            // code → room (room.classroomCode 포함)
const students = new Map();         // (classroomCode + ':' + studentId) → session { classroomCode, studentId, name, token, lastSeen, currentRoom }
const studentTokens = new Map();    // token → { classroomCode, studentId }
const teacherTokens = new Map();    // token → classroomCode
const notices = new Map();          // classroomCode → [{id, target:'classroom'|'room', roomCode?, text, expiresAt, createdAt}]
const pendingSince = new Map();     // roomCode → timestamp (승인 대기 시작 시각)

function studentSessKey(classroomCode, studentId) { return classroomCode + ':' + studentId; }

// 공지 만료 제거 + 특정 학생용 활성 공지 목록
function activeNoticesFor(classroomCode, studentRoomCode) {
  const list = notices.get(classroomCode);
  if (!list || !list.length) return [];
  const now = Date.now();
  // 만료 정리
  const fresh = list.filter(n => n.expiresAt > now);
  if (fresh.length !== list.length) notices.set(classroomCode, fresh);
  return fresh.filter(n => n.target === 'classroom' || (n.target === 'room' && n.roomCode === studentRoomCode))
              .map(n => ({ id: n.id, text: n.text, target: n.target, roomCode: n.roomCode, expiresAt: n.expiresAt }));
}

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
    easy: ['intS','intM','decS','decS2','intTZ1','decT0','int2'],
    medium: ['intTZ','decLZ','decTZ','decMix','decMZ','intMid','decZmix','int3TZ'],
    hard: ['longDecLZ','longDecTZ','longIntTZ','longMix','deepLZ','decMultiZ','hugeInt','longDeep','complexMix'],
  };
  const list = tpls[d] || tpls.medium;
  const t = list[rnd(0, list.length - 1)];
  switch (t) {
    case 'intS':   return nz() + (Math.random()<0.5 ? '' : dig());
    case 'int2':   return nz() + dig();
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
expandPool('easy', 3500);
expandPool('medium', 5000);
expandPool('hard', 7500);
console.log(`[문제풀] 쉬움 ${pools.easy.length} · 보통 ${pools.medium.length} · 어려움 ${pools.hard.length} · 합계 ${pools.easy.length+pools.medium.length+pools.hard.length}개`);

function randNum(d) {
  if (d === 'mixed') d = ['easy','medium','hard'][Math.floor(Math.random()*3)];
  // 70% 확장된 풀, 30% 즉석 절차생성 → 중복이 거의 없으면서도 신선함 유지
  if (Math.random() < 0.7) {
    const p = pools[d]; return p[Math.floor(Math.random()*p.length)];
  }
  return genNumberStr(d);
}
// 지수 위첨자 변환 (과학적 표기법용)
const SUP = {'-':'⁻','0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹'};
function toSup(n) { return String(n).split('').map(c => SUP[c] || c).join(''); }
// 과학적 표기법 생성 — 하드 난이도 전용. 가수(mantissa)의 유효숫자 수가 정답.
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

// ==================== 단계형 힌트 (F9) ====================
// 1단계 규칙 → 2단계 이 문제에 맞는 부분 단서 → 3단계 정답. 단계마다 HINT_COST 차감.
const HINT_COST = 20;
const HINT_MAX = 3;
const HINT_RULE = '0이 아닌 숫자는 항상 유효해요. 앞쪽 0은 무효, 뒤쪽 0은 소수점이 있을 때만 유효합니다.';

// 이 수에만 해당하는 단서를 조합한다 (정답 개수는 말하지 않는다)
function numberClue(num) {
  const s = String(num);
  const a = analyze(s);
  const nd = a.digs.filter(d => !d.pt);
  const hasDot = s.includes('.');
  let fNZ = -1, lNZ = -1;
  for (let i = 0; i < nd.length; i++) if (nd[i].c !== '0') { if (fNZ < 0) fNZ = i; lNZ = i; }
  const parts = [];
  if (fNZ < 0) return '0만 있는 수예요. 자리를 나타내는 0은 유효숫자로 세지 않아요.';
  if (fNZ > 0) parts.push(`앞의 0 ${fNZ}개는 세지 않아요`);
  let mid = 0;
  for (let i = fNZ + 1; i < lNZ; i++) if (nd[i].c === '0') mid++;
  if (mid > 0) parts.push('숫자 사이의 0은 유효해요');
  const trailing = nd.length - 1 - lNZ;
  if (trailing > 0) {
    parts.push(hasDot ? `소수점이 있으니 뒤의 0 ${trailing}개도 세요` : `소수점이 없으니 뒤의 0 ${trailing}개는 빼세요`);
  }
  if (parts.length === 0) return '0이 하나도 없으니 보이는 숫자를 그대로 세면 돼요.';
  return parts.join(' · ') + '.';
}
// gm2 — 유효숫자가 몇 번째 자리부터 몇 번째 자리까지인지 (소수점은 세지 않고 왼쪽부터)
function sigRangeClue(q) {
  const digs = Array.isArray(q.digs) && q.digs.length ? q.digs : analyze(q.num).digs;
  const nd = digs.filter(d => !d.pt);
  let first = -1, last = -1;
  for (let i = 0; i < nd.length; i++) if (nd[i].sig) { if (first < 0) first = i; last = i; }
  if (first < 0) return '유효숫자로 셀 자리가 없어요.';
  return `처음 유효숫자는 ${first + 1}번째 자리부터, 마지막은 ${last + 1}번째 자리까지예요. (소수점은 빼고 왼쪽부터 셉니다)`;
}
// gm3 — 최소눈금 단위로 내림·올림한 구간
function measRangeClue(m) {
  const step = m.type === 'ruler' ? 0.1 : 1;
  const dp = m.type === 'ruler' ? 1 : 0;
  const lo = (Math.floor(m.val / step) * step).toFixed(dp);
  const hi = (Math.ceil(m.val / step) * step).toFixed(dp);
  const scale = m.type === 'ruler' ? '최소눈금 0.1cm' : m.type === 'cylinder' ? '최소눈금 1mL' : '최소눈금 1°C';
  const span = lo === hi ? `측정값은 눈금 ${lo} ${m.unit}에 거의 정확히 맞아요` : `측정값은 ${lo} ~ ${hi} ${m.unit} 사이예요`;
  return `${scale} 기준으로 ${span}. 그 사이를 눈으로 어림해 한 자리를 더 적고, 적은 숫자를 모두 세면 유효숫자 개수예요.`;
}
// 모드별 3단계 힌트 — 정답은 3단계에서만 나온다
function buildHint(q, stage) {
  if (!q) return '';
  const st = Math.max(1, Math.min(HINT_MAX, parseInt(stage) || 1));
  if (q.gameMode === 1) {
    if (q.scientific) {
      if (st === 1) return '과학적 표기법이에요. ×10ⁿ 앞의 가수(앞부분)만 세면 돼요.';
      if (st === 2) return '가수의 숫자 자릿수를 세어 보세요. 10의 거듭제곱은 크기만 나타내므로 세지 않아요.';
      return `유효숫자 ${q.count}개예요.`;
    }
    if (st === 1) return HINT_RULE;
    if (st === 2) return numberClue(q.num);
    return `유효숫자 ${q.count}개예요.`;
  }
  if (q.gameMode === 2) {
    if (st === 1) return HINT_RULE;
    if (st === 2) return `유효숫자는 총 ${q.count}개예요.`;
    return sigRangeClue(q);
  }
  if (q.gameMode === 3) {
    if (st === 1) return '측정값은 최소눈금까지 정확히 읽고, 그 아래로 한 자리를 더 어림해서 읽어요.';
    if (st === 2) return measRangeClue(q.meas);
    return `측정값 ${q.meas.dv} ${q.meas.unit}, 유효숫자 ${q.meas.sf}개예요.`;
  }
  if (q.gameMode === 4) {
    if (q.kind === 'plain') {
      if (st === 1) return '덧셈·뺄셈의 결과는 소수점 아래 자릿수가 가장 적은 수에 맞춰 반올림해요.';
      if (st === 2) {
        // dpA/dpB 는 원본 문제에만 있다 (오답 복습으로 복원된 문제에는 없을 수 있음)
        if (typeof q.dpA === 'number' && typeof q.dpB === 'number') {
          return `앞의 수는 소수 ${q.dpA}자리, 뒤의 수는 소수 ${q.dpB}자리예요 → 답은 소수 ${q.dpResult}자리로 반올림합니다.`;
        }
        return `두 수의 소수 자릿수를 비교해 보세요 → 답은 소수 ${q.dpResult}자리로 반올림합니다.`;
      }
      return `정답은 ${q.answer}예요.`;
    }
    if (st === 1) return '과학적 표기법의 덧셈·뺄셈은 두 수의 지수를 먼저 같게 맞춘 뒤 가수끼리 계산해요.';
    if (st === 2) return `두 수의 지수를 10^${q.targetExp} 에 맞춘 뒤, 가수는 소수 ${q.mantDP}자리까지 남기면 돼요.`;
    return `정답은 ${q.answer}예요.`;
  }
  return '';
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
      gameMode: [1,2,3,4].includes(parseInt(config.gameMode)) ? parseInt(config.gameMode) : 1,
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
    p.hint = null;        // 단계형 힌트 상태 { qIdx, stage }
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
    answered: false, lastAnswer: null, hint: null, joinedAt: Date.now(),
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
    pendingSince.delete(room.code);
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
    let name = String(body.name || '').trim().slice(0, 12);
    if (!classroomCode) return sendJSON(res, { error: '교실 코드가 필요해요. 선생님께 문의하세요.' }, 400);
    if (!clsroom(classroomCode)) return sendJSON(res, { error: '존재하지 않는 교실 코드예요.' }, 404);
    // 교실 잠금 — 이미 로그인된 세션은 그대로, 신규 로그인만 차단
    if (clsCfg(classroomCode).locked) {
      const sKey0 = studentSessKey(classroomCode, String(studentId || '').trim().slice(0, 10));
      if (!students.has(sKey0)) return sendJSON(res, { error: '🔒 지금은 교실이 잠겨 있어요. 선생님께 확인하세요.' }, 403);
    }
    if (!studentId || !name) return sendJSON(res, { error: '학번과 이름을 입력하세요.' }, 400);
    if (!/^[0-9A-Za-z]+$/.test(studentId)) return sendJSON(res, { error: '학번은 숫자/영문만 가능' }, 400);
    const sdb = clsStudents(classroomCode);
    const rec = sdb[studentId];
    // 명단 등록 학생만 입장 (rosterOnly) — CSV 로 등록된 학번·이름이 정확히 일치할 때만 통과
    // OFF 일 때는 기존 동작(누구나 입장 + 이름 최신 로그인으로 갱신)을 그대로 유지한다.
    if (clsCfg(classroomCode).rosterOnly) {
      if (!rec || !rec.preregistered) return sendJSON(res, { error: '명단에 없는 학번이에요. 선생님께 확인하세요.' }, 403);
      if (normName(rec.name) !== normName(name)) return sendJSON(res, { error: '학번과 이름이 명단과 달라요.' }, 403);
      name = rec.name;   // 명단의 이름을 정본으로 사용 → registerOrTouchStudent 의 이름 덮어쓰기가 no-op 이 된다
    }
    // 차단 확인 (교실별)
    if (rec && rec.blocked) return sendJSON(res, { error: '차단된 학생입니다. 교사에게 문의하세요.' }, 403);
    // 기존 세션이 있으면 토큰 갱신
    const sKey = studentSessKey(classroomCode, studentId);
    let sess = students.get(sKey);
    if (sess && sess.token) studentTokens.delete(sess.token);
    const token = tok();
    sess = { classroomCode, studentId, name, token, lastSeen: Date.now(), currentRoom: sess?.currentRoom || null };
    students.set(sKey, sess);
    studentTokens.set(token, { classroomCode, studentId });
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
    return sendJSON(res, {
      classroomCode: s.classroomCode, studentId: s.studentId, name: s.name, currentRoom: s.currentRoom,
      notices: activeNoticesFor(s.classroomCode, s.currentRoom),
    });
  }
  // 학생 프로필 조회 (본인만) — 레벨/칭호/아바타/연속출석/퀘스트/오답/업적
  if (method === 'GET' && pathname === '/api/student/profile') {
    const s = authStudent(req);
    if (!s) return sendJSON(res, { error: '로그인 필요' }, 401);
    const sdb = clsStudents(s.classroomCode);
    const rec = sdb[s.studentId];
    if (!rec) return sendJSON(res, { error: '학생 레코드 없음' }, 404);
    rec.profile = ensureProfileShape(rec.profile);
    rec.stats = ensureStatsShape(rec.stats);
    // 활성 퀘스트 — 오늘/평생 상태
    const today = todayKey();
    const activeQuests = [];
    for (const [id, def] of Object.entries(QUEST_DEFS)) {
      const dayKey = (id === 'all-modes' || id === 'battle-win-3') ? 'lifetime' : today;
      const k = dayKey + '/' + id;
      const q = rec.profile.quests[k] || { progress: 0 };
      activeQuests.push({ id, name: def.name, target: def.target, progress: q.progress || 0, completed: !!q.completedAt, reward: def.reward });
    }
    const titles = TITLE_DEFS.map(t => ({ id: t.id, name: t.name, owned: (rec.profile.titlesOwned || []).includes(t.id) }));
    return sendJSON(res, {
      level: rec.profile.level, exp: rec.profile.exp, expNext: expForLevel(rec.profile.level),
      title: rec.profile.title || '', titlesOwned: rec.profile.titlesOwned || [], titles,
      avatar: rec.profile.avatar || '🙂', avatarsOwned: rec.profile.avatarsOwned || ['🙂'],
      dailyStreak: rec.profile.dailyStreak || 0,
      achievements: rec.profile.achievements || [],
      quests: activeQuests,
      wrongBank: rec.profile.wrongBank || [],
    });
  }
  // 프로필 변경 (칭호/아바타 선택) — 보유한 것만 적용
  if (method === 'POST' && pathname === '/api/student/profile') {
    const s = authStudent(req);
    if (!s) return sendJSON(res, { error: '로그인 필요' }, 401);
    const sdb = clsStudents(s.classroomCode);
    const rec = sdb[s.studentId];
    if (!rec) return sendJSON(res, { error: '학생 레코드 없음' }, 404);
    rec.profile = ensureProfileShape(rec.profile);
    const body = await readBody(req);
    if (typeof body.title === 'string') {
      if (body.title === '' || (rec.profile.titlesOwned || []).includes(body.title)) rec.profile.title = body.title;
    }
    if (typeof body.avatar === 'string' && body.avatar.length <= 4) {
      const owned = rec.profile.avatarsOwned || ['🙂'];
      if (owned.includes(body.avatar)) rec.profile.avatar = body.avatar;
    }
    saveStudentsDb();
    return sendJSON(res, { ok: true, title: rec.profile.title, avatar: rec.profile.avatar });
  }
  // 아바타 해금 — 레벨 조건 달성 시 획득
  if (method === 'POST' && pathname === '/api/student/unlock-avatar') {
    const s = authStudent(req);
    if (!s) return sendJSON(res, { error: '로그인 필요' }, 401);
    const sdb = clsStudents(s.classroomCode);
    const rec = sdb[s.studentId];
    if (!rec) return sendJSON(res, { error: '학생 레코드 없음' }, 404);
    rec.profile = ensureProfileShape(rec.profile);
    const body = await readBody(req);
    const emoji = String(body.avatar || '').slice(0, 4);
    const AVATAR_UNLOCKS = [
      { avatar: '🙂', level: 1 }, { avatar: '😎', level: 2 }, { avatar: '🤓', level: 3 }, { avatar: '🧠', level: 5 },
      { avatar: '🔬', level: 7 }, { avatar: '⚡', level: 10 }, { avatar: '🦸', level: 15 }, { avatar: '🎯', level: 20 },
      { avatar: '🏆', level: 30 }, { avatar: '👑', level: 50 },
    ];
    const def = AVATAR_UNLOCKS.find(a => a.avatar === emoji);
    if (!def) return sendJSON(res, { error: '알 수 없는 아바타' }, 400);
    if ((rec.profile.level || 1) < def.level) return sendJSON(res, { error: `레벨 ${def.level} 이상 필요` }, 403);
    const owned = rec.profile.avatarsOwned || ['🙂'];
    if (!owned.includes(emoji)) owned.push(emoji);
    rec.profile.avatarsOwned = owned;
    saveStudentsDb();
    return sendJSON(res, { ok: true, avatarsOwned: owned });
  }
  // 아바타 해금 목록 조회
  if (method === 'GET' && pathname === '/api/student/avatars') {
    return sendJSON(res, { unlocks: [
      { avatar: '🙂', level: 1 }, { avatar: '😎', level: 2 }, { avatar: '🤓', level: 3 }, { avatar: '🧠', level: 5 },
      { avatar: '🔬', level: 7 }, { avatar: '⚡', level: 10 }, { avatar: '🦸', level: 15 }, { avatar: '🎯', level: 20 },
      { avatar: '🏆', level: 30 }, { avatar: '👑', level: 50 },
    ]});
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
    // 교실 잠금 — 학생의 신규 방 생성 차단 (교사는 허용)
    if (!teacherCls && cCfg.locked) return sendJSON(res, { error: '🔒 교실 잠김 — 새 방을 만들 수 없습니다.' }, 403);
    const autoApprove = !!teacherCls || !!cCfg.autoApproveRooms;
    const room = createRoom(classroomCode, type, body.config || {}, s, autoApprove);
    if (!room.approved) pendingSince.set(room.code, Date.now());
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
    const view = roomView(room, forTeacher, viewerS?.studentId);
    // 공지 피기백 — 학생이 방 화면에서도 토스트로 볼 수 있도록
    if (viewerS) view.notices = activeNoticesFor(viewerS.classroomCode, viewerS.currentRoom);
    return sendJSON(res, view);
  }

  // ---------- 종료 후 오답 해설 재열람 ----------
  // 이번 판에서 내가 틀린 문제만 돌려준다. 문제 객체는 이미 정답이 공개된 뷰(wrongHistory)라
  // 서버에서 추가로 계산할 것이 없다. 멀티는 본인이 done 일 때만 — 아직 안 푼 문제가 새지 않도록.
  if (method === 'GET' && pathname === '/api/room/review') {
    const s = authStudent(req);
    if (!s) return sendJSON(res, { error: '로그인 필요' }, 401);
    const room = rooms.get(String(query.code || ''));
    if (!room) return sendJSON(res, { error: '방 없음' }, 404);
    const p = Object.values(room.players).find(x => x.studentId === s.studentId);
    if (!p) return sendJSON(res, { error: '참여자 아님' }, 400);
    const done = room.phase === 'results' || (room.type === 'multi' && p.pPhase === 'done');
    if (!done) return sendJSON(res, { error: '게임이 끝난 뒤에 볼 수 있어요.' }, 400);
    const total = room.type === 'multi' ? (p.correct + p.wrong) : room.questions.length;
    return sendJSON(res, { items: p.wrongHistory || [], total, correct: p.correct || 0 });
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
    let c = clsroom(code);
    if (!c) {
      // 새 교실 생성 (claim)
      c = classrooms[code] = {
        code, name: name || code,
        passwordHash: hashPw(pw), createdAt: Date.now(),
        config: { autoApproveRooms: false, sheetsUrl: '', locked: false, presets: [], journal: [] },
      };
      saveClassrooms();
    } else {
      // 비밀번호 확인
      if (c.passwordHash !== hashPw(pw)) return sendJSON(res, { error: '비밀번호 오류' }, 401);
    }
    const t = tok(); teacherTokens.set(t, code);
    return sendJSON(res, { token: t, classroomCode: code, name: c.name, created: !c.passwordHash ? false : undefined });
  }
  if (method === 'POST' && pathname === '/api/teacher/logout') {
    teacherTokens.delete(getAuth(req));
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
  // 교실 잠금 조회/토글 — 시험·평가 중 신규 로그인·방 생성 차단 (현 세션은 유지)
  if (method === 'GET' && pathname === '/api/teacher/classroom/lock') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    return sendJSON(res, { locked: !!clsCfg(cls).locked });
  }
  if (method === 'POST' && pathname === '/api/teacher/classroom/lock') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const body = await readBody(req);
    const c = clsCfg(cls);
    c.locked = !!body.locked;
    saveClassrooms();
    maybePushSheets(cls, 'classroom_lock', { locked: c.locked, at: Date.now() });
    return sendJSON(res, { ok: true, locked: c.locked });
  }
  // 명단 학생만 입장 조회/토글 — 켜면 CSV 로 등록된 학번·이름이 일치해야 로그인 가능 (현 세션은 유지)
  if (method === 'GET' && pathname === '/api/teacher/classroom/roster-only') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    return sendJSON(res, {
      rosterOnly: !!clsCfg(cls).rosterOnly,
      preregisteredCount: countPreregistered(cls),
    });
  }
  if (method === 'POST' && pathname === '/api/teacher/classroom/roster-only') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const body = await readBody(req);
    const c = clsCfg(cls);
    c.rosterOnly = !!body.rosterOnly;
    saveClassrooms();
    maybePushSheets(cls, 'classroom_roster_only', { rosterOnly: c.rosterOnly, at: Date.now() });
    return sendJSON(res, { ok: true, rosterOnly: c.rosterOnly, preregisteredCount: countPreregistered(cls) });
  }
  // 기존 학생을 명단 학생으로 표시/해제 — CSV 를 쓰지 않은 교사가 토글을 켰다가 전원이 막히는 상황 방지
  // body: { studentIds?: string[], all?: true, value: boolean }
  if (method === 'POST' && pathname === '/api/teacher/students/preregister') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const body = await readBody(req);
    const value = !!body.value;
    const sdb = clsStudents(cls);
    const ids = body.all === true
      ? Object.keys(sdb)
      : (Array.isArray(body.studentIds) ? body.studentIds.map(String) : []);
    if (!ids.length) return sendJSON(res, { error: '대상 학생이 없습니다' }, 400);
    let changed = 0;
    for (const sid of ids) {
      const rec = sdb[sid];
      if (!rec) continue;
      if (!!rec.preregistered === value) continue;
      rec.preregistered = value;
      changed++;
    }
    if (changed) saveStudentsDb();
    return sendJSON(res, { ok: true, changed, preregisteredCount: countPreregistered(cls) });
  }
  // 방 프리셋(템플릿) — 자주 쓰는 방 설정을 저장/불러오기
  if (method === 'GET' && pathname === '/api/teacher/presets') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    return sendJSON(res, { presets: clsCfg(cls).presets || [] });
  }
  if (method === 'POST' && pathname === '/api/teacher/presets') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const body = await readBody(req);
    const cfg = clsCfg(cls);
    if (!Array.isArray(cfg.presets)) cfg.presets = [];
    if (body.delete && body.id) {
      cfg.presets = cfg.presets.filter(p => p.id !== body.id);
      saveClassrooms();
      return sendJSON(res, { ok: true, presets: cfg.presets });
    }
    const name = String(body.name || '').trim().slice(0, 30);
    const type = ['single','multi','battle'].includes(body.type) ? body.type : 'multi';
    const config = body.config || {};
    if (!name) return sendJSON(res, { error: '프리셋 이름이 필요합니다' }, 400);
    if (cfg.presets.length >= 30) return sendJSON(res, { error: '프리셋은 최대 30개까지 저장할 수 있습니다' }, 400);
    const preset = { id: crypto.randomBytes(6).toString('hex'), name, type, config, createdAt: Date.now() };
    cfg.presets.push(preset);
    saveClassrooms();
    return sendJSON(res, { ok: true, preset, presets: cfg.presets });
  }
  // 월간 MVP — 이번 달 총점 1위 학생 (F6)
  if (method === 'GET' && pathname === '/api/teacher/monthly-mvp') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const totals = {};
    for (const t of ['single','multi','battle']) {
      for (const e of (leaderboards[t] || [])) {
        if ((e.classroomCode || DEFAULT_CLASSROOM) !== cls) continue;
        if ((e.at || 0) < monthStart) continue;
        const k = e.studentId;
        if (!totals[k]) totals[k] = { studentId: k, name: e.name, score: 0, games: 0 };
        totals[k].score += e.score || 0;
        totals[k].games += 1;
      }
    }
    const sorted = Object.values(totals).sort((a,b) => b.score - a.score).slice(0, 10);
    return sendJSON(res, { month: now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0'), ranking: sorted });
  }
  // 수업 요약 리포트 (U15) — 오늘 교실 전체 통계
  if (method === 'GET' && pathname === '/api/teacher/session/summary') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const today = todayKey();
    const adb = clsAttendance(cls)[today] || {};
    const atCount = Object.keys(adb).length;
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const ts = todayStart.getTime();
    const byType = { single:[], multi:[], battle:[] };
    for (const t of ['single','multi','battle']) {
      for (const e of (leaderboards[t] || [])) {
        if ((e.classroomCode || DEFAULT_CLASSROOM) !== cls) continue;
        if ((e.at || 0) < ts) continue;
        byType[t].push(e);
      }
    }
    const allEntries = [...byType.single, ...byType.multi, ...byType.battle];
    const avgScore = allEntries.length ? Math.round(allEntries.reduce((a,e) => a + (e.score||0), 0) / allEntries.length) : 0;
    const totalCorrect = allEntries.reduce((a,e) => a + (e.correct||0), 0);
    const totalTotal = allEntries.reduce((a,e) => a + (e.total||0), 0);
    const accuracy = totalTotal > 0 ? Math.round(totalCorrect/totalTotal*100) : 0;
    const topScorers = allEntries.slice().sort((a,b) => b.score - a.score).slice(0, 5);
    return sendJSON(res, {
      date: today, attendance: atCount,
      games: { single: byType.single.length, multi: byType.multi.length, battle: byType.battle.length, total: allEntries.length },
      avgScore, accuracy, topScorers,
    });
  }
  // 이상 패턴 감지 (U17) — 같은 답만 반복 제출한 학생
  if (method === 'GET' && pathname === '/api/teacher/anomaly') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const flagged = [];
    for (const r of rooms.values()) {
      if (r.classroomCode !== cls) continue;
      for (const p of Object.values(r.players)) {
        const hist = p.wrongHistory || [];
        if (hist.length < 5) continue;
        // 같은 답만 5회 이상 제출 → 플래그
        const answers = hist.map(h => JSON.stringify(h.submitted));
        const uniq = new Set(answers);
        if (uniq.size === 1 && answers.length >= 5) {
          flagged.push({ studentId: p.studentId, name: p.name, reason: '동일 답안 5회 이상 반복', roomCode: r.code });
        }
      }
    }
    return sendJSON(res, { flagged });
  }
  // CSV로 학생 일괄 등록 (U7)
  if (method === 'POST' && pathname === '/api/teacher/students/import') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const body = await readBody(req);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const sdb = clsStudents(cls);
    let added = 0;
    for (const r of rows) {
      const sid = String(r.studentId || '').trim().slice(0, 10);
      const name = String(r.name || '').trim().slice(0, 12);
      if (!sid || !name) continue;
      if (!/^[0-9A-Za-z]+$/.test(sid)) continue;
      if (!sdb[sid]) {
        sdb[sid] = { studentId: sid, name, joinedAt: Date.now(), stats: emptyStats(), profile: emptyProfile(), blocked: false, preregistered: true };
        added++;
      } else {
        sdb[sid].name = name;
        sdb[sid].preregistered = true;
      }
    }
    saveStudentsDb();
    return sendJSON(res, { ok: true, added, total: Object.keys(sdb).length });
  }
  // 힌트 요청 (F9) — 단계형(규칙 → 부분 단서 → 정답). 단계마다 점수 -20 차감, 문제당 최대 3단계.
  if (method === 'POST' && pathname === '/api/hint') {
    const s = authStudent(req);
    if (!s) return sendJSON(res, { error: '로그인 필요' }, 401);
    const body = await readBody(req);
    const room = rooms.get(body.code || s.currentRoom);
    if (!room) return sendJSON(res, { error: '방 없음' }, 404);
    if (room.phase !== 'question') return sendJSON(res, { error: '현재 힌트 불가' }, 400);
    const p = Object.values(room.players).find(x => x.studentId === s.studentId);
    if (!p) return sendJSON(res, { error: '참여자 아님' }, 400);
    const isMulti = room.type === 'multi';
    const q = isMulti ? p.pQuestions[p.pIdx] : room.questions[room.qIndex];
    if (!q) return sendJSON(res, { error: '문제 없음' }, 400);
    // 멀티는 플레이어별 스트림 — 내 차례가 문제 풀이 중일 때만
    if (isMulti && p.pPhase !== 'question') return sendJSON(res, { error: '지금은 힌트를 볼 수 없어요.' }, 400);
    // 제출 후에는 차감되지 않도록 (비멀티)
    if (!isMulti && p.answered) return sendJSON(res, { error: '이미 제출했어요.' }, 400);
    // 문제가 바뀌면 단계 리셋 — 멀티는 개인 인덱스 기준
    const curIdx = isMulti ? p.pIdx : room.qIndex;
    if (!p.hint || p.hint.qIdx !== curIdx) p.hint = { qIdx: curIdx, stage: 0 };
    if (p.hint.stage >= HINT_MAX) return sendJSON(res, { error: '이 문제의 힌트는 모두 봤어요.' }, 400);
    p.hint.stage += 1;
    p.score = Math.max(0, p.score - HINT_COST);
    // 누적 힌트 사용 기록
    const sdb = clsStudents(s.classroomCode);
    if (sdb[s.studentId]) {
      sdb[s.studentId].profile = ensureProfileShape(sdb[s.studentId].profile);
      sdb[s.studentId].profile.hintsUsed = (sdb[s.studentId].profile.hintsUsed || 0) + 1;
      saveStudentsDb();
    }
    const hint = buildHint(q, p.hint.stage);
    return sendJSON(res, { ok: true, hint, stage: p.hint.stage, maxStage: HINT_MAX, newScore: p.score });
  }

  // 교사 공지 브로드캐스트 — 전체 교실 또는 특정 방에 토스트 전달 (TTL 기반 메모리 저장)
  if (method === 'POST' && pathname === '/api/teacher/broadcast') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const body = await readBody(req);
    const text = String(body.text || '').trim().slice(0, 200);
    if (!text) return sendJSON(res, { error: '공지 내용을 입력하세요' }, 400);
    const target = body.target === 'room' ? 'room' : 'classroom';
    const roomCode = target === 'room' ? String(body.roomCode || '').trim() : null;
    if (target === 'room') {
      const r = rooms.get(roomCode);
      if (!r || r.classroomCode !== cls) return sendJSON(res, { error: '대상 방을 찾을 수 없습니다' }, 404);
    }
    const ttlMs = Math.max(2000, Math.min(5 * 60 * 1000, parseInt(body.ttlMs) || 10000));
    const notice = {
      id: crypto.randomBytes(6).toString('hex'),
      target, roomCode, text,
      createdAt: Date.now(), expiresAt: Date.now() + ttlMs,
    };
    const list = notices.get(cls) || [];
    list.push(notice);
    notices.set(cls, list);
    maybePushSheets(cls, 'broadcast', { target, roomCode, text, at: Date.now() });
    return sendJSON(res, { ok: true, notice });
  }
  if (method === 'GET' && pathname === '/api/teacher/overview') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const now = Date.now();
    const cfg = clsCfg(cls);
    const sdb = clsStudents(cls);
    // 온라인 학생 — 방 진행 상태까지 보강 (B3)
    const studentList = [...students.values()].filter(s => s.classroomCode === cls).map(s => {
      const roomInfo = s.currentRoom ? rooms.get(s.currentRoom) : null;
      let locationPhase = null, locationQ = null;
      if (roomInfo) {
        locationPhase = roomInfo.phase;
        if (roomInfo.phase === 'question' || roomInfo.phase === 'reveal') {
          locationQ = `${(roomInfo.qIndex||0)+1}/${roomInfo.questions.length||roomInfo.config.questionCount}`;
        }
      }
      return {
        studentId: s.studentId, name: s.name,
        lastSeen: s.lastSeen, online: now - s.lastSeen < 10000,
        currentRoom: s.currentRoom,
        locationPhase, locationQ,
      };
    });
    const roomList = [...rooms.values()].filter(r => r.classroomCode === cls).map(r => {
      const playerCount = Object.keys(r.players).length;
      // 설정 요약 문자열 (A2) — 대기 카드에서 한눈에 보이도록
      const gmMap = { 1:'개수', 2:'찾기', 3:'측정', 4:'덧뺄' };
      const diffMap = { easy:'쉬움', medium:'보통', hard:'어려움', mixed:'혼합' };
      const configSummary = `${gmMap[r.config.gameMode]||'게임'} · ${diffMap[r.config.difficulty]||''} · ${r.config.questionCount}문제 · ${r.config.questionTime}초/문`;
      return {
        code: r.code, type: r.type, phase: r.phase,
        approved: r.approved,
        label: r.config.label, gameMode: r.config.gameMode,
        difficulty: r.config.difficulty, questionCount: r.config.questionCount,
        questionTime: r.config.questionTime, revealTime: r.config.revealTime,
        capacity: r.config.capacity,
        qIndex: r.qIndex, total: r.questions.length,
        playerCount,
        ownerId: r.ownerId,
        ownerName: (Object.values(r.players).find(p => p.studentId === r.ownerId) || {}).name || '',
        // A4: 인라인 펼치기용 상세 플레이어 (score/correct/wrong/maxStreak/hp/eliminated/pIdx)
        players: Object.values(r.players).map(p => ({
          studentId: p.studentId, name: p.name,
          score: p.score, correct: p.correct, wrong: p.wrong,
          maxStreak: p.maxStreak || 0,
          hp: p.hp || 0, eliminated: !!p.eliminated,
          team: p.team || 0,
          pIdx: p.pIdx,  // 멀티 — 개인 진행 번호
        })),
        // A2·D4: 대기 시작 시각 → 경과 시간 표시용
        pendingSince: !r.approved ? (pendingSince.get(r.code) || r.createdAt) : null,
        configSummary,
        // A4: 전체 config 복제 기능에 활용
        fullConfig: r.config,
        createdAt: r.createdAt,
      };
    });
    // 점수판 숫자 — 본인 교실 기록만 카운트
    const myCount = t => (leaderboards[t] || []).filter(e => (e.classroomCode || DEFAULT_CLASSROOM) === cls).length;
    // B2: 오늘 출석 — present(오늘 온 학생 중 현재도 접속) / late(오늘 왔지만 현재 오프) / absent(DB에는 있지만 오늘 흔적 無)
    const today = todayKey();
    const todayAttend = (clsAttendance(cls) || {})[today] || {};
    const onlineSet = new Set(studentList.filter(s => s.online).map(s => s.studentId));
    const todaySids = Object.keys(todayAttend);
    const present = [], late = [], absent = [];
    for (const sid of Object.keys(sdb)) {
      if (sdb[sid].blocked) continue;
      if (todaySids.includes(sid)) {
        if (onlineSet.has(sid)) present.push({ studentId: sid, name: sdb[sid].name, firstSeen: todayAttend[sid].firstSeen, games: todayAttend[sid].games||0 });
        else late.push({ studentId: sid, name: sdb[sid].name, firstSeen: todayAttend[sid].firstSeen, lastSeen: todayAttend[sid].lastSeen, games: todayAttend[sid].games||0 });
      } else {
        absent.push({ studentId: sid, name: sdb[sid].name });
      }
    }
    return sendJSON(res, {
      classroomCode: cls, classroomName: classrooms[cls].name,
      students: studentList, rooms: roomList,
      leaderboards: {
        single: myCount('single'),
        multi: myCount('multi'),
        battle: myCount('battle'),
      },
      classroom: {
        locked: !!cfg.locked, autoApprove: !!cfg.autoApproveRooms,
        rosterOnly: !!cfg.rosterOnly, preregisteredCount: countPreregistered(cls),
      },
      todayAttendance: { date: today, present, late, absent },
    });
  }
  if (method === 'POST' && pathname === '/api/teacher/room/approve') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const body = await readBody(req);
    const room = rooms.get(body.code);
    if (!room || room.classroomCode !== cls) return sendJSON(res, { error: '방 없음' }, 404);
    room.approved = body.approved !== false;
    if (room.approved) pendingSince.delete(room.code);
    if (room.approved && room.type === 'single' && room.phase === 'lobby' && Object.keys(room.players).length > 0) {
      startRoom(room);
    }
    return sendJSON(res, { ok: true, approved: room.approved });
  }
  // 일괄 승인/거부/삭제 — 수업 중 빠른 대응용
  // body: { action: 'approve'|'reject', codes?: string[], filterType?: 'single'|'multi'|'battle' }
  if (method === 'POST' && pathname === '/api/teacher/room/approve-bulk') {
    const cls = teacherClassroom(req);
    if (!cls) return sendJSON(res, { error: '교사 권한' }, 401);
    const body = await readBody(req);
    const action = body.action === 'reject' ? 'reject' : 'approve';
    const codes = Array.isArray(body.codes) ? body.codes.map(String) : null;
    const filterType = ['single','multi','battle'].includes(body.filterType) ? body.filterType : null;
    let affected = 0;
    for (const room of rooms.values()) {
      if (room.classroomCode !== cls) continue;
      if (codes && !codes.includes(room.code)) continue;
      if (filterType && room.type !== filterType) continue;
      if (room.approved && action === 'approve') continue;  // 이미 승인
      if (!codes && room.approved && action === 'reject') continue;  // 필터만으로는 기승인 방을 건드리지 않음
      if (action === 'approve') {
        room.approved = true;
        pendingSince.delete(room.code);
        if (room.type === 'single' && room.phase === 'lobby' && Object.keys(room.players).length > 0) startRoom(room);
        affected++;
      } else {
        // reject — 대기방은 삭제, 진행 중은 보존 (의도치 않은 중단 방지)
        if (!room.approved) {
          if (room.phaseTimer) clearTimeout(room.phaseTimer);
          if (room.multiTick) { clearInterval(room.multiTick); room.multiTick = null; }
          Object.values(room.players).forEach(p => {
            const s = students.get(studentSessKey(cls, p.studentId));
            if (s) s.currentRoom = null;
          });
          rooms.delete(room.code);
          pendingSince.delete(room.code);
          affected++;
        }
      }
    }
    return sendJSON(res, { ok: true, action, affected });
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
      pendingSince.delete(body.code);
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

  sendJSON(res, { error: 'unknown api' }, 404);
}

// ==================== 정적 파일 ====================
const mimes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
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
    if (now - s.lastSeen > 1000 * 60 * 30) {  // 30분 무반응
      if (s.currentRoom) { const r = rooms.get(s.currentRoom); if (r) leaveRoom(r, s); }
      studentTokens.delete(s.token);
      students.delete(sid);
    }
  }
  for (const [code, room] of rooms) {
    if (Object.keys(room.players).length === 0 && now - room.updatedAt > 1000 * 20) {
      if (room.phaseTimer) clearTimeout(room.phaseTimer);
      rooms.delete(code);
      pendingSince.delete(code);
    }
  }
}, 1000 * 5);

// 클라우드 배포 시 0.0.0.0 에 바인딩 — 모든 인터페이스에서 수신
const HOST = process.env.HOST || '0.0.0.0';
// require('./server.js') 로 불러올 때(테스트)는 포트를 잡지 않는다. 직접 실행하면 기존과 동일.
if (require.main === module) server.listen(PORT, HOST, () => {
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

// ==================== 테스트용 export ====================
// node test.js 에서 순수 함수만 가져다 쓰기 위한 통로. 직접 실행 시 동작에는 영향이 없다.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    scheduleSave, flushAllSync, normName, normCode,
    analyze, makeQuestion, viewQuestion, judge, buildHint, HINT_MAX,
  };
}
