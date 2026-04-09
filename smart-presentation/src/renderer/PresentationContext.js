import React, { createContext, useContext, useReducer, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { SLIDE_WIDTH, SLIDE_HEIGHT, DEFAULT_FONT, COLORS } from './constants';

// ─── 초기 상태 ───
function createEmptySlide() {
  return {
    id: uuidv4(),
    order: 0,
    background: { type: 'color', value: COLORS.dark },
    transition: { type: 'none', duration: 500 },
    notes: '',
    elements: []
  };
}

const INITIAL_STATE = {
  file: {
    path: null,
    name: '새 프레젠테이션',
    modified: false,
    lastSaved: null
  },
  slides: [createEmptySlide()],
  activeSlideIndex: 0,
  selectedElementIds: [],
  clipboard: null,
  settings: {
    width: SLIDE_WIDTH,
    height: SLIDE_HEIGHT,
    defaultFont: DEFAULT_FONT,
    defaultFontSize: 24,
    gridSize: 20,
    snapToGrid: true,
    showGrid: false,
    theme: 'dark'
  },
  sharing: {
    active: false,
    port: null,
    connectedStudents: 0,
    qrUrl: null
  },
  ai: {
    provider: '',
    apiKey: '',
    model: '',
    generating: false
  },
  ui: {
    view: 'home',           // home | editor | present | presenter
    leftPanelWidth: 200,
    rightPanelOpen: true,
    zoom: 100,
    tool: 'select',         // select | text | rect | circle | line | arrow | image
    contextMenu: null,
    showAIPanel: false,
    showExport: false,
    showSettings: false
  }
};

// ─── 리듀서 ───
function reducer(state, action) {
  switch (action.type) {
    // ── 파일 ──
    case 'NEW_PRESENTATION':
      return { ...INITIAL_STATE, slides: [createEmptySlide()], ui: { ...INITIAL_STATE.ui, view: 'editor' } };

    case 'LOAD_PRESENTATION': {
      const { data, path } = action.payload;
      return {
        ...state,
        file: { path, name: data.metadata?.title || '프레젠테이션', modified: false, lastSaved: Date.now() },
        slides: data.slides || [createEmptySlide()],
        settings: { ...state.settings, ...data.settings },
        activeSlideIndex: 0,
        selectedElementIds: [],
        ui: { ...state.ui, view: 'editor' }
      };
    }

    case 'SET_FILE_PATH':
      return { ...state, file: { ...state.file, path: action.payload, modified: false, lastSaved: Date.now() } };

    case 'MARK_SAVED':
      return { ...state, file: { ...state.file, modified: false, lastSaved: Date.now() } };

    case 'MARK_MODIFIED':
      return { ...state, file: { ...state.file, modified: true } };

    // ── 슬라이드 CRUD ──
    case 'ADD_SLIDE': {
      const newSlide = createEmptySlide();
      if (action.payload?.background) newSlide.background = action.payload.background;
      const insertAt = state.activeSlideIndex + 1;
      const slides = [...state.slides];
      slides.splice(insertAt, 0, newSlide);
      return { ...state, slides: reorderSlides(slides), activeSlideIndex: insertAt, selectedElementIds: [], file: { ...state.file, modified: true } };
    }

    case 'DUPLICATE_SLIDE': {
      const source = state.slides[state.activeSlideIndex];
      const dup = { ...JSON.parse(JSON.stringify(source)), id: uuidv4() };
      dup.elements = dup.elements.map(el => ({ ...el, id: uuidv4() }));
      const s = [...state.slides];
      s.splice(state.activeSlideIndex + 1, 0, dup);
      return { ...state, slides: reorderSlides(s), activeSlideIndex: state.activeSlideIndex + 1, selectedElementIds: [], file: { ...state.file, modified: true } };
    }

    case 'DELETE_SLIDE': {
      if (state.slides.length <= 1) return state;
      const s = state.slides.filter((_, i) => i !== state.activeSlideIndex);
      const newIdx = Math.min(state.activeSlideIndex, s.length - 1);
      return { ...state, slides: reorderSlides(s), activeSlideIndex: newIdx, selectedElementIds: [], file: { ...state.file, modified: true } };
    }

    case 'MOVE_SLIDE': {
      const { from, to } = action.payload;
      const s = [...state.slides];
      const [moved] = s.splice(from, 1);
      s.splice(to, 0, moved);
      return { ...state, slides: reorderSlides(s), activeSlideIndex: to, file: { ...state.file, modified: true } };
    }

    case 'SET_ACTIVE_SLIDE':
      return { ...state, activeSlideIndex: action.payload, selectedElementIds: [] };

    case 'SET_SLIDES':
      return { ...state, slides: reorderSlides(action.payload), file: { ...state.file, modified: true } };

    // ── 슬라이드 속성 ──
    case 'SET_SLIDE_BACKGROUND': {
      const slides = [...state.slides];
      slides[state.activeSlideIndex] = { ...slides[state.activeSlideIndex], background: action.payload };
      return { ...state, slides, file: { ...state.file, modified: true } };
    }

    case 'SET_SLIDE_TRANSITION': {
      const slides = [...state.slides];
      slides[state.activeSlideIndex] = { ...slides[state.activeSlideIndex], transition: action.payload };
      return { ...state, slides, file: { ...state.file, modified: true } };
    }

    case 'SET_SLIDE_NOTES': {
      const slides = [...state.slides];
      slides[state.activeSlideIndex] = { ...slides[state.activeSlideIndex], notes: action.payload };
      return { ...state, slides, file: { ...state.file, modified: true } };
    }

    // ── 요소 CRUD ──
    case 'ADD_ELEMENT': {
      const slides = [...state.slides];
      const slide = { ...slides[state.activeSlideIndex] };
      const element = { id: uuidv4(), ...action.payload };
      slide.elements = [...slide.elements, element];
      slides[state.activeSlideIndex] = slide;
      return { ...state, slides, selectedElementIds: [element.id], file: { ...state.file, modified: true } };
    }

    case 'UPDATE_ELEMENT': {
      const { id, updates } = action.payload;
      const slides = [...state.slides];
      const slide = { ...slides[state.activeSlideIndex] };
      slide.elements = slide.elements.map(el => el.id === id ? { ...el, ...updates } : el);
      slides[state.activeSlideIndex] = slide;
      return { ...state, slides, file: { ...state.file, modified: true } };
    }

    case 'UPDATE_ELEMENTS_BATCH': {
      const slides = [...state.slides];
      const slide = { ...slides[state.activeSlideIndex] };
      const updates = action.payload; // [{ id, updates }]
      slide.elements = slide.elements.map(el => {
        const u = updates.find(u => u.id === el.id);
        return u ? { ...el, ...u.updates } : el;
      });
      slides[state.activeSlideIndex] = slide;
      return { ...state, slides, file: { ...state.file, modified: true } };
    }

    case 'DELETE_ELEMENTS': {
      const ids = action.payload;
      const slides = [...state.slides];
      const slide = { ...slides[state.activeSlideIndex] };
      slide.elements = slide.elements.filter(el => !ids.includes(el.id));
      slides[state.activeSlideIndex] = slide;
      return { ...state, slides, selectedElementIds: [], file: { ...state.file, modified: true } };
    }

    case 'REORDER_ELEMENT': {
      const { id, direction } = action.payload; // direction: 'front' | 'back' | 'forward' | 'backward'
      const slides = [...state.slides];
      const slide = { ...slides[state.activeSlideIndex] };
      const elements = [...slide.elements];
      const idx = elements.findIndex(el => el.id === id);
      if (idx === -1) return state;
      if (direction === 'front') {
        const [el] = elements.splice(idx, 1);
        elements.push(el);
      } else if (direction === 'back') {
        const [el] = elements.splice(idx, 1);
        elements.unshift(el);
      } else if (direction === 'forward' && idx < elements.length - 1) {
        [elements[idx], elements[idx + 1]] = [elements[idx + 1], elements[idx]];
      } else if (direction === 'backward' && idx > 0) {
        [elements[idx], elements[idx - 1]] = [elements[idx - 1], elements[idx]];
      }
      slide.elements = elements;
      slides[state.activeSlideIndex] = slide;
      return { ...state, slides, file: { ...state.file, modified: true } };
    }

    // ── 선택 ──
    case 'SET_SELECTION':
      return { ...state, selectedElementIds: action.payload };

    case 'CLEAR_SELECTION':
      return { ...state, selectedElementIds: [] };

    // ── 클립보드 ──
    case 'COPY_ELEMENTS': {
      const slide = state.slides[state.activeSlideIndex];
      const copied = slide.elements.filter(el => state.selectedElementIds.includes(el.id));
      return { ...state, clipboard: JSON.parse(JSON.stringify(copied)) };
    }

    case 'PASTE_ELEMENTS': {
      if (!state.clipboard || state.clipboard.length === 0) return state;
      const slides = [...state.slides];
      const slide = { ...slides[state.activeSlideIndex] };
      const pasted = state.clipboard.map(el => ({
        ...JSON.parse(JSON.stringify(el)),
        id: uuidv4(),
        fabricData: el.fabricData ? { ...el.fabricData, left: (el.fabricData.left || 0) + 20, top: (el.fabricData.top || 0) + 20 } : el.fabricData
      }));
      slide.elements = [...slide.elements, ...pasted];
      slides[state.activeSlideIndex] = slide;
      return { ...state, slides, selectedElementIds: pasted.map(el => el.id), file: { ...state.file, modified: true } };
    }

    // ── 설정 ──
    case 'SET_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.payload } };

    case 'SET_AI_CONFIG':
      return { ...state, ai: { ...state.ai, ...action.payload } };

    case 'SET_SHARING':
      return { ...state, sharing: { ...state.sharing, ...action.payload } };

    // ── UI ──
    case 'SET_UI':
      return { ...state, ui: { ...state.ui, ...action.payload } };

    case 'SET_TOOL':
      return { ...state, ui: { ...state.ui, tool: action.payload } };

    case 'SET_VIEW':
      return { ...state, ui: { ...state.ui, view: action.payload } };

    case 'SET_ZOOM':
      return { ...state, ui: { ...state.ui, zoom: Math.max(25, Math.min(400, action.payload)) } };

    // ── 전체 상태 복원 (Undo/Redo) ──
    case 'RESTORE_SLIDE': {
      const { slideIndex, slideData } = action.payload;
      const slides = [...state.slides];
      slides[slideIndex] = slideData;
      return { ...state, slides, file: { ...state.file, modified: true } };
    }

    default:
      return state;
  }
}

function reorderSlides(slides) {
  return slides.map((s, i) => ({ ...s, order: i }));
}

// ─── Context ───
const PresentationContext = createContext(null);

export function PresentationProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const saveTimerRef = useRef(null);

  // 자동 저장 (2초 디바운스)
  useEffect(() => {
    if (!state.file.modified || !state.file.path) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (window.electronAPI) {
        const data = JSON.stringify({
          version: '1.0.0',
          appName: 'smart-presentation',
          settings: state.settings,
          slides: state.slides,
          metadata: { title: state.file.name, modifiedAt: new Date().toISOString() }
        });
        await window.electronAPI.file.save({ path: state.file.path, data });
        dispatch({ type: 'MARK_SAVED' });
      }
    }, 2000);
    return () => clearTimeout(saveTimerRef.current);
  }, [state.file.modified, state.file.path, state.slides, state.settings, state.file.name]);

  // 설정 영구 저장
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.store.set('settings', state.settings);
      window.electronAPI.store.set('ai', { provider: state.ai.provider, apiKey: state.ai.apiKey, model: state.ai.model });
    }
  }, [state.settings, state.ai.provider, state.ai.apiKey, state.ai.model]);

  // 액션 헬퍼
  const actions = {
    newPresentation: useCallback(() => dispatch({ type: 'NEW_PRESENTATION' }), []),
    loadPresentation: useCallback((data, path) => dispatch({ type: 'LOAD_PRESENTATION', payload: { data, path } }), []),
    setFilePath: useCallback((path) => dispatch({ type: 'SET_FILE_PATH', payload: path }), []),
    markSaved: useCallback(() => dispatch({ type: 'MARK_SAVED' }), []),
    markModified: useCallback(() => dispatch({ type: 'MARK_MODIFIED' }), []),

    addSlide: useCallback((opts) => dispatch({ type: 'ADD_SLIDE', payload: opts }), []),
    duplicateSlide: useCallback(() => dispatch({ type: 'DUPLICATE_SLIDE' }), []),
    deleteSlide: useCallback(() => dispatch({ type: 'DELETE_SLIDE' }), []),
    moveSlide: useCallback((from, to) => dispatch({ type: 'MOVE_SLIDE', payload: { from, to } }), []),
    setActiveSlide: useCallback((idx) => dispatch({ type: 'SET_ACTIVE_SLIDE', payload: idx }), []),
    setSlides: useCallback((slides) => dispatch({ type: 'SET_SLIDES', payload: slides }), []),

    setSlideBackground: useCallback((bg) => dispatch({ type: 'SET_SLIDE_BACKGROUND', payload: bg }), []),
    setSlideTransition: useCallback((t) => dispatch({ type: 'SET_SLIDE_TRANSITION', payload: t }), []),
    setSlideNotes: useCallback((notes) => dispatch({ type: 'SET_SLIDE_NOTES', payload: notes }), []),

    addElement: useCallback((el) => dispatch({ type: 'ADD_ELEMENT', payload: el }), []),
    updateElement: useCallback((id, updates) => dispatch({ type: 'UPDATE_ELEMENT', payload: { id, updates } }), []),
    updateElementsBatch: useCallback((updates) => dispatch({ type: 'UPDATE_ELEMENTS_BATCH', payload: updates }), []),
    deleteElements: useCallback((ids) => dispatch({ type: 'DELETE_ELEMENTS', payload: ids }), []),
    reorderElement: useCallback((id, direction) => dispatch({ type: 'REORDER_ELEMENT', payload: { id, direction } }), []),

    setSelection: useCallback((ids) => dispatch({ type: 'SET_SELECTION', payload: ids }), []),
    clearSelection: useCallback(() => dispatch({ type: 'CLEAR_SELECTION' }), []),
    copyElements: useCallback(() => dispatch({ type: 'COPY_ELEMENTS' }), []),
    pasteElements: useCallback(() => dispatch({ type: 'PASTE_ELEMENTS' }), []),

    setSettings: useCallback((s) => dispatch({ type: 'SET_SETTINGS', payload: s }), []),
    setAIConfig: useCallback((c) => dispatch({ type: 'SET_AI_CONFIG', payload: c }), []),
    setSharing: useCallback((s) => dispatch({ type: 'SET_SHARING', payload: s }), []),

    setUI: useCallback((u) => dispatch({ type: 'SET_UI', payload: u }), []),
    setTool: useCallback((t) => dispatch({ type: 'SET_TOOL', payload: t }), []),
    setView: useCallback((v) => dispatch({ type: 'SET_VIEW', payload: v }), []),
    setZoom: useCallback((z) => dispatch({ type: 'SET_ZOOM', payload: z }), []),

    restoreSlide: useCallback((slideIndex, slideData) => dispatch({ type: 'RESTORE_SLIDE', payload: { slideIndex, slideData } }), []),

    dispatch
  };

  return (
    <PresentationContext.Provider value={{ state, actions }}>
      {children}
    </PresentationContext.Provider>
  );
}

export function usePresentation() {
  const context = useContext(PresentationContext);
  if (!context) throw new Error('usePresentation must be used within PresentationProvider');
  return context;
}

export { createEmptySlide };
