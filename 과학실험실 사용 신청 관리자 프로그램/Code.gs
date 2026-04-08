/****************************************************
 * 관리자 페이지 전용 웹앱 배포용 Google Apps Script (FULL, fixed)
 * - 요청 사항 반영:
 *   1) 제한 만료 정리 강건화(문자열/타임존 안전 파싱 + 자정 기준 비교)
 *   2) 만료 자동 정리 일일 트리거 제공(setupDailyRestrictionMaintenance)
 *   3) 기존 기능·헤더·시트 구조 유지
 *   4) ✅ (수정) 버그 수정 및 신규 기능 추가
 ****************************************************/

// ===== 스프레드시트 ID들 =====
const MAIN_SSID         = '1LzQvFUj0NH69DDyrh7Vxk8bYXQzMdl-oQkZpAUm1uIE';
const CHEM_RECORD_SSID  = '1IwVM6k4etSs-vSXFqp-3GrUJuzVhIgoBErzgMQd2GOs';
// const CHEM_MASTER_SSID  = '1JYk8o0-wCoqA1TURrSDBkhVB-HfuRkOTgtyVxudXcm8';  // ✅ 미사용 - 주석 처리
const TEACHER_LIST_SSID = '12OSD8W-AFCPonw6QzOSM8H93eOG_-qar-zWCDWFfT7g';
// const LAB_TEACHER_SSID  = '1djvdz0W7UCnmLBWElg7G4-KsxKiPyvnwVHC8UxYIqgA';  // ✅ 미사용 - 주석 처리

// ===== 시트 이름 상수 =====
const LAB_LOG_SHEET_NAME        = '실험실지도일지';
const WARN_ACCUM_SHEET_NAME     = '경고기록누적';
const POLICY_SHEET_NAME         = '신청제한정책';
const RESTRICT_SHEET_NAME       = '신청제한명단';
const RESTRICT_ACCUM_SHEET_NAME = '신청제한누적명단';
const ADMIN_LOG_SHEET_NAME      = '관리자로그';
const BACKUP_CONFIG_SHEET_NAME  = '백업설정';  // ✅ 신규 추가

// ===== 조회에서 제외할 시트 =====
const EXCLUDED_SHEETS = [
  RESTRICT_SHEET_NAME,
  POLICY_SHEET_NAME,
  WARN_ACCUM_SHEET_NAME,
  LAB_LOG_SHEET_NAME,
  RESTRICT_ACCUM_SHEET_NAME,
  ADMIN_LOG_SHEET_NAME,
  BACKUP_CONFIG_SHEET_NAME,
];

// ===== 정책/명단 헤더 =====
const POLICY_HEADERS        = ['활성화', '경고임계', '기간_일'];
const RESTRICT_HEADERS      = ['학번', '이름', '제한사유', '시작일', '종료일', '현재상태', '최근경고수', '산출일'];
const RESTRICT_ACCUM_HEADERS= ['학번','이름','누적 횟수'];

/* ==================================================
 *  공통/진입점
 * ================================================== */

function doGet(e) {
  var view = (e && e.parameter && e.parameter.view) ? String(e.parameter.view) : '';
  var platform = (e && e.parameter && e.parameter.platform) ? String(e.parameter.platform) : '';
  var isMobile = (platform === 'mobile');
  var file;
  var title = '과학실험·실습실 사용 신청 관리 시스템';

  // 라우팅 분기 (✅ 모바일: SPA 단일 페이지 / 데스크탑: 개별 페이지)
  if (isMobile) {
    // ★ 모바일 SPA — 한 번 로드로 모든 뷰 포함, 즉시 네비게이션
    file = 'm_spa';
    title = '실험실 관리';
  } else {
    switch(view) {
      case 'admin':
        file = 'admin';
        title = '과학실험·실습실 사용 신청 관리 시스템';
        break;
      case 'chemical_list':
      case 'common_list':
        file = 'common_list';
        title = '시약 목록';
        break;
      case 'student_list':
        file = 'student_list';
        title = '학생 명단';
        break;
      case 'teacher_schedule':
        file = 'teacher_schedule';
        title = '임장 일정';
        break;
      case 'statistics':
        file = 'statistics';
        title = '사용 통계';
        break;
      default:
        file = 'entry';
        title = '과학실험·실습실 사용 신청 관리 시스템';
    }
  }
  
  try {
    var tpl = HtmlService.createTemplateFromFile(file);
    
    return tpl.evaluate()
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .setTitle(title)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (error) {
    var missing = file;
    var safeMissing = String(missing).replace(/[&<>"']/g, function(m) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];
    });
    var safeError = String(error.message || '').replace(/[&<>"']/g, function(m) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];
    });
    return HtmlService.createHtmlOutput(`
      <!DOCTYPE html><html><head><meta charset="UTF-8"><title>설치 필요</title>
      <style>
        body{font-family:Arial,sans-serif;max-width:600px;margin:50px auto;padding:20px;background:#f5f5f5}
        .container{background:#fff;padding:30px;border-radius:10px;box-shadow:0 0 10px rgba(0,0,0,.1)}
        .step{margin:15px 0;padding:10px;background:#e8f4fd;border-radius:5px}
        .code{background:#f0f0f0;padding:2px 5px;border-radius:3px;font-family:monospace}
      </style></head><body>
        <div class="container">
          <h1>페이지 설치 필요</h1>
          <p><b>${safeMissing}.html</b> 파일이 없습니다. 다음 순서로 HTML 파일을 추가하세요.</p>
          <div class="step"><b>1단계:</b> GAS 편집기 → <span class="code">파일 → 새로 만들기 → HTML</span></div>
          <div class="step"><b>2단계:</b> 파일명을 <span class="code">${safeMissing}</span> 으로 저장</div>
          <div class="step"><b>3단계:</b> (관리자 페이지라면) <span class="code">admin, admin_head, admin_body, admin_scripts</span> 4개 파일</div>
          <div class="step"><b>4단계:</b> (시약목록) <span class="code">chemical_list, chemical_list_body, chemical_list_scripts</span></div>
          <div class="step"><b>5단계:</b> (학생명단) <span class="code">student_list, student_list_body, student_list_scripts</span></div>
          <div class="step"><b>6단계:</b> (임장일정) <span class="code">teacher_schedule, teacher_schedule_body, teacher_schedule_scripts</span></div>
          <div class="step"><b>7단계:</b> (공통) <span class="code">common_styles</span></div>
          <div class="step"><b>8단계:</b> 저장 후 다시 배포</div>
          <p style="margin-top:16px;background:#fff3cd;padding:10px;border-radius:6px">
            <b>오류:</b> ${safeError}
          </p>
        </div>
      </body></html>
    `).setTitle('페이지 설치 필요');
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getHeaderMap_(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) throw new Error('시트 헤더가 비어있습니다: ' + sheet.getName());
  const header = sheet.getRange(1,1,1, lastCol).getValues()[0];
  const map = {};
  header.forEach((h,i)=> map[String(h).trim()] = i);
  return { header, map };
}

function normalizeToHHmm_(v) {
  if (v==null || v==='') return '';
  if (v instanceof Date) {
    const pad=n=>String(n).padStart(2,'0');
    return `${pad(v.getHours())}:${pad(v.getMinutes())}`;
  }
  if (typeof v==='number') {
    const total = Math.round(v*24*60), hh=Math.floor(total/60)%24, mm=total%60;
    const pad=n=>String(n).padStart(2,'0');
    return `${pad(hh)}:${pad(mm)}`;
  }
  if (typeof v==='string') {
    const s=v.trim(); const m=s.match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
      const pad=n=>String(n).padStart(2,'0');
      const hh=Math.min(23, Math.max(0, parseInt(m[1],10)));
      const mm=Math.min(59, Math.max(0, parseInt(m[2],10)));
      return `${pad(hh)}:${pad(mm)}`;
    }
    const d=new Date(s);
    if (!isNaN(d.getTime())) {
      const pad=n=>String(n).padStart(2,'0');
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    return s;
  }
  return String(v);
}

/***********************************************************
 * Entry(입장) 페이지용 서버 설정
 ***********************************************************/
const ENTRY_DEFAULT_PASSWORD = '3000';
const ENTRY_PW_PROP_KEY      = 'ENTRY_PASSWORD';
const TEACHER_SHEET_ID       = '12OSD8W-AFCPonw6QzOSM8H93eOG_-qar-zWCDWFfT7g';
const TEACHER_SHEET_NAME     = '';
const TEACHER_EMAIL_DOMAIN   = '@cnsa.hs.kr';

function getEntryPassword_() {
  const props = PropertiesService.getScriptProperties();
  return props.getProperty(ENTRY_PW_PROP_KEY) || ENTRY_DEFAULT_PASSWORD;
}
function setEntryPassword(newPw) {
  if (!newPw) throw new Error('비밀번호가 비었습니다.');
  PropertiesService.getScriptProperties().setProperty(ENTRY_PW_PROP_KEY, String(newPw));
  logAdminAction_('설정변경', 'ENTRY_PASSWORD', '입장 비밀번호 변경');
  return { success: true };
}
function normalizeTeacherId_(raw) {
  let s = String(raw || '').trim().toLowerCase();
  if (!s) return '';
  const at = s.indexOf('@');
  if (at >= 0) s = s.slice(0, at);
  return s;
}
function getTeacherIdSet_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('TEACHER_ID_SET_V1');
  if (cached) return new Set(JSON.parse(cached));
  const ss = SpreadsheetApp.openById(TEACHER_SHEET_ID);
  const sh = TEACHER_SHEET_NAME ? ss.getSheetByName(TEACHER_SHEET_NAME) : ss.getSheets()[0];
  if (!sh) throw new Error('교사 목록 시트를 찾을 수 없습니다.');
  const values = sh.getDataRange().getDisplayValues();
  const ids = [];
  const emailRe = new RegExp(String(TEACHER_EMAIL_DOMAIN).replace('.', '\\.') + '$', 'i');
  for (let r = 0; r < values.length; r++) {
    for (let c = 0; c < values[r].length; c++) {
      const cell = String(values[r][c] || '').trim();
      if (!cell) continue;
      const lower = cell.toLowerCase();
      if (lower.endsWith(TEACHER_EMAIL_DOMAIN) || emailRe.test(lower)) {
        const local = lower.split('@')[0];
        if (local) ids.push(local);
      }
    }
  }
  const uniq = Array.from(new Set(ids));
  cache.put('TEACHER_ID_SET_V1', JSON.stringify(uniq), 60 * 10);
  return new Set(uniq);
}
function getAppUrl() {
  return ScriptApp.getService().getUrl();
}
function verifyTeacherId(userId) {
  var raw = String(userId || '').trim().toLowerCase();
  if (!raw) return { ok:false, reason:'EMPTY' };
  var prefix = raw;
  var at = raw.indexOf('@');
  if (at > 0) prefix = raw.slice(0, at);
  try {
    var set = getTeacherIdSet_();
    return { ok: set.has(prefix) };
  } catch (err) {
    return { ok:false, reason:'ERROR', message: String(err && err.message || err) };
  }
}
function verifyPassword(pw) {
  var input = String(pw || '');
  var saved = String(getEntryPassword_() || '');
  return { ok: input === saved };
}

/* ==================================================
 *  테스트/간단 조회
 * ================================================== */
function testConnection() {
  try {
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const sh = ss.getSheets()[0];
    const info = {
      success: true,
      sheetName: sh.getName(),
      rowCount: sh.getLastRow(),
      colCount: sh.getLastColumn(),
      message: '연결 성공!'
    };
    if (sh.getLastRow()>0) {
      const headers = sh.getRange(1,1,1, sh.getLastColumn()).getValues()[0];
      info.headers = headers;
      if (sh.getLastRow()>1) {
        const n = Math.min(3, sh.getLastRow()-1);
        info.sampleData = sh.getRange(2,1,n, sh.getLastColumn()).getValues();
      }
    }
    return info;
  } catch (err) {
    return { success:false, error:err.message, message:'연결 실패: '+err.message };
  }
}
function getSimpleApplications() {
  try {
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const sh = ss.getSheets()[0];
    const vals = sh.getDataRange().getValues();
    if (vals.length<2) return { success:true, data:[], message:'데이터가 없습니다' };
    const [hdr, ...rows] = vals;
    const max = Math.min(50, rows.length);
    const data = [];
    for (let i=0;i<max;i++){
      const row=rows[i], obj={};
      hdr.forEach((h,j)=>{
        const v=row[j];
        if (v instanceof Date) obj[h]=toLocalISOString_(v);
        else if (v==null) obj[h]='';
        else obj[h]=String(v);
      });
      obj.chemicals=[];
      data.push(obj);
    }
    return { success:true, data, message:`${data.length}개 로드` };
  } catch (e) {
    return { success:false, error:e.message, data:[], message:'조회 실패: '+e.message };
  }
}

/* ==================================================
 *  유틸: 대상 시트 선택 (제외 시트 반영)
 * ================================================== */
function getTargetSheets_(ss){
  const names = new Set(EXCLUDED_SHEETS.map(String));
  return ss.getSheets().filter(sh => !names.has(sh.getName()));
}
function pickSheetsForRange_(ss, from, to) {
  const excluded = new Set(EXCLUDED_SHEETS.map(String));
  let first = ss.getSheetByName('sheet1') || ss.getSheets()[0];
  if (first && excluded.has(first.getName())) {
    first = ss.getSheets().find(sh => !excluded.has(sh.getName())) || first;
  }  
  const badDate = !(from instanceof Date) || isNaN(from) || !(to instanceof Date) || isNaN(to);
  if (badDate) return [first];
  const spanDays = Math.ceil((to - from) / (1000 * 60 * 60 * 24)) + 1;
  if (spanDays <= 31) return [first];
  return ss.getSheets().filter(sh => !excluded.has(sh.getName()));
}

/* ==================================================
 *  날짜/타임존 안전 유틸 (★ 수정됨 - 시간대 통일)
 * ================================================== */

/** 문자열/시리얼/Date → Date 변환(실패 시 null) - ✅ 시간대 통일 */
function parseToDateSafe_(v) {
  if (v instanceof Date && !isNaN(v)) return new Date(v.getTime());
  if (typeof v === 'number' && isFinite(v)) {
    if (v > 1e10) return new Date(v);
    const epoch = new Date(Date.UTC(1899,11,30));
    const ms = v * 24 * 60 * 60 * 1000;
    const d  = new Date(epoch.getTime() + ms);
    return isNaN(d) ? null : d;
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return null;
    
    // ✅ 시간대 통일: yyyy-MM-dd 형식 감지 후 스크립트 타임존 기준으로 파싱
    const match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) {
      const tz = Session.getScriptTimeZone();
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      const d = new Date(year, month, day);
      return isNaN(d) ? null : d;
    }
    
    const d = new Date(s);
    if (!isNaN(d)) return d;
    return null;
  }
  return null;
}

