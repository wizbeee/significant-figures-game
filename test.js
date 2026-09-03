// 유효숫자 마스터 — 최소 스모크 테스트 (의존성 0)
//   실행: node test.js
// server.js 는 require.main === module 일 때만 listen 하므로, require 해도 포트를 잡지 않는다.
// (문제풀 생성 로그가 한 줄 찍히는 것은 정상)

const { normName } = require('./server.js');

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}\n     ${e.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || '단언 실패');
}
function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || ''} 기대값 ${JSON.stringify(expected)} / 실제 ${JSON.stringify(actual)}`);
  }
}

console.log('\n[normName] 명단 대조용 이름 정규화');

test('앞뒤 공백을 무시한다', () => {
  eq(normName('  홍길동  '), '홍길동');
});
test('이름 가운데 공백을 무시한다', () => {
  eq(normName('홍 길동'), '홍길동');
  eq(normName('홍  길  동'), '홍길동');
});
test('탭·개행도 공백으로 본다', () => {
  eq(normName('홍\t길동\n'), '홍길동');
});
test('유니코드 공백(NBSP·전각 공백)을 제거한다', () => {
  eq(normName('홍 길동'), '홍길동');   // NBSP
  eq(normName('홍　길동'), '홍길동');   // 전각 공백
  eq(normName('홍​길동'), '홍길동');   // 폭 없는 공백
  eq(normName('﻿홍길동'), '홍길동');   // BOM
});
test('영문 대소문자를 구분하지 않는다', () => {
  eq(normName('HONG'), 'hong');
  eq(normName('Hong Gildong'), 'honggildong');
});
test('빈 값·null·undefined 를 빈 문자열로 처리한다', () => {
  eq(normName(''), '');
  eq(normName(null), '');
  eq(normName(undefined), '');
  eq(normName('   '), '');
});
test('한글 자모 분리형(NFD)과 완성형(NFC)을 같게 본다', () => {
  const nfc = '홍길동';
  const nfd = nfc.normalize('NFD');
  assert(nfc !== nfd, '테스트 전제: NFD 문자열이 실제로 달라야 함');
  eq(normName(nfd), normName(nfc));
});
test('서로 다른 이름은 여전히 다르다', () => {
  assert(normName('홍길동') !== normName('김철수'), '다른 이름이 같게 판정됨');
  assert(normName('홍길동') !== normName('홍길순'), '다른 이름이 같게 판정됨');
});

console.log(`\n총 ${passed + failed}개 · 통과 ${passed} · 실패 ${failed}\n`);
process.exit(failed ? 1 : 0);
