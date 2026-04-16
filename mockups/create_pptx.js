const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.author = "과학실험실 관리 시스템";
pres.title = "UI/UX 재설계 목업";

// Colors
const C = {
  primary: "2563EB", primaryDark: "1E3A8A", primaryLight: "DBEAFE",
  bg: "F1F5F9", surface: "FFFFFF", text: "1E293B",
  muted: "64748B", border: "E2E8F0",
  success: "16A34A", warning: "F59E0B", danger: "DC2626", info: "0EA5E9",
  dark: "0F172A", darkSurface: "1E293B"
};

function makeShadow() {
  return { type: "outer", blur: 4, offset: 2, angle: 135, color: "000000", opacity: 0.1 };
}

// ─── SLIDE 1: Title ───
{
  const s = pres.addSlide();
  s.background = { color: C.dark };
  // Accent bar top
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: C.primary } });
  // Logo
  s.addText("🔬", { x: 0, y: 1.2, w: 10, h: 0.8, fontSize: 48, align: "center" });
  // Title
  s.addText("과학 실험·실습실 관리 시스템", {
    x: 1, y: 2.0, w: 8, h: 0.8, fontSize: 36, fontFace: "Calibri",
    bold: true, color: "FFFFFF", align: "center"
  });
  // Subtitle
  s.addText("UI/UX 재설계 목업 — 데스크탑 / 태블릿 / 스마트폰", {
    x: 1, y: 2.8, w: 8, h: 0.5, fontSize: 18, fontFace: "Calibri",
    color: "94A3B8", align: "center"
  });
  // Date
  s.addText("2026-04-08", {
    x: 1, y: 3.6, w: 8, h: 0.4, fontSize: 14, fontFace: "Calibri",
    color: "64748B", align: "center"
  });
  // Bottom bar
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 5.565, w: 10, h: 0.06, fill: { color: C.primary } });
}

// ─── SLIDE 2: Platform Strategy ───
{
  const s = pres.addSlide();
  s.background = { color: C.bg };
  // Header bar
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.8, fill: { color: C.primary } });
  s.addText("플랫폼별 레이아웃 전략", {
    x: 0.6, y: 0, w: 9, h: 0.8, fontSize: 24, bold: true, color: "FFFFFF", fontFace: "Calibri", margin: 0
  });

  // 3 cards
  const cards = [
    { icon: "🖥️", title: "데스크탑", sub: "1280px+", items: ["좌측 사이드바 네비게이션", "데이터 테이블 (10열)", "모달 상세보기 (720px)", "로그인 화면 포함"] },
    { icon: "📟", title: "태블릿", sub: "Galaxy Tab S10 Lite (800px)", items: ["상단바 + 햄버거 메뉴", "데이터 테이블 (수평 스크롤)", "하단 탭 네비게이션", "로그인 없음 (앱 자동인증)"] },
    { icon: "📱", title: "스마트폰", sub: "390px", items: ["상단바 + 하단 탭 바", "카드 리스트 (테이블 대체)", "풀스크린 상세보기", "Pull-to-refresh 비활성화"] }
  ];

  cards.forEach((c, i) => {
    const x = 0.4 + i * 3.15;
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: 1.1, w: 2.95, h: 3.2, fill: { color: C.surface },
      shadow: makeShadow()
    });
    s.addShape(pres.shapes.RECTANGLE, { x, y: 1.1, w: 2.95, h: 0.06, fill: { color: C.primary } });
    s.addText(c.icon, { x, y: 1.3, w: 2.95, h: 0.5, fontSize: 28, align: "center", margin: 0 });
    s.addText(c.title, { x, y: 1.8, w: 2.95, h: 0.35, fontSize: 18, bold: true, color: C.text, align: "center", fontFace: "Calibri", margin: 0 });
    s.addText(c.sub, { x, y: 2.1, w: 2.95, h: 0.25, fontSize: 11, color: C.muted, align: "center", fontFace: "Calibri", margin: 0 });
    const bullets = c.items.map((t, j) => ({
      text: t, options: { bullet: true, fontSize: 12, color: C.text, fontFace: "Calibri", breakLine: j < c.items.length - 1 }
    }));
    s.addText(bullets, { x: x + 0.2, y: 2.5, w: 2.55, h: 1.7 });
  });

  // Common note
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.4, y: 4.5, w: 9.2, h: 0.85, fill: { color: C.primaryLight },
    shadow: makeShadow()
  });
  s.addText([
    { text: "공통 원칙: ", options: { bold: true, fontSize: 13, color: C.primaryDark, fontFace: "Calibri" } },
    { text: "동일한 기능 · 동일한 디자인 토큰(색상/폰트) · 백엔드(Code.gs) 공유 · 비즈니스 로직 JS 공유", options: { fontSize: 13, color: C.primaryDark, fontFace: "Calibri" } }
  ], { x: 0.7, y: 4.55, w: 8.7, h: 0.35 });
  s.addText([
    { text: "모바일 전용: ", options: { bold: true, fontSize: 12, color: C.muted, fontFace: "Calibri" } },
    { text: "로그인 화면 없음 (앱 자동 인증) · Pull-to-refresh 비활성화 (정보 조회 방해 제거)", options: { fontSize: 12, color: C.muted, fontFace: "Calibri" } }
  ], { x: 0.7, y: 4.95, w: 8.7, h: 0.3 });
}

