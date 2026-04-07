/****************************************************
 * 과학실험실 신청 조회 (최종 개선본 code.gs)
 * 
 * [기능]
 * - 대표자학번/이름으로 본인 신청 내역 조회 (목록/달력 뷰)
 * - 신청ID로 단일 상세 조회
 * - 시약 신청 내역 조회
 * - 상태 변경 이메일 알림 (설치형 트리거)
 * - URL 파라미터 자동 조회 (?id=10101&name=홍길동)
 * - PDF 다운로드 (클라이언트 jsPDF)
 ****************************************************/

/* ── 설정 상수 ── */
var CONFIG = {
  MAIN_SHEET_ID: '1LzQvFUj0NH69DDyrh7Vxk8bYXQzMdl-oQkZpAUm1uIE',
  CHEM_SHEET_ID: '1IwVM6k4etSs-vSXFqp-3GrUJuzVhIgoBErzgMQd2GOs',
  RATE_LIMIT_MS: 3000,
  RATE_LIMIT_TTL: 5
};

var CACHE_TTL = 60; // seconds

function getCachedRecords_(repId, repName) {
  var cache = CacheService.getUserCache();
  var key = 'records_' + repId + '_' + repName;
  var cached = cache.get(key);
  if (cached) {
    try { return JSON.parse(cached); } catch(e) { /* fall through */ }
  }

  var all = getAllRecords_();
  var trimId = repId.trim();
  var trimName = repName.trim();
  var filtered = all.filter(function(r) {
    return r['대표자학번'] === trimId && r['대표자이름'] === trimName;
  });
  filtered.sort(function(a, b) {
    return parseDate(b['실험할날짜']) - parseDate(a['실험할날짜']);
  });

  // Cache up to 6000 bytes (GAS cache limit is 100KB per key)
  try {
    var json = JSON.stringify(filtered);
    if (json.length < 90000) {
      cache.put(key, json, CACHE_TTL);
    }
  } catch(e) { /* cache write failure is ok */ }

  return filtered;
}

/* ══════════════════════════════════════════════
   1. 웹 앱 진입점
   ══════════════════════════════════════════════ */
function doGet(e) {
  var template = HtmlService.createTemplateFromFile('index');
  template.paramId   = (e && e.parameter && e.parameter.id)   ? e.parameter.id   : '';
  template.paramName = (e && e.parameter && e.parameter.name) ? e.parameter.name : '';

  return template.evaluate()
    .setTitle('과학실험실 신청 조회')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/* ══════════════════════════════════════════════
   2. 유효성 검사
   ══════════════════════════════════════════════ */
function isValidRepId(str) {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9]{5}$/.test(str.trim());
}

function isValidRepName(str) {
  if (!str || typeof str !== 'string') return false;
  var trimmed = str.trim();
  if (trimmed.length === 0 || trimmed.length > 20) return false;
  return /^[가-힣a-zA-Z\s]+$/.test(trimmed);
}

function isValidIdString(str, maxLength) {
  if (!str || typeof str !== 'string') return false;
  if (str.length > maxLength) return false;
  if (/[^a-zA-Z0-9가-힣\s\-\_]/.test(str)) return false;
  return true;
}

/* ══════════════════════════════════════════════
   3. 요청 제한 / 유틸
   ══════════════════════════════════════════════ */
/**
 * 요청 빈도 제한 (함수별 독립 키 사용)
 * @param {string} funcName - 호출 함수명 (함수별로 독립적으로 제한)
 */
function checkRateLimit(funcName) {
  var cache = CacheService.getUserCache();
  var userBase = Session.getActiveUser().getEmail() || Session.getTemporaryActiveUserKey();
  var key = userBase + '_' + funcName;
  var lastRequest = cache.get(key);
  if (lastRequest && (Date.now() - Number(lastRequest) < CONFIG.RATE_LIMIT_MS)) {
    throw new Error('요청이 너무 잦습니다. 잠시 후 다시 시도하세요.');
  }
  cache.put(key, Date.now().toString(), CONFIG.RATE_LIMIT_TTL);
}

function logError(location, error) {
  Logger.log('[%s] %s', location, error && error.message ? error.message : error);
}

function getUserKey_() {
  return Session.getActiveUser().getEmail() || Session.getTemporaryActiveUserKey();
}

/* ══════════════════════════════════════════════
   4. 데이터 조회
   ══════════════════════════════════════════════ */
function getAllRecords_() {
  var ss    = SpreadsheetApp.openById(CONFIG.MAIN_SHEET_ID);
  var sheet = ss.getSheets()[0];
  var data  = sheet.getDataRange().getDisplayValues();
  var headers = data.shift().map(function(h) { return String(h).trim(); });

  return data.map(function(row) {
    var obj = {};
    row.forEach(function(cell, i) {
      obj[headers[i]] = String(cell).trim();
    });
    return obj;
  });
}

