import React, { useRef, useEffect, useState } from 'react';
import { SLIDE_WIDTH, SLIDE_HEIGHT, COLORS } from '../../constants';

const THUMB_WIDTH = 168;
const THUMB_HEIGHT = THUMB_WIDTH / (SLIDE_WIDTH / SLIDE_HEIGHT);

export default function SlideThumbnail({ slide, isActive }) {
  const canvasRef = useRef(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let mounted = true;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = THUMB_WIDTH * 2; // retina
    canvas.height = THUMB_HEIGHT * 2;
    ctx.scale(2, 2);

    // 배경
    const bg = slide.background?.value || COLORS.dark;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);

    const scaleX = THUMB_WIDTH / SLIDE_WIDTH;
    const scaleY = THUMB_HEIGHT / SLIDE_HEIGHT;

    // 간단한 요소 렌더링 (미니 프리뷰)
    (slide.elements || []).forEach(el => {
      const fd = el.fabricData;
      if (!fd) return;

      ctx.save();
      ctx.globalAlpha = fd.opacity ?? 1;

      const x = (fd.left || 0) * scaleX;
      const y = (fd.top || 0) * scaleY;

      if (fd.type === 'textbox') {
        ctx.fillStyle = fd.fill || '#ffffff';
        ctx.font = `${Math.max(3, (fd.fontSize || 24) * scaleX)}px sans-serif`;
        const text = (fd.text || '').substring(0, 30);
        ctx.fillText(text, x, y + (fd.fontSize || 24) * scaleY);
      } else if (fd.type === 'rect') {
        ctx.fillStyle = fd.fill || COLORS.primary;
        const w = (fd.width || 100) * scaleX;
        const h = (fd.height || 100) * scaleY;
        const r = Math.min((fd.rx || 0) * scaleX, w / 2, h / 2);
        roundRect(ctx, x, y, w, h, r);
        ctx.fill();
      } else if (fd.type === 'circle') {
        ctx.fillStyle = fd.fill || COLORS.accent;
        const r = (fd.radius || 50) * scaleX;
        ctx.beginPath();
        ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
        ctx.fill();
      } else if (fd.type === 'line') {
        ctx.strokeStyle = fd.stroke || '#ffffff';
        ctx.lineWidth = Math.max(1, (fd.strokeWidth || 2) * scaleX);
        ctx.beginPath();
        ctx.moveTo((fd.x1 || 0) * scaleX, (fd.y1 || 0) * scaleY);
        ctx.lineTo((fd.x2 || 100) * scaleX, (fd.y2 || 0) * scaleY);
        ctx.stroke();
      } else if (fd.type === 'image' && fd.src) {
        const img = new Image();
        img.onload = () => {
          if (!mounted) return;
          const sw = img.width * (fd.scaleX || 1) * scaleX;
          const sh = img.height * (fd.scaleY || 1) * scaleY;
          ctx.drawImage(img, x, y, sw, sh);
        };
        img.src = fd.src;
      }

      ctx.restore();
    });

    setRendered(true);

    return () => { mounted = false; };
  }, [slide, slide.elements, slide.background]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: THUMB_WIDTH,
        height: THUMB_HEIGHT,
        borderRadius: 4,
        display: 'block'
      }}
    />
  );
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
