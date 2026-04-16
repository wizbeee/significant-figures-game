import React, { useState } from 'react';
import { usePresentation } from '../../PresentationContext';
import { COLORS } from '../../constants';
import {
  createTextboxConfig, createRectConfig, createCircleConfig,
  createLineConfig, createArrowConfig
} from '../../utils/fabricHelpers';

export default function Toolbar() {
  const { state, actions } = usePresentation();
  const [showColorPicker, setShowColorPicker] = useState(false);

  const activeTool = state.ui.tool;

  const addText = () => {
    actions.addElement(createTextboxConfig());
    actions.setTool('select');
  };

  const addRect = () => {
    actions.addElement(createRectConfig());
    actions.setTool('select');
  };

  const addCircle = () => {
    actions.addElement(createCircleConfig());
    actions.setTool('select');
  };

  const addLine = () => {
    actions.addElement(createLineConfig());
    actions.setTool('select');
  };

  const addArrow = () => {
    actions.addElement(createArrowConfig());
    actions.setTool('select');
  };

  const addImage = async () => {
    if (window.electronAPI) {
      const dataUrl = await window.electronAPI.file.selectImage();
      if (dataUrl) {
        actions.addElement({
          type: 'image',
          fabricData: {
            type: 'image',
            src: dataUrl,
            left: 400,
            top: 200,
            scaleX: 0.5,
            scaleY: 0.5
          }
        });
      }
    }
    actions.setTool('select');
  };

  const deleteSelected = () => {
    if (state.selectedElementIds.length > 0) {
      actions.deleteElements(state.selectedElementIds);
    }
  };

  const tools = [
    { id: 'select', icon: '↖', label: '선택', action: () => actions.setTool('select') },
    { id: 'divider1' },
    { id: 'text', icon: 'T', label: '텍스트', action: addText },
    { id: 'rect', icon: '▬', label: '사각형', action: addRect },
    { id: 'circle', icon: '●', label: '원', action: addCircle },
    { id: 'line', icon: '╱', label: '선', action: addLine },
    { id: 'arrow', icon: '→', label: '화살표', action: addArrow },
    { id: 'image', icon: '🖼', label: '이미지', action: addImage },
    { id: 'divider2' },
    { id: 'delete', icon: '🗑', label: '삭제', action: deleteSelected, disabled: state.selectedElementIds.length === 0 }
  ];

  const quickColors = ['#4361ee', '#f72585', '#06d6a0', '#ffd166', '#ef476f', '#ffffff', '#000000', '#6c757d'];

  return (
    <div style={toolbarStyle}>
      {/* 파일명 표시 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.light }}>
          {state.file.name}
        </span>
        {state.file.modified && (
          <span style={{ fontSize: 11, color: COLORS.warning, fontWeight: 500 }}>수정됨</span>
        )}
      </div>

      <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.15)', margin: '0 8px' }} />

      {/* 도구 버튼 */}
      {tools.map(tool => {
        if (tool.id.startsWith('divider')) {
          return <div key={tool.id} style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />;
        }
        return (
          <button
            key={tool.id}
            onClick={tool.action}
            disabled={tool.disabled}
            title={tool.label}
            style={{
              ...toolBtnStyle,
              background: activeTool === tool.id ? 'rgba(67,97,238,0.3)' : 'transparent',
              borderColor: activeTool === tool.id ? COLORS.primary : 'transparent',
              opacity: tool.disabled ? 0.4 : 1
            }}
          >
            <span style={{ fontSize: 16 }}>{tool.icon}</span>
            <span style={{ fontSize: 10, marginTop: 1 }}>{tool.label}</span>
          </button>
        );
      })}

      <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.15)', margin: '0 8px' }} />

      {/* 빠른 색상 */}
      <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
        {quickColors.map(color => (
          <button
            key={color}
            onClick={() => {
              if (state.selectedElementIds.length > 0) {
                state.selectedElementIds.forEach(id => {
                  actions.updateElement(id, {
                    fabricData: { fill: color }
                  });
                });
                // Fabric 캔버스 직접 업데이트
                const canvas = window.__slideEditorCanvas?.current;
                if (canvas) {
                  canvas.getActiveObjects().forEach(obj => obj.set('fill', color));
                  canvas.renderAll();
                }
              }
            }}
            style={{
              width: 18, height: 18,
              borderRadius: 3,
              background: color,
              border: `1px solid ${color === '#ffffff' ? '#ccc' : 'rgba(255,255,255,0.2)'}`,
              cursor: 'pointer',
              padding: 0
            }}
            title={color}
          />
        ))}
      </div>

      {/* 우측: 발표/공유/AI */}
      <div style={{ flex: 1 }} />

      <button onClick={() => actions.setUI({ showAIPanel: !state.ui.showAIPanel })}
        style={{ ...actionBtnStyle, background: state.ui.showAIPanel ? COLORS.accent : 'rgba(255,255,255,0.08)' }}>
        ✨ AI
      </button>

      <button onClick={() => {
        if (window.electronAPI) {
          window.electronAPI.presentation.start();
          actions.setView('present');
        }
      }} style={{ ...actionBtnStyle, background: COLORS.primary }}>
        ▶ 발표
      </button>

      <button onClick={() => actions.setUI({ showExport: true })}
        style={actionBtnStyle}>
        📤 내보내기
      </button>
    </div>
  );
}

const toolbarStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '6px 16px',
  background: 'rgba(26,26,46,0.95)',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  userSelect: 'none',
  WebkitAppRegion: 'no-drag',
  minHeight: 52
};

const toolBtnStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 0,
  padding: '4px 10px',
  background: 'transparent',
  border: '1px solid transparent',
  borderRadius: 6,
  color: '#e0e0e0',
  cursor: 'pointer',
  transition: 'all 0.15s',
  minWidth: 48
};

const actionBtnStyle = {
  padding: '6px 14px',
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6,
  color: '#fff',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 500,
  marginLeft: 4
};
