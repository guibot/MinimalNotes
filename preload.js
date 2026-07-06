const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  readNotes: () => ipcRenderer.invoke('read-notes'),
  writeNote: (idx, content) => ipcRenderer.invoke('write-note', idx, content),
  writeNoteSync: (idx, content) => ipcRenderer.sendSync('write-note-sync', idx, content),
  addTab: () => ipcRenderer.invoke('add-tab'),
  removeTab: (idx) => ipcRenderer.invoke('remove-tab', idx),
  setActiveTab: (idx) => ipcRenderer.invoke('set-active-tab', idx),
  getColumnWidths: () => ipcRenderer.invoke('get-column-widths'),
  setColumnWidths: (widths) => ipcRenderer.invoke('set-column-widths', widths),
  getSplitMode: () => ipcRenderer.invoke('get-split-mode'),
  setSplitMode: (enabled) => ipcRenderer.invoke('set-split-mode', enabled),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('toggle-always-on-top'),
  getAlwaysOnTop: () => ipcRenderer.invoke('get-always-on-top'),
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),
});
