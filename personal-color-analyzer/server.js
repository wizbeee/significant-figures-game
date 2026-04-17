// ============================================================
//  퍼스널 컬러 분석 서비스 - HTTPS + WebSocket Relay Server
// ============================================================

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const { execSync } = require('child_process');
const Anthropic = require('@anthropic-ai/sdk');
const nodemailer = require('nodemailer');

const HTTP_PORT = 5000;
const HTTPS_PORT = 5001;
const DIR = path.resolve(__dirname || process.cwd());
const CERT_DIR = path.join(DIR, '.certs');

// ============================================================
//  1. Self-Signed Certificate Generation
// ============================================================

function generateSelfSignedCert() {
  if (!fs.existsSync(CERT_DIR)) {
    fs.mkdirSync(CERT_DIR, { recursive: true });
  }

  const keyPath = path.join(CERT_DIR, 'key.pem');
  const certPath = path.join(CERT_DIR, 'cert.pem');

  // 이미 인증서가 있으면 재사용
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };
  }

  console.log('  🔐 자체 서명 인증서 생성 중...');

  // Node.js의 crypto로 자체 서명 인증서 생성
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  // 간단한 자체서명 인증서 생성 (openssl 이용)
  try {
    fs.writeFileSync(keyPath, privateKey);

    // openssl로 자체 서명 인증서 생성
    const ips = getLocalIPs();
    const sanList = ips.map((ip, i) => `IP.${i + 1}:${ip.address}`).join(',');
    const san = `[SAN]\nsubjectAltName=DNS:localhost,${sanList || 'IP.1:127.0.0.1'}`;
    const confPath = path.join(CERT_DIR, 'openssl.cnf');

    const opensslConf = `[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_req

[dn]
CN = Personal Color Analyzer

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
${ips.map((ip, i) => `IP.${i + 1} = ${ip.address}`).join('\n')}
IP.${ips.length + 1} = 127.0.0.1
`;

    fs.writeFileSync(confPath, opensslConf);

    execSync(
      `openssl req -new -x509 -key "${keyPath}" -out "${certPath}" -days 365 -config "${confPath}"`,
      { stdio: 'pipe' }
    );

    console.log('  ✅ 인증서 생성 완료');
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };
  } catch (err) {
    // openssl 없으면 Node.js 내장 방식으로 폴백
    console.log('  ⚠️  openssl 없음 — 내장 방식으로 인증서 생성');
    try {
      // Node 15+ 에서 사용 가능한 X509Certificate
      const cert = crypto.X509Certificate ? generateCertWithNodeCrypto(privateKey) : null;
      if (cert) {
        fs.writeFileSync(certPath, cert);
        return { key: privateKey, cert };
      }
    } catch (_) {}

    // 최종 폴백: 간이 인증서 (일부 브라우저에서 동작하지 않을 수 있음)
    console.log('  ⚠️  인증서 생성 실패 — HTTP 전용 모드로 실행됩니다');
    return null;
  }
}

function generateCertWithNodeCrypto(privateKey) {
  // Node.js 내장 방식으로 자체 서명 인증서 생성 시도
  // 이 방법은 Node 20+ 에서 동작
  if (!crypto.createCertificate && !crypto.generateCertSync) {
    return null;
  }
  return null; // 보수적으로 null 반환, openssl에 의존
}

// ============================================================
//  2. Session Management
// ============================================================

const sessions = new Map();

function generateSessionCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return sessions.has(code) ? generateSessionCode() : code;
}

function cleanupSessions() {
  const now = Date.now();
  for (const [code, session] of sessions) {
    if (now - session.createdAt > 3600000) {
      sessions.delete(code);
    }
  }
}
setInterval(cleanupSessions, 300000);

// ============================================================
//  3. Static File Handler (공유)
// ============================================================

const MIME = {
  '.html': 'text/html;charset=utf-8',
  '.js':   'application/javascript;charset=utf-8',
  '.mjs':  'application/javascript;charset=utf-8',
  '.css':  'text/css;charset=utf-8',
  '.json': 'application/json;charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.wasm': 'application/wasm'
};

// ============================================================
//  3-A. API Endpoints
// ============================================================

// JSON body 파싱 헬퍼
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function jsonResponse(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json;charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

// Claude API 키 로드
function getAnthropicKey() {
  // 1. 환경변수
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  // 2. .env 파일
  const envPath = path.join(DIR, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const m = line.match(/^ANTHROPIC_API_KEY\s*=\s*(.+)/);
      if (m) return m[1].trim();
    }
  }
  return null;
}

