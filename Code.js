/* ================================================================
   과학실험실 교사 승인 시스템 — Server
   ================================================================ */

/* ── 상수 ────────────────────────────────────────────────── */
const MAIN_SSID         = '1LzQvFUj0NH69DDyrh7Vxk8bYXQzMdl-oQkZpAUm1uIE';
const TEACHER_LIST_SSID = '12OSD8W-AFCPonw6QzOSM8H93eOG_-qar-zWCDWFfT7g';
const LAB_TEACHER_SSID  = '1djvdz0W7UCnmLBWElg7G4-KsxKiPyvnwVHC8UxYIqgA';
const SCIENCE_EMAIL     = 'cnsa.science@cnsa.hs.kr';

/* ── 웹앱 엔트리 ─────────────────────────────────────────── */
function doGet(e) {
  var page = (e && e.parameter && e.parameter.page) || '';

  // PWA 매니페스트
  if (page === 'manifest') {
    var manifest = {
      name: '과학실험실 교사 승인 시스템',
      short_name: '실험실 승인',
      description: '과학 실험·실습실 사용 신청 승인 시스템',
      start_url: ScriptApp.getService().getUrl(),
      display: 'standalone',
      orientation: 'portrait',
      theme_color: '#1565c0',
      background_color: '#f4f6f9',
      icons: [
        { src: 'https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/science/default/48px.svg', sizes: '48x48', type: 'image/svg+xml' },
        { src: 'https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/science/default/48px.svg', sizes: '96x96', type: 'image/svg+xml' },
        { src: 'https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/science/default/48px.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' }
      ]
    };
    return ContentService.createTextOutput(JSON.stringify(manifest))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 서비스워커 (기본 캐시)
  if (page === 'sw') {
    var sw = "self.addEventListener('install',function(e){self.skipWaiting();});" +
             "self.addEventListener('activate',function(e){clients.claim();});" +
             "self.addEventListener('fetch',function(e){e.respondWith(fetch(e.request));});";
    return ContentService.createTextOutput(sw)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return HtmlService.createHtmlOutputFromFile('index')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setTitle('과학실험실 교사 승인 시스템');
}

/* ================================================================
   인증
   ================================================================ */

/** Google 세션에서 현재 사용자 자동 감지 */
function getCurrentUser() {
  try {
    var email = '';
    try {
      email = Session.getActiveUser().getEmail();
    } catch (sessionErr) {
      Logger.log('Session.getActiveUser 실패: ' + sessionErr.message);
    }

    if (!email) {
      try {
        email = Session.getEffectiveUser().getEmail();
      } catch (effErr) {
        Logger.log('Session.getEffectiveUser 실패: ' + effErr.message);
      }
    }

    if (!email) return { loggedIn: false, reason: 'no_session' };

    try {
      return findTeacherByEmail_(email);
    } catch (findErr) {
      Logger.log('findTeacherByEmail_ 실패: ' + findErr.message);
      return { loggedIn: false, reason: 'error', message: findErr.message, email: email };
    }
  } catch (e) {
    Logger.log('getCurrentUser 전체 실패: ' + e.message);
    return { loggedIn: false, reason: 'error', message: e.message };
  }
}

/** 교사 이름 목록 (수동 로그인용) */
function getTeacherNames() {
  var ss = SpreadsheetApp.openById(TEACHER_LIST_SSID);
  var sheet = ss.getSheets()[0];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var headers = data[0].map(function(h) { return String(h).trim(); });
  var nameIdx = colIdx_(headers, ['교사이름', '이름']);
  var subjIdx = colIdx_(headers, ['과목', '담당과목']);
  if (nameIdx < 0) return [];

  var list = [];
  for (var i = 1; i < data.length; i++) {
    var n = String(data[i][nameIdx] || '').trim();
    if (!n) continue;
    list.push({
      name: n,
      subject: subjIdx >= 0 ? String(data[i][subjIdx] || '').trim() : ''
    });
  }
  return list;
}

/** 이름으로 로그인 (수동 폴백) */
function loginWithName(teacherName) {
  var ss = SpreadsheetApp.openById(TEACHER_LIST_SSID);
  var sheet = ss.getSheets()[0];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { loggedIn: false, reason: 'no_data' };

  var headers = data[0].map(function(h) { return String(h).trim(); });
  var nameIdx  = colIdx_(headers, ['교사이름', '이름']);
  var emailIdx = colIdx_(headers, ['이메일주소', '이메일 주소', '이메일']);
  var subjIdx  = colIdx_(headers, ['과목', '담당과목']);

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][nameIdx] || '').trim() === teacherName) {
      var em = emailIdx >= 0 ? String(data[i][emailIdx] || '').trim() : '';
      return {
        loggedIn: true,
        name: teacherName,
        email: em,
        subject: subjIdx >= 0 ? String(data[i][subjIdx] || '').trim() : '',
        isFinalApprover: isFinalApprover_(teacherName, em)
      };
    }
  }
  return { loggedIn: false, reason: 'not_found' };
}

