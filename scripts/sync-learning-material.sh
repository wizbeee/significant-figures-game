#!/usr/bin/env bash
# 학습 자료 원본 → docs/index.html (GitHub Pages 배포본) 동기화
#
# 원본은 저장소 밖(수업_활동자료 폴더)에 있고, Pages는 docs/index.html을 서빙한다.
# 둘이 어긋나면 학생이 보는 자료가 낡은 판본이 되므로, 자료를 고친 뒤엔 항상 이걸 돌린다.
#
#   bash scripts/sync-learning-material.sh                 # 기본 경로에서 찾기
#   bash scripts/sync-learning-material.sh "D:/경로/자료.html"   # 경로 직접 지정
#   LEARNING_MATERIAL_PATH="..." bash scripts/sync-learning-material.sh
#
# PC마다 바탕화면 경로가 달라서(집 PC / 학교 노트북) 후보를 몇 개 훑는다.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$REPO_ROOT/docs/index.html"
FILENAME="인터렉티브 학습 자료(유효숫자와 불확정도-베타버전).html"

CANDIDATES=(
  "${1:-}"
  "${LEARNING_MATERIAL_PATH:-}"
  "$HOME/Desktop/수업_활동자료/$FILENAME"
  "$HOME/바탕 화면/수업_활동자료/$FILENAME"
  "/c/Users/${USER:-${USERNAME:-}}/Desktop/수업_활동자료/$FILENAME"
)

SRC=""
for c in "${CANDIDATES[@]}"; do
  if [ -n "$c" ] && [ -f "$c" ]; then SRC="$c"; break; fi
done

if [ -z "$SRC" ]; then
  echo "❌ 학습 자료 원본을 찾지 못했습니다." >&2
  echo "   경로를 인자로 넘기거나 LEARNING_MATERIAL_PATH 환경변수를 설정하세요." >&2
  echo "   예: bash scripts/sync-learning-material.sh \"\$HOME/Desktop/수업_활동자료/$FILENAME\"" >&2
  exit 1
fi

echo "원본: $SRC"

# 줄바꿈(CRLF/LF) 차이는 무시하고 내용만 비교 — git이 커밋 시 정규화하기 때문
if [ -f "$DEST" ] && diff -q <(tr -d '\r' < "$SRC") <(tr -d '\r' < "$DEST") >/dev/null 2>&1; then
  echo "✅ 이미 같습니다 — 복사할 것이 없습니다."
  exit 0
fi

mkdir -p "$REPO_ROOT/docs"
cp "$SRC" "$DEST"
touch "$REPO_ROOT/docs/.nojekyll"
echo "✅ 동기화 완료 → docs/index.html"
echo
echo "다음 단계 (Pages 반영):"
echo "  ⚠ 로컬 main은 origin과 갈라져 있을 수 있으니 origin/main에서 브랜치를 따세요."
echo "  git checkout -b pages-update origin/main"
echo "  git add docs && git commit -m 'docs: 학습 자료 갱신'"
echo "  git push origin HEAD:main"
