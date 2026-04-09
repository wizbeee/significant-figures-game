const { ipcMain, dialog, app } = require('electron');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { getDb, backupDatabase, getDbPath } = require('./database');
const auth = require('./auth');

function registerIpcHandlers() {
  // ─── 인증 ───
  ipcMain.handle('auth:isPasswordSet', () => auth.isPasswordSet());
  ipcMain.handle('auth:setPassword', (_, pw) => auth.setPassword(pw));
  ipcMain.handle('auth:verify', (_, pw) => auth.verifyPassword(pw));
  ipcMain.handle('auth:changePassword', (_, oldPw, newPw) => auth.changePassword(oldPw, newPw));

  // ─── 설정 ───
  ipcMain.handle('config:get', () => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM admission_config WHERE id = 1').get();
    return {
      ...row,
      admission_types: JSON.parse(row.admission_types || '[]'),
      doc_categories: JSON.parse(row.doc_categories || '[]'),
      interview_categories: JSON.parse(row.interview_categories || '[]'),
    };
  });

  ipcMain.handle('config:update', (_, data) => {
    const db = getDb();
    const stmt = db.prepare(`
      UPDATE admission_config SET
        year = @year, total_slots = @total_slots,
        doc_weight = @doc_weight, interview_weight = @interview_weight,
        doc_pass_count = @doc_pass_count,
        admission_types = @admission_types,
        doc_categories = @doc_categories,
        interview_categories = @interview_categories,
        updated_at = datetime('now','localtime')
      WHERE id = 1
    `);
    stmt.run({
      ...data,
      admission_types: JSON.stringify(data.admission_types),
      doc_categories: JSON.stringify(data.doc_categories),
      interview_categories: JSON.stringify(data.interview_categories),
    });
    return true;
  });

  // ─── 지원자 CRUD ───
  ipcMain.handle('applicants:list', (_, { search, status, admission_type, page = 1, limit = 50 } = {}) => {
    const db = getDb();
    let where = [];
    let params = {};

    if (search) {
      where.push("(name LIKE @search OR exam_number LIKE @search OR middle_school LIKE @search)");
      params.search = `%${search}%`;
    }
    if (status) {
      where.push("status = @status");
      params.status = status;
    }
    if (admission_type) {
      where.push("admission_type = @admission_type");
      params.admission_type = admission_type;
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const offset = (page - 1) * limit;

    const total = db.prepare(`SELECT COUNT(*) as cnt FROM applicants ${whereClause}`).get(params).cnt;
    const rows = db.prepare(`
      SELECT a.*, r.final_score, r.rank, r.decision
      FROM applicants a
      LEFT JOIN results r ON r.applicant_id = a.id
      ${whereClause}
      ORDER BY a.id DESC
      LIMIT @limit OFFSET @offset
    `).all({ ...params, limit, offset });

    return { rows, total, page, limit, totalPages: Math.ceil(total / limit) };
  });

  ipcMain.handle('applicants:get', (_, id) => {
    const db = getDb();
    const applicant = db.prepare('SELECT * FROM applicants WHERE id = ?').get(id);
    if (!applicant) return null;
    const doc_scores = db.prepare('SELECT * FROM doc_scores WHERE applicant_id = ?').all(id);
    const interview_scores = db.prepare('SELECT * FROM interview_scores WHERE applicant_id = ?').all(id);
    const result = db.prepare('SELECT * FROM results WHERE applicant_id = ?').get(id);
    return { ...applicant, doc_scores, interview_scores, result };
  });

  ipcMain.handle('applicants:create', (_, data) => {
    const db = getDb();
    // 수험번호 자동 생성
    const config = db.prepare('SELECT year FROM admission_config WHERE id = 1').get();
    const year = config?.year || new Date().getFullYear() + 1;
    const lastNum = db.prepare("SELECT exam_number FROM applicants WHERE exam_number LIKE ? ORDER BY exam_number DESC LIMIT 1")
      .get(`${year}-%`);
    let seq = 1;
    if (lastNum) {
      seq = parseInt(lastNum.exam_number.split('-')[1]) + 1;
    }
    const exam_number = `${year}-${String(seq).padStart(4, '0')}`;

    const stmt = db.prepare(`
      INSERT INTO applicants (exam_number, name, birth_date, gender, middle_school, phone, parent_phone, parent_name, address, admission_type, memo)
      VALUES (@exam_number, @name, @birth_date, @gender, @middle_school, @phone, @parent_phone, @parent_name, @address, @admission_type, @memo)
    `);
    const info = stmt.run({ exam_number, ...data });
    return { id: info.lastInsertRowid, exam_number };
  });

  ipcMain.handle('applicants:update', (_, id, data) => {
    const db = getDb();
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE applicants SET ${fields}, updated_at = datetime('now','localtime') WHERE id = @id`)
      .run({ id, ...data });
    return true;
  });

  ipcMain.handle('applicants:delete', (_, id) => {
    const db = getDb();
    db.prepare('DELETE FROM applicants WHERE id = ?').run(id);
    return true;
  });

  ipcMain.handle('applicants:bulkUpdateStatus', (_, ids, status) => {
    const db = getDb();
    const stmt = db.prepare("UPDATE applicants SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?");
    const tx = db.transaction(() => {
      for (const id of ids) stmt.run(status, id);
    });
    tx();
    return true;
  });

  // ─── 엑셀 일괄 업로드 ───
  ipcMain.handle('applicants:importExcel', async (_, filePath) => {
    const db = getDb();
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);

    const config = db.prepare('SELECT year FROM admission_config WHERE id = 1').get();
    const year = config?.year || new Date().getFullYear() + 1;
    const lastNum = db.prepare("SELECT exam_number FROM applicants WHERE exam_number LIKE ? ORDER BY exam_number DESC LIMIT 1")
      .get(`${year}-%`);
    let seq = lastNum ? parseInt(lastNum.exam_number.split('-')[1]) + 1 : 1;

    const colMap = {
      '이름': 'name', '성명': 'name',
      '생년월일': 'birth_date',
      '성별': 'gender',
      '출신중학교': 'middle_school', '중학교': 'middle_school',
      '연락처': 'phone', '전화번호': 'phone', '휴대폰': 'phone',
      '보호자연락처': 'parent_phone', '보호자전화': 'parent_phone',
      '보호자명': 'parent_name', '보호자': 'parent_name',
      '주소': 'address',
      '전형유형': 'admission_type', '전형': 'admission_type',
      '비고': 'memo',
    };

    const stmt = db.prepare(`
      INSERT INTO applicants (exam_number, name, birth_date, gender, middle_school, phone, parent_phone, parent_name, address, admission_type, memo)
      VALUES (@exam_number, @name, @birth_date, @gender, @middle_school, @phone, @parent_phone, @parent_name, @address, @admission_type, @memo)
    `);

    let imported = 0;
    const errors = [];

    const tx = db.transaction(() => {
      for (const row of rows) {
        try {
          const mapped = { name: '', birth_date: '', gender: '', middle_school: '', phone: '', parent_phone: '', parent_name: '', address: '', admission_type: '일반전형', memo: '' };
          for (const [key, val] of Object.entries(row)) {
            const field = colMap[key.trim()];
            if (field) mapped[field] = String(val || '').trim();
          }
          if (!mapped.name) continue;

          const exam_number = `${year}-${String(seq).padStart(4, '0')}`;
          seq++;
          stmt.run({ exam_number, ...mapped });
          imported++;
        } catch (e) {
          errors.push(`행 ${imported + errors.length + 2}: ${e.message}`);
        }
      }
    });
    tx();

    return { imported, errors, total: rows.length };
  });

  // ─── 점수 관리 ───
  ipcMain.handle('scores:saveDoc', (_, applicantId, scores) => {
    const db = getDb();
    const del = db.prepare('DELETE FROM doc_scores WHERE applicant_id = ?');
    const ins = db.prepare('INSERT INTO doc_scores (applicant_id, category, score, max_score, evaluator, note) VALUES (?, ?, ?, ?, ?, ?)');
    const tx = db.transaction(() => {
      del.run(applicantId);
      for (const s of scores) {
        ins.run(applicantId, s.category, s.score, s.max_score || 100, s.evaluator || '', s.note || '');
      }
    });
    tx();
    return true;
  });

  ipcMain.handle('scores:saveInterview', (_, applicantId, scores) => {
    const db = getDb();
    const del = db.prepare('DELETE FROM interview_scores WHERE applicant_id = ?');
    const ins = db.prepare('INSERT INTO interview_scores (applicant_id, interviewer, category, score, max_score, note) VALUES (?, ?, ?, ?, ?, ?)');
    const tx = db.transaction(() => {
      del.run(applicantId);
      for (const s of scores) {
        ins.run(applicantId, s.interviewer || '', s.category, s.score, s.max_score || 100, s.note || '');
      }
    });
    tx();
    return true;
  });

  // ─── 합격자 선발 ───
  ipcMain.handle('selection:calculate', () => {
    const db = getDb();
    const config = db.prepare('SELECT * FROM admission_config WHERE id = 1').get();
    const docW = config.doc_weight / 100;
    const intW = config.interview_weight / 100;

    const applicants = db.prepare("SELECT id FROM applicants WHERE status IN ('interview_pass','doc_pass','received')").all();

    const updateResult = db.prepare(`
      INSERT OR REPLACE INTO results (applicant_id, doc_total, interview_total, final_score, rank, decision)
      VALUES (@applicant_id, @doc_total, @interview_total, @final_score, @rank, @decision)
    `);

    const getDocTotal = db.prepare('SELECT COALESCE(SUM(score), 0) as total FROM doc_scores WHERE applicant_id = ?');
    const getIntTotal = db.prepare('SELECT COALESCE(AVG(score), 0) as total FROM interview_scores WHERE applicant_id = ?');

    const scored = [];

    for (const a of applicants) {
      const docTotal = getDocTotal.get(a.id).total;
      const intTotal = getIntTotal.get(a.id).total;
      const finalScore = Math.round((docTotal * docW + intTotal * intW) * 100) / 100;
      scored.push({ applicant_id: a.id, doc_total: docTotal, interview_total: intTotal, final_score: finalScore });
    }

    scored.sort((a, b) => b.final_score - a.final_score);

    const tx = db.transaction(() => {
      scored.forEach((s, i) => {
        updateResult.run({ ...s, rank: i + 1, decision: null });
      });
    });
    tx();

    return scored;
  });

  ipcMain.handle('selection:decide', (_, decisions) => {
    const db = getDb();
    const stmt = db.prepare("UPDATE results SET decision = ?, decided_at = datetime('now','localtime') WHERE applicant_id = ?");
    const stmtStatus = db.prepare("UPDATE applicants SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?");
    const tx = db.transaction(() => {
      for (const { applicant_id, decision } of decisions) {
        stmt.run(decision, applicant_id);
        stmtStatus.run(decision, applicant_id);
      }
    });
    tx();
    return true;
  });

  ipcMain.handle('selection:getResults', () => {
    const db = getDb();
    return db.prepare(`
      SELECT r.*, a.name, a.exam_number, a.middle_school, a.admission_type, a.status
      FROM results r
      JOIN applicants a ON a.id = r.applicant_id
      ORDER BY r.rank ASC
    `).all();
  });

  // ─── 통계 ───
  ipcMain.handle('stats:dashboard', () => {
    const db = getDb();
    const config = db.prepare('SELECT * FROM admission_config WHERE id = 1').get();
    const total = db.prepare('SELECT COUNT(*) as cnt FROM applicants').get().cnt;
    const byStatus = db.prepare('SELECT status, COUNT(*) as cnt FROM applicants GROUP BY status').all();
    const byType = db.prepare('SELECT admission_type, COUNT(*) as cnt FROM applicants GROUP BY admission_type').all();
    const bySchool = db.prepare('SELECT middle_school, COUNT(*) as cnt FROM applicants GROUP BY middle_school ORDER BY cnt DESC LIMIT 10').all();
    const scoreDistribution = db.prepare(`
      SELECT
        CASE
          WHEN final_score >= 90 THEN '90~100'
          WHEN final_score >= 80 THEN '80~89'
          WHEN final_score >= 70 THEN '70~79'
          WHEN final_score >= 60 THEN '60~69'
          ELSE '60미만'
        END as range,
        COUNT(*) as cnt
      FROM results
      GROUP BY range
      ORDER BY range DESC
    `).all();

    return {
      config: { ...config, admission_types: JSON.parse(config.admission_types || '[]') },
      total,
      totalSlots: config.total_slots,
      competitionRate: config.total_slots > 0 ? (total / config.total_slots).toFixed(2) : 0,
      byStatus,
      byType,
      bySchool,
      scoreDistribution,
    };
  });

  // ─── 엑셀 내보내기 ───
  ipcMain.handle('export:excel', async (_, type) => {
    const db = getDb();
    let data = [];
    let filename = '';

    if (type === 'applicants') {
      data = db.prepare('SELECT exam_number as 수험번호, name as 이름, birth_date as 생년월일, gender as 성별, middle_school as 출신중학교, phone as 연락처, parent_phone as 보호자연락처, admission_type as 전형유형, status as 상태 FROM applicants ORDER BY exam_number').all();
      filename = '지원자명단.xlsx';
    } else if (type === 'results') {
      data = db.prepare(`
        SELECT a.exam_number as 수험번호, a.name as 이름, a.middle_school as 출신중학교, a.admission_type as 전형유형,
               r.doc_total as 서류점수, r.interview_total as 면접점수, r.final_score as 최종점수, r.rank as 순위, r.decision as 합격여부
        FROM results r JOIN applicants a ON a.id = r.applicant_id
        ORDER BY r.rank ASC
      `).all();
      filename = '전형결과.xlsx';
    } else if (type === 'accepted') {
      data = db.prepare(`
        SELECT a.exam_number as 수험번호, a.name as 이름, a.middle_school as 출신중학교, a.admission_type as 전형유형,
               r.final_score as 최종점수, r.rank as 순위
        FROM results r JOIN applicants a ON a.id = r.applicant_id
        WHERE r.decision IN ('accepted','extra_accepted')
        ORDER BY r.rank ASC
      `).all();
      filename = '합격자명단.xlsx';
    }

    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: filename,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    });
    if (canceled) return null;

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, filePath);
    return filePath;
  });

  // ─── 엑셀 파일 선택 대화상자 ───
  ipcMain.handle('dialog:openExcel', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xls', 'csv'] }],
      properties: ['openFile'],
    });
    if (canceled) return null;
    return filePaths[0];
  });

  // ─── 백업/복원 ───
  ipcMain.handle('backup:create', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: `admission_backup_${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: 'Database', extensions: ['db'] }],
    });
    if (canceled) return null;
    await backupDatabase(filePath);
    return filePath;
  });

  ipcMain.handle('backup:restore', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      filters: [{ name: 'Database', extensions: ['db'] }],
      properties: ['openFile'],
    });
    if (canceled) return null;
    const destPath = getDbPath();
    fs.copyFileSync(filePaths[0], destPath);
    return true; // 앱 재시작 필요
  });

  // ─── 출신중학교 자동완성 ───
  ipcMain.handle('autocomplete:schools', () => {
    const db = getDb();
    return db.prepare('SELECT DISTINCT middle_school FROM applicants WHERE middle_school IS NOT NULL AND middle_school != "" ORDER BY middle_school').all()
      .map(r => r.middle_school);
  });
}

module.exports = { registerIpcHandlers };
