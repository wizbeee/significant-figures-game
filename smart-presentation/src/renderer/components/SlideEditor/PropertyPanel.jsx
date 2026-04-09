import React, { useState, useEffect } from 'react';
import { usePresentation } from '../../PresentationContext';
import { COLORS, TRANSITIONS } from '../../constants';

export default function PropertyPanel() {
  const { state, actions } = usePresentation();
  const [selectedProps, setSelectedProps] = useState(null);

  const currentSlide = state.slides[state.activeSlideIndex];
  const selectedIds = state.selectedElementIds;
  const hasSelection = selectedIds.length > 0;

  // 선택된 요소의 속성 가져오기
  useEffect(() => {
    if (!hasSelection || !currentSlide) {
      setSelectedProps(null);
      return;
    }
    const el = currentSlide.elements.find(e => e.id === selectedIds[0]);
    if (el?.fabricData) {
      setSelectedProps(el.fabricData);
    }
  }, [selectedIds, currentSlide, hasSelection]);

  if (!state.ui.rightPanelOpen) return null;

  const updateFabricProp = (prop, value) => {
    if (!hasSelection) return;
    selectedIds.forEach(id => {
      actions.updateElement(id, {
        fabricData: { [prop]: value }
      });
    });
    // Fabric 캔버스 직접 업데이트
    const canvas = window.__slideEditorCanvas?.current;
    if (canvas) {
      canvas.getActiveObjects().forEach(obj => {
        obj.set(prop, value);
      });
      canvas.renderAll();
    }
    setSelectedProps(prev => prev ? { ...prev, [prop]: value } : null);
  };

  return (
    <div style={panelStyle}>
      {/* 슬라이드 속성 (항상 표시) */}
      <Section title="슬라이드">
        <Label text="배경색">
          <input
            type="color"
            value={currentSlide?.background?.value || '#1a1a2e'}
            onChange={(e) => actions.setSlideBackground({ type: 'color', value: e.target.value })}
            style={colorInputStyle}
          />
        </Label>
        <Label text="전환 효과">
          <select
            value={currentSlide?.transition?.type || 'none'}
            onChange={(e) => actions.setSlideTransition({ ...currentSlide?.transition, type: e.target.value })}
            style={selectStyle}
          >
            {TRANSITIONS.map(t => (
              <option key={t.id} value={t.id}>{t.icon} {t.name}</option>
            ))}
          </select>
        </Label>
      </Section>

      {/* 선택 요소 속성 */}
      {hasSelection && selectedProps && (
        <>
          <Divider />
          <Section title="요소 속성">
            {/* 위치/크기 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <Label text="X">
                <NumberInput value={Math.round(selectedProps.left || 0)}
                  onChange={(v) => updateFabricProp('left', v)} />
              </Label>
              <Label text="Y">
                <NumberInput value={Math.round(selectedProps.top || 0)}
                  onChange={(v) => updateFabricProp('top', v)} />
              </Label>
              {selectedProps.width && (
                <Label text="너비">
                  <NumberInput value={Math.round(selectedProps.width || 0)}
                    onChange={(v) => updateFabricProp('width', v)} />
                </Label>
              )}
              {selectedProps.height && (
                <Label text="높이">
                  <NumberInput value={Math.round(selectedProps.height || 0)}
                    onChange={(v) => updateFabricProp('height', v)} />
                </Label>
              )}
            </div>

            {/* 색상 */}
            <Label text="채우기">
              <input type="color"
                value={selectedProps.fill || '#ffffff'}
                onChange={(e) => updateFabricProp('fill', e.target.value)}
                style={colorInputStyle} />
            </Label>

            {/* 투명도 */}
            <Label text="투명도">
              <input type="range" min={0} max={1} step={0.05}
                value={selectedProps.opacity ?? 1}
                onChange={(e) => updateFabricProp('opacity', parseFloat(e.target.value))}
                style={{ width: '100%' }} />
            </Label>

            {/* 테두리 */}
            <Label text="테두리">
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input type="color"
                  value={selectedProps.stroke || '#ffffff'}
                  onChange={(e) => updateFabricProp('stroke', e.target.value)}
                  style={{ ...colorInputStyle, width: 28, height: 28 }} />
                <NumberInput value={selectedProps.strokeWidth || 0}
                  onChange={(v) => updateFabricProp('strokeWidth', v)}
                  min={0} max={20} />
              </div>
            </Label>

            {/* 둥글기 (사각형) */}
            {selectedProps.type === 'rect' && (
              <Label text="둥글기">
                <input type="range" min={0} max={50} step={1}
                  value={selectedProps.rx || 0}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    updateFabricProp('rx', v);
                    updateFabricProp('ry', v);
                  }}
                  style={{ width: '100%' }} />
              </Label>
            )}
          </Section>

          {/* 텍스트 속성 */}
          {selectedProps.type === 'textbox' && (
            <>
              <Divider />
              <Section title="텍스트">
                <Label text="크기">
                  <NumberInput value={selectedProps.fontSize || 24}
                    onChange={(v) => updateFabricProp('fontSize', v)}
                    min={8} max={200} />
                </Label>
                <Label text="굵기">
                  <div style={{ display: 'flex', gap: 4 }}>
                    <ToggleBtn active={selectedProps.fontWeight === 'bold'}
                      onClick={() => updateFabricProp('fontWeight', selectedProps.fontWeight === 'bold' ? 'normal' : 'bold')}>
                      <b>B</b>
                    </ToggleBtn>
                    <ToggleBtn active={selectedProps.fontStyle === 'italic'}
                      onClick={() => updateFabricProp('fontStyle', selectedProps.fontStyle === 'italic' ? '' : 'italic')}>
                      <i>I</i>
                    </ToggleBtn>
                    <ToggleBtn active={selectedProps.underline}
                      onClick={() => updateFabricProp('underline', !selectedProps.underline)}>
                      <u>U</u>
                    </ToggleBtn>
                  </div>
                </Label>
                <Label text="정렬">
                  <div style={{ display: 'flex', gap: 4 }}>
                    {['left', 'center', 'right'].map(align => (
                      <ToggleBtn key={align}
                        active={selectedProps.textAlign === align}
                        onClick={() => updateFabricProp('textAlign', align)}>
                        {align === 'left' ? '◧' : align === 'center' ? '◫' : '◨'}
                      </ToggleBtn>
                    ))}
                  </div>
                </Label>
                <Label text="줄간격">
                  <input type="range" min={0.8} max={3} step={0.1}
                    value={selectedProps.lineHeight || 1.3}
                    onChange={(e) => updateFabricProp('lineHeight', parseFloat(e.target.value))}
                    style={{ width: '100%' }} />
                </Label>
              </Section>
            </>
          )}

          {/* 레이어 순서 */}
          <Divider />
          <Section title="레이어">
            <div style={{ display: 'flex', gap: 4 }}>
              <SmallBtn onClick={() => actions.reorderElement(selectedIds[0], 'front')}>맨 앞</SmallBtn>
              <SmallBtn onClick={() => actions.reorderElement(selectedIds[0], 'forward')}>앞으로</SmallBtn>
              <SmallBtn onClick={() => actions.reorderElement(selectedIds[0], 'backward')}>뒤로</SmallBtn>
              <SmallBtn onClick={() => actions.reorderElement(selectedIds[0], 'back')}>맨 뒤</SmallBtn>
            </div>
          </Section>
        </>
      )}

      {/* 발표자 노트 */}
      <Divider />
      <Section title="발표자 노트">
        <textarea
          value={currentSlide?.notes || ''}
          onChange={(e) => actions.setSlideNotes(e.target.value)}
          placeholder="발표 시 참고할 메모를 입력하세요..."
          style={notesStyle}
        />
      </Section>
    </div>
  );
}

