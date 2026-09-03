// normName — 명단 대조용 이름 정규화 (명단 학생만 입장 기능)
// server.js 에 모듈 export 가 없으므로, 원본 소스에서 함수 본문을 그대로 떼어 와 평가한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function loadFn(name) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error(name + ' 함수를 server.js 에서 찾을 수 없습니다');
  let depth = 0, i = src.indexOf('{', start), end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) throw new Error(name + ' 함수 본문을 파싱하지 못했습니다');
  // eslint-disable-next-line no-new-func
  return new Function(src.slice(start, end) + '; return ' + name + ';')();
}

const normName = loadFn('normName');

test('같은 이름은 같은 값으로 정규화', () => {
  assert.equal(normName('홍길동'), normName('홍길동'));
  assert.equal(normName('Alice'), normName('alice'));
});

test('앞뒤/중간 일반 공백 제거', () => {
  assert.equal(normName(' 홍 길 동 '), normName('홍길동'));
  assert.equal(normName('김\t영\n희'), normName('김영희'));
});

test('NBSP · 전각 공백 · 제로폭 문자 제거', () => {
  assert.equal(normName('홍 길동'), normName('홍길동'));   // NBSP
  assert.equal(normName('홍　길동'), normName('홍길동'));   // 전각 공백
  assert.equal(normName('홍​길동'), normName('홍길동'));   // 제로폭 공백
  assert.equal(normName('홍‌길‍동'), normName('홍길동')); // ZWNJ / ZWJ
  assert.equal(normName('홍﻿길동'), normName('홍길동'));   // BOM
  assert.equal(normName('홍⁠길동'), normName('홍길동'));   // word joiner
});

test('한글 NFD 입력도 NFC 로 통일 (맥 파일명 등)', () => {
  assert.equal(normName('홍길동'.normalize('NFD')), normName('홍길동'));
});

test('대소문자 무시', () => {
  assert.equal(normName('HONG Gil Dong'), normName('honggildong'));
});

test('다른 이름은 다르게 유지', () => {
  assert.notEqual(normName('홍길동'), normName('홍길순'));
  assert.notEqual(normName('김영희'), normName('김영수'));
});

test('null / undefined / 빈 문자열 안전', () => {
  assert.equal(normName(null), '');
  assert.equal(normName(undefined), '');
  assert.equal(normName(''), '');
  assert.equal(normName('   '), '');
});
