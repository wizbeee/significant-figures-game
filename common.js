// 유효숫자 마스터 - 공통 JS (분석 + Canvas 드로잉)

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

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
}

function drawRuler(ctx, w, h, m) {
  const pad=60, rH=65, rY=h/2-rH/2, v=m.val;
  const s0=Math.max(0,Math.floor(v-3)), e0=s0+6, px=(w-pad*2)/(e0-s0);
  ctx.fillStyle='#fef3c7'; ctx.strokeStyle='#d97706'; ctx.lineWidth=2;
  roundRect(ctx,pad-10,rY,w-pad*2+20,rH,6); ctx.fill(); ctx.stroke();
  ctx.fillStyle='#1e293b'; ctx.strokeStyle='#78350f'; ctx.lineWidth=1; ctx.font='11px sans-serif'; ctx.textAlign='center';
  for (let mm=s0*10; mm<=e0*10; mm++) {
    const x=pad+(mm/10-s0)*px; if (x<pad-5||x>w-pad+5) continue;
    const isCm=mm%10===0, is5=mm%5===0, tH=isCm?28:is5?18:10;
    ctx.beginPath(); ctx.moveTo(x,rY+rH); ctx.lineTo(x,rY+rH-tH); ctx.stroke();
    if (isCm) ctx.fillText((mm/10)+'', x, rY+rH+16);
  }
  ctx.fillText('cm', w-pad+25, rY+rH+16);
  const ax=pad+(v-s0)*px;
  ctx.fillStyle='#ef4444'; ctx.beginPath();
  ctx.moveTo(ax,rY-5); ctx.lineTo(ax-7,rY-22); ctx.lineTo(ax+7,rY-22); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(ax,rY-22); ctx.lineTo(ax,rY-38); ctx.strokeStyle='#ef4444'; ctx.lineWidth=2; ctx.stroke();
  ctx.font='bold 12px sans-serif'; ctx.fillText('읽으세요',ax,rY-42);
}

function drawCyl(ctx, w, h, m) {
  const v=m.val, cW=90, cy=35, cH=h-75, cx=w/2;
  const mx=Math.ceil(v/10)*10+10, mn=Math.max(0,mx-60), pp=cH/(mx-mn);
  ctx.strokeStyle='#0284c7'; ctx.lineWidth=2; ctx.fillStyle='#e0f2fe';
  ctx.beginPath(); ctx.moveTo(cx-cW/2,cy); ctx.lineTo(cx-cW/2,cy+cH);
  ctx.quadraticCurveTo(cx-cW/2,cy+cH+14,cx,cy+cH+14);
  ctx.quadraticCurveTo(cx+cW/2,cy+cH+14,cx+cW/2,cy+cH); ctx.lineTo(cx+cW/2,cy); ctx.stroke();
  const lY=cy+cH-(v-mn)*pp;
  ctx.fillStyle='rgba(59,130,246,.25)'; ctx.beginPath();
  ctx.moveTo(cx-cW/2+2,lY); ctx.quadraticCurveTo(cx,lY+7,cx+cW/2-2,lY);
  ctx.lineTo(cx+cW/2-2,cy+cH); ctx.quadraticCurveTo(cx+cW/2-2,cy+cH+12,cx,cy+cH+12);
  ctx.quadraticCurveTo(cx-cW/2+2,cy+cH+12,cx-cW/2+2,cy+cH); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='#2563eb'; ctx.lineWidth=2; ctx.beginPath();
  ctx.moveTo(cx-cW/2+2,lY); ctx.quadraticCurveTo(cx,lY+7,cx+cW/2-2,lY); ctx.stroke();
  ctx.strokeStyle='#0284c7'; ctx.fillStyle='#1e293b'; ctx.font='10px sans-serif'; ctx.textAlign='right'; ctx.lineWidth=1;
  for (let vv=mn; vv<=mx; vv++) {
    const y=cy+cH-(vv-mn)*pp; if (y<cy||y>cy+cH) continue;
    const maj=vv%10===0, mid=vv%5===0, tl=maj?14:mid?9:4;
    ctx.beginPath(); ctx.moveTo(cx-cW/2,y); ctx.lineTo(cx-cW/2-tl,y); ctx.stroke();
    if (maj) ctx.fillText(vv+'',cx-cW/2-17,y+3);
  }
  ctx.font='11px sans-serif'; ctx.textAlign='center'; ctx.fillText('mL',cx,cy-8);
  ctx.fillStyle='#ef4444'; ctx.font='bold 11px sans-serif'; ctx.textAlign='left';
  ctx.fillText('← 읽으세요',cx+cW/2+8,lY+4);
}

