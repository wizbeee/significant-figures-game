// parseUserNum 함수 테스트 (#56) — 모드 4/5/6 입력 파싱
// node --test test/parseUserNum.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const SUP2 = {'⁻':'-','⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9'};
function parseUserNum(str) {
  if (str === null || str === undefined) return null;
  let s = String(str).trim().replace(/\s/g, '');
  if (!s) return null;
  s = s.replace(/[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]/g, c => SUP2[c]);
  s = s.replace(/×/g, 'x').replace(/\*/g, 'x').replace(/X/g, 'x');
  let m = s.match(/^(-?\d+(?:\.\d+)?)x10\^?(-?\d+)$/);
  if (!m) m = s.match(/^(-?\d+(?:\.\d+)?)e(-?\d+)$/i);
  if (m) {
    const mantStr = m[1], exp = parseInt(m[2]);
    const mant = parseFloat(mantStr);
    if (isNaN(mant) || isNaN(exp)) return null;
    const dotI = mantStr.indexOf('.');
    const mantDP = dotI < 0 ? 0 : mantStr.length - dotI - 1;
    return { value: mant * Math.pow(10, exp), form: 'sci', mantStr, mant, exp, mantDP };
  }
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const v = parseFloat(s);
    const dotI = s.indexOf('.');
    const dp = dotI < 0 ? 0 : s.length - dotI - 1;
    return { value: v, form: 'plain', plainStr: s, dp };
  }
  return null;
}

test('과학적 표기법 — × 형식', () => {
  const r = parseUserNum('1.5×10³');
  assert.equal(r.form, 'sci');
  assert.equal(r.mant, 1.5);
  assert.equal(r.exp, 3);
  assert.equal(r.value, 1500);
});

test('과학적 표기법 — x10^ 형식', () => {
  const r = parseUserNum('1.5x10^3');
  assert.equal(r.form, 'sci');
  assert.equal(r.value, 1500);
});

test('과학적 표기법 — e 형식', () => {
  const r = parseUserNum('1.5e3');
  assert.equal(r.form, 'sci');
  assert.equal(r.value, 1500);
});

test('과학적 표기법 — 음수 지수', () => {
  const r = parseUserNum('2.5×10⁻²');
  assert.equal(r.form, 'sci');
  assert.equal(r.exp, -2);
  assert.equal(r.value, 0.025);
});

test('일반 숫자', () => {
  const r = parseUserNum('17.9');
  assert.equal(r.form, 'plain');
  assert.equal(r.value, 17.9);
  assert.equal(r.dp, 1);
});

test('정수', () => {
  const r = parseUserNum('100');
  assert.equal(r.form, 'plain');
  assert.equal(r.value, 100);
  assert.equal(r.dp, 0);
});

test('공백 자동 제거', () => {
  const r = parseUserNum(' 3.14 ');
  assert.equal(r.value, 3.14);
});

test('빈 문자열 — null', () => {
  assert.equal(parseUserNum(''), null);
  assert.equal(parseUserNum('   '), null);
});

test('잘못된 형식 — null', () => {
  assert.equal(parseUserNum('abc'), null);
  assert.equal(parseUserNum('1..2'), null);
});

test('소수점 자릿수 정확', () => {
  assert.equal(parseUserNum('3.140').dp, 3);
  assert.equal(parseUserNum('100.00').dp, 2);
});

test('가수 소수점 자릿수 (sci)', () => {
  assert.equal(parseUserNum('3.140×10²').mantDP, 3);
  assert.equal(parseUserNum('1.5e3').mantDP, 1);
});
