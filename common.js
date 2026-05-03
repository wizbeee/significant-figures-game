// 유효숫자 마스터 - 공통 JS (분석 + Canvas 드로잉 + UX 인프라)

// ========== XSS 방지 — 모든 사용자 입력 출력에 사용 ==========
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// 짧은 별칭 (템플릿에서 자주 씀)
const _h = escapeHtml;

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

// #30 — 비커
function drawBeaker(ctx, w, h, m) {
  const v = m.val, bW = 140, cy = 30, bH = h - 60, cx = w/2;
  const mx = Math.ceil(v/50)*50 + 50, mn = 0, pp = bH / (mx - mn);
  // 외형 (사다리꼴 비슷한 비커)
  ctx.strokeStyle = '#4b5563'; ctx.lineWidth = 2; ctx.fillStyle = '#f1f5f9';
  ctx.beginPath();
  ctx.moveTo(cx-bW/2, cy);
  ctx.lineTo(cx-bW/2-6, cy+bH);
  ctx.quadraticCurveTo(cx-bW/2-6, cy+bH+10, cx-bW/2+6, cy+bH+10);
  ctx.lineTo(cx+bW/2-6, cy+bH+10);
  ctx.quadraticCurveTo(cx+bW/2+6, cy+bH+10, cx+bW/2+6, cy+bH);
  ctx.lineTo(cx+bW/2, cy);
  ctx.stroke();
  // 액체
  const lY = cy + bH - (v - mn) * pp;
  ctx.fillStyle = 'rgba(59,130,246,.3)';
  ctx.beginPath();
  const widthAtY = (y) => bW + (y-cy)/bH * 12;  // 사다리꼴
  ctx.moveTo(cx - widthAtY(lY)/2, lY);
  ctx.quadraticCurveTo(cx, lY+4, cx + widthAtY(lY)/2, lY);
  ctx.lineTo(cx+bW/2-6, cy+bH);
  ctx.quadraticCurveTo(cx+bW/2+6, cy+bH+8, cx, cy+bH+8);
  ctx.quadraticCurveTo(cx-bW/2-6, cy+bH+8, cx-bW/2-6, cy+bH);
  ctx.closePath(); ctx.fill();
  // 눈금
  ctx.strokeStyle = '#374151'; ctx.fillStyle = '#1e293b'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right'; ctx.lineWidth = 1;
  for (let vv = mn; vv <= mx; vv += 10) {
    const y = cy + bH - (vv - mn) * pp;
    if (y < cy || y > cy+bH) continue;
    const maj = vv % 50 === 0;
    const tl = maj ? 12 : 6;
    const wd = widthAtY(y);
    ctx.beginPath();
    ctx.moveTo(cx-wd/2+1, y); ctx.lineTo(cx-wd/2+1+tl, y);
    ctx.stroke();
    if (maj) ctx.fillText(vv+'', cx-wd/2-4, y+3);
  }
  ctx.font='11px sans-serif'; ctx.textAlign='center'; ctx.fillStyle='#475569'; ctx.fillText('mL', cx, cy-6);
  // 빨간 화살표
  ctx.fillStyle='#ef4444'; ctx.font='bold 11px sans-serif'; ctx.textAlign='left';
  ctx.fillText('← 읽으세요', cx+widthAtY(lY)/2+10, lY+4);
}
// #30 — 디지털 저울
function drawScale(ctx, w, h, m) {
  const v = m.val, cx = w/2, cy = 60;
  // 본체
  ctx.fillStyle='#cbd5e1'; ctx.strokeStyle='#475569'; ctx.lineWidth=2;
  const bodyW = 240, bodyH = 100;
  ctx.beginPath();
  ctx.roundRect(cx-bodyW/2, cy, bodyW, bodyH, 12);
  ctx.fill(); ctx.stroke();
  // 화면 (LCD)
  ctx.fillStyle='#0f172a';
  ctx.beginPath();
  ctx.roundRect(cx-bodyW/2+15, cy+15, bodyW-30, 50, 6);
  ctx.fill();
  // 숫자 (모노스페이스, 빨강)
  ctx.font = 'bold 32px "Courier New", monospace';
  ctx.fillStyle='#ef4444'; ctx.textAlign='right';
  ctx.fillText(m.dv + ' g', cx+bodyW/2-25, cy+50);
  // 라벨
  ctx.font='11px sans-serif'; ctx.fillStyle='#1e293b'; ctx.textAlign='center';
  ctx.fillText('Digital Balance', cx, cy+85);
  // 위 접시 (윗부분)
  ctx.fillStyle='#94a3b8'; ctx.beginPath();
  ctx.ellipse(cx, cy-15, 90, 12, 0, 0, Math.PI*2);
  ctx.fill(); ctx.stroke();
  // 시료
  ctx.fillStyle='#fbbf24'; ctx.beginPath();
  ctx.roundRect(cx-30, cy-30, 60, 16, 4);
  ctx.fill();
}
// #30 — 메스플라스크
function drawFlask(ctx, w, h, m) {
  const v = m.val, cx = w/2, cy = 30;
  const neckW = 28, neckH = 100, bodyR = 60;
  const totalH = neckH + bodyR * 2;
  // 외형
  ctx.strokeStyle='#0284c7'; ctx.lineWidth=2; ctx.fillStyle='#e0f2fe';
  ctx.beginPath();
  ctx.moveTo(cx-neckW/2, cy);
  ctx.lineTo(cx-neckW/2, cy+neckH);
  ctx.arc(cx, cy+neckH+bodyR, bodyR, Math.PI, 0, true);
  ctx.lineTo(cx+neckW/2, cy);
  ctx.stroke();
  // 표시선 (눈금 한 개) — 100 mL 표준
  const markY = cy + neckH - 20;
  ctx.strokeStyle='#dc2626'; ctx.lineWidth=1.5;
  ctx.beginPath();
  ctx.moveTo(cx-neckW/2, markY); ctx.lineTo(cx+neckW/2, markY);
  ctx.stroke();
  ctx.font='10px sans-serif'; ctx.fillStyle='#dc2626'; ctx.textAlign='left';
  ctx.fillText('100 mL', cx+neckW/2+4, markY+3);
  // 액체
  const liquidTop = cy + neckH - (v >= 100 ? 25 : (100-v)*0.5);  // 임의 매핑
  ctx.fillStyle='rgba(59,130,246,.25)';
  ctx.beginPath();
  ctx.moveTo(cx-neckW/2, Math.max(cy+neckH/3, liquidTop));
  ctx.lineTo(cx-neckW/2, cy+neckH);
  ctx.arc(cx, cy+neckH+bodyR, bodyR-1, Math.PI, 0, true);
  ctx.lineTo(cx+neckW/2, Math.max(cy+neckH/3, liquidTop));
  ctx.quadraticCurveTo(cx, Math.max(cy+neckH/3, liquidTop)+3, cx-neckW/2, Math.max(cy+neckH/3, liquidTop));
  ctx.fill();
  // 라벨
  ctx.font='11px sans-serif'; ctx.textAlign='center'; ctx.fillStyle='#475569';
  ctx.fillText('mL', cx, cy-6);
  ctx.fillStyle='#ef4444'; ctx.font='bold 11px sans-serif';
  ctx.fillText('← 읽으세요', cx+bodyR+15, cy+neckH+bodyR);
}

