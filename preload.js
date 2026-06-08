'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kaivo', {
  // Window
  minimize:  () => ipcRenderer.send('win-minimize'),
  maximize:  () => ipcRenderer.send('win-maximize'),
  close:     () => ipcRenderer.send('win-close'),
  generatePrintPdf: (pageSize) => ipcRenderer.invoke('pdf:generateBuffer', pageSize),
  printPdfBuffer:   (base64)     => ipcRenderer.invoke('pdf:printBuffer', base64),

  // Dialogs
  openFile:    (f) => ipcRenderer.invoke('dialog:openFile', f),
  openFiles:   (f) => ipcRenderer.invoke('dialog:openFiles', f),
  saveFile:    (o) => ipcRenderer.invoke('dialog:saveFile', o),
  openFolder:  ()  => ipcRenderer.invoke('dialog:openFolder'),

  // FS
  readFile:    (p)    => ipcRenderer.invoke('fs:readFile', p),
  writeFile:   (p, d) => ipcRenderer.invoke('fs:writeFile', p, d),
  renameFile:  (p, n) => ipcRenderer.invoke('fs:renameFile', p, n),
  copyFile:    (s, d) => ipcRenderer.invoke('fs:copyFile', s, d),

  // Shell
  openPath:     (p) => ipcRenderer.invoke('shell:openPath', p),
  showInFolder: (p) => ipcRenderer.invoke('shell:showInFolder', p),

  // App
  getPath:    (n) => ipcRenderer.invoke('app:getPath', n),
  getVersion: ()  => ipcRenderer.invoke('app:getVersion'),
  getRecent:  ()  => ipcRenderer.invoke('app:getRecent'),
  clearRecent:()  => ipcRenderer.invoke('app:clearRecent'),
  pinFile:    (p) => ipcRenderer.invoke('app:pinFile', p),
  unpinFile:  (p) => ipcRenderer.invoke('app:unpinFile', p),
  removeRecent: (p) => ipcRenderer.invoke('app:removeRecent', p),

  // Library (PDFs created by app)
  getLibrary:    ()      => ipcRenderer.invoke('app:getLibrary'),
  addToLibrary:  (entry) => ipcRenderer.invoke('app:addToLibrary', entry),
  removeFromLibrary: (p) => ipcRenderer.invoke('app:removeFromLibrary', p),
  updateLibraryEntry: (oldPath, updates) => ipcRenderer.invoke('app:updateLibraryEntry', oldPath, updates),
  deleteFile:    (p, m)  => ipcRenderer.invoke('fs:deleteFile', p, m),

  // Settings
  getSetting:     (k)    => ipcRenderer.invoke('store:get', k),
  setSetting:     (k, v) => ipcRenderer.invoke('store:set', k, v),
  getAllSettings:  ()     => ipcRenderer.invoke('store:getAll'),
  resetSettings:   ()     => ipcRenderer.invoke('store:reset'),

  // OS integration
  setDefault:    () => ipcRenderer.invoke('app:setDefault'),
  removeDefault: () => ipcRenderer.invoke('app:removeDefault'),
  applyIcon:     () => ipcRenderer.invoke('app:applyIcon'),

  // PDF export (real, not print)
  exportPDFFromEditor: (savePath, pageSize, marginKey, margins) =>
    ipcRenderer.invoke('pdf:exportWithSize', savePath, pageSize, marginKey, margins),

  // Printers & Print Customizations
  getPrinters:         () => ipcRenderer.invoke('app:getPrinters'),
  printPdfWithOptions: (opts) => ipcRenderer.invoke('pdf:printWithOptions', opts),
  notifyPrintReady:    () => ipcRenderer.invoke('pdf:print-ready'),

  log: (msg) => ipcRenderer.send('log:message', msg),

  // Menu events (main -> renderer)
  on: (ch, cb) => { ipcRenderer.on(ch, (_, ...a) => cb(...a)); },
  off: (ch) => ipcRenderer.removeAllListeners(ch),
});
