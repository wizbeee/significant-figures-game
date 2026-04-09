// ============================================================
//  유효숫자 마스터 - Significant Figures Multiplayer Game Server
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

const PORT = 3000;
const DIR = path.resolve(__dirname || process.cwd());

// ============================================================
//  1. Significant Figures Analysis
// ============================================================

/**
 * Analyze a number string and return the count of significant figures
 * and an array describing each digit's significance.
 *
 * Rules:
 *  - Non-zero digits are always significant
 *  - Zeros between non-zero digits (captive) are significant
 *  - Leading zeros are NOT significant
 *  - Trailing zeros after the decimal point ARE significant
 *  - Trailing zeros in whole numbers (no decimal point) are NOT significant
 */
function analyze(numStr) {
  const s = numStr.trim();
  const hasDecimal = s.includes('.');

  // Strip optional leading minus/plus
  const cleaned = s.replace(/^[+-]/, '');

  // Split into integer and fractional parts
  const parts = cleaned.split('.');
  const intPart = parts[0] || '';
  const fracPart = parts[1] || '';

  // Build a full digit string (no decimal point)
  const allDigits = intPart + fracPart;

  // Find first and last non-zero digit positions in allDigits
  let firstNZ = -1;
  let lastNZ = -1;
  for (let i = 0; i < allDigits.length; i++) {
    if (allDigits[i] !== '0') {
      if (firstNZ === -1) firstNZ = i;
      lastNZ = i;
    }
  }

  // If number is 0 (all zeros)
  if (firstNZ === -1) {
    // e.g. "0", "0.0", "0.00" -- pure zero is conventionally 1 sig fig
    const count = 1;
    const sigDigits = [];
    for (const ch of s) {
      if (ch === '.' || ch === '-' || ch === '+') {
        sigDigits.push({ c: ch, pt: ch === '.', sig: false });
      } else {
        sigDigits.push({ c: ch, sig: true });
      }
    }
    return { count, sigDigits };
  }

  // Determine which positions in allDigits are significant
  const sigMap = new Array(allDigits.length).fill(false);
  for (let i = 0; i < allDigits.length; i++) {
    if (allDigits[i] !== '0') {
      // Non-zero digit: always significant
      sigMap[i] = true;
    } else if (i > firstNZ && i < lastNZ) {
      // Captive zero (between non-zero digits)
      sigMap[i] = true;
    } else if (i > lastNZ && hasDecimal) {
      // Trailing zero when decimal point present (integer or fractional part)
      sigMap[i] = true;
    }
    // Leading zeros and trailing zeros in whole numbers (no decimal) remain false
  }

  const count = sigMap.filter(Boolean).length;

  // Build sigDigits array matching the original string characters
  const sigDigits = [];
  let digitIdx = 0;
  for (const ch of s) {
    if (ch === '.' || ch === '-' || ch === '+') {
      sigDigits.push({ c: ch, pt: ch === '.', sig: false });
    } else {
      sigDigits.push({ c: ch, sig: sigMap[digitIdx] });
      digitIdx++;
    }
  }

  return { count, sigDigits };
}

// ============================================================
//  2. Number Pools (3 difficulty levels, 50+ each)
// ============================================================

const NUMBER_POOLS = {
  easy: [
    '25', '3.7', '0.5', '2.0', '510', '47', '100', '8.2', '6.00', '72',
    '350', '9.1', '0.8', '4.5', '63', '1.2', '80', '15', '7.0', '36',
    '0.3', '2.5', '91', '0.70', '44', '5.6', '200', '3.0', '18', '0.9',
    '67', '4.00', '0.25', '12', '8.0', '530', '2.7', '0.60', '95', '1.5',
    '40', '6.3', '0.45', '78', '3.2', '10', '0.12', '56', '9.0', '21',
    '7.5', '0.80', '34', '6.0', '420', '1.8', '0.35', '83', '2.4', '50'
  ],
  medium: [
    '0.0034', '100.0', '3.040', '1200', '30.06', '0.0780', '5010',
    '0.00120', '20.10', '4500', '0.560', '7.020', '1050', '0.0091',
    '60.30', '8100', '0.0450', '2.300', '90.05', '0.00670', '3600',
    '10.20', '0.1080', '5500', '40.07', '0.00340', '7200', '1.060',
    '0.0920', '6300', '20.04', '0.00560', '8500', '3.070', '50.08',
    '0.01200', '4100', '70.50', '0.00890', '9200', '2.040', '0.1500',
    '1800', '30.09', '0.0230', '6700', '5.010', '80.20', '0.00410',
    '4300', '10.50', '0.0670', '7800', '1.200'
  ],
  hard: [
    '0.001020', '10.0040', '300600', '0.00008050', '1000.00',
    '50.00200', '0.0040030', '200100', '0.000009070', '40.0060',
    '7000.0', '0.00102000', '30.00500', '500300', '0.00060040',
    '10000.0', '80.00100', '0.0070020', '400200', '0.000050030',
    '60.0080', '9000.00', '0.00203000', '20.00400', '600100',
    '0.00080050', '3000.0', '70.00300', '0.0050040', '100200',
    '0.000070060', '50.0020', '8000.00', '0.00304000', '40.00100',
    '700300', '0.00090070', '2000.0', '90.00200', '0.0060050',
    '300100', '0.000080040', '10.0030', '5000.00', '0.00105000',
    '60.00400', '800200', '0.00070030', '4000.0', '30.00600',
    '0.0080060', '900100', '0.000060050', '20.0040'
  ]
};

