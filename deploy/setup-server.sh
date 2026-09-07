#!/usr/bin/env bash
# 유효숫자 마스터 — 24시간 서버 1회 설치 스크립트 (Ubuntu 22.04/24.04, x86·ARM 공용)
#
# VM에 접속한 뒤 이 파일만 받아서 실행하면 된다:
#   curl -fsSL https://raw.githubusercontent.com/wizbeee/significant-figures-game/main/deploy/setup-server.sh -o setup.sh
#   sudo bash setup.sh
#
# 하는 일: Node 설치 → 전용 계정·디렉터리 → 저장소 클론 → systemd 등록(부팅 시 자동 실행,
#          죽으면 재시작) → Caddy 리버스 프록시(HTTPS 자동 발급) → 방화벽 개방
#
# 되돌리려면: sudo bash setup.sh --uninstall
set -euo pipefail

APP_USER="sigfig"
APP_DIR="/opt/sigfig"
DATA_DIR="/var/lib/sigfig"
REPO="${REPO:-https://github.com/wizbeee/significant-figures-game.git}"
BRANCH="${BRANCH:-main}"
NODE_MAJOR=20

log()  { echo -e "\n\033[1;36m▶ $*\033[0m"; }
warn() { echo -e "\033[1;33m⚠ $*\033[0m"; }
die()  { echo -e "\033[1;31m✗ $*\033[0m" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "sudo 로 실행하세요:  sudo bash $0"

# ---------------------------------------------------------------- 제거
if [ "${1:-}" = "--uninstall" ]; then
  log "제거 중"
  systemctl disable --now sigfig 2>/dev/null || true
  rm -f /etc/systemd/system/sigfig.service
  systemctl daemon-reload
  rm -rf "$APP_DIR"
  echo "데이터($DATA_DIR)는 남겨 두었습니다. 완전히 지우려면: sudo rm -rf $DATA_DIR"
  exit 0
fi

# ---------------------------------------------------------------- 입력
DOMAIN="${DOMAIN:-}"
if [ -z "$DOMAIN" ]; then
  echo "HTTPS로 쓸 도메인을 입력하세요 (예: sigfig.duckdns.org)."
  echo "도메인 없이 IP로만 쓰려면 그냥 Enter — 이때는 HTTP(암호화 없음)로만 열립니다."
  read -rp "도메인: " DOMAIN || true
fi

TEACHER_PASSWORD="${TEACHER_PASSWORD:-}"
if [ -z "$TEACHER_PASSWORD" ]; then
  TEACHER_PASSWORD="$(head -c 18 /dev/urandom | base64 | tr -d '/+=' | head -c 20)"
  GENERATED=1
fi

# ---------------------------------------------------------------- Node
log "Node.js $NODE_MAJOR 설치 확인"
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  apt-get update -qq
  apt-get install -y -qq curl ca-certificates gnupg git
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq && apt-get install -y -qq nodejs
fi
echo "  node $(node -v) / $(uname -m)"

# ---------------------------------------------------------------- 계정·코드
log "전용 계정과 디렉터리 준비"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$DATA_DIR"

if [ -d "$APP_DIR/.git" ]; then
  echo "  이미 있음 → 최신 코드로 갱신"
  git -C "$APP_DIR" fetch --quiet origin
  git -C "$APP_DIR" checkout --quiet "$BRANCH"
  git -C "$APP_DIR" reset --hard --quiet "origin/$BRANCH"
else
  git clone --quiet --branch "$BRANCH" "$REPO" "$APP_DIR"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR" "$DATA_DIR"
chmod 750 "$DATA_DIR"          # 학생 개인정보가 들어가므로 남에게 열지 않는다
echo "  코드: $APP_DIR ($BRANCH) / 데이터: $DATA_DIR"

# ---------------------------------------------------------------- 환경파일
log "환경 설정"
ENV_FILE="/etc/sigfig.env"
if [ -f "$ENV_FILE" ] && [ -z "${TEACHER_PASSWORD_OVERRIDE:-}" ] && [ -z "${GENERATED:-}" ]; then
  echo "  기존 $ENV_FILE 유지"
else
  ORIGIN="http://localhost"
  [ -n "$DOMAIN" ] && ORIGIN="https://$DOMAIN"
  cat > "$ENV_FILE" <<ENVEOF
# 유효숫자 마스터 서버 설정 — 이 파일에는 비밀번호가 들어 있습니다.
PORT=8093
HOST=127.0.0.1
DATA_DIR=$DATA_DIR
TEACHER_PASSWORD=$TEACHER_PASSWORD
CORS_ORIGIN=$ORIGIN
TRUST_PROXY=1
STUDENT_TOKEN_TTL_HOURS=48
TEACHER_TOKEN_TTL_HOURS=48
LB_CAP=10000
ENVEOF
  chmod 600 "$ENV_FILE"
fi
# HOST=127.0.0.1 이므로 Node 는 외부에 직접 노출되지 않고, 항상 Caddy를 거친다.

# ---------------------------------------------------------------- systemd
log "systemd 서비스 등록 (부팅 시 자동 실행 · 죽으면 재시작)"
cat > /etc/systemd/system/sigfig.service <<UNITEOF
[Unit]
Description=유효숫자 마스터 (significant-figures-game)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node $APP_DIR/server.js
Restart=always
RestartSec=3
# 파일 쓰기는 데이터 디렉터리에만 허용
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA_DIR
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNITEOF
systemctl daemon-reload
systemctl enable --now sigfig
sleep 2
systemctl is-active --quiet sigfig || { journalctl -u sigfig -n 30 --no-pager; die "서버가 뜨지 않았습니다 (위 로그 확인)"; }
echo "  실행 중"

# ---------------------------------------------------------------- Caddy (HTTPS)
if [ -n "$DOMAIN" ]; then
  log "Caddy 설치 및 HTTPS 자동 발급 ($DOMAIN)"
  if ! command -v caddy >/dev/null 2>&1; then
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
    curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
      | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
      > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq && apt-get install -y -qq caddy
  fi
  cat > /etc/caddy/Caddyfile <<CADDYEOF
$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8093
}
CADDYEOF
  systemctl restart caddy
  echo "  https://$DOMAIN"
