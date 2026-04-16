import React, { useCallback, useRef } from 'react';
import { usePresentation } from '../../PresentationContext';
import { COLORS } from '../../constants';
import SlideThumbnail from './SlideThumbnail';

export default function SlidePanel() {
  const { state, actions } = usePresentation();
  const dragItemRef = useRef(null);
  const dragOverRef = useRef(null);

  const handleDragStart = useCallback((index) => {
    dragItemRef.current = index;
  }, []);

  const handleDragOver = useCallback((e, index) => {
    e.preventDefault();
    dragOverRef.current = index;
  }, []);

  const handleDrop = useCallback(() => {
    if (dragItemRef.current !== null && dragOverRef.current !== null && dragItemRef.current !== dragOverRef.current) {
      actions.moveSlide(dragItemRef.current, dragOverRef.current);
    }
    dragItemRef.current = null;
    dragOverRef.current = null;
  }, [actions]);

  return (
    <div style={panelStyle}>
      {/* 헤더 */}
      <div style={headerStyle}>
        <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.grayLight, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          슬라이드 ({state.slides.length})
        </span>
        <button onClick={() => actions.addSlide()} style={addBtnStyle} title="새 슬라이드 (Ctrl+M)">
          +
        </button>
      </div>

      {/* 슬라이드 목록 */}
      <div style={listStyle}>
        {state.slides.map((slide, index) => (
          <div
            key={slide.id}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={handleDrop}
            onClick={() => actions.setActiveSlide(index)}
            onContextMenu={(e) => {
              e.preventDefault();
              actions.setUI({
                contextMenu: {
                  x: e.clientX,
                  y: e.clientY,
                  slideIndex: index,
                  type: 'slide'
                }
              });
            }}
            style={{
              ...slideItemStyle,
              borderColor: index === state.activeSlideIndex ? COLORS.primary : 'transparent',
              background: index === state.activeSlideIndex ? 'rgba(67,97,238,0.1)' : 'transparent'
            }}
          >
            <div style={{ fontSize: 10, color: COLORS.grayLight, marginBottom: 4, textAlign: 'center' }}>
              {index + 1}
            </div>
            <SlideThumbnail slide={slide} isActive={index === state.activeSlideIndex} />
          </div>
        ))}
      </div>

      {/* 하단 버튼 */}
      <div style={footerStyle}>
        <button onClick={() => actions.addSlide()} style={footerBtnStyle} title="슬라이드 추가">
          + 추가
        </button>
        <button onClick={() => actions.duplicateSlide()} style={footerBtnStyle} title="현재 슬라이드 복제">
          ⎘ 복제
        </button>
        <button
          onClick={() => actions.deleteSlide()}
          style={{ ...footerBtnStyle, color: state.slides.length <= 1 ? COLORS.grayDark : COLORS.danger }}
          disabled={state.slides.length <= 1}
          title="슬라이드 삭제"
        >
          🗑
        </button>
      </div>
    </div>
  );
}

const panelStyle = {
  width: 200,
  background: 'rgba(26,26,46,0.95)',
  borderRight: '1px solid rgba(255,255,255,0.08)',
  display: 'flex',
  flexDirection: 'column',
  userSelect: 'none'
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 12px 6px',
};

const addBtnStyle = {
  width: 24, height: 24,
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(67,97,238,0.2)',
  color: COLORS.primary,
  fontSize: 16,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0
};

const listStyle = {
  flex: 1,
  overflowY: 'auto',
  padding: '4px 8px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6
};

const slideItemStyle = {
  padding: '6px',
  borderRadius: 8,
  border: '2px solid transparent',
  cursor: 'pointer',
  transition: 'all 0.15s'
};

const footerStyle = {
  display: 'flex',
  gap: 4,
  padding: '8px',
  borderTop: '1px solid rgba(255,255,255,0.06)'
};

const footerBtnStyle = {
  flex: 1,
  padding: '4px 6px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 4,
  color: COLORS.grayLight,
  fontSize: 11,
  cursor: 'pointer'
};
