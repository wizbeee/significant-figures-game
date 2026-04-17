# 🔬 유효숫자 마스터

고등학교 과학 수업용 **실시간 퀴즈 게임** — 싱글/멀티/대전 3가지 방식으로 유효숫자 개념을 연습합니다.

- 🎯 **4가지 게임 모드**: 유효숫자 개수 세기 / 유효숫자 찾기 / 측정값 읽기 / 덧셈·뺄셈 계산
- 👥 **멀티 플레이**: 각자 다른 문제를 독립적으로 풀기
- ⚔️ **대전 플레이**: 카훗 스타일 실시간 경쟁 (속도전 / 서바이벌)
- 👩‍🏫 **교사 관리**: 방 승인, 점수판 관리, 학생 전적, 구글 시트 동기화
- 🏫 **다중 교실 지원**: **한 URL에서 여러 선생님이 각자 교실을 만들어 독립적으로 수업**

---

## ⭐ 핵심 — 여러 선생님이 하나의 URL 공유

이 서버는 **"교실(classroom)"** 개념으로 선생님마다 독립된 공간을 제공합니다.

- 한 번만 배포하면 **전 세계 선생님이 모두 같은 URL**로 접속
- 각 선생님은 본인만의 **교실 코드** (예: `김쌤화학`, `3반과학`)를 만들고 비밀번호 설정
- 학생들은 그 코드를 입력해서 담당 선생님 교실에만 접속
- 각 교실의 **학생 DB / 점수판 / 방 / 통계가 완전히 분리**됨

### 선생님 처음 사용 흐름
1. 교사 페이지(`/teacher.html`) 접속
2. 원하는 교실 코드 입력 (예: `김쌤화학`) + 교실 이름 + 비밀번호
3. **"로그인 / 교실 만들기"** 클릭 → 새 교실 생성됨
4. 학생들에게 그 교실 코드 알려주기

### 학생 접속 흐름
1. 학생 페이지(`/`) 접속
2. 선생님이 알려준 **교실 코드 + 학번 + 이름** 입력 → 입장
3. 해당 교실의 방 목록만 보이고, 다른 선생님 교실과 섞이지 않음

---

## 🚀 로컬 실행 (내 PC에서 테스트)

```bash
git clone https://github.com/wizbeee/significant-figures-game.git
cd significant-figures-game
node server.js
```

- 학생: http://localhost:8093/
- 교사: http://localhost:8093/teacher.html
- 점수판: http://localhost:8093/leaderboard.html

같은 Wi-Fi 학생들은 서버 PC의 IP로 접속 (예: `http://10.1.x.x:8093/`)

---

## 🌐 Render.com 무료 배포 — 전 세계 선생님 공유

**한 번만 배포하면 여러 선생님이 같은 URL에서 각자 교실을 운영할 수 있어요.**

### 단계 (5분 소요)
1. [Render.com](https://render.com) 가입 → GitHub 로그인
2. Fork한 이 저장소를 Render에서 **New + → Blueprint** → 저장소 선택 → **Apply**
3. `render.yaml`이 자동 감지됨 → 1분 내 배포 완료
4. 받은 URL (예: `https://sigfig-xxxxx.onrender.com`) 공유

### 동료 선생님에게 안내할 내용
> 1. `https://본인주소.onrender.com/teacher.html` 접속
> 2. 원하는 **교실 코드** (영문/한글 2~20자, 예: `kim-chem`) + 이름 + 비밀번호 입력
> 3. "로그인 / 교실 만들기" 클릭
> 4. 학생들에게 **교실 코드**만 알려주기 (URL은 전체 공유)

### 무료 플랜 유의점
- ⏰ 15분 무활동 시 슬립 → 첫 접속 시 10~30초 로딩
- 💾 영구 디스크 1GB — 모든 교실 데이터 보존
- 🌏 싱가포르 리전 (한국 ping 50~80ms, 수업에 충분)

---

## 💻 다른 컴퓨터에서 개발 이어가기

```bash
git clone https://github.com/wizbeee/significant-figures-game.git
cd significant-figures-game
node server.js

# 수정 후
git add .
git commit -m "수정 내용"
git push

# 다른 컴퓨터에서
git pull
```

Render에 연결된 GitHub가 자동으로 감지하고 재배포합니다.

---

## ⚙️ 환경 변수 (배포 시)

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `8093` | 서버 포트 |
| `HOST` | `0.0.0.0` | 바인딩 주소 |
| `DATA_DIR` | `./data` | 데이터 저장 폴더 (영구 디스크 권장) |
| `TEACHER_PASSWORD` | `3000` | 레거시 `default` 교실 초기 비밀번호 (마이그레이션 용) |

---

## 🏗 데이터 구조

```
data/
├── classrooms.json     # 교실 정의 (코드, 이름, 비밀번호 해시, 설정)
├── students.json       # { [교실코드]: { [학번]: 학생정보 } }
├── leaderboards.json   # { [교실코드]: { single:[], multi:[], battle:[] } }
└── attendance.json     # { [교실코드]: { [날짜]: { [학번]: 출석 } } }
```

- 비밀번호는 SHA-256 해시로 저장 (평문 저장 X)
- 교실 삭제 API는 없음 (분실 방지) — 필요 시 직접 파일에서 제거

---

## 📚 기술 스택

- **Zero-dependency Node.js** (Node 18+)
- 파일 기반 JSON 저장소
- 폴링 기반 실시간 동기화 (1.2초 간격)
- 순수 HTML/CSS/JS 프론트엔드 (빌드 불필요)

---

## 📄 라이선스

MIT