function drawInst(cv, m) {
  const ctx = cv.getContext('2d'), w = cv.width, h = cv.height;
  ctx.clearRect(0, 0, w, h);
  if (m.type === 'ruler') drawRuler(ctx, w, h, m);
  else if (m.type === 'cylinder') drawCyl(ctx, w, h, m);
  else if (m.type === 'thermometer') drawTherm(ctx, w, h, m);
  else if (m.type === 'beaker') drawBeaker(ctx, w, h, m);
  else if (m.type === 'scale') drawScale(ctx, w, h, m);
  else if (m.type === 'flask') drawFlask(ctx, w, h, m);
  else drawTherm(ctx, w, h, m);
}

// ==================== Render 슬립 warm-up (#22) ====================
// 5분마다 헬스 체크 ping — Render free 슬립 방지 + 백그라운드 시 일시 중단
let _wakeUpTimer = null;
function startWarmUpPing() {
  if (_wakeUpTimer) clearInterval(_wakeUpTimer);
  _wakeUpTimer = setInterval(() => {
    if (document.hidden) return;
    fetch('/api/health', { method: 'GET' }).catch(() => {});
  }, 5 * 60 * 1000);
}
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    startWarmUpPing();
    // 버전 푸터 자동 삽입 (#73)
    setTimeout(async () => {
      const v = await checkVersionMismatch();
      if (v && !document.getElementById('app-version-footer')) {
        const f = document.createElement('div');
        f.id = 'app-version-footer';
        f.style.cssText = 'position:fixed;bottom:6px;right:8px;font-size:.7rem;color:rgba(148,163,184,.4);pointer-events:none;z-index:1;font-family:monospace';
        f.textContent = 'v' + v;
        document.body.appendChild(f);
      }
    }, 800);
  });
}