// ─── Helper: Content slide ───
function addContentSlide(title, items, noteText) {
  const s = pres.addSlide();
  s.background = { color: C.bg };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.8, fill: { color: C.primary } });
  s.addText(title, {
    x: 0.6, y: 0, w: 9, h: 0.8, fontSize: 22, bold: true, color: "FFFFFF", fontFace: "Calibri", margin: 0
  });

  // Content card
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.4, y: 1.05, w: 9.2, h: noteText ? 3.6 : 4.3,
    fill: { color: C.surface }, shadow: makeShadow()
  });

  const bullets = items.map((t, i) => ({
    text: t, options: { bullet: true, fontSize: 13, color: C.text, fontFace: "Calibri", breakLine: i < items.length - 1, paraSpaceAfter: 4 }
  }));
  s.addText(bullets, { x: 0.7, y: 1.2, w: 8.6, h: noteText ? 3.3 : 4.1 });

  if (noteText) {
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.4, y: 4.85, w: 9.2, h: 0.55, fill: { color: "F8FAFC" },
      line: { color: C.border, width: 1 }
    });
    s.addText(noteText, { x: 0.7, y: 4.9, w: 8.6, h: 0.45, fontSize: 11, color: C.muted, fontFace: "Calibri" });
  }
  return s;
}

// ─── SLIDE 3~8: Mobile screens ───
addContentSlide("📱 스마트폰 — 대시보드", [
  "상단 바: 햄버거 메뉴(☰) + 제목 '실험실 관리' + 새로고침(↻) / 다크모드(☀️) 버튼",
  "통계 카드: 수평 스크롤 캐러셀 (전체 42 / 대기 12 / 1차승인 8 / 최종승인 18 / 반려 4)",
  "빠른 필터: [오늘] [이번주] [이번달] [전체] 버튼 — 터치 최적화",
  "상세 필터: 실험실 드롭다운 + 상태 드롭다운 + 검색 입력 + [조회] 버튼",
  "결과 바: '총 42건 중 12건 표시' + [정렬↕] [엑셀📥] 버튼",
  "신청 카드 리스트: 학생명(학번) + 상태뱃지 + 실험실·날짜·시간 + 실험제목 + [상세] [승인▾]",
  "하단 네비게이션 (고정): 📊대시보드 / 📦시약 / 👥학생 / 🧑‍🏫일정"
], "목업 파일: mockups/mobile_dashboard.html");

addContentSlide("📱 스마트폰 — 상세 보기 (풀스크린)", [
  "상단 바: ← 뒤로 버튼 + ✏️편집 / 🖨️인쇄 아이콘",
  "상태 배너: 현재 상태를 전체 너비 색상 배너로 표시 (대기=노란, 승인=초록)",
  "기본 정보 섹션: 신청번호, 대표자(학번), 실험실, 실험날짜, 시간, 실험제목, 지도교사, 제출일시",
  "시약 정보 테이블: 시약명 / 용량 / 단위 / 상태(고체·액체) / 폐기방법",
  "동반 학생: 칩(pill) 형태 — 이름(학번) + 역할뱃지(대표/동반)",
  "비고 섹션: 실험 설명 텍스트",
  "하단 고정 액션: [1차승인(초록)] [최종승인(파랑)] [반려(빨강)] 3개 버튼"
], "목업 파일: mockups/mobile_detail.html");

