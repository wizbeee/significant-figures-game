# 🔄 다른 컴퓨터에서 이어서 작업하기 (HANDOFF)

> 이 문서는 새 컴퓨터/새 세션에서 이 프로젝트 작업을 이어받을 때 가장 먼저 읽는 안내서입니다.

---

## ⚡ TL;DR — 3분 안에 시작

```bash
# 1. 클론
git clone https://github.com/wizbeee/significant-figures-game.git
cd significant-figures-game

# 2. Node 18+ 설치 확인
node --version  # v18.0 이상 필요

# 3. 실행 (의존성 0 — npm install 불필요!)
node server.js
```

브라우저: **http://localhost:8093/**

---

## 📋 사전 준비물

| 필수 | 항목 | 확인 방법 |
|:-:|---|---|
| ✅ | **Node.js 18+** | `node --version` → v18.x 이상 |
| ✅ | **Git** | `git --version` |
| ✅ | **GitHub 계정 액세스** (`wizbeee/significant-figures-game` 푸시 권한) | `gh auth status` 또는 `git push` 시도 |
| 선택 | **gh CLI** (PR 만들기 편함) | `gh --version` |
| 선택 | **VS Code** 또는 선호 에디터 | |

> 💡 **npm install 불필요** — zero-dependency 설계. 외부 패키지 0개.

---

## 📂 클론 후 폴더 구조

```
significant-figures-game/
├── server.js              # 메인 서버 (~3,000줄, 모든 백엔드)
├── home.html              # 학생 로비
├── room.html              # 게임 룸 (모드 1~6)
├── teacher.html           # 교사 카운터 (시즌·학생관리·분석)
├── leaderboard.html       # 점수판
├── apps-script-guide.html # Google Sheets 연동 가이드
├── index.html             # (레거시 단일 HTML 게임 — 사용 X)
├── common.js              # 공통 유틸 (escape·toast·modal·QR·TTS·SRS)
├── common.css             # 공통 스타일 (다크/라이트/고대비/난독증)
├── sw.js                  # PWA service worker
├── manifest.webmanifest   # PWA 매니페스트
├── icon.svg               # 앱 아이콘
├── package.json           # node 18+ 명시, scripts: start/test
├── render.yaml            # Render.com 1-click 배포
├── README.md              # 사용자용 안내
├── HANDOFF.md             # 이 문서
├── test/                  # 단위 테스트 (28건)
│   ├── analyze.test.js
│   ├── parseUserNum.test.js
│   └── hasBadWord.test.js
└── data/                  # ⚠️ git 미포함 (.gitignore) — 첫 실행 시 자동 생성
    ├── classrooms.json    # 교실 정의
    ├── students.json      # 학생별 누적 통계
    ├── leaderboards.json  # 글로벌 점수판
    ├── attendance.json    # 출결
    ├── seasons.json       # 시즌 데이터
    ├── tokens.json        # 영속 로그인 토큰
    ├── wrongs.json        # 학생별 오답 노트
    ├── srs.json           # SRS 약점 카드
    ├── presets.json       # 교사 방 프리셋
    └── audit.YYYY-MM-DD.log  # 보안 감사 로그
```

---

## 🚀 빠른 실행 명령

```bash
# 개발 (서버 시작)
node server.js
# 또는
npm start

# 단위 테스트 (28건)
npm test

# 환경변수 적용해서 실행 (예: 토큰 24→48시간)
STUDENT_TOKEN_TTL_HOURS=48 node server.js
```

---

## 🔄 다른 컴퓨터로 옮길 때 데이터 함께 가져오기 (선택)

`data/` 폴더는 git에 포함되지 않습니다 (개인 데이터·비밀번호 해시 보호 목적).
실제 운영 데이터를 다른 PC로 옮기려면:

### 옵션 A — 교사 페이지에서 백업 (권장)
1. 기존 PC에서 교사 로그인 → **데이터/시트 탭** → **🗄 전체 백업 (JSON)**
2. 새 PC에서 서버 실행 → 같은 교실 코드/비번으로 로그인 → **📤 백업 복원** → JSON 업로드

### 옵션 B — `data/` 폴더 직접 복사
```bash
# 기존 PC
cd significant-figures-game
tar czf sigfig-data.tar.gz data/

# 파일 전송 (USB/Drive/SCP 등)

# 새 PC
cd significant-figures-game
tar xzf sigfig-data.tar.gz   # data/ 폴더 복원
node server.js
```

> ⚠️ **option B는 비밀번호 해시·토큰 그대로 옮겨짐** — 같은 비번으로 로그인 가능

---

## 🌐 GitHub 작업 흐름

### 작업 시작 시
```bash
git pull origin main          # 최신 main 가져오기
git checkout -b feat/내작업    # 작업 브랜치 만들기 (권장)
```

