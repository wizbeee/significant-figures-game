# 인수인계 — 유효숫자 마스터 개선 (2026-09-03)

> 이어서 작업하려면 이 파일을 **먼저 끝까지** 읽으세요.

## 🔴 최우선 — 이 브랜치는 4개월 묵은 base 위에 세워졌습니다

**작업을 이어가기 전에 이것부터 판단하세요. 그냥 이어가면 안 됩니다.**

이 PC의 로컬 `main`(`5a2489a`, 2026-04-17)은 **`origin/main`보다 커밋 20개 뒤처져** 있었습니다.
`origin/main`은 `6beb3cd`(2026-05-10)이고, 그 사이에 다른 PC/세션에서 큰 작업이 있었습니다:

```
6beb3cd refactor(ui): 단순화된 시스템 — UI 잔재 일괄 정리 + 종합 점수판 본인 강조
45ad963 feat(teacher): 교사 로그인도 단순화 — 비밀번호 3000만 입력
f638a94 feat: 교실코드 제거 + 자동승인 + 종합점수판 + LB 리셋
69dd88f feat(season): 시즌제 도입 — 일자/시간 통제 + 자동 랭크 부여
78f0369 feat: 78개 개선 일괄 적용 — 모드 5/6 추가, UX/A11y/안정성 대폭 강화
436210d~3dfc460  Wave 1~8 (보안·성능·학습효과·재미·접근성·코드품질·교사워크플로우·리포트)
  ... 외 8개
```

**2026-09-03 세션은 이 사실을 모른 채 `5a2489a` 위에서 작업했습니다.** 세션 시작 시
`git fetch`를 하지 않은 것이 원인입니다. (다른 프로젝트에는 "작업 전 `git fetch` 필수"가
이미 교훈으로 기록돼 있었는데 여기 적용하지 못했습니다.)

### 중복 여부 실측 (origin/main 기준)

| 이번 작업 | origin/main에 이미 있나 | 판단 |
|---|---|---|
| 라이트 테마 전환 | ❌ 없음 (`\|\| 'dark'` 그대로) | **그대로 유효** |
| 3단계 힌트 | ❌ 없음 (`HINT_MAX` 0건) | **그대로 유효** |
| 오답은행 복습 방 | ❌ 없음 (`wrongBank` 0건) | **그대로 유효** |
| 저장 디바운스 | ❌ 없음 (`writeFileSync` 5곳) | **그대로 유효** |
| 명단 등록 학생만 입장 | ⚠ `classroomCode`는 115곳 남아 있으나 `f638a94`에서 교실코드 UI를 단순화함 | **재검토 필요** |
| `test.js` (루트) | ⚠ `test/analyze.test.js` 등 3개가 이미 있음 | **구조 통합 필요** |

**즉 기능은 대부분 중복이 아닙니다. 문제는 base입니다.**
`server.js`가 origin/main 3,796줄 vs 이 브랜치 3,003줄로 갈라져 있어 **병합이 간단하지 않습니다.**

### 재개 시 선택지

1. **(권장) origin/main 위에 다시 얹기** — `origin/main`에서 새 브랜치를 따고, 이 브랜치의
   6개 커밋을 하나씩 cherry-pick 하며 새 구조에 맞게 수정. 커밋이 기능 단위로 잘 쪼개져 있어
   하나씩 옮기기 좋습니다. 충돌은 `server.js`에 집중될 것입니다.
2. 이 브랜치를 버리고, 위 표의 "그대로 유효" 항목만 새 base에서 다시 구현.
3. `git merge origin/main` — 충돌 규모가 커서 권장하지 않습니다.

**어느 쪽이든 먼저 `git fetch origin && git log --oneline origin/main -25`로 새 main이 무엇을
바꿔놨는지 읽고 시작하세요.** 특히 `f638a94`(교실코드 제거)와 `78f0369`(모드 5/6 추가)가
이번 작업과 겹치는 영역입니다.

---

## ⚠ 그 밖에 먼저 확인할 것

1. 브랜치 `feat/learning-ux`는 **GitHub에 푸시 완료**입니다(`0212f32`).
   로컬 `main`의 `5195af1`도 이 브랜치의 조상이라 원격에 함께 올라가 있어 유실 위험은 없습니다.
   단 원격 `main` 브랜치 ref는 건드리지 않았습니다.
