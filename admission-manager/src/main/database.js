const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const initSqlJs = require('sql.js');

let db = null;
let dbPath = '';

function getDbPath() {
  const userDataPath = app.getPath('userData');
  dbPath = path.join(userDataPath, 'admission.db');
  return dbPath;
}

async function initDatabase() {
  const filePath = getDbPath();
  const SQL = await initSqlJs();

  if (fs.existsSync(filePath)) {
    const buffer = fs.readFileSync(filePath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS applicants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_number TEXT UNIQUE,
      name TEXT NOT NULL,
      birth_date TEXT,
      gender TEXT,
      middle_school TEXT,
      phone TEXT,
      parent_phone TEXT,
      parent_name TEXT,
      address TEXT,
      admission_type TEXT DEFAULT '일반전형',
      status TEXT DEFAULT 'received',
      memo TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS doc_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      applicant_id INTEGER REFERENCES applicants(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      score REAL DEFAULT 0,
      max_score REAL DEFAULT 100,
      evaluator TEXT,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS interview_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      applicant_id INTEGER REFERENCES applicants(id) ON DELETE CASCADE,
      interviewer TEXT,
      category TEXT NOT NULL,
      score REAL DEFAULT 0,
      max_score REAL DEFAULT 100,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      applicant_id INTEGER UNIQUE REFERENCES applicants(id) ON DELETE CASCADE,
      doc_total REAL DEFAULT 0,
      interview_total REAL DEFAULT 0,
      final_score REAL DEFAULT 0,
      rank INTEGER,
      decision TEXT,
      decided_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS admission_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      year INTEGER DEFAULT 2027,
      total_slots INTEGER DEFAULT 200,
      doc_weight REAL DEFAULT 50,
      interview_weight REAL DEFAULT 50,
      doc_pass_count INTEGER DEFAULT 0,
      admission_types TEXT DEFAULT '["일반전형","사회통합전형","지역우선선발"]',
      doc_categories TEXT DEFAULT '["자기소개서","학교생활기록부","교사추천서"]',
      interview_categories TEXT DEFAULT '["자기주도학습능력","인성및사회성","지원동기및진로계획"]',
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  // 기본 설정 삽입
  const configCheck = db.exec('SELECT COUNT(*) as cnt FROM admission_config');
  if (configCheck[0]?.values[0][0] === 0) {
    db.run('INSERT INTO admission_config (id) VALUES (1)');
  }

  saveDatabase();
  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

// sql.js helper: SELECT -> array of objects
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// sql.js helper: SELECT one row
function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// sql.js helper: run statement with named params
function runSql(sql, params = {}) {
  db.run(sql, params);
}

function saveDatabase() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

function closeDatabase() {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
  }
}

function backupDatabase(destPath) {
  if (!db) throw new Error('Database not initialized');
  const data = db.export();
  fs.writeFileSync(destPath, Buffer.from(data));
}

module.exports = { initDatabase, getDb, closeDatabase, backupDatabase, getDbPath, queryAll, queryOne, runSql, saveDatabase };