/** 로컬 타임존(스크립트 TZ) 기준으로 자정(00:00:00.000)으로 내림 */
function toLocalMidnight_(d) {
  if (!(d instanceof Date) || isNaN(d)) return null;
  const tz = Session.getScriptTimeZone();
  const s  = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  const md = new Date(s + 'T00:00:00');
  return isNaN(md) ? null : md;
}

/** 오늘 자정(로컬) */
function todayLocalMidnight_() {
  return toLocalMidnight_(new Date());
}

/** 날짜 비교용 포맷 (yyyy-MM-dd) */
function formatDateForCompare_(dateVal) {
  const d = parseToDateSafe_(dateVal);
  if (!d) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/**
 * Date → 스크립트 타임존(KST) 기준 ISO 형식 문자열
 * toISOString()은 UTC 기준이라 KST와 최대 -1일 오프셋 발생.
 * 이 함수는 'Z' 없이 로컬 시간을 반환하므로 클라이언트에서
 * new Date()로 파싱 시 브라우저 로컬 시간으로 올바르게 해석됨.
 */
function toLocalISOString_(d) {
  if (!(d instanceof Date) || isNaN(d)) return '';
  const tz = Session.getScriptTimeZone();
  return Utilities.formatDate(d, tz, "yyyy-MM-dd'T'HH:mm:ss");
}

/* ==================================================
 *  데이터 조회/통계
 * ================================================== */

function getAllApplications(filters = {}) {
  try {
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const basis = String(filters.basis || '실험할날짜');
    const from  = filters.dateFrom ? new Date(filters.dateFrom + 'T00:00:00') : null;
    const to    = filters.dateTo   ? new Date(filters.dateTo + 'T23:59:59') : null;
    const sheets = pickSheetsForRange_(ss, from, to);
    const list = [];

    // ✅ 성능 최적화: includeChemicals=false이면 별도 스프레드시트 호출 생략
    const needChemicals = filters.includeChemicals !== false;
    const chemMap = needChemicals ? loadAllChemicalsMap_() : null;

    sheets.forEach(sh=>{
      const vals = sh.getDataRange().getValues();
      if (vals.length < 2) return;
      const [hdr, ...rows] = vals;
      const idIdx = hdr.indexOf('신청ID');
      if (idIdx === -1) return;
      const keyDateCol = (basis === '실험할날짜') ? hdr.indexOf('실험할날짜') : hdr.indexOf('제출일시');
      const hasKeyDate = keyDateCol !== -1;

      rows.forEach(row=>{
        if (hasKeyDate) {
          const dt = parseToDateSafe_(row[keyDateCol]);
          if (from && (!dt || dt < from)) return;
          if (to   && (!dt || dt > to))   return;
        }
        const app = {};
        hdr.forEach((h,i)=>{
          const v=row[i];
          if (h==='제출일시' || h==='실험할날짜') {
            const d = parseToDateSafe_(v);
            app[h] = d ? toLocalISOString_(d) : (v==null ? '' : String(v));
          } else if (h==='임장지도 시작시간' || h==='임장지도 종료시간') {
            app[h]=normalizeToHHmm_(v);
          } else {
            app[h]=(v==null)?'':String(v);
          }
        });
        const appId = app['신청ID'];
        app.chemicals = chemMap ? (chemMap.get(appId) || []) : [];
        list.push(app);
      });
    });

    let out = list.filter(app=>{
      if (filters.lab && String(app['신청실험실'])!==String(filters.lab)) return false;
      if (filters.status) {
        const s = getApplicationStatusForAdmin(app);
        if (s !== String(filters.status)) return false;
      }
      if (filters.searchTerm) {
        const t=String(filters.searchTerm).toLowerCase();
        const k1=String(app['대표자학번']||'').toLowerCase();
        const k2=String(app['대표자이름']||'').toLowerCase();
        const k3=String(app['실험제목']||'').toLowerCase();
        const k4=String(app['지도교사이름']||'').toLowerCase();
        if (!(k1.includes(t)||k2.includes(t)||k3.includes(t)||k4.includes(t))) return false;
      }
      return true;
    });

    out.sort((a,b)=>{
      const da=new Date(a['제출일시']), db=new Date(b['제출일시']);
      return db - da;
    });
    return out;
  } catch (e) {
    console.error('getAllApplications 오류:', e);
    throw new Error('신청서 목록을 불러오는 중 오류: '+e.message);
  }
}

function getApplicationById(applicationId) {
  if (!applicationId) return null;
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  const sheets = getTargetSheets_(ss);
  for (const sh of sheets) {
    const vals = sh.getDataRange().getValues();
    if (vals.length < 2) continue;
    const [hdr, ...rows] = vals;
    const idCol = hdr.indexOf('신청ID');
    if (idCol === -1) continue;
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][idCol]) === String(applicationId)) {
        const row = rows[i];
        const app = {};
        hdr.forEach((h, j) => {
          const v = row[j];
          if (h === '제출일시' || h === '실험할날짜') {
            const d = parseToDateSafe_(v);
            app[h] = d ? toLocalISOString_(d) : (v==null ? '' : String(v));
          } else if (h === '임장지도 시작시간' || h === '임장지도 종료시간') {
            app[h] = normalizeToHHmm_(v);
          } else {
            app[h] = (v == null) ? '' : String(v);
          }
        });
        const appId = app['신청ID'];
        app.chemicals = appId ? getApplicationChemicals(appId) : [];
        return app;
      }
    }
  }
  return null;
}

