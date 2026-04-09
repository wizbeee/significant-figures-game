const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 윈도우 컨트롤
  window: {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized')
  },

  // 저장소
  store: {
    get: (key) => ipcRenderer.invoke('store-get', key),
    set: (key, value) => ipcRenderer.invoke('store-set', key, value),
    getAll: () => ipcRenderer.invoke('store-get-all')
  },

  // 파일 조작
  file: {
    open: () => ipcRenderer.invoke('file-open'),
    save: (opts) => ipcRenderer.invoke('file-save', opts),
    saveAs: (opts) => ipcRenderer.invoke('file-save-as', opts),
    export: (opts) => ipcRenderer.invoke('file-export', opts),
    selectImage: () => ipcRenderer.invoke('select-image')
  },

  // 발표 모드
  presentation: {
    start: (displayId) => ipcRenderer.invoke('presentation-start', displayId),
    startWithPresenter: (displayId) => ipcRenderer.invoke('presentation-start-with-presenter', displayId),
    stop: () => ipcRenderer.send('presentation-stop'),
    changeSlide: (index) => ipcRenderer.send('presentation-slide-change', index),
    onSlideChange: (cb) => {
      const handler = (_, index) => cb(index);
      ipcRenderer.on('go-to-slide', handler);
      return () => ipcRenderer.removeListener('go-to-slide', handler);
    },
    onEnded: (cb) => {
      const handler = () => cb();
      ipcRenderer.on('presentation-ended', handler);
      return () => ipcRenderer.removeListener('presentation-ended', handler);
    }
  },

  // AI API 프록시
  ai: {
    call: (opts) => ipcRenderer.invoke('ai-call', opts)
  },

  // 시스템
  system: {
    getFonts: () => ipcRenderer.invoke('get-system-fonts')
  }
});
