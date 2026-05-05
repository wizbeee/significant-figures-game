# 🔄 다음 세션 인계 — 유효숫자 마스터

> 이 문서는 **새 대화창에서 이어받을 때** 가장 먼저 읽는 단기 인계서입니다.
> 전체 프로젝트 가이드는 [HANDOFF.md](./HANDOFF.md) 참고.

**작성**: 2026-05-05 · **이전 세션 종료 사유**: 컨텍스트 한계

---

## 📍 현재 상태 (2026-05-05 기준)

- **메인 브랜치 HEAD**: `1c98e7b`
- **로컬 폴더**: `C:\Users\danie\Desktop\클로드 코드 관련\sigfig-game\`
- **GitHub**: https://github.com/wizbeee/significant-figures-game (Public)
- **단위 테스트**: 28/28 통과
- **시즌제**: 점심+저녁 다중 시간 윈도우 지원 완료 (`activeWindows` 배열)
- **운영 환경**: 미정 — 학교 노트북 + Google Drive 동기화 방식 채택 (이전 세션 결론)

---

## 🎯 사용자 운영 계획 (확정)

### 운영 환경
- **학교 노트북에 `node server.js`** 실행 (서버 PC)
- **Google Drive for Desktop** 으로 `data/` 자동 클라우드 동기화
- 학생들은 **학교 와이파이 IP** 로 접속 (예: `http://10.1.x.x:8093/`)
- 점심·저녁 시간 (각 1~2시간)에만 노트북 켜고 운영
- 노트북 닫고 떠날 때 `Ctrl+C` 로 정상 종료

### 시즌 운영 일정
- **다음 주 (5/12~5/18)**: 프리시즌 1주
- **그 다음 (5/19~6/8)**: 정규 시즌 1 (3주)
- **이후**: 정규 시즌 2~3주씩 반복
- 활성 시간대: **점심 12:30~13:30 + 저녁 18:30~19:30** (둘 다 활성)
- 활성 요일: 월~금

### 백업 정책
- **매주 백업 X** — 사용자가 명시적으로 거부
- Drive 자동 동기화 + 일별 자동 백업(14개) + Drive 30일 버전 히스토리로 충분
- 학기 끝에 한 번만 수동 백업 (선택)

---

## ❌ 검토했으나 제외한 옵션 (기억해두면 좋음)

| 옵션 | 제외 사유 |
|---|---|
| Render Free | 영구 디스크 미지원 (확인됨 — `services[0] disks are not supported for free tier services`) |
| Render Starter $7/월 | 사용자 무료 선호 |
| Fly.io | 2024년 무료 정책 폐지 (확인됨 — "no longer offers plans to new customers") |
| Railway | 무료 trial $5만 (이후 유료) |
| OneDrive | 사용자가 Google Drive 선호 |

---

## 🎬 다음 액션 (사용자 대기 중일 것)

### 가능성 1 — 학교 노트북 셋업 도움 요청
- Node.js 설치, Git 설치, Google Drive for Desktop 설치
- `G:\내 드라이브\` 안에 git clone
- `node server.js` 실행 + `ipconfig` IP 확인
- 첫 시즌 (프리시즌 5/12~5/18) 시작 도움

### 가능성 2 — 운영 중 발생한 이슈
- 학생 접속 안 됨, 시즌 설정 문제 등
- 이슈 듣고 디버그

### 가능성 3 — 추가 기능 개선 요청
- 운영 중 발견한 부족한 점 추가 구현

---

## 📋 새 세션 시작 시 빠른 참고

### 가장 중요한 사실
1. ✅ **시즌제 + 다중 시간 윈도우 (점심+저녁) 완전 작동** — 검증 끝남
2. ✅ **그레이스풀 셧다운** — Ctrl+C 시 진행 중 게임 finalize 후 저장
3. ✅ **토큰 24시간 기본** (점심→저녁 단절 운영 안전)
4. ✅ **자동 일별 백업 14개 보존** + atomic write
5. ✅ **모든 fix 적용 완료** — 운영 안전 검증 6/6 통과

### 핵심 파일
- `server.js` (~3,300줄) — 모든 백엔드
- `home.html` / `room.html` / `teacher.html` / `leaderboard.html` — 4개 화면
- `common.js` / `common.css` — 공통 인프라
- `data/seasons.json` — 시즌 데이터 (현재 시즌 + 역대)
- `HANDOFF.md` — 다른 PC 셋업 전체 가이드 ← 이게 메인
- 본 문서 (`HANDOFF_NEXT.md`) — 단기 인계

### 자주 쓰는 명령
```bash
cd C:\Users\danie\Desktop\클로드 코드 관련\sigfig-game

node server.js          # 서버 시작
npm test                # 단위 테스트 (28건)
git pull origin main    # 최신 코드
git status              # 변경 확인
```

---

## 💡 새 세션에 붙여넣을 문구 (사용자가 복사용)

```
이 프로젝트 이어받기:
- 폴더: C:\Users\danie\Desktop\클로드 코드 관련\sigfig-game
- HANDOFF_NEXT.md 와 HANDOFF.md 우선 읽기
- 메인 HEAD: 1c98e7b
- 다음 단계: 학교 노트북 셋업 또는 운영 이슈 해결
```

---

## 🚦 마지막 대화 요약 (이전 세션)

1. 시즌제 검토 → 6개 버그 식별 → 모두 수정 + 푸시
2. 운영 시나리오 (점심+저녁) 검토 → 다중 시간 윈도우 추가 + 토큰 TTL 24시간 + 그레이스풀 셧다운 + 부팅 시 즉시 tickSeasons → 푸시
3. 다른 컴퓨터 작업 인계 가능하게 → HANDOFF.md + .env.example + README 갱신 → 푸시
4. Render 배포 시도 → Free Plan 디스크 X 발견 → Fly.io도 무료 폐지 확인 → **학교 노트북 + Google Drive 채택**
5. 매주 백업 불필요 확인 (자동 3중 보호)
6. 시즌 운영 계획 확정 (프리시즌 1주 → 정규 2~3주 반복)
7. **컨텍스트 한계 → 본 문서 작성**
