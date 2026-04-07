/**
 * ============================================
 * 보고서 시스템 함수 모음
 * ReportFunctions.gs
 * 
 * 기존 Code.gs에 추가하지 않고 별도 파일로 관리
 * 
 * [업데이트 내역]
 * - 필터 옵션 조회 (실험실, 지도교사 목록)
 * - 미제출 확정 기능 (확정/취소/목록조회)
 * - 일괄 처리 기능 (완료/연장/확정/알림)
 * - 엑셀 내보내기 기능
 * - 통계에 미제출확정 반영
 * - 미제출 목록에 시간/지도교사 필드 추가
 * - ✅ 패널티 수동화 (자동 → 대기목록 → 수동 승인)
 * - ✅ 이메일 발송 기능 강화
 * - ✅ 연장 마감일 검증 추가
 * ============================================
 */

/* =============== 상수 =============== */
const RPT_SHEET_NAME = '보고서제출현황';
const RPT_POLICY_SHEET_NAME = '보고서정책';
const RPT_RESTRICTION_SHEET_NAME = '신청제한명단';
const RPT_CONFIRMED_SHEET_NAME = '미제출확정';
const RPT_EXTENSION_SHEET_NAME = '보고서마감연장';
const RPT_PENALTY_PENDING_SHEET_NAME = '패널티대기목록';  // ✅ 신규

/* =============== 보고서 정책 =============== */

/**
 * 보고서 정책 조회
 * @returns {Object} {deadlineDays, penaltyThreshold, restrictionDays}
 */
function getReportPolicy() {
  try {
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    let sh = ss.getSheetByName(RPT_POLICY_SHEET_NAME);
    
    // 시트가 없으면 기본값 반환
    if (!sh) {
      return { deadlineDays: 7, penaltyThreshold: 2, restrictionDays: 30 };
    }
    
    const vals = sh.getDataRange().getValues();
    if (vals.length < 2) {
      return { deadlineDays: 7, penaltyThreshold: 2, restrictionDays: 30 };
    }
    
    return {
      deadlineDays: Number(vals[1][0]) || 7,
      penaltyThreshold: Number(vals[1][1]) || 2,
      restrictionDays: Number(vals[1][2]) || 30
    };
  } catch(e) {
    Logger.log('getReportPolicy 오류: ' + (e.message || e));
    return { deadlineDays: 7, penaltyThreshold: 2, restrictionDays: 30 };
  }
}

/**
 * 보고서 정책 저장 (관리자용)
 */
function saveReportPolicy(policy) {
  try {
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    let sh = ss.getSheetByName(RPT_POLICY_SHEET_NAME);
    
    if (!sh) {
      sh = ss.insertSheet(RPT_POLICY_SHEET_NAME);
      sh.appendRow(['제출기한(일)', '패널티기준(회)', '제한기간(일)']);
      sh.appendRow([7, 2, 30]);
    }
    
    sh.getRange(2, 1, 1, 3).setValues([[
      policy.deadlineDays || 7,
      policy.penaltyThreshold || 2,
      policy.restrictionDays || 30
    ]]);
    
    return '보고서 정책이 저장되었습니다.';
  } catch(e) {
    Logger.log('saveReportPolicy 오류: ' + (e.message || e));
    throw new Error('보고서 정책 저장 실패: ' + (e.message || e));
  }
}

/* =============== 필터 옵션 =============== */

/**
 * 필터 옵션 조회 (실험실, 지도교사 목록)
 */
function getReportFilterOptions() {
  try {
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const mainSh = ss.getSheets()[0];
    const vals = mainSh.getDataRange().getValues();
    
    if (vals.length < 2) return { labs: [], teachers: [] };
    
    const hdr = vals[0];
    const labIdx = hdr.indexOf('신청실험실');
    const teacherIdx = hdr.indexOf('지도교사이름');
    
    const labSet = new Set();
    const teacherSet = new Set();
    
    for (let i = 1; i < vals.length; i++) {
      if (labIdx >= 0 && vals[i][labIdx]) {
        labSet.add(String(vals[i][labIdx]).trim());
      }
      if (teacherIdx >= 0 && vals[i][teacherIdx]) {
        teacherSet.add(String(vals[i][teacherIdx]).trim());
      }
    }
    
    return {
      labs: Array.from(labSet).sort(),
      teachers: Array.from(teacherSet).sort()
    };
  } catch(e) {
    Logger.log('getReportFilterOptions 오류: ' + (e.message || e));
    return { labs: [], teachers: [] };
  }
}

/* =============== 미제출 보고서 조회 =============== */

/**
 * 학생의 미제출 보고서 목록 조회
 */