addContentSlide("📱 스마트폰 — 시약 목록", [
  "날짜 선택 바: 시작일 ~ 종료일 + [오늘] [이번주] [이번달] [전체] 빠른 선택",
  "필터 칩: 수평 스크롤 — [전체상태] [화학실험실] [생물실험실] [물리실험실] [프로젝트실]",
  "통계 미니카드: 시약종류 15 / 총 신청건 28 / 조회기간",
  "실험실별 그룹 헤더: 아이콘(🧪) + 실험실명 + 건수 뱃지(파란색)",
  "시약 카드: 좌측(시약명 + 날짜·시간·신청자) / 우측(용량 숫자 + 단위 + 고체/액체 뱃지)",
  "상단 바 액션: 🖨️인쇄 / 📥엑셀 내보내기"
], "목업 파일: mockups/mobile_chemical.html");

addContentSlide("📱 스마트폰 — 학생 명단", [
  "빠른 필터: [오늘] [이번주] [이번달] 버튼",
  "필터 행: 실험실 드롭다운 + 보기모드(날짜별) + 🔍학생 검색",
  "통계: 팀수 5 / 총학생 14 / 오늘 날짜",
  "날짜별 그룹 헤더: '📅 2026-04-08 (화)' + 뱃지 '3팀 · 8명'",
  "팀 카드: 헤더(실험실·시간·실험제목) → 학생 행(아바타+이름+학번+역할뱃지+출석체크)",
  "출석 체크: 체크박스 — 체크(✓초록) / 미체크(빈 네모)",
  "아바타: 대표자=파란원, 동반자=회색원 (성 1글자 표시)"
], "목업 파일: mockups/mobile_student.html");

addContentSlide("📱 스마트폰 — 임장 일정", [
  "교사 칩 선택: 수평 스크롤 — [전체] [이승현T] [김영호T] [박준호T] [최미래T] ...",
  "보기 전환 토글: [📋 목록] [📅 달력] — 세그먼트 버튼",
  "통계: 총 일정 12 / 임장필요 8(주황) / 임장불필요 4(초록)",
  "달력 보기: 월간 캘린더 — 일정 있는 날짜에 색상 점(●) 표시",
  "범례: 🟡임장필요 / 🟢임장불필요",
  "날짜 선택 → 하단에 해당 일정 카드: 교사명 + 실험실 + 시간 + 뱃지 + 시간범위"
], "목업 파일: mockups/mobile_schedule.html");

addContentSlide("📱 스마트폰 — 햄버거 메뉴 (슬라이드 패널)", [
  "어두운 오버레이(50%) 위에 좌측 슬라이드 패널 (300px)",
  "헤더: 파란색 배경 — 🔬로고 + '과학 실험·실습실 관리 시스템 v3.2'",
  "사용자 정보: 아바타(원) + 이름 '이승현 선생님' + 담당 '화학 담당'",
  "메뉴: 📊대시보드(뱃지12) / 📦시약목록 / 👥학생명단 / 🧑‍🏫임장일정",
  "관리: 📝지도일지작성 / 📊지도통계 / 🚫신청제한관리",
  "푸터: 🌙다크모드(토글) / ↻새로고침 / 🚪로그아웃(빨간색)"
], "목업 파일: mockups/mobile_hamburger.html");

// ─── SLIDE 9: Tablet ───
addContentSlide("📟 태블릿 — 대시보드 (Galaxy Tab S10 Lite, 800px)", [
  "상단 바: ☰햄버거 + '🔬 과학 실험·실습실 관리' + 사용자정보(아바타+이름) + ↻새로고침 + ☀️다크모드",
  "통계 카드: 5열 그리드 — 전체42 / 대기12 / 1차승인8 / 최종승인18 / 반려4 (클릭 필터)",
  "필터 바: 2줄 구성 — 1줄: 기간+빠른선택+조회 / 2줄: 실험실+상태+검색+고급옵션",
  "도구 바: '총 42건 중 12건 표시' + 필터칩(오늘×, 대기×) + [편집모드] [엑셀] [인쇄]",
  "데이터 테이블: 체크박스 + 10열 (수평 스크롤 가능, 핵심 열 고정)",
  "페이지네이션: ◀ 1 2 3 4 5 ▶ + 페이지당 25/50/100건 선택",
  "하단 네비게이션: 📊대시보드 / 📦시약목록 / 👥학생명단 / 🧑‍🏫임장일정"
], "목업 파일: mockups/tablet_dashboard.html");

