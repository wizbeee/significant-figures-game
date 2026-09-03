// 유효숫자 마스터 — 최소 스모크 테스트 (의존성 0)
//   실행: node test.js
// server.js 는 require.main === module 일 때만 listen 하므로, require 해도 포트를 잡지 않는다.
// (문제풀 생성 로그가 한 줄 찍히는 것은 정상)

const {
  normName, makeQuestion, viewQuestion, judge, buildHint, HINT_MAX,
} = require('./server.js');

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

// ==================== buildHint — 단계형 힌트 ====================
console.log('\n[buildHint] 단계형 힌트 (규칙 → 부분 단서 → 정답)');

// 모드별 샘플 문제를 넉넉히 뽑는다 (gm1 과학적 표기는 hard 에서만 나온다)
function sampleQuestions(gm, diff, n, addSubMode) {
  const recent = new Set();
  const out = [];
  for (let i = 0; i < n; i++) out.push(makeQuestion(gm, diff, recent, addSubMode || 'mixed'));
  return out;
}

test('4개 모드 × 3단계가 모두 비어있지 않은 문자열이다', () => {
  for (const [gm, diff] of [[1, 'medium'], [1, 'hard'], [2, 'medium'], [3, 'hard'], [4, 'medium']]) {
    for (const q of sampleQuestions(gm, diff, 30)) {
      for (let st = 1; st <= HINT_MAX; st++) {
        const h = buildHint(q, st);
        assert(typeof h === 'string' && h.trim().length > 0, `gm${gm} ${st}단계가 비어 있음`);
      }
    }
  }
});

test('gm1 — 1·2단계는 정답 개수를 말하지 않고 3단계만 말한다', () => {
  let checked = 0;
  for (const diff of ['easy', 'medium', 'hard']) {
    for (const q of sampleQuestions(1, diff, 60)) {
      const ans = `유효숫자 ${q.count}개`;
      assert(!buildHint(q, 1).includes(ans), `gm1 1단계가 정답을 노출: ${q.num}`);
      assert(!buildHint(q, 2).includes(ans), `gm1 2단계가 정답을 노출: ${q.num} → ${buildHint(q, 2)}`);
      assert(buildHint(q, 3).includes(ans), `gm1 3단계에 정답이 없음: ${q.num}`);
      checked++;
    }
  }
  assert(checked >= 100, '검사한 표본이 너무 적음');
});

test('gm2 — 3단계는 유효숫자 구간을 알려준다', () => {
  for (const q of sampleQuestions(2, 'medium', 30)) {
    assert(buildHint(q, 2).includes(`총 ${q.count}개`), 'gm2 2단계에 개수가 없음');
    assert(/번째 자리/.test(buildHint(q, 3)), 'gm2 3단계에 자리 안내가 없음');
  }
});

test('gm3 — 1·2단계는 측정값(dv)도 유효숫자 개수도 말하지 않는다', () => {
  let checked = 0;
  for (const diff of ['easy', 'medium', 'hard']) {
    for (const q of sampleQuestions(3, diff, 40)) {
      const dv = q.meas.dv, sfPhrase = `유효숫자 ${q.meas.sf}개`;
      for (const st of [1, 2]) {
        const h = buildHint(q, st);
        assert(!h.includes(dv), `gm3 ${st}단계가 측정값을 노출: ${dv} → ${h}`);
        assert(!h.includes(sfPhrase), `gm3 ${st}단계가 유효숫자 개수를 노출: ${h}`);
      }
      const h3 = buildHint(q, 3);
      assert(h3.includes(dv) && h3.includes(sfPhrase), `gm3 3단계에 정답이 없음: ${h3}`);
      checked++;
    }
  }
  assert(checked >= 100, '검사한 표본이 너무 적음');
});

test('gm4 — 1·2단계는 정답 문자열을 포함하지 않고 3단계만 포함한다', () => {
  let checked = 0;
  for (const mode of ['plainOnly', 'sciOnly', 'mixed']) {
    for (const diff of ['easy', 'medium', 'hard']) {
      for (const q of sampleQuestions(4, diff, 40, mode)) {
        assert(buildHint(q, 3).includes(q.answer), `gm4 3단계에 정답이 없음: ${q.display}`);
        // 짧은 정답("7" 등)은 자릿수 안내 숫자와 우연히 겹칠 수 있어 4자 이상만 검사한다
        if (q.answer.length < 4) continue;
        for (const st of [1, 2]) {
          const h = buildHint(q, st);
          assert(!h.includes(q.answer), `gm4 ${st}단계가 정답을 노출: ${q.display} → ${h}`);
        }
        checked++;
      }
    }
  }
  assert(checked >= 100, '검사한 표본이 너무 적음');
});

test('단계 범위를 벗어난 값도 안전하게 처리한다', () => {
  const q = makeQuestion(1, 'medium', new Set());
  assert(buildHint(q, 0).length > 0, '0단계');
  assert(buildHint(q, 99).length > 0, '99단계');
  eq(buildHint(null, 1), '');
});

console.log(`\n총 ${passed + failed}개 · 통과 ${passed} · 실패 ${failed}\n`);
process.exit(failed ? 1 : 0);
