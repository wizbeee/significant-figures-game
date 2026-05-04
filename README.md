# 🔬 유효숫자 마스터

고등학교 과학 수업용 **실시간 퀴즈 게임** — 6가지 게임 모드 + 시즌제 + 학습 분석.

> **다른 컴퓨터에서 작업 이어받기**: [HANDOFF.md](./HANDOFF.md) 참고

---

## ✨ 핵심 기능

| 영역 | 내용 |
|---|---|
| **게임 모드 6종** | 개수 세기 · 유효숫자 찾기 · 측정값 읽기 · 덧셈/뺄셈 · 과학적 표기법 변환 · 반올림 |
| **플레이 방식 3종** | 🎯 싱글 · 👥 멀티 (학급협동/조별/개인 — 35명) · ⚔️ 대전 (HP/속도전 — 10명) |
| **시즌제** | 일자·시간 통제 · 점심+저녁 분할 운영 · 자동 5단 랭크 · 챔피언 영구 보관 |
| **학습 시스템** | 🧠 SRS · 📝 오답노트 · 🎯 일일 도전 · 💡 단계별 힌트 · 📖 치트시트 |
| **교사 도구** | CSV 일괄 등록 · 학습 분석 · 진도 grid · 학기말 종합 리포트 · QR 공유 |
| **다중 교실** | 한 URL에서 여러 교사가 각자 교실 운영 |
| **PWA** | 홈화면 추가 · 오프라인 캐시 · iOS/Android 모두 |

---

## 🚀 설치 — 의존성 0 (npm install 불필요)

```bash
git clone https://github.com/wizbeee/significant-figures-game.git
cd significant-figures-game
node server.js
```

요구사항: **Node.js 18 이상** (`node --version`).

브라우저:
- 학생: http://localhost:8093/
- 교사: http://localhost:8093/teacher.html
- 점수판: http://localhost:8093/leaderboard.html

같은 Wi-Fi 학생들은 서버 PC IP로 접속 (예: `http://10.1.x.x:8093/`).

---

## 🌐 Render.com 무료 클라우드 배포 (5분)

1. [Render.com](https://render.com) 가입 → GitHub 로그인
2. 본 저장소 fork → Render에서 **New + → Blueprint** → 저장소 선택 → **Apply**
3. `render.yaml` 자동 감지 → 1분 내 배포 완료
4. 받은 URL (예: `https://sigfig-xxx.onrender.com`) 동료 교사들에게 공유

**무료 플랜**: 15분 무활동 시 슬립 (첫 접속 10~30초), 영구 디스크 1GB, 싱가포르 리전.

---

## 🏫 사용 흐름

### 교사 (한 번만)
1. `/teacher.html` 접속
2. 교실 코드 (예: `김쌤화학`) + 비밀번호 입력 → **로그인 / 교실 만들기**
3. 학생들에게 교실 코드 안내 (또는 🔗 공유 버튼으로 QR 출력)

### 시즌 운영 (선택, 권장)
1. 교사 → 🏆 시즌 탭 → 시즌 정보 입력
2. **활성 시간 윈도우** → 🍱🍽 점심+저녁 / 🏫 수업시간 / + 윈도우 추가 등 선택
3. 🚀 시즌 시작
4. 종료 일시 도달 시 자동 랭크 부여 + 챔피언 발표

> 식사시간 운영 메뉴얼은 [docs/시즌_운영_가이드.md](./docs/시즌_운영_가이드.md) (있는 경우) 참고

### 학생
1. `/` 접속
2. 교실 코드 + 학번 + 이름 입력 → 입장
3. 게임 모드 선택 → 도전!

---

## ⚙️ 환경 변수 (선택)

`.env.example` 참고. 모두 미설정 시 안전한 기본값.

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `8093` | 서버 포트 |
| `HOST` | `0.0.0.0` | 바인딩 주소 |
| `DATA_DIR` | `./data` | 데이터 저장 폴더 |
| `STUDENT_TOKEN_TTL_HOURS` | `24` | 학생 토큰 유효시간 (점심+저녁 단절 운영 시 48 권장) |
| `TEACHER_TOKEN_TTL_HOURS` | `24` | 교사 토큰 |
| `LB_CAP` | `5000` | 글로벌 점수판 상한 |
| `CORS_ORIGIN` | `*` | 화이트리스트 (`https://your-domain.com` 등) |
| `LOG_FILE` | `(none)` | 추가 로그 파일 prefix |

---

## 🏗 데이터 구조

```
data/                    # ⚠️ git 미포함 (.gitignore)
├── classrooms.json      # 교실 정의 (코드/이름/비밀번호 해시/설정)
├── students.json        # { [교실코드]: { [학번]: 학생정보 } }
├── leaderboards.json    # 글로벌 점수판 (단일/멀티/대전)
├── attendance.json      # { [교실코드]: { [날짜]: { [학번]: 출석 } } }
├── seasons.json         # 시즌 데이터 (current + history + leaderboard)
├── tokens.json          # 영속 로그인 토큰
├── wrongs.json          # 학생별 오답 노트
├── srs.json             # SRS 약점 카드
├── presets.json         # 교사 방 설정 프리셋
├── audit.YYYY-MM-DD.log # 보안 감사 로그
└── backups/             # 자동 백업 (시작 1분 후 + 매일 0시, 14개 보존)
```

비밀번호: **PBKDF2 + salt** (sha256 레거시 자동 마이그레이션).
모든 쓰기는 **atomic** (`temp + rename`) + **디바운스**.
**SIGTERM 시 진행 중 게임 자동 finalize**.

---

## 🧪 테스트

```bash
npm test
# 28/28 단위 테스트 (analyze · parseUserNum · hasBadWord)
```

---

## 📚 기술 스택

- **Zero-dependency Node.js 18+** (외부 패키지 0개)
- **파일 기반 JSON** (atomic write + 디바운스 + safe load)
- **HTTP polling** (1.2초) + 영속 토큰
- **순수 HTML/CSS/JS** (빌드 도구 X)
- **PWA** (manifest + service worker)
- **테스트**: Node 내장 `node --test`

---

## 🔗 링크

- **저장소**: https://github.com/wizbeee/significant-figures-game
- **HANDOFF**: 다른 컴퓨터/세션 인계 → [HANDOFF.md](./HANDOFF.md)
- **이슈/PR**: GitHub Issues

---

## 📄 라이선스

MIT