// ─── SLIDE 10: Desktop ───
addContentSlide("🖥️ 데스크탑 — 대시보드 (1280px, 사이드바 레이아웃)", [
  "좌측 사이드바 (230px 고정): 🔬로고+시스템명 → 메뉴(대시보드·시약·학생·일정) → 관리(지도일지·통계·제한) → 다크모드토글·로그아웃",
  "대시보드 뱃지: 대기건수(12) 실시간 표시",
  "메인 영역: 📊 대시보드 제목 + '실험·실습실 사용 신청 현황 및 관리' 부제목",
  "통계 카드: 5열 그리드 (숫자+라벨+부가설명 — 클릭 시 해당 상태 필터)",
  "필터 바: 2줄 — 1줄: 기간+빠른선택(오늘/이번주/이번달/최근7일)+조회+초기화 / 2줄: 실험실+상태+검색+고급옵션",
  "도구 바: '총 42건 중 12건 표시' + 필터칩 + [편집모드] [엑셀내보내기] [인쇄]",
  "데이터 테이블: 체크박스 + 10열 (제출일시/대표자/실험실/날짜/시간/제목/상태/교사/관리[상세+편집])",
  "페이지네이션: 하단 페이지 버튼 + 페이지당 건수 선택"
], "목업 파일: mockups/desktop_dashboard.html");

// ─── SLIDE 11: Code Strategy ───
{
  const s = pres.addSlide();
  s.background = { color: C.bg };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.8, fill: { color: C.primary } });
  s.addText("코드 관리 전략", {
    x: 0.6, y: 0, w: 9, h: 0.8, fontSize: 24, bold: true, color: "FFFFFF", fontFace: "Calibri", margin: 0
  });

  // Shared card
  s.addShape(pres.shapes.RECTANGLE, { x: 0.4, y: 1.05, w: 4.4, h: 2.5, fill: { color: C.surface }, shadow: makeShadow() });
  s.addShape(pres.shapes.RECTANGLE, { x: 0.4, y: 1.05, w: 4.4, h: 0.06, fill: { color: C.success } });
  s.addText("✅ 공유 (1벌)", { x: 0.6, y: 1.2, w: 4, h: 0.35, fontSize: 16, bold: true, color: C.text, fontFace: "Calibri", margin: 0 });
  s.addText([
    { text: "Code.gs", options: { bold: true, fontSize: 13, color: C.text, fontFace: "Calibri", breakLine: true } },
    { text: "   백엔드 — 수정 없이 그대로 공유", options: { fontSize: 12, color: C.muted, fontFace: "Calibri", breakLine: true, paraSpaceAfter: 6 } },
    { text: "shared_logic.html", options: { bold: true, fontSize: 13, color: C.text, fontFace: "Calibri", breakLine: true } },
    { text: "   데이터 로딩 / 필터 / 정렬 JS", options: { fontSize: 12, color: C.muted, fontFace: "Calibri", breakLine: true, paraSpaceAfter: 6 } },
    { text: "design_tokens.html", options: { bold: true, fontSize: 13, color: C.text, fontFace: "Calibri", breakLine: true } },
    { text: "   CSS 변수 (색상, 폰트, 간격)", options: { fontSize: 12, color: C.muted, fontFace: "Calibri" } }
  ], { x: 0.7, y: 1.65, w: 3.9, h: 1.8 });

  // Separate card
  s.addShape(pres.shapes.RECTANGLE, { x: 5.2, y: 1.05, w: 4.4, h: 2.5, fill: { color: C.surface }, shadow: makeShadow() });
  s.addShape(pres.shapes.RECTANGLE, { x: 5.2, y: 1.05, w: 4.4, h: 0.06, fill: { color: C.warning } });
  s.addText("📂 분리 (2벌)", { x: 5.4, y: 1.2, w: 4, h: 0.35, fontSize: 16, bold: true, color: C.text, fontFace: "Calibri", margin: 0 });
  s.addText([
    { text: "desktop/ 폴더", options: { bold: true, fontSize: 13, color: C.text, fontFace: "Calibri", breakLine: true } },
    { text: "   사이드바 + 테이블 HTML/CSS", options: { fontSize: 12, color: C.muted, fontFace: "Calibri", breakLine: true, paraSpaceAfter: 6 } },
    { text: "mobile/ 폴더", options: { bold: true, fontSize: 13, color: C.text, fontFace: "Calibri", breakLine: true } },
    { text: "   카드리스트 + 하단탭 HTML/CSS", options: { fontSize: 12, color: C.muted, fontFace: "Calibri", breakLine: true, paraSpaceAfter: 6 } },
    { text: "태블릿: mobile/ CSS 미디어쿼리", options: { bold: true, fontSize: 13, color: C.text, fontFace: "Calibri", breakLine: true } },
    { text: "   481~1024px 반응형 적용", options: { fontSize: 12, color: C.muted, fontFace: "Calibri" } }
  ], { x: 5.5, y: 1.65, w: 3.9, h: 1.8 });

  // Routing
  s.addShape(pres.shapes.RECTANGLE, { x: 0.4, y: 3.8, w: 9.2, h: 1.6, fill: { color: C.surface }, shadow: makeShadow() });
  s.addText("🔀 라우팅 분기", { x: 0.7, y: 3.9, w: 4, h: 0.35, fontSize: 16, bold: true, color: C.text, fontFace: "Calibri", margin: 0 });
  s.addText([
    { text: "Code.gs: ", options: { bold: true, fontSize: 12, color: C.text, fontFace: "Calibri" } },
    { text: "?platform=desktop → desktop/admin.html  |  ?platform=mobile → mobile/admin.html", options: { fontSize: 12, color: C.muted, fontFace: "Calibri", breakLine: true, paraSpaceAfter: 4 } },
    { text: "Android WebView: ", options: { bold: true, fontSize: 12, color: C.text, fontFace: "Calibri" } },
    { text: "?view=admin&platform=mobile&auth=token (로그인 스킵)", options: { fontSize: 12, color: C.muted, fontFace: "Calibri", breakLine: true, paraSpaceAfter: 4 } },
    { text: "GAS 배포: ", options: { bold: true, fontSize: 12, color: C.text, fontFace: "Calibri" } },
    { text: "현재 '내 도메인 사용자만' → 모바일에서도 Google 기관 계정 로그인 필요", options: { fontSize: 12, color: C.danger, fontFace: "Calibri" } }
  ], { x: 0.7, y: 4.3, w: 8.6, h: 1.0 });
}