// ─── 하위 컴포넌트 ───

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.grayLight, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  );
}

function Label({ text, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12, color: COLORS.grayLight, minWidth: 42 }}>{text}</span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '8px 0' }} />;
}

function NumberInput({ value, onChange, min = 0, max = 5000 }) {
  return (
    <input type="number" value={value} min={min} max={max}
      onChange={(e) => onChange(parseInt(e.target.value) || 0)}
      style={numberInputStyle} />
  );
}

function ToggleBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      ...toggleBtnStyle,
      background: active ? 'rgba(67,97,238,0.3)' : 'rgba(255,255,255,0.05)',
      borderColor: active ? COLORS.primary : 'rgba(255,255,255,0.1)'
    }}>
      {children}
    </button>
  );
}

function SmallBtn({ onClick, children }) {
  return (
    <button onClick={onClick} style={smallBtnStyle}>{children}</button>
  );
}

// ─── 스타일 ───

const panelStyle = {
  width: 260,
  background: 'rgba(26,26,46,0.95)',
  borderLeft: '1px solid rgba(255,255,255,0.08)',
  padding: '12px 14px',
  overflowY: 'auto',
  fontSize: 12,
  color: COLORS.light
};

const colorInputStyle = {
  width: 36, height: 28,
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 4,
  cursor: 'pointer',
  background: 'transparent',
  padding: 0
};

const selectStyle = {
  width: '100%',
  padding: '4px 6px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 4,
  color: '#e0e0e0',
  fontSize: 12
};

const numberInputStyle = {
  width: '100%',
  padding: '3px 6px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 4,
  color: '#e0e0e0',
  fontSize: 12,
  textAlign: 'center'
};

const toggleBtnStyle = {
  padding: '3px 10px',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 4,
  color: '#e0e0e0',
  cursor: 'pointer',
  fontSize: 13,
  background: 'rgba(255,255,255,0.05)'
};

const smallBtnStyle = {
  flex: 1,
  padding: '3px 4px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 4,
  color: '#e0e0e0',
  cursor: 'pointer',
  fontSize: 10
};

const notesStyle = {
  width: '100%',
  minHeight: 80,
  padding: 8,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 6,
  color: '#e0e0e0',
  fontSize: 12,
  resize: 'vertical',
  fontFamily: 'inherit',
  lineHeight: 1.5
};