### 작업 중 자주 커밋
```bash
git add .
git commit -m "feat: 설명"
```

### 작업 완료 후
```bash
git push -u origin feat/내작업

# main에 머지
git checkout main
git merge --ff-only feat/내작업
git push origin main
```

### Render.com 자동 재배포
- main 브랜치에 push 되면 Render가 자동 감지 → 1~2분 내 재배포
- 다른 브랜치는 영향 없음

---

## 📜 최근 커밋 흐름 (현재 상태 이해용)

```
5ef8c78 fix(season): 점심/저녁 분할 운영 지원 — 6개 이슈 해결
91b7953 fix(season): 운영 검토 — 5개 버그 수정 + 안전장치 추가
3dfc460 feat(comprehensive): Wave 8 — 리포트·데이터 관리
151f455 feat(comprehensive): Wave 7 — 교사 워크플로우 강화
bc6e7f5 feat(comprehensive): Wave 6 — 코드 품질 (단위 테스트 도입)
69499c1 feat(comprehensive): Wave 5 — 접근성
6aaa662 feat(comprehensive): Wave 4 — 게임 재미·동기부여
d1345d4 feat(comprehensive): Wave 3 — 학습 효과 향상
436210d feat(comprehensive): Wave 1+2 — 보안·성능·운영 강화
69dd88f feat(season): 시즌제 도입 — 일자/시간 통제 + 자동 랭크 부여
78f0369 feat: 78개 개선 일괄 적용 — 모드 5/6 추가, UX/A11y/안정성 대폭 강화
```

---

## 🎯 현재 구현된 기능 (전체 요약)

### 게임 (6개 모드)
1. 🔢 유효숫자 개수 세기
2. 🎯 유효숫자 찾기
3. 📏 측정값 읽기 (자·실린더·온도계·비커·저울·플라스크 6종)
4. ➕ 덧셈/뺄셈 (소수자릿수 규칙)
5. 🔬 과학적 표기법 변환 (1500 ↔ 1.5×10³)
6. 🎯 유효숫자 반올림 (5.367 → 3개로 = 5.37)

### 플레이 방식
- 🎯 **싱글** (문제수/시간제한)
- 👥 **멀티** (학급협동/조별/개인별 — 최대 35명)
- ⚔️ **대전** (HP 서바이벌/속도전 — 최대 10명)

### 학습 시스템
- 🧠 **SRS** (Leitner 7박스 간격 반복)
- 📝 **오답노트** (학생별 최근 100개)
- 🎯 **일일 도전** (매일 5문제 + 학급 랭킹)
- 💡 **단계별 힌트** (점수 -30%)
- 📖 **치트시트** (게임 중 빠른 참고)

