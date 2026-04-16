// ============================================================
//  퍼스널 컬러 분석기 — Canvas 픽셀 샘플링 + LAB 색공간 (정밀 버전)
//  8개 피부 영역 샘플링, IQR 이상값 제거, 연속 점수 분류
// ============================================================

// ── 색공간 변환 ──────────────────────────────

function linearize(c) {
  c = c / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function rgbToXyz(r, g, b) {
  const lr = linearize(r), lg = linearize(g), lb = linearize(b);
  return {
    x: lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375,
    y: lr * 0.2126729 + lg * 0.7151522 + lb * 0.0721750,
    z: lr * 0.0193339 + lg * 0.1191920 + lb * 0.9503041
  };
}

function xyzToLab(x, y, z) {
  const xn = 0.95047, yn = 1.00000, zn = 1.08883;
  const f = (t) => t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);
  return {
    L: 116 * f(y / yn) - 16,
    a: 500 * (f(x / xn) - f(y / yn)),
    b: 200 * (f(y / yn) - f(z / zn))
  };
}

function rgbToLab(r, g, b) {
  const xyz = rgbToXyz(r, g, b);
  return xyzToLab(xyz.x, xyz.y, xyz.z);
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

// ── 통계 유틸리티 ────────────────────────────

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo);
}

// IQR 기반 이상값 제거
function removeOutliers(pixels) {
  if (pixels.length < 10) return pixels;

  const luminances = pixels.map(p => 0.299 * p.r + 0.587 * p.g + 0.114 * p.b);
  const q1 = percentile(luminances, 25);
  const q3 = percentile(luminances, 75);
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;

  return pixels.filter((p, i) => luminances[i] >= lower && luminances[i] <= upper);
}

function sigmoid(value, center, steepness) {
  return 1 / (1 + Math.exp(-steepness * (value - center)));
}

// ── 피부 영역 샘플링 (8개 영역) ──────────────

function getSkinSampleRegions(landmarks, imgWidth, imgHeight) {
  const regions = [];
  const baseRadius = Math.round(imgWidth * 0.025);

  // 이마 중앙 (151)
  regions.push({ cx: landmarks[151].x, cy: landmarks[151].y, radius: baseRadius, name: '이마 중앙' });

  // 이마 좌측 (67)
  regions.push({ cx: landmarks[67].x, cy: landmarks[67].y, radius: Math.round(baseRadius * 0.8), name: '이마 좌' });

  // 이마 우측 (297)
  regions.push({ cx: landmarks[297].x, cy: landmarks[297].y, radius: Math.round(baseRadius * 0.8), name: '이마 우' });

  // 왼쪽 볼 (50)
  regions.push({ cx: landmarks[50].x, cy: landmarks[50].y, radius: baseRadius, name: '왼쪽 볼' });

  // 오른쪽 볼 (280)
  regions.push({ cx: landmarks[280].x, cy: landmarks[280].y, radius: baseRadius, name: '오른쪽 볼' });

  // 코 옆 좌 (116) — 피부톤이 잘 드러나는 부분
  regions.push({ cx: landmarks[116].x, cy: landmarks[116].y, radius: Math.round(baseRadius * 0.7), name: '코 옆 좌' });

  // 코 옆 우 (345)
  regions.push({ cx: landmarks[345].x, cy: landmarks[345].y, radius: Math.round(baseRadius * 0.7), name: '코 옆 우' });

  // 턱 (200)
  regions.push({ cx: landmarks[200].x, cy: landmarks[200].y, radius: Math.round(baseRadius * 0.8), name: '턱' });

  // 좌표를 픽셀로 변환
  return regions.map(r => ({
    ...r,
    cx: Math.round(r.cx * imgWidth),
    cy: Math.round(r.cy * imgHeight)
  }));
}