else
  warn "도메인을 입력하지 않아 HTTPS를 켜지 않았습니다."
  warn "이 경우 Node를 외부에 직접 열어야 하므로 HOST를 0.0.0.0으로 바꾸고 TRUST_PROXY=0으로 두세요."
  warn "학생 로그인이 암호화되지 않으니 임시 확인 용도로만 쓰세요."
fi

# ---------------------------------------------------------------- 방화벽
log "방화벽(인스턴스 쪽) 개방"
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q active; then
  ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
  echo "  ufw 80/443 허용"
fi
# Oracle Ubuntu 이미지는 iptables 기본 정책이 막혀 있어 이 처리가 꼭 필요하다
if command -v netfilter-persistent >/dev/null 2>&1; then
  iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT
  iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT
  netfilter-persistent save >/dev/null 2>&1 || true
  echo "  iptables 80/443 허용 및 저장"
fi

# ---------------------------------------------------------------- 안내
cat <<DONEEOF

────────────────────────────────────────────────────────
 설치 완료
────────────────────────────────────────────────────────
 주소      : ${DOMAIN:+https://$DOMAIN}${DOMAIN:-http://<서버IP>:8093}
 교사 화면 : ${DOMAIN:+https://$DOMAIN}/teacher.html
 데이터    : $DATA_DIR   (백업 대상)
DONEEOF
if [ -n "${GENERATED:-}" ]; then
  echo " 교사 비밀번호(자동 생성) : $TEACHER_PASSWORD"
  echo "   ↑ 지금 옮겨 적으세요. 다시 보려면: sudo grep TEACHER_PASSWORD $ENV_FILE"
fi
cat <<'DONEEOF2'

 자주 쓰는 명령
   상태     : sudo systemctl status sigfig
   로그     : sudo journalctl -u sigfig -f
   재시작   : sudo systemctl restart sigfig
   코드갱신 : sudo bash setup.sh      (다시 실행하면 최신 코드로 갱신)

 ⚠ Oracle Cloud를 쓴다면 인스턴스 방화벽만으로는 부족합니다.
   콘솔에서 VCN → 보안 목록 → 수신 규칙에 80, 443 TCP를 추가하세요.
   이걸 빠뜨려서 "접속이 안 된다"는 경우가 대부분입니다.
DONEEOF2