// 클라이언트가 알고 있는 버전 (#73) — 서버 버전과 다르면 사용자에게 갱신 안내
async function checkVersionMismatch() {
  try {
    const r = await fetch('/api/version').then(r => r.json());
    const known = localStorage.getItem('sigfig-version-seen');
    if (known && r.version && r.version !== 'dev' && known !== r.version) {
      // 새 버전이 배포됐음 — toast 안내 (toast가 정의된 후 호출됨)
      setTimeout(() => {
        if (typeof toast === 'function') {
          toast('🔄 새 버전이 배포되었어요 — 페이지 새로고침을 권장합니다 (' + r.version + ')', 'info', 8000);
        }
      }, 1000);
    }
    if (r.version) localStorage.setItem('sigfig-version-seen', r.version);
    return r.version;
  } catch (_) { return null; }
}

// ==================== API 헬퍼 (네트워크 오류 자동 재시도 + 오프라인 표시) ====================
let _onlineState = true;
function _setOnline(ok) {
  if (ok === _onlineState) return;
  _onlineState = ok;
  let bar = document.getElementById('offline-bar');
  if (!ok) {
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'offline-bar';
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#dc2626;color:#fff;padding:8px 14px;text-align:center;font-weight:600;font-size:.92rem;box-shadow:0 2px 8px rgba(0,0,0,.4)';
      bar.textContent = '⚠️ 네트워크 연결이 끊겼습니다. 자동으로 재시도 중...';
      document.body.appendChild(bar);
    }
  } else if (bar) bar.remove();
}
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const tStu = localStorage.getItem('sigfig-token');
  const tTch = localStorage.getItem('sigfig-teacher-token');
  // 우선순위: opts.asTeacher 명시 > /api/teacher/* > 학생 토큰
  if (opts.asTeacher && tTch) headers['Authorization'] = 'Bearer ' + tTch;
  else if (path.startsWith('/api/teacher') && tTch) headers['Authorization'] = 'Bearer ' + tTch;
  else if (tStu) headers['Authorization'] = 'Bearer ' + tStu;
  const maxRetries = opts.noRetry ? 0 : 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const r = await fetch(path, {
        method: opts.method || 'GET',
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      _setOnline(true);
      try { return await r.json(); } catch { return { error: 'parse error' }; }
    } catch (e) {
      _setOnline(false);
      if (attempt === maxRetries) return { error: '네트워크 오류 — 연결을 확인하세요' };
      await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
    }
  }
}

// ==================== Toast 알림 시스템 ====================
function ensureToastHost() {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('aria-atomic', 'true');
    host.style.cssText = 'position:fixed;top:18px;right:18px;z-index:10000;display:flex;flex-direction:column;gap:8px;max-width:340px;pointer-events:none';
    document.body.appendChild(host);
  }
  return host;
}
function toast(msg, type = 'info', ms = 3500) {
  const host = ensureToastHost();
  const el = document.createElement('div');
  const colors = {
    info: { bg:'#1e40af', fg:'#dbeafe', emoji:'ℹ️' },
    ok:   { bg:'#065f46', fg:'#d1fae5', emoji:'✅' },
    warn: { bg:'#92400e', fg:'#fef3c7', emoji:'⚠️' },
    err:  { bg:'#991b1b', fg:'#fee2e2', emoji:'❌' },
  };
  const c = colors[type] || colors.info;
  el.style.cssText = `background:${c.bg};color:${c.fg};padding:10px 14px;border-radius:10px;font-size:.92rem;font-weight:600;box-shadow:0 4px 14px rgba(0,0,0,.4);pointer-events:auto;animation:fadeIn .2s;cursor:pointer;border-left:4px solid ${c.fg}`;
  el.innerHTML = `${c.emoji} ${escapeHtml(msg)}`;
  el.onclick = () => el.remove();
  host.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .25s'; setTimeout(() => el.remove(), 260); }, ms);
}