2. 작업을 재개하기 전에 `git status`로 **미완성 변경이 남아 있는지** 확인하세요.
   2026-09-03 세션 종료 시점에 ④ 자동 난이도 작업이 진행 중이었고, 에이전트를 중단시켰습니다.
   `home.html` `leaderboard.html` `room.html` `server.js` `teacher.html`이 수정된 상태입니다.
   **위 base 문제 때문에 이 변경분은 버리는 편이 낫습니다** (`git checkout -- .`).

---

## 상태 요약

### 커밋 (전부 로컬, 미푸시)

**`main`**
| 해시 | 내용 |
|---|---|
| `5195af1` | 교사 관리 강화 + 학생 성장 시스템(레벨·퀘스트·오답은행·힌트) — 세션 시작 시 미커밋 상태로 방치돼 있던 1,834줄을 정리해 커밋한 것 |

**`feat/learning-ux`** (main에서 분기)
| 해시 | 내용 | 검증 |
|---|---|---|
| `a9c7d62` | perf(save): 파일 저장 디바운스 + 종료 시 flush | ✅ 실서버 |
| `fa249ee` | feat(auth): 명단 등록 학생만 입장 토글 | ✅ 실서버 |
| `dd241ea` | feat(hint): 3단계 힌트 + 전체 모드 힌트 UI | 에이전트 자체 검증 |
| `e93eb09` | feat(review): 종료 화면 오답 해설 재열람 | 에이전트 자체 검증 |
| `c3668bc` | style: 기본 테마를 라이트로 전환 | ✅ 브라우저 |
| `debe864` | feat(revise): 오답은행 복습 방 | 에이전트 자체 검증 |

`✅ 실서버`/`✅ 브라우저` = 메인 세션이 직접 서버를 띄우거나 브라우저로 재확인함.
나머지는 구현 에이전트의 보고에만 근거하며 **독립 검증 미완료**입니다.

### 남은 작업

| 순서 | 항목 | 상태 |
|---|---|---|
| 1 | **④ 싱글 전용 자동 난이도** | 🔴 **미완 — 중단된 지점** |
| 2 | #6 폴링 리비전 최적화 | 계획 있음, 미착수 |
| 3 | 학습 자료(측정과 불확정도) 개선 | 계획 수립 중이었음, 미착수 |

---

## 1. ④ 자동 난이도 — 중단 지점

세션 종료 시 `server.js`가 수정된 상태였습니다. **완성본이 아닐 가능성이 높습니다.**

```bash
git diff server.js
```

로 내용을 보고 판단하세요. 어중간하면 버리고 다시 하는 편이 빠릅니다:

```bash
git checkout -- server.js
```

**목표**: 싱글 방에서 "자동 난이도"를 켜면 3연속 정답 시 한 단계 상향, 2연속 오답(시간 초과 포함) 시 하향.

**핵심 설계** — 문제 전체를 미리 생성하는 구조(`room.questions`, `total`, 종료 조건, 시간제 확장)를 유지한 채 **다음 문제 슬롯만 갈아끼웁니다.** `questions.length`는 절대 바뀌면 안 됩니다(점수판 항목·overview 진행표시·종료조건이 모두 참조).

- `createRoom()`: `config.adaptive = (type === 'single') && !!config.adaptive` — **멀티·대전은 원천 차단**(공정성)
- `generateQuestions(gm, diff, n, addSubMode, recent = new Set())` — 기본값을 둬 기존 호출 무영향
- `startRoom()`: `room.recentKeys = new Set()`. `config.adaptive && !room.reviseMode`면 `room.adaptive = { level, up:0, down:0, lastChange:null }` (easy 0 / medium·mixed 1 / hard 2)
- `nextQuestion()`: `room.qIndex++` 직전에 `p.lastAnswer.ok`로 카운터 갱신 → 레벨 변경 → `room.questions[room.qIndex+1]` 교체. 시간제 확장 분기에도 `recentKeys` 전달.
  **`room.adaptive`가 없으면 한 줄도 실행되지 않게 가드** (모든 비멀티 방의 공통 경로임)
- `roomView()`: `view.adaptive = { difficulty, changed }`
- `finalizeRoom()` 싱글 `pushLB`에 `adaptive: true`, `finalDifficulty` 추가. **`difficulty`는 시작 난이도 그대로** (leaderboard.html 필터가 이 값을 씀)
- `home.html`/`teacher.html`: 싱글일 때만 보이는 체크박스. 교사 프리셋 저장·복원 포함
- `room.html`: 헤더 "난이도: 보통(자동)" 배지, 변경 시 안내