// SMTP 설정 로드
function getSmtpConfig() {
  const envPath = path.join(DIR, '.env');
  const config = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const m = line.match(/^(SMTP_\w+)\s*=\s*(.+)/);
      if (m) config[m[1].trim()] = m[2].trim();
    }
  }
  // 환경변수 우선
  return {
    host: process.env.SMTP_HOST || config.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || config.SMTP_PORT || '587'),
    user: process.env.SMTP_USER || config.SMTP_USER || '',
    pass: process.env.SMTP_PASS || config.SMTP_PASS || '',
    from: process.env.SMTP_FROM || config.SMTP_FROM || ''
  };
}

// POST /api/analyze-with-ai — Claude Vision 분석
async function handleAiAnalysis(req, res) {
  const apiKey = getAnthropicKey();
  if (!apiKey) {
    return jsonResponse(res, 400, {
      error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다. .env 파일에 추가해 주세요.'
    });
  }

  let body;
  try { body = await parseJsonBody(req); }
  catch (e) { return jsonResponse(res, 400, { error: '잘못된 요청입니다.' }); }

  const { faceImage, bodyImage, localResults, gender } = body;
  if (!faceImage && !bodyImage) {
    return jsonResponse(res, 400, { error: '분석할 이미지가 없습니다.' });
  }

  try {
    const client = new Anthropic({ apiKey });

    const content = [];

    // 시스템 프롬프트에 로컬 분석 결과 포함
    const genderText = gender === 'male' ? '남성' : '여성';
    let contextText = `당신은 전문 퍼스널 이미지 컨설턴트입니다. 대상은 ${genderText}입니다. ${genderText}에게 적합한 분석과 스타일링 조언을 제공합니다.\n\n`;
    if (localResults) {
      contextText += '다음은 MediaPipe AI 모델의 수치 분석 결과입니다 (참고용):\n' + JSON.stringify(localResults, null, 2) + '\n\n';
    }

    contextText += `사진을 보고 ${genderText}의 외모를 심도 있게 분석해 주세요. 전문 이미지 컨설턴트처럼 구체적이고 개인화된 조언을 제공하세요.

반드시 순수 JSON만 응답하세요. 마크다운 코드 블록이나 "다음은 분석입니다:" 같은 부가 설명 텍스트를 절대 포함하지 마세요. 응답의 첫 글자는 반드시 '{'여야 하고 마지막 글자는 '}'여야 합니다.

응답 형식:

{
  "faceShape": {
    "type": "oval|round|square|heart|diamond|oblong 중 하나",
    "confidence": 0-100,
    "reasoning": "이 얼굴형으로 판단한 구체적 근거 3-4문장 (이마 너비, 광대 돌출도, 턱선 각도, 얼굴 길이 비율 등 구체적 수치적 관찰 포함)",
    "characteristics": ["이 사람만의 구체적 얼굴 특징 5가지"],
    "strengths": ["이 얼굴형의 매력 포인트 3가지"],
    "makeupTips": ["${genderText}에게 맞는 구체적인 팁 5가지 - 제품명이나 기법을 구체적으로"],
    "avoidPoints": ["피해야 할 스타일링 실수 3가지"]
  },
  "personalColor": {
    "season": "spring|summer|autumn|winter",
    "subtype": "light|warm|bright|cool|mute|deep",
    "key": "season_subtype 형식",
    "confidence": 0-100,
    "reasoning": "판단 근거 3-4문장 (피부 명도, 언더톤 색감, 입술 색, 눈동자 색, 머리카락 색 등 구체적 관찰)",
    "skinTone": "피부톤에 대한 상세 설명 2문장",
    "undertone": "warm|cool|neutral",
    "recommendations": ["${genderText}에게 맞는 컬러 활용 구체적 조언 5가지"],
    "specificProducts": ["추천 컬러 코디 예시 3가지 (구체적 색상 조합)"],
    "seasonalWardrobe": "계절별 옷장 구성 조언 2-3문장"
  },
  "bodyType": {
    "type": "straight|wave|natural 중 하나",
    "confidence": 0-100,
    "reasoning": "판단 근거 3-4문장 (어깨 너비, 허리 라인, 상하체 비율 등 구체적 관찰)",
    "characteristics": ["이 사람의 체형 특징 4가지"],
    "strengths": ["체형의 매력 포인트 3가지"],
    "stylingTips": ["${genderText}에게 맞는 구체적 코디 조언 5가지"],
    "avoidPoints": ["피해야 할 옷차림 3가지"]
  },
  "overallAdvice": "${genderText}의 얼굴형, 퍼스널 컬러, 체형을 종합한 맞춤 스타일링 전략 5-6문장. 세 가지 분석 결과를 교차하여 시너지를 내는 구체적 조언 포함.",
  "signatureStyle": "이 사람에게 가장 어울리는 시그니처 스타일 한 줄 정의",
  "shoppingList": ["지금 당장 구매하면 좋을 핵심 아이템 5가지"]
}

분석 불가한 항목은 null로 설정하세요. 한국어로 작성하세요. 일반적인 조언이 아닌, 이 사람의 사진에서 관찰한 구체적 특징에 기반한 개인화된 분석을 제공하세요.`;

    // 이미지 추가
    if (faceImage) {
      const base64 = faceImage.replace(/^data:image\/\w+;base64,/, '');
      const mimeMatch = faceImage.match(/^data:(image\/\w+);base64,/);
      const mediaType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: base64 }
      });
      content.push({ type: 'text', text: '위 사진은 얼굴 정면 사진입니다.' });
    }

    if (bodyImage) {
      const base64 = bodyImage.replace(/^data:image\/\w+;base64,/, '');
      const mimeMatch = bodyImage.match(/^data:(image\/\w+);base64,/);
      const mediaType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: base64 }
      });
      content.push({ type: 'text', text: '위 사진은 전신 사진입니다.' });
    }

    content.push({ type: 'text', text: '위 사진을 분석해 주세요.' });

    console.log('[AI] Claude API 호출 중...');
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8000,
      system: contextText,
      messages: [{ role: 'user', content }]
    });

    const responseText = response.content[0].text;
    console.log('[AI] Claude API 응답 수신 (길이: ' + responseText.length + ')');

    // JSON 추출 — 여러 방식 시도
    let aiResult = null;
    let parseError = null;

    // 1) 마크다운 코드 블록 안에 있는 JSON 시도
    const codeBlockMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
      try { aiResult = JSON.parse(codeBlockMatch[1]); }
      catch (e) { parseError = e; }
    }

    // 2) 가장 바깥 { ... } 매치 (greedy)
    if (!aiResult) {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { aiResult = JSON.parse(jsonMatch[0]); }
        catch (e) { parseError = e; }
      }
    }

    // 3) 여전히 실패하면 rawText로 반환
    if (aiResult) {
      return jsonResponse(res, 200, { success: true, analysis: aiResult });
    } else {
      console.error('[AI] JSON 파싱 실패:', parseError?.message);
      console.error('[AI] 응답 앞부분:', responseText.substring(0, 500));
      return jsonResponse(res, 200, {
        success: false,
        error: 'AI 응답 파싱 실패: ' + (parseError?.message || '유효한 JSON 없음'),
        rawText: responseText.substring(0, 2000)
      });
    }

  } catch (err) {
    console.error('[AI] Claude API 오류:', err.message);
    console.error('[AI] 상세:', err.status, err.type);
    return jsonResponse(res, 500, { error: 'AI 분석 중 오류: ' + err.message });
  }
}

