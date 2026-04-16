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
