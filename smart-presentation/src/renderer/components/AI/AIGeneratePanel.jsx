import React, { useState, useEffect } from 'react';
import { usePresentation } from '../../PresentationContext';
import { COLORS } from '../../constants';
import { callAI, getProviderModels } from '../../services/aiService';
import { SLIDE_GENERATION_PROMPT, TEXT_IMPROVE_PROMPT, TEXT_SIMPLIFY_PROMPT, TEXT_SUMMARIZE_PROMPT, NOTES_GENERATION_PROMPT, buildGenerationPrompt } from '../../services/aiPrompts';
import { aiSlideToElements } from '../../utils/fabricHelpers';
import { createEmptySlide } from '../../PresentationContext';
import { v4 as uuidv4 } from 'uuid';

export default function AIGeneratePanel() {
  const { state, actions } = usePresentation();
  const [topic, setTopic] = useState('');
  const [slideCount, setSlideCount] = useState(5);
  const [style, setStyle] = useState('교육용');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('generate'); // generate | improve | settings

  // AI 설정
  const [provider, setProvider] = useState(state.ai.provider || 'openai');
  const [apiKey, setApiKey] = useState(state.ai.apiKey || '');
  const [model, setModel] = useState(state.ai.model || '');

  // 외부에서 전달된 주제 수신
  useEffect(() => {
    const handler = (e) => {
      if (e.detail) {
        setTopic(e.detail);
        setTab('generate');
      }
    };
    window.addEventListener('ai-generate-topic', handler);
    return () => window.removeEventListener('ai-generate-topic', handler);
  }, []);

  // AI 설정 저장
  useEffect(() => {
    actions.setAIConfig({ provider, apiKey, model });
  }, [provider, apiKey, model, actions]);

  // 슬라이드 생성
  const handleGenerate = async () => {
    if (!topic.trim() || !apiKey) {
      setError(apiKey ? '주제를 입력하세요' : 'AI 설정에서 API 키를 입력하세요');
      setTab(apiKey ? 'generate' : 'settings');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const userMessage = buildGenerationPrompt(topic, { slideCount, style });
      const response = await callAI({
        provider, apiKey, model,
        messages: [{ role: 'user', content: userMessage }],
        systemPrompt: SLIDE_GENERATION_PROMPT
      });

      // JSON 파싱
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('AI 응답에서 JSON을 찾을 수 없습니다');

      const result = JSON.parse(jsonMatch[0]);
      if (!result.slides || !Array.isArray(result.slides)) throw new Error('잘못된 슬라이드 데이터');

      // 슬라이드로 변환
      const newSlides = result.slides.map((aiSlide, index) => {
        const elements = aiSlideToElements(aiSlide);
        return {
          id: uuidv4(),
          order: index,
          background: { type: 'color', value: COLORS.dark },
          transition: { type: index === 0 ? 'none' : 'fade', duration: 500 },
          notes: aiSlide.notes || '',
          elements: elements.map(el => ({ id: uuidv4(), ...el }))
        };
      });

      actions.setSlides(newSlides);
      actions.setActiveSlide(0);
      setError('');
    } catch (err) {
      console.error('AI 생성 오류:', err);
      setError(`생성 실패: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 텍스트 개선
  const handleImproveText = async (mode) => {
    const canvas = window.__slideEditorCanvas?.current;
    if (!canvas) return;
    const activeObj = canvas.getActiveObject();
    if (!activeObj || activeObj.type !== 'textbox') {
      setError('텍스트 요소를 먼저 선택하세요');
      return;
    }

    const promptMap = {
      improve: TEXT_IMPROVE_PROMPT,
      simplify: TEXT_SIMPLIFY_PROMPT,
      summarize: TEXT_SUMMARIZE_PROMPT
    };

    setLoading(true);
    setError('');
    try {
      const improved = await callAI({
        provider, apiKey, model,
        messages: [{ role: 'user', content: activeObj.text }],
        systemPrompt: promptMap[mode]
      });
      activeObj.set('text', improved.trim());
      canvas.renderAll();
    } catch (err) {
      setError(`개선 실패: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 발표자 노트 생성
  const handleGenerateNotes = async () => {
    const currentSlide = state.slides[state.activeSlideIndex];
    if (!currentSlide) return;

    const slideTexts = currentSlide.elements
      .filter(el => el.fabricData?.type === 'textbox')
      .map(el => el.fabricData.text)
      .join('\n');

    if (!slideTexts.trim()) {
      setError('슬라이드에 텍스트가 없습니다');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const notes = await callAI({
        provider, apiKey, model,
        messages: [{ role: 'user', content: slideTexts }],
        systemPrompt: NOTES_GENERATION_PROMPT
      });
      actions.setSlideNotes(notes.trim());
    } catch (err) {
      setError(`노트 생성 실패: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!state.ui.showAIPanel) return null;

  return (
    <div style={panelStyle}>
      {/* 헤더 */}
      <div style={headerStyle}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>✨ AI 어시스턴트</span>
        <button onClick={() => actions.setUI({ showAIPanel: false })} style={closeBtnStyle}>✕</button>
      </div>

      {/* 탭 */}
      <div style={tabsStyle}>
        {[
          { id: 'generate', label: '생성' },
          { id: 'improve', label: '개선' },
          { id: 'settings', label: '설정' }
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ ...tabStyle, borderBottomColor: tab === t.id ? COLORS.primary : 'transparent', color: tab === t.id ? '#fff' : COLORS.grayLight }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 에러 */}
      {error && (
        <div style={{ padding: '8px 12px', background: 'rgba(239,71,111,0.15)', borderRadius: 6, margin: '8px 12px 0', fontSize: 12, color: COLORS.danger }}>
          {error}
        </div>
      )}

      {/* 생성 탭 */}
      {tab === 'generate' && (
        <div style={contentStyle}>
          <label style={labelStyle}>주제</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate(); }}
            placeholder="예: 태양계 탐험 수업자료"
            style={inputStyle}
            autoFocus
          />

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>슬라이드 수</label>
              <select value={slideCount} onChange={(e) => setSlideCount(parseInt(e.target.value))} style={selectStyle}>
                {[3, 5, 7, 10, 15].map(n => <option key={n} value={n}>{n}장</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>스타일</label>
              <select value={style} onChange={(e) => setStyle(e.target.value)} style={selectStyle}>
                {['교육용', '비즈니스', '심플', '크리에이티브'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <button onClick={handleGenerate} disabled={loading || !topic.trim()}
            style={{ ...generateBtnStyle, opacity: loading || !topic.trim() ? 0.5 : 1 }}>
            {loading ? '⏳ AI가 만들고 있어요...' : '✨ 슬라이드 생성'}
          </button>

          {/* 빠른 주제 */}
          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>빠른 시작</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {['태양계 탐험', '환경 보호', '한국의 역사', '건강한 식습관', '인공지능', '독서의 중요성'].map(t => (
                <button key={t} onClick={() => setTopic(t)} style={chipStyle}>{t}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 개선 탭 */}
      {tab === 'improve' && (
        <div style={contentStyle}>
          <p style={{ fontSize: 12, color: COLORS.grayLight, marginBottom: 12 }}>
            텍스트 요소를 선택한 후 원클릭으로 개선할 수 있습니다
          </p>

          <button onClick={() => handleImproveText('improve')} disabled={loading} style={improveBtnStyle}>
            ✏️ 다듬기
            <span style={{ fontSize: 11, color: COLORS.grayLight }}>더 전문적이고 간결하게</span>
          </button>

          <button onClick={() => handleImproveText('simplify')} disabled={loading} style={improveBtnStyle}>
            📖 쉽게 바꾸기
            <span style={{ fontSize: 11, color: COLORS.grayLight }}>학생이 이해하기 쉽게</span>
          </button>

          <button onClick={() => handleImproveText('summarize')} disabled={loading} style={improveBtnStyle}>
            📋 요약하기
            <span style={{ fontSize: 11, color: COLORS.grayLight }}>핵심만 3줄로</span>
          </button>

          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '12px 0' }} />

          <button onClick={handleGenerateNotes} disabled={loading} style={improveBtnStyle}>
            🎤 발표자 노트 생성
            <span style={{ fontSize: 11, color: COLORS.grayLight }}>현재 슬라이드 기반 스크립트</span>
          </button>

          {loading && (
            <div style={{ textAlign: 'center', padding: 16, color: COLORS.grayLight, fontSize: 13 }}>
              ⏳ AI가 작업 중...
            </div>
          )}
        </div>
      )}

      {/* 설정 탭 */}
      {tab === 'settings' && (
        <div style={contentStyle}>
          <label style={labelStyle}>AI 프로바이더</label>
          <select value={provider} onChange={(e) => { setProvider(e.target.value); setModel(''); }} style={selectStyle}>
            <option value="openai">OpenAI (GPT)</option>
            <option value="claude">Anthropic (Claude)</option>
            <option value="gemini">Google (Gemini)</option>
          </select>

          <label style={{ ...labelStyle, marginTop: 12 }}>API 키</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="API 키를 입력하세요"
            style={inputStyle}
          />

          <label style={{ ...labelStyle, marginTop: 12 }}>모델</label>
          <select value={model} onChange={(e) => setModel(e.target.value)} style={selectStyle}>
            <option value="">기본 모델</option>
            {getProviderModels(provider).map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>

          {apiKey && (
            <div style={{ marginTop: 12, padding: 8, background: 'rgba(6,214,160,0.1)', borderRadius: 6, fontSize: 12, color: COLORS.success }}>
              ✓ API 키가 설정되었습니다
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 스타일 ───

const panelStyle = {
  position: 'fixed',
  right: 268,
  top: 84,
  bottom: 28,
  width: 320,
  background: '#1a1a2e',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
  display: 'flex',
  flexDirection: 'column',
  zIndex: 50,
  color: '#fff'
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  borderBottom: '1px solid rgba(255,255,255,0.06)'
};

const closeBtnStyle = {
  background: 'transparent',
  border: 'none',
  color: COLORS.grayLight,
  fontSize: 16,
  cursor: 'pointer',
  padding: '2px 6px'
};

const tabsStyle = {
  display: 'flex',
  borderBottom: '1px solid rgba(255,255,255,0.06)'
};

const tabStyle = {
  flex: 1,
  padding: '8px',
  background: 'transparent',
  border: 'none',
  borderBottom: '2px solid transparent',
  color: COLORS.grayLight,
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer'
};

const contentStyle = {
  flex: 1,
  overflowY: 'auto',
  padding: '12px 16px'
};

const labelStyle = {
  display: 'block',
  fontSize: 11,
  color: COLORS.grayLight,
  marginBottom: 4,
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: 0.3
};

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#fff',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit'
};

const selectStyle = {
  width: '100%',
  padding: '8px 10px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#e0e0e0',
  fontSize: 13
};

const generateBtnStyle = {
  width: '100%',
  padding: '12px',
  marginTop: 16,
  background: 'linear-gradient(135deg, #4361ee, #7209b7)',
  border: 'none',
  borderRadius: 10,
  color: '#fff',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer'
};

const improveBtnStyle = {
  width: '100%',
  padding: '10px 12px',
  marginBottom: 8,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8,
  color: '#fff',
  fontSize: 13,
  cursor: 'pointer',
  textAlign: 'left',
  display: 'flex',
  flexDirection: 'column',
  gap: 2
};

const chipStyle = {
  padding: '3px 10px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16,
  color: COLORS.grayLight,
  fontSize: 11,
  cursor: 'pointer'
};
