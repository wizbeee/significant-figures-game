import React, { useState, useEffect } from 'react';
import { usePresentation } from '../../PresentationContext';
import { COLORS, THEME_PRESETS } from '../../constants';

export default function HomeScreen() {
  const { state, actions } = usePresentation();
  const [recentFiles, setRecentFiles] = useState([]);
  const [aiTopic, setAiTopic] = useState('');
  const [showAIInput, setShowAIInput] = useState(false);

  // 최근 파일 로드
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.store.get('recentFiles').then(files => {
        setRecentFiles(files || []);
      });
    }
  }, []);

  const handleNewPresentation = () => {
    actions.newPresentation();
  };

  const handleOpenFile = async () => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.file.open();
    if (result) {
      try {
        const data = JSON.parse(result.data);
        actions.loadPresentation(data, result.path);
      } catch (e) {
        console.error('파일 열기 오류:', e);
      }
    }
  };

  const handleOpenRecent = async (filePath) => {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.file.open();
      if (result) {
        const data = JSON.parse(result.data);
        actions.loadPresentation(data, result.path);
      }
    } catch (e) {
      console.error('최근 파일 열기 오류:', e);
    }
  };

  const handleAIGenerate = () => {
    if (!aiTopic.trim()) return;
    actions.newPresentation();
    actions.setUI({ showAIPanel: true });
    // AI 패널이 열리면서 주제를 전달
    setTimeout(() => {
      window.__aiGenerateTopic = aiTopic;
      window.dispatchEvent(new CustomEvent('ai-generate-topic', { detail: aiTopic }));
    }, 300);
  };

  return (
    <div style={containerStyle}>
      {/* 타이틀바 (드래그 영역) */}
      <div style={titleBarStyle}>
        <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.grayLight }}>스마트 프레젠테이션</span>
        <div style={{ flex: 1 }} />
        {window.electronAPI && (
          <div style={{ display: 'flex', gap: 2, WebkitAppRegion: 'no-drag' }}>
            <button onClick={() => window.electronAPI.window.minimize()} style={winBtnStyle}>─</button>
            <button onClick={() => window.electronAPI.window.maximize()} style={winBtnStyle}>□</button>
            <button onClick={() => window.electronAPI.window.close()} style={{ ...winBtnStyle, ...winCloseBtnStyle }}>✕</button>
          </div>
        )}
      </div>

      {/* 메인 콘텐츠 */}
      <div style={contentStyle}>
        {/* 로고 + 환영 */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🎬</div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#ffffff', margin: 0 }}>
            스마트 프레젠테이션
          </h1>
          <p style={{ fontSize: 14, color: COLORS.grayLight, marginTop: 8 }}>
            AI가 만들어주는 발표자료, 캔바처럼 편집하고, PPT처럼 발표하세요
          </p>
        </div>

        {/* 원클릭 액션 버튼 */}
        <div style={actionsGridStyle}>
          {/* AI로 만들기 */}
          <div
            onClick={() => setShowAIInput(true)}
            style={{ ...actionCardStyle, background: 'linear-gradient(135deg, #4361ee 0%, #7209b7 100%)' }}
          >
            <span style={{ fontSize: 28 }}>✨</span>
            <span style={{ fontSize: 15, fontWeight: 600 }}>AI로 만들기</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>주제만 입력하면 끝</span>
          </div>

          {/* 빈 프레젠테이션 */}
          <div onClick={handleNewPresentation} style={actionCardStyle}>
            <span style={{ fontSize: 28 }}>📄</span>
            <span style={{ fontSize: 15, fontWeight: 600 }}>빈 프레젠테이션</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>직접 만들기</span>
          </div>

          {/* 파일 열기 */}
          <div onClick={handleOpenFile} style={actionCardStyle}>
            <span style={{ fontSize: 28 }}>📂</span>
            <span style={{ fontSize: 15, fontWeight: 600 }}>파일 열기</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>SPT, PPTX</span>
          </div>

          {/* 템플릿 */}
          <div onClick={() => {
            actions.newPresentation();
            // TODO: 템플릿 선택 UI
          }} style={actionCardStyle}>
            <span style={{ fontSize: 28 }}>🎨</span>
            <span style={{ fontSize: 15, fontWeight: 600 }}>템플릿에서 시작</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>미리 디자인된 틀</span>
          </div>
        </div>

        {/* AI 입력 모달 */}
        {showAIInput && (
          <div style={aiModalOverlay} onClick={() => setShowAIInput(false)}>
            <div style={aiModalStyle} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontSize: 20, marginBottom: 12 }}>✨ AI 슬라이드 생성</div>
              <p style={{ fontSize: 13, color: COLORS.grayLight, marginBottom: 16 }}>
                주제를 입력하면 AI가 발표자료를 자동으로 만들어줍니다
              </p>
              <input
                type="text"
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAIGenerate(); }}
                placeholder="예: 광합성에 대한 과학 수업자료 5장"
                style={aiInputStyle}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button onClick={() => setShowAIInput(false)} style={cancelBtnStyle}>취소</button>
                <button onClick={handleAIGenerate} style={generateBtnStyle} disabled={!aiTopic.trim()}>
                  ✨ 생성하기
                </button>
              </div>
              {/* 빠른 예시 */}
              <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {['태양계 탐험', '한국의 역사', '환경 보호', '인공지능 소개', '건강한 식습관'].map(topic => (
                  <button key={topic} onClick={() => setAiTopic(topic)}
                    style={chipStyle}>
                    {topic}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 최근 파일 */}
        {recentFiles.length > 0 && (
          <div style={{ marginTop: 40, maxWidth: 600, width: '100%' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.grayLight, marginBottom: 12 }}>
              최근 파일
            </div>
            {recentFiles.slice(0, 5).map((file, i) => (
              <div key={i} onClick={() => handleOpenRecent(file.path)}
                style={recentItemStyle}>
                <span style={{ fontSize: 14 }}>📊</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: '#fff' }}>{file.name}</div>
                  <div style={{ fontSize: 11, color: COLORS.grayLight }}>{file.path}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 스타일 ───

const containerStyle = {
  width: '100vw',
  height: '100vh',
  background: 'linear-gradient(180deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%)',
  display: 'flex',
  flexDirection: 'column'
};

const titleBarStyle = {
  display: 'flex',
  alignItems: 'center',
  padding: '8px 16px',
  WebkitAppRegion: 'drag',
  minHeight: 36
};

const winBtnStyle = {
  width: 36, height: 28,
  background: 'transparent',
  border: 'none',
  color: COLORS.grayLight,
  fontSize: 12,
  cursor: 'pointer',
  borderRadius: 4,
  WebkitAppRegion: 'no-drag'
};

const winCloseBtnStyle = {
  ':hover': { background: '#e81123', color: '#fff' }
};

const contentStyle = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px 40px',
  overflowY: 'auto'
};

const actionsGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 16,
  maxWidth: 700,
  width: '100%'
};

const actionCardStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '24px 16px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  cursor: 'pointer',
  transition: 'all 0.2s',
  color: '#ffffff',
  textAlign: 'center'
};

const aiModalOverlay = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100
};

const aiModalStyle = {
  background: '#1a1a2e',
  borderRadius: 16,
  padding: '32px',
  maxWidth: 500,
  width: '90%',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#fff'
};

const aiInputStyle = {
  width: '100%',
  padding: '12px 16px',
  background: 'rgba(255,255,255,0.06)',
  border: '2px solid rgba(67,97,238,0.4)',
  borderRadius: 10,
  color: '#fff',
  fontSize: 15,
  outline: 'none',
  fontFamily: 'inherit'
};

const cancelBtnStyle = {
  flex: 1,
  padding: '10px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#fff',
  cursor: 'pointer',
  fontSize: 14
};

const generateBtnStyle = {
  flex: 2,
  padding: '10px',
  background: 'linear-gradient(135deg, #4361ee, #7209b7)',
  border: 'none',
  borderRadius: 8,
  color: '#fff',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600
};

const chipStyle = {
  padding: '4px 12px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 20,
  color: COLORS.grayLight,
  fontSize: 12,
  cursor: 'pointer'
};

const recentItemStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 12px',
  borderRadius: 8,
  cursor: 'pointer',
  transition: 'background 0.15s',
  background: 'rgba(255,255,255,0.02)',
  marginBottom: 4
};
