# 🏫 교육·행정 도구 모음 (`feat/science-lab-admin-v3.2` 브랜치)

이 브랜치는 **여러 독립 프로그램**이 함께 담긴 통합 저장소입니다.
각 프로그램은 자체 폴더 안에서 독립적으로 실행됩니다.

> ℹ️ `main` 브랜치에는 **유효숫자 마스터 게임 (멀티플레이)** 본체가 있습니다.
> 이 브랜치는 관리자/보조 도구, 프로토타입, 시제품들을 모아둔 곳입니다.

---

## 📂 폴더 인덱스

### 🎓 입학 전형 관련

| 폴더 | 프로그램 | 스택 | 실행 |
|---|---|---|---|
| [`고입전형관리/`](./고입전형관리/) | **고입전형 관리 시스템 (자사고)** — 엑셀 업로드, 대시보드, 교차분석(피벗), What-if 시뮬레이터, 모의고사 파서, PPTX 내보내기 | HTML + IndexedDB + SheetJS + Chart.js + pptxgenjs | `npx serve 고입전형관리 -l 5504` |
| [`grade-analyzer/`](./grade-analyzer/) | **신입생 성적 분석 시스템** — 오프라인 단일 HTML, 전형별·모의고사·내신·중학교 분석 | HTML + SheetJS + Chart.js | `index.html` 브라우저 직접 열기 또는 local server |
| [`admission-manager/`](./admission-manager/) | **입학 관리 시스템 (React)** — React 컴포넌트 기반 입학 관리 UI | React + Tailwind | `npm install && npm start` |

### 🧪 과학실험실 관련

| 폴더 | 프로그램 | 스택 |
|---|---|---|
| [`과학실험실 교사 승인 시스템/`](./과학실험실%20교사%20승인%20시스템/) | **교사 승인 워크플로우** (Google Apps Script) — Code.js 백엔드 + index.html 학생 폼 + application_form_mockup.html 목업 + UI 개선 계획서 | GAS + HTML |
| [`과학실험실 사용 신청 관리자 프로그램/`](./과학실험실%20사용%20신청%20관리자%20프로그램/) | **관리자 페이지** — admin_body/head/scripts, chemical_list 등 | GAS + HTML |
| [`과학실험실 사용 신청 학생 조회 프로그램/`](./과학실험실%20사용%20신청%20학생%20조회%20프로그램/) | **학생 조회 페이지** (경량) | GAS + HTML |
| [`science-lab-admin-android/`](./science-lab-admin-android/) | **Android 네이티브 앱** (실험실 관리 모바일) | Kotlin/Java + Gradle |

### 🎮 유효숫자 게임 관련

| 폴더 | 프로그램 | 스택 | 실행 |
|---|---|---|---|
| [`유효숫자 마스터 교사 대시보드/`](./유효숫자%20마스터%20교사%20대시보드/) | **유효숫자 마스터 교사 대시보드 + 멀티플레이 서버** | Node.js + WebSocket (ws) | `cd "유효숫자 마스터 교사 대시보드" && node server.js` |

> 📌 게임 본체(학생용 화면: `home.html`, `room.html`, `teacher.html`, `leaderboard.html`, `common.*`)는 이 브랜치가 아닌 `main` 브랜치에 있습니다.

### 🎨 디자인·시제품

| 폴더 | 프로그램 | 비고 |
|---|---|---|
| [`mockups/`](./mockups/) | **UI 디자인 목업 모음** — desktop_*, application_form_mockup, create_pptx.js | 정적 HTML |
| [`personal-color-analyzer/`](./personal-color-analyzer/) | **퍼스널 컬러 분석기** (웹앱) | Node.js + HTML (Procfile 배포 지원) |
| [`smart-presentation/`](./smart-presentation/) | **스마트 프레젠테이션 도구** | React + Tailwind |

---

## 🚀 빠른 시작

### 고입전형 관리 시스템 (가장 활발히 개발 중)
```bash
npx serve 고입전형관리 -l 5504
# → http://localhost:5504
```
키보드 단축키: `?` (도움말), `Ctrl+Z` (되돌리기), `1-9` (탭 이동), `Ctrl+.` (다크모드)

### 유효숫자 마스터 서버
```bash
cd "유효숫자 마스터 교사 대시보드"
npm install
node server.js
```

### Google Apps Script (과학실험실 승인)
```bash
cd "과학실험실 교사 승인 시스템"
clasp push   # .clasp.json 기반 업로드
```

---

## 📦 데이터 보관 정책

- 모든 웹앱 프로그램(고입전형관리, grade-analyzer)은 **브라우저 IndexedDB에 로컬 저장**
- 인터넷 전송 없음 (완전 오프라인 동작)
- 컴퓨터 간 이동은 각 프로그램의 **JSON 백업/복원** 기능 사용

---

## 🗂 브랜치 구조 요약

```
main                         → 유효숫자 마스터 게임 (학생용 멀티플레이)
feat/science-lab-admin-v3.2  → 이 브랜치 (관리자 도구 + 프로토타입 통합)
```

향후 각 프로그램이 성숙해지면 개별 저장소로 분리 가능합니다.