### 시즌제
- 일자·시간 통제 (시작/종료/요일/**다중 시간 윈도우**)
- 점심+저녁 분할 운영 지원 (`activeWindows` 배열)
- 즉시 일시정지 + 예약 정지
- 자동 5단 랭크 (마스터/다이아/골드/실버/브론즈)
- 챔피언 영구 보관 + 학생 시즌 뱃지 누적

### 교사 도구
- 학생 CSV 일괄 등록·일괄 차단/삭제
- 학습 분석 대시보드 (모드별·난이도별·시간대별)
- 자주 틀리는 문제 TOP 30
- 출결 월별 차트
- 학기말 종합 PDF 데이터 (생기부 첨부용)
- 이전 학기 데이터 import (학년 누적)
- 학생별 진도 grid (실시간)
- 방 일괄 승인/종료/복제, 방 mid-game 수정·일시정지
- ⭐ 자주 쓰는 설정 프리셋
- 🔗 교실 QR 코드 공유

### 안정성 / 보안
- PBKDF2 + salt 비밀번호
- 토큰 영속화 (서버 재시작해도 로그인 유지, 24시간 기본)
- Rate limit (brute-force 방어)
- CSP + 보안 헤더 7종
- 자동 백업 (시작 1분 후 + 매일 0시, 14개 보존)
- atomic write + 디바운스 + corrupt JSON 자동 복구
- Graceful shutdown (진행 중 게임 자동 finalize)
- gzip/brotli 응답 압축
- Audit log 일별 로테이션 + 90일 자동 청소

### PWA
- 홈화면 추가 (모바일/iPad)
- 정적 캐시 + API 우선 네트워크
- iOS 메타 + theme-color

### 접근성
- 다크/라이트/고대비 3단 테마
- 난독증 친화 폰트 토글
- TTS (시각장애 학생)
- aria-live 점수 알림
- 색맹 안전 (색상 + 심볼 병행)

---

## ⚙️ 환경변수 (배포 시 선택)

`.env.example` 참고. 모두 미설정 시 안전한 기본값 적용.

```bash
PORT=8093                          # 서버 포트
HOST=0.0.0.0                       # 바인딩 주소
DATA_DIR=./data                    # 데이터 폴더
STUDENT_TOKEN_TTL_HOURS=24         # 학생 토큰 유효시간 (점심+저녁 단절운영 시 48 권장)
TEACHER_TOKEN_TTL_HOURS=24
TEACHER_PASSWORD=3000              # 레거시 default 교실 초기 비번 (마이그레이션용)
LB_CAP=5000                        # 글로벌 점수판 상한 (기본 5000)
CORS_ORIGIN=*                      # CORS 화이트리스트 (*는 모든 도메인)
LOG_FILE=                          # 추가 로그 파일 prefix (예: ./logs/sigfig)
```

---

## 🏃 운영 시나리오별 실행 방법

### 1. 학교 내부망 (PC 1대로 한 반)
```bash
node server.js
# 학생: 같은 Wi-Fi 학생들이 PC IP로 접속
#   예) http://192.168.0.27:8093/
```

### 2. 클라우드 (Render.com 무료)
1. GitHub fork 또는 직접 푸시
2. Render.com → New + → Blueprint → 본 저장소 선택
3. `render.yaml` 자동 감지 → 5분 내 배포
4. 받은 URL 학생들에게 안내

### 3. 점심/저녁만 운영 (식사시간 시즌제)
```bash
# 토큰 길게 (점심→저녁 사이 재로그인 X)
STUDENT_TOKEN_TTL_HOURS=48 node server.js
```
교사 페이지 → 🏆 시즌 → **🍱🍽 점심+저녁 둘 다** 버튼

---

## 🧪 변경 시 검증 절차

1. **단위 테스트**: `npm test` → 28/28 통과 확인
2. **구문 검사**: 자동 (Node 시작 시 — 오류면 즉시 종료)
3. **로컬 스모크**: `node server.js` 후 http://localhost:8093 접속
4. **시즌 운영 검증**: 교사 로그인 → 시즌 시작 → 학생 로그인 → 게임 → 점수 누적 확인

---

## 🆘 트러블슈팅

| 증상 | 원인 / 해결 |
|---|---|
| `node server.js` 시 port already in use | 기존 서버 종료 또는 `PORT=8094 node server.js` |
| 비밀번호 오류 (이전 데이터에서) | data/classrooms.json 보존 확인. 첫 로그인 시 PBKDF2 자동 마이그레이션 |
| Render 배포 슬립 (15분 무활동) | 첫 요청 30초 대기. 학생 5분 polling 자동 / 교사 미리 접속해 warm-up |
| 학생 토큰 자주 만료 | `STUDENT_TOKEN_TTL_HOURS=48` 설정 |
| `data/` 폴더 권한 오류 | 폴더 쓰기 권한 확인 (`chmod 755 data/`) |
| 시즌이 자동 종료 안 됨 | 30초 tick + 부팅 시 즉시 1회 — 정상. 30초 이상 지나도 안 되면 서버 로그 확인 |

---

## 🔗 외부 자원

- **GitHub**: https://github.com/wizbeee/significant-figures-game
- **Public main 브랜치 HEAD**: `5ef8c78` (2026-05-04)
- **이슈/PR**: GitHub Issues 사용

---

## 💡 다음 작업 후보 (우선순위 정리)

운영 중 발견되는 이슈 외에, 향후 개선 가능 항목:

1. **WebSocket 도입** (현재 1.2s polling) — 30+명 동시 접속 부하 1/10
2. **SQLite** (현재 JSON) — 학기 누적 한계 해소, 동시쓰기 안전
3. **다중 교사 협업** — 한 교실에 공동 교사
4. **모바일 네이티브 앱** (현재 PWA만)
5. **i18n 영어** — 외국인 학생/교환학생용

자세한 전체 개선안은 [git log] 참고 또는 새 세션에서 "남은 개선 검토" 요청.

---

## 📝 세션 인계 (Claude Code 등)

새 세션 시작 시 이 문서를 첫 번째로 읽으면 빠르게 컨텍스트 파악 가능. 다음 정보 우선 전달:

```
프로젝트: 유효숫자 마스터 (Public)
- GitHub: wizbeee/significant-figures-game
- 폴더: sigfig-game/
- HEAD: main (5ef8c78)
- 최근 작업: 시즌제 식사시간 분할 운영 (점심+저녁) 지원
- 현재 상태: 운영 안전 검증 완료
- 단위 테스트: 28/28 통과
```

새 작업 시작은 보통:
- 기존 기능 개선 → `feat/<이름>` 또는 `fix/<이름>` 브랜치
- 시즌 새로 시작 → 교사 페이지 직접 사용 (코드 변경 X)
- 운영 점검 → 스모크 테스트만

---

**작성**: 2026-05-05 · **작성자**: 자동 인계 시스템 · **다음 갱신**: 메이저 변경 시