function getApplicationChemicals(applicationId) {
  try {
    const ss = SpreadsheetApp.openById(CHEM_RECORD_SSID);
    const sh = ss.getSheets()[0];
    const vals = sh.getDataRange().getValues();
    if (vals.length<2) return [];
    const [hdr, ...rows] = vals;
    const out=[];
    rows.forEach(r=>{
      if (String(r[0])===String(applicationId)) {
        const obj={};
        hdr.forEach((h,i)=> obj[h]=(r[i]==null)?'':String(r[i]));
        out.push(obj);
      }
    });
    return out;
  } catch (e) {
    console.error('getApplicationChemicals 오류:', e);
    return [];
  }
}

function loadAllChemicalsMap_() {
  // ✅ 성능 최적화: CacheService로 시약 데이터 캐싱 (5분)
  const cache = CacheService.getScriptCache();
  const cacheKey = 'CHEM_MAP_V1';
  const cached = cache.get(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      const map = new Map();
      for (const key in parsed) {
        map.set(key, parsed[key]);
      }
      return map;
    } catch (_) { /* 캐시 파싱 실패 시 아래에서 재로드 */ }
  }

  const map = new Map();
  try {
    const ss = SpreadsheetApp.openById(CHEM_RECORD_SSID);
    const sh = ss.getSheets()[0];
    const vals = sh.getDataRange().getValues();
    if (vals.length < 2) return map;
    const [hdr, ...rows] = vals;
    rows.forEach(r => {
      const appId = String(r[0] || '');
      if (!appId) return;
      const obj = {};
      hdr.forEach((h, i) => obj[h] = (r[i] == null) ? '' : String(r[i]));
      if (!map.has(appId)) map.set(appId, []);
      map.get(appId).push(obj);
    });

    // 캐시에 저장 (Map → plain object로 변환, 최대 100KB 제한 고려)
    try {
      const plain = {};
      for (const [k, v] of map) { plain[k] = v; }
      const json = JSON.stringify(plain);
      if (json.length < 100000) {  // CacheService 단일 값 100KB 제한
        cache.put(cacheKey, json, 60 * 5);  // 5분 캐시
      }
    } catch (_) { /* 캐시 저장 실패 시 무시 (다음 호출에서 재로드) */ }
  } catch (e) {
    Logger.log('loadAllChemicalsMap_ 오류: ' + e.message);
  }
  return map;
}

function getApplicationStatusForAdmin(app) {
  const finalApproval = String(app['최종승인여부']||'');
  const firstApproval = String(app['지도승인여부']||'');
  if (finalApproval==='승인') return '최종승인';
  if (firstApproval==='반려' || finalApproval==='반려') return '반려';
  if (firstApproval==='승인') return '1차승인';
  return '대기';
}

function getApplicationStats(filters = {}) {
  // ✅ 성능 최적화: 통계 계산에는 시약 데이터 불필요
  const statsFilters = Object.assign({}, filters, { includeChemicals: false });
  const rows = getAllApplications(statsFilters);
  const stats = { total: rows.length, pending:0, firstApproved:0, finalApproved:0, rejected:0 };
  rows.forEach(app=>{
    const s = getApplicationStatusForAdmin(app);
    if (s==='대기') stats.pending++;
    else if (s==='1차승인') stats.firstApproved++;
    else if (s==='최종승인') stats.finalApproved++;
    else if (s==='반려') stats.rejected++;
  });
  return stats;
}

function getAllApplicationsWithStats(filters = {}) {
  const data = getAllApplications(filters);
  const stats = { total: data.length, pending:0, firstApproved:0, finalApproved:0, rejected:0 };
  data.forEach(app => {
    const s = getApplicationStatusForAdmin(app);
    if (s==='대기') stats.pending++;
    else if (s==='1차승인') stats.firstApproved++;
    else if (s==='최종승인') stats.finalApproved++;
    else if (s==='반려') stats.rejected++;
  });
  return { data, stats };
}

/* ==================================================
 *  CRUD/업데이트
 * ================================================== */
function deleteApplication(applicationId) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('서버가 바쁩니다. 잠시 후 다시 시도해주세요.');
  try {
    if (!applicationId) throw new Error('신청 ID가 필요합니다.');
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const sheets = getTargetSheets_(ss);
    let deleted=false;
    for (const sh of sheets) {
      const vals = sh.getDataRange().getValues();
      if (vals.length<2) continue;
      const [hdr, ...rows] = vals;
      const idCol = hdr.indexOf('신청ID');
      if (idCol===-1) continue;
      for (let i=rows.length-1;i>=0;i--){
        if (String(rows[i][idCol])===String(applicationId)) {
          sh.deleteRow(i+2);
          deleted=true; break;
        }
      }
      if (deleted) break;
    }
    if (!deleted) throw new Error('해당 신청서를 찾을 수 없습니다.');

    // ✅ 수정: 시약 삭제 오류 처리 - 로그 기록 추가
    try {
      CacheService.getScriptCache().remove('CHEM_MAP_V1');  // ✅ 시약 캐시 무효화
      const css=SpreadsheetApp.openById(CHEM_RECORD_SSID);
      const csh=css.getSheets()[0];
      const v=csh.getDataRange().getValues();
      if (v.length>1){
        for (let i=v.length-1;i>=1;i--) {
          if (String(v[i][0])===String(applicationId)) csh.deleteRow(i+1);
        }
      }
    } catch (e) {
      console.error('시약 삭제 중 오류:', e);
      // ✅ 관리자 로그에 기록
      logAdminAction_('시약삭제실패', applicationId, '오류: ' + e.message);
    }
    logAdminAction_('삭제', applicationId, '신청서 삭제');
    return `신청서 삭제 완료 (ID: ${applicationId})`;
  } catch (e) {
    console.error('deleteApplication 오류:', e);
    throw new Error('신청서 삭제 중 오류: '+e.message);
  } finally { lock.releaseLock(); }
}

function updateApplicationStatus(applicationId, updates) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('서버가 바쁩니다. 잠시 후 다시 시도해주세요.');
  try {
    if (!applicationId) throw new Error('신청 ID가 필요합니다.');
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const sheets = getTargetSheets_(ss);
    let done=false;
    for (const sh of sheets) {
      const { header, map } = getHeaderMap_(sh);
      if (map['신청ID']==null) continue;
      const vals=sh.getDataRange().getValues();
      const [hdr, ...rows]=vals;
      const idx=rows.findIndex(r=> String(r[map['신청ID']])===String(applicationId));
      if (idx<0) continue;
      const row = idx+2;
      Object.keys(updates).forEach(field=>{
        if (map[field]!=null) sh.getRange(row, map[field]+1).setValue(updates[field]);
      });
      done=true; break;
    }
    if (!done) throw new Error('해당 신청서를 찾을 수 없습니다.');
    logAdminAction_('상태변경', applicationId, JSON.stringify(updates));
    return '상태가 업데이트되었습니다.';
  } catch (e) {
    console.error('updateApplicationStatus 오류:', e);
    throw new Error('상태 업데이트 중 오류: '+e.message);
  } finally { lock.releaseLock(); }
}

function createDataBackup() {
  const cache = CacheService.getScriptCache();
  const lastBackup = cache.get('LAST_BACKUP_TIME');
  if (lastBackup) {
    const elapsed = Date.now() - Number(lastBackup);
    if (elapsed < 24 * 60 * 60 * 1000) {
      throw new Error('최근 24시간 내 백업이 이미 존재합니다. (마지막 백업: ' + new Date(Number(lastBackup)).toLocaleString() + ')');
    }
  }
  try {
    const ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
    const src = SpreadsheetApp.openById(MAIN_SSID);
    const dst = SpreadsheetApp.create(`실험·실습실신청_백업_${ts}`);
    src.getSheets().forEach(s=>{
      const b = dst.insertSheet(s.getName());
      const v = s.getDataRange().getValues();
      if (v.length>0) b.getRange(1,1,v.length, v[0].length).setValues(v);
    });
    const def = dst.getSheetByName('시트1'); if (def) dst.deleteSheet(def);
    logAdminAction_('백업', dst.getId(), '수동 백업 생성: ' + ts);
    cache.put('LAST_BACKUP_TIME', String(Date.now()), 86400);
    return { backupId:dst.getId(), backupUrl:dst.getUrl(), timestamp:ts };
  } catch (e) {
    console.error('createDataBackup 오류:', e);
    throw new Error('백업 생성 오류: '+e.message);
  }
}