// POST /api/send-email — 이메일 발송
async function handleSendEmail(req, res) {
  let body;
  try { body = await parseJsonBody(req); }
  catch (e) { return jsonResponse(res, 400, { error: '잘못된 요청입니다.' }); }

  const { to, subject, htmlContent, pdfBase64 } = body;
  if (!to || !pdfBase64) {
    return jsonResponse(res, 400, { error: '수신 이메일과 PDF 데이터가 필요합니다.' });
  }

  const smtp = getSmtpConfig();
  if (!smtp.user || !smtp.pass) {
    return jsonResponse(res, 400, {
      error: 'SMTP 설정이 없습니다. .env 파일에 SMTP_USER, SMTP_PASS를 설정해 주세요.'
    });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass }
    });

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

    await transporter.sendMail({
      from: smtp.from || smtp.user,
      to,
      subject: subject || `스타일 분석 리포트 — ${dateStr}`,
      html: htmlContent || `
        <div style="font-family: 'Apple SD Gothic Neo', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="font-size: 24px; font-weight: 300; color: #1a1a2e; margin-bottom: 8px;">스타일 분석 리포트</h1>
          <p style="color: #6b7280; font-size: 14px; margin-bottom: 24px;">AI 기반 퍼스널 이미지 컨설팅 보고서</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
          <p style="color: #374151; font-size: 14px; line-height: 1.6;">
            분석 리포트가 PDF 파일로 첨부되어 있습니다.<br>
            첨부된 파일을 다운로드하여 확인해 주세요.
          </p>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">
            본 리포트는 AI 비전 모델(MediaPipe + Claude)의 이미지 분석 결과를 바탕으로 생성되었습니다.
          </p>
        </div>
      `,
      attachments: [{
        filename: `style-report-${dateStr}.pdf`,
        content: pdfBase64,
        encoding: 'base64'
      }]
    });

    console.log(`[Email] 발송 완료: ${to}`);
    return jsonResponse(res, 200, { success: true, message: '이메일이 발송되었습니다.' });

  } catch (err) {
    console.error('[Email] 발송 오류:', err.message);
    return jsonResponse(res, 500, { error: '이메일 발송 실패: ' + err.message });
  }
}

