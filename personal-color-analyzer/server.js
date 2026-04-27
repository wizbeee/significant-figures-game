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

// ── 배포 모드 감지 ──
// PORT 환경변수가 있으면 클라우드(Render/Railway/Fly.io 등) 모드
// 이 경우 플랫폼이 HTTPS를 담당하므로 내부적으로는 HTTP만 실행
const IS_CLOUD = !!process.env.PORT;
const HTTP_PORT = parseInt(process.env.PORT || '5000');
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
    let contextText = `당신은 전문 퍼스널 이미지 컨설턴트이자 얼굴형·컬러·체형 분야의 임상 진단 전문가입니다. 대상은 ${genderText}입니다.

보고서는 "AI 진단 소견" 형식으로 작성됩니다. 의사의 진단서처럼 정량 데이터를 근거로 제시하며 전문적이면서도 이해하기 쉽게 서술하세요.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【 참고 지식 베이스 — 진단 기준 임상 테이블 】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ 얼굴형 정량 기준 (이상 범위 / 유형 판정 시그니처)
  - 얼굴 종횡비 (length/width) 이상: 1.5~1.6 (황금비율 1.618에 근접할수록 타원)
  - 황금비율 적합도: 80~100점 이상(타원), 60~79점(양호), 60점 미만(개성 비율)
  - 좌우 대칭 지수: 95%+(매우 우수), 85~94%(자연스러움), 85% 미만(개성적 비대칭)
  - 얼굴 너비비:
      · 둥근형: widthToLength > 0.85 & 턱선 곡률 > 0.1 & 턱각도 > 105°
      · 사각형: jawToCheekbone > 0.90 & 턱각도 < 95° & 턱선 직선도 > 0.7
      · 하트형: foreheadToCheekbone > 0.95 & jawToCheekbone < 0.75 & chinTaper < 0.65
      · 다이아몬드형: cheekProminence > 1.10 & 이마·턱 모두 좁음
      · 역삼각형: foreheadToCheekbone ≈ 1.0 & chinTaper < 0.60 (뾰족)
      · 사다리꼴: taperRatio > 1.05 (아래가 위보다 넓음) & 턱 직선
      · 배형: taperRatio > 1.05 & 턱 둥글고 볼 풍성
      · 긴얼굴: widthToLength < 0.70 & 하안면 비율 > 0.36
  - 눈 간격 비율(이상 1.00): >1.1 넓은 편, <0.9 좁은 편
  - 캔탈 틸트: >3° 상향, -3~3° 수평, <-3° 하향
  - 입술 상/하 비율(황금 0.618): >0.7 상순우세, <0.4 하순우세
  - 얼굴 5등분: 각 영역이 20% 근접 → 균형, 편차 >5% → 불균형

■ 퍼스널 컬러 12유형 시그니처 지표
  - 웜톤 지수(warmScore) 60+ : 웜 계열 (봄/가을)
  - 웜톤 지수 40- : 쿨 계열 (여름/겨울)
  - 채도(chroma) 40+ & warmScore 60+ : Bright Spring / True Spring
  - 채도 40+ & warmScore 40- : Bright Winter / True Winter
  - 채도 25-40 & warmScore 60+ : Light/Warm/Soft Spring
  - 채도 25-40 & warmScore 40- : Light/Cool Summer
  - 채도 <25 & warmScore 40-60 : Soft Summer / Soft Autumn (뮤트 계열)
  - 채도 40+ & warmScore 60+ (L*명도 낮음): Deep Autumn / True Autumn
  - 12유형: spring_light/warm/bright, summer_light/cool/mute,
            autumn_mute/warm/deep, winter_bright/cool/deep
  - Caygill Theory: 4 Seasons × 3 하위유형 (light/true/deep or light/mute/bright)
  - 피부 L* 값: >65 밝음, 45-65 중간, <45 어두움 → Light/Deep 판정 기준

■ 체형 3유형 시그니처 (Kibbe + 일본 골격진단 결합)
  - Straight: 쇄골 뚜렷 + 일직선 어깨 + 볼륨 있는 상체 + 허리 곡선 완만
    · 판정: body.scores.straight 6+ & (scores.wave < 5) → 직선적 상체 우세
  - Wave: 처진 어깨 + 얇은 쇄골 + 부드러운 곡선 + 허리 곡선 뚜렷
    · 판정: scores.wave 6+ & 하체 볼륨 > 상체 → 곡선적 체형
  - Natural: 골격 두드러짐 + 관절 크고 쇄골 각짐 + 운동 선수형
    · 판정: scores.natural 6+ & 골격감 강조

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【 사용 가능한 정량 측정 데이터 】 — 진단 소견 작성 시 반드시 인용
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    if (localResults) {
      contextText += JSON.stringify(localResults, null, 2) + '\n\n';
      contextText += `위 데이터는 MediaPipe 478 랜드마크 + LAB 색공간 + Pose 33 랜드마크로 측정한 실제 정량 결과입니다.