function getStudentPendingReports(studentId, studentName) {
  try {
    const policy = getReportPolicy();
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const sh = ss.getSheets()[0];
    const vals = sh.getDataRange().getValues();
    
    if (vals.length < 2) return [];
    
    const hdr = vals[0];
    const idx = {
      id: hdr.indexOf('신청ID'),
      sid: hdr.indexOf('대표자학번'),
      name: hdr.indexOf('대표자이름'),
      date: hdr.indexOf('실험할날짜'),
      lab: hdr.indexOf('신청실험실'),
      time: hdr.indexOf('신청시간'),
      title: hdr.indexOf('실험제목'),
      final: hdr.indexOf('최종승인여부')
    };
    
    // 이미 제출된 보고서 신청ID 목록
    const submittedIds = new Set();
    const reportSh = ss.getSheetByName(RPT_SHEET_NAME);
    if (reportSh) {
      const reportVals = reportSh.getDataRange().getValues();
      const reportIdCol = reportVals[0].indexOf('신청ID');
      if (reportIdCol >= 0) {
        for (let i = 1; i < reportVals.length; i++) {
          submittedIds.add(String(reportVals[i][reportIdCol]));
        }
      }
    }
    
    // 미제출 확정된 목록
    const confirmedIds = new Set();
    const confirmedSh = ss.getSheetByName(RPT_CONFIRMED_SHEET_NAME);
    if (confirmedSh) {
      const confVals = confirmedSh.getDataRange().getValues();
      const confIdCol = confVals[0].indexOf('신청ID');
      if (confIdCol >= 0) {
        for (let i = 1; i < confVals.length; i++) {
          confirmedIds.add(String(confVals[i][confIdCol]));
        }
      }
    }
    
    // 연장 정보 로드
    const extensions = {};
    const extSh = ss.getSheetByName(RPT_EXTENSION_SHEET_NAME);
    if (extSh) {
      const extVals = extSh.getDataRange().getValues();
      for (let i = 1; i < extVals.length; i++) {
        const extAppId = String(extVals[i][0]);
        extensions[extAppId] = String(extVals[i][2]);
      }
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sid = String(studentId).trim();
    const pending = [];
    
    for (let i = 1; i < vals.length; i++) {
      const row = vals[i];
      
      // 본인 신청 + 최종승인 완료만
      if (String(row[idx.sid]).trim() !== sid) continue;
      if (String(row[idx.final]).trim() !== '승인') continue;
      
      const appId = String(row[idx.id]);
      if (submittedIds.has(appId)) continue; // 이미 제출됨
      if (confirmedIds.has(appId)) continue; // 미제출 확정됨
      
      // 실험 날짜가 과거인 것만
      const expDate = new Date(row[idx.date]);
      if (isNaN(expDate.getTime())) continue;
      expDate.setHours(0, 0, 0, 0);
      if (expDate > today) continue; // 아직 실험 전
      
      // ✅ 마감일 계산 (연장 적용) - 유효성 검증 추가
      let deadline;
      if (extensions[appId]) {
        const parsed = new Date(extensions[appId]);
        // ✅ 유효성 검증
        if (!isNaN(parsed.getTime())) {
          deadline = parsed;
        } else {
          deadline = new Date(expDate.getTime() + policy.deadlineDays * 24 * 60 * 60 * 1000);
        }
      } else {
        deadline = new Date(expDate.getTime() + policy.deadlineDays * 24 * 60 * 60 * 1000);
      }
      const daysRemaining = Math.ceil((deadline - today) / (24 * 60 * 60 * 1000));
      const isOverdue = daysRemaining < 0;
      
      pending.push({
        appId: appId,
        experimentDate: Utilities.formatDate(expDate, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
        lab: row[idx.lab] || '',
        time: row[idx.time] || '',
        title: row[idx.title] || '',
        deadline: Utilities.formatDate(deadline, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
        daysRemaining: daysRemaining,
        isOverdue: isOverdue
      });
    }
    
    // 마감일 기준 정렬 (급한 것 먼저)
    pending.sort((a, b) => a.daysRemaining - b.daysRemaining);
    
    return pending;
  } catch(e) {
    Logger.log('getStudentPendingReports 오류: ' + (e.message || e));
    throw new Error('미제출 보고서 조회 실패: ' + (e.message || e));
  }
}

/**
 * 미제출 보고서 개수 조회
 */
function getPendingReportCount(studentId, studentName) {
  try {
    const pending = getStudentPendingReports(studentId, studentName);
    return pending.length;
  } catch(e) { return 0; }
}

/* =============== 보고서 제출 =============== */

/**
 * 보고서 작성용 신청 정보 조회
 */
function getApplicationForReport(appId) {
  try {
    const rec = getApplicationById(appId); // AdminFunctions.gs 함수 활용
    if (!rec) throw new Error('신청서를 찾을 수 없습니다.');
    
    return {
      appId: rec['신청ID'] || appId,
      experimentDate: rec['실험할날짜'] || '',
      lab: rec['신청실험실'] || '',
      time: rec['신청시간'] || '',
      title: rec['실험제목'] || '',
      studentId: rec['대표자학번'] || '',
      studentName: rec['대표자이름'] || '',
      teamMembers: rec['동반자명단'] || '',
      materials: rec['실험준비물'] || '',
      process: rec['실험과정'] || '',
      cleanup: rec['실험뒷정리'] || '',
      precautions: rec['실험시 주의사항'] || '',
      chemicals: rec.chemicals || []
    };
  } catch(e) {
    Logger.log('getApplicationForReport 오류: ' + (e.message || e));
    throw new Error('신청 정보 조회 실패: ' + (e.message || e));
  }
}

/**
 * 보고서 제출
 */
function submitReport(reportData) {
  try {
    const appId = String(reportData.appId || '').trim();
    if (!appId) throw new Error('신청ID가 없습니다.');
    
    // 신청 정보 확인
    const app = getApplicationById(appId);
    if (!app) throw new Error('신청서를 찾을 수 없습니다.');
    
    const studentId = String(reportData.studentId || '').trim();
    const studentName = String(reportData.studentName || '').trim();
    
    // 본인 확인
    if (String(app['대표자학번']).trim() !== studentId) {
      throw new Error('본인의 신청서만 보고서를 작성할 수 있습니다.');
    }
    
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    let sh = ss.getSheetByName(RPT_SHEET_NAME);
    
    // 시트 없으면 생성
    if (!sh) {
      sh = ss.insertSheet(RPT_SHEET_NAME);
      sh.appendRow([
        '신청ID', '제출일시', '대표자학번', '대표자이름',
        '실험완료여부', '실제실험과정', '실제사용도구', '실험결과',
        '시약사용량', '뒷정리완료여부', '안전문제발생여부', '안전문제내용',
        '미완료사유', '후속계획', '실험유형', '다음실험계획', '기타의견'
      ]);
    }
    
    // 중복 제출 확인
    const vals = sh.getDataRange().getValues();
    const idCol = vals[0].indexOf('신청ID');
    if (idCol >= 0) {
      for (let i = 1; i < vals.length; i++) {
        if (String(vals[i][idCol]) === appId) {
          throw new Error('이미 보고서가 제출된 신청입니다.');
        }
      }
    }
    
    const now = new Date();
    sh.appendRow([
      appId,
      now,
      studentId,
      studentName,
      reportData.completed || '',
      reportData.actualProcess || '',
      reportData.actualTools || '',
      reportData.results || '',
      reportData.reagentUsage || '',
      reportData.cleanupDone || '',
      reportData.safetyIssue || '',
      reportData.safetyIssueDetail || '',
      reportData.incompleteReason || '',
      reportData.followUpPlan || '',
      reportData.experimentType || '',
      reportData.nextPlan || '',
      reportData.otherComments || ''
    ]);
    
    return '보고서가 제출되었습니다.';
  } catch(e) {
    Logger.log('submitReport 오류: ' + (e.message || e));
    throw e;
  }
}

/* =============== 마감 체크 & 패널티 (✅ 수정됨 - 수동화) =============== */

/**
 * ✅ 패널티 대기 목록 시트 확보
 */
function ensurePenaltyPendingSheet_() {
  const ss = SpreadsheetApp.openById(MAIN_SSID);
  let sh = ss.getSheetByName(RPT_PENALTY_PENDING_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(RPT_PENALTY_PENDING_SHEET_NAME);
    sh.appendRow(['신청ID', '학번', '이름', '초과일수', '등록일시', '처리상태', '처리일시', '처리자']);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#f3f4f6');
  }
  return sh;
}

/**
 * ✅ 패널티 대기 목록에 추가
 */
function addToPenaltyPendingList(appId, studentId, studentName, overdueDays) {
  const sh = ensurePenaltyPendingSheet_();
  
  // 중복 확인
  const vals = sh.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === String(appId) && String(vals[i][5]) === '대기') {
      return; // 이미 대기 중
    }
  }
  
  sh.appendRow([
    appId,
    studentId,
    studentName,
    overdueDays,
    new Date(),
    '대기',
    '',
    ''
  ]);
}

/**
 * ✅ 패널티 대기 목록 조회
 */
function getPenaltyPendingList() {
  try {
    const sh = ensurePenaltyPendingSheet_();
    const vals = sh.getDataRange().getValues();
    
    if (vals.length < 2) return { list: [], total: 0 };
    
    const list = [];
    for (let i = 1; i < vals.length; i++) {
      const row = vals[i];
      if (String(row[5]) === '대기') {
        list.push({
          appId: String(row[0] || ''),
          studentId: String(row[1] || ''),
          studentName: String(row[2] || ''),
          overdueDays: Number(row[3] || 0),
          registeredDate: row[4] ? Utilities.formatDate(new Date(row[4]), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') : '',
          status: String(row[5] || ''),
          rowIndex: i + 1
        });
      }
    }
    
    return { list, total: list.length };
  } catch (e) {
    Logger.log('getPenaltyPendingList 오류: ' + (e.message || e));
    return { list: [], total: 0 };
  }
}

/**
 * ✅ 수동 패널티 승인
 */
function approvePenalty(appId) {
  try {
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const pendingSh = ensurePenaltyPendingSheet_();
    const vals = pendingSh.getDataRange().getValues();
    
    let targetRow = -1;
    let studentId = '';
    let studentName = '';
    
    for (let i = 1; i < vals.length; i++) {
      if (String(vals[i][0]) === String(appId) && String(vals[i][5]) === '대기') {
        targetRow = i + 1;
        studentId = String(vals[i][1] || '');
        studentName = String(vals[i][2] || '');
        break;
      }
    }
    
    if (targetRow < 0) {
      throw new Error('해당 패널티 대기 항목을 찾을 수 없습니다.');
    }
    
    // 제한 명단에 추가
    const policy = getReportPolicy();
    let restrictionSh = ss.getSheetByName(RPT_RESTRICTION_SHEET_NAME);
    if (!restrictionSh) {
      restrictionSh = ss.insertSheet(RPT_RESTRICTION_SHEET_NAME);
      restrictionSh.appendRow(['학번', '사유', '제한시작일', '제한종료일', '추가일시']);
    }
    
    const now = new Date();
    const endDate = new Date(now.getTime() + policy.restrictionDays * 24 * 60 * 60 * 1000);
    
    restrictionSh.appendRow([
      studentId,
      '보고서 미제출 (수동 승인)',
      Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      Utilities.formatDate(endDate, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      now
    ]);
    
    // 대기 목록 상태 업데이트
    pendingSh.getRange(targetRow, 6).setValue('승인');
    pendingSh.getRange(targetRow, 7).setValue(now);
    pendingSh.getRange(targetRow, 8).setValue(Session.getActiveUser().getEmail() || '알 수 없음');
    
    // 관리자 로그 기록
    logAdminAction('패널티승인', studentId, `${studentName}에게 ${policy.restrictionDays}일 제한 부과`);
    
    return { success: true, message: `${studentName} 학생에게 ${policy.restrictionDays}일 신청 제한이 부과되었습니다.` };
  } catch (e) {
    Logger.log('approvePenalty 오류: ' + (e.message || e));
    throw e;
  }
}

/**
 * ✅ 패널티 거부 (대기 목록에서 제거)
 */
function rejectPenalty(appId, reason) {
  try {
    const pendingSh = ensurePenaltyPendingSheet_();
    const vals = pendingSh.getDataRange().getValues();
    
    let targetRow = -1;
    let studentId = '';
    let studentName = '';
    
    for (let i = 1; i < vals.length; i++) {
      if (String(vals[i][0]) === String(appId) && String(vals[i][5]) === '대기') {
        targetRow = i + 1;
        studentId = String(vals[i][1] || '');
        studentName = String(vals[i][2] || '');
        break;
      }
    }
    
    if (targetRow < 0) {
      throw new Error('해당 패널티 대기 항목을 찾을 수 없습니다.');
    }
    
    const now = new Date();
    pendingSh.getRange(targetRow, 6).setValue('거부');
    pendingSh.getRange(targetRow, 7).setValue(now);
    pendingSh.getRange(targetRow, 8).setValue(Session.getActiveUser().getEmail() || '알 수 없음');
    
    logAdminAction('패널티거부', studentId, `${studentName} - 사유: ${reason || '없음'}`);
    
    return { success: true, message: '패널티가 거부되었습니다.' };
  } catch (e) {
    Logger.log('rejectPenalty 오류: ' + (e.message || e));
    throw e;
  }
}

/**
 * 보고서 마감 체크 (✅ 수정됨 - 자동 패널티 대신 대기 목록에 추가)
 */
function checkReportDeadlines() {
  try {
    const policy = getReportPolicy();
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const mainSh = ss.getSheets()[0];
    const vals = mainSh.getDataRange().getValues();
    
    if (vals.length < 2) return;
    
    const hdr = vals[0];
    const idx = {
      id: hdr.indexOf('신청ID'),
      sid: hdr.indexOf('대표자학번'),
      name: hdr.indexOf('대표자이름'),
      date: hdr.indexOf('실험할날짜'),
      final: hdr.indexOf('최종승인여부')
    };
    
    // 제출된 보고서 목록
    const submittedIds = new Set();
    const reportSh = ss.getSheetByName(RPT_SHEET_NAME);
    if (reportSh) {
      const reportVals = reportSh.getDataRange().getValues();
      const reportIdCol = reportVals[0].indexOf('신청ID');
      if (reportIdCol >= 0) {
        for (let i = 1; i < reportVals.length; i++) {
          submittedIds.add(String(reportVals[i][reportIdCol]));
        }
      }
    }
    
    // 미제출 확정된 목록
    const confirmedIds = new Set();
    const confirmedSh = ss.getSheetByName(RPT_CONFIRMED_SHEET_NAME);
    if (confirmedSh) {
      const confVals = confirmedSh.getDataRange().getValues();
      const confIdCol = confVals[0].indexOf('신청ID');
      if (confIdCol >= 0) {
        for (let i = 1; i < confVals.length; i++) {
          confirmedIds.add(String(confVals[i][confIdCol]));
        }
      }
    }
    
    // 연장 정보 로드
    const extensions = {};
    const extSh = ss.getSheetByName(RPT_EXTENSION_SHEET_NAME);
    if (extSh) {
      const extVals = extSh.getDataRange().getValues();
      for (let i = 1; i < extVals.length; i++) {
        const extAppId = String(extVals[i][0]);
        extensions[extAppId] = String(extVals[i][2]);
      }
    }
    
    // 이미 대기 중인 항목
    const pendingIds = new Set();
    const pendingSh = ensurePenaltyPendingSheet_();
    const pendingVals = pendingSh.getDataRange().getValues();
    for (let i = 1; i < pendingVals.length; i++) {
      if (String(pendingVals[i][5]) === '대기') {
        pendingIds.add(String(pendingVals[i][0]));
      }
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // 학생별 연체 항목 수집
    const overdueItems = [];
    
    for (let i = 1; i < vals.length; i++) {
      const row = vals[i];
      if (String(row[idx.final]).trim() !== '승인') continue;
      
      const appId = String(row[idx.id]);
      if (submittedIds.has(appId)) continue;
      if (confirmedIds.has(appId)) continue;
      if (pendingIds.has(appId)) continue; // 이미 대기 중
      
      const expDate = new Date(row[idx.date]);
      if (isNaN(expDate.getTime())) continue;
      expDate.setHours(0, 0, 0, 0);
      
      // ✅ 마감일 계산 (연장 적용) - 유효성 검증 추가
      let deadline;
      if (extensions[appId]) {
        const parsed = new Date(extensions[appId]);
        if (!isNaN(parsed.getTime())) {
          deadline = parsed;
        } else {
          deadline = new Date(expDate.getTime() + policy.deadlineDays * 24 * 60 * 60 * 1000);
        }
      } else {
        deadline = new Date(expDate.getTime() + policy.deadlineDays * 24 * 60 * 60 * 1000);
      }
      
      if (today <= deadline) continue; // 아직 마감 전
      
      const overdueDays = Math.ceil((today - deadline) / (24 * 60 * 60 * 1000));
      const sid = String(row[idx.sid]).trim();
      const name = String(row[idx.name]).trim();
      
      overdueItems.push({
        appId,
        studentId: sid,
        studentName: name,
        overdueDays
      });
    }
    
    // ✅ 수정: 자동 패널티 대신 대기 목록에 추가
    overdueItems.forEach(item => {
      addToPenaltyPendingList(item.appId, item.studentId, item.studentName, item.overdueDays);
    });
    
    Logger.log(`checkReportDeadlines 완료: ${overdueItems.length}건 대기 목록 추가`);
  } catch(e) {
    Logger.log('checkReportDeadlines 오류: ' + (e.message || e));
  }
}

/**
 * 보고서 마감 체크 트리거 설치
 */
function installReportDeadlineTrigger_() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    const exists = triggers.some(t => t.getHandlerFunction() === 'checkReportDeadlines');
    if (exists) {
      Logger.log('checkReportDeadlines 트리거가 이미 존재합니다.');
      return '트리거가 이미 존재합니다.';
    }
    ScriptApp.newTrigger('checkReportDeadlines')
      .timeBased()
      .everyDays(1)
      .atHour(2)
      .create();
    Logger.log('checkReportDeadlines 트리거가 설치되었습니다.');
    return '트리거가 설치되었습니다.';
  } catch(e) {
    Logger.log('installReportDeadlineTrigger_ 오류: ' + (e.message || e));
    return '트리거 설치 실패: ' + (e.message || e);
  }
}

/* =============== 제한 상태 확인 =============== */

/**
 * 학생의 신청 제한 상태 확인 (보고서 패널티 포함)
 */
function getStudentRestrictionStatus(studentId) {
  try {
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const sh = ss.getSheetByName(RPT_RESTRICTION_SHEET_NAME);
    
    if (!sh) return { isRestricted: false };
    
    const vals = sh.getDataRange().getValues();
    if (vals.length < 2) return { isRestricted: false };
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sid = String(studentId).trim();
    
    for (let i = 1; i < vals.length; i++) {
      if (String(vals[i][0]).trim() !== sid) continue;
      
      const endDateStr = vals[i][3];
      if (!endDateStr) continue;
      
      const endDate = new Date(endDateStr);
      if (isNaN(endDate.getTime())) continue;
      endDate.setHours(23, 59, 59, 999);
      
      if (today <= endDate) {
        return {
          isRestricted: true,
          reason: vals[i][1] || '신청 제한',
          endDate: Utilities.formatDate(endDate, Session.getScriptTimeZone(), 'yyyy-MM-dd')
        };
      }
    }
    
    return { isRestricted: false };
  } catch(e) {
    Logger.log('getStudentRestrictionStatus 오류: ' + (e.message || e));
    return { isRestricted: false };
  }
}

/* =============== 관리자용 함수 =============== */

/**
 * 보고서 제출 현황 조회 (관리자용)
 */
function getReportList(filters) {
  try {
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const reportSh = ss.getSheetByName(RPT_SHEET_NAME);
    
    if (!reportSh) return { reports: [], total: 0 };
    
    const vals = reportSh.getDataRange().getValues();
    if (vals.length < 2) return { reports: [], total: 0 };
    
    const hdr = vals[0];
    const idx = {};
    hdr.forEach((h, i) => idx[h] = i);
    
    // 신청 정보 매핑 (실험일, 실험실 등)
    const mainSh = ss.getSheets()[0];
    const mainVals = mainSh.getDataRange().getValues();
    const mainHdr = mainVals[0];
    const mainIdx = {
      id: mainHdr.indexOf('신청ID'),
      date: mainHdr.indexOf('실험할날짜'),
      lab: mainHdr.indexOf('신청실험실')
    };
    
    const appInfo = {};
    for (let i = 1; i < mainVals.length; i++) {
      const appId = String(mainVals[i][mainIdx.id]);
      const expDate = mainVals[i][mainIdx.date];
      appInfo[appId] = {
        experimentDate: expDate ? Utilities.formatDate(new Date(expDate), Session.getScriptTimeZone(), 'yyyy-MM-dd') : '',
        lab: mainVals[i][mainIdx.lab] || ''
      };
    }
    
    const reports = [];
    for (let i = 1; i < vals.length; i++) {
      const row = vals[i];
      const appId = String(row[idx['신청ID']] || '');
      const info = appInfo[appId] || {};
      
      reports.push({
        appId: appId,
        submittedAt: row[idx['제출일시']] || '',
        studentId: row[idx['대표자학번']] || '',
        studentName: row[idx['대표자이름']] || '',
        experimentDate: info.experimentDate || '',
        lab: info.lab || '',
        completed: row[idx['실험완료여부']] || '',
        safetyIssue: row[idx['안전문제발생여부']] || '',
        safetyIssueDetail: row[idx['안전문제내용']] || ''
      });
    }
    
    // 최신순 정렬
    reports.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    
    return { reports: reports, total: reports.length };
  } catch(e) {
    Logger.log('getReportList 오류: ' + (e.message || e));
    throw new Error('보고서 목록 조회 실패: ' + (e.message || e));
  }
}

/**
 * 미제출 보고서 목록 (연장 반영 + 추가 필드 + 미제출확정 제외)
 */
function getPendingReportListWithExtension() {
  try {
    const policy = getReportPolicy();
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const mainSh = ss.getSheets()[0];
    const vals = mainSh.getDataRange().getValues();
    
    if (vals.length < 2) return { pending: [], total: 0 };
    
    const hdr = vals[0];
    const idx = {
      id: hdr.indexOf('신청ID'),
      sid: hdr.indexOf('대표자학번'),
      name: hdr.indexOf('대표자이름'),
      date: hdr.indexOf('실험할날짜'),
      lab: hdr.indexOf('신청실험실'),
      time: hdr.indexOf('신청시간'),
      title: hdr.indexOf('실험제목'),
      teacher: hdr.indexOf('지도교사이름'),
      final: hdr.indexOf('최종승인여부')
    };
    
    // 제출된 보고서 목록
    const submittedIds = new Set();
    const reportSh = ss.getSheetByName(RPT_SHEET_NAME);
    if (reportSh) {
      const reportVals = reportSh.getDataRange().getValues();
      const reportIdCol = reportVals[0].indexOf('신청ID');
      if (reportIdCol >= 0) {
        for (let i = 1; i < reportVals.length; i++) {
          submittedIds.add(String(reportVals[i][reportIdCol]));
        }
      }
    }
    
    // 미제출 확정된 목록
    const confirmedIds = new Set();
    const confirmedSh = ss.getSheetByName(RPT_CONFIRMED_SHEET_NAME);
    if (confirmedSh) {
      const confVals = confirmedSh.getDataRange().getValues();
      const confIdCol = confVals[0].indexOf('신청ID');
      if (confIdCol >= 0) {
        for (let i = 1; i < confVals.length; i++) {
          confirmedIds.add(String(confVals[i][confIdCol]));
        }
      }
    }
    
    // 연장 정보 로드 (최신 연장만 적용)
    const extensions = {};
    const extSh = ss.getSheetByName(RPT_EXTENSION_SHEET_NAME);
    if (extSh) {
      const extVals = extSh.getDataRange().getValues();
      for (let i = 1; i < extVals.length; i++) {
        const extAppId = String(extVals[i][0]);
        extensions[extAppId] = String(extVals[i][2]); // 나중 것이 덮어씀
      }
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const pending = [];
    
    for (let i = 1; i < vals.length; i++) {
      const row = vals[i];
      if (String(row[idx.final]).trim() !== '승인') continue;
      
      const appId = String(row[idx.id]);
      if (submittedIds.has(appId)) continue; // 이미 제출됨
      if (confirmedIds.has(appId)) continue; // 미제출 확정됨
      
      const expDate = new Date(row[idx.date]);
      if (isNaN(expDate.getTime())) continue;
      expDate.setHours(0, 0, 0, 0);
      if (expDate > today) continue; // 아직 실험 전
      
      // ✅ 마감일 계산 (연장 적용) - 유효성 검증 추가
      let deadline;
      let status = '';
      if (extensions[appId]) {
        const parsed = new Date(extensions[appId]);
        if (!isNaN(parsed.getTime())) {
          deadline = parsed;
          status = '연장';
        } else {
          deadline = new Date(expDate.getTime() + policy.deadlineDays * 24 * 60 * 60 * 1000);
        }
      } else {
        deadline = new Date(expDate.getTime() + policy.deadlineDays * 24 * 60 * 60 * 1000);
      }
      
      const daysRemaining = Math.ceil((deadline - today) / (24 * 60 * 60 * 1000));
      
      pending.push({
        appId: appId,
        studentId: row[idx.sid] || '',
        studentName: row[idx.name] || '',
        experimentDate: Utilities.formatDate(expDate, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
        lab: row[idx.lab] || '',
        time: row[idx.time] || '',
        title: row[idx.title] || '',
        teacher: row[idx.teacher] || '',
        deadline: Utilities.formatDate(deadline, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
        daysRemaining: daysRemaining,
        isOverdue: daysRemaining < 0,
        status: status
      });
    }
    
    // 연체일 기준 정렬 (급한 것 먼저)
    pending.sort((a, b) => a.daysRemaining - b.daysRemaining);
    
    return { pending: pending, total: pending.length };
  } catch(e) {
    Logger.log('getPendingReportListWithExtension 오류: ' + (e.message || e));
    throw new Error('미제출 보고서 조회 실패: ' + (e.message || e));
  }
}

/**
 * 보고서 통계 조회 (관리자용) - ✅ 패널티 대기 추가
 */
function getReportStats() {
  try {
    const policy = getReportPolicy();
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const mainSh = ss.getSheets()[0];
    const vals = mainSh.getDataRange().getValues();
    
    const hdr = vals[0];
    const dateIdx = hdr.indexOf('실험할날짜');
    const finalIdx = hdr.indexOf('최종승인여부');
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let totalApproved = 0;
    for (let i = 1; i < vals.length; i++) {
      if (String(vals[i][finalIdx]).trim() !== '승인') continue;
      const expDate = new Date(vals[i][dateIdx]);
      if (isNaN(expDate.getTime())) continue;
      expDate.setHours(0, 0, 0, 0);
      if (expDate <= today) totalApproved++;
    }
    
    // 제출된 보고서 수
    let submitted = 0;
    const reportSh = ss.getSheetByName(RPT_SHEET_NAME);
    if (reportSh) {
      submitted = Math.max(0, reportSh.getLastRow() - 1);
    }
    
    // 미제출 확정 수
    let confirmed = 0;
    const confirmedSh = ss.getSheetByName(RPT_CONFIRMED_SHEET_NAME);
    if (confirmedSh) {
      confirmed = Math.max(0, confirmedSh.getLastRow() - 1);
    }
    
    // ✅ 패널티 대기 수
    let penaltyPending = 0;
    const pendingResult = getPenaltyPendingList();
    penaltyPending = pendingResult.total;
    
    // 미제출 수 (미제출 확정 제외)
    const pendingResult2 = getPendingReportListWithExtension();
    
    // 미제출 확정 제외한 pending (이미 함수 내에서 제외됨)
    const overdueCount = pendingResult2.pending.filter(p => p.isOverdue).length;
    const pendingCount = pendingResult2.pending.length - overdueCount;
    
    return {
      policy: policy,
      totalApproved: totalApproved,
      submitted: submitted,
      pending: pendingCount,
      overdue: overdueCount,
      confirmed: confirmed,
      penaltyPending: penaltyPending,  // ✅ 신규
      submissionRate: totalApproved > 0 ? Math.round((submitted / totalApproved) * 100) : 0
    };
  } catch(e) {
    Logger.log('getReportStats 오류: ' + (e.message || e));
    throw new Error('보고서 통계 조회 실패: ' + (e.message || e));
  }
}

/**
 * 보고서 상세 조회 (관리자용)
 */
function getReportDetail(appId) {
  try {
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const reportSh = ss.getSheetByName(RPT_SHEET_NAME);
    
    if (!reportSh) throw new Error('보고서 시트가 없습니다.');
    
    const vals = reportSh.getDataRange().getValues();
    const hdr = vals[0];
    const idCol = hdr.indexOf('신청ID');
    
    for (let i = 1; i < vals.length; i++) {
      if (String(vals[i][idCol]) === String(appId)) {
        const report = {};
        hdr.forEach((h, j) => report[h] = vals[i][j]);
        return report;
      }
    }
    
    throw new Error('보고서를 찾을 수 없습니다.');
  } catch(e) {
    Logger.log('getReportDetail 오류: ' + (e.message || e));
    throw e;
  }
}

/* =============== 관리자 처리 함수 =============== */

/**
 * 관리자가 보고서 완료 처리 (미제출 → 완료)
 */
function completeReportByAdmin(appId, reason, note) {
  try {
    if (!appId) throw new Error('신청ID가 없습니다.');
    
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    let sh = ss.getSheetByName(RPT_SHEET_NAME);
    
    // 시트 없으면 생성
    if (!sh) {
      sh = ss.insertSheet(RPT_SHEET_NAME);
      sh.appendRow([
        '신청ID', '제출일시', '대표자학번', '대표자이름',
        '실험완료여부', '실제실험과정', '실제사용도구', '실험결과',
        '시약사용량', '뒷정리완료여부', '안전문제발생여부', '안전문제내용',
        '미완료사유', '후속계획', '실험유형', '다음실험계획', '기타의견'
      ]);
    }
    
    // 중복 확인
    const vals = sh.getDataRange().getValues();
    const idCol = vals[0].indexOf('신청ID');
    if (idCol >= 0) {
      for (let i = 1; i < vals.length; i++) {
        if (String(vals[i][idCol]) === String(appId)) {
          throw new Error('이미 보고서가 제출/처리된 신청입니다.');
        }
      }
    }
    
    // 신청 정보 조회
    const app = getApplicationById(appId);
    if (!app) throw new Error('신청서를 찾을 수 없습니다.');
    
    const now = new Date();
    sh.appendRow([
      appId,
      now,
      app['대표자학번'] || '',
      app['대표자이름'] || '',
      '완료 (관리자 처리)',  // 실험완료여부
      reason || '관리자 직접 확인',  // 실제실험과정
      '',  // 실제사용도구
      '',  // 실험결과
      '',  // 시약사용량
      '예',  // 뒷정리완료여부
      '없음',  // 안전문제발생여부
      '',  // 안전문제내용
      '',  // 미완료사유
      '',  // 후속계획
      '',  // 실험유형
      '',  // 다음실험계획
      note || ''  // 기타의견
    ]);
    
    return '보고서 완료 처리되었습니다.';
  } catch(e) {
    Logger.log('completeReportByAdmin 오류: ' + (e.message || e));
    throw e;
  }
}

/**
 * 보고서 마감일 연장
 */
function extendReportDeadline(appId, newDeadline, reason) {
  try {
    if (!appId) throw new Error('신청ID가 없습니다.');
    if (!newDeadline) throw new Error('새 마감일이 없습니다.');
    
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    
    // 마감연장 시트 확인/생성
    let extSh = ss.getSheetByName(RPT_EXTENSION_SHEET_NAME);
    if (!extSh) {
      extSh = ss.insertSheet(RPT_EXTENSION_SHEET_NAME);
      extSh.appendRow(['신청ID', '기존마감일', '새마감일', '연장사유', '처리일시']);
    }
    
    // 기존 마감일 계산
    const policy = getReportPolicy();
    const mainSh = ss.getSheets()[0];
    const vals = mainSh.getDataRange().getValues();
    const hdr = vals[0];
    const idIdx = hdr.indexOf('신청ID');
    const dateIdx = hdr.indexOf('실험할날짜');
    
    // 기존 연장 정보 로드
    const currentExtensions = {};
    const extVals = extSh.getDataRange().getValues();
    for (let i = 1; i < extVals.length; i++) {
      const extAppId = String(extVals[i][0]);
      currentExtensions[extAppId] = String(extVals[i][2]);
    }
    
    let oldDeadline = '';
    for (let i = 1; i < vals.length; i++) {
      if (String(vals[i][idIdx]) === String(appId)) {
        const expDate = new Date(vals[i][dateIdx]);
        if (!isNaN(expDate.getTime())) {
          // 기존 연장이 있으면 그 마감일 기준
          if (currentExtensions[appId]) {
            oldDeadline = currentExtensions[appId];
          } else {
            const deadline = new Date(expDate.getTime() + policy.deadlineDays * 24 * 60 * 60 * 1000);
            oldDeadline = Utilities.formatDate(deadline, Session.getScriptTimeZone(), 'yyyy-MM-dd');
          }
        }
        break;
      }
    }
    
    // 연장 기록 추가
    extSh.appendRow([
      appId,
      oldDeadline,
      newDeadline,
      reason || '',
      new Date()
    ]);
    
    return '마감일이 ' + newDeadline + '로 연장되었습니다.';
  } catch(e) {
    Logger.log('extendReportDeadline 오류: ' + (e.message || e));
    throw e;
  }
}

/* =============== ✅ 이메일 발송 기능 (강화) =============== */

/**
 * ✅ 학생에게 이메일 발송 (기본 함수)
 * @param {string} studentId - 학번
 * @param {string} studentName - 학생 이름
 * @param {string} subject - 이메일 제목
 * @param {string} body - 이메일 본문
 */
function sendEmailToStudent(studentId, studentName, subject, body) {
  try {
    const sid = String(studentId || '').trim();
    if (!/^\d{5}$/.test(sid)) throw new Error('유효하지 않은 학번: ' + studentId);
    const email = sid + '@cnsa.hs.kr';
    
    MailApp.sendEmail({
      to: email,
      subject: subject,
      body: body,
      name: '과학실험실 관리 시스템'
    });
    
    logAdminAction('이메일발송', studentId, `${studentName}에게 발송: ${subject}`);
    Logger.log('이메일 발송 완료: ' + email);
    
    return { success: true, message: `${studentName} 학생에게 이메일이 발송되었습니다.` };
  } catch (e) {
    Logger.log('sendEmailToStudent 오류: ' + (e.message || e));
    throw new Error('이메일 발송 실패: ' + (e.message || e));
  }
}

/**
 * ✅ 보고서 제출 요청 이메일 발송
 */
function sendReportReminder(appId, studentId, studentName, experimentTitle, deadline, customMessage) {
  try {
    const subject = `[실험실] 보고서 제출 요청 - ${experimentTitle}`;
    
    let body = `${studentName} 학생에게 안내드립니다.\n\n`;
    body += `실험 "${experimentTitle}"의 보고서 제출 마감일이 다가오고 있습니다.\n\n`;
    body += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    body += `마감일: ${deadline}\n`;
    body += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    if (customMessage) {
      body += `담당 교사 메시지:\n${customMessage}\n\n`;
    }
    
    body += `기한 내 제출 부탁드립니다.\n\n`;
    body += `- 과학실험실 관리 시스템 -`;
    
    return sendEmailToStudent(studentId, studentName, subject, body);
  } catch (e) {
    Logger.log('sendReportReminder 오류: ' + (e.message || e));
    throw e;
  }
}

/**
 * ✅ 승인/반려 알림 이메일 발송
 */
function sendApprovalNotification(studentId, studentName, experimentTitle, status, reason) {
  try {
    const statusText = status === '승인' ? '승인되었습니다' : '반려되었습니다';
    const subject = `[실험실] 신청 ${statusText} - ${experimentTitle}`;
    
    let body = `${studentName} 학생에게 안내드립니다.\n\n`;
    body += `실험 "${experimentTitle}" 신청이 ${statusText}.\n\n`;
    
    if (status === '반려' && reason) {
      body += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      body += `반려 사유:\n${reason}\n`;
      body += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    }
    
    body += `- 과학실험실 관리 시스템 -`;
    
    return sendEmailToStudent(studentId, studentName, subject, body);
  } catch (e) {
    Logger.log('sendApprovalNotification 오류: ' + (e.message || e));
    throw e;
  }
}

/**
 * ✅ 마감 임박 자동 알림 (트리거용)
 */
function sendDeadlineReminders() {
  try {
    const pendingResult = getPendingReportListWithExtension();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let sentCount = 0;
    
    pendingResult.pending.forEach(item => {
      const daysLeft = item.daysRemaining;
      
      // D-3 또는 D-1에 알림 발송
      if (daysLeft === 3 || daysLeft === 1) {
        try {
          sendReportReminder(
            item.appId,
            item.studentId,
            item.studentName,
            item.title,
            item.deadline,
            `보고서 마감이 ${daysLeft}일 남았습니다.`
          );
          sentCount++;
          
          // 이메일 발송 제한 대응 (200ms 딜레이)
          Utilities.sleep(200);
        } catch (e) {
          Logger.log(`알림 발송 실패 (${item.studentId}): ${e.message}`);
        }
      }
    });
    
    Logger.log(`sendDeadlineReminders 완료: ${sentCount}건 발송`);
    return { success: true, sentCount };
  } catch (e) {
    Logger.log('sendDeadlineReminders 오류: ' + (e.message || e));
    return { success: false, error: e.message };
  }
}

/**
 * ✅ 이메일 알림 트리거 설정
 */
function setupEmailTriggers() {
  try {
    const fn = 'sendDeadlineReminders';
    
    // 기존 트리거 삭제
    ScriptApp.getProjectTriggers().forEach(t => {
      if (t.getHandlerFunction() === fn) {
        ScriptApp.deleteTrigger(t);
      }
    });
    
    // 새 트리거 생성 (매일 오전 9시)
    ScriptApp.newTrigger(fn)
      .timeBased()
      .atHour(9)
      .everyDays(1)
      .create();
    
    Logger.log('이메일 알림 트리거 설정 완료');
    return { success: true, message: '매일 오전 9시 알림 트리거가 설정되었습니다.' };
  } catch (e) {
    Logger.log('setupEmailTriggers 오류: ' + (e.message || e));
    return { success: false, message: '트리거 설정 실패: ' + e.message };
  }
}

/**
 * 재작성/제출 요청 이메일 발송 (기존 함수 유지)
 */
function sendResubmitRequest(appId, message) {
  try {
    if (!appId) throw new Error('신청ID가 없습니다.');
    if (!message) throw new Error('메시지가 없습니다.');
    
    // 신청 정보 조회
    const app = getApplicationById(appId);
    if (!app) throw new Error('신청서를 찾을 수 없습니다.');
    
    const studentId = String(app['대표자학번'] || '').trim();
    if (!/^\d{5}$/.test(studentId)) throw new Error('유효하지 않은 학번: ' + studentId);
    const studentName = String(app['대표자이름'] || '').trim();
    const title = String(app['실험제목'] || '').trim();
    const expDate = String(app['실험할날짜'] || '').substring(0, 10);
    
    // 이메일 주소 생성 (학번@cnsa.hs.kr)
    const email = studentId + '@cnsa.hs.kr';
    
    // 이메일 제목
    const subject = '[과학실험실] 실험 보고서 제출 요청 - ' + title;
    
    // 이메일 본문
    const body = studentName + ' 학생에게,\n\n' +
      '아래 실험에 대한 보고서 제출을 요청드립니다.\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '실험 정보\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '실험 제목: ' + title + '\n' +
      '실험 날짜: ' + expDate + '\n' +
      '실험실: ' + (app['신청실험실'] || '') + '\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '요청 사항\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      message + '\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
      '빠른 시일 내에 보고서를 제출해 주세요.\n' +
      '감사합니다.\n\n' +
      '과학실험실 관리 시스템';
    
    // 이메일 발송
    GmailApp.sendEmail(email, subject, body);
    
    Logger.log('이메일 발송 완료: ' + email);
    return studentName + ' 학생에게 이메일이 발송되었습니다.';
  } catch(e) {
    Logger.log('sendResubmitRequest 오류: ' + (e.message || e));
    throw e;
  }
}

/* =============== 미제출 확정 관련 =============== */

/**
 * 미제출 확정 처리
 */
function confirmNotSubmit(appId, reason, note) {
  try {
    if (!appId) throw new Error('신청ID가 없습니다.');
    
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    
    // 미제출확정 시트 확인/생성
    let sh = ss.getSheetByName(RPT_CONFIRMED_SHEET_NAME);
    if (!sh) {
      sh = ss.insertSheet(RPT_CONFIRMED_SHEET_NAME);
      sh.appendRow(['신청ID', '대표자학번', '대표자이름', '실험할날짜', '신청실험실', 
                    '실험제목', '확정사유', '비고', '확정일시']);
    }
    
    // 중복 확인
    const vals = sh.getDataRange().getValues();
    const idCol = vals[0].indexOf('신청ID');
    if (idCol >= 0) {
      for (let i = 1; i < vals.length; i++) {
        if (String(vals[i][idCol]) === String(appId)) {
          throw new Error('이미 미제출 확정된 신청입니다.');
        }
      }
    }
    
    // 이미 보고서 제출됐는지 확인
    const reportSh = ss.getSheetByName(RPT_SHEET_NAME);
    if (reportSh) {
      const reportVals = reportSh.getDataRange().getValues();
      const reportIdCol = reportVals[0].indexOf('신청ID');
      if (reportIdCol >= 0) {
        for (let i = 1; i < reportVals.length; i++) {
          if (String(reportVals[i][reportIdCol]) === String(appId)) {
            throw new Error('이미 보고서가 제출된 신청입니다.');
          }
        }
      }
    }
    
    // 신청 정보 조회 (AdminFunctions.gs의 함수 사용)
    const app = getApplicationById(appId);
    if (!app) throw new Error('신청서를 찾을 수 없습니다.');
    
    const now = new Date();
    sh.appendRow([
      appId,
      app['대표자학번'] || '',
      app['대표자이름'] || '',
      app['실험할날짜'] || '',
      app['신청실험실'] || '',
      app['실험제목'] || '',
      reason || '기한 초과 - 미응답',
      note || '',
      now
    ]);
    
    return '미제출 확정 처리되었습니다.';
  } catch(e) {
    Logger.log('confirmNotSubmit 오류: ' + (e.message || e));
    throw e;
  }
}

/**
 * 미제출 확정 목록 조회
 */
function getConfirmedNotSubmitList() {
  try {
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const sh = ss.getSheetByName(RPT_CONFIRMED_SHEET_NAME);
    
    if (!sh) return { list: [], total: 0 };
    
    const vals = sh.getDataRange().getValues();
    if (vals.length < 2) return { list: [], total: 0 };
    
    const hdr = vals[0];
    const idx = {};
    hdr.forEach((h, i) => idx[h] = i);
    
    const list = [];
    for (let i = 1; i < vals.length; i++) {
      const row = vals[i];
      const expDate = row[idx['실험할날짜']];
      const confDate = row[idx['확정일시']];
      
      list.push({
        appId: row[idx['신청ID']] || '',
        studentId: row[idx['대표자학번']] || '',
        studentName: row[idx['대표자이름']] || '',
        experimentDate: expDate ? Utilities.formatDate(new Date(expDate), Session.getScriptTimeZone(), 'yyyy-MM-dd') : '',
        lab: row[idx['신청실험실']] || '',
        title: row[idx['실험제목']] || '',
        reason: row[idx['확정사유']] || '',
        note: row[idx['비고']] || '',
        confirmedDate: confDate ? Utilities.formatDate(new Date(confDate), Session.getScriptTimeZone(), 'yyyy-MM-dd') : ''
      });
    }
    
    // 최신순 정렬
    list.sort((a, b) => new Date(b.confirmedDate) - new Date(a.confirmedDate));
    
    return { list: list, total: list.length };
  } catch(e) {
    Logger.log('getConfirmedNotSubmitList 오류: ' + (e.message || e));
    throw new Error('미제출 확정 목록 조회 실패: ' + (e.message || e));
  }
}

/**
 * 미제출 확정 취소 (미제출 목록으로 복원)
 */
function revertConfirmedNotSubmit(appId) {
  try {
    if (!appId) throw new Error('신청ID가 없습니다.');
    
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const sh = ss.getSheetByName(RPT_CONFIRMED_SHEET_NAME);
    
    if (!sh) throw new Error('미제출확정 시트가 없습니다.');
    
    const vals = sh.getDataRange().getValues();
    const idCol = vals[0].indexOf('신청ID');
    
    if (idCol < 0) throw new Error('신청ID 컬럼을 찾을 수 없습니다.');
    
    for (let i = 1; i < vals.length; i++) {
      if (String(vals[i][idCol]) === String(appId)) {
        sh.deleteRow(i + 1);
        return '미제출 확정이 취소되었습니다.';
      }
    }
    
    throw new Error('해당 신청을 찾을 수 없습니다.');
  } catch(e) {
    Logger.log('revertConfirmedNotSubmit 오류: ' + (e.message || e));
    throw e;
  }
}

/* =============== 일괄 처리 =============== */

/**
 * 일괄 완료 처리
 */
function bulkCompleteReports(appIds, reason) {
  try {
    if (!appIds || appIds.length === 0) throw new Error('선택된 항목이 없습니다.');
    
    let successCount = 0;
    let failCount = 0;
    const errors = [];
    
    for (const appId of appIds) {
      try {
        completeReportByAdmin(appId, reason || '관리자 일괄 처리', '');
        successCount++;
      } catch(e) {
        failCount++;
        errors.push(appId + ': ' + (e.message || e));
      }
    }
    
    let msg = successCount + '건 완료 처리됨';
    if (failCount > 0) {
      msg += ', ' + failCount + '건 실패';
      Logger.log('bulkCompleteReports 실패 목록: ' + errors.join(', '));
    }
    
    return msg;
  } catch(e) {
    Logger.log('bulkCompleteReports 오류: ' + (e.message || e));
    throw e;
  }
}

/**
 * 일괄 마감일 연장
 */
function bulkExtendDeadlines(appIds, days, reason) {
  try {
    if (!appIds || appIds.length === 0) throw new Error('선택된 항목이 없습니다.');
    if (!days || days < 1) days = 7;
    
    const ss = SpreadsheetApp.openById(MAIN_SSID);
    const mainSh = ss.getSheets()[0];
    const vals = mainSh.getDataRange().getValues();
    const hdr = vals[0];
    const idIdx = hdr.indexOf('신청ID');
    const dateIdx = hdr.indexOf('실험할날짜');
    
    const policy = getReportPolicy();
    
    // 연장 시트 확인/생성
    let extSh = ss.getSheetByName(RPT_EXTENSION_SHEET_NAME);
    if (!extSh) {
      extSh = ss.insertSheet(RPT_EXTENSION_SHEET_NAME);
      extSh.appendRow(['신청ID', '기존마감일', '새마감일', '연장사유', '처리일시']);
    }
    
    // 기존 연장 정보 로드 (최신 마감일 적용)
    const currentExtensions = {};
    const extVals = extSh.getDataRange().getValues();
    for (let i = 1; i < extVals.length; i++) {
      const extAppId = String(extVals[i][0]);
      currentExtensions[extAppId] = String(extVals[i][2]); // 새 마감일
    }
    
    let successCount = 0;
    const now = new Date();
    
    for (const appId of appIds) {
      // 기존 마감일 찾기
      for (let i = 1; i < vals.length; i++) {
        if (String(vals[i][idIdx]) === String(appId)) {
          const expDate = new Date(vals[i][dateIdx]);
          if (!isNaN(expDate.getTime())) {
            // 기존 연장이 있으면 그 마감일 기준, 없으면 정책 기준
            let oldDeadline;
            if (currentExtensions[appId]) {
              oldDeadline = new Date(currentExtensions[appId]);
            } else {
              oldDeadline = new Date(expDate.getTime() + policy.deadlineDays * 24 * 60 * 60 * 1000);
            }
            const newDeadline = new Date(oldDeadline.getTime() + days * 24 * 60 * 60 * 1000);
            
            extSh.appendRow([
              appId,
              Utilities.formatDate(oldDeadline, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
              Utilities.formatDate(newDeadline, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
              reason || '일괄 연장',
              now
            ]);
            successCount++;
          }
          break;
        }
      }
    }
    
    return successCount + '건 마감일이 ' + days + '일 연장되었습니다.';
  } catch(e) {
    Logger.log('bulkExtendDeadlines 오류: ' + (e.message || e));
    throw e;
  }
}

/**
 * 일괄 미제출 확정
 */
function bulkConfirmNotSubmit(appIds, reason) {
  try {
    if (!appIds || appIds.length === 0) throw new Error('선택된 항목이 없습니다.');
    
    let successCount = 0;
    let failCount = 0;
    
    for (const appId of appIds) {
      try {
        confirmNotSubmit(appId, reason || '기한 초과 - 미응답', '일괄 처리');
        successCount++;
      } catch(e) {
        failCount++;
      }
    }
    
    let msg = successCount + '건 미제출 확정됨';
    if (failCount > 0) msg += ', ' + failCount + '건 실패';
    
    return msg;
  } catch(e) {
    Logger.log('bulkConfirmNotSubmit 오류: ' + (e.message || e));
    throw e;
  }
}

/**
 * 일괄 알림 발송
 */
function bulkSendNotifications(appIds, message) {
  try {
    if (!appIds || appIds.length === 0) throw new Error('선택된 항목이 없습니다.');
    if (!message) throw new Error('메시지가 없습니다.');
    
    let successCount = 0;
    let failCount = 0;
    
    for (const appId of appIds) {
      try {
        sendResubmitRequest(appId, message);
        successCount++;
        // 이메일 발송 제한 대응 (100ms 딜레이)
        Utilities.sleep(100);
      } catch(e) {
        failCount++;
        Logger.log('알림 발송 실패 (' + appId + '): ' + (e.message || e));
      }
    }
    
    let msg = successCount + '명에게 알림 발송됨';
    if (failCount > 0) msg += ', ' + failCount + '건 실패';
    
    return msg;
  } catch(e) {
    Logger.log('bulkSendNotifications 오류: ' + (e.message || e));
    throw e;
  }
}

/* =============== 엑셀 내보내기 =============== */

/**
 * 보고서 데이터 엑셀 내보내기
 */
function exportReportToExcel(tab, list) {
  try {
    if (!list || list.length === 0) throw new Error('내보낼 데이터가 없습니다.');
    
    // 새 스프레드시트 생성
    const fileName = '보고서_' + tab + '_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
    const newSs = SpreadsheetApp.create(fileName);
    const sh = newSs.getActiveSheet();
    
    // 헤더 설정
    let headers = [];
    if (tab === 'pending') {
      headers = ['학번', '이름', '실험일', '시간', '실험실', '지도교사', '실험제목', '마감일', '남은일수', '상태'];
    } else if (tab === 'submitted') {
      headers = ['학번', '이름', '실험일', '실험실', '제출일', '실험완료', '안전문제'];
    } else {
      headers = ['학번', '이름', '실험일', '실험실', '실험제목', '확정일', '사유'];
    }
    
    sh.appendRow(headers);
    
    // 데이터 추가
    list.forEach(function(item) {
      let row = [];
      if (tab === 'pending') {
        let status = item.isOverdue ? '연체 ' + Math.abs(item.daysRemaining) + '일' : 'D-' + item.daysRemaining;
        if (item.status === '연장') status = '연장';
        row = [item.studentId, item.studentName, item.experimentDate, item.time || '', item.lab, 
               item.teacher || '', item.title, item.deadline, item.daysRemaining, status];
      } else if (tab === 'submitted') {
        const submitDate = item.submittedAt ? Utilities.formatDate(new Date(item.submittedAt), Session.getScriptTimeZone(), 'yyyy-MM-dd') : '';
        row = [item.studentId, item.studentName, item.experimentDate || '', item.lab || '', 
               submitDate, item.completed || '', item.safetyIssue || ''];
      } else {
        row = [item.studentId, item.studentName, item.experimentDate || '', item.lab || '', 
               item.title || '', item.confirmedDate || '', item.reason || ''];
      }
      sh.appendRow(row);
    });
    
    // 헤더 스타일
    sh.getRange(1, 1, 1, headers.length).setBackground('#4285f4').setFontColor('#ffffff').setFontWeight('bold');
    sh.setFrozenRows(1);
    
    // 열 너비 자동 조정
    for (let i = 1; i <= headers.length; i++) {
      sh.autoResizeColumn(i);
    }
    
    // URL 반환
    return newSs.getUrl();
  } catch(e) {
    Logger.log('exportReportToExcel 오류: ' + (e.message || e));
    throw e;
  }
}