// ==================== 모달 시스템 ====================
function modal({ title, body, actions, onClose, wide = false }) {
  return new Promise(resolve => {
    const back = document.createElement('div');
    back.className = 'modal-back show';
    back.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:9000;padding:20px;animation:fadeIn .15s';
    const m = document.createElement('div');
    m.style.cssText = `background:var(--bg2,#1e293b);border:1px solid var(--bg3,#334155);border-radius:14px;padding:24px;max-width:${wide?'780px':'520px'};width:100%;max-height:90vh;overflow:auto;color:var(--txt,#f1f5f9)`;
    const close = (val) => { back.remove(); if (onClose) onClose(); resolve(val); };
    let bodyHtml = '';
    if (typeof body === 'string') bodyHtml = body;
    m.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:12px">
        <h3 style="margin:0;font-size:1.2rem">${escapeHtml(title || '')}</h3>
        <button class="btn btn-ghost btn-sm" data-modal-close>✖</button>
      </div>
      <div data-modal-body>${bodyHtml}</div>
      <div data-modal-actions style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px;flex-wrap:wrap"></div>
    `;
    if (typeof body !== 'string' && body instanceof Node) {
      m.querySelector('[data-modal-body]').innerHTML = '';
      m.querySelector('[data-modal-body]').appendChild(body);
    }
    const ab = m.querySelector('[data-modal-actions]');
    (actions || [{ label:'닫기', value:null, kind:'ghost' }]).forEach(a => {
      const b = document.createElement('button');
      b.className = 'btn btn-' + (a.kind || 'pri');
      b.textContent = a.label;
      b.onclick = () => close(a.value);
      ab.appendChild(b);
    });
    m.querySelector('[data-modal-close]').onclick = () => close(null);
    back.appendChild(m);
    back.addEventListener('click', e => { if (e.target === back) close(null); });
    document.body.appendChild(back);
    // ESC 닫기
    const onKey = (e) => { if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); close(null); } };
    document.addEventListener('keydown', onKey);
    // 자동 포커스 — 첫 입력 또는 첫 버튼
    setTimeout(() => {
      const f = m.querySelector('input, select, textarea, button:not([data-modal-close])');
      if (f) f.focus();
    }, 50);
  });
}
async function confirmDialog(msg, opts = {}) {
  const v = await modal({
    title: opts.title || '확인',
    body: `<div style="line-height:1.6;color:var(--txt2,#94a3b8);white-space:pre-wrap">${escapeHtml(msg)}</div>`,
    actions: [
      { label: opts.cancelLabel || '취소', value: false, kind: 'ghost' },
      { label: opts.okLabel || '확인', value: true, kind: opts.danger ? 'err' : 'pri' },
    ],
  });
  return v === true;
}
async function promptDialog(msg, defaultValue = '', opts = {}) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<div style="line-height:1.6;color:var(--txt2,#94a3b8);margin-bottom:12px">${escapeHtml(msg)}</div>
      <input type="${opts.type||'text'}" class="prompt-input" style="width:100%;padding:10px 14px;border-radius:10px;border:1px solid var(--bg3,#334155);background:var(--bg,#0f172a);color:var(--txt,#f1f5f9);font-size:1rem" value="${escapeHtml(defaultValue)}" maxlength="${opts.maxLength||100}">`;
    modal({
      title: opts.title || '입력',
      body: wrap,
      actions: [
        { label: '취소', value: '__cancel__', kind: 'ghost' },
        { label: opts.okLabel || '확인', value: '__ok__', kind: 'pri' },
      ],
    }).then(v => {
      if (v === '__ok__') resolve(wrap.querySelector('.prompt-input').value);
      else resolve(null);
    });
    setTimeout(() => { const i = wrap.querySelector('.prompt-input'); if (i) { i.focus(); i.select(); }}, 60);
  });
}

// ==================== 클립보드 복사 ====================
async function copyToClipboard(text, label) {
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
    else {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    toast(`복사됨: ${label || text}`, 'ok', 2200);
    return true;
  } catch (e) { toast('복사 실패', 'err'); return false; }
}