function updateApplicationFields(applicationId, updates) {
  const EDITABLE_FIELDS = [
    '실험제목', '사용목적', '사용목적 기타', '실험준비물', '실험과정', '실험뒷정리',
    '실험시 주의사항', '안전장구', '첨단기기실 이용 여부', '첨단기기실 이용 사유',
    '후드 사용 여부', '후드 사용 사유', '동반자명단', '총인원수',
    '지도교사이름', '지도교사이메일', '신청실험실', '실험할날짜', '신청시간',
    '지도승인여부', '지도승인의견', '최종승인여부', '최종승인의견',
    '임장지도 시작시간', '임장지도 종료시간'
  ];
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('서버가 바쁩니다. 잠시 후 다시 시도해주세요.');
  try {
    if (!applicationId) throw new Error('신청 ID가 필요합니다.');
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const sheets = getTargetSheets_(ss);
    let updated=false;
    for (const sh of sheets) {
      const { header, map } = getHeaderMap_(sh);
      const idCol = map['신청ID']; if (idCol==null) continue;
      const vals = sh.getDataRange().getValues();
      const [hdr, ...rows] = vals;
      const idx = rows.findIndex(r=> String(r[idCol])===String(applicationId));
      if (idx<0) continue;
      const row = idx+2;
      Object.keys(updates).forEach(field=>{
        if (!EDITABLE_FIELDS.includes(field)) {
          Logger.log('[updateApplicationFields] 수정 차단 필드: ' + field);
          return;
        }
        if (map[field]!=null) {
          let value = updates[field];
          if (field==='실험할날짜' && value) value = new Date(value);
          sh.getRange(row, map[field]+1).setValue(value);
        }
      });
      updated=true; break;
    }
    if (!updated) throw new Error('해당 신청서를 찾을 수 없습니다.');
    SpreadsheetApp.flush();
    logAdminAction_('필드수정', applicationId, Object.keys(updates).join(', '));
    const updatedApp = getApplicationById(applicationId);
    return { success:true, message:'신청서 수정 완료', applicationId, updated: updatedApp };
  } catch (e) {
    console.error('updateApplicationFields 오류:', e);
    return { success:false, message:'수정 오류: '+e.message, error:e.message };
  } finally { lock.releaseLock(); }
}

function updateFullApplication(applicationId, data) {
  const EDITABLE_FIELDS = [
    '실험제목', '사용목적', '사용목적 기타', '실험준비물', '실험과정', '실험뒷정리',
    '실험시 주의사항', '안전장구', '첨단기기실 이용 여부', '첨단기기실 이용 사유',
    '후드 사용 여부', '후드 사용 사유', '동반자명단', '총인원수',
    '지도교사이름', '지도교사이메일', '신청실험실', '실험할날짜', '신청시간',
    '지도승인여부', '지도승인의견', '최종승인여부', '최종승인의견',
    '임장지도 시작시간', '임장지도 종료시간'
  ];
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('서버가 바쁩니다. 잠시 후 다시 시도해주세요.');
  try {
    if (!applicationId) throw new Error('신청 ID가 필요합니다.');
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const sheets = getTargetSheets_(ss);
    let updated=false;
    for (const sh of sheets) {
      const { header, map } = getHeaderMap_(sh);
      const idCol = map['신청ID']; if (idCol==null) continue;
      const vals = sh.getDataRange().getValues();
      const [hdr, ...rows] = vals;
      const idx = rows.findIndex(r=> String(r[idCol])===String(applicationId));
      if (idx<0) continue;
      const row = idx+2;
      Object.keys(data).forEach(field=>{
        if (field === 'chemicals') return; // chemicals는 별도 처리
        if (!EDITABLE_FIELDS.includes(field)) {
          Logger.log('[updateFullApplication] 수정 차단 필드: ' + field);
          return;
        }
        if (map[field]!=null) {
          let v = data[field];
          if ((field==='실험할날짜'||field==='제출일시') && v) v=new Date(v);
          sh.getRange(row, map[field]+1).setValue(v);
        }
      });
      if (data.chemicals && Array.isArray(data.chemicals)) {
        updateChemicalRecords(applicationId, data.chemicals);
      }
      updated=true; break;
    }
    if (!updated) throw new Error('해당 신청서를 찾을 수 없습니다.');
    SpreadsheetApp.flush();
    logAdminAction_('전체수정', applicationId, Object.keys(data).join(', '));
    const updatedApp = getApplicationById(applicationId);
    return { success:true, message:'신청서 수정 완료', applicationId, updated: updatedApp };
  } catch (e) {
    console.error('updateFullApplication 오류:', e);
    return { success:false, message:'수정 오류: '+e.message, error:e.message };
  } finally { lock.releaseLock(); }
}

function batchUpdateApplications(updatesList) {
  if (!Array.isArray(updatesList) || updatesList.length === 0) {
    return { ok: false, message: '변경할 항목이 없습니다.' };
  }
  if (updatesList.length > 200) {
    return { ok: false, message: '한 번에 200건 이하만 처리할 수 있습니다.' };
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { ok: false, message: '다른 작업이 진행 중입니다. 잠시 후 다시 시도하세요.' };
  }

  var successCount = 0, failCount = 0, errors = [];
  try {
    // Open spreadsheet once
    var ss = SpreadsheetApp.openById(MAIN_SSID);
    var sheets = getTargetSheets_(ss);

    updatesList.forEach(function(item) {
      try {
        var id = String(item.id || '');
        var changes = item.changes || {};
        if (!id) { failCount++; errors.push(id + ': ID 누락'); return; }

        // Find the row
        var found = false;
        for (var si = 0; si < sheets.length; si++) {
          var sh = sheets[si];
          var vals = sh.getDataRange().getValues();
          if (vals.length < 2) continue;
          var hdr = vals[0];
          var idCol = hdr.indexOf('신청ID');
          if (idCol === -1) continue;

          for (var ri = 1; ri < vals.length; ri++) {
            if (String(vals[ri][idCol]) === id) {
              // Apply changes
              Object.keys(changes).forEach(function(field) {
                var col = hdr.indexOf(field);
                if (col !== -1) {
                  sh.getRange(ri + 1, col + 1).setValue(changes[field]);
                }
              });
              found = true;
              successCount++;
              break;
            }
          }
          if (found) break;
        }
        if (!found) { failCount++; errors.push(id + ': 신청 건을 찾을 수 없음'); }
      } catch (e) {
        failCount++;
        errors.push((item.id || '?') + ': ' + e.message);
      }
    });

    logAdminAction_('일괄수정', '배치 업데이트 ' + successCount + '건 성공, ' + failCount + '건 실패');
    return { ok: true, successCount: successCount, failCount: failCount, errors: errors };
  } finally {
    lock.releaseLock();
  }
}

function updateChemicalRecords(applicationId, chemicals) {
  try {
    // ✅ 시약 데이터 변경 시 캐시 무효화
    CacheService.getScriptCache().remove('CHEM_MAP_V1');
    const ss = SpreadsheetApp.openById(CHEM_RECORD_SSID);
    const sh = ss.getSheets()[0];
    const v = sh.getDataRange().getValues();
    if (v.length>1){
      for (let i=v.length-1;i>=1;i--){
        if (String(v[i][0])===String(applicationId)) sh.deleteRow(i+1);
      }
    }
    chemicals.forEach(c=>{
      sh.appendRow([
        applicationId,
        new Date(),
        c['신청실험실']||'',
        c['실험할날짜']||'',
        c['신청시간']||'',
        c['대표자학번']||'',
        c['대표자이름']||'',
        c['시약명']||'',
        c['상태']||'',
        c['농도']||'',
        c['용량']||'',
        c['MSDS']||'',
        c['교사임장여부']||'',
        c['폐기 방법']||c['폐수처리']||c['폐기']||''
      ]);
    });
  } catch (e) {
    console.error('updateChemicalRecords 오류:', e);
    throw e;
  }
}

function getTeacherListForEdit() {
  try {
    const rows = SpreadsheetApp.openById(TEACHER_LIST_SSID).getSheets()[0].getDataRange().getValues();
    const [hdr, ...data] = rows;
    const nameIdx = hdr.indexOf('교사이름');
    if (nameIdx===-1) return [];
    return data.filter(r=>r[nameIdx]).map(r=>({
      name: r[nameIdx],
      email: r[hdr.indexOf('이메일주소')]||'',
      subject: r[hdr.indexOf('과목')]||''
    }));
  } catch (e) {
    console.error('getTeacherListForEdit 오류:', e);
    return [];
  }
}

/* ==================================================
 *  ✅ 중복 예약 방지 기능 (신규)
 * ================================================== */

/**
 * 중복 예약 확인
 * @param {string} lab - 실험실
 * @param {string} date - 실험 날짜 (yyyy-MM-dd)
 * @param {string} time - 신청 시간
 * @param {string} excludeAppId - 제외할 신청ID (자기 자신)
 * @returns {Object} { isDuplicate, existingApp }
 */