// ============================================================
//  3. Measurement Question Generation
// ============================================================

function randRange(min, max, step) {
  const steps = Math.round((max - min) / step);
  return min + Math.round(Math.random() * steps) * step;
}

function roundTo(val, decimals) {
  const f = Math.pow(10, decimals);
  return Math.round(val * f) / f;
}

function genMeasurement(difficulty) {
  let diff = difficulty;
  if (diff === 'mixed') diff = ['easy', 'medium', 'hard'][Math.floor(Math.random() * 3)];

  const types = ['ruler', 'cylinder', 'thermometer'];
  const type = types[Math.floor(Math.random() * types.length)];

  let value, displayValue, unit, smallestDiv, sigFigs;

  if (type === 'ruler') {
    // Smallest division: 0.1 cm (1 mm). Read to 0.01 cm.
    let rangeMax;
    if (diff === 'easy') rangeMax = 10;
    else if (diff === 'medium') rangeMax = 20;
    else rangeMax = 30;

    // Generate a value rounded to 0.01 cm
    value = roundTo(Math.random() * rangeMax + 0.5, 2);
    displayValue = value.toFixed(2);
    unit = 'cm';
    smallestDiv = 0.1;
    sigFigs = analyze(displayValue).count;
  } else if (type === 'cylinder') {
    // 100 mL range, smallest div 1 mL, read to 0.1 mL
    value = roundTo(Math.random() * 95 + 2, 1);
    displayValue = value.toFixed(1);
    unit = 'mL';
    smallestDiv = 1;
    sigFigs = analyze(displayValue).count;
  } else {
    // Thermometer: smallest div 1 C, read to 0.1 C
    let rangeMin, rangeMax;
    if (diff === 'easy') { rangeMin = 10; rangeMax = 40; }
    else if (diff === 'medium') { rangeMin = -10; rangeMax = 60; }
    else { rangeMin = -30; rangeMax = 110; }

    value = roundTo(rangeMin + Math.random() * (rangeMax - rangeMin), 1);
    displayValue = value.toFixed(1);
    unit = '\u00B0C';
    smallestDiv = 1;
    sigFigs = analyze(displayValue).count;
  }

  return { type, value, displayValue, unit, smallestDiv, sigFigs };
}

// ============================================================
//  4. Room Management
// ============================================================

const rooms = new Map(); // code -> room object
let connIdCounter = 0;
const adminConnections = new Set();

function genRoomCode() {
  let code;
  do {
    code = String(1000 + Math.floor(Math.random() * 9000));
  } while (rooms.has(code));
  return code;
}

function pickNumber(difficulty) {
  let diff = difficulty;
  if (diff === 'mixed') diff = ['easy', 'medium', 'hard'][Math.floor(Math.random() * 3)];
  const pool = NUMBER_POOLS[diff] || NUMBER_POOLS.easy;
  return pool[Math.floor(Math.random() * pool.length)];
}

function buildQuestion(room) {
  const { gameMode, settings } = room;
  const diff = settings.difficulty || 'easy';

  if (gameMode === 1) {
    const numStr = pickNumber(diff);
    return { gameMode: 1, numStr, _answer: analyze(numStr) };
  } else if (gameMode === 2) {
    const numStr = pickNumber(diff);
    const result = analyze(numStr);
    return {
      gameMode: 2,
      numStr,
      digits: result.sigDigits,
      _answer: result
    };
  } else {
    // gameMode === 3
    const m = genMeasurement(diff);
    return {
      gameMode: 3,
      measurement: {
        type: m.type,
        value: m.value,
        displayValue: m.displayValue,
        unit: m.unit,
        smallestDiv: m.smallestDiv
      },
      _answer: { sigFigs: m.sigFigs, displayValue: m.displayValue }
    };
  }
}