// ==================== QR 코드 (의존성 0 — 단순 SVG 생성) ====================
// Numeric/alphanumeric/byte 모드, ECC L. 학생 입장 URL 같은 짧은 텍스트용.
function qrSvg(text, size = 200) {
  // 간단한 외부 호환: api.qrserver.com 경유 (offline fallback: chunk fallback)
  // 무의존 구현은 너무 길어 외부 이미지 사용 — 무료/안정. 폴백으로 텍스트 표시.
  const enc = encodeURIComponent(text);
  return `<img src="https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${enc}" alt="QR코드" width="${size}" height="${size}" style="background:#fff;padding:6px;border-radius:8px" onerror="this.outerHTML='<div style=\\'padding:10px;background:#0f172a;border:1px dashed #334155;border-radius:8px;font-family:monospace;font-size:.85rem;word-break:break-all\\'>${escapeHtml(text)}</div>'">`;
}

// ==================== 사운드 (Web Audio — 작은 비프) ====================
let _audioCtx = null;
function _ctx() {
  if (_audioCtx) return _audioCtx;
  try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  return _audioCtx;
}
function _soundEnabled() { return localStorage.getItem('sigfig-sound') !== 'off'; }
function setSoundEnabled(on) { localStorage.setItem('sigfig-sound', on ? 'on' : 'off'); }
function beep(kind = 'tick') {
  if (!_soundEnabled()) return;
  const ctx = _ctx(); if (!ctx) return;
  const presets = {
    tick:    { f: 440, dur: 0.06, type: 'sine',     gain: 0.05 },
    correct: { f: 880, dur: 0.18, type: 'triangle', gain: 0.1, slide: 1320 },
    wrong:   { f: 220, dur: 0.22, type: 'sawtooth', gain: 0.07, slide: 110 },
    warn:    { f: 660, dur: 0.12, type: 'square',   gain: 0.08 },
    win:     { f: 523, dur: 0.5,  type: 'triangle', gain: 0.1, slide: 1046 },
    countdown:{ f: 700, dur: 0.08, type: 'sine',    gain: 0.06 },
  };
  const p = presets[kind] || presets.tick;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = p.type; o.frequency.setValueAtTime(p.f, ctx.currentTime);
  if (p.slide) o.frequency.exponentialRampToValueAtTime(p.slide, ctx.currentTime + p.dur);
  g.gain.setValueAtTime(p.gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + p.dur);
  o.connect(g); g.connect(ctx.destination);
  o.start(); o.stop(ctx.currentTime + p.dur);
}

// ==================== 테마 토글 (다크 기본 / 라이트) ====================
function getTheme() { return localStorage.getItem('sigfig-theme') || 'dark'; }
function setTheme(t) {
  localStorage.setItem('sigfig-theme', t);
  document.documentElement.setAttribute('data-theme', t);
}
// 페이지 로드 즉시 적용
(function applyThemeImmediately() {
  if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', getTheme());
})();

// ==================== 폰트 크기 (3단계) ====================
function getFontScale() { return parseFloat(localStorage.getItem('sigfig-font-scale') || '1'); }
function setFontScale(v) {
  v = Math.max(0.85, Math.min(1.3, v));
  localStorage.setItem('sigfig-font-scale', String(v));
  document.documentElement.style.fontSize = (16 * v) + 'px';
}
(function applyFontImmediately() {
  if (typeof document !== 'undefined') document.documentElement.style.fontSize = (16 * getFontScale()) + 'px';
})();

// ==================== 차단어 필터 (학생 닉네임용) ====================
const BAD_WORDS = ['시발','씨발','병신','개새','존나','좆','꺼져','지랄','새끼','fuck','shit','bitch','asshole','damn'];
function isBadName(name) {
  if (!name) return false;
  const s = String(name).toLowerCase().replace(/\s/g,'');
  return BAD_WORDS.some(w => s.includes(w));
}

// ==================== 모션 감소 헬퍼 ====================
function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ==================== 키보드 ESC 헬퍼 ====================
function onEscape(fn) {
  const h = (e) => { if (e.key === 'Escape') fn(e); };
  document.addEventListener('keydown', h);
  return () => document.removeEventListener('keydown', h);
}
