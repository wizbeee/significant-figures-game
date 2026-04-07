# 과학 실험실 관리 - Android 앱

Google Apps Script 웹앱을 Android 앱으로 패키징한 프로젝트입니다.
폰과 태블릿 모두 지원합니다.

## 기능
- 전체화면 WebView (브라우저 UI 없음)
- 스플래시 화면 (앱 로딩 중 표시)
- 스와이프로 새로고침
- 오프라인 에러 화면 + 재시도
- Google 계정 로그인 지원 (쿠키 유지)
- 다크모드 지원
- 폰/태블릿 회전 대응

## 빌드 방법

### 사전 요구사항
- Android Studio (최신 버전 권장)
- JDK 8 이상

### 빌드 순서

1. **Android Studio에서 프로젝트 열기**
   - File > Open > `science-lab-admin-android` 폴더 선택
   - Gradle sync 완료까지 대기

2. **웹앱 URL 확인/변경** (필요 시)
   - `app/build.gradle` > `buildConfigField "WEB_APP_URL"` 값 확인
   - GAS 웹앱 재배포 시 URL이 바뀌면 여기를 수정

3. **앱 아이콘 변경** (선택)
   - Android Studio > New > Image Asset
   - 원하는 이미지로 교체

4. **디버그 빌드** (테스트용)
   ```
   ./gradlew assembleDebug
   ```
   APK 위치: `app/build/outputs/apk/debug/app-debug.apk`

5. **릴리스 빌드** (배포용)
   ```
   # 서명 키 생성 (최초 1회)
   keytool -genkey -v -keystore release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias sciencelab

   # 릴리스 빌드
   ./gradlew assembleRelease
   ```

6. **기기에 설치**
   - USB 연결 후 Android Studio > Run
   - 또는 APK 파일을 기기로 전송하여 직접 설치

## 프로젝트 구조
```
app/src/main/
  java/kr/hs/cnsa/sciencelab/
    SplashActivity.java    # 스플래시 화면
    MainActivity.java      # WebView 메인 화면
  res/
    layout/
      activity_splash.xml  # 스플래시 레이아웃
      activity_main.xml    # 메인 레이아웃 (WebView + 에러화면)
    values/
      colors.xml           # 색상 정의
      strings.xml          # 문자열 (앱 이름 등)
      themes.xml           # 라이트 모드 테마
    values-night/
      themes.xml           # 다크 모드 테마
    drawable/
      ic_launcher_*.xml    # 앱 아이콘 (벡터)
```

## URL 변경 시
GAS 웹앱을 재배포하면 URL이 변경될 수 있습니다.
`app/build.gradle`의 `WEB_APP_URL` 값만 수정하면 됩니다.