function checkDuplicateReservation(lab, date, time, excludeAppId) {
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  const sheets = ss.getSheets().filter(sh => !EXCLUDED_SHEETS.includes(sh.getName()));
  
  for (const sh of sheets) {
    const data = sh.getDataRange().getValues();
    if (data.length <= 1) continue;
    
    const { header, map } = getHeaderMap_(sh);
    const labIdx = map['신청실험실'];
    const dateIdx = map['실험할날짜'];
    const timeIdx = map['신청시간'];
    const idIdx = map['신청ID'];
    const firstApprovalIdx = map['지도승인여부'];
    const finalApprovalIdx = map['최종승인여부'];
    const studentIdx = map['대표자이름'];
    
    if (labIdx === undefined || dateIdx === undefined || timeIdx === undefined || idIdx === undefined) continue;
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowId = String(row[idIdx] || '');
      
      // 자기 자신 제외
      if (rowId === excludeAppId) continue;
      
      // 실험실 비교
      if (String(row[labIdx] || '') !== lab) continue;
      
      // 날짜 비교
      const rowDate = formatDateForCompare_(row[dateIdx]);
      if (rowDate !== date) continue;
      
      // 시간 비교
      if (String(row[timeIdx] || '') !== time) continue;
      
      // 승인 상태 확인 (1차승인 또는 최종승인된 것만)
      const firstApproval = String(row[firstApprovalIdx] || '');
      const finalApproval = String(row[finalApprovalIdx] || '');
      
      if (firstApproval === '승인' || finalApproval === '승인') {
        return {
          isDuplicate: true,
          existingApp: {
            신청ID: rowId,
            대표자이름: row[studentIdx] || '',
            상태: finalApproval === '승인' ? '최종승인' : '1차승인'
          }
        };
      }
    }
  }
  
  return { isDuplicate: false, existingApp: null };
}

/**
 * 중복 확인 후 승인 처리
 * @param {string} appId - 신청 ID
 * @param {string} approvalType - 승인 유형 ('1차승인' 또는 '최종승인')
 * @returns {Object} { success, isDuplicate, message, existingApp }
 */
function approveWithDuplicateCheck(appId, approvalType) {
  try {
    const app = getApplicationById(appId);
    if (!app) throw new Error('신청을 찾을 수 없습니다.');
    
    const lab = app['신청실험실'] || '';
    const date = formatDateForCompare_(app['실험할날짜']);
    const time = app['신청시간'] || '';
    
    // 중복 확인
    const check = checkDuplicateReservation(lab, date, time, appId);
    
    if (check.isDuplicate) {
      return {
        success: false,
        isDuplicate: true,
        message: `이미 승인된 예약이 있습니다: ${check.existingApp.대표자이름} (${check.existingApp.상태})`,
        existingApp: check.existingApp
      };
    }
    
    // 중복 없으면 승인 진행
    const updates = {};
    if (approvalType === '1차승인') {
      updates['지도승인여부'] = '승인';
    } else if (approvalType === '최종승인') {
      updates['최종승인여부'] = '승인';
    }
    
    updateApplicationStatus(appId, updates);
    logAdminAction_('승인', appId, approvalType);
    
    return {
      success: true,
      isDuplicate: false,
      message: `${approvalType} 완료`
    };
  } catch (e) {
    return {
      success: false,
      isDuplicate: false,
      message: '승인 처리 오류: ' + e.message
    };
  }
}

/**
 * 강제 승인 (중복 경고 무시)
 */
function forceApprove(appId, approvalType) {
  try {
    const updates = {};
    if (approvalType === '1차승인') {
      updates['지도승인여부'] = '승인';
    } else if (approvalType === '최종승인') {
      updates['최종승인여부'] = '승인';
    }
    
    updateApplicationStatus(appId, updates);
    logAdminAction_('강제승인', appId, approvalType + ' (중복 경고 무시)');
    
    return { success: true, message: `${approvalType} 완료 (강제)` };
  } catch (e) {
    return { success: false, message: '승인 처리 오류: ' + e.message };
  }
}

/* ==================================================
 *  실험실 지도 일지
 * ================================================== */
const LAB_LOG_HEADERS = ['실험날짜','학번','이름','실험실','지도교사','시간','경고여부','지도내용','작성일시'];

function ensureLabLogSheet_(){
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  let sh = ss.getSheetByName(LAB_LOG_SHEET_NAME);
  if (!sh){
    sh = ss.insertSheet(LAB_LOG_SHEET_NAME);
    sh.getRange(1,1,1,LAB_LOG_HEADERS.length).setValues([LAB_LOG_HEADERS]);
  }
  return sh;
}
function ensureWarnAccumSheet_() {
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  let sh = ss.getSheetByName(WARN_ACCUM_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(WARN_ACCUM_SHEET_NAME);
    sh.getRange(1,1,1,8).setValues([['실험날짜','학번','이름','실험실','지도교사','시간','경고여부','지도내용']]);
  }
  return sh;
}
function ensureRestrictAccumSheet_() {
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  let sh = ss.getSheetByName(RESTRICT_ACCUM_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(RESTRICT_ACCUM_SHEET_NAME);
    sh.getRange(1,1,1,RESTRICT_ACCUM_HEADERS.length).setValues([RESTRICT_ACCUM_HEADERS]);
  }
  return sh;
}

function addLabGuidanceLog(entry){
  try {
    const sh = ensureLabLogSheet_();
    const row = [
      entry.date ? new Date(entry.date) : '',
      entry.studentId || '',
      entry.name || '',
      entry.lab || '',
      entry.teacher || '',
      entry.time || '',
      entry.level || '',
      entry.content || '',
      new Date()
    ];
    sh.appendRow(row);

    if (String(entry.level) === '경고') {
      const warn = ensureWarnAccumSheet_();
      warn.appendRow([
        entry.date ? new Date(entry.date) : '',
        entry.studentId || '',
        entry.name || '',
        entry.lab || '',
        entry.teacher || '',
        entry.time || '',
        entry.level || '',
        entry.content || ''
      ]);
    }
    try {
      purgeExpiredRestrictions();
      recalcRestrictedList();
    } catch (_) {}
    return { success:true, message:'기록 저장 완료' };
  } catch (e) {
    return { success:false, message:'기록 저장 실패: '+e.message };
  }
}

function listLabGuidanceLogs(){
  try {
    const sh = ensureLabLogSheet_();
    const vals = sh.getDataRange().getValues();
    if (vals.length<2) return [];
    const [hdr, ...rows] = vals;
    return rows.map(r=>({
      '실험날짜': (parseToDateSafe_(r[0]) ? Utilities.formatDate(parseToDateSafe_(r[0]), Session.getScriptTimeZone(),'yyyy-MM-dd') : String(r[0]||'')),
      '학번': String(r[1]||''),
      '이름': String(r[2]||''),
      '실험실': String(r[3]||''),
      '지도교사': String(r[4]||''),
      '시간': String(r[5]||''),
      '경고여부': String(r[6]||''),
      '지도내용': String(r[7]||''),
      '작성일시': (parseToDateSafe_(r[8]) ? toLocalISOString_(parseToDateSafe_(r[8])) : String(r[8]||''))
    }));
  } catch (e) {
    return [];
  }
}

function warningStatsByStudent(){
  try {
    const data = listLabGuidanceLogs();
    const m = new Map();
    data.forEach(row=>{
      const key = (row['학번']||'')+'|'+(row['이름']||'');
      if (!m.has(key)) m.set(key, { 학번:row['학번']||'', 이름:row['이름']||'', 지도:0, 경고:0, 안전사고:0, '기타 특이사항':0, total:0 });
      const obj=m.get(key);
      const lvl=row['경고여부']||'';
      if (lvl==='지도') obj['지도']++;
      else if (lvl==='경고') obj['경고']++;
      else if (lvl==='안전사고') obj['안전사고']++;
      else obj['기타 특이사항']++;
      obj.total++;
    });
    return Array.from(m.values()).sort((a,b)=> (b.total-a.total) || a.학번.localeCompare(b.학번,'ko'));
  } catch (e) {
    return [];
  }
}

/**
 * ✅ 학생 제한 이력 조회 (신규)
 */
function getStudentRestrictionHistory(studentId) {
  try {
    const logs = listLabGuidanceLogs().filter(log => 
      String(log['학번']) === String(studentId) && log['경고여부'] === '경고'
    );
    
    const accumSh = ensureRestrictAccumSheet_();
    const accumVals = accumSh.getDataRange().getValues();
    let accumCount = 0;
    for (let i = 1; i < accumVals.length; i++) {
      if (String(accumVals[i][0]) === String(studentId)) {
        accumCount = Number(accumVals[i][2]) || 0;
        break;
      }
    }
    
    return {
      warnings: logs,
      totalRestrictions: accumCount
    };
  } catch (e) {
    return { warnings: [], totalRestrictions: 0 };
  }
}

/* ==================================================
 *  신청 제한 정책/명단
 * ================================================== */