function questionForClient(q) {
  // Strip internal _answer field before sending to clients
  const out = { ...q };
  delete out._answer;
  return out;
}

// ============================================================
//  5. Scoring
// ============================================================

function calcScore(correct, elapsed, combo) {
  if (!correct) return { points: 0, breakdown: '오답' };
  const base = 100;
  const speed = Math.max(0, Math.round(50 * (1 - Math.min(elapsed, 10) / 10)));
  const comboBonus = Math.min((combo - 1) * 20, 100);
  const points = base + speed + comboBonus;
  return { points, breakdown: `기본 100 + 속도 ${speed} + 콤보 ${comboBonus}` };
}

// ============================================================
//  6. Answer Validation
// ============================================================

function validateAnswer(question, answer) {
  const gm = question.gameMode;

  if (gm === 1) {
    const expected = question._answer.count;
    const given = Number(answer.count);
    const correct = given === expected;
    const sigChars = question._answer.sigDigits.filter(d => d.sig).map(d => d.c).join(', ');
    const explanation = correct
      ? `${question.numStr} → 유효숫자: ${sigChars} (${expected}개)`
      : `${question.numStr} → 유효숫자: ${sigChars} (${expected}개, ${given}개 아님)`;
    return { correct, explanation };
  }

  if (gm === 2) {
    const expected = question._answer.sigDigits;
    const selected = answer.selected || [];
    let allCorrect = true;

    for (let i = 0; i < expected.length; i++) {
      if (expected[i].pt) continue;
      const expectedSig = expected[i].sig;
      const givenSig = !!selected[i];
      if (expectedSig !== givenSig) {
        allCorrect = false;
        break;
      }
    }

    const sigChars = expected.filter(d => d.sig).map(d => d.c).join(', ');
    const count = expected.filter(d => d.sig).length;
    const explanation = `유효숫자: ${sigChars} (${count}개)`;
    return { correct: allCorrect, explanation };
  }

  if (gm === 3) {
    const expectedSF = question._answer.sigFigs;
    const givenSF = Number(answer.sigFigs);
    const sfCorrect = givenSF === expectedSF;

    const expectedVal = question.measurement.value;
    const givenVal = Number(answer.measValue);
    const tolerance = question.measurement.smallestDiv * 0.5;
    const valClose = Math.abs(givenVal - expectedVal) <= tolerance;

    const correct = sfCorrect && valClose;
    let explanation;
    if (correct) {
      explanation = `정답: ${question._answer.displayValue} ${question.measurement.unit} (유효숫자 ${expectedSF}개)`;
    } else {
      const parts = [];
      if (!valClose) parts.push(`측정값은 ${question._answer.displayValue} ${question.measurement.unit}에 가까워야 합니다`);
      if (!sfCorrect) parts.push(`유효숫자는 ${givenSF}개가 아니라 ${expectedSF}개입니다`);
      explanation = parts.join(', ');
    }
    return { correct, explanation };
  }

  return { correct: false, explanation: '알 수 없는 게임 모드입니다.' };
}

// ============================================================
//  7. Broadcast Helpers
// ============================================================

function send(ws, msg) {
  try {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  } catch (_) { /* ignore */ }
}

function broadcastRoom(room, msg) {
  for (const p of room.players) {
    send(p.ws, msg);
  }
}

function broadcastAdmins(msg) {
  for (const ws of adminConnections) {
    send(ws, msg);
  }
}

function playerList(room) {
  return room.players.map(p => ({
    id: p.id,
    name: p.name,
    score: p.score,
    correct: p.correct,
    wrong: p.wrong,
    combo: p.combo,
    maxCombo: p.maxCombo,
    answered: p.answered
  }));
}

function roomSummary(room) {
  return {
    code: room.code,
    state: room.state,
    status: room.state,  // alias for admin.html compatibility
    gameMode: room.gameMode,
    playMode: room.playMode,
    settings: room.settings,
    timeLimit: room.settings.timeLimit,
    difficulty: room.settings.difficulty,
    playerCount: room.players.length,
    players: playerList(room),
    timeLeft: room.timeLeft
  };
}

function allRoomsSummary() {
  const list = [];
  for (const [, room] of rooms) {
    list.push(roomSummary(room));
  }
  return list;
}

