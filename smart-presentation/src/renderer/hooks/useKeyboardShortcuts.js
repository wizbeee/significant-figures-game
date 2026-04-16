import { useEffect, useCallback } from 'react';
import { usePresentation } from '../PresentationContext';

export default function useKeyboardShortcuts() {
  const { state, actions } = usePresentation();

  const handleKeyDown = useCallback((e) => {
    // 텍스트 편집 중이면 대부분의 단축키 무시
    const isEditing = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;
    const ctrl = e.ctrlKey || e.metaKey;

    // Ctrl+Z: Undo
    if (ctrl && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('editor-undo'));
      return;
    }

    // Ctrl+Shift+Z 또는 Ctrl+Y: Redo
    if ((ctrl && e.key === 'z' && e.shiftKey) || (ctrl && e.key === 'y')) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('editor-redo'));
      return;
    }

    // Ctrl+S: 저장
    if (ctrl && e.key === 's' && !e.shiftKey) {
      e.preventDefault();
      saveFile();
      return;
    }

    // Ctrl+Shift+S: 다른 이름으로 저장
    if (ctrl && e.key === 's' && e.shiftKey) {
      e.preventDefault();
      saveFileAs();
      return;
    }

    // Ctrl+O: 열기
    if (ctrl && e.key === 'o') {
      e.preventDefault();
      openFile();
      return;
    }

    // Ctrl+N: 새 파일
    if (ctrl && e.key === 'n') {
      e.preventDefault();
      actions.newPresentation();
      return;
    }

    // Ctrl+E: 내보내기
    if (ctrl && e.key === 'e') {
      e.preventDefault();
      actions.setUI({ showExport: true });
      return;
    }

    // Ctrl+M: 새 슬라이드
    if (ctrl && e.key === 'm') {
      e.preventDefault();
      actions.addSlide();
      return;
    }

    // 텍스트 편집 중이면 나머지 무시
    if (isEditing) return;

    // Delete / Backspace: 선택 요소 삭제
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedElementIds.length > 0) {
      e.preventDefault();
      actions.deleteElements(state.selectedElementIds);
      return;
    }

    // Ctrl+C: 복사
    if (ctrl && e.key === 'c') {
      e.preventDefault();
      actions.copyElements();
      return;
    }

    // Ctrl+V: 붙여넣기
    if (ctrl && e.key === 'v') {
      e.preventDefault();
      actions.pasteElements();
      return;
    }

    // Ctrl+D: 슬라이드 복제
    if (ctrl && e.key === 'd') {
      e.preventDefault();
      actions.duplicateSlide();
      return;
    }

    // F5: 발표 시작
    if (e.key === 'F5') {
      e.preventDefault();
      if (window.electronAPI) {
        window.electronAPI.presentation.start();
      }
      return;
    }

    // Escape: 발표 종료 / 선택 해제 / 패널 닫기
    if (e.key === 'Escape') {
      if (state.ui.showAIPanel) {
        actions.setUI({ showAIPanel: false });
      } else if (state.ui.showExport) {
        actions.setUI({ showExport: false });
      } else if (state.ui.contextMenu) {
        actions.setUI({ contextMenu: null });
      } else if (state.selectedElementIds.length > 0) {
        actions.clearSelection();
      }
      return;
    }

    // 화살표: 슬라이드 이동
    if (e.key === 'PageDown' || (e.key === 'ArrowDown' && !state.selectedElementIds.length)) {
      e.preventDefault();
      const next = Math.min(state.activeSlideIndex + 1, state.slides.length - 1);
      actions.setActiveSlide(next);
      return;
    }
    if (e.key === 'PageUp' || (e.key === 'ArrowUp' && !state.selectedElementIds.length)) {
      e.preventDefault();
      const prev = Math.max(state.activeSlideIndex - 1, 0);
      actions.setActiveSlide(prev);
      return;
    }

    // +/-: 줌
    if (e.key === '+' || e.key === '=') {
      actions.setZoom(state.ui.zoom + 10);
      return;
    }
    if (e.key === '-') {
      actions.setZoom(state.ui.zoom - 10);
      return;
    }

  }, [state, actions]);

  // 파일 조작
  const saveFile = useCallback(async () => {
    if (!window.electronAPI) return;
    const data = JSON.stringify({
      version: '1.0.0',
      appName: 'smart-presentation',
      settings: state.settings,
      slides: state.slides,
      metadata: {
        title: state.file.name,
        modifiedAt: new Date().toISOString()
      }
    });
    const path = await window.electronAPI.file.save({ path: state.file.path, data });
    if (path) {
      actions.setFilePath(path);
    }
  }, [state.file.path, state.file.name, state.settings, state.slides, actions]);

  const saveFileAs = useCallback(async () => {
    if (!window.electronAPI) return;
    const data = JSON.stringify({
      version: '1.0.0',
      appName: 'smart-presentation',
      settings: state.settings,
      slides: state.slides,
      metadata: {
        title: state.file.name,
        modifiedAt: new Date().toISOString()
      }
    });
    const path = await window.electronAPI.file.saveAs({ data, defaultName: `${state.file.name}.spt` });
    if (path) {
      actions.setFilePath(path);
    }
  }, [state.file.name, state.settings, state.slides, actions]);

  const openFile = useCallback(async () => {
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
  }, [actions]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return { saveFile, saveFileAs, openFile };
}
