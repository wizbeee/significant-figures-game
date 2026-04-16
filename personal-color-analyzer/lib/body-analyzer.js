// ============================================================
//  체형 분석기 — MediaPipe PoseLandmarker 기반 (정밀 버전)
//  33개 포즈 랜드마크에서 다각적 비율·각도를 측정하여 3가지 유형 분류
// ============================================================

let poseLandmarker = null;

export async function initPoseLandmarker(vision) {
  const { PoseLandmarker } = await import(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs'
  );

  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
      delegate: 'GPU'
    },
    runningMode: 'IMAGE',
    numPoses: 1
  });

  return poseLandmarker;
}

// ── 유틸리티 ──────────────────────────────────

function dist(landmarks, i, j) {
  const a = landmarks[i], b = landmarks[j];
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function midPt(landmarks, i, j) {
  return {
    x: (landmarks[i].x + landmarks[j].x) / 2,
    y: (landmarks[i].y + landmarks[j].y) / 2
  };
}

function distPt(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function angleDeg(a, b, c) {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const cross = v1.x * v2.y - v1.y * v2.x;
  return Math.abs(Math.atan2(cross, dot)) * (180 / Math.PI);
}

function isVisible(landmark, threshold = 0.4) {
  return landmark && (landmark.visibility === undefined || landmark.visibility > threshold);
}

function sigmoid(value, center, steepness) {
  return 1 / (1 + Math.exp(-steepness * (value - center)));
}

// ── 체형 분류 (정밀 버전) ────────────────────

export function classifyBodyType(landmarks) {
  // 랜드마크 인덱스:
  // 0: 코, 11/12: 어깨, 13/14: 팔꿈치, 15/16: 손목
  // 23/24: 엉덩이, 25/26: 무릎, 27/28: 발목

  // ━━━ 1. 핵심 치수 측정 ━━━

  const shoulderWidth = dist(landmarks, 11, 12);
  const hipWidth = dist(landmarks, 23, 24);

  // 허리 추정 — 어깨-엉덩이 사이 25% 지점 (실제 허리 위치에 더 가까움)
  const waistRatio = 0.45; // 어깨에서 45% 지점
  const waistLeft = {
    x: landmarks[11].x * (1 - waistRatio) + landmarks[23].x * waistRatio,
    y: landmarks[11].y * (1 - waistRatio) + landmarks[23].y * waistRatio
  };
  const waistRight = {
    x: landmarks[12].x * (1 - waistRatio) + landmarks[24].x * waistRatio,
    y: landmarks[12].y * (1 - waistRatio) + landmarks[24].y * waistRatio
  };
  const waistWidth = distPt(waistLeft, waistRight);

  // 상체/하체 길이
  const torsoLeft  = dist(landmarks, 11, 23);
  const torsoRight = dist(landmarks, 12, 24);
  const torsoLength = (torsoLeft + torsoRight) / 2;

  // 다리 길이 (가능한 경우)
  let legLength = null;
  if (isVisible(landmarks[25]) && isVisible(landmarks[27])) {
    const leftLeg  = dist(landmarks, 23, 25) + dist(landmarks, 25, 27);
    const rightLeg = dist(landmarks, 24, 26) + dist(landmarks, 26, 28);
    legLength = (leftLeg + rightLeg) / 2;
  } else if (isVisible(landmarks[25])) {
    legLength = dist(landmarks, 23, 25) + dist(landmarks, 25, 27);
  }

  // 팔 길이
  let armLength = null;
  if (isVisible(landmarks[13]) && isVisible(landmarks[15])) {
    const leftArm  = dist(landmarks, 11, 13) + dist(landmarks, 13, 15);
    const rightArm = dist(landmarks, 12, 14) + dist(landmarks, 14, 16);
    armLength = (leftArm + rightArm) / 2;
  }

  // ━━━ 2. 비율 계산 (12+ 지표) ━━━

  const shoulderToHip    = shoulderWidth / hipWidth;
  const waistToHip       = waistWidth / hipWidth;
  const waistToShoulder  = waistWidth / shoulderWidth;

  // 허리 들어간 정도 (0 = 직선, 1 = 극단적 곡선)
  const waistIndentation = 1 - (waistWidth / ((shoulderWidth + hipWidth) / 2));

  // 어깨 기울기 (수평에서의 각도)
  const shoulderSlope = Math.abs(
    Math.atan2(landmarks[12].y - landmarks[11].y, landmarks[12].x - landmarks[11].x)
  ) * (180 / Math.PI);

  // 어깨 각도 — 목(0번)에서 양 어깨로 벌어지는 각도
  const neckToShoulderAngle = angleDeg(landmarks[11], landmarks[0], landmarks[12]);

  // 상체 대 어깨 비율 (상체가 긴지)
  const torsoToShoulder = torsoLength / shoulderWidth;

  // 상체 대 하체 비율 (가능한 경우)
  const torsoToLeg = legLength ? torsoLength / legLength : null;

  // 프레임 지수 — 어깨+엉덩이 합산 대비 허리 (직선형 vs 곡선형)
  const frameIndex = (shoulderWidth + hipWidth) / (2 * waistWidth);

  // 어깨 라인 직선성 — 어깨 끝에서 팔꿈치까지의 각도
  let shoulderLineAngle = null;
  if (isVisible(landmarks[13]) && isVisible(landmarks[14])) {
    // 어깨가 둥근지(웨이브) vs 직선적인지(스트레이트) vs 각진지(내추럴)
    const leftAngle = angleDeg(landmarks[0], landmarks[11], landmarks[13]);
    const rightAngle = angleDeg(landmarks[0], landmarks[12], landmarks[14]);
    shoulderLineAngle = (leftAngle + rightAngle) / 2;
  }

  // 손목 굵기 추정 (팔꿈치-손목 거리 대비 어깨 너비)
  let wristRatio = null;
  if (isVisible(landmarks[15]) && isVisible(landmarks[16])) {
    const leftForearm = dist(landmarks, 13, 15);
    const rightForearm = dist(landmarks, 14, 16);
    wristRatio = ((leftForearm + rightForearm) / 2) / shoulderWidth;
  }

  // ━━━ 3. 연속적 점수 시스템 ━━━

  const scores = { straight: 0, wave: 0, natural: 0 };

  // ── 스트레이트: 상체 볼륨, 직선 실루엣, 허리 변화 적음 ──

  // 어깨가 엉덩이보다 넓음
  scores.straight += sigmoid(shoulderToHip, 1.06, 12) * 3.0;

  // 허리-엉덩이 차이 적음 (직선적 몸통)
  scores.straight += sigmoid(waistToHip, 0.85, 10) * 2.5;

  // 허리 들어감이 적음
  scores.straight += sigmoid(waistIndentation, 0.08, -15) * 2.0;

  // 어깨가 수평에 가까움 (반듯한 어깨)
  scores.straight += sigmoid(shoulderSlope, 3, -1.5) * 1.5;

  // 프레임 지수 낮음 (허리가 어깨/엉덩이와 비슷)
  scores.straight += sigmoid(frameIndex, 1.08, -10) * 1.5;

  // 상체가 비교적 짧음
  scores.straight += sigmoid(torsoToShoulder, 1.4, -6) * 1.0;

  // ── 웨이브: 허리 잘록, 하체 볼륨, 어깨 좁거나 둥근 ──

  // 허리가 잘록함
  scores.wave += sigmoid(waistIndentation, 0.12, 15) * 3.5;

  // 허리/엉덩이 비율 낮음
  scores.wave += sigmoid(waistToHip, 0.80, -12) * 2.5;

  // 어깨가 엉덩이 이하
  scores.wave += sigmoid(shoulderToHip, 1.02, -10) * 2.0;

  // 허리/어깨 비율 낮음 (허리가 어깨보다 많이 좁음)
  scores.wave += sigmoid(waistToShoulder, 0.76, -10) * 2.0;

  // 프레임 지수 높음 (허리 대비 어깨+엉덩이 큼)
  scores.wave += sigmoid(frameIndex, 1.12, 10) * 1.5;

  // 상체가 긴 편 (보너스)
  if (torsoToLeg !== null) {
    scores.wave += sigmoid(torsoToLeg, 0.55, -8) * 1.0;
  }

  // ── 내추럴: 뼈대 큼, 프레임 넓음, 중간 허리 ──

  // 어깨가 넓지만 허리도 적당히 있음 (뼈대감)
  scores.natural += sigmoid(shoulderToHip, 1.04, 8) * 2.0;
  scores.natural += sigmoid(waistToHip, 0.83, 8) * 1.5;
  scores.natural += sigmoid(waistToHip, 0.92, -8) * 1.5; // 너무 넓지도 않음

  // 상체가 긴 편
  scores.natural += sigmoid(torsoToShoulder, 1.45, 8) * 2.5;

  // 어깨 기울기 (뼈대가 발달하면 어깨가 약간 기울어짐)
  scores.natural += sigmoid(shoulderSlope, 4, 1.0) * 1.5;

  // 허리 들어감이 중간 (너무 잘록하지도, 너무 직선도 아님)
  const midWaist = 1 - Math.abs(waistIndentation - 0.10) * 10;
  scores.natural += Math.max(0, midWaist) * 2.0;

  // 뼈대감: 손목-어깨 비율로 추정 (가능한 경우)
  if (wristRatio !== null) {
    scores.natural += sigmoid(wristRatio, 0.45, 8) * 1.5;
  }

  // 팔이 긴 편 (가능한 경우)
  if (armLength !== null) {
    const armToTorso = armLength / torsoLength;
    scores.natural += sigmoid(armToTorso, 1.1, 6) * 1.0;
  }

  // ━━━ 4. 결과 결정 ━━━

  let bodyType = 'straight';
  let maxScore = -1;
  for (const [type, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      bodyType = type;
    }
  }

  // 신뢰도 — 1위와 2위 격차 기반
  const sortedScores = Object.values(scores).sort((a, b) => b - a);
  const totalScore = sortedScores.reduce((a, b) => a + b, 0);
  const gap = sortedScores[0] - sortedScores[1];

  let confidence;
  if (totalScore > 0) {
    const dominance = sortedScores[0] / totalScore;
    const gapRatio = gap / Math.max(sortedScores[0], 1);
    confidence = Math.round((dominance * 0.6 + gapRatio * 0.4) * 100);
  } else {
    confidence = 20;
  }
  confidence = Math.max(20, Math.min(90, confidence));

  return {
    bodyType,
    confidence,
    measurements: {
      shoulderWidth:    round4(shoulderWidth),
      hipWidth:         round4(hipWidth),
      waistWidth:       round4(waistWidth),
      shoulderToHip:    round2(shoulderToHip),
      waistToHip:       round2(waistToHip),
      waistToShoulder:  round2(waistToShoulder),
      waistIndentation: round2(waistIndentation),
      torsoLength:      round4(torsoLength),
      torsoToShoulder:  round2(torsoToShoulder),
      torsoToLeg:       torsoToLeg ? round2(torsoToLeg) : null,
      shoulderSlope:    round2(shoulderSlope),
      frameIndex:       round2(frameIndex),
      shoulderLineAngle: shoulderLineAngle ? round2(shoulderLineAngle) : null,
      wristRatio:       wristRatio ? round2(wristRatio) : null,
      legLength:        legLength ? round4(legLength) : null,
      armLength:        armLength ? round4(armLength) : null
    },
    scores: Object.fromEntries(
      Object.entries(scores).map(([k, v]) => [k, round2(v)])
    )
  };
}

function round2(v) { return Math.round(v * 100) / 100; }
function round4(v) { return Math.round(v * 10000) / 10000; }

// ── 이미지에서 체형 분석 실행 ──

export async function analyzeBody(imageElement) {
  if (!poseLandmarker) throw new Error('PoseLandmarker가 초기화되지 않았습니다.');

  const result = poseLandmarker.detect(imageElement);

  if (!result.landmarks || result.landmarks.length === 0) {
    return { error: '신체를 감지할 수 없습니다. 전신이 보이는 사진을 사용해 주세요.' };
  }

  const landmarks = result.landmarks[0];

  // 필수 랜드마크 확인
  const requiredPoints = [11, 12, 23, 24];
  for (const idx of requiredPoints) {
    if (!isVisible(landmarks[idx], 0.3)) {
      return { error: '어깨와 엉덩이가 모두 보이는 전신 사진을 사용해 주세요.' };
    }
  }

  const classification = classifyBodyType(landmarks);

  return {
    ...classification,
    landmarks
  };
}

// ── 포즈 랜드마크 오버레이 그리기 ──

export function drawPoseLandmarks(canvas, landmarks, imageWidth, imageHeight) {
  const ctx = canvas.getContext('2d');
  canvas.width = imageWidth;
  canvas.height = imageHeight;

  // 연결선 정의
  const connections = [
    [11, 12], // 어깨
    [11, 13], [13, 15], // 왼팔
    [12, 14], [14, 16], // 오른팔
    [11, 23], [12, 24], // 몸통
    [23, 24], // 엉덩이
    [23, 25], [25, 27], // 왼다리
    [24, 26], [26, 28]  // 오른다리
  ];

  // 연결선 그리기
  ctx.strokeStyle = 'rgba(167, 139, 250, 0.7)';
  ctx.lineWidth = 3;
  ctx.shadowColor = 'rgba(167, 139, 250, 0.5)';
  ctx.shadowBlur = 10;

  for (const [i, j] of connections) {
    if (landmarks[i] && landmarks[j]) {
      ctx.beginPath();
      ctx.moveTo(landmarks[i].x * imageWidth, landmarks[i].y * imageHeight);
      ctx.lineTo(landmarks[j].x * imageWidth, landmarks[j].y * imageHeight);
      ctx.stroke();
    }
  }

  // 포인트 그리기
  ctx.shadowBlur = 0;
  const keyPoints = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
  for (const idx of keyPoints) {
    if (landmarks[idx]) {
      const x = landmarks[idx].x * imageWidth;
      const y = landmarks[idx].y * imageHeight;

      ctx.fillStyle = 'rgba(167, 139, 250, 0.3)';
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#A78BFA';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 측정선 표시
  const measureLines = [
    { from: 11, to: 12, color: '#4ECDC4', label: '어깨' },
    { from: 23, to: 24, color: '#FFE66D', label: '엉덩이' }
  ];

  // 허리 추정선 추가
  const waistRatio = 0.45;
  const wl = {
    x: landmarks[11].x * (1 - waistRatio) + landmarks[23].x * waistRatio,
    y: landmarks[11].y * (1 - waistRatio) + landmarks[23].y * waistRatio
  };
  const wr = {
    x: landmarks[12].x * (1 - waistRatio) + landmarks[24].x * waistRatio,
    y: landmarks[12].y * (1 - waistRatio) + landmarks[24].y * waistRatio
  };

  // 허리선
  ctx.strokeStyle = '#FF6B6B';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(wl.x * imageWidth, wl.y * imageHeight);
  ctx.lineTo(wr.x * imageWidth, wr.y * imageHeight);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#FF6B6B';
  ctx.font = '12px Pretendard, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('허리', ((wl.x + wr.x) / 2) * imageWidth, ((wl.y + wr.y) / 2) * imageHeight - 10);

  for (const ml of measureLines) {
    const p1 = landmarks[ml.from];
    const p2 = landmarks[ml.to];
    if (p1 && p2) {
      const x1 = p1.x * imageWidth, y1 = p1.y * imageHeight;
      const x2 = p2.x * imageWidth, y2 = p2.y * imageHeight;

      ctx.strokeStyle = ml.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);

      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      ctx.fillStyle = ml.color;
      ctx.font = '12px Pretendard, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(ml.label, midX, midY - 10);
    }
  }
}
