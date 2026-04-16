/**
 * Browser-compatible IPC layer using IndexedDB
 * Replaces Electron ipcRenderer for web browser usage
 */
import * as XLSX from 'xlsx';

const DB_NAME = 'admission-manager';
const DB_VERSION = 2;

let dbInstance = null;

function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('applicants')) {
        const store = db.createObjectStore('applicants', { keyPath: 'id', autoIncrement: true });
        store.createIndex('status', 'status');
        store.createIndex('admission_type', 'admission_type');
        store.createIndex('exam_number', 'exam_number', { unique: true });
        store.createIndex('name', 'name');
        store.createIndex('middle_school', 'middle_school');
      }
      if (!db.objectStoreNames.contains('config')) {
        db.createObjectStore('config', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('auth')) {
        db.createObjectStore('auth', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => { dbInstance = req.result; resolve(dbInstance); };
    req.onerror = () => reject(req.error);
  });
}

function tx(storeName, mode = 'readonly') {
  return openDB().then(db => {
    const transaction = db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  });
}

function txMulti(storeNames, mode = 'readonly') {
  return openDB().then(db => {
    const transaction = db.transaction(storeNames, mode);
    return storeNames.map(name => transaction.objectStore(name));
  });
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAllFromStore(storeName) {
  return tx(storeName).then(store => promisify(store.getAll()));
}

// Default config
const DEFAULT_CONFIG = {
  id: 'main',
  year: 2027,
  total_slots: 120,
  doc_weight: 50,
  interview_weight: 50,
  admission_types: ['일반전형', '사회통합전형', '지역우선선발'],
  doc_categories: ['자기소개서', '학교생활기록부', '교사추천서'],
  interview_categories: ['자기주도학습능력', '인성및사회성', '지원동기및진로계획'],
};

// Simple hash for password (browser-safe)
async function hashPassword(pw) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pw + 'admission-salt-2027');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Generate exam number
function generateExamNumber(year, seq) {
  return `${year}-${String(seq).padStart(4, '0')}`;
}

// Excel column name mapping (same as Electron main process)
const COL_MAP = {
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

// Read Excel File object and return array of row objects
function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws);
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

// Open browser file picker and return the selected File
function openFilePicker(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
}

