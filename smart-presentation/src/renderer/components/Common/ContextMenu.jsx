import React, { useEffect, useRef } from 'react';
import { usePresentation } from '../../PresentationContext';
import { COLORS } from '../../constants';

export default function ContextMenu() {
  const { state, actions } = usePresentation();
  const menuRef = useRef(null);
  const menu = state.ui.contextMenu;

  useEffect(() => {
    const handleClick = () => actions.setUI({ contextMenu: null });
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [actions]);

  if (!menu) return null;

  const isSlideMenu = menu.type === 'slide';
  const hasTarget = !!menu.target;

  const slideItems = [
    { label: '슬라이드 추가', action: () => actions.addSlide() },
    { label: '슬라이드 복제', action: () => actions.duplicateSlide() },
    { divider: true },
    { label: '슬라이드 삭제', action: () => actions.deleteSlide(), danger: true, disabled: state.slides.length <= 1 }
  ];

  const elementItems = [
    { label: '복사 (Ctrl+C)', action: () => actions.copyElements() },
    { label: '붙여넣기 (Ctrl+V)', action: () => actions.pasteElements() },
    { divider: true },
    { label: '맨 앞으로', action: () => actions.reorderElement(menu.target, 'front') },
    { label: '맨 뒤로', action: () => actions.reorderElement(menu.target, 'back') },
    { divider: true },
    { label: '삭제 (Del)', action: () => actions.deleteElements([menu.target]), danger: true }
  ];

  const canvasItems = [
    { label: '붙여넣기 (Ctrl+V)', action: () => actions.pasteElements(), disabled: !state.clipboard },
    { divider: true },
    { label: '슬라이드 추가', action: () => actions.addSlide() }
  ];

  const items = isSlideMenu ? slideItems : hasTarget ? elementItems : canvasItems;

  return (
    <div ref={menuRef} style={{ ...menuStyle, left: menu.x, top: menu.y }}
      onClick={(e) => e.stopPropagation()}>
      {items.map((item, i) => {
        if (item.divider) return <div key={i} style={dividerStyle} />;
        return (
          <button key={i}
            onClick={() => { item.action(); actions.setUI({ contextMenu: null }); }}
            disabled={item.disabled}
            style={{
              ...itemStyle,
              color: item.danger ? COLORS.danger : '#e0e0e0',
              opacity: item.disabled ? 0.4 : 1
            }}>
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

const menuStyle = {
  position: 'fixed',
  background: '#1e1e3a',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  padding: '4px 0',
  minWidth: 180,
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  zIndex: 1000
};

const itemStyle = {
  display: 'block',
  width: '100%',
  padding: '7px 14px',
  background: 'transparent',
  border: 'none',
  color: '#e0e0e0',
  fontSize: 12,
  cursor: 'pointer',
  textAlign: 'left'
};

const dividerStyle = {
  height: 1,
  background: 'rgba(255,255,255,0.06)',
  margin: '3px 0'
};
