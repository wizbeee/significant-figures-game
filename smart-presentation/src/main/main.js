const { app, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

// ─── 설정 저장소 ───
const store = new Store({
  defaults: {
    windowBounds: { width: 1400, height: 900 },
    recentFiles: [],
    ai: { provider: '', apiKey: '', model: '' },
    settings: {
      slideWidth: 1920,
      slideHeight: 1080,
      defaultFont: 'Malgun Gothic',
      defaultFontSize: 24,
      gridSize: 20,
      snapToGrid: true,
      showGrid: false,
      theme: 'dark'
    }
  }
});

let mainWindow = null;
let presentationWindow = null;
let presenterWindow = null;

const isDev = process.env.NODE_ENV === 'development';

// ─── 메인 윈도우 생성 ───
function createMainWindow() {
  const bounds = store.get('windowBounds');

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 1024,
    minHeight: 700,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../../public/icon.png')
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3002');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../build/index.html'));
  }

  mainWindow.on('resize', () => {
    const [width, height] = mainWindow.getSize();
    store.set('windowBounds', { width, height });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (presentationWindow) presentationWindow.close();
    if (presenterWindow) presenterWindow.close();
  });
}

// ─── 발표 모드 윈도우 ───
function createPresentationWindow(displayId) {
  const displays = screen.getAllDisplays();
  const targetDisplay = displayId
    ? displays.find(d => d.id === displayId) || displays[0]
    : displays.length > 1 ? displays[1] : displays[0];

  presentationWindow = new BrowserWindow({
    x: targetDisplay.bounds.x,
    y: targetDisplay.bounds.y,
    fullscreen: true,
    frame: false,
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  if (isDev) {
    presentationWindow.loadURL('http://localhost:3002#/present');
  } else {
    presentationWindow.loadFile(path.join(__dirname, '../../build/index.html'), { hash: '/present' });
  }

  presentationWindow.on('closed', () => {
    presentationWindow = null;
    if (mainWindow) mainWindow.webContents.send('presentation-ended');
  });
}

// ─── 발표자 뷰 윈도우 ───
function createPresenterWindow() {
  presenterWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    frame: true,
    title: '발표자 뷰',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  if (isDev) {
    presenterWindow.loadURL('http://localhost:3002#/presenter');
  } else {
    presenterWindow.loadFile(path.join(__dirname, '../../build/index.html'), { hash: '/presenter' });
  }

  presenterWindow.on('closed', () => { presenterWindow = null; });
}

// ─── IPC 핸들러 ───

// 윈도우 컨트롤
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());
ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() || false);

// 저장소
ipcMain.handle('store-get', (_, key) => store.get(key));
ipcMain.handle('store-set', (_, key, value) => { store.set(key, value); return true; });
ipcMain.handle('store-get-all', () => store.store);

// 파일 열기/저장
ipcMain.handle('file-open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '프레젠테이션 열기',
    filters: [
      { name: '스마트 프레젠테이션', extensions: ['spt'] },
      { name: 'PowerPoint', extensions: ['pptx'] },
      { name: '모든 파일', extensions: ['*'] }
    ],
    properties: ['openFile']
  });
  if (result.canceled) return null;
  const filePath = result.filePaths[0];
  const data = fs.readFileSync(filePath, 'utf-8');
  addRecentFile(filePath);
  return { path: filePath, data };
});

ipcMain.handle('file-save', async (_, { path: filePath, data }) => {
  if (!filePath) {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '프레젠테이션 저장',
      defaultPath: '새 프레젠테이션.spt',
      filters: [{ name: '스마트 프레젠테이션', extensions: ['spt'] }]
    });
    if (result.canceled) return null;
    filePath = result.filePath;
  }
  fs.writeFileSync(filePath, data, 'utf-8');
  addRecentFile(filePath);
  return filePath;
});

ipcMain.handle('file-save-as', async (_, { data, defaultName }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '다른 이름으로 저장',
    defaultPath: defaultName || '새 프레젠테이션.spt',
    filters: [
      { name: '스마트 프레젠테이션', extensions: ['spt'] },
      { name: 'PowerPoint', extensions: ['pptx'] },
      { name: 'PDF', extensions: ['pdf'] },
      { name: 'PNG 이미지', extensions: ['png'] }
    ]
  });
  if (result.canceled) return null;
  fs.writeFileSync(result.filePath, data);
  return result.filePath;
});

ipcMain.handle('file-export', async (_, { data, defaultName, filters }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '내보내기',
    defaultPath: defaultName,
    filters
  });
  if (result.canceled) return null;
  if (Buffer.isBuffer(data)) {
    fs.writeFileSync(result.filePath, data);
  } else {
    fs.writeFileSync(result.filePath, data, 'utf-8');
  }
  return result.filePath;
});

// 이미지 선택
ipcMain.handle('select-image', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '이미지 선택',
    filters: [{ name: '이미지', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'] }],
    properties: ['openFile']
  });
  if (result.canceled) return null;
  const filePath = result.filePaths[0];
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  return `data:${mime};base64,${buffer.toString('base64')}`;
});

// 발표 모드
ipcMain.handle('presentation-start', (_, displayId) => {
  createPresentationWindow(displayId);
  return true;
});
ipcMain.handle('presentation-start-with-presenter', (_, displayId) => {
  createPresentationWindow(displayId);
  createPresenterWindow();
  return true;
});
ipcMain.on('presentation-stop', () => {
  if (presentationWindow) presentationWindow.close();
  if (presenterWindow) presenterWindow.close();
});
ipcMain.on('presentation-slide-change', (_, slideIndex) => {
  if (presentationWindow) presentationWindow.webContents.send('go-to-slide', slideIndex);
  if (presenterWindow) presenterWindow.webContents.send('go-to-slide', slideIndex);
});

// AI API 프록시 (CORS 우회)
ipcMain.handle('ai-call', async (_, { url, method, headers, body }) => {
  try {
    const axios = require('axios');
    const response = await axios({ url, method: method || 'POST', headers, data: body, timeout: 60000 });
    return { ok: true, data: response.data };
  } catch (err) {
    return { ok: false, error: err.response?.data || err.message };
  }
});

// 시스템 폰트 목록
ipcMain.handle('get-system-fonts', async () => {
  try {
    const { execSync } = require('child_process');
    if (process.platform === 'win32') {
      const result = execSync(
        `powershell -Command "[System.Reflection.Assembly]::LoadWithPartialName('System.Drawing') | Out-Null; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }"`,
        { encoding: 'utf-8', timeout: 10000 }
      );
      return result.split('\n').map(f => f.trim()).filter(Boolean);
    }
    return ['Malgun Gothic', 'Arial', 'Times New Roman', 'Courier New'];
  } catch {
    return ['Malgun Gothic', 'Arial', 'Times New Roman', 'Courier New'];
  }
});

// 최근 파일 관리
function addRecentFile(filePath) {
  let recent = store.get('recentFiles') || [];
  recent = recent.filter(f => f.path !== filePath);
  recent.unshift({ path: filePath, name: path.basename(filePath), time: Date.now() });
  if (recent.length > 10) recent = recent.slice(0, 10);
  store.set('recentFiles', recent);
}

// ─── 앱 라이프사이클 ───
app.whenReady().then(createMainWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
