const { app, BrowserWindow, globalShortcut } = require('electron');
const path = require('path');
const { initDatabase, closeDatabase } = require('./database');
const { registerIpcHandlers } = require('./ipc-handlers');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: '입학전형 관리',
    icon: path.join(__dirname, '../../public/icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    show: false,
  });

  const isDev = process.env.NODE_ENV === 'development';
  const url = isDev ? 'http://localhost:3000' : `file://${path.join(__dirname, '../../build/index.html')}`;
  mainWindow.loadURL(url);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await initDatabase();
  registerIpcHandlers();
  createWindow();
});

app.on('window-all-closed', () => {
  closeDatabase();
  app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
});
