// 유효숫자 분석 함수 테스트 (#56)
// node --test test/analyze.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// server.js의 analyze 함수와 동일 구현 (테스트용 분리)
function analyze(str) {
  let s = String(str).replace(/^[+-]/, '');
  const hasDot = s.includes('.');
  const digs = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '.') { digs.push({ c: '.', i, sig: false, pt: true }); continue; }
    if (c >= '0' && c <= '9') digs.push({ c, i, sig: false, pt: false });
  }
  const nd = digs.filter(d => !d.pt);
  let fNZ = -1, lNZ = -1;
  for (let i = 0; i < nd.length; i++) {
    if (nd[i].c !== '0') { if (fNZ < 0) fNZ = i; lNZ = i; }
  }
  if (fNZ < 0) { if (nd.length) nd[nd.length - 1].sig = true; }
  else {
    for (let i = 0; i < nd.length; i++) {
      if (i < fNZ) nd[i].sig = false;
      else if (i <= lNZ) nd[i].sig = true;
      else nd[i].sig = hasDot;
    }
  }
  let ni = 0;
  for (let i = 0; i < digs.length; i++) if (!digs[i].pt) { digs[i].sig = nd[ni].sig; ni++; }
  return { digs, count: nd.filter(d => d.sig).length };
}

test('단일 0이 아닌 숫자', () => {
  assert.equal(analyze('3').count, 1);
  assert.equal(analyze('5').count, 1);
});

test('소수점 없는 정수', () => {
  assert.equal(analyze('123').count, 3);
  assert.equal(analyze('999').count, 3);
});

test('소수 (0이 아닌 숫자만)', () => {
  assert.equal(analyze('3.14').count, 3);
  assert.equal(analyze('1.005').count, 4);
  assert.equal(analyze('12.345').count, 5);
});

test('앞쪽 0 — 무효', () => {
  assert.equal(analyze('0.0034').count, 2);
  assert.equal(analyze('0.000056').count, 2);
  assert.equal(analyze('0.5').count, 1);
});

test('소수점 뒤 끝자리 0 — 유효', () => {
  assert.equal(analyze('2.50').count, 3);
  assert.equal(analyze('100.0').count, 4);
  assert.equal(analyze('3.000').count, 4);
});

test('소수점 없는 정수 뒤 0 — 무효', () => {
  assert.equal(analyze('1200').count, 2);
  assert.equal(analyze('100').count, 1);
  assert.equal(analyze('5000').count, 1);
});

test('중간 0 — 유효', () => {
  assert.equal(analyze('1.005').count, 4);
  assert.equal(analyze('305').count, 3);
  assert.equal(analyze('30.06').count, 4);
});

test('전체 0 — 적어도 1개', () => {
  assert.equal(analyze('0').count, 1);
  assert.equal(analyze('0.0').count, 1);
  assert.equal(analyze('0.00').count, 1);
});

test('부호 — 무시되어야 함', () => {
  assert.equal(analyze('+3.14').count, 3);
  assert.equal(analyze('-0.034').count, 2);
});

test('복잡한 케이스', () => {
  assert.equal(analyze('0.001020').count, 4);   // 1, 0, 2, 0 (뒤쪽 0 유효)
  assert.equal(analyze('20010.0').count, 6);    // 모두 유효
  assert.equal(analyze('100200.0').count, 7);   // 모두 유효
});