function drawTherm(ctx, w, h, m) {
  const v=m.val, bR=18, tW=14, cx=w/2, tT=28, tB=h-55, tH=tB-tT;
  const mx=Math.ceil(v/10)*10+10, mn=mx-60, pp=tH/(mx-mn);
  ctx.strokeStyle='#6b7280'; ctx.lineWidth=2; ctx.fillStyle='#f9fafb';
  ctx.beginPath(); ctx.moveTo(cx-tW/2,tT); ctx.lineTo(cx-tW/2,tB);
  ctx.arc(cx,tB+4,bR,Math.PI,0,true); ctx.lineTo(cx+tW/2,tT);
  ctx.arc(cx,tT,tW/2,0,Math.PI,true); ctx.closePath(); ctx.fill(); ctx.stroke();
  const mY=tB-(v-mn)*pp;
  ctx.fillStyle='#ef4444'; ctx.beginPath();
  ctx.moveTo(cx-tW/2+3,Math.max(tT+4,mY)); ctx.lineTo(cx-tW/2+3,tB);
  ctx.arc(cx,tB+4,bR-4,Math.PI,0,true); ctx.lineTo(cx+tW/2-3,Math.max(tT+4,mY)); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(cx,tB+4,bR-4,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='#374151'; ctx.fillStyle='#1e293b'; ctx.font='10px sans-serif'; ctx.textAlign='left'; ctx.lineWidth=1;
  for (let t=mn; t<=mx; t++) {
    const y=tB-(t-mn)*pp; if (y<tT+4||y>tB) continue;
    const maj=t%10===0, mid=t%5===0, tl=maj?14:mid?9:4;
    ctx.beginPath(); ctx.moveTo(cx+tW/2+2,y); ctx.lineTo(cx+tW/2+2+tl,y); ctx.stroke();
    if (maj) ctx.fillText(t+'°C',cx+tW/2+19,y+3);
  }
  ctx.fillStyle='#2563eb'; ctx.font='bold 11px sans-serif'; ctx.textAlign='right';
  ctx.fillText('읽으세요 →',cx-tW/2-8,mY+4);
  ctx.strokeStyle='#2563eb'; ctx.lineWidth=1; ctx.setLineDash([3,3]);
  ctx.beginPath(); ctx.moveTo(cx-tW/2-3,mY); ctx.lineTo(cx-tW/2+1,mY); ctx.stroke(); ctx.setLineDash([]);
}

function drawInst(cv, m) {
  const ctx = cv.getContext('2d'), w = cv.width, h = cv.height;
  ctx.clearRect(0, 0, w, h);
  if (m.type === 'ruler') drawRuler(ctx, w, h, m);
  else if (m.type === 'cylinder') drawCyl(ctx, w, h, m);
  else drawTherm(ctx, w, h, m);
}

// ==================== 공지 토스트 (학생) ====================
// 서버 응답의 notices[] 배열을 받아 한 번씩만 화면에 띄운다 (localStorage로 id 추적)
const _SEEN_KEY = 'sigfig-seen-notices';
function _loadSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(_SEEN_KEY) || '[]')); }
  catch (e) { return new Set(); }
}
function _saveSeen(set) {
  const arr = Array.from(set);
  // 과거 id가 쌓이지 않도록 최근 200개만 유지
  const trimmed = arr.slice(-200);
  try { localStorage.setItem(_SEEN_KEY, JSON.stringify(trimmed)); } catch (e) {}
}
function _ensureNoticeStack() {
  let s = document.getElementById('notice-stack');
  if (!s) {
    s = document.createElement('div');
    s.id = 'notice-stack';
    s.className = 'notice-stack';
    document.body.appendChild(s);
  }
  return s;
}
function showNoticeToast(notice) {
  const stack = _ensureNoticeStack();
  const el = document.createElement('div');
  el.className = 'notice-toast';
  const label = notice.target === 'room' ? '방 공지' : '교실 공지';
  el.innerHTML = `<div class="icon">📢</div>
    <div class="body"><b>${label}</b>${String(notice.text||'').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</div>
    <button class="close" aria-label="닫기">✕</button>`;
  el.querySelector('.close').addEventListener('click', () => _removeNotice(el));
  stack.appendChild(el);
  const remain = Math.max(3000, (notice.expiresAt || Date.now() + 10000) - Date.now());
  setTimeout(() => _removeNotice(el), remain);
}
function _removeNotice(el) {
  if (!el.parentElement) return;
  el.style.animation = 'noticeOut .3s forwards';
  setTimeout(() => el.remove(), 300);
}
function processNotices(list) {
  if (!Array.isArray(list) || list.length === 0) return;
  const seen = _loadSeen();
  let changed = false;
  for (const n of list) {
    if (!n || !n.id || seen.has(n.id)) continue;
    showNoticeToast(n);
    seen.add(n.id);
    changed = true;
  }
  if (changed) _saveSeen(seen);
}