**검증 필수 항목**: 멀티·대전 폼에 체크박스가 안 보이고, DevTools로 `adaptive:true`를 강제 POST해도 `/api/state`의 `config.adaptive`가 `false`일 것. 오답 복습 방에서는 안 켜질 것.

커밋 메시지: `feat(single): 자동 난이도`

---

## 2. #6 폴링 리비전 최적화 (미착수)

**의도적으로 맨 마지막에 배치했습니다.** 세 화면의 폴링을 모두 건드리는데 학생·교사 체감 이득은 0(응답 크기만 감소)이라, 문제가 생기면 이것만 되돌릴 수 있게 독립 커밋으로 두려는 것입니다.

현재 부하: room 1.2초 / home 3초에 3요청 / teacher 1.5초 → 30명이면 방 하나에 초당 약 25요청.

- `respondRev(res, query, view, volatileKeys)` — view를 sha1 해시해 `query.rev`와 같으면 축약 응답
- **해시 제외 키를 정확히**: `/api/state`는 `serverNow`·`timedRemaining`, overview는 `lastSeen`(학생 폴링마다 갱신됨). `notices`와 `online`은 **포함**해야 함
- `/api/leaderboard`에 `limit` 추가 — home은 상위 10개만 쓰는데 현재 **최대 500건 전체**를 받음
- 클라이언트: room은 `unchanged`면 타이머만 갱신. **home(검색 필터)과 teacher(대기시간 표시·펼치기)는 캐시로 재렌더해야 함** — 단순 return하면 UI가 멈춤

---

## 3. 학습 자료 개선 (미착수)

**대상**: `C:\Users\danie\Desktop\수업_활동자료\인터렉티브 학습 자료(유효숫자와 불확정도-베타버전).html`
단일 HTML 1,419줄, 백엔드·의존성·git 없음. **수정 전 백업 사본 필수.**

### 발주자 확정 결정 3가지

**🔴 A. 1번 섹션 유효숫자 오류 — 실제 재현 확인함**
분석저울 버튼이 `data-precision="0.001"`이라 화면에 `24.678`(유효숫자 5개)이 뜨는데 해설은 `"6개 (2, 4, 6, 7, 8, 3)"`를 출력. 목록의 `3`은 화면에 없는 숫자.
→ **결정: 분석저울을 실제 사양 `0.0001 g`으로 변경 + `decimals` 상한을 3에서 4로 확장** (상한 때문에 버튼만 고치면 여전히 24.678로 표시됨). 버튼의 `<small>0.001 g 단위</small>` 라벨도 함께 수정.

**🟠 B. 9번 동전 밀도 데이터가 물리적으로 불가능**
`m=8.980 g`, `V=12.95 mL` → `0.693 g/mL` = **물보다 가벼운 금속**. 자료 스스로 "실제 약 8.7 g/mL"라 적어 12배 차이를 노출.
계산 절차·산술은 검산 결과 **전부 정확**. 문제는 입력 수치.
→ **결정: 결과가 8.7 g/mL 근처로 나오도록 수치 수정.** 부피를 실제 스케일(1 mL 안팎)로 하면 상대불확정도가 ~10%로 커지는데, 이는 버그가 아니라 7번 섹션(측정 기구 고르기)과 연결되는 **교육적 이득**. 5단계 재계산 결과를 숫자로 검토할 것.

**C~F (같이 처리)**
- 진행 상황 저장 없음(`localStorage` 0회). `showComplete()`가 컨테이너를 `innerHTML`로 교체해 복습 불가
- 점수 집계가 섹션 2·6만. `renderQuiz()`(4·5)와 `renderToolQuiz()`(7)는 정오 판정만 하고 점수 없음. 전체 요약 화면 없음
- 문제 고정·순서 고정 → 셔플 + 문항 보강
- 구글 폰트 CDN 3종 의존 → 오프라인에서 디자인 붕괴. 임베딩은 파일 크기(현재 63KB) 대비 검토 필요

**건드리지 말 것**: 모바일 대응(375px 가로스크롤 0, 양호), 오답 해설 출력, 짝수 맞춤 반올림(문항 4개 검산 정확), 따뜻한 종이색 팔레트(`--bg: #FBF6E9`) 및 손글씨 톤.