// 배치 픽셀 읽기 (성능 최적화 — getImageData를 영역 단위로 호출)
function samplePixelsBatch(ctx, region) {
  const { cx, cy, radius } = region;
  const x0 = Math.max(0, cx - radius);
  const y0 = Math.max(0, cy - radius);
  const size = radius * 2 + 1;
  const imageData = ctx.getImageData(x0, y0, size, size);
  const data = imageData.data;
  const pixels = [];

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const px = dx + radius;
      const py = dy + radius;
      const idx = (py * size + px) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];

      // 피부색 범위 필터링 (HSV 기반 — 더 정확)
      const hsv = rgbToHsv(r, g, b);
      // 피부 색조: 0~50° (레드~옐로 범위)
      // 피부 채도: 10~70%
      // 피부 밝기: 20~95%
      if (hsv.h <= 55 && hsv.s >= 0.08 && hsv.s <= 0.75 &&
          hsv.v >= 0.15 && hsv.v <= 0.95 &&
          r > 40 && g > 20 && b > 10) {
        pixels.push({ r, g, b });
      }
    }
  }
  return pixels;
}

// ── 퍼스널 컬러 분류 (연속 점수 시스템) ──────

function classifyPersonalColor(labStats, hsvStats, rgbStats) {
  const { L, a, b, Lstd, astd, bstd } = labStats;

  // 웜/쿨 스코어 (연속값)
  const warmScore = a * 0.55 + b * 0.45;

  // 채도 (크로마)
  const chroma = Math.sqrt(a * a + b * b);

  // 피부톤 색상 각도 (LAB의 a, b 평면)
  const hueAngle = Math.atan2(b, a) * (180 / Math.PI);

  // 색상 분산 — 피부톤의 균일성 (낮을수록 균일)
  const colorVariance = Math.sqrt(Lstd * Lstd + astd * astd + bstd * bstd);

  // ━━━ 12타입 연속 점수 ━━━
  const typeScores = {};

  // --- Spring (봄) ---
  // 봄 라이트: 밝고, 약간 웜, 낮은 채도
  typeScores.spring_light =
    sigmoid(L, 60, 0.12) * 3.0 +           // 밝은 피부
    sigmoid(warmScore, 3, 0.3) * 2.0 +      // 웜 쪽
    sigmoid(chroma, 15, -0.2) * 1.5 +        // 낮은 채도
    sigmoid(L, 70, 0.08) * 1.0;              // 매우 밝으면 보너스

  // 봄 웜: 중간~밝은 밝기, 확실한 웜
  typeScores.spring_warm =
    sigmoid(warmScore, 6, 0.25) * 3.5 +      // 확실한 웜
    sigmoid(L, 55, 0.1) * 2.0 +              // 밝은~중간 밝기
    sigmoid(chroma, 14, 0.15) * 1.5 +         // 중간 이상 채도
    sigmoid(b, 12, 0.15) * 1.0;               // 노란 기운

  // 봄 브라이트: 밝고, 웜, 높은 채도
  typeScores.spring_bright =
    sigmoid(chroma, 20, 0.2) * 3.0 +         // 높은 채도
    sigmoid(warmScore, 4, 0.25) * 2.5 +      // 웜
    sigmoid(L, 55, 0.08) * 2.0 +              // 밝은 편
    sigmoid(hsvStats.s, 0.3, 5) * 1.0;        // HSV 채도도 높음

  // --- Summer (여름) ---
  // 여름 라이트: 밝고, 약간 쿨, 부드러운 톤
  typeScores.summer_light =
    sigmoid(L, 60, 0.12) * 3.0 +             // 밝은 피부
    sigmoid(warmScore, 3, -0.3) * 2.0 +       // 쿨 쪽
    sigmoid(chroma, 16, -0.15) * 1.5 +         // 낮은 채도
    sigmoid(a, 8, -0.2) * 1.0;                // 레드 기운 적음

  // 여름 쿨: 확실한 쿨, 중간 밝기
  typeScores.summer_cool =
    sigmoid(warmScore, 2, -0.3) * 3.5 +       // 쿨
    sigmoid(L, 52, 0.08) * 1.5 +              // 중간~밝은 밝기
    sigmoid(chroma, 14, 0.1) * 1.5 +           // 중간 채도
    sigmoid(a, 6, -0.15) * 1.5;               // 핑크 기운 적음

  // 여름 뮤트: 쿨, 탁한 느낌, 낮은 채도
  typeScores.summer_mute =
    sigmoid(chroma, 13, -0.25) * 3.0 +        // 낮은 채도 (뮤트)
    sigmoid(warmScore, 3, -0.2) * 2.0 +        // 쿨 쪽
    sigmoid(L, 50, 0.06) * 1.5 +               // 중간 밝기
    sigmoid(colorVariance, 8, -0.3) * 1.0;     // 색상 균일

  // --- Autumn (가을) ---
  // 가을 뮤트: 웜, 탁한, 중간 밝기
  typeScores.autumn_mute =
    sigmoid(chroma, 13, -0.2) * 3.0 +         // 낮은 채도
    sigmoid(warmScore, 5, 0.25) * 2.5 +        // 웜
    sigmoid(L, 55, -0.06) * 1.5 +              // 중간~어두운 밝기
    sigmoid(b, 10, 0.1) * 1.0;                 // 옐로 기운

  // 가을 웜: 확실한 웜, 중간 밝기, 중간 채도
  typeScores.autumn_warm =
    sigmoid(warmScore, 8, 0.2) * 3.5 +         // 강한 웜
    sigmoid(L, 58, -0.06) * 2.0 +              // 밝지 않은 쪽
    sigmoid(chroma, 14, 0.1) * 1.5 +            // 중간 이상 채도
    sigmoid(a, 10, 0.1) * 1.0;                  // 레드 기운 있음

  // 가을 딥: 어둡고, 웜, 깊은 톤
  typeScores.autumn_deep =
    sigmoid(L, 50, -0.12) * 3.0 +             // 어두운 피부
    sigmoid(warmScore, 5, 0.2) * 2.5 +         // 웜
    sigmoid(chroma, 14, 0.1) * 1.5 +            // 중간 이상 채도
    sigmoid(L, 42, -0.08) * 1.0;               // 매우 어두우면 보너스

  // --- Winter (겨울) ---
  // 겨울 딥: 어둡고, 쿨
  typeScores.winter_deep =
    sigmoid(L, 50, -0.12) * 3.0 +             // 어두운 피부
    sigmoid(warmScore, 2, -0.25) * 2.5 +       // 쿨
    sigmoid(chroma, 14, 0.1) * 1.5 +            // 중간 이상 채도
    sigmoid(a, 8, -0.15) * 1.0;                // 핑크 기운 적음

  // 겨울 쿨: 강한 쿨, 중간 밝기
  typeScores.winter_cool =
    sigmoid(warmScore, 0, -0.3) * 3.5 +        // 강한 쿨
    sigmoid(L, 52, -0.06) * 1.5 +              // 중간 밝기
    sigmoid(chroma, 14, 0.1) * 1.5 +            // 중간 이상 채도
    sigmoid(b, 8, -0.15) * 1.5;                // 블루 기운

  // 겨울 브라이트: 쿨, 높은 채도, 선명
  typeScores.winter_bright =
    sigmoid(chroma, 20, 0.2) * 3.0 +           // 높은 채도
    sigmoid(warmScore, 2, -0.25) * 2.5 +       // 쿨
    sigmoid(L, 48, 0.06) * 1.5 +                // 중간~밝은
    sigmoid(hsvStats.s, 0.3, 5) * 1.0;          // HSV 채도도 높음

  // ━━━ 최고 점수 결정 ━━━
  let bestKey = 'spring_warm';
  let maxScore = -1;
  for (const [key, score] of Object.entries(typeScores)) {
    if (score > maxScore) {
      maxScore = score;
      bestKey = key;
    }
  }

  const [season, subtype] = bestKey.split('_');

  // 신뢰도 — 1위와 2위 격차 기반
  const sortedScores = Object.values(typeScores).sort((a, b) => b - a);
  const totalScore = sortedScores.reduce((a, b) => a + b, 0);
  const gap = sortedScores[0] - sortedScores[1];

  let confidence;
  if (totalScore > 0) {
    const dominance = sortedScores[0] / totalScore;
    const gapRatio = gap / Math.max(sortedScores[0], 1);
    confidence = Math.round((dominance * 0.5 + gapRatio * 0.5) * 100);
  } else {
    confidence = 15;
  }
  confidence = Math.max(15, Math.min(90, confidence));

  // 상위 3개 후보
  const topCandidates = Object.entries(typeScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, score]) => ({
      key,
      score: Math.round(score * 100) / 100,
      percentage: totalScore > 0 ? Math.round((score / totalScore) * 1000) / 10 : 0
    }));

  return {
    season,
    subtype,
    key: bestKey,
    confidence,
    warmScore: Math.round(warmScore * 10) / 10,
    lightness: Math.round(L * 10) / 10,
    chroma: Math.round(chroma * 10) / 10,
    isWarm: warmScore > 3,
    topCandidates,
    details: {
      L: Math.round(L * 10) / 10,
      a: Math.round(a * 10) / 10,
      b: Math.round(b * 10) / 10,
      Lstd: Math.round(Lstd * 10) / 10,
      astd: Math.round(astd * 10) / 10,
      bstd: Math.round(bstd * 10) / 10,
      hueAngle: Math.round(hueAngle),
      chroma: Math.round(chroma * 10) / 10,
      colorVariance: Math.round(colorVariance * 10) / 10,
      hue: Math.round(hsvStats.h),
      saturation: Math.round(hsvStats.s * 100),
      avgRgb: {
        r: Math.round(rgbStats.r),
        g: Math.round(rgbStats.g),
        b: Math.round(rgbStats.b)
      }
    }
  };
}