// POST /api/check-config — API키/SMTP 설정 확인
function handleCheckConfig(req, res) {
  const hasApiKey = !!getAnthropicKey();
  const smtp = getSmtpConfig();
  const hasSmtp = !!(smtp.user && smtp.pass);
  return jsonResponse(res, 200, { hasApiKey, hasSmtp });
}

function handleRequest(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  // API 라우팅
  const urlPath = decodeURIComponent(req.url.split('?')[0]);

  if (req.method === 'POST' && urlPath === '/api/analyze-with-ai') {
    return handleAiAnalysis(req, res);
  }
  if (req.method === 'POST' && urlPath === '/api/send-email') {
    return handleSendEmail(req, res);
  }
  if (req.method === 'GET' && urlPath === '/api/check-config') {
    return handleCheckConfig(req, res);
  }

  // 정적 파일 서빙
  let url = req.url === '/' ? '/index.html' : req.url;
  url = decodeURIComponent(url.split('?')[0]);

  const fp = path.normalize(path.join(DIR, url));
  if (!fp.startsWith(DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // .certs 폴더 접근 차단
  if (fp.includes('.certs') || fp.includes('.env')) {
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
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(data);
    }
  });
}

// ============================================================
//  4. WebSocket Handler (공유)
// ============================================================

function setupWebSocket(server, useHttps) {
  const wss = new WebSocketServer({
    server,
    maxPayload: 5 * 1024 * 1024
  });

  wss.on('connection', (ws) => {
    ws._sessionCode = null;
    ws._role = null;

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch (_) {
        send(ws, { type: 'error', message: '잘못된 요청 형식입니다.' });
        return;
      }

      switch (msg.type) {
        case 'session:create': {
          const code = generateSessionCode();
          sessions.set(code, {
            laptopWs: ws,
            phoneWs: null,
            createdAt: Date.now()
          });
          ws._sessionCode = code;
          ws._role = 'laptop';

          const ips = getLocalIPs();
          const host = ips.length > 0 ? ips[0].address : 'localhost';
          const protocol = useHttps ? 'https' : 'http';
          const port = useHttps ? HTTPS_PORT : HTTP_PORT;

          send(ws, {
            type: 'session:created',
            code,
            phoneUrl: `${protocol}://${host}:${port}/phone.html?session=${code}`
          });
          console.log(`[Session] 생성됨: ${code}`);
          break;
        }

        case 'session:join': {
          const session = sessions.get(msg.code);
          if (!session) {
            send(ws, { type: 'error', message: '세션을 찾을 수 없습니다.' });
            break;
          }
          session.phoneWs = ws;
          ws._sessionCode = msg.code;
          ws._role = 'phone';

          send(ws, { type: 'session:joined', code: msg.code });
          send(session.laptopWs, { type: 'phone:connected' });
          console.log(`[Session] 폰 연결됨: ${msg.code}`);
          break;
        }

        case 'photo:face':
        case 'photo:body': {
          const session = sessions.get(ws._sessionCode);
          if (session && session.laptopWs) {
            const relay = {
              type: msg.type,
              image: msg.image,
              width: msg.width,
              height: msg.height
            };
            if (msg.only) relay.only = true;
            if (msg.gender) relay.gender = msg.gender;
            send(session.laptopWs, relay);
            send(ws, { type: 'photo:sent', photoType: msg.type === 'photo:face' ? 'face' : 'body' });
            console.log(`[Photo] ${msg.type} 전송됨 (세션: ${ws._sessionCode})${msg.only ? ' [단일]' : ''}`);
          }
          break;
        }

        case 'analysis:complete': {
          const session = sessions.get(ws._sessionCode);
          if (session && session.phoneWs) {
            send(session.phoneWs, { type: 'analysis:complete', summary: msg.summary });
          }
          break;
        }

        default:
          send(ws, { type: 'error', message: `알 수 없는 메시지 타입: ${msg.type}` });
      }
    });

    ws.on('close', () => {
      if (ws._sessionCode) {
        const session = sessions.get(ws._sessionCode);
        if (session) {
          if (ws._role === 'laptop') {
            if (session.phoneWs) {
              send(session.phoneWs, { type: 'session:ended' });
            }
            sessions.delete(ws._sessionCode);
            console.log(`[Session] 삭제됨: ${ws._sessionCode}`);
          } else if (ws._role === 'phone') {
            session.phoneWs = null;
            send(session.laptopWs, { type: 'phone:disconnected' });
            console.log(`[Session] 폰 연결 해제: ${ws._sessionCode}`);
          }
        }
      }
    });
  });

  return wss;
}