// ============================================================
//  8. Game Flow
// ============================================================

function startGame(room) {
  room.state = 'playing';

  // Reset player stats
  for (const p of room.players) {
    p.score = 0;
    p.correct = 0;
    p.wrong = 0;
    p.combo = 0;
    p.maxCombo = 0;
    p.questionStartTime = null;
    p.currentQuestion = null;
    p.answered = 0;
  }

  room.timeLeft = room.settings.timeLimit;

  // Countdown: 3, 2, 1, 0 (GO)
  let count = 3;
  const cdInterval = setInterval(() => {
    broadcastRoom(room, { type: 'game:countdown', n: count });
    if (count === 0) {
      clearInterval(cdInterval);
      // Send first question to all players
      sendNewQuestionToAll(room);
      // Start tick timer
      room.timer = setInterval(() => tickRoom(room), 1000);
    }
    count--;
  }, 1000);

  room._countdownInterval = cdInterval;
}

function sendNewQuestionToAll(room) {
  const q = buildQuestion(room);
  room.currentQuestion = q;
  const clientQ = { type: 'game:question', ...questionForClient(q) };
  for (const p of room.players) {
    p.currentQuestion = q;
    p.questionStartTime = Date.now();
    send(p.ws, clientQ);
  }
}

function sendNewQuestionToPlayer(room, player) {
  const q = buildQuestion(room);
  player.currentQuestion = q;
  player.questionStartTime = Date.now();
  send(player.ws, { type: 'game:question', ...questionForClient(q) });
}

function tickRoom(room) {
  if (room.state !== 'playing') return;
  room.timeLeft--;
  broadcastRoom(room, { type: 'game:tick', timeLeft: room.timeLeft });

  if (room.timeLeft <= 0) {
    endGame(room);
  }
}

function endGame(room) {
  room.state = 'finished';
  if (room.timer) { clearInterval(room.timer); room.timer = null; }
  if (room._countdownInterval) { clearInterval(room._countdownInterval); room._countdownInterval = null; }

  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  const rankings = sorted.map(p => ({
    id: p.id,
    name: p.name,
    score: p.score,
    correct: p.correct,
    combo: p.maxCombo,
    answered: p.answered
  }));

  broadcastRoom(room, { type: 'game:over', players: rankings });
  broadcastAdmins({ type: 'admin:rooms', rooms: allRoomsSummary() });
}

function stopGame(room) {
  room.state = 'finished';
  if (room.timer) { clearInterval(room.timer); room.timer = null; }
  if (room._countdownInterval) { clearInterval(room._countdownInterval); room._countdownInterval = null; }
  broadcastRoom(room, { type: 'game:stopped' });
  broadcastAdmins({ type: 'admin:rooms', rooms: allRoomsSummary() });
}

function handleAnswer(player, room, answer) {
  if (room.state !== 'playing') return;
  if (!player.currentQuestion) return;

  const q = player.currentQuestion;
  const elapsed = (Date.now() - player.questionStartTime) / 1000;
  const { correct, explanation } = validateAnswer(q, answer);

  player.answered++;
  if (correct) {
    player.combo++;
    player.correct++;
    if (player.combo > player.maxCombo) player.maxCombo = player.combo;
  } else {
    player.combo = 0;
    player.wrong++;
  }

  const { points } = calcScore(correct, elapsed, player.combo);

  // Battle mode first-answer bonus
  let battleBonus = 0;
  if (room.playMode === 'battle' && correct) {
    if (!room._currentQAnswered) room._currentQAnswered = new Set();
    if (room._currentQAnswered.size === 0) {
      battleBonus = 50; // first correct answer bonus
    }
    room._currentQAnswered.add(player.id);
  }

  const totalPoints = points + battleBonus;
  player.score += totalPoints;

  // Send result to the answering player
  send(player.ws, {
    type: 'game:result',
    correct,
    points: totalPoints,
    explanation,
    scores: playerList(room)
  });

  // Broadcast updated scores to everyone
  broadcastRoom(room, {
    type: 'game:scores',
    players: playerList(room)
  });

  // Send next question
  if (room.playMode === 'battle') {
    // Track who answered this round
    if (!room._currentQPlayers) room._currentQPlayers = new Set();
    room._currentQPlayers.add(player.id);
    // Move to next question when all players answered
    const allAnswered = room.players.every(p => room._currentQPlayers.has(p.id));
    if (allAnswered) {
      room._currentQPlayers = new Set();
      room._currentQAnswered = new Set();
      setTimeout(() => {
        if (room.state === 'playing') sendNewQuestionToAll(room);
      }, 500);
    }
  } else {
    // Multi mode: each player proceeds independently
    sendNewQuestionToPlayer(room, player);
  }

  broadcastAdmins({ type: 'admin:rooms', rooms: allRoomsSummary() });
}