/* ================================================================
   대시보드 & 목록 조회
   ================================================================ */

/** 대시보드 통계 */
function getDashboardData(teacherName) {
  var apps = readAllApplications_();

  var myPending   = apps.filter(function(a) { return a['지도교사이름'] === teacherName && !a['지도승인여부']; });
  var myApproved  = apps.filter(function(a) { return a['지도교사이름'] === teacherName && a['지도승인여부'] === '승인'; });
  var myRejected  = apps.filter(function(a) { return a['지도교사이름'] === teacherName && a['지도승인여부'] === '반려'; });
  var finalPend   = apps.filter(function(a) { return a['지도승인여부'] === '승인' && !a['최종승인여부']; });
  var finalDone   = apps.filter(function(a) { return !!a['최종승인여부']; });

  return {
    myPending:       myPending.length,
    myApproved:      myApproved.length,
    myRejected:      myRejected.length,
    finalPending:    finalPend.length,
    finalApproved:   finalDone.filter(function(a) { return a['최종승인여부'] === '승인'; }).length,
    finalRejected:   finalDone.filter(function(a) { return a['최종승인여부'] === '반려'; }).length
  };
}

/** 필터별 신청 목록 */
function getApplicationsByFilter(teacherName, filter) {
  var apps = readAllApplications_();
  var filtered;

  switch (filter) {
    case 'my_pending':
      filtered = apps.filter(function(a) { return a['지도교사이름'] === teacherName && !a['지도승인여부']; });
      break;
    case 'my_approved':
      filtered = apps.filter(function(a) { return a['지도교사이름'] === teacherName && a['지도승인여부'] === '승인'; });
      break;
    case 'my_rejected':
      filtered = apps.filter(function(a) { return a['지도교사이름'] === teacherName && a['지도승인여부'] === '반려'; });
      break;
    case 'my_all':
      filtered = apps.filter(function(a) { return a['지도교사이름'] === teacherName; });
      break;
    case 'final_pending':
      filtered = apps.filter(function(a) { return a['지도승인여부'] === '승인' && !a['최종승인여부']; });
      break;
    case 'final_approved':
      filtered = apps.filter(function(a) { return !!a['최종승인여부'] && a['최종승인여부'] === '승인'; });
      break;
    case 'final_rejected':
      filtered = apps.filter(function(a) { return !!a['최종승인여부'] && a['최종승인여부'] === '반려'; });
      break;
    case 'final_all':
      filtered = apps.filter(function(a) { return a['지도승인여부'] === '승인'; });
      break;
    default:
      filtered = apps;
  }

  // 최신순 정렬
  filtered.sort(function(a, b) {
    return new Date(b['제출일시'] || 0) - new Date(a['제출일시'] || 0);
  });

  return filtered.map(summaryOf_);
}

/** 신청 상세 조회 */
function getApplicationDetail(appId) {
  var apps = readAllApplications_();
  var found = null;
  for (var i = 0; i < apps.length; i++) {
    if (apps[i]['신청ID'] === appId) { found = apps[i]; break; }
  }
  if (!found) return { success: false, message: '신청 내역을 찾을 수 없습니다.' };
  return { success: true, data: found };
}

/* ================================================================
   승인 / 반려 처리
   ================================================================ */

