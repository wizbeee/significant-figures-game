// ============================================================
//  얼굴형 분석기 — MediaPipe FaceLandmarker 기반 (정밀 버전)
//  478개 랜드마크에서 다각적 비율·각도를 측정하여 6가지 유형 분류
// ============================================================

let faceLandmarker = null;

export async function initFaceLandmarker(vision) {
  const { FaceLandmarker } = await import(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs'
  );

  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
      delegate: 'GPU'
    },
    runningMode: 'IMAGE',
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false
  });

  return faceLandmarker;
}

// ── 유틸리티 ──────────────────────────────────

function dist(landmarks, i, j) {
  const a = landmarks[i], b = landmarks[j];
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function midpoint(landmarks, i, j) {
  return {
    x: (landmarks[i].x + landmarks[j].x) / 2,
    y: (landmarks[i].y + landmarks[j].y) / 2
  };
}

function distPt(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// 세 점이 이루는 각도 (B가 꼭짓점)
function angleDeg(a, b, c) {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const cross = v1.x * v2.y - v1.y * v2.x;
  return Math.abs(Math.atan2(cross, dot)) * (180 / Math.PI);
}

// ── 얼굴형 분류 (정밀 버전) ────────────────────

export function classifyFaceShape(landmarks) {
  // ━━━ 1. 핵심 치수 측정 ━━━

  // 가로 측정 (5개 레벨)
  const foreheadWidth    = dist(landmarks, 54, 284);   // 이마 (상단)
  const templeWidth      = dist(landmarks, 21, 251);   // 관자놀이
  const cheekboneWidth   = dist(landmarks, 234, 454);  // 광대 (가장 넓은 부분)
  const jawWidth         = dist(landmarks, 172, 397);  // 턱 (넓은 부분)
  const chinWidth        = dist(landmarks, 58, 288);   // 턱끝 (좁은 부분)

  // 세로 측정
  const faceLength       = dist(landmarks, 10, 152);   // 전체 길이 (이마꼭대기→턱끝)
  const foreheadHeight   = dist(landmarks, 10, 168);   // 이마 높이 (헤어라인→눈썹)
  const midFaceHeight    = dist(landmarks, 168, 2);    // 중안면 (눈썹→코끝)
  const lowerFaceHeight  = dist(landmarks, 2, 152);    // 하안면 (코끝→턱끝)

  // ━━━ 2. 비율 계산 (15+ 지표) ━━━

  const widthToLength      = cheekboneWidth / faceLength;
  const jawToCheekbone     = jawWidth / cheekboneWidth;
  const chinToCheekbone    = chinWidth / cheekboneWidth;
  const foreheadToCheekbone = foreheadWidth / cheekboneWidth;
  const templeToCheekbone  = templeWidth / cheekboneWidth;

  // 얼굴 수직 3등분 비율 (이상적: 1:1:1)
  const totalVertical = foreheadHeight + midFaceHeight + lowerFaceHeight;
  const upperThird   = foreheadHeight / totalVertical;
  const middleThird  = midFaceHeight / totalVertical;
  const lowerThird   = lowerFaceHeight / totalVertical;

  // 얼굴 너비 변화 기울기 (위→아래)
  const taperRatio = jawWidth / foreheadWidth;  // <1 = 아래로 좁아짐, >1 = 아래로 넓어짐
  const chinTaper  = chinWidth / jawWidth;      // 턱이 얼마나 뾰족한지

  // ━━━ 3. 턱 형태 정밀 분석 ━━━

  // 턱 각도 (172-152-397)
  const jawLeft = landmarks[172], chin = landmarks[152], jawRight = landmarks[397];
  const jawAngle = angleDeg(jawLeft, chin, jawRight);

  // 턱선 곡률 — 턱 윤곽 포인트들의 이탈 정도
  const jawContourLeft = [172, 136, 150, 149, 176, 148, 152];
  const jawContourRight = [397, 365, 379, 378, 400, 377, 152];

  function jawCurvature(contourIndices) {
    const pts = contourIndices.map(i => landmarks[i]);
    const start = pts[0], end = pts[pts.length - 1];
    let maxDeviation = 0;
    for (let k = 1; k < pts.length - 1; k++) {
      // 점과 직선 사이의 거리
      const lineLen = distPt(start, end);
      if (lineLen < 0.001) continue;
      const d = Math.abs(
        (end.y - start.y) * pts[k].x - (end.x - start.x) * pts[k].y +
        end.x * start.y - end.y * start.x
      ) / lineLen;
      maxDeviation = Math.max(maxDeviation, d);
    }
    return maxDeviation / distPt(start, end); // 정규화된 곡률
  }

  const leftCurvature  = jawCurvature(jawContourLeft);
  const rightCurvature = jawCurvature(jawContourRight);
  const avgJawCurvature = (leftCurvature + rightCurvature) / 2;

  // 턱선 직선도 (0 = 완전 직선, 높을수록 둥근)
  const jawStraightness = 1 - Math.min(avgJawCurvature * 5, 1); // 0~1 범위

  // ━━━ 4. 광대 돌출도 ━━━

  // 광대가 이마와 턱보다 얼마나 튀어나오는지
  const cheekProminence = cheekboneWidth / ((foreheadWidth + jawWidth) / 2);

  // ━━━ 5. 연속적 점수 시스템 (가중치 기반) ━━━

  const scores = { round: 0, square: 0, heart: 0, diamond: 0, oblong: 0, oval: 0 };

  // ── 둥근형 (round) ──
  // 특징: 폭/길이 비율 높음, 턱이 둥글고 넓음, 광대와 턱 차이 적음
  scores.round += sigmoid(widthToLength, 0.80, 15) * 3.0;      // 폭/길이 비율 높음
  scores.round += sigmoid(jawAngle, 105, 0.15) * 2.5;           // 턱 각도 넓음 (둥근)
  scores.round += sigmoid(jawToCheekbone, 0.82, 12) * 2.0;      // 턱이 광대만큼 넓음
  scores.round += (1 - jawStraightness) * 1.5;                   // 턱선이 둥근
  scores.round += sigmoid(chinTaper, 0.75, 8) * 1.0;             // 턱끝이 넓은

  // ── 사각형 (square) ──
  // 특징: 턱이 넓고 각짐, 이마·광대·턱 너비 비슷, 턱 각도 좁음
  scores.square += sigmoid(jawToCheekbone, 0.85, 15) * 3.0;     // 턱 = 광대
  scores.square += sigmoid(jawAngle, 95, -0.15) * 2.5;           // 턱 각도 좁음 (각진)
  scores.square += jawStraightness * 2.0;                         // 턱선이 직선적
  scores.square += sigmoid(foreheadToCheekbone, 0.92, 10) * 1.5; // 이마 ≈ 광대
  scores.square += sigmoid(widthToLength, 0.73, 10) * 1.0;       // 적당한 폭/길이

  // ── 하트형 (heart) ──
  // 특징: 이마 > 광대 > 턱, 턱이 뾰족함
  scores.heart += sigmoid(foreheadToCheekbone, 0.95, 12) * 2.5;  // 이마가 넓음
  scores.heart += sigmoid(jawToCheekbone, 0.78, -12) * 3.0;      // 턱이 좁음
  scores.heart += sigmoid(chinTaper, 0.65, -10) * 2.0;            // 턱끝이 뾰족
  scores.heart += sigmoid(taperRatio, 0.85, -10) * 1.5;           // 위→아래 좁아짐
  scores.heart += sigmoid(jawAngle, 100, -0.1) * 1.0;             // 턱 각도 좁은 편

  // ── 다이아몬드형 (diamond) ──
  // 특징: 광대가 가장 넓고, 이마와 턱 모두 좁음
  scores.diamond += sigmoid(cheekProminence, 1.08, 12) * 3.0;    // 광대 돌출
  scores.diamond += sigmoid(foreheadToCheekbone, 0.88, -12) * 2.5; // 이마 좁음
  scores.diamond += sigmoid(jawToCheekbone, 0.78, -12) * 2.5;    // 턱 좁음
  scores.diamond += sigmoid(chinTaper, 0.65, -8) * 1.5;           // 턱끝 뾰족
  scores.diamond += sigmoid(templeToCheekbone, 0.92, -10) * 1.0;  // 관자놀이 < 광대

  // ── 긴 얼굴형 (oblong) ──
  // 특징: 폭/길이 비율 낮음, 이마·광대·턱 비슷한 너비, 하안면 길음
  scores.oblong += sigmoid(widthToLength, 0.68, -15) * 3.5;     // 폭/길이 비율 낮음
  scores.oblong += sigmoid(lowerThird, 0.36, 10) * 2.0;          // 하안면 길음
  const widthUniformity = 1 - Math.abs(foreheadToCheekbone - 1) - Math.abs(jawToCheekbone - 1);
  scores.oblong += Math.max(0, widthUniformity) * 2.0;           // 너비 균일

  // ── 타원형 (oval) ──
  // 특징: 균형 잡힌 비율, 이마 > 턱, 부드러운 턱선
  scores.oval += sigmoid(widthToLength, 0.75, 8) * 1.5;          // 적당한 폭/길이
  scores.oval += sigmoid(widthToLength, 0.82, -8) * 1.5;         // 너무 넓지 않음
  scores.oval += sigmoid(foreheadToCheekbone, 0.95, 8) * 1.0;    // 이마 ≈ 광대
  scores.oval += sigmoid(jawToCheekbone, 0.82, -8) * 1.0;        // 턱이 약간 좁음
  scores.oval += sigmoid(taperRatio, 0.9, -8) * 1.0;             // 부드러운 테이퍼
  // 3등분 균형 보너스
  const thirdBalance = 1 - (Math.abs(upperThird - 0.333) + Math.abs(middleThird - 0.333) + Math.abs(lowerThird - 0.333));
  scores.oval += Math.max(0, thirdBalance * 3) * 1.5;

  // ━━━ 6. 결과 결정 ━━━

  let bestType = 'oval';
  let maxScore = -1;
  for (const [type, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      bestType = type;
    }
  }

  // 2위와의 차이로 신뢰도 계산
  const sortedScores = Object.values(scores).sort((a, b) => b - a);
  const totalScore = sortedScores.reduce((a, b) => a + b, 0);
  const gap = sortedScores[0] - sortedScores[1];

  // 신뢰도 = (1위 점수 비중 + 1-2위 격차 보너스) 조합
  let confidence;
  if (totalScore > 0) {
    const dominance = sortedScores[0] / totalScore;         // 1위 비중 (0~1)
    const gapRatio = gap / Math.max(sortedScores[0], 1);    // 격차 비율 (0~1)
    confidence = Math.round((dominance * 0.6 + gapRatio * 0.4) * 100);
  } else {
    confidence = 20;
  }
  confidence = Math.max(20, Math.min(95, confidence));

  return {
    shape: bestType,
    confidence,
    measurements: {
      foreheadWidth:   round4(foreheadWidth),
      templeWidth:     round4(templeWidth),
      cheekboneWidth:  round4(cheekboneWidth),
      jawWidth:        round4(jawWidth),
      chinWidth:       round4(chinWidth),
      faceLength:      round4(faceLength),
      widthToLength:   round2(widthToLength),
      jawToCheekbone:  round2(jawToCheekbone),
      chinToCheekbone: round2(chinToCheekbone),
      foreheadToCheekbone: round2(foreheadToCheekbone),
      taperRatio:      round2(taperRatio),
      chinTaper:       round2(chinTaper),
      jawAngle:        Math.round(jawAngle),
      jawCurvature:    round4(avgJawCurvature),
      cheekProminence: round2(cheekProminence),
      upperThird:      round2(upperThird),
      middleThird:     round2(middleThird),
      lowerThird:      round2(lowerThird)
    },
    scores: Object.fromEntries(
      Object.entries(scores).map(([k, v]) => [k, round2(v)])
    )
  };
}

// Sigmoid 함수: center 기준으로 부드러운 0~1 전환, steepness가 기울기
function sigmoid(value, center, steepness) {
  return 1 / (1 + Math.exp(-steepness * (value - center)));
}

function round2(v) { return Math.round(v * 100) / 100; }
function round4(v) { return Math.round(v * 10000) / 10000; }

// ── 이미지에서 얼굴형 분석 실행 ──

export async function analyzeFace(imageElement) {
  if (!faceLandmarker) throw new Error('FaceLandmarker가 초기화되지 않았습니다.');

  const result = faceLandmarker.detect(imageElement);

  if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
    return { error: '얼굴을 감지할 수 없습니다. 정면 사진을 사용해 주세요.' };
  }

  const landmarks = result.faceLandmarks[0];
  const classification = classifyFaceShape(landmarks);

  return {
    ...classification,
    landmarks
  };
}

// ── 랜드마크 오버레이 그리기 ──

export function drawFaceLandmarks(canvas, landmarks, imageWidth, imageHeight) {
  const ctx = canvas.getContext('2d');
  canvas.width = imageWidth;
  canvas.height = imageHeight;

  // 얼굴 윤곽선 (메인 포인트들)
  const faceOutline = [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
    397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
    172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10
  ];

  // 얼굴 윤곽 그리기
  ctx.strokeStyle = 'rgba(147, 197, 253, 0.8)';
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(147, 197, 253, 0.6)';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  for (let i = 0; i < faceOutline.length; i++) {
    const p = landmarks[faceOutline[i]];
    const x = p.x * imageWidth;
    const y = p.y * imageHeight;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // 측정 포인트 표시
  const measurePoints = [
    { indices: [54, 284], color: '#FF6B6B', label: '이마' },
    { indices: [21, 251], color: '#FF9F43', label: '관자놀이' },
    { indices: [234, 454], color: '#4ECDC4', label: '광대' },
    { indices: [172, 397], color: '#FFE66D', label: '턱' },
    { indices: [58, 288], color: '#A78BFA', label: '턱끝' },
    { indices: [10, 152], color: '#F472B6', label: '길이' }
  ];

  ctx.shadowBlur = 0;
  for (const mp of measurePoints) {
    const p1 = landmarks[mp.indices[0]];
    const p2 = landmarks[mp.indices[1]];
    const x1 = p1.x * imageWidth, y1 = p1.y * imageHeight;
    const x2 = p2.x * imageWidth, y2 = p2.y * imageHeight;

    // 측정선
    ctx.strokeStyle = mp.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 포인트
    for (const idx of mp.indices) {
      const p = landmarks[idx];
      ctx.fillStyle = mp.color;
      ctx.beginPath();
      ctx.arc(p.x * imageWidth, p.y * imageHeight, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