const ipc = {
  // === Auth ===
  isPasswordSet: async () => {
    const store = await tx('auth');
    const auth = await promisify(store.get('password'));
    return !!auth;
  },

  setPassword: async (pw) => {
    const store = await tx('auth', 'readwrite');
    const hashed = await hashPassword(pw);
    await promisify(store.put({ id: 'password', hash: hashed }));
    // Also initialize config if not exists
    const cfgStore = await tx('config', 'readwrite');
    const existing = await promisify(cfgStore.get('main'));
    if (!existing) {
      await promisify(cfgStore.put({ ...DEFAULT_CONFIG }));
    }
  },

  verify: async (pw) => {
    const store = await tx('auth');
    const auth = await promisify(store.get('password'));
    if (!auth) return false;
    const hashed = await hashPassword(pw);
    return auth.hash === hashed;
  },

  changePassword: async (oldPw, newPw) => {
    const ok = await ipc.verify(oldPw);
    if (!ok) return false;
    const store = await tx('auth', 'readwrite');
    const hashed = await hashPassword(newPw);
    await promisify(store.put({ id: 'password', hash: hashed }));
    return true;
  },

  // === Config ===
  getConfig: async () => {
    const store = await tx('config');
    const cfg = await promisify(store.get('main'));
    return cfg || { ...DEFAULT_CONFIG };
  },

  updateConfig: async (data) => {
    const store = await tx('config', 'readwrite');
    await promisify(store.put({ ...data, id: 'main' }));
  },

  // === Applicants ===
  listApplicants: async ({ search = '', status = '', admission_type = '', page = 1 } = {}) => {
    const all = await getAllFromStore('applicants');
    let filtered = all;

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(a =>
        (a.name || '').toLowerCase().includes(q) ||
        (a.exam_number || '').toLowerCase().includes(q) ||
        (a.middle_school || '').toLowerCase().includes(q)
      );
    }
    if (status) filtered = filtered.filter(a => a.status === status);
    if (admission_type) filtered = filtered.filter(a => a.admission_type === admission_type);

    filtered.sort((a, b) => (b.id || 0) - (a.id || 0));

    const pageSize = 20;
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    const rows = filtered.slice(start, start + pageSize);

    return { rows, total, totalPages, page };
  },

  getApplicant: async (id) => {
    const store = await tx('applicants');
    return promisify(store.get(id));
  },

  createApplicant: async (data) => {
    const all = await getAllFromStore('applicants');
    const config = await ipc.getConfig();
    const maxSeq = all.reduce((max, a) => {
      if (a.exam_number) {
        const parts = a.exam_number.split('-');
        const seq = parseInt(parts[1]) || 0;
        return Math.max(max, seq);
      }
      return max;
    }, 0);
    const exam_number = generateExamNumber(config.year, maxSeq + 1);

    const applicant = {
      ...data,
      exam_number,
      status: 'received',
      doc_scores: [],
      interview_scores: [],
      result: null,
      created_at: new Date().toISOString(),
    };

    const store = await tx('applicants', 'readwrite');
    const id = await promisify(store.add(applicant));
    return { id, exam_number };
  },

  updateApplicant: async (id, data) => {
    const store = await tx('applicants', 'readwrite');
    const existing = await promisify(store.get(id));
    if (!existing) throw new Error('지원자를 찾을 수 없습니다.');
    const updated = { ...existing, ...data, id };
    await promisify(store.put(updated));
  },

  deleteApplicant: async (id) => {
    const store = await tx('applicants', 'readwrite');
    await promisify(store.delete(id));
  },

  bulkUpdateStatus: async (ids, status) => {
    const store = await tx('applicants', 'readwrite');
    for (const id of ids) {
      const a = await promisify(store.get(id));
      if (a) {
        a.status = status;
        await promisify(store.put(a));
      }
    }
  },

  importExcel: async (fileOrPath) => {
    // In browser, we handle File objects from drag-drop or file input
    alert('브라우저 모드에서는 엑셀 가져오기가 제한됩니다.\n"신규 등록" 버튼을 이용해 주세요.');
    return { imported: 0, total: 0, errors: ['브라우저 모드에서는 엑셀 가져오기를 지원하지 않습니다.'] };
  },

  openExcelDialog: async () => {
    alert('브라우저 모드에서는 엑셀 가져오기가 제한됩니다.\n"신규 등록" 버튼을 이용해 주세요.');
    return null;
  },

  // === Scores ===
  saveDocScores: async (applicantId, scores) => {
    const store = await tx('applicants', 'readwrite');
    const a = await promisify(store.get(applicantId));
    if (!a) throw new Error('지원자를 찾을 수 없습니다.');
    a.doc_scores = scores;
    await promisify(store.put(a));
  },

  saveInterviewScores: async (applicantId, scores) => {
    const store = await tx('applicants', 'readwrite');
    const a = await promisify(store.get(applicantId));
    if (!a) throw new Error('지원자를 찾을 수 없습니다.');
    a.interview_scores = scores;
    await promisify(store.put(a));
  },

  // === Selection ===
  calculateSelection: async () => {
    const config = await ipc.getConfig();
    const all = await getAllFromStore('applicants');
    const docWeight = (config.doc_weight || 50) / 100;
    const intWeight = (config.interview_weight || 50) / 100;

    const scored = all
      .filter(a => a.status !== 'doc_fail' && a.status !== 'rejected')
      .map(a => {
        const docTotal = (a.doc_scores || []).reduce((s, sc) => s + (sc.score || 0), 0);
        const intTotal = (a.interview_scores || []).reduce((s, sc) => s + (sc.score || 0), 0);
        const finalScore = docTotal * docWeight + intTotal * intWeight;
        return { ...a, result: { doc_total: docTotal, interview_total: intTotal, final_score: finalScore, rank: 0 } };
      })
      .sort((a, b) => b.result.final_score - a.result.final_score);

    scored.forEach((a, i) => { a.result.rank = i + 1; });

    const store = await tx('applicants', 'readwrite');
    for (const a of scored) {
      await promisify(store.put(a));
    }
  },

  decideSelection: async (decisions) => {
    const store = await tx('applicants', 'readwrite');
    for (const d of decisions) {
      const a = await promisify(store.get(d.applicant_id));
      if (a) {
        a.status = d.decision;
        if (a.result) a.result.decision = d.decision;
        await promisify(store.put(a));
      }
    }
  },

  getResults: async () => {
    const all = await getAllFromStore('applicants');
    return all
      .filter(a => a.result && a.result.rank > 0)
      .sort((a, b) => a.result.rank - b.result.rank)
      .map(a => ({
        applicant_id: a.id,
        exam_number: a.exam_number,
        name: a.name,
        middle_school: a.middle_school,
        admission_type: a.admission_type,
        doc_total: a.result.doc_total,
        interview_total: a.result.interview_total,
        final_score: a.result.final_score,
        rank: a.result.rank,
        decision: a.result?.decision || a.status,
      }));
  },

  // === Dashboard / Stats ===
  getDashboard: async () => {
    const config = await ipc.getConfig();
    const all = await getAllFromStore('applicants');
    const total = all.length;
    const totalSlots = config.total_slots || 0;
    const competitionRate = totalSlots > 0 ? (total / totalSlots).toFixed(2) : '0.00';

    // byStatus
    const statusMap = {};
    all.forEach(a => {
      statusMap[a.status] = (statusMap[a.status] || 0) + 1;
    });
    const byStatus = Object.entries(statusMap).map(([status, cnt]) => ({ status, cnt }));

    // byType
    const typeMap = {};
    all.forEach(a => {
      const t = a.admission_type || '미지정';
      typeMap[t] = (typeMap[t] || 0) + 1;
    });
    const byType = Object.entries(typeMap).map(([admission_type, cnt]) => ({ admission_type, cnt }));

    // bySchool (top 10)
    const schoolMap = {};
    all.forEach(a => {
      if (a.middle_school) schoolMap[a.middle_school] = (schoolMap[a.middle_school] || 0) + 1;
    });
    const bySchool = Object.entries(schoolMap)
      .map(([middle_school, cnt]) => ({ middle_school, cnt }))
      .sort((a, b) => b.cnt - a.cnt)
      .slice(0, 10);

    // scoreDistribution
    const ranges = ['0-10', '10-20', '20-30', '30-40', '40-50', '50-60', '60-70', '70-80', '80-90', '90-100'];
    const scoreDist = ranges.map(r => ({ range: r, cnt: 0 }));
    all.forEach(a => {
      if (a.result && a.result.final_score != null) {
        const idx = Math.min(Math.floor(a.result.final_score / 10), 9);
        scoreDist[idx].cnt++;
      }
    });

    return { total, totalSlots, competitionRate, config, byStatus, byType, bySchool, scoreDistribution: scoreDist };
  },

  // === Export (browser download) ===
  exportExcel: async (type) => {
    const all = await getAllFromStore('applicants');
    let data, filename;

    if (type === 'applicants') {
      data = all.map(a => ({
        수험번호: a.exam_number, 이름: a.name, 성별: a.gender, 생년월일: a.birth_date,
        출신중학교: a.middle_school, 전형유형: a.admission_type, 상태: a.status,
        연락처: a.phone, 보호자명: a.parent_name, 보호자연락처: a.parent_phone, 주소: a.address, 비고: a.memo
      }));
      filename = '지원자목록.csv';
    } else if (type === 'results') {
      data = all.filter(a => a.result).sort((a, b) => (a.result.rank || 999) - (b.result.rank || 999)).map(a => ({
        순위: a.result.rank, 수험번호: a.exam_number, 이름: a.name, 출신중학교: a.middle_school,
        전형유형: a.admission_type, 서류점수: a.result.doc_total, 면접점수: a.result.interview_total,
        최종점수: a.result.final_score, 판정: a.result.decision || a.status
      }));
      filename = '전형결과.csv';
    } else if (type === 'accepted') {
      data = all.filter(a => a.status === 'accepted' || a.status === 'extra_accepted').map(a => ({
        수험번호: a.exam_number, 이름: a.name, 출신중학교: a.middle_school,
        전형유형: a.admission_type, 최종점수: a.result?.final_score, 순위: a.result?.rank
      }));
      filename = '합격자명단.csv';
    } else {
      return;
    }

    // Generate CSV with BOM for Excel Korean support
    if (data.length === 0) { alert('내보낼 데이터가 없습니다.'); return; }
    const headers = Object.keys(data[0]);
    const csvContent = '\uFEFF' + headers.join(',') + '\n' +
      data.map(row => headers.map(h => {
        const val = String(row[h] ?? '');
        return val.includes(',') || val.includes('"') || val.includes('\n') ? `"${val.replace(/"/g, '""')}"` : val;
      }).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  // === Backup / Restore ===
  createBackup: async () => {
    const [applicants, config, auth] = await Promise.all([
      getAllFromStore('applicants'),
      ipc.getConfig(),
      tx('auth').then(s => promisify(s.get('password'))),
    ]);
    const backup = {
      version: 1,
      date: new Date().toISOString(),
      applicants,
      config,
      auth,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `입학전형_백업_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return `백업 파일이 다운로드됩니다.`;
  },

  restoreBackup: async () => {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) { resolve(); return; }
        try {
          const text = await file.text();
          const backup = JSON.parse(text);
          if (!backup.applicants || !backup.config) {
            alert('유효하지 않은 백업 파일입니다.');
            resolve();
            return;
          }
          // Clear and restore applicants
          const appStore = await tx('applicants', 'readwrite');
          await promisify(appStore.clear());
          for (const a of backup.applicants) {
            await promisify(appStore.put(a));
          }
          // Restore config
          const cfgStore = await tx('config', 'readwrite');
          await promisify(cfgStore.put({ ...backup.config, id: 'main' }));
          // Restore auth
          if (backup.auth) {
            const authStore = await tx('auth', 'readwrite');
            await promisify(authStore.put(backup.auth));
          }
          resolve();
        } catch (err) {
          alert('복원 오류: ' + err.message);
          resolve();
        }
      };
      input.click();
    });
  },

  // === Autocomplete ===
  getSchools: async () => {
    const all = await getAllFromStore('applicants');
    const schools = [...new Set(all.map(a => a.middle_school).filter(Boolean))];
    return schools.sort();
  },
};

export default ipc;