- localResults.face.detailedRatios: 황금비율 적합도, 좌우 대칭 6항목, 눈/눈썹/코/입 비율, 얼굴 5등분, 세로 배치 등 30+ 정밀 수치
- localResults.color: warmScore(웜톤 지수 0-100), chroma(채도), confidence(신뢰도)
- localResults.body.scores: 각 체형(straight/wave/natural)별 점수

이 수치를 위의 참고 지식 베이스(임상 테이블)에 대조하여 판정하고, 진단 소견 문장에 구체적으로 인용하세요.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;
    }

    contextText += `사진과 위 정량 데이터를 참고 지식 베이스와 대조하여 ${genderText}에 대한 심도 있는 진단 소견을 작성하세요.

【 작성 원칙 】
1. 모든 섹션은 "AI 진단 소견" 톤으로 작성 — 의사 진단서처럼 측정값을 근거로 판단 서술
2. 각 진단 소견은 최소 5~8문장, 반드시 localResults의 구체 수치를 2개 이상 인용
3. 수치를 단순 나열하지 말고 "이것이 참고 지식 베이스의 어느 범위에 해당하는지" 명시
4. 일반적 조언이 아닌 이 사람 고유의 데이터에 기반한 개인화된 진단
5. 전문 용어 사용하되 괄호로 쉽게 풀이 제공
6. 각 섹션에 반드시 "감별 진단(differentialDiagnosis)" 포함 — 왜 다른 유형이 아닌지 배제 근거

【 사고 과정 가이드 】
추론 단계에서 다음 순서를 따르세요:
(1) 관찰(Observation): 사진에서 본 raw feature와 localResults 수치 나열
(2) 판정(Classification): 참고 지식 베이스의 어느 기준에 해당하는지 매핑
(3) 감별(Differential): 유사 유형과의 차이 — 왜 이 유형인가
(4) 확신도 보정(Calibration): 확실한 부분과 불확실한 부분 명시
(5) 서술(Diagnosis): 위 내용을 통합한 진단 소견 작성

반드시 순수 JSON만 응답하세요. 마크다운 코드 블록이나 부가 설명 절대 없이, 첫 글자 '{', 마지막 글자 '}'.

【 응답 형식 】

{
  "faceShape": {
    "type": "oval|round|square|heart|diamond|oblong|inverted_triangle|rectangle|trapezoid|pear 중 하나",
    "confidence": 0-100,
    "diagnosis": "5-8문장 진단 소견. 반드시 localResults.face.detailedRatios의 수치를 최소 2개 이상 구체 인용하며 참고 지식 베이스의 판정 기준(예: widthToLength > 0.85 → 둥근형)에 대조해 서술. 예: '피검자는 황금비율 적합도 72점으로 참고 기준(80점 이상 타원형)에 근접하나 다소 낮습니다. 좌우 대칭 지수 94%로 매우 우수한 대칭성(85% 이상 자연스러움)을 보이며, 얼굴 종횡비 1.42(이상 1.5~1.6)로 세로가 다소 긴 편입니다. widthToLength 0.71, jawToCheekbone 0.80으로 참고 테이블의 타원형 프로파일에 부합합니다.'",
    "observationChecklist": ["raw 관찰 5가지 — 사진에서 본 것 + 수치의 기준 대조 (예: '얼굴 종횡비 1.42 → 타원 이상 범위 1.5~1.6 대비 약간 짧음')"],
    "differentialDiagnosis": {
      "primaryChoice": "판정한 유형",
      "rulingOut": [
        {"type": "배제된 후보 유형", "whyNot": "이 유형이 아닌 이유 — 참고 기준 수치 근거 명시. 예: '둥근형은 widthToLength > 0.85 필요하나 현재 0.71로 기준 미달'"}
      ]
    },
    "confidenceCalibration": {
      "certain": ["가장 확실한 판단 2-3가지 (수치 근거 포함)"],
      "uncertain": ["불확실한 영역 1-2가지 + 그 이유 (경계선 수치, 사진 조도 등)"]
    },
    "keyMetrics": [
      {"label": "측정 항목명", "value": "72점", "interpretation": "참고 기준 대비 해석"}
    ],
    "dataInsights": "정량 데이터 특이점 2-3문장",
    "strengths": ["매력 포인트 3가지"],
    "avoidPoints": ["피해야 할 스타일링 3가지"],
    "makeupTips": ["${genderText} 맞춤 팁 5가지"]
  },
  "personalColor": {
    "season": "spring|summer|autumn|winter",
    "subtype": "light|warm|bright|cool|mute|deep",
    "key": "season_subtype",
    "confidence": 0-100,
    "diagnosis": "5-8문장. warmScore, chroma, 피부 LAB을 참고 지식 베이스의 12유형 시그니처에 대조해 서술. 예: '웜톤 지수 72점으로 참고 기준(60+ 웜 계열)에 명확히 부합하며, 채도 35로 중간 범위(25-40)에 해당합니다. 이는 Warm Spring 시그니처(채도 40+)보다는 True Spring 또는 Light Spring 쪽에 가깝습니다. Caygill Theory의 Warm Light Spring 카테고리에 해당하여...'",
    "observationChecklist": ["피부/머리카락/입술/눈동자 색감 관찰 + 참고 범위 대조"],
    "differentialDiagnosis": {
      "primaryChoice": "판정한 유형",
      "rulingOut": [
        {"type": "배제된 시즌/서브타입", "whyNot": "수치 기반 배제 근거. 예: 'Bright Winter는 warmScore < 40 필요하나 현재 72로 웜 영역'"}
      ]
    },
    "confidenceCalibration": {
      "certain": ["확실한 판단 (수치 근거)"],
      "uncertain": ["불확실한 영역 + 이유"]
    },
    "keyMetrics": [{"label": "웜톤 지수", "value": "72/100", "interpretation": "명확한 웜 계열"}],
    "dataInsights": "수치 특이점 2-3문장",
    "skinTone": "피부톤 상세 관찰 2문장",
    "undertone": "warm|cool|neutral",
    "recommendations": ["컬러 활용 조언 5가지"],
    "specificProducts": ["추천 컬러 코디 3가지"],
    "seasonalWardrobe": "계절별 옷장 구성 2-3문장"
  },
  "bodyType": {
    "type": "straight|wave|natural",
    "confidence": 0-100,
    "diagnosis": "5-8문장. body.scores를 참고 지식 베이스의 Kibbe/골격진단 시그니처에 대조. 예: 'Pose 분석 결과 straight 7.2, wave 4.1, natural 5.8로 straight 우세(6+ 기준 충족)이며 wave 점수가 낮아(5 미만) 곡선적 체형은 배제됩니다. 어깨 수평감과 허리 곡선 완만함이 관찰되어 Kibbe의 Dramatic/Classic 계열에 해당...'",
    "observationChecklist": ["어깨 라인/허리 곡선/쇄골/상하체 비율 관찰"],
    "differentialDiagnosis": {
      "primaryChoice": "판정한 체형",
      "rulingOut": [
        {"type": "배제된 체형", "whyNot": "점수 기반 배제 근거"}
      ]
    },
    "confidenceCalibration": {
      "certain": ["확실한 판단"],
      "uncertain": ["불확실한 영역"]
    },
    "keyMetrics": [{"label": "Straight 점수", "value": "7.2/10", "interpretation": "직선 우세"}],
    "dataInsights": "수치 특이점 2-3문장",
    "characteristics": ["체형 특징 4가지"],
    "strengths": ["매력 포인트 3가지"],
    "stylingTips": ["${genderText} 코디 조언 5가지"],
    "avoidPoints": ["피해야 할 옷차림 3가지"]
  },
  "synthesisDiagnosis": "8-10문장 종합 진단 소견. 세 영역 각 수치를 최소 1개씩 인용하며 시너지 관점에서 통합. 예: '얼굴형의 황금비 적합도 72점 + 퍼스널 컬러 웜톤 72점 + 체형 Straight 7.2의 조합은 따뜻하고 차분한 클래식 이미지 프로파일을 형성합니다...'",
  "signatureStyle": "시그니처 스타일 한 줄 정의 (감각적 카피)",
  "overallAdvice": "스타일링 전략 5-6문장",
  "shoppingList": ["핵심 아이템 5가지"]
}

분석 불가한 항목은 null. 한국어 작성. 반드시 수치 기반 진단 소견 스타일 + 감별 진단 필수.`;

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

    console.log('[AI] Claude API 호출 중... (Extended Thinking 활성)');
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 16000,
      thinking: {
        type: 'enabled',
        budget_tokens: 6000  // 단계별 추론을 위한 thinking 예산
      },
      system: contextText,
      messages: [{ role: 'user', content }]
    });

    // Extended thinking 사용 시 content 배열에 thinking + text 블록이 섞여 있음
    // 최종 사용자 응답(text) 블록만 추출
    let responseText = '';
    let thinkingSummary = '';
    for (const block of response.content) {
      if (block.type === 'text') responseText += block.text;
      else if (block.type === 'thinking') thinkingSummary = (block.thinking || '').substring(0, 200);
    }
    console.log('[AI] Claude API 응답 수신 (thinking 사용, text 길이: ' + responseText.length + ')');
    if (thinkingSummary) console.log('[AI] Thinking 미리보기:', thinkingSummary + '...');

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
  // 클라우드 모드면 .env 쓰기 불가하므로 setup wizard 표시 X
  return jsonResponse(res, 200, { hasApiKey, hasSmtp, canSaveKey: !IS_CLOUD });
}