function ensurePolicySheet_(){
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  let sh = ss.getSheetByName(POLICY_SHEET_NAME);
  if (!sh){
    sh = ss.insertSheet(POLICY_SHEET_NAME);
    sh.getRange(1,1,1,POLICY_HEADERS.length).setValues([POLICY_HEADERS]);
    sh.appendRow(['FALSE', 2, 30]);
  }
  return sh;
}
function ensureRestrictSheet_(){
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  let sh = ss.getSheetByName(RESTRICT_SHEET_NAME);
  if (!sh){
    sh = ss.insertSheet(RESTRICT_SHEET_NAME);
    sh.getRange(1,1,1,RESTRICT_HEADERS.length).setValues([RESTRICT_HEADERS]);
  }
  return sh;
}
function getRestrictionPolicy(){
  const sh = ensurePolicySheet_();
  const vals = sh.getDataRange().getValues();
  const row = (vals.length>=2) ? vals[1] : ['FALSE',2,30];
  return {
    enabled: String(row[0]).toUpperCase()==='TRUE',
    count: parseInt(row[1]||2,10),
    days: parseInt(row[2]||30,10)
  };
}
function saveRestrictionPolicy(payload){
  const sh = ensurePolicySheet_();
  const enabled = !!payload.enabled;
  const count = Math.max(1, parseInt(payload.count||2,10));
  const days  = Math.max(1, parseInt(payload.days ||30,10));
  if (sh.getLastRow()<2) sh.appendRow([enabled? 'TRUE':'FALSE', count, days]);
  else sh.getRange(2,1,1,3).setValues([[enabled?'TRUE':'FALSE', count, days]]);
  purgeExpiredRestrictions();
  recalcRestrictedList();
  return { success:true };
}
function setRestrictionEnabled(on){
  const p = getRestrictionPolicy();
  return saveRestrictionPolicy({ enabled: !!on, count:p.count, days:p.days });
}
function getRestrictedList(){
  const sh = ensureRestrictSheet_();
  const v = sh.getDataRange().getValues();
  if (v.length<2) return [];
  const [hdr, ...rows] = v;
  return rows.map(r=>({
    '학번': String(r[0]||''),
    '이름': String(r[1]||''),
    '제한사유': String(r[2]||''),
    '시작일': (parseToDateSafe_(r[3]) ? Utilities.formatDate(parseToDateSafe_(r[3]), Session.getScriptTimeZone(),'yyyy-MM-dd') : String(r[3]||'')),
    '종료일': (parseToDateSafe_(r[4]) ? Utilities.formatDate(parseToDateSafe_(r[4]), Session.getScriptTimeZone(),'yyyy-MM-dd') : String(r[4]||'')),
    '현재상태': String(r[5]||''),
    '최근경고수': Number(r[6]||0),
    '산출일': (parseToDateSafe_(r[7]) ? toLocalISOString_(parseToDateSafe_(r[7])) : String(r[7]||''))
  }));
}

/** 현재 시점 제한 여부(대표자/동반자 점검) */
function isStudentRestricted(studentId, name, asOfDate){
  const p = getRestrictionPolicy();
  if (!p.enabled) return { restricted:false };
  const base = toLocalMidnight_(parseToDateSafe_(asOfDate) || new Date());
  const sh = ensureRestrictSheet_();
  const v = sh.getDataRange().getValues();
  if (v.length<2) return { restricted:false };
  for (let i=1;i<v.length;i++){
    const r = v[i];
    if (String(r[0])===String(studentId) && String(r[1])===String(name)) {
      const start = toLocalMidnight_(parseToDateSafe_(r[3]));
      const end   = toLocalMidnight_(parseToDateSafe_(r[4]));
      if (start && end && base >= start && base <= end) {
        return { restricted:true, reason:String(r[2]||''), until: Utilities.formatDate(end, Session.getScriptTimeZone(),'yyyy-MM-dd') };
      }
    }
  }
  return { restricted:false };
}

/* ==================================================
 *  제한 만료 정리(+ 누적 시트 반영) - ✅ 수정됨
 * ================================================== */

function incrementRestrictAccum_(studentId, name, inc=1){
  const sh = ensureRestrictAccumSheet_();
  const v = sh.getDataRange().getValues();
  if (v.length<2){
    sh.appendRow([studentId, name, Math.max(1, inc|0)]);
    return;
  }
  let rowIndex = -1, countIdx = 2;
  for (let i=1;i<v.length;i++){
    if (String(v[i][0])===String(studentId) && String(v[i][1])===String(name)) {
      rowIndex = i+1; break;
    }
  }
  if (rowIndex>0){
    const cur = Number(sh.getRange(rowIndex, countIdx+1).getValue() || 0);
    sh.getRange(rowIndex, countIdx+1).setValue((cur|0) + Math.max(1, inc|0));
  } else {
    sh.appendRow([studentId, name, Math.max(1, inc|0)]);
  }
}

/**
 * 제한명단에서 "종료일 < 오늘(자정)" 인 항목 삭제
 * ✅ 수정: < → <= (종료일 다음날에 해제)
 */
function purgeExpiredRestrictions() {
  const sh = ensureRestrictSheet_();
  const last = sh.getLastRow();
  if (last < 2) return { removed: 0 };

  const todayMid = todayLocalMidnight_();
  const range = sh.getRange(2,1,last-1, RESTRICT_HEADERS.length);
  const vals = range.getValues();

  const toDelete = [];
  vals.forEach((r, i) => {
    const endDate = toLocalMidnight_(parseToDateSafe_(r[4]));
    if (!endDate) return;
    // ✅ 수정: < → <= (종료일 당일까지 유지, 다음날부터 해제)
    if (endDate < todayMid) {
      incrementRestrictAccum_(String(r[0]||''), String(r[1]||''), 1);
      toDelete.push(i+2);
    }
  });

  for (let i = toDelete.length-1; i>=0; i--) sh.deleteRow(toDelete[i]);
  return { removed: toDelete.length };
}

/* ==================================================
 *  제한 재산출(경고기록누적 기반)
 * ================================================== */