// ─── SLIDE 12: Roadmap ───
{
  const s = pres.addSlide();
  s.background = { color: C.bg };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.8, fill: { color: C.primary } });
  s.addText("구현 로드맵 (7단계)", {
    x: 0.6, y: 0, w: 9, h: 0.8, fontSize: 24, bold: true, color: "FFFFFF", fontFace: "Calibri", margin: 0
  });

  const phases = [
    { n: "1", t: "공통 기반", d: "design_tokens · shared_logic · Code.gs 라우팅", c: C.danger, p: "🔴" },
    { n: "2", t: "데스크탑 레이아웃", d: "사이드바 · 필터 바 압축 · 도구 바 · 페이지네이션", c: C.danger, p: "🔴" },
    { n: "3", t: "모바일 대시보드", d: "상단 바 · 하단 탭 · 카드 리스트 · 풀스크린 상세", c: C.danger, p: "🔴" },
    { n: "4", t: "모바일 부가 페이지", d: "시약 카드 · 학생 그룹 · 점 달력", c: C.warning, p: "🟡" },
    { n: "5", t: "태블릿 반응형", d: "모바일 CSS에 481~1024px 미디어쿼리", c: C.warning, p: "🟡" },
    { n: "6", t: "다크모드 & 접근성", d: "ARIA · 키보드 · 포커스 · prefers-reduced-motion", c: C.success, p: "🟢" },
    { n: "7", t: "Android 연동", d: "로그인 스킵 · Pull-to-refresh 비활성 · 새로고침 버튼", c: C.success, p: "🟢" }
  ];

  phases.forEach((p, i) => {
    const y = 1.05 + i * 0.63;
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.4, y, w: 9.2, h: 0.55, fill: { color: C.surface }, shadow: makeShadow()
    });
    s.addShape(pres.shapes.RECTANGLE, { x: 0.4, y, w: 0.07, h: 0.55, fill: { color: p.c } });
    s.addText(`${p.p} Phase ${p.n}`, {
      x: 0.65, y, w: 1.4, h: 0.55, fontSize: 13, bold: true, color: C.text, fontFace: "Calibri", valign: "middle", margin: 0
    });
    s.addText(p.t, {
      x: 2.1, y, w: 2.2, h: 0.55, fontSize: 13, bold: true, color: C.primary, fontFace: "Calibri", valign: "middle", margin: 0
    });
    s.addText(p.d, {
      x: 4.3, y, w: 5.1, h: 0.55, fontSize: 12, color: C.muted, fontFace: "Calibri", valign: "middle", margin: 0
    });
  });
}

// ─── Save ───
const outPath = "C:/Users/user/Desktop/새 폴더 (4)/mockups/과학실험실_관리자_UI목업.pptx";
pres.writeFile({ fileName: outPath }).then(() => {
  console.log("PPTX created: " + outPath);
}).catch(err => {
  console.error("Error:", err);
});