// POST /api/save-key — Claude API 키를 .env에 저장 (로컬 모드 전용)
async function handleSaveKey(req, res) {
  // 클라우드 모드에서는 환경변수로만 설정 가능 (보안 + 파일시스템 제약)
  if (IS_CLOUD) {
    return jsonResponse(res, 403, {
      error: '클라우드 모드에서는 플랫폼 환경변수로 ANTHROPIC_API_KEY를 설정해 주세요.'
    });
  }

  let body;
  try { body = await parseJsonBody(req); }
  catch (e) { return jsonResponse(res, 400, { error: '잘못된 요청입니다.' }); }

  const key = (body.key || '').trim();
  if (!key.startsWith('sk-ant-')) {
    return jsonResponse(res, 400, {
      error: 'API 키 형식이 올바르지 않습니다. sk-ant- 로 시작해야 합니다.'
    });
  }
  if (key.length < 30 || key.length > 500) {
    return jsonResponse(res, 400, { error: 'API 키 길이가 비정상입니다.' });
  }

  try {
    const envPath = path.join(DIR, '.env');
    let lines = [];
    if (fs.existsSync(envPath)) {
      lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    }
    // 기존 ANTHROPIC_API_KEY 라인 제거 후 새 키 추가
    lines = lines.filter(l => !l.match(/^ANTHROPIC_API_KEY\s*=/));
    lines.push(`ANTHROPIC_API_KEY=${key}`);
    const content = lines.filter(l => l.trim().length > 0).join('\n') + '\n';
    fs.writeFileSync(envPath, content, { mode: 0o600 });

    console.log('[Config] Anthropic API 키가 .env에 저장되었습니다');
    return jsonResponse(res, 200, { success: true });
  } catch (err) {
    console.error('[Config] .env 저장 실패:', err.message);
    return jsonResponse(res, 500, { error: '.env 파일 저장 실패: ' + err.message });
  }
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
  if (req.method === 'POST' && urlPath === '/api/save-key') {
    return handleSaveKey(req, res);
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

        case 'session:reset': {
          // 노트북이 다음 사람 분석 준비 요청 → 폰에게 촬영 화면으로 돌아가도록 알림
          const session = sessions.get(ws._sessionCode);
          if (session && session.phoneWs) {
            send(session.phoneWs, { type: 'session:reset' });
            console.log(`[Session] 리셋 (세션: ${ws._sessionCode}) — 폰 촬영 화면으로 복귀`);
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

// ── 클라우드 모드 (Render/Railway 등) ──
// 플랫폼이 HTTPS를 담당하므로 HTTPS 서버 생성 스킵
if (IS_CLOUD) {
  httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log('');
    console.log(`  ☁️  클라우드 모드로 실행 중 (PORT=${HTTP_PORT})`);
    console.log('  🌐 플랫폼이 자동으로 HTTPS를 제공합니다');
    console.log('  📱 같은 URL로 폰/노트북 모두 접속 가능');
    console.log('');
    console.log('='.repeat(60));
    console.log('');
  });
} else {
  // ── 로컬 모드 — 자체 서명 HTTPS + HTTP 둘 다 ──
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
}
