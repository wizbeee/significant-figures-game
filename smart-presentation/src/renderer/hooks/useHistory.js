import { useRef, useCallback, useEffect } from 'react';
import { usePresentation } from '../PresentationContext';

const MAX_HISTORY = 50;

export default function useHistory() {
  const { state, actions } = usePresentation();
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const lastPushedRef = useRef(null);

  // 현재 슬라이드 스냅샷 저장
  const pushState = useCallback(() => {
    const currentSlide = state.slides[state.activeSlideIndex];
    if (!currentSlide) return;

    const snapshot = JSON.stringify(currentSlide);
    // 중복 방지
    if (snapshot === lastPushedRef.current) return;

    undoStackRef.current.push({
      slideIndex: state.activeSlideIndex,
      slideData: snapshot
    });

    if (undoStackRef.current.length > MAX_HISTORY) {
      undoStackRef.current.shift();
    }

    redoStackRef.current = [];
    lastPushedRef.current = snapshot;
  }, [state.slides, state.activeSlideIndex]);

  // Undo
  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;

    const currentSlide = state.slides[state.activeSlideIndex];
    if (currentSlide) {
      redoStackRef.current.push({
        slideIndex: state.activeSlideIndex,
        slideData: JSON.stringify(currentSlide)
      });
    }

    const prev = undoStackRef.current.pop();
    if (prev) {
      const slideData = JSON.parse(prev.slideData);
      actions.restoreSlide(prev.slideIndex, slideData);
      lastPushedRef.current = prev.slideData;
    }
  }, [state.slides, state.activeSlideIndex, actions]);

  // Redo
  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;

    const currentSlide = state.slides[state.activeSlideIndex];
    if (currentSlide) {
      undoStackRef.current.push({
        slideIndex: state.activeSlideIndex,
        slideData: JSON.stringify(currentSlide)
      });
    }

    const next = redoStackRef.current.pop();
    if (next) {
      const slideData = JSON.parse(next.slideData);
      actions.restoreSlide(next.slideIndex, slideData);
      lastPushedRef.current = next.slideData;
    }
  }, [state.slides, state.activeSlideIndex, actions]);

  // 키보드 이벤트 리스닝
  useEffect(() => {
    const handleUndo = () => undo();
    const handleRedo = () => redo();
    window.addEventListener('editor-undo', handleUndo);
    window.addEventListener('editor-redo', handleRedo);
    return () => {
      window.removeEventListener('editor-undo', handleUndo);
      window.removeEventListener('editor-redo', handleRedo);
    };
  }, [undo, redo]);

  // 슬라이드 변경 감지 → 스냅샷 푸시
  useEffect(() => {
    if (state.file.modified) {
      pushState();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.slides]);

  return {
    undo,
    redo,
    canUndo: undoStackRef.current.length > 0,
    canRedo: redoStackRef.current.length > 0,
    pushState
  };
}