// ============================================================
//  9. HTTP Static File Server
// ============================================================

const MIME = {
  '.html': 'text/html;charset=utf-8',
  '.js': 'application/javascript;charset=utf-8',
  '.css': 'text/css;charset=utf-8',
  '.json': 'application/json;charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav'
};

const httpServer = http.createServer((req, res) => {
  let url = req.url === '/' ? '/index.html' : req.url;
  url = decodeURIComponent(url.split('?')[0]);

  // Security: prevent directory traversal
  const fp = path.normalize(path.join(DIR, url));
  if (!fp.startsWith(DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(fp, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain;charset=utf-8' });
      res.end('Not found');
    } else {
      const ext = path.extname(fp).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
      });
      res.end(data);
    }
  });
});

// ============================================================
// 10. WebSocket Server
// ============================================================

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  const connId = 'c' + (++connIdCounter);
  ws._connId = connId;
  ws._isAdmin = false;
  ws._player = null;
  ws._roomCode = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (_) {
      send(ws, { type: 'error', msg: '잘못된 요청 형식입니다.' });
      return;
    }

    switch (msg.type) {
      // ---- Admin messages ----
      case 'admin:auth':
        ws._isAdmin = true;
        adminConnections.add(ws);
        send(ws, { type: 'admin:authed' });
        send(ws, { type: 'admin:rooms', rooms: allRoomsSummary() });
        send(ws, { type: 'admin:serverIp', ip: getLocalIPs()[0]?.address || 'localhost' });
        break;

      case 'admin:create': {
        const code = genRoomCode();
        const room = {
          code,
          state: 'waiting',
          gameMode: Number(msg.gameMode) || 1,
          playMode: msg.playMode || 'multi',
          settings: {
            timeLimit: Number(msg.timeLimit) || 60,
            difficulty: msg.difficulty || 'easy'
          },
          players: [],
          timer: null,
          timeLeft: 0,
          currentQuestion: null,
          _countdownInterval: null,
          _battleAnswered: false,
          _battleRound: 0
        };
        rooms.set(code, room);
        send(ws, { type: 'room:created', code, room: roomSummary(room) });
        broadcastAdmins({ type: 'admin:rooms', rooms: allRoomsSummary() });
        break;
      }

      case 'admin:delete': {
        const room = rooms.get(msg.code);
        if (!room) { send(ws, { type: 'error', msg: '방을 찾을 수 없습니다.' }); break; }
        if (room.timer) clearInterval(room.timer);
        if (room._countdownInterval) clearInterval(room._countdownInterval);
        for (const p of room.players) {
          send(p.ws, { type: 'room:kicked' });
          p.ws._player = null;
          p.ws._roomCode = null;
        }
        rooms.delete(msg.code);
        broadcastAdmins({ type: 'admin:rooms', rooms: allRoomsSummary() });
        break;
      }

      case 'admin:kick': {
        const room = rooms.get(msg.code);
        if (!room) { send(ws, { type: 'error', msg: '방을 찾을 수 없습니다.' }); break; }
        const idx = room.players.findIndex(p => p.id === msg.playerId);
        if (idx === -1) { send(ws, { type: 'error', msg: '플레이어를 찾을 수 없습니다.' }); break; }
        const kicked = room.players.splice(idx, 1)[0];
        send(kicked.ws, { type: 'room:kicked' });
        kicked.ws._player = null;
        kicked.ws._roomCode = null;
        broadcastRoom(room, { type: 'room:players', players: playerList(room) });
        broadcastAdmins({ type: 'admin:rooms', rooms: allRoomsSummary() });
        break;
      }

      case 'admin:start': {
        const room = rooms.get(msg.code);
        if (!room) { send(ws, { type: 'error', msg: '방을 찾을 수 없습니다.' }); break; }
        if (room.state !== 'waiting' && room.state !== 'finished') {
          send(ws, { type: 'error', msg: '이미 게임이 진행 중입니다.' });
          break;
        }
        if (room.players.length === 0) {
          send(ws, { type: 'error', msg: '방에 참가자가 없습니다.' });
          break;
        }
        // Reset state if restarting
        room.state = 'waiting';
        room._battleAnswered = false;
        room._battleRound = 0;
        startGame(room);
        broadcastAdmins({ type: 'admin:rooms', rooms: allRoomsSummary() });
        break;
      }

      case 'admin:stop': {
        const room = rooms.get(msg.code);
        if (!room) { send(ws, { type: 'error', msg: '방을 찾을 수 없습니다.' }); break; }
        stopGame(room);
        break;
      }

      case 'admin:status':
        send(ws, { type: 'admin:rooms', rooms: allRoomsSummary() });
        break;

      // ---- Student messages ----
      case 'join': {
        const code = msg.code;
        const name = (msg.name || '').trim();
        if (!name) { send(ws, { type: 'error', msg: '이름을 입력해주세요.' }); break; }
        if (!code) { send(ws, { type: 'error', msg: '방 코드를 입력해주세요.' }); break; }

        const room = rooms.get(code);
        if (!room) { send(ws, { type: 'error', msg: '존재하지 않는 방입니다.' }); break; }
        if (room.state === 'playing') { send(ws, { type: 'error', msg: '이미 게임이 진행 중입니다.' }); break; }

        // Check for duplicate name
        if (room.players.some(p => p.name === name)) {
          send(ws, { type: 'error', msg: '이미 사용 중인 이름입니다.' });
          break;
        }

        // Battle mode: max 2 players
        if (room.playMode === 'battle' && room.players.length >= 2) {
          send(ws, { type: 'error', msg: '배틀 모드는 최대 2명까지 참여할 수 있습니다.' });
          break;
        }

        const player = {
          id: connId,
          name,
          ws,
          score: 0,
          correct: 0,
          wrong: 0,
          combo: 0,
          maxCombo: 0,
          answered: 0,
          currentQuestion: null,
          questionStartTime: null
        };

        room.players.push(player);
        ws._player = player;
        ws._roomCode = code;

        send(ws, {
          type: 'room:joined',
          code,
          players: playerList(room),
          gameMode: room.gameMode,
          playMode: room.playMode,
          settings: room.settings
        });

        broadcastRoom(room, { type: 'room:players', players: playerList(room) });
        broadcastAdmins({ type: 'admin:rooms', rooms: allRoomsSummary() });
        break;
      }

      case 'answer': {
        const room = rooms.get(ws._roomCode);
        if (!room) { send(ws, { type: 'error', msg: '방에 참여하고 있지 않습니다.' }); break; }
        if (!ws._player) { send(ws, { type: 'error', msg: '플레이어가 아닙니다.' }); break; }
        handleAnswer(ws._player, room, msg);
        break;
      }

      default:
        send(ws, { type: 'error', msg: '알 수 없는 메시지 유형: ' + msg.type });
    }
  });

  ws.on('close', () => {
    // Clean up admin
    if (ws._isAdmin) {
      adminConnections.delete(ws);
    }

    // Clean up player from room
    if (ws._roomCode && ws._player) {
      const room = rooms.get(ws._roomCode);
      if (room) {
        const idx = room.players.findIndex(p => p.id === ws._player.id);
        if (idx !== -1) {
          room.players.splice(idx, 1);
          broadcastRoom(room, { type: 'room:players', players: playerList(room) });
          broadcastAdmins({ type: 'admin:rooms', rooms: allRoomsSummary() });

          // If no players left during a game, end it
          if (room.players.length === 0 && room.state === 'playing') {
            endGame(room);
          }
        }
      }
    }
  });

  ws.on('error', () => { /* swallow errors */ });
});

// ============================================================
// 11. Print Network Info and Start
// ============================================================

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({ name, address: iface.address });
      }
    }
  }
  return ips;
}

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(56));
  console.log('  유효숫자 마스터 - Significant Figures Game Server');
  console.log('='.repeat(56));
  console.log(`  Port: ${PORT}`);
  console.log('');
  console.log('  Students can connect at:');

  const ips = getLocalIPs();
  if (ips.length === 0) {
    console.log(`    http://localhost:${PORT}`);
  } else {
    for (const ip of ips) {
      console.log(`    http://${ip.address}:${PORT}  (${ip.name})`);
    }
  }

  console.log('');
  console.log('  Teacher dashboard:');
  if (ips.length === 0) {
    console.log(`    http://localhost:${PORT}/admin.html`);
  } else {
    console.log(`    http://${ips[0].address}:${PORT}/admin.html`);
  }

  console.log('');
  console.log('='.repeat(56));
});
