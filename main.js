const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

let NOTE_PATH, CONFIG_PATH;

function initPaths() {
  NOTE_PATH = path.join(app.getPath('userData'), 'note.txt');
  CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeConfig(data) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

function ensureNote() {
  if (!fs.existsSync(NOTE_PATH)) {
    fs.writeFileSync(NOTE_PATH, '', 'utf8');
  }
}

function setupAutostart() {
  if (process.platform === 'darwin' || process.platform === 'win32') {
    app.setLoginItemSettings({ openAtLogin: true, path: app.getPath('exe') });
  } else if (process.platform === 'linux') {
    const autostartDir = path.join(os.homedir(), '.config', 'autostart');
    const desktopFile = path.join(autostartDir, 'context-note.desktop');
    const exePath = app.getPath('exe');
    const desktopEntry = `[Desktop Entry]
Type=Application
Name=context
Exec=${exePath}
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
`;
    try {
      fs.mkdirSync(autostartDir, { recursive: true });
      fs.writeFileSync(desktopFile, desktopEntry);
    } catch (e) {
      console.error('Failed to create autostart entry:', e);
    }
  }
}

function createLinuxDesktopShortcut() {
  const desktopDir = path.join(os.homedir(), 'Desktop');
  const desktopFile = path.join(desktopDir, 'context-note.desktop');
  const exePath = app.getPath('exe');
  const iconPath = path.join(__dirname, 'icon.png');
  const entry = `[Desktop Entry]
Type=Application
Name=context
Comment=Personal context note
Exec=${exePath}
Icon=${iconPath}
Terminal=false
Categories=Utility;
`;
  try {
    if (fs.existsSync(desktopDir)) {
      fs.writeFileSync(desktopFile, entry);
      fs.chmodSync(desktopFile, 0o755);
    }
  } catch (e) {
    console.error('Failed to create desktop shortcut:', e);
  }
}

let win;

function createWindow() {
  const config = readConfig();
  const bounds = config.bounds || { width: 600, height: 400 };
  const alwaysOnTop = config.alwaysOnTop || false;

  win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 300,
    minHeight: 200,
    alwaysOnTop,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'default',
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile('index.html');

  win.on('close', () => {
    const b = win.getBounds();
    const current = readConfig();
    writeConfig({ ...current, bounds: b });
  });
}

app.whenReady().then(() => {
  initPaths();
  ensureNote();
  setupAutostart();
  if (process.platform === 'linux') createLinuxDesktopShortcut();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handlers

ipcMain.handle('read-note', () => {
  try {
    return fs.readFileSync(NOTE_PATH, 'utf8');
  } catch {
    return '';
  }
});

ipcMain.handle('write-note', (_event, content) => {
  const tmpPath = NOTE_PATH + '.tmp';
  try {
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, NOTE_PATH);
    return { ok: true };
  } catch (e) {
    try { fs.unlinkSync(tmpPath); } catch {}
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('toggle-always-on-top', () => {
  if (!win) return false;
  const next = !win.isAlwaysOnTop();
  win.setAlwaysOnTop(next);
  const current = readConfig();
  writeConfig({ ...current, alwaysOnTop: next });
  return next;
});

ipcMain.handle('get-always-on-top', () => {
  return win ? win.isAlwaysOnTop() : false;
});

ipcMain.handle('window-minimize', () => win && win.minimize());
ipcMain.handle('window-maximize', () => {
  if (!win) return;
  win.isMaximized() ? win.unmaximize() : win.maximize();
});
ipcMain.handle('window-close', () => win && win.close());
