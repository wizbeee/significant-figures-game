import { SLIDE_WIDTH, SLIDE_HEIGHT, DEFAULT_FONT, COLORS } from '../constants';

// Fabric.js 객체 생성 헬퍼
// Fabric.js는 캔버스 내에서 동적으로 import하므로 여기서는 설정값만 반환

export function createTextboxConfig(options = {}) {
  return {
    type: 'textbox',
    fabricData: {
      type: 'textbox',
      text: options.text || '텍스트를 입력하세요',
      left: options.left ?? SLIDE_WIDTH / 2 - 200,
      top: options.top ?? SLIDE_HEIGHT / 2 - 30,
      width: options.width || 400,
      fontFamily: options.fontFamily || DEFAULT_FONT,
      fontSize: options.fontSize || 24,
      fill: options.fill || COLORS.white,
      fontWeight: options.fontWeight || 'normal',
      fontStyle: options.fontStyle || '',
      textAlign: options.textAlign || 'left',
      lineHeight: options.lineHeight || 1.3,
      editable: true,
      ...options.extra
    }
  };
}

export function createRectConfig(options = {}) {
  return {
    type: 'rect',
    fabricData: {
      type: 'rect',
      left: options.left ?? SLIDE_WIDTH / 2 - 100,
      top: options.top ?? SLIDE_HEIGHT / 2 - 75,
      width: options.width || 200,
      height: options.height || 150,
      fill: options.fill || COLORS.primary,
      stroke: options.stroke || '',
      strokeWidth: options.strokeWidth || 0,
      rx: options.rx || 8,
      ry: options.ry || 8,
      opacity: options.opacity ?? 1,
      ...options.extra
    }
  };
}

export function createCircleConfig(options = {}) {
  return {
    type: 'circle',
    fabricData: {
      type: 'circle',
      left: options.left ?? SLIDE_WIDTH / 2 - 75,
      top: options.top ?? SLIDE_HEIGHT / 2 - 75,
      radius: options.radius || 75,
      fill: options.fill || COLORS.accent,
      stroke: options.stroke || '',
      strokeWidth: options.strokeWidth || 0,
      opacity: options.opacity ?? 1,
      ...options.extra
    }
  };
}

export function createLineConfig(options = {}) {
  return {
    type: 'line',
    fabricData: {
      type: 'line',
      x1: options.x1 ?? SLIDE_WIDTH / 2 - 100,
      y1: options.y1 ?? SLIDE_HEIGHT / 2,
      x2: options.x2 ?? SLIDE_WIDTH / 2 + 100,
      y2: options.y2 ?? SLIDE_HEIGHT / 2,
      stroke: options.stroke || COLORS.white,
      strokeWidth: options.strokeWidth || 3,
      ...options.extra
    }
  };
}

export function createArrowConfig(options = {}) {
  return {
    type: 'arrow',
    fabricData: {
      type: 'line',
      x1: options.x1 ?? SLIDE_WIDTH / 2 - 100,
      y1: options.y1 ?? SLIDE_HEIGHT / 2,
      x2: options.x2 ?? SLIDE_WIDTH / 2 + 100,
      y2: options.y2 ?? SLIDE_HEIGHT / 2,
      stroke: options.stroke || COLORS.white,
      strokeWidth: options.strokeWidth || 3,
      ...options.extra
    },
    arrowHead: true
  };
}

export function createImageConfig(dataUrl, options = {}) {
  return {
    type: 'image',
    fabricData: {
      type: 'image',
      src: dataUrl,
      left: options.left ?? SLIDE_WIDTH / 2 - 150,
      top: options.top ?? SLIDE_HEIGHT / 2 - 150,
      scaleX: options.scaleX || 1,
      scaleY: options.scaleY || 1,
      ...options.extra
    }
  };
}

// AI 생성 결과를 Fabric 요소로 변환
export function aiSlideToElements(aiSlide) {
  const elements = [];
  const layoutMap = {
    'title-only': () => {
      elements.push(createTextboxConfig({
        text: aiSlide.title || '',
        left: 100, top: SLIDE_HEIGHT / 2 - 60,
        width: SLIDE_WIDTH - 200,
        fontSize: 56, fontWeight: 'bold', textAlign: 'center',
        fill: '#ffffff'
      }));
    },
    'title-body': () => {
      elements.push(createTextboxConfig({
        text: aiSlide.title || '',
        left: 100, top: 80,
        width: SLIDE_WIDTH - 200,
        fontSize: 48, fontWeight: 'bold',
        fill: '#ffffff'
      }));
      const bodyText = (aiSlide.elements || [])
        .filter(e => e.type === 'text' && e.style !== 'heading')
        .map(e => e.content).join('\n\n');
      if (bodyText) {
        elements.push(createTextboxConfig({
          text: bodyText,
          left: 100, top: 200,
          width: SLIDE_WIDTH - 200,
          fontSize: 24,
          fill: '#e0e0e0'
        }));
      }
    },
    'two-column': () => {
      elements.push(createTextboxConfig({
        text: aiSlide.title || '',
        left: 100, top: 60,
        width: SLIDE_WIDTH - 200,
        fontSize: 44, fontWeight: 'bold',
        fill: '#ffffff'
      }));
      const texts = (aiSlide.elements || []).filter(e => e.type === 'text' && e.style !== 'heading');
      const half = Math.ceil(texts.length / 2);
      const leftText = texts.slice(0, half).map(e => e.content).join('\n\n');
      const rightText = texts.slice(half).map(e => e.content).join('\n\n');
      if (leftText) {
        elements.push(createTextboxConfig({
          text: leftText,
          left: 80, top: 180,
          width: (SLIDE_WIDTH - 200) / 2 - 20,
          fontSize: 22, fill: '#e0e0e0'
        }));
      }
      if (rightText) {
        elements.push(createTextboxConfig({
          text: rightText,
          left: SLIDE_WIDTH / 2 + 20, top: 180,
          width: (SLIDE_WIDTH - 200) / 2 - 20,
          fontSize: 22, fill: '#e0e0e0'
        }));
      }
    }
  };

  const layoutFn = layoutMap[aiSlide.layout] || layoutMap['title-body'];
  layoutFn();

  // 장식 도형 추가
  const shapes = (aiSlide.elements || []).filter(e => e.type === 'shape');
  shapes.forEach((s, i) => {
    if (s.shape === 'rect') {
      elements.push(createRectConfig({
        left: 60, top: 160 + i * 10,
        width: SLIDE_WIDTH - 120, height: 4,
        fill: '#4361ee', extra: { opacity: 0.5 }
      }));
    }
  });

  return elements;
}
