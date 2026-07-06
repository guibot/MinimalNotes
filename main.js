const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const MAX_TABS = 5;

let NOTE_PATH, NOTES_PATH, CONFIG_PATH;

function initPaths() {
  NOTE_PATH = path.join(app.getPath('userData'), 'note.txt');
  NOTES_PATH = path.join(app.getPath('userData'), 'notes.json');
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

function readNotes() {
  try {
    const notes = JSON.parse(fs.readFileSync(NOTES_PATH, 'utf8'));
    if (Array.isArray(notes) && notes.length > 0) return notes;
  } catch {}
  // Migrate legacy single-note file into tab 0.
  let legacy = '';
  try { legacy = fs.readFileSync(NOTE_PATH, 'utf8'); } catch {}
  return [legacy];
}

function writeNotes(notes) {
  const tmpPath = NOTES_PATH + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(notes), 'utf8');
  fs.renameSync(tmpPath, NOTES_PATH);
}

function setupAutostart() {
  // In dev, app.getPath('exe') is the Electron binary in node_modules —
  // registering it as a login item would be wrong.
  if (!app.isPackaged) return;
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

function boundsVisible(b) {
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x < a.x + a.width && b.x + b.width > a.x &&
           b.y < a.y + a.height && b.y + b.height > a.y;
  });
}

function createWindow() {
  const config = readConfig();
  const bounds = config.bounds || { width: 600, height: 400 };
  const alwaysOnTop = config.alwaysOnTop || false;

  // Drop saved position if it's off every current display (e.g. monitor unplugged)
  if (bounds.x !== undefined && !boundsVisible(bounds)) {
    delete bounds.x;
    delete bounds.y;
  }

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
    const b = win.getNormalBounds();
    const current = readConfig();
    writeConfig({ ...current, bounds: b });
  });

  win.on('closed', () => {
    win = null;
  });
}

app.whenReady().then(() => {
  initPaths();
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

ipcMain.handle('read-notes', () => {
  const config = readConfig();
  const notes = readNotes();
  const activeTab = Math.min(config.activeTab || 0, notes.length - 1);
  return { notes, activeTab };
});

function saveNoteAt(idx, content) {
  try {
    const notes = readNotes();
    notes[idx] = content;
    writeNotes(notes);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

ipcMain.handle('write-note', (_event, idx, content) => saveNoteAt(idx, content));

// Synchronous flush used by the renderer's beforeunload, so a pending
// debounced save isn't lost when the window closes or the app quits.
ipcMain.on('write-note-sync', (event, idx, content) => {
  event.returnValue = saveNoteAt(idx, content);
});

ipcMain.handle('add-tab', () => {
  const notes = readNotes();
  if (notes.length >= MAX_TABS) return { ok: false, notes };
  notes.push('');
  writeNotes(notes);
  return { ok: true, notes };
});

ipcMain.handle('remove-tab', (_event, idx) => {
  const notes = readNotes();
  if (idx === 0 || idx >= notes.length) return { ok: false, notes };
  notes.splice(idx, 1);
  writeNotes(notes);
  return { ok: true, notes };
});

ipcMain.handle('set-active-tab', (_event, idx) => {
  const current = readConfig();
  writeConfig({ ...current, activeTab: idx });
});

ipcMain.handle('get-column-widths', () => {
  const config = readConfig();
  return config.columnWidths || [];
});

ipcMain.handle('set-column-widths', (_event, widths) => {
  const current = readConfig();
  writeConfig({ ...current, columnWidths: widths });
});

ipcMain.handle('get-split-mode', () => {
  const config = readConfig();
  return !!config.splitMode;
});

ipcMain.handle('set-split-mode', (_event, enabled) => {
  const current = readConfig();
  writeConfig({ ...current, splitMode: enabled });
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
