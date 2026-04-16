# 퍼스널 컬러 분석 서비스

AI 기반 이미지 컨설팅 시스템 — 얼굴형 / 퍼스널 컬러 / 체형 분석

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

## 설치 및 실행

### 1. 클론

```bash
git clone https://github.com/wizbeee/significant-figures-game.git
cd significant-figures-game/personal-color-analyzer
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