// ==================== 설정(테마/글꼴/색약/소리) ====================
function applyAppPrefs() {
  const theme = localStorage.getItem('sigfig-theme') || 'dark';
  const font = localStorage.getItem('sigfig-font') || 'md';
  const cb = localStorage.getItem('sigfig-cb') === '1';
  document.body.classList.remove('theme-light','theme-dark','font-sm','font-md','font-lg','cb-mode');
  document.body.classList.add(theme === 'light' ? 'theme-light' : 'theme-dark');
  document.body.classList.add('font-' + (['sm','md','lg'].includes(font) ? font : 'md'));
  if (cb) document.body.classList.add('cb-mode');
}
function openSettings() {
  let m = document.getElementById('app-settings');
  if (!m) {
    m = document.createElement('div');
    m.id = 'app-settings';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:9500;padding:20px';
    m.innerHTML = `<div style="background:var(--bg2);border:1px solid var(--bg3);border-radius:var(--r);padding:24px;max-width:440px;width:100%">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><h3 style="margin:0">⚙️ 화면 설정</h3><button class="btn btn-ghost btn-sm" id="as-close">✖</button></div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div><label style="display:block;color:var(--txt2);font-size:.82rem;margin-bottom:6px;font-weight:600">🎨 테마</label>
          <div style="display:flex;gap:8px"><button class="btn btn-ghost btn-sm" data-theme="dark">🌙 다크</button><button class="btn btn-ghost btn-sm" data-theme="light">☀️ 라이트</button></div></div>
        <div><label style="display:block;color:var(--txt2);font-size:.82rem;margin-bottom:6px;font-weight:600">🔤 글꼴 크기</label>
          <div style="display:flex;gap:8px"><button class="btn btn-ghost btn-sm" data-font="sm">작게</button><button class="btn btn-ghost btn-sm" data-font="md">보통</button><button class="btn btn-ghost btn-sm" data-font="lg">크게</button></div></div>
        <div><label style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" id="as-cb" style="width:18px;height:18px"><span>👁 색약 모드 (정답/오답에 기호 추가)</span></label></div>
        <div><label style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" id="as-sound" style="width:18px;height:18px"><span>🔊 게임 효과음</span></label></div>
      </div>
    </div>`;
    document.body.appendChild(m);
    m.querySelector('#as-close').onclick = () => m.style.display = 'none';
    m.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => { localStorage.setItem('sigfig-theme', b.dataset.theme); applyAppPrefs(); });
    m.querySelectorAll('[data-font]').forEach(b => b.onclick = () => { localStorage.setItem('sigfig-font', b.dataset.font); applyAppPrefs(); });
    m.querySelector('#as-cb').onchange = e => { localStorage.setItem('sigfig-cb', e.target.checked ? '1' : '0'); applyAppPrefs(); };
    m.querySelector('#as-sound').onchange = e => { localStorage.setItem('sigfig-sound', e.target.checked ? '1' : '0'); };
  }
  m.querySelector('#as-cb').checked = localStorage.getItem('sigfig-cb') === '1';
  m.querySelector('#as-sound').checked = localStorage.getItem('sigfig-sound') !== '0';
  m.style.display = 'flex';
}
// 간단 효과음 (F17)
function gameBeep(kind) {
  if (localStorage.getItem('sigfig-sound') === '0') return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    const freqs = { ok: [660, 880], no: [330, 220], level: [523, 659, 784], combo: [784, 988], hint: [440, 554] };
    const seq = freqs[kind] || freqs.ok;
    o.type = 'sine';
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
    seq.forEach((f, i) => o.frequency.setValueAtTime(f, ctx.currentTime + i * 0.08));
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08 * seq.length);
    o.start(); o.stop(ctx.currentTime + 0.08 * seq.length + 0.05);
  } catch (e) {}
}

// 페이지 로드 시 prefs 적용
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyAppPrefs);
  else applyAppPrefs();
}

// ==================== API 헬퍼 ====================
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const t = localStorage.getItem('sigfig-token');
  if (t) headers['Authorization'] = 'Bearer ' + t;
  const tt = localStorage.getItem('sigfig-teacher-token');
  if (tt && path.startsWith('/api/teacher') || (opts && opts.asTeacher)) {
    if (tt) headers['Authorization'] = 'Bearer ' + tt;
  }
  const r = await fetch(path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  try { return await r.json(); } catch { return { error: 'parse error' }; }
}
