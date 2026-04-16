import React, { useRef, useEffect, useCallback, useState } from 'react';
import { usePresentation } from '../../PresentationContext';
import { SLIDE_WIDTH, SLIDE_HEIGHT, COLORS } from '../../constants';

let fabric;

export default function SlideEditor() {
  const { state, actions } = usePresentation();
  const canvasRef = useRef(null);
  const fabricRef = useRef(null);
  const containerRef = useRef(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const isLoadingRef = useRef(false);

  const currentSlide = state.slides[state.activeSlideIndex];
  const zoom = state.ui.zoom / 100;

  // Fabric.js 초기화
  useEffect(() => {
    let mounted = true;
    import('fabric').then(mod => {
      if (!mounted) return;
      fabric = mod.fabric || mod;

      if (fabricRef.current) fabricRef.current.dispose();

      const canvas = new fabric.Canvas(canvasRef.current, {
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT,
        backgroundColor: COLORS.dark,
        selection: true,
        preserveObjectStacking: true,
        stopContextMenu: true,
        fireRightClick: true
      });

      fabricRef.current = canvas;
      setCanvasReady(true);

      // 이벤트: 객체 수정
      const handleModified = () => {
        if (isLoadingRef.current) return;
        syncCanvasToState();
      };

      canvas.on('object:modified', handleModified);
      canvas.on('text:changed', handleModified);

      // 이벤트: 선택 변경
      canvas.on('selection:created', (e) => {
        const ids = (e.selected || []).map(obj => obj._elementId).filter(Boolean);
        actions.setSelection(ids);
      });
      canvas.on('selection:updated', (e) => {
        const ids = (e.selected || []).map(obj => obj._elementId).filter(Boolean);
        actions.setSelection(ids);
      });
      canvas.on('selection:cleared', () => {
        actions.clearSelection();
      });

      // 이벤트: 마우스 클릭 (빈 영역)
      canvas.on('mouse:down', (e) => {
        if (e.button === 3) {
          // 우클릭 컨텍스트 메뉴
          const pointer = canvas.getPointer(e.e);
          actions.setUI({
            contextMenu: {
              x: e.e.clientX,
              y: e.e.clientY,
              canvasX: pointer.x,
              canvasY: pointer.y,
              target: e.target ? e.target._elementId : null
            }
          });
        } else {
          actions.setUI({ contextMenu: null });
        }
      });

      // 드래그&드롭 이미지
      const canvasEl = canvas.getElement().parentElement;
      canvasEl.addEventListener('dragover', (e) => { e.preventDefault(); });
      canvasEl.addEventListener('drop', async (e) => {
        e.preventDefault();
        const files = e.dataTransfer.files;
        for (const file of files) {
          if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (ev) => {
              const dataUrl = ev.target.result;
              actions.addElement({
                type: 'image',
                fabricData: {
                  type: 'image',
                  src: dataUrl,
                  left: SLIDE_WIDTH / 2 - 150,
                  top: SLIDE_HEIGHT / 2 - 150,
                  scaleX: 0.5,
                  scaleY: 0.5
                }
              });
            };
            reader.readAsDataURL(file);
          }
        }
      });
    });

    return () => {
      mounted = false;
      if (fabricRef.current) {
        fabricRef.current.dispose();
        fabricRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 슬라이드 변경 시 캔버스에 로드
  useEffect(() => {
    if (!canvasReady || !fabricRef.current || !currentSlide) return;
    loadSlideToCanvas(currentSlide);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasReady, state.activeSlideIndex, currentSlide?.id]);

  // 외부에서 요소가 추가/삭제된 경우 동기화
  useEffect(() => {
    if (!canvasReady || !fabricRef.current || !currentSlide) return;
    const canvasObjCount = fabricRef.current.getObjects().length;
    const stateElCount = currentSlide.elements.length;
    if (canvasObjCount !== stateElCount) {
      loadSlideToCanvas(currentSlide);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlide?.elements?.length]);

  // 배경 변경
  useEffect(() => {
    if (!fabricRef.current || !currentSlide) return;
    const bg = currentSlide.background;
    if (bg.type === 'color') {
      fabricRef.current.backgroundColor = bg.value;
    } else if (bg.type === 'image' && fabric) {
      fabric.Image.fromURL(bg.value, (img) => {
        fabricRef.current.setBackgroundImage(img, fabricRef.current.renderAll.bind(fabricRef.current), {
          scaleX: SLIDE_WIDTH / img.width,
          scaleY: SLIDE_HEIGHT / img.height
        });
      });
    }
    fabricRef.current.renderAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlide?.background]);

  // 줌 변경
  useEffect(() => {
    if (!containerRef.current) return;
    const wrapper = containerRef.current.querySelector('.canvas-container');
    if (wrapper) {
      wrapper.style.transform = `scale(${zoom})`;
      wrapper.style.transformOrigin = 'center center';
    }
  }, [zoom]);

  // 캔버스 → 상태 동기화
  const syncCanvasToState = useCallback(() => {
    if (!fabricRef.current || isLoadingRef.current) return;
    const canvas = fabricRef.current;
    const objects = canvas.getObjects();
    const updates = objects.map(obj => ({
      id: obj._elementId,
      updates: { fabricData: obj.toObject(['_elementId']) }
    })).filter(u => u.id);
    if (updates.length > 0) {
      actions.updateElementsBatch(updates);
    }
  }, [actions]);

  // 슬라이드 데이터를 캔버스에 로드
  const loadSlideToCanvas = useCallback((slide) => {
    if (!fabricRef.current || !fabric) return;
    isLoadingRef.current = true;
    const canvas = fabricRef.current;
    canvas.clear();

    // 배경
    if (slide.background?.type === 'color') {
      canvas.backgroundColor = slide.background.value;
    }

    // 요소 로드
    const loadPromises = slide.elements.map(el => {
      return new Promise((resolve) => {
        const fd = el.fabricData;
        if (!fd) return resolve();

        if (fd.type === 'textbox') {
          const textbox = new fabric.Textbox(fd.text || '', {
            ...fd,
            _elementId: el.id
          });
          canvas.add(textbox);
          resolve();
        } else if (fd.type === 'rect') {
          const rect = new fabric.Rect({ ...fd, _elementId: el.id });
          canvas.add(rect);
          resolve();
        } else if (fd.type === 'circle') {
          const circle = new fabric.Circle({ ...fd, _elementId: el.id });
          canvas.add(circle);
          resolve();
        } else if (fd.type === 'line') {
          const line = new fabric.Line([fd.x1 || 0, fd.y1 || 0, fd.x2 || 100, fd.y2 || 0], {
            ...fd,
            _elementId: el.id
          });
          canvas.add(line);
          resolve();
        } else if (fd.type === 'image' && fd.src) {
          fabric.Image.fromURL(fd.src, (img) => {
            img.set({ ...fd, _elementId: el.id });
            canvas.add(img);
            resolve();
          }, { crossOrigin: 'anonymous' });
        } else {
          resolve();
        }
      });
    });

    Promise.all(loadPromises).then(() => {
      canvas.renderAll();
      isLoadingRef.current = false;
    });
  }, []);

  // 캔버스를 DataURL로 내보내기 (썸네일용)
  const getCanvasDataUrl = useCallback((scale = 0.15) => {
    if (!fabricRef.current) return null;
    return fabricRef.current.toDataURL({ format: 'png', multiplier: scale });
  }, []);

  // 외부에서 접근할 수 있도록 ref 노출
  useEffect(() => {
    window.__slideEditorCanvas = fabricRef;
    window.__slideEditorGetDataUrl = getCanvasDataUrl;
    return () => {
      delete window.__slideEditorCanvas;
      delete window.__slideEditorGetDataUrl;
    };
  }, [getCanvasDataUrl]);

  // 컨테이너 크기 계산
  const containerStyle = {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'auto',
    background: '#0f0f23',
    position: 'relative'
  };

  const canvasWrapperStyle = {
    position: 'relative',
    width: SLIDE_WIDTH,
    height: SLIDE_HEIGHT,
    transform: `scale(${zoom})`,
    transformOrigin: 'center center',
    boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
    borderRadius: 4
  };

  return (
    <div ref={containerRef} style={containerStyle}>
      <div style={canvasWrapperStyle}>
        <canvas ref={canvasRef} />
      </div>

      {/* 줌 컨트롤 */}
      <div style={{
        position: 'absolute', bottom: 16, right: 16,
        display: 'flex', gap: 4, alignItems: 'center',
        background: 'rgba(26,26,46,0.9)', borderRadius: 8, padding: '4px 12px',
        fontSize: 13, color: COLORS.light
      }}>
        <button onClick={() => actions.setZoom(state.ui.zoom - 10)}
          style={zoomBtnStyle}>-</button>
        <span style={{ minWidth: 45, textAlign: 'center' }}>{state.ui.zoom}%</span>
        <button onClick={() => actions.setZoom(state.ui.zoom + 10)}
          style={zoomBtnStyle}>+</button>
        <button onClick={() => actions.setZoom(100)}
          style={{ ...zoomBtnStyle, fontSize: 11, padding: '2px 6px' }}>맞춤</button>
      </div>
    </div>
  );
}

const zoomBtnStyle = {
  background: 'rgba(255,255,255,0.1)',
  border: 'none',
  color: '#fff',
  borderRadius: 4,
  padding: '2px 8px',
  cursor: 'pointer',
  fontSize: 14
};