function getWarnCountsWithinDays_(days){
  const warnSh = ensureWarnAccumSheet_();
  const v = warnSh.getDataRange().getValues();
  if (v.length<2) return new Map();
  const cutoff = toLocalMidnight_(new Date(new Date().getTime() - days*24*60*60*1000));
  const counts = new Map();
  for (let i=1;i<v.length;i++){
    const r = v[i];
    const when = toLocalMidnight_(parseToDateSafe_(r[0]));
    const level = String(r[6]||'');
    if (!when) continue;
    if (level !== '경고') continue;
    if (when < cutoff) continue;
    const key = String(r[1]||'') + '|' + String(r[2]||'');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

/**
 * 경고기록누적 시트를 기준으로 제한명단 재산출
 */
function recalcRestrictedList(){
  const policy = getRestrictionPolicy();
  const restrictSheet = ensureRestrictSheet_();
  const lastRow = restrictSheet.getLastRow();

  // ── 정책 비활성화: 기존 행을 누적명단에 기록 후 삭제 ──
  if (!policy.enabled) {
    if (lastRow > 1) {
      const existing = restrictSheet.getRange(2, 1, lastRow - 1, RESTRICT_HEADERS.length).getValues();
      existing.forEach(r => {
        const sid = String(r[0] || '').trim();
        const nm  = String(r[1] || '').trim();
        if (sid && nm) incrementRestrictAccum_(sid, nm, 1);
      });
      restrictSheet.deleteRows(2, lastRow - 1);
    }
    return { success: true, added: 0, cleared: true };
  }

  // ── 기존 제한 학생 학번 Set 구성 (중복 등록 방지) ──
  const existingIds = new Set();
  if (lastRow > 1) {
    const existing = restrictSheet.getRange(2, 1, lastRow - 1, 1).getValues();
    existing.forEach(r => {
      const id = String(r[0] || '').trim();
      if (id) existingIds.add(id);
    });
  }

  // ── 경고 카운트 산출 → 신규 제한 대상만 추가 ──
  const counts = getWarnCountsWithinDays_(policy.days);
  const todayMid = todayLocalMidnight_();
  const msDay  = 24*60*60*1000;
  const newRows = [];

  counts.forEach((cnt, key) => {
    if (cnt >= policy.count) {
      const [sid, name] = key.split('|');
      if (existingIds.has(sid)) return;          // 이미 제한 중 → 기존 날짜 보존
      const start = new Date(todayMid.getTime());
      const end   = new Date(todayMid.getTime() + policy.days * msDay - 1);
      newRows.push([
        sid,
        name,
        `최근 ${policy.days}일 경고 ${cnt}회`,
        start,
        end,
        '제한중',
        cnt,
        new Date()
      ]);
    }
  });

  if (newRows.length > 0) {
    restrictSheet
      .getRange(restrictSheet.getLastRow() + 1, 1, newRows.length, RESTRICT_HEADERS.length)
      .setValues(newRows);
  }
  return { success: true, added: newRows.length, preserved: existingIds.size };
}

/** 간략 조회 */
function getRestrictedListLite() {
  const sh = ensureRestrictSheet_();
  const v = sh.getDataRange().getValues();
  if (v.length < 2) return [];
  const out = [];
  for (let i = 1; i < v.length; i++) {
    const r = v[i];
    const s = toLocalMidnight_(parseToDateSafe_(r[3]));
    const e = toLocalMidnight_(parseToDateSafe_(r[4]));
    out.push({
      학번: String(r[0] || ''),
      이름: String(r[1] || ''),
      시작일: s ? Utilities.formatDate(s, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(r[3] || ''),
      종료일: e ? Utilities.formatDate(e, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(r[4] || '')
    });
  }
  return out;
}
function getRestrictedAccumList() {
  const sh = ensureRestrictAccumSheet_();
  const v = sh.getDataRange().getValues();
  if (v.length < 2) return [];
  const out = [];
  for (let i = 1; i < v.length; i++) {
    const r = v[i];
    out.push({
      학번: String(r[0] || ''),
      이름: String(r[1] || ''),
      누적횟수: Number(r[2] || 0)
    });
  }
  return out;
}

/* ==================================================
 *  자동 정리 트리거
 * ================================================== */

/**
 * 매일 새벽 자동으로 제한 재산출 → 만료 정리 실행
 */
function setupDailyRestrictionMaintenance(hourLocal) {
  const hour = Math.min(23, Math.max(0, Number(hourLocal ?? 3)));
  const fn = 'dailyRestrictionMaintenance_';
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === fn)
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger(fn)
    .timeBased()
    .atHour(hour)
    .everyDays(1)
    .create();
  return { success:true, message:`매일 ${hour}:00 자동 정리 트리거 설정 완료` };
}

/** 트리거가 호출하는 실제 작업 함수 */
function dailyRestrictionMaintenance_() {
  try { purgeExpiredRestrictions(); } catch (e) { console.error('purge 실패:', e); }
  try { recalcRestrictedList(); } catch (e) { console.error('recalc 실패:', e); }
}

/* ==================================================
 *  관리자 작업 로그 시스템
 * ================================================== */

const ADMIN_LOG_HEADERS = ['타임스탬프', '작업자', '작업유형', '대상', '상세내용'];

/**
 * 관리자 로그 시트 확보
 */
function ensureAdminLogSheet_() {
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  let sh = ss.getSheetByName(ADMIN_LOG_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(ADMIN_LOG_SHEET_NAME);
    sh.appendRow(ADMIN_LOG_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, ADMIN_LOG_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#f3f4f6');
  }
  return sh;
}

/**
 * 관리자 작업 로그 기록
 * @param {string} actionType - 작업 유형 (승인, 반려, 삭제, 수정 등)
 * @param {string} target - 대상 (신청번호, 학번 등)
 * @param {string} details - 상세 내용
 */
function logAdminAction(actionType, target, details) {
  try {
    const sh = ensureAdminLogSheet_();
    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    const user = Session.getActiveUser().getEmail() || '알 수 없음';
    sh.appendRow([timestamp, user, actionType, target, details]);
  } catch (e) {
    console.error('관리자 로그 기록 실패:', e);
  }
}

// 내부 호출용 (_ 접미사)
function logAdminAction_(actionType, target, details) {
  logAdminAction(actionType, target, details);
}

/**
 * 관리자 로그 조회
 * @param {number} limit - 최근 N개 (기본 100)
 */
function getAdminLogs(limit) {
  const sh = ensureAdminLogSheet_();
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  const maxRows = Math.min(limit || 100, data.length - 1);
  const logs = [];
  for (let i = data.length - 1; i >= 1 && logs.length < maxRows; i--) {
    const row = data[i];
    logs.push({
      타임스탬프: row[0],
      작업자: row[1],
      작업유형: row[2],
      대상: row[3],
      상세내용: row[4]
    });
  }
  return logs;
}

/* ==================================================
 *  ✅ 백업 설정 (사용자 정의 보관 기간)
 * ================================================== */

/**
 * 백업 설정 조회
 */
function getBackupConfig() {
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  let sh = ss.getSheetByName(BACKUP_CONFIG_SHEET_NAME);
  
  if (!sh) {
    sh = ss.insertSheet(BACKUP_CONFIG_SHEET_NAME);
    sh.appendRow(['설정항목', '값']);
    sh.appendRow(['보관기간(일)', 30]);
    sh.appendRow(['백업활성화', 'Y']);
  }
  
  const data = sh.getDataRange().getValues();
  const config = {};
  for (let i = 1; i < data.length; i++) {
    config[data[i][0]] = data[i][1];
  }
  
  return {
    retentionDays: Number(config['보관기간(일)']) || 30,
    enabled: config['백업활성화'] === 'Y'
  };
}

/**
 * 백업 설정 저장
 */
function saveBackupConfig(retentionDays, enabled) {
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  let sh = ss.getSheetByName(BACKUP_CONFIG_SHEET_NAME);
  
  if (!sh) {
    sh = ss.insertSheet(BACKUP_CONFIG_SHEET_NAME);
    sh.appendRow(['설정항목', '값']);
  }
  
  // 기존 데이터 삭제 후 새로 작성
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).clearContent();
  }
  
  sh.getRange(2, 1, 2, 2).setValues([
    ['보관기간(일)', retentionDays],
    ['백업활성화', enabled ? 'Y' : 'N']
  ]);
  
  logAdminAction_('설정', '백업설정', `보관기간: ${retentionDays}일, 활성화: ${enabled ? 'Y' : 'N'}`);
  return { success: true, message: '백업 설정이 저장되었습니다.' };
}

/**
 * 일일 자동 백업 트리거 설정
 * @param {number} hourLocal - 백업 실행 시각 (0-23, 기본 2시)
 */
function setupDailyBackup(hourLocal) {
  const hour = Math.min(23, Math.max(0, Number(hourLocal ?? 2)));
  const fn = 'dailyAutoBackup_';
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === fn)
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger(fn)
    .timeBased()
    .atHour(hour)
    .everyDays(1)
    .create();
  logAdminAction_('설정', '백업 트리거', `매일 ${hour}:00 자동 백업 설정`);
  return { success: true, message: `매일 ${hour}:00 자동 백업 트리거 설정 완료` };
}

/**
 * 일일 자동 백업 실행 (트리거용) - ✅ 수정: 설정 기반 보관 기간
 */
function dailyAutoBackup_() {
  try {
    const config = getBackupConfig();
    if (!config.enabled) {
      console.log('자동 백업이 비활성화되어 있습니다.');
      return;
    }
    
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm');
    const backupName = `백업_${dateStr}`;
    
    // 백업 폴더 확보 (없으면 생성)
    const parentFolder = DriveApp.getFileById(MAIN_SSID).getParents().next();
    let backupFolder;
    const folders = parentFolder.getFoldersByName('자동백업');
    if (folders.hasNext()) {
      backupFolder = folders.next();
    } else {
      backupFolder = parentFolder.createFolder('자동백업');
    }
    
    // 스프레드시트 복사
    const backupFile = ss.copy(backupName);
    DriveApp.getFileById(backupFile.getId()).moveTo(backupFolder);
    
    // ✅ 수정: 설정된 보관 기간 적용
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - config.retentionDays);
    const oldFiles = backupFolder.getFiles();
    while (oldFiles.hasNext()) {
      const file = oldFiles.next();
      if (file.getDateCreated() < cutoffDate && file.getName().startsWith('백업_')) {
        file.setTrashed(true);
      }
    }
    
    logAdminAction_('백업', '자동백업', `백업 파일 생성: ${backupName}`);
    console.log('자동 백업 완료:', backupName);
  } catch (e) {
    console.error('자동 백업 실패:', e);
    logAdminAction_('오류', '자동백업', `백업 실패: ${e.message}`);
  }
}

/**
 * 수동 백업 실행
 */
function createManualBackup() {
  try {
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm');
    const backupName = `[수동백업] ${ss.getName()} - ${dateStr}`;
    
    const parentFolder = DriveApp.getFileById(MAIN_SSID).getParents().next();
    const backupFile = ss.copy(backupName);
    
    logAdminAction_('백업', '수동백업', `백업 파일 생성: ${backupName}`);
    return { success: true, message: `백업 완료: ${backupName}`, fileId: backupFile.getId() };
  } catch (e) {
    return { success: false, message: `백업 실패: ${e.message}` };
  }
}

/* ==================================================
 *  ✅ 사용 통계 대시보드 (신규)
 * ================================================== */

/**
 * 사용 통계 조회
 * @param {string} dateFrom - 시작일 (yyyy-MM-dd)
 * @param {string} dateTo - 종료일 (yyyy-MM-dd)
 * @returns {Object} 통계 데이터
 */
function getUsageStatistics(dateFrom, dateTo) {
  const apps = getApplicationsForPeriod(dateFrom, dateTo);
  
  // 승인된 신청만 필터링
  const approved = apps.filter(a => {
    const finalApproval = String(a['최종승인여부'] || '');
    const firstApproval = String(a['지도승인여부'] || '');
    return finalApproval === '승인' || firstApproval === '승인';
  });
  
  const byLab = {};
  const byTime = {};
  const byDate = {};
  const byDayOfWeek = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const byTeacher = {};
  
  approved.forEach(app => {
    const lab = app['신청실험실'] || '미지정';
    const time = app['신청시간'] || '미지정';
    const date = formatDateForCompare_(app['실험할날짜']);
    const teacher = app['지도교사이름'] || '미지정';
    
    // 실험실별
    byLab[lab] = (byLab[lab] || 0) + 1;
    
    // 시간대별
    byTime[time] = (byTime[time] || 0) + 1;
    
    // 일별
    if (date) {
      byDate[date] = (byDate[date] || 0) + 1;
    }
    
    // 요일별
    const d = parseToDateSafe_(app['실험할날짜']);
    if (d) {
      byDayOfWeek[d.getDay()]++;
    }
    
    // 교사별
    byTeacher[teacher] = (byTeacher[teacher] || 0) + 1;
  });
  
  return {
    summary: {
      totalApplications: apps.length,
      approvedApplications: approved.length,
      approvalRate: apps.length > 0 ? Math.round(approved.length / apps.length * 100) : 0
    },
    byLab: Object.entries(byLab)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    byTime: Object.entries(byTime)
      .map(([name, count]) => ({ name, count })),
    byDate: Object.entries(byDate)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    byDayOfWeek: ['일', '월', '화', '수', '목', '금', '토']
      .map((name, i) => ({ name, count: byDayOfWeek[i] })),
    byTeacher: Object.entries(byTeacher)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  };
}

/**
 * 신청 추이 데이터 (최근 N일)
 * @param {number} days - 조회 일수 (기본 30일)
 */
