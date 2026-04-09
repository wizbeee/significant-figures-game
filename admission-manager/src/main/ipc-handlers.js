const { ipcMain, dialog } = require('electron');
const fs = require('fs');
const XLSX = require('xlsx');
const { getDb, backupDatabase, getDbPath, queryAll, queryOne, saveDatabase } = require('./database');
const auth = require('./auth');

function registerIpcHandlers() {
  // ─── 인증 ───
  ipcMain.handle('auth:isPasswordSet', () => auth.isPasswordSet());
  ipcMain.handle('auth:setPassword', (_, pw) => auth.setPassword(pw));
  ipcMain.handle('auth:verify', (_, pw) => auth.verifyPassword(pw));
  ipcMain.handle('auth:changePassword', (_, oldPw, newPw) => auth.changePassword(oldPw, newPw));

  // ─── 설정 ───
  ipcMain.handle('config:get', () => {
    const row = queryOne('SELECT * FROM admission_config WHERE id = 1');
    if (!row) return null;
    return {
      ...row,
      admission_types: JSON.parse(row.admission_types || '[]'),
      doc_categories: JSON.parse(row.doc_categories || '[]'),
      interview_categories: JSON.parse(row.interview_categories || '[]'),
    };
  });

  ipcMain.handle('config:update', (_, data) => {
    const db = getDb();
    db.run(`
      UPDATE admission_config SET
        year = ?, total_slots = ?,
        doc_weight = ?, interview_weight = ?,
        doc_pass_count = ?,
        admission_types = ?,
        doc_categories = ?,
        interview_categories = ?,
        updated_at = datetime('now','localtime')
      WHERE id = 1
    `, [data.year, data.total_slots, data.doc_weight, data.interview_weight, data.doc_pass_count || 0,
        JSON.stringify(data.admission_types), JSON.stringify(data.doc_categories), JSON.stringify(data.interview_categories)]);
    saveDatabase();
    return true;
  });

  // ─── 지원자 CRUD ───
  ipcMain.handle('applicants:list', (_, filters = {}) => {
    const { search, status, admission_type, page = 1, limit = 50 } = filters;
    let where = [];
    let params = [];

    if (search) {
      where.push("(name LIKE ? OR exam_number LIKE ? OR middle_school LIKE ?)");
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) { where.push("a.status = ?"); params.push(status); }
    if (admission_type) { where.push("a.admission_type = ?"); params.push(admission_type); }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const offset = (page - 1) * limit;

    const totalRow = queryOne(`SELECT COUNT(*) as cnt FROM applicants a ${whereClause}`, params);
    const total = totalRow?.cnt || 0;

    const rows = queryAll(`
      SELECT a.*, r.final_score, r.rank, r.decision
      FROM applicants a
      LEFT JOIN results r ON r.applicant_id = a.id
      ${whereClause}
      ORDER BY a.id DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    return { rows, total, page, limit, totalPages: Math.ceil(total / limit) };
  });

  ipcMain.handle('applicants:get', (_, id) => {
    const applicant = queryOne('SELECT * FROM applicants WHERE id = ?', [id]);
    if (!applicant) return null;
    const doc_scores = queryAll('SELECT * FROM doc_scores WHERE applicant_id = ?', [id]);
    const interview_scores = queryAll('SELECT * FROM interview_scores WHERE applicant_id = ?', [id]);
    const result = queryOne('SELECT * FROM results WHERE applicant_id = ?', [id]);
    return { ...applicant, doc_scores, interview_scores, result };
  });

  ipcMain.handle('applicants:create', (_, data) => {
    const db = getDb();
    const config = queryOne('SELECT year FROM admission_config WHERE id = 1');
    const year = config?.year || new Date().getFullYear() + 1;
    const lastNum = queryOne("SELECT exam_number FROM applicants WHERE exam_number LIKE ? ORDER BY exam_number DESC LIMIT 1", [`${year}-%`]);
    let seq = 1;
    if (lastNum) seq = parseInt(lastNum.exam_number.split('-')[1]) + 1;
    const exam_number = `${year}-${String(seq).padStart(4, '0')}`;

    db.run(`
      INSERT INTO applicants (exam_number, name, birth_date, gender, middle_school, phone, parent_phone, parent_name, address, admission_type, memo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [exam_number, data.name, data.birth_date, data.gender, data.middle_school, data.phone, data.parent_phone, data.parent_name, data.address, data.admission_type, data.memo]);

    const idRow = queryOne('SELECT last_insert_rowid() as id');
    saveDatabase();
    return { id: idRow.id, exam_number };
  });

  ipcMain.handle('applicants:update', (_, id, data) => {
    const db = getDb();
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const values = Object.values(data);
    db.run(`UPDATE applicants SET ${fields}, updated_at = datetime('now','localtime') WHERE id = ?`, [...values, id]);
    saveDatabase();
    return true;
  });

  ipcMain.handle('applicants:delete', (_, id) => {
    const db = getDb();
    db.run('DELETE FROM doc_scores WHERE applicant_id = ?', [id]);
    db.run('DELETE FROM interview_scores WHERE applicant_id = ?', [id]);
    db.run('DELETE FROM results WHERE applicant_id = ?', [id]);
    db.run('DELETE FROM applicants WHERE id = ?', [id]);
    saveDatabase();
    return true;
  });

  ipcMain.handle('applicants:bulkUpdateStatus', (_, ids, status) => {
    const db = getDb();
    for (const id of ids) {
      db.run("UPDATE applicants SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?", [status, id]);
    }
    saveDatabase();
    return true;
  });

  // ─── 엑셀 일괄 업로드 ───
  ipcMain.handle('applicants:importExcel', async (_, filePath) => {
    const db = getDb();
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);

    const config = queryOne('SELECT year FROM admission_config WHERE id = 1');
    const year = config?.year || new Date().getFullYear() + 1;
    const lastNum = queryOne("SELECT exam_number FROM applicants WHERE exam_number LIKE ? ORDER BY exam_number DESC LIMIT 1", [`${year}-%`]);
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

    let imported = 0;
    const errors = [];

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
        db.run(`INSERT INTO applicants (exam_number, name, birth_date, gender, middle_school, phone, parent_phone, parent_name, address, admission_type, memo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [exam_number, mapped.name, mapped.birth_date, mapped.gender, mapped.middle_school, mapped.phone, mapped.parent_phone, mapped.parent_name, mapped.address, mapped.admission_type, mapped.memo]);
        imported++;
      } catch (e) {
        errors.push(`행 ${imported + errors.length + 2}: ${e.message}`);
      }
    }

    saveDatabase();
    return { imported, errors, total: rows.length };
  });

  // ─── 점수 관리 ───
  ipcMain.handle('scores:saveDoc', (_, applicantId, scores) => {
    const db = getDb();
    db.run('DELETE FROM doc_scores WHERE applicant_id = ?', [applicantId]);
    for (const s of scores) {
      db.run('INSERT INTO doc_scores (applicant_id, category, score, max_score, evaluator, note) VALUES (?, ?, ?, ?, ?, ?)',
        [applicantId, s.category, s.score, s.max_score || 100, s.evaluator || '', s.note || '']);
    }
    saveDatabase();
    return true;
  });

  ipcMain.handle('scores:saveInterview', (_, applicantId, scores) => {
    const db = getDb();
    db.run('DELETE FROM interview_scores WHERE applicant_id = ?', [applicantId]);
    for (const s of scores) {
      db.run('INSERT INTO interview_scores (applicant_id, interviewer, category, score, max_score, note) VALUES (?, ?, ?, ?, ?, ?)',
        [applicantId, s.interviewer || '', s.category, s.score, s.max_score || 100, s.note || '']);
    }
    saveDatabase();
    return true;
  });

  // ─── 합격자 선발 ───
  ipcMain.handle('selection:calculate', () => {
    const db = getDb();
    const config = queryOne('SELECT * FROM admission_config WHERE id = 1');
    const docW = config.doc_weight / 100;
    const intW = config.interview_weight / 100;

    const applicants = queryAll("SELECT id FROM applicants WHERE status IN ('interview_pass','doc_pass','received')");
    const scored = [];

    for (const a of applicants) {
      const docRow = queryOne('SELECT COALESCE(SUM(score), 0) as total FROM doc_scores WHERE applicant_id = ?', [a.id]);
      const intRow = queryOne('SELECT COALESCE(AVG(score), 0) as total FROM interview_scores WHERE applicant_id = ?', [a.id]);
      const docTotal = docRow?.total || 0;
      const intTotal = intRow?.total || 0;
      const finalScore = Math.round((docTotal * docW + intTotal * intW) * 100) / 100;
      scored.push({ applicant_id: a.id, doc_total: docTotal, interview_total: intTotal, final_score: finalScore });
    }

    scored.sort((a, b) => b.final_score - a.final_score);

    for (let i = 0; i < scored.length; i++) {
      const s = scored[i];
      // upsert: delete then insert
      db.run('DELETE FROM results WHERE applicant_id = ?', [s.applicant_id]);
      db.run('INSERT INTO results (applicant_id, doc_total, interview_total, final_score, rank) VALUES (?, ?, ?, ?, ?)',
        [s.applicant_id, s.doc_total, s.interview_total, s.final_score, i + 1]);
    }

    saveDatabase();
    return scored;
  });

  ipcMain.handle('selection:decide', (_, decisions) => {
    const db = getDb();
    for (const { applicant_id, decision } of decisions) {
      db.run("UPDATE results SET decision = ?, decided_at = datetime('now','localtime') WHERE applicant_id = ?", [decision, applicant_id]);
      db.run("UPDATE applicants SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?", [decision, applicant_id]);
    }
    saveDatabase();
    return true;
  });

  ipcMain.handle('selection:getResults', () => {
    return queryAll(`
      SELECT r.*, a.name, a.exam_number, a.middle_school, a.admission_type, a.status
      FROM results r
      JOIN applicants a ON a.id = r.applicant_id
      ORDER BY r.rank ASC
    `);
  });

  // ─── 통계 ───
  ipcMain.handle('stats:dashboard', () => {
    const config = queryOne('SELECT * FROM admission_config WHERE id = 1');
    const totalRow = queryOne('SELECT COUNT(*) as cnt FROM applicants');
    const total = totalRow?.cnt || 0;
    const byStatus = queryAll('SELECT status, COUNT(*) as cnt FROM applicants GROUP BY status');
    const byType = queryAll('SELECT admission_type, COUNT(*) as cnt FROM applicants GROUP BY admission_type');
    const bySchool = queryAll('SELECT middle_school, COUNT(*) as cnt FROM applicants GROUP BY middle_school ORDER BY cnt DESC LIMIT 10');
    const scoreDistribution = queryAll(`
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
    `);

    return {
      config: { ...config, admission_types: JSON.parse(config?.admission_types || '[]') },
      total,
      totalSlots: config?.total_slots || 0,
      competitionRate: config?.total_slots > 0 ? (total / config.total_slots).toFixed(2) : 0,
      byStatus, byType, bySchool, scoreDistribution,
    };
  });

  // ─── 엑셀 내보내기 ───
  ipcMain.handle('export:excel', async (_, type) => {
    let data = [];
    let filename = '';

    if (type === 'applicants') {
      data = queryAll('SELECT exam_number as 수험번호, name as 이름, birth_date as 생년월일, gender as 성별, middle_school as 출신중학교, phone as 연락처, parent_phone as 보호자연락처, admission_type as 전형유형, status as 상태 FROM applicants ORDER BY exam_number');
      filename = '지원자명단.xlsx';
    } else if (type === 'results') {
      data = queryAll(`SELECT a.exam_number as 수험번호, a.name as 이름, a.middle_school as 출신중학교, a.admission_type as 전형유형, r.doc_total as 서류점수, r.interview_total as 면접점수, r.final_score as 최종점수, r.rank as 순위, r.decision as 합격여부 FROM results r JOIN applicants a ON a.id = r.applicant_id ORDER BY r.rank ASC`);
      filename = '전형결과.xlsx';
    } else if (type === 'accepted') {
      data = queryAll(`SELECT a.exam_number as 수험번호, a.name as 이름, a.middle_school as 출신중학교, a.admission_type as 전형유형, r.final_score as 최종점수, r.rank as 순위 FROM results r JOIN applicants a ON a.id = r.applicant_id WHERE r.decision IN ('accepted','extra_accepted') ORDER BY r.rank ASC`);
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

  // ─── 엑셀 파일 선택 ───
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
    backupDatabase(filePath);
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
    return true;
  });

  // ─── 출신중학교 자동완성 ───
  ipcMain.handle('autocomplete:schools', () => {
    return queryAll('SELECT DISTINCT middle_school FROM applicants WHERE middle_school IS NOT NULL AND middle_school != "" ORDER BY middle_school')
      .map(r => r.middle_school);
  });
}

module.exports = { registerIpcHandlers };