function processApproval(appId, approvalType, decision, comment) {
  if (!appId || !approvalType || !decision)
    return { success: false, message: '필수 정보가 누락되었습니다.' };
  if (decision === '반려' && !(comment || '').trim())
    return { success: false, message: '반려 시 사유를 반드시 입력해 주세요.' };

  var lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(10000))
      return { success: false, message: '동시 처리 중입니다. 잠시 후 다시 시도해 주세요.' };

    var ss    = SpreadsheetApp.openById(MAIN_SSID);
    var sheet = ss.getSheets()[0];
    var data  = sheet.getDataRange().getValues();
    var hdr   = data[0].map(function(h) { return String(h).trim(); });

    var idIdx = hdr.indexOf('신청ID');
    if (idIdx < 0) return { success: false, message: '시트 구조 오류: 신청ID 열 없음' };

    var rowIdx = -1;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idIdx]).trim() === String(appId).trim()) { rowIdx = i; break; }
    }
    if (rowIdx < 0) return { success: false, message: '해당 신청을 찾을 수 없습니다. (ID: ' + appId + ')' };

    // 원본 데이터 추출
    var appData = {};
    hdr.forEach(function(h, j) {
      var v = data[rowIdx][j];
      appData[h] = (v instanceof Date)
        ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
        : (v != null ? String(v) : '');
    });

    /* ── 지도교사 승인 ── */
    if (approvalType === 'guidance') {
      var sIdx = hdr.indexOf('지도승인여부');
      var cIdx = hdr.indexOf('지도승인의견');
      if (sIdx < 0) return { success: false, message: '시트 구조 오류 (지도승인여부)' };
      if (data[rowIdx][sIdx])
        return { success: false, message: '이미 처리된 신청입니다.' };

      sheet.getRange(rowIdx + 1, sIdx + 1).setValue(decision);
      if (cIdx >= 0) sheet.getRange(rowIdx + 1, cIdx + 1).setValue(comment || '');

      appData['지도승인여부'] = decision;
      appData['지도승인의견'] = comment || '';
      trySendGuidanceEmail_(appData, decision);

    /* ── 최종 승인 ── */
    } else if (approvalType === 'final') {
      var gIdx = hdr.indexOf('지도승인여부');
      var sIdx2 = hdr.indexOf('최종승인여부');
      var cIdx2 = hdr.indexOf('최종승인의견');
      if (sIdx2 < 0) return { success: false, message: '시트 구조 오류 (최종승인여부)' };
      if (String(data[rowIdx][gIdx] || '') !== '승인')
        return { success: false, message: '지도교사 승인이 완료되지 않은 신청입니다.' };
      if (data[rowIdx][sIdx2])
        return { success: false, message: '이미 최종 처리된 신청입니다.' };

      sheet.getRange(rowIdx + 1, sIdx2 + 1).setValue(decision);
      if (cIdx2 >= 0) sheet.getRange(rowIdx + 1, cIdx2 + 1).setValue(comment || '');

      appData['최종승인여부'] = decision;
      appData['최종승인의견'] = comment || '';
      trySendFinalEmail_(appData, decision);

    } else {
      return { success: false, message: '알 수 없는 승인 유형: ' + approvalType };
    }

    // 처리 로그
    logAction_(approvalType, appId, decision, comment);
    return { success: true, message: decision + ' 처리가 완료되었습니다.' };

  } catch (e) {
    return { success: false, message: '처리 중 오류가 발생했습니다: ' + (e.message || e) };
  } finally {
    lock.releaseLock();
  }
}

/* ================================================================
   내부 유틸리티
   ================================================================ */

/** 모든 신청 데이터 읽기 */
function readAllApplications_() {
  var ss = SpreadsheetApp.openById(MAIN_SSID);
  var sheet = ss.getSheets()[0];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var hdr = data[0].map(function(h) { return String(h).trim(); });
  var apps = [];

  for (var i = 1; i < data.length; i++) {
    var row = {};
    hdr.forEach(function(h, j) {
      var v = data[i][j];
      if (v instanceof Date) {
        v = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
      }
      row[h] = (v != null) ? String(v) : '';
    });
    if (row['신청ID']) apps.push(row);
  }
  return apps;
}

/** 요약 데이터 (목록용) */
function summaryOf_(a) {
  return {
    '신청ID':       a['신청ID'],
    '대표자학번':   a['대표자학번'],
    '대표자이름':   a['대표자이름'],
    '신청실험실':   a['신청실험실'],
    '실험할날짜':   a['실험할날짜'],
    '신청시간':     a['신청시간'],
    '실험제목':     a['실험제목'],
    '지도교사이름': a['지도교사이름'],
    '제출일시':     a['제출일시'],
    '상태':         statusOf_(a),
    '지도승인여부': a['지도승인여부'],
    '최종승인여부': a['최종승인여부'],
    '지도승인의견': a['지도승인의견'] || '',
    '최종승인의견': a['최종승인의견'] || ''
  };
}

