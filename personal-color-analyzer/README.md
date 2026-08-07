# 퍼스널 컬러 분석 서비스

AI 기반 이미지 컨설팅 시스템 — 얼굴형 / 퍼스널 컬러 / 체형 분석

## ⚡ 가장 쉬운 실행 방법 — 더블클릭 한 번

| OS | 실행 방법 |
|---|---|
| **Windows** | `start.bat` 더블클릭 |
| **macOS** | `start.command` 더블클릭 (최초 1회: 우클릭 → 열기) |
| **Linux** | 터미널에서 `./start.sh` |

런처가 자동으로 처리하는 것:
1. ✅ Node.js 설치 여부 확인 (없으면 설치 페이지로 안내)
2. ✅ 의존성 설치 (`npm install`)
3. ✅ 서버 시작
4. ✅ 브라우저 자동 열기 → `http://localhost:5000/laptop.html`
5. ✅ **최초 실행 시 브라우저에서 Claude API 키 입력 모달 자동 표시** (메모장 편집 불필요)

**전제조건**: Node.js 18+ 한 번 설치 (https://nodejs.org)

> Windows 자동 설치: `cmd` 열고 `winget install OpenJS.NodeJS.LTS`  
> Mac 자동 설치: `brew install node`

## 🚀 클라우드 배포 (Render.com 무료, 폰 페어링 사용 시 권장)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/wizbeee/significant-figures-game/tree/feat/science-lab-admin-v3.2)

배포 후 바로 HTTPS 주소 (예: `https://personal-color-analyzer.onrender.com`)로 접속하면
**폰과 노트북이 같은 URL**로 접근 가능합니다. QR 스캔만 하면 바로 분석 시작!

> 배포 시 필요한 환경변수: `ANTHROPIC_API_KEY` (Claude API 키)

## 주요 기능

- **얼굴형 분석** (10종) — MediaPipe 478 랜드마크 기반, 30+ 정밀 비율 측정
- **퍼스널 컬러 분석** (12종) — LAB 색공간 기반 피부톤 판정
- **체형 분석** (3종) — Pose Landmark 기반 체형 분류
- **AI 종합 컨설팅** — Claude API Vision으로 개인 맞춤 스타일 제안
- **성별 맞춤 가이드** — 남성/여성별 차별화된 스타일링 가이드
- **PDF 리포트** — 분석 결과 PDF 다운로드
- **이메일 발송** — 분석 결과를 이메일로 전송

## 구조

```
personal-color-analyzer/
├── server.js            # HTTPS + WebSocket 릴레이 서버
├── laptop.html          # 노트북 분석 화면 (결과 표시)
├── phone.html           # 폰 촬영 화면 (사진 캡처)
├── index.html           # 랜딩 페이지
├── lib/
│   ├── face-analyzer.js   # 얼굴형 분류 + 정밀 비율 분석
│   ├── color-analyzer.js  # 퍼스널 컬러 판정
│   └── body-analyzer.js   # 체형 분류
├── data/
│   ├── face-shape-data.js     # 얼굴형 10종 스타일링 데이터
│   ├── personal-color-data.js # 퍼스널 컬러 12종 데이터
│   └── body-type-data.js      # 체형 3종 데이터
├── .env.example         # 환경변수 템플릿
├── package.json
└── README.md
```

## ☁️ 클라우드 배포 (자세히)

### Render.com (추천 · 무료 플랜 지원)

1. 위의 **Deploy to Render** 버튼 클릭
2. GitHub 계정으로 로그인 → 리포지토리 연결
3. Service 설정:
   - Name: `personal-color-analyzer` (원하는 이름)
   - Branch: `feat/science-lab-admin-v3.2`
   - Root Directory: `personal-color-analyzer`
   - Build Command: `npm install`
   - Start Command: `node server.js`
4. Environment Variables 에 **`ANTHROPIC_API_KEY`** 추가
5. (선택) SMTP 이메일 발송용: `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` 등
6. **Create Web Service** 클릭 → 2~3분 후 배포 완료

배포 URL 예시: `https://personal-color-analyzer.onrender.com`

> 무료 플랜은 15분간 사용 없으면 슬립 모드로 전환, 첫 요청 시 깨어나는 데 ~30초 소요

### Railway.app

1. https://railway.app → **New Project** → **Deploy from GitHub repo**
2. 리포지토리 선택 → Root Directory 를 `personal-color-analyzer`로 설정
3. Variables 탭에서 `ANTHROPIC_API_KEY` 추가
4. 자동 빌드/배포 완료

### Fly.io

```bash
cd personal-color-analyzer
flyctl launch --name personal-color-analyzer
flyctl secrets set ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
flyctl deploy
```

### 기타 플랫폼

`PORT` 환경변수만 넘어오면 자동으로 클라우드 모드로 전환됩니다.
Node.js 18+ 지원하는 어떤 호스팅이든 동일하게 동작합니다.
(Vercel은 WebSocket 서버 지원이 제한적이어서 비권장)

## 🖥️ 로컬 설치 및 실행

### 1. 클론

퍼스널 컬러 분석 서비스의 최신 작업은 **`feat/science-lab-admin-v3.2`** 브랜치에 있습니다.

```bash
# 최신 작업 브랜치 클론 (권장)
git clone -b feat/science-lab-admin-v3.2 https://github.com/wizbeee/significant-figures-game.git
cd significant-figures-game/personal-color-analyzer
```

다른 컴퓨터에서 작업을 이어갈 때는 동일하게 이 브랜치를 체크아웃하세요:

```bash
# 기존 clone이 있다면
git fetch origin
git checkout feat/science-lab-admin-v3.2
git pull origin feat/science-lab-admin-v3.2
```

### 2. 의존성 설치

```bash
npm install
```

### 3. 환경변수 설정

```bash
# .env.example을 복사하여 .env 생성
cp .env.example .env
```

`.env` 파일을 열어 아래 값을 입력:

```env
# Claude API Key (필수) — https://console.anthropic.com/
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here

# SMTP 이메일 설정 (선택)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com
```

> **Claude API 키 발급**: https://console.anthropic.com/ → API Keys → Create Key

### 4. 실행

```bash
npm start
```

서버가 시작되면 아래 주소가 표시됩니다:

| 화면 | 프로토콜 | 용도 |
|------|----------|------|
| `http://<IP>:5000/laptop.html` | HTTP | 노트북 분석 화면 |
| `https://<IP>:5001/phone.html` | HTTPS | 폰 촬영 화면 (카메라) |

> 폰에서 카메라를 사용하려면 반드시 **HTTPS(5001번 포트)**로 접속해야 합니다.
> 자체 서명 인증서를 사용하므로 첫 접속 시 보안 경고가 나타납니다:
> - **iPhone Safari**: "이 웹 사이트 방문" 탭
> - **Android Chrome**: "고급" → "안전하지 않은 사이트로 이동"

### 5. 사용법

1. 노트북에서 `laptop.html` 접속 → QR 코드 또는 세션 코드 확인
2. 폰에서 `phone.html` 접속 → 세션 코드 입력하여 연결
3. 성별 선택 (남성/여성)
4. 얼굴 정면 사진 촬영 → 자동 분석
5. (선택) 전신 사진 촬영 → 체형 분석
6. 결과 확인 → AI 분석 / PDF 다운로드 / 이메일 발송

## 요구 사항

- **Node.js** 18 이상
- **OpenSSL** — 자체 서명 인증서 생성에 필요 (대부분의 OS에 기본 포함, Windows는 Git Bash에 포함)
- 같은 **Wi-Fi 네트워크**에 폰과 노트북이 연결되어 있어야 함

## 다른 컴퓨터에서 작업 이어가기

### 작업 중 변경사항 커밋 & 푸시

```bash
git add personal-color-analyzer/
git commit -m "작업 내용 요약"
git push origin feat/science-lab-admin-v3.2
```

### 새 컴퓨터에서 최신 작업 내려받기

```bash
cd significant-figures-game
git checkout feat/science-lab-admin-v3.2
git pull origin feat/science-lab-admin-v3.2

cd personal-color-analyzer
# .env는 .gitignore에 포함되어 있어 새 컴퓨터에서 다시 만들어야 함
cp .env.example .env
# 에디터로 .env 열어 ANTHROPIC_API_KEY 입력
```

### 중요 — .env 파일과 API 키

- `.env` 파일은 보안상 **GitHub에 올라가지 않습니다** (`.gitignore` 포함)
- 새 컴퓨터에서는 `.env`를 다시 만들고 Claude API 키를 넣어야 합니다
- Claude API 키는 같은 걸 여러 컴퓨터에서 공유해 써도 됩니다 (사용량만 합산)

### 현재 기능 수준 (v1.3)

- **얼굴형** 10종 (타원 / 둥근 / 사각 / 하트 / 다이아몬드 / 긴얼굴 / 역삼각 / 직사각 / 사다리꼴 / 배형)
- **퍼스널 컬러** 12종 (Caygill 4계절 × 3하위유형)
- **체형** 3종 (Straight / Wave / Natural)
- **얼굴 정밀 비율** 30+ 항목 (황금비율, 대칭 6항목, 5등분 균형 등)
- **AI 진단 소견** — Claude Sonnet 4.5 + Extended Thinking + 참고 지식 베이스 + 감별 진단
- **연속 분석 모드** — 한 번 QR 스캔으로 여러 사람 분석
- **InBody 스타일 리포트** — 점수 게이지 + 임상 관찰 기록 + 확신도 보정

## Windows 빠른 설정

```bat
cd personal-color-analyzer
copy .env.example .env
:: .env 파일을 메모장으로 열어 API 키 입력
notepad .env
npm install
npm start
```

## Mac/Linux 빠른 설정

```bash
cd personal-color-analyzer
cp .env.example .env
# .env 파일에 API 키 입력
nano .env
npm install
npm start
```