**제약**: 단일 HTML 유지, 오프라인 동작, 한국어 "~해요" 체, 9섹션 구조 불변, 접근성은 범위 밖.

---

## 범위 밖 발견 (미처리, 기록만)

| 심각도 | 내용 |
|---|---|
| 🔴 | **측정값 읽기 모드는 정답이 클라이언트에 노출됨.** `viewQuestion()` gm3 분기(`server.js:818` 부근)가 `hide` 여부와 무관하게 `meas` 전체(`dv`·`sf` = 정답)를 전송. 캔버스로 기구를 그리려면 `val`이 필요해 생긴 기존 설계지만, 개발자도구를 열면 답이 보임. **평가에 쓴다면 별도 과제로 처리 필요** |
| 🟠 | **SIGTERM 실동작 미검증.** Windows에 진짜 시그널이 없어 재현 불가. 핸들러는 함수 경로로만 확인됨. Render는 Linux라 코드상 동작하는 게 맞지만 **배포 전 실측 필요** |
| 🟡 | 결과 화면 "로비로" 버튼이 `/api/room/leave`를 호출하지 않아 로비가 다시 방으로 되돌림 |
| 🟡 | `home.html` `login()`이 `login-err`를 초기화하지 않아 이전 에러 문구가 남음 (함수 첫 줄 한 줄이면 해결) |
| 🟡 | `index.html` 715줄이 **고아 페이지** — `/`는 home.html을 서빙하고 index.html로 가는 링크가 어디에도 없음. 완전 오프라인 구버전이고 `analyze()`가 중복 구현, 게임 모드 4 없음, 라이트 테마 미적용. 삭제 또는 정식 편입 필요 |
| 🟡 | `/api/teacher/overview`의 `students`는 온라인 세션 목록이라 DB 학생 수와 다름 (`onlineStudents`가 적절) |
| 🟡 | `registerOrTouchStudent`의 출결 "오늘 첫 출석" 판정이 `a.firstSeen === a.lastSeen` — 같은 ms에 두 번 호출되면 오작동할 수 있는 취약한 조건 |

---

## 작업 시 주의 지점

1. **멀티는 플레이어별 스트림.** `multiTickRoom()`이 `p.pQuestions/p.pIdx/p.pPhase`로 개별 진행. 인덱스는 `isMulti ? p.pIdx : room.qIndex`. `revealAnswer()`는 멀티에서 호출되지 않음
2. **`viewQuestion(q, hide)`의 hide 분기에 새 필드 추가 금지**
3. **`wrongBank`의 `q`는 내부 객체가 아니라 뷰.** gm4 뷰에는 `judgeAddSub()`가 쓰는 `value`가 없어 그대로 재출제하면 전부 오답 처리됨 → `rehydrateQuestion()` 필수
4. **교사 "복제" 버튼이 `room.config` 전체를 재전송.** 그래서 `reviseMode`는 config가 아닌 **room 루트 필드**이고 `createRoom`이 body의 해당 키를 무시함
5. **`finalizeRoom`의 `submittedToLB` 플래그**는 `pushLB`를 생략해도 반드시 세울 것 (중복 처리 방지)
6. `ensureProfileShape`/`ensureStatsShape`는 최상위 키만 채움. 프로필에 새 키를 넣으면 `emptyProfile()`에 기본값 등록 필수. 학생 레코드 루트는 보정 함수가 없으니 읽는 쪽에서 `!!` 처리
7. `common.js`의 `api()`는 경로가 `/api/teacher`로 시작할 때만 교사 토큰을 붙임 → 새 교사 엔드포인트는 반드시 이 프리픽스
8. **테마**: `:root`가 라이트 기본, 다크는 `body.theme-dark`. `common.js`가 body 끝에서 로드되므로 CSS 기본값을 뒤집지 않으면 다크 플래시가 생김. `.btn`이 `color:#fff` 고정이라 밝은 배경 버튼은 색을 따로 지정해야 함(`.btn-ghost`가 이 문제로 대비 1.23:1이었음)

## 테스트

```bash
node test.js
```

의존성 없는 러너. 현재 `normName` 8케이스. `server.js`는 `require.main === module`로 listen을 감싸고 파일 끝에서 `module.exports`로 함수를 내보냅니다.

**검증용 서버는 반드시 별도 데이터 디렉터리로 띄우세요** (운영 데이터 보호):

```bash
DATA_DIR=/경로/scratch PORT=8211 node server.js
```