/** 상태 계산 */
function statusOf_(a) {
  if (a['최종승인여부'] === '승인') return '최종승인';
  if (a['지도승인여부'] === '반려' || a['최종승인여부'] === '반려') return '반려';
  if (a['지도승인여부'] === '승인') return '1차승인';
  return '대기';
}

/** 헤더에서 열 인덱스 찾기 */
function colIdx_(headers, candidates) {
  for (var c = 0; c < candidates.length; c++) {
    var idx = headers.indexOf(candidates[c]);
    if (idx >= 0) return idx;
  }
  return -1;
}

/** 이메일로 교사 찾기 */
function findTeacherByEmail_(email) {
  var ss = SpreadsheetApp.openById(TEACHER_LIST_SSID);
  var sheet = ss.getSheets()[0];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { loggedIn: false, reason: 'no_data' };

  var headers = data[0].map(function(h) { return String(h).trim(); });
  var nameIdx  = colIdx_(headers, ['교사이름', '이름']);
  var emailIdx = colIdx_(headers, ['이메일주소', '이메일 주소', '이메일']);
  var subjIdx  = colIdx_(headers, ['과목', '담당과목']);
  if (nameIdx < 0 || emailIdx < 0) return { loggedIn: false, reason: 'sheet_structure' };

  var lowerEmail = email.toLowerCase();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][emailIdx] || '').trim().toLowerCase() === lowerEmail) {
      var name = String(data[i][nameIdx]).trim();
      return {
        loggedIn: true,
        name: name,
        email: email,
        subject: subjIdx >= 0 ? String(data[i][subjIdx] || '').trim() : '',
        isFinalApprover: isFinalApprover_(name, email)
      };
    }
  }
  return { loggedIn: false, reason: 'not_teacher', email: email };
}

/** 최종승인 권한 확인 (LAB_TEACHER 시트 기반) */
function isFinalApprover_(name, email) {
  try {
    var ss = SpreadsheetApp.openById(LAB_TEACHER_SSID);
    var sheets = ss.getSheets();
    for (var s = 0; s < sheets.length; s++) {
      var vals = sheets[s].getDataRange().getValues();
      for (var i = 0; i < vals.length; i++) {
        for (var j = 0; j < vals[i].length; j++) {
          var v = String(vals[i][j] || '').trim();
          if (v === name || (email && v.toLowerCase() === email.toLowerCase())) return true;
        }
      }
    }
  } catch (e) { Logger.log('isFinalApprover_ error: ' + e.message); }
  return false;
}

/* ── 이메일 ───────────────────────────────────────────── */

function sendMail_(to, subject, body) {
  var addr = String(to || '').trim();
  if (!addr || addr.indexOf('@') < 0) return;
  try {
    var opts = { htmlBody: body };
    try {
      var aliases = GmailApp.getAliases();
      if (aliases.indexOf(SCIENCE_EMAIL) !== -1) opts.from = SCIENCE_EMAIL;
    } catch (ae) { /* alias 접근 불가 — from 생략 */ }
    try {
      GmailApp.sendEmail(addr, subject, '', opts);
    } catch (fe) {
      delete opts.from;
      GmailApp.sendEmail(addr, subject, '', opts);
    }
  } catch (e) {
    Logger.log('sendMail_ error → ' + addr + ': ' + e.message);
  }
}