function getApplicationTrend(days) {
  const numDays = Math.min(90, Math.max(7, Number(days) || 30));
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  const sheets = ss.getSheets().filter(sh => !EXCLUDED_SHEETS.includes(sh.getName()));
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - numDays);
  startDate.setHours(0, 0, 0, 0);
  
  const dateMap = {}; // { 'yyyy-MM-dd': { total: 0, pending: 0, approved: 0, rejected: 0 } }
  
  for (const sh of sheets) {
    const data = sh.getDataRange().getValues();
    if (data.length <= 1) continue;
    
    const { map } = getHeaderMap_(sh);
    const dateIdx = map['실험할날짜'] ?? map['날짜'] ?? map['신청일'] ?? -1;
    const firstApprovalIdx = map['지도승인여부'];
    const finalApprovalIdx = map['최종승인여부'];
    
    if (dateIdx < 0) continue;
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const cellDate = parseToDateSafe_(row[dateIdx]);
      if (!cellDate || cellDate < startDate) continue;
      
      const dateKey = Utilities.formatDate(cellDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      if (!dateMap[dateKey]) {
        dateMap[dateKey] = { total: 0, pending: 0, approved: 0, rejected: 0 };
      }
      
      dateMap[dateKey].total++;
      
      const firstApproval = firstApprovalIdx !== undefined ? String(row[firstApprovalIdx] || '') : '';
      const finalApproval = finalApprovalIdx !== undefined ? String(row[finalApprovalIdx] || '') : '';
      
      if (firstApproval === '반려' || finalApproval === '반려') {
        dateMap[dateKey].rejected++;
      } else if (finalApproval === '승인') {
        dateMap[dateKey].approved++;
      } else if (firstApproval === '승인') {
        dateMap[dateKey].approved++;
      } else {
        dateMap[dateKey].pending++;
      }
    }
  }
  
  // 배열로 변환하여 정렬
  const result = Object.entries(dateMap)
    .map(([date, counts]) => ({ date, ...counts }))
    .sort((a, b) => a.date.localeCompare(b.date));
  
  return result;
}

/**
 * 실험실별 사용 통계
 * @param {string} dateFrom - 시작일 (yyyy-MM-dd)
 * @param {string} dateTo - 종료일 (yyyy-MM-dd)
 */
function getLabUsageStats(dateFrom, dateTo) {
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  const sheets = ss.getSheets().filter(sh => !EXCLUDED_SHEETS.includes(sh.getName()));
  
  const from = dateFrom ? parseToDateSafe_(dateFrom) : null;
  const to = dateTo ? parseToDateSafe_(dateTo) : null;
  
  const labStats = {}; // { '실험실명': { total: 0, approved: 0, rejected: 0 } }
  
  for (const sh of sheets) {
    const data = sh.getDataRange().getValues();
    if (data.length <= 1) continue;
    
    const { map } = getHeaderMap_(sh);
    const dateIdx = map['실험할날짜'] ?? -1;
    const labIdx = map['신청실험실'] ?? -1;
    const firstApprovalIdx = map['지도승인여부'];
    const finalApprovalIdx = map['최종승인여부'];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      if (dateIdx >= 0 && (from || to)) {
        const cellDate = parseToDateSafe_(row[dateIdx]);
        if (from && cellDate && cellDate < from) continue;
        if (to && cellDate && cellDate > to) continue;
      }
      
      const labName = labIdx >= 0 ? String(row[labIdx] || '미지정') : '미지정';
      
      if (!labStats[labName]) {
        labStats[labName] = { total: 0, approved: 0, rejected: 0, pending: 0 };
      }
      
      labStats[labName].total++;
      
      const firstApproval = firstApprovalIdx !== undefined ? String(row[firstApprovalIdx] || '') : '';
      const finalApproval = finalApprovalIdx !== undefined ? String(row[finalApprovalIdx] || '') : '';
      
      if (firstApproval === '반려' || finalApproval === '반려') {
        labStats[labName].rejected++;
      } else if (finalApproval === '승인' || firstApproval === '승인') {
        labStats[labName].approved++;
      } else {
        labStats[labName].pending++;
      }
    }
  }
  
  return Object.entries(labStats)
    .map(([lab, stats]) => ({ lab, ...stats }))
    .sort((a, b) => b.total - a.total);
}

/* ==================================================
 *  ✅ 기간별 신청 데이터 조회 (시약목록, 학생명단, 임장일정용)
 *  - 중복 함수 정의 제거됨
 * ================================================== */

/**
 * 기간별 신청 데이터 조회
 * @param {string} dateFrom - 시작일 (yyyy-MM-dd)
 * @param {string} dateTo - 종료일 (yyyy-MM-dd)
 * @returns {Array} 신청 데이터 배열
 */
function getApplicationsForPeriod(dateFrom, dateTo) {
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  const sheets = ss.getSheets().filter(sh => !EXCLUDED_SHEETS.includes(sh.getName()));

  const from = dateFrom ? parseToDateSafe_(dateFrom) : null;
  const to = dateTo ? parseToDateSafe_(dateTo) : null;

  // to 날짜는 해당 일의 끝으로 설정
  let toEnd = null;
  if (to) {
    toEnd = new Date(to.getTime());
    toEnd.setHours(23, 59, 59, 999);
  }

  // ✅ 시약 정보를 한 번에 모두 로드 (N+1 쿼리 방지)
  const chemMap = loadAllChemicalsMap_();

  const results = [];

  for (const sh of sheets) {
    const data = sh.getDataRange().getValues();
    if (data.length <= 1) continue;

    const { header, map } = getHeaderMap_(sh);
    const dateIdx = map['실험할날짜'] ?? -1;

    for (let i = 1; i < data.length; i++) {
      const row = data[i];

      // 날짜 필터링
      if (dateIdx >= 0 && (from || toEnd)) {
        const cellDate = parseToDateSafe_(row[dateIdx]);
        if (from && cellDate && cellDate < from) continue;
        if (toEnd && cellDate && cellDate > toEnd) continue;
      }

      // 객체로 변환
      const app = {};
      header.forEach((h, idx) => {
        if (h) {
          const v = row[idx];
          if (h === '제출일시' || h === '실험할날짜') {
            const d = parseToDateSafe_(v);
            app[h] = d ? toLocalISOString_(d) : (v == null ? '' : String(v));
          } else if (h === '임장지도 시작시간' || h === '임장지도 종료시간') {
            app[h] = normalizeToHHmm_(v);
          } else {
            app[h] = (v == null) ? '' : String(v);
          }
        }
      });

      // ✅ 시약 정보를 미리 로드한 맵에서 조회 (스프레드시트 재호출 없음)
      const appId = app['신청ID'] || '';
      app.chemicals = appId ? (chemMap.get(appId) || []) : [];

      results.push(app);
    }
  }

  return results;
}

/**
 * 시약 정보 파싱 (JSON 또는 개별 필드)
 */
function parseChemicalsFromApp_(app) {
  // 시약 정보가 JSON 형태로 저장된 경우
  const chemJson = app['시약정보'] || app['사용시약'] || '';
  
  if (typeof chemJson === 'string' && chemJson.trim().startsWith('[')) {
    try {
      return JSON.parse(chemJson);
    } catch(e) {
      // JSON 파싱 실패 시 빈 배열
    }
  }
  
  // 개별 필드로 저장된 경우 (시약명1, 시약량1 등)
  const chemicals = [];
  for (let i = 1; i <= 10; i++) {
    const name = app[`시약명${i}`] || app[`시약${i}`] || '';
    if (!name) continue;
    
    chemicals.push({
      시약명: name,
      상태: app[`상태${i}`] || app[`시약상태${i}`] || '',
      농도: app[`농도${i}`] || '',
      용량: app[`용량${i}`] || app[`시약량${i}`] || '',
      MSDS: app[`MSDS${i}`] || '',
      교사임장여부: app[`교사임장여부${i}`] || app['교사임장여부'] || ''
    });
  }
  
  return chemicals;
}

/**
 * 임장 일정 수정용 API
 * @param {string} appId - 신청 ID
 * @param {Object} updates - 수정할 필드들
 */
function updateScheduleFields(appId, updates) {
  if (!appId) {
    return { success: false, message: '신청 ID가 필요합니다.' };
  }
  
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  const sheets = ss.getSheets().filter(sh => !EXCLUDED_SHEETS.includes(sh.getName()));
  
  for (const sh of sheets) {
    const data = sh.getDataRange().getValues();
    if (data.length <= 1) continue;
    
    const { header, map } = getHeaderMap_(sh);
    const idIdx = map['신청ID'] ?? -1;
    
    if (idIdx < 0) continue;
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idIdx]) === String(appId)) {
        // 행 찾음 - 업데이트 수행
        const updateCols = [];
        
        for (const [field, value] of Object.entries(updates)) {
          const colIdx = map[field];
          if (colIdx !== undefined && colIdx >= 0) {
            updateCols.push({ col: colIdx + 1, value: value });
          }
        }
        
        if (updateCols.length > 0) {
          updateCols.forEach(u => {
            sh.getRange(i + 1, u.col).setValue(u.value);
          });
          
          logAdminAction_('수정', appId, `임장일정 수정: ${JSON.stringify(updates)}`);
          return { success: true, message: '저장되었습니다.' };
        }
        
        return { success: false, message: '수정할 필드를 찾을 수 없습니다.' };
      }
    }
  }
  
  return { success: false, message: '해당 신청을 찾을 수 없습니다.' };
}

function getLabList() {
  try {
    var ss = SpreadsheetApp.openById(MAIN_SSID);
    var sheets = getTargetSheets_(ss);
    var labSet = {};
    sheets.forEach(function(sh) {
      var vals = sh.getDataRange().getValues();
      if (vals.length < 2) return;
      var hdr = vals[0];
      var labCol = hdr.indexOf('신청실험실');
      if (labCol === -1) return;
      for (var i = 1; i < vals.length; i++) {
        var v = String(vals[i][labCol] || '').trim();
        if (v) labSet[v] = true;
      }
    });
    return Object.keys(labSet).sort();
  } catch (e) {
    console.error('getLabList 오류:', e);
    return [];
  }
}

/* ==================================================
 *  끝
 * ================================================== */