function send(ws, obj) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(obj));
  }
}

// ============================================================
//  5. Network Info
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

// ============================================================
//  6. Start Servers
// ============================================================

console.log('');
console.log('='.repeat(60));
console.log('  ✨ 퍼스널 컬러 분석 서비스');
console.log('='.repeat(60));

// HTTP Server (항상 실행)
const httpServer = http.createServer(handleRequest);
setupWebSocket(httpServer, false);

// HTTPS Server (인증서 생성 시도)
let httpsServer = null;
let httpsReady = false;
const certs = generateSelfSignedCert();

if (certs) {
  try {
    httpsServer = https.createServer(certs, handleRequest);
    setupWebSocket(httpsServer, true);
    httpsReady = true;
  } catch (err) {
    console.log(`  ⚠️  HTTPS 서버 생성 실패: ${err.message}`);
  }
}

// HTTP 시작
httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
  const ips = getLocalIPs();

  console.log('');
  if (httpsReady) {
    // HTTPS도 시작
    httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
      console.log('  📱 폰에서 접속 (HTTPS — 카메라 사용 가능):');
      if (ips.length === 0) {
        console.log(`    https://localhost:${HTTPS_PORT}`);
      } else {
        for (const ip of ips) {
          console.log(`    https://${ip.address}:${HTTPS_PORT}  (${ip.name})`);
        }
      }
      console.log('');
      console.log('  💻 노트북에서 접속:');
      if (ips.length === 0) {
        console.log(`    http://localhost:${HTTP_PORT}`);
      } else {
        for (const ip of ips) {
          console.log(`    http://${ip.address}:${HTTP_PORT}  (${ip.name})`);
        }
      }
      console.log('');
      console.log('  ─────────────────────────────────────────────────');
      console.log('  📌 폰에서 처음 접속 시 "안전하지 않음" 경고가 나타납니다.');
      console.log('     → iPhone Safari: "이 웹 사이트 방문" 탭');
      console.log('     → Android Chrome: "고급" → "안전하지 않은 사이트로 이동"');
      console.log('  ─────────────────────────────────────────────────');
      console.log('');
      console.log('='.repeat(60));
      console.log('');
    });
  } else {
    console.log('  💻 접속 주소:');
    if (ips.length === 0) {
      console.log(`    http://localhost:${HTTP_PORT}`);
    } else {
      for (const ip of ips) {
        console.log(`    http://${ip.address}:${HTTP_PORT}  (${ip.name})`);
      }
    }
    console.log('');
    console.log('  ⚠️  HTTPS를 사용할 수 없어 폰 카메라가 동작하지 않을 수 있습니다.');
    console.log('     openssl을 설치하고 서버를 재시작하거나,');
    console.log('     폰 Chrome에서 아래 설정을 변경하세요:');
    console.log('     chrome://flags/#unsafely-treat-insecure-origin-as-secure');
    console.log('');
    console.log('='.repeat(60));
    console.log('');
  }
});
