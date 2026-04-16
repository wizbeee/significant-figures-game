import React from 'react';
import { usePresentation } from './PresentationContext';
import { COLORS } from './constants';
import HomeScreen from './components/Common/HomeScreen';
import SlidePanel from './components/SlidePanel/SlidePanel';
import SlideEditor from './components/SlideEditor/SlideEditor';
import Toolbar from './components/SlideEditor/Toolbar';
import PropertyPanel from './components/SlideEditor/PropertyPanel';
import ContextMenu from './components/Common/ContextMenu';
import AIGeneratePanel from './components/AI/AIGeneratePanel';
import useKeyboardShortcuts from './hooks/useKeyboardShortcuts';
import useHistory from './hooks/useHistory';

export default function App() {
  const { state, actions } = usePresentation();
  useKeyboardShortcuts();
  useHistory();

  const view = state.ui.view;

  // 홈 화면
  if (view === 'home') {
    return <HomeScreen />;
  }

  // 에디터 뷰
  if (view === 'editor') {
    return (
      <div style={editorContainerStyle}>
        {/* 타이틀바 (윈도우 드래그) */}
        <div style={titleBarStyle}>
          <button onClick={() => actions.setView('home')} style={homeBtnStyle} title="홈으로">
            🏠
          </button>
          <span style={{ fontSize: 12, color: COLORS.grayLight, WebkitAppRegion: 'drag', flex: 1, paddingLeft: 8 }}>
            {state.file.name} {state.file.modified ? '•' : ''}
          </span>
          {window.electronAPI && (
            <div style={{ display: 'flex', gap: 0, WebkitAppRegion: 'no-drag' }}>
              <button onClick={() => window.electronAPI.window.minimize()} style={winBtnStyle}>─</button>
              <button onClick={() => window.electronAPI.window.maximize()} style={winBtnStyle}>□</button>
              <button onClick={() => window.electronAPI.window.close()} style={{ ...winBtnStyle, color: '#ff6b6b' }}>✕</button>
            </div>
          )}
        </div>

        {/* 도구바 */}
        <Toolbar />

        {/* 메인 영역 */}
        <div style={mainAreaStyle}>
          {/* 좌측: 슬라이드 패널 */}
          <SlidePanel />

          {/* 중앙: 캔버스 에디터 */}
          <SlideEditor />

          {/* 우측: 속성 패널 */}
          <PropertyPanel />
        </div>

        {/* 하단 상태바 */}
        <div style={statusBarStyle}>
          <span>슬라이드 {state.activeSlideIndex + 1} / {state.slides.length}</span>
          <span style={{ flex: 1 }} />
          <span>{state.ui.zoom}%</span>
          <span style={{ margin: '0 8px', color: 'rgba(255,255,255,0.2)' }}>|</span>
          <span>{state.settings.width} × {state.settings.height}</span>
        </div>

        {/* AI 패널 */}
        <AIGeneratePanel />

        {/* 컨텍스트 메뉴 */}
        <ContextMenu />
      </div>
    );
  }

  // 발표 모드 (별도 BrowserWindow에서 실행, 여기서는 대기 화면)
  if (view === 'present') {
    return (
      <div style={{ width: '100vw', height: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎬</div>
          <p style={{ fontSize: 18 }}>발표 모드 실행 중...</p>
          <p style={{ fontSize: 13, color: COLORS.grayLight, marginTop: 8 }}>ESC를 눌러 종료</p>
        </div>
      </div>
    );
  }

  return <HomeScreen />;
}

// ─── 스타일 ───

const editorContainerStyle = {
  width: '100vw',
  height: '100vh',
  display: 'flex',
  flexDirection: 'column',
  background: COLORS.darkest,
  overflow: 'hidden'
};

const titleBarStyle = {
  display: 'flex',
  alignItems: 'center',
  padding: '0 8px',
  background: 'rgba(15,15,35,0.98)',
  minHeight: 32,
  borderBottom: '1px solid rgba(255,255,255,0.04)'
};

const homeBtnStyle = {
  background: 'transparent',
  border: 'none',
  fontSize: 14,
  cursor: 'pointer',
  padding: '4px 8px',
  borderRadius: 4,
  WebkitAppRegion: 'no-drag'
};

const winBtnStyle = {
  width: 40, height: 28,
  background: 'transparent',
  border: 'none',
  color: COLORS.grayLight,
  fontSize: 11,
  cursor: 'pointer'
};

const mainAreaStyle = {
  flex: 1,
  display: 'flex',
  overflow: 'hidden'
};

const statusBarStyle = {
  display: 'flex',
  alignItems: 'center',
  padding: '3px 16px',
  background: 'rgba(15,15,35,0.98)',
  borderTop: '1px solid rgba(255,255,255,0.04)',
  fontSize: 11,
  color: COLORS.grayLight,
  minHeight: 24,
  gap: 8
};