// ── 메인 분석 함수 ──────────────────────────

export function analyzePersonalColor(imageElement, faceLandmarks) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  canvas.width = imageElement.naturalWidth || imageElement.width;
  canvas.height = imageElement.naturalHeight || imageElement.height;
  ctx.drawImage(imageElement, 0, 0);

  // 8개 피부 영역 샘플링
  const regions = getSkinSampleRegions(faceLandmarks, canvas.width, canvas.height);

  let allPixels = [];
  const regionResults = [];

  for (const region of regions) {
    const pixels = samplePixelsBatch(ctx, region);
    allPixels = allPixels.concat(pixels);
    regionResults.push({
      name: region.name,
      pixelCount: pixels.length,
      cx: region.cx,
      cy: region.cy
    });
  }

  if (allPixels.length < 50) {
    return { error: '충분한 피부 영역을 샘플링할 수 없습니다. 조명이 밝은 곳에서 다시 촬영해 주세요.' };
  }

  // IQR 기반 이상값 제거
  const cleanPixels = removeOutliers(allPixels);
  const pixels = cleanPixels.length >= 30 ? cleanPixels : allPixels;

  // LAB 변환 (개별 픽셀)
  const labValues = pixels.map(p => rgbToLab(p.r, p.g, p.b));
  const hsvValues = pixels.map(p => rgbToHsv(p.r, p.g, p.b));

  // 중앙값 기반 대표값 (평균보다 이상값에 강건)
  const labStats = {
    L: median(labValues.map(v => v.L)),
    a: median(labValues.map(v => v.a)),
    b: median(labValues.map(v => v.b)),
    // 표준편차 — 색상 분포의 폭
    Lstd: std(labValues.map(v => v.L)),
    astd: std(labValues.map(v => v.a)),
    bstd: std(labValues.map(v => v.b))
  };

  const hsvStats = {
    h: median(hsvValues.map(v => v.h)),
    s: median(hsvValues.map(v => v.s)),
    v: median(hsvValues.map(v => v.v))
  };

  const rgbStats = {
    r: median(pixels.map(p => p.r)),
    g: median(pixels.map(p => p.g)),
    b: median(pixels.map(p => p.b))
  };

  // 분류
  const result = classifyPersonalColor(labStats, hsvStats, rgbStats);

  return {
    ...result,
    sampleInfo: {
      totalPixels: allPixels.length,
      cleanPixels: pixels.length,
      outlierRemoved: allPixels.length - pixels.length,
      regions: regionResults
    }
  };
}

// 표준편차 계산
function std(arr) {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

// 컬러 스워치 시각화 헬퍼
export function createColorSwatch(hex, size = 40) {
  const div = document.createElement('div');
  div.style.cssText = `
    width: ${size}px; height: ${size}px;
    background: ${hex};
    border-radius: 8px;
    border: 2px solid rgba(255,255,255,0.2);
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
  `;
  div.addEventListener('mouseenter', () => {
    div.style.transform = 'scale(1.15)';
    div.style.boxShadow = `0 4px 15px ${hex}80`;
  });
  div.addEventListener('mouseleave', () => {
    div.style.transform = 'scale(1)';
    div.style.boxShadow = 'none';
  });
  return div;
}