function parseDate(dateStr) {
  if (!dateStr || dateStr === '-') return new Date(0);
  var cleaned = dateStr.replace(/[.\-\/]/g, '-');
  var parsed = new Date(cleaned);
  return isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function getRecords(repId, repName) {
  try {
    checkRateLimit('getRecords');
    if (!isValidRepId(repId)) throw new Error('학번은 5자리 숫자여야 합니다.');
    if (!isValidRepName(repName)) throw new Error('이름이 올바르지 않습니다.');

    var results = getCachedRecords_(repId, repName);
    // C-2: 최근 50건만 반환
    return results.slice(0, 50);
  } catch (e) {
    logError('getRecords', e);
    throw e;
  }
}

function getRecordsPage(repId, repName, offset) {
  try {
    checkRateLimit('getRecordsPage');
    if (!isValidRepId(repId)) throw new Error('학번은 5자리 숫자여야 합니다.');
    if (!isValidRepName(repName)) throw new Error('이름이 올바르지 않습니다.');

    var results = getCachedRecords_(repId, repName);
    var start = Number(offset) || 0;
    var page = results.slice(start, start + 50);
    return { records: page, hasMore: (start + 50) < results.length, total: results.length };
  } catch (e) {
    logError('getRecordsPage', e);
    throw e;
  }
}

function getRecordById(applyId) {
  try {
    checkRateLimit('getRecordById');
    if (!isValidIdString(applyId, 30)) throw new Error('잘못된 신청ID입니다.');
    var all = getAllRecords_();
    var found = all.find(function(r) { return r['신청ID'] === applyId; });
    return found || null;
  } catch (e) {
    logError('getRecordById', e);
    throw e;
  }
}

function getChemicalsByApplyId(applyId) {
  try {
    checkRateLimit('getChemicalsByApplyId');
    if (!isValidIdString(applyId, 30)) throw new Error('잘못된 신청ID입니다.');

    var ss    = SpreadsheetApp.openById(CONFIG.CHEM_SHEET_ID);
    var sheet = ss.getSheets()[0];
    var data  = sheet.getDataRange().getDisplayValues();
    if (data.length < 2) return [];

    var headers  = data[0].map(function(h) { return String(h).trim(); });
    var targetId = String(applyId).trim();

    var rows = data.slice(1).filter(function(row) {
      return String(row[0]).trim() === targetId;
    });

    return rows.map(function(row) {
      var obj = {};
      row.forEach(function(cell, i) {
        obj[headers[i] || ('COL' + i)] = String(cell).trim();
      });
      return obj;
    });
  } catch (e) {
    logError('getChemicalsByApplyId', e);
    throw e;
  }
}

/* ══════════════════════════════════════════════
   5. 상태 변경 이메일 알림 (설치형 트리거)
   ══════════════════════════════════════════════ */

/**
 * 설치 방법:
 *   1) Apps Script 편집기 → 트리거 → 트리거 추가
 *   2) 함수: onStatusChange / 이벤트: 스프레드시트 → 편집 시
 *   ※ 스프레드시트에 '대표자이메일' 또는 '이메일' 열 필요
 */
function onStatusChange(e) {
  try {
    if (!e || !e.range) return;

    var sheet   = e.range.getSheet();
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    var col     = e.range.getColumn();
    var colName = headers[col - 1] || '';

    if (colName !== '지도승인여부' && colName !== '최종승인여부') return;

    var row     = e.range.getRow();
    var rowData = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];

    var record = {};
    headers.forEach(function(h, i) {
      record[String(h).trim()] = String(rowData[i]).trim();
    });

    var email = record['대표자이메일'] || record['이메일'] || '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;

    var name    = record['대표자이름'] || '학생';
    var labDate = record['실험할날짜'] || '';
    var lab     = record['신청실험실'] || '';
    var newVal  = String(e.value || '').trim();

    var stepName = colName === '지도승인여부' ? '1차 승인' : '최종 승인';
    var subject  = '[과학실험실] ' + stepName + ' 상태 변경 알림';
    var body     = name + '님의 실험실 사용 신청 상태가 변경되었습니다.\n\n'
                 + '■ 실험실: ' + lab + '\n'
                 + '■ 실험 날짜: ' + labDate + '\n'
                 + '■ 변경 단계: ' + stepName + '\n'
                 + '■ 변경 상태: ' + (newVal || '(비어있음)') + '\n\n'
                 + '상세 내역은 조회 페이지에서 확인하세요.';

    GmailApp.sendEmail(email, subject, '', { from: 'cnsa.science@cnsa.hs.kr', htmlBody: '<pre>' + body + '</pre>' });
  } catch (err) {
    logError('onStatusChange', err);
  }
}