function trySendGuidanceEmail_(app, decision) {
  try {
    var studentName = app['대표자이름'] || '학생';
    var lab = app['신청실험실'] || '';
    var title = app['실험제목'] || '';
    var date = app['실험할날짜'] || '';

    if (decision === '승인') {
      // 실험실 담당교사에게 최종승인 요청 알림
      var labTeacherEmail = findLabTeacherEmail_(lab);
      if (labTeacherEmail) {
        sendMail_(labTeacherEmail,
          '[과학실험실] 최종 승인 요청 — ' + studentName + ' / ' + lab,
          buildEmailHtml_('최종 승인 요청',
            studentName + ' 학생의 실험실 사용 신청이 지도교사 승인을 완료하여 최종 승인이 필요합니다.',
            app));
      }
    }
    // 지도교사이메일로 처리 완료 알림 (선택)
    var teacherEmail = app['지도교사이메일'];
    if (teacherEmail) {
      sendMail_(teacherEmail,
        '[과학실험실] 지도교사 ' + decision + ' 처리 완료 — ' + title,
        buildEmailHtml_('지도교사 ' + decision + ' 완료',
          studentName + ' 학생 / ' + lab + ' / ' + date + ' 신청에 대해 ' + decision + ' 처리되었습니다.',
          app));
    }
  } catch (e) { Logger.log('trySendGuidanceEmail_ error: ' + e.message); }
}

function trySendFinalEmail_(app, decision) {
  try {
    var studentName = app['대표자이름'] || '학생';
    var lab = app['신청실험실'] || '';
    var title = app['실험제목'] || '';

    // 지도교사에게 결과 알림
    var teacherEmail = app['지도교사이메일'];
    if (teacherEmail) {
      sendMail_(teacherEmail,
        '[과학실험실] 최종 ' + decision + ' — ' + studentName + ' / ' + lab,
        buildEmailHtml_('최종 ' + decision,
          studentName + ' 학생의 "' + title + '" 실험 신청이 최종 ' + decision + ' 처리되었습니다.',
          app));
    }
  } catch (e) { Logger.log('trySendFinalEmail_ error: ' + e.message); }
}

function findLabTeacherEmail_(labName) {
  try {
    var ss = SpreadsheetApp.openById(LAB_TEACHER_SSID);
    var sheet = ss.getSheets()[0];
    var data = sheet.getDataRange().getValues();
    // 실험실-교사 매핑 시트에서 이메일 찾기
    for (var i = 0; i < data.length; i++) {
      for (var j = 0; j < data[i].length; j++) {
        if (String(data[i][j] || '').trim() === labName) {
          // 같은 행에서 이메일 찾기
          for (var k = 0; k < data[i].length; k++) {
            var v = String(data[i][k] || '').trim();
            if (v.indexOf('@') > 0) return v;
          }
        }
      }
    }
  } catch (e) {}
  return '';
}

function buildEmailHtml_(title, message, app) {
  return '<div style="font-family:\'Apple SD Gothic Neo\',\'Malgun Gothic\',sans-serif;max-width:560px;margin:0 auto;padding:20px;">' +
    '<div style="background:#1565c0;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0;">' +
    '<h2 style="margin:0;font-size:18px;">' + title + '</h2></div>' +
    '<div style="background:#fff;border:1px solid #e0e0e0;border-top:none;padding:24px;border-radius:0 0 12px 12px;">' +
    '<p style="font-size:15px;color:#333;line-height:1.6;">' + message + '</p>' +
    '<table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:13px;">' +
    emailRow_('신청자', (app['대표자이름'] || '') + ' (' + (app['대표자학번'] || '') + ')') +
    emailRow_('실험실', app['신청실험실'] || '') +
    emailRow_('날짜', app['실험할날짜'] || '') +
    emailRow_('시간', app['신청시간'] || '') +
    emailRow_('실험 제목', app['실험제목'] || '') +
    '</table>' +
    '<p style="margin-top:20px;font-size:12px;color:#999;">이 메일은 과학실험실 교사 승인 시스템에서 자동 발송되었습니다.</p>' +
    '</div></div>';
}

function emailRow_(label, value) {
  return '<tr><td style="padding:8px 12px;background:#f5f5f5;font-weight:600;width:90px;border-bottom:1px solid #eee;">' +
    label + '</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">' + value + '</td></tr>';
}

/** 처리 로그 기록 */
function logAction_(type, appId, decision, comment) {
  try {
    var ss = SpreadsheetApp.openById(MAIN_SSID);
    var logSheet = ss.getSheetByName('관리자로그');
    if (!logSheet) return;
    var user = Session.getActiveUser().getEmail() || '(수동 로그인)';
    logSheet.appendRow([
      new Date(),
      user,
      type === 'guidance' ? '지도교사승인' : '최종승인',
      appId,
      decision + (comment ? ' — ' + comment : '')
    ]);
  } catch (e) { Logger.log('logAction_ error: ' + e.message); }
}
