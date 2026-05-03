// hasBadWord — 차단어 NFD + leet 검사 (#56)
const test = require('node:test');
const assert = require('node:assert/strict');

const BAD_WORDS = ['시발','씨발','병신','fuck','shit'];
const LEET_MAP = { '1':'i','0':'o','3':'e','4':'a','5':'s','7':'t','!':'i' };
LEET_MAP[String.fromCharCode(36)] = 's';
LEET_MAP[String.fromCharCode(64)] = 'a';
function normalizeForBadWord(t) {
  if (!t) return '';
  let r = String(t).normalize('NFC').toLowerCase();
  r = r.split('').map(c => LEET_MAP[c] || c).join('');
  r = r.replace(/[\s_\-.,;:'"()\[\]{}]/g, '');
  return r;
}
function hasBadWord(s) {
  if (!s) return false;
  const t = normalizeForBadWord(s);
  return BAD_WORDS.some(w => t.includes(normalizeForBadWord(w)));
}

test('정상 닉네임 — 통과', () => {
  assert.equal(hasBadWord('홍길동'), false);
  assert.equal(hasBadWord('Alice'), false);
  assert.equal(hasBadWord(''), false);
  assert.equal(hasBadWord(null), false);
});

test('한국어 직접 매치', () => {
  assert.equal(hasBadWord('시발'), true);
  assert.equal(hasBadWord('씨발놈'), true);
  assert.equal(hasBadWord('내가병신'), true);
});

test('영어 직접 매치', () => {
  assert.equal(hasBadWord('fuck'), true);
  assert.equal(hasBadWord('SHIT'), true);   // 대문자
  assert.equal(hasBadWord('iamfuck'), true);
});

test('Leet 변환 — 1→i', () => {
  assert.equal(hasBadWord('sh1t'), true);
  assert.equal(hasBadWord('SH1T'), true);
});

test('Leet 변환 — $→s', () => {
  assert.equal(hasBadWord('$hit'), true);
  assert.equal(hasBadWord('5h1t'), true);  // 5→s, 1→i
});

test('공백/특수문자 우회 차단', () => {
  assert.equal(hasBadWord('s h i t'), true);
  assert.equal(hasBadWord('f.u.c.k'), true);
  assert.equal(hasBadWord('sh-it'), true);
});

test('숫자만 있는 닉네임', () => {
  assert.equal(hasBadWord('1234'), false);
  assert.equal(hasBadWord('학번1001'), false);
});
