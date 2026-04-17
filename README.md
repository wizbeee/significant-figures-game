# 🔬 유효숫자 마스터

고등학교 과학 수업용 **실시간 퀴즈 게임** — 싱글/멀티/대전 3가지 방식으로 유효숫자 개념을 연습합니다.

- 🎯 **4가지 게임 모드**: 유효숫자 개수 세기 / 유효숫자 찾기 / 측정값 읽기 / 덧셈·뺄셈 계산
- 👥 **멀티 플레이**: 각자 다른 문제를 독립적으로 풀기
- ⚔️ **대전 플레이**: 카훗 스타일 실시간 경쟁 (속도전 / 서바이벌)
- 👩‍🏫 **교사 관리**: 방 승인, 점수판 관리, 학생 전적, 구글 시트 동기화
- 🎓 **학생 개인 전적**: 승률, 누적 점수, 모드별 통계

---

## 🚀 빠른 시작

### 로컬 실행 (내 PC에서)

```bash
git clone https://github.com/wizbeee/significant-figures-game.git
cd significant-figures-game
node server.js
```

접속:
- 학생: http://localhost:8093/
- 교사: http://localhost:8093/teacher.html
- 교사 초기 비밀번호: `3000`

같은 Wi-Fi 학생들은 서버 PC의 IP로 접속 (예: `http://10.1.x.x:8093/`)

---

## 🌐 인터넷 배포 — 다른 학교/선생님도 사용하려면

**Render.com 무료 배포** (추천, 5분 소요)

### 준비물
- GitHub 계정
- 이 저장소를 **Fork** (우상단 Fork 버튼)

### 단계

1. [Render.com](https://render.com) 접속 → GitHub 계정으로 가입/로그인
2. 우상단 **New +** → **Blueprint** 선택
3. Fork한 저장소 연결 → **Apply** 클릭
4. `render.yaml`이 자동 감지됨 → 1분 내 배포 완료
5. 생성된 URL (예: `https://my-sigfig.onrender.com`) 을 학생/동료 교사에게 공유

### 배포 후 접속
| 대상 | URL |
|---|---|
| 학생 | `https://본인주소.onrender.com/` |
| 교사 | `https://본인주소.onrender.com/teacher.html` |
| 점수판 | `https://본인주소.onrender.com/leaderboard.html` |

### 교사 비밀번호
Render가 자동으로 랜덤 비밀번호를 생성합니다.
- Render 대시보드 → 본인 서비스 → **Environment** → `TEACHER_PASSWORD` 값 확인
- 로그인 후 교사 페이지 상단에서 원하는 비밀번호로 변경 가능

### 주의사항 (무료 플랜)
- ⏰ **15분 무활동 시 서버 슬립**: 첫 접속 시 10-30초 로딩 필요 (유료 $7/월로 24시간 상시 가동 가능)
- 💾 **데이터는 영구 디스크(1GB)에 저장**: 서버 재시작/재배포 시에도 학생 DB/점수판 유지
- 🌏 **서울 리전 없음**: 싱가포르로 설정됨 (한국에서 ping 50-80ms — 수업 사용 충분)

---

## 🏫 다른 선생님이 각자 자기 수업에 쓰려면

**각 선생님이 자기만의 서버를 배포**하는 방식을 권장합니다.

이유:
- 학생 데이터가 선생님별로 분리됨
- 비밀번호도 선생님마다 다름
- 한 수업의 점수판이 다른 수업에 섞이지 않음

**방법:** 위 "인터넷 배포" 섹션을 그대로 따라하면 됩니다. Fork → Render Blueprint → 끝.

각 선생님은:
- 자기만의 URL (예: `https://kim-sigfig.onrender.com`)
- 자기만의 교사 비밀번호
- 자기 반 학생 데이터/점수판

---

## 💻 다른 컴퓨터에서 이어서 개발

```bash
# 처음 한 번만
git clone https://github.com/wizbeee/significant-figures-game.git
cd significant-figures-game

# 서버 실행
node server.js

# 코드 수정 후 GitHub에 반영
git add .
git commit -m "수정 내용"
git push

# 다른 컴퓨터에서 최신 코드 받기
git pull
```

---

## ⚙️ 환경 변수 (배포 시)

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `8093` | 서버 포트 |
| `HOST` | `0.0.0.0` | 바인딩 주소 |
| `DATA_DIR` | `./data` | 데이터 저장 폴더 |
| `TEACHER_PASSWORD` | `3000` | 초기 교사 비밀번호 (첫 실행 시에만 적용) |

---

## 📚 기술 스택

- **Zero-dependency Node.js** (Node 18+) — `package.json`이 있지만 `dependencies`는 없습니다
- 파일 기반 JSON 저장소 (`data/*.json`)
- 폴링 기반 실시간 동기화 (HTTP long-poll 대신 1.2초 간격 요청)
- 순수 HTML/CSS/JS 프론트엔드 (빌드 단계 없음)

---

## 📄 라이선스

MIT
