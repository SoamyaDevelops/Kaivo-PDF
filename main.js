'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeImage } = require('electron');
const path  = require('path');
const fs    = require('fs');
const os    = require('os');
const { execSync, exec, spawnSync } = require('child_process');

// ── Debug Logging ────────────────────────────────────────────────────────────
const logFile = path.join(__dirname, 'app-debug.log');
try { fs.writeFileSync(logFile, `[Main] Log started at ${new Date().toISOString()}\n`); } catch(e) {}

const originalLog = console.log;
console.log = (...args) => {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  try { fs.appendFileSync(logFile, `[Main] ${msg}\n`); } catch(e) {}
  originalLog(...args);
};

const originalError = console.error;
console.error = (...args) => {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  try { fs.appendFileSync(logFile, `[Main ERROR] ${msg}\n`); } catch(e) {}
  originalError(...args);
};

ipcMain.on('log:message', (e, msg) => {
  try { fs.appendFileSync(logFile, `[Renderer] ${msg}\n`); } catch(err) {}
});

app.setName('Kaivo PDF');

// ── Persistent store ──────────────────────────────────────────────────────────
const STORE_PATH = path.join(app.getPath('userData'), 'settings.json');
const DEFAULTS = {
  zoom: 100, defaultSaveDir: '', reopenLast: false, showThumbs: true,
  autoSave: true, exportQuality: 'high',
  lastFile: null, darkMode: false, isDefaultReader: false, iconApplied: false,
  recentFiles: [], windowBounds: { width: 1280, height: 800 },
  library: [],   // PDFs created by the app
  pinnedFiles: [] // Pinned files
};

function loadStore() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(STORE_PATH,'utf8')) }; }
  catch { return { ...DEFAULTS }; }
}
function saveStore(data) {
  try { fs.mkdirSync(path.dirname(STORE_PATH),{recursive:true}); fs.writeFileSync(STORE_PATH, JSON.stringify(data,null,2)); } catch {}
}

let store = loadStore();
if (!store.defaultSaveDir) store.defaultSaveDir = app.getPath('downloads');

// ── Path Validation Middleware (Security Hardening) ───────────────────────────
const allowedPaths = new Set();

function addAllowedPath(filePath) {
  if (filePath) {
    try {
      allowedPaths.add(path.resolve(filePath));
    } catch {}
  }
}

function initAllowedPaths() {
  if (store.recentFiles) {
    store.recentFiles.forEach(fp => addAllowedPath(fp));
  }
  if (store.pinnedFiles) {
    store.pinnedFiles.forEach(fp => addAllowedPath(fp));
  }
  if (store.library) {
    store.library.forEach(entry => addAllowedPath(entry.path));
  }
  if (store.lastFile) {
    addAllowedPath(store.lastFile);
  }
}

function isPathAllowed(filePath) {
  if (!filePath) return false;
  try {
    const normalized = path.resolve(filePath);
    if (allowedPaths.has(normalized)) return true;

    // Resolve safe directories dynamically to avoid early init errors
    const safeDirs = [
      app.getPath('downloads'),
      app.getPath('documents'),
      app.getPath('desktop'),
      app.getPath('temp'),
      app.getPath('userData'),
      os.tmpdir()
    ].map(d => path.resolve(d));

    for (const dir of safeDirs) {
      if (normalized === dir) return true;
      const relative = path.relative(dir, normalized);
      if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
        return true;
      }
    }

    // Check if inside any explicitly allowed directory path
    for (const allowed of allowedPaths) {
      try {
        const stat = fs.statSync(allowed);
        if (stat.isDirectory()) {
          if (normalized === allowed) return true;
          const relative = path.relative(allowed, normalized);
          if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
            return true;
          }
        }
      } catch {}
    }
  } catch (err) {
    console.error('Error validating path:', err);
  }
  return false;
}

initAllowedPaths();

// ── Single instance ───────────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
console.log('[Main] gotLock:', gotLock);
if (!gotLock) { app.quit(); process.exit(0); }

let mainWin = null;
let pendingFile = null;

app.on('second-instance', (e, argv) => {
  if (mainWin) {
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.focus();
    const f = argv.find(a => /\.pdf$/i.test(a) && fs.existsSync(a));
    if (f) mainWin.webContents.send('open-file', f);
  }
});

app.on('open-file', (e, p) => { e.preventDefault(); pendingFile = p; });

function getArgvFile() {
  const args = process.argv.slice(app.isPackaged ? 1 : 2);
  return args.find(a => /\.pdf$/i.test(a) && fs.existsSync(a)) || null;
}

// ── Create window ─────────────────────────────────────────────────────────────
function createWindow() {
  const b = store.windowBounds || { width: 1280, height: 800 };
  mainWin = new BrowserWindow({
    width: b.width, height: b.height, minWidth: 860, minHeight: 580,
    title: 'Kaivo PDF',
    icon: path.join(__dirname, 'icon.ico'),
    frame: false,
    backgroundColor: '#F5F3EF',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      sandbox: true
    }
  });

  mainWin.loadFile(path.join(__dirname, 'index.html'));

  // ── Security Hardening: navigation and window creation ──────────────────────
  mainWin.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    console.warn(`Blocked navigation attempt to: ${url}`);
  });

  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url).catch(err => console.error('Failed to open external link:', err));
    }
    return { action: 'deny' };
  });

  mainWin.once('ready-to-show', () => {
    mainWin.show();
    const fileToOpen = pendingFile || getArgvFile();
    if (fileToOpen) {
      pendingFile = null;
      setTimeout(() => mainWin.webContents.send('open-file', fileToOpen), 600);
    } else if (store.reopenLast && store.lastFile && fs.existsSync(store.lastFile)) {
      setTimeout(() => mainWin.webContents.send('open-file', store.lastFile), 600);
    }
  });

  mainWin.on('resize', () => {
    const [w, h] = mainWin.getSize();
    store.windowBounds = { width: w, height: h };
    saveStore(store);
  });

  mainWin.on('closed', () => { mainWin = null; });
  buildMenu();
}

app.whenReady().then(() => {
  const { session } = require('electron');
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    console.warn(`Denied permission request: ${permission}`);
    callback(false);
  });
  createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!mainWin) createWindow(); });

// ── Menu ──────────────────────────────────────────────────────────────────────
function buildMenu() {
  const m = Menu.buildFromTemplate([
    { label: 'File', submenu: [
      { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => mainWin.webContents.send('menu-open') },
      { label: 'Close File', accelerator: 'CmdOrCtrl+W', click: () => mainWin.webContents.send('menu-close') },
      { type: 'separator' },
      { label: 'Save / Export as PDF', accelerator: 'CmdOrCtrl+S', click: () => mainWin.webContents.send('menu-save') },
      { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: () => mainWin.webContents.send('menu-print') },
      { type: 'separator' },
      { label: 'Exit', accelerator: 'Alt+F4', role: 'quit' }
    ]},
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
    ]},
    { label: 'View', submenu: [
      { label: 'Zoom In',    accelerator: 'CmdOrCtrl+=', click: () => mainWin.webContents.send('zoom-in') },
      { label: 'Zoom Out',   accelerator: 'CmdOrCtrl+-', click: () => mainWin.webContents.send('zoom-out') },
      { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', click: () => mainWin.webContents.send('zoom-reset') },
      { type: 'separator' },
      { label: 'Toggle Full Screen', accelerator: 'F11', role: 'togglefullscreen' },
      { label: 'Dev Tools', accelerator: 'F12', role: 'toggleDevTools' }
    ]},
    { label: 'Help', submenu: [
      { label: 'About Kaivo PDF', click: () => dialog.showMessageBox(mainWin, {
          type:'info', title:'About Kaivo PDF',
          message:'Kaivo PDF  v1.0.0',
          detail:'Free PDF reader, editor & converter.\nAll features free. No ads. No subscriptions.',
          buttons:['OK'], icon: path.join(__dirname,'icon.ico')
        })
      }
    ]}
  ]);
  Menu.setApplicationMenu(m);
}

// ── IPC: Window controls ──────────────────────────────────────────────────────
ipcMain.on('win-minimize', () => mainWin?.minimize());
ipcMain.on('win-maximize', () => mainWin?.isMaximized() ? mainWin.unmaximize() : mainWin.maximize());
ipcMain.on('win-close',    () => mainWin?.close());

// ── IPC: Open file ────────────────────────────────────────────────────────────
ipcMain.handle('dialog:openFile', async (e, filters) => {
  const r = await dialog.showOpenDialog(mainWin, {
    title: 'Open File',
    filters: filters || [{ name:'PDF', extensions:['pdf'] }, { name:'All', extensions:['*'] }],
    properties: ['openFile']
  });
  if (r.canceled || !r.filePaths.length) return null;
  const fp = r.filePaths[0];
  addAllowedPath(fp);
  try {
    const data = fs.readFileSync(fp);
    addRecent(fp);
    return { filePath: fp, fileName: path.basename(fp), data: data.toString('base64'), size: data.length, ext: path.extname(fp).toLowerCase() };
  } catch(err) { return { error: err.message }; }
});

// ── IPC: Open multiple files ──────────────────────────────────────────────────
ipcMain.handle('dialog:openFiles', async (e, filters) => {
  const r = await dialog.showOpenDialog(mainWin, {
    title: 'Select Files',
    filters: filters || [{ name:'All', extensions:['*'] }],
    properties: ['openFile', 'multiSelections']
  });
  if (r.canceled) return [];
  // Read all files and return data too
  return r.filePaths.map(fp => {
    addAllowedPath(fp);
    try {
      const data = fs.readFileSync(fp);
      return { filePath: fp, fileName: path.basename(fp), data: data.toString('base64'), size: data.length, ext: path.extname(fp).toLowerCase() };
    } catch { return { filePath: fp, fileName: path.basename(fp) }; }
  });
});

// ── IPC: Save file dialog ─────────────────────────────────────────────────────
ipcMain.handle('dialog:saveFile', async (e, opts) => {
  const r = await dialog.showSaveDialog(mainWin, {
    title: 'Save File',
    defaultPath: path.join(store.defaultSaveDir, opts.defaultName || 'document.pdf'),
    filters: opts.filters || [{ name:'PDF', extensions:['pdf'] }]
  });
  if (r.canceled || !r.filePath) return null;
  addAllowedPath(r.filePath);
  return r.filePath;
});

// ── IPC: Choose folder ────────────────────────────────────────────────────────
ipcMain.handle('dialog:openFolder', async () => {
  const r = await dialog.showOpenDialog(mainWin, {
    title:'Choose Folder', properties:['openDirectory','createDirectory']
  });
  if (r.canceled || !r.filePaths.length) return null;
  const fp = r.filePaths[0];
  addAllowedPath(fp);
  store.defaultSaveDir = fp;
  saveStore(store);
  return fp;
});

// ── IPC: Read file ────────────────────────────────────────────────────────────
ipcMain.handle('fs:readFile', async (e, fp) => {
  if (!isPathAllowed(fp)) {
    return { success: false, error: 'Access denied: Path is not allowed.' };
  }
  try {
    const data = fs.readFileSync(fp);
    return { success:true, data: data.toString('base64'), fileName: path.basename(fp) };
  } catch(err) { return { success:false, error: err.message }; }
});

// ── IPC: Write file ───────────────────────────────────────────────────────────
ipcMain.handle('fs:writeFile', async (e, fp, b64) => {
  if (!isPathAllowed(fp)) {
    return { success: false, error: 'Access denied: Path is not allowed.' };
  }
  try { fs.writeFileSync(fp, Buffer.from(b64,'base64')); return { success:true }; }
  catch(err) { return { success:false, error: err.message }; }
});

// ── IPC: Rename file ──────────────────────────────────────────────────────────
ipcMain.handle('fs:renameFile', async (e, oldPath, newName) => {
  if (!isPathAllowed(oldPath)) {
    return { success: false, error: 'Access denied: Source path is not allowed.' };
  }
  try {
    const dir = path.dirname(oldPath);
    const newPath = path.join(dir, newName.endsWith('.pdf') ? newName : newName+'.pdf');
    if (!isPathAllowed(newPath)) {
      return { success: false, error: 'Access denied: Destination path is not allowed.' };
    }
    fs.renameSync(oldPath, newPath);
    addAllowedPath(newPath);
    addRecent(newPath);
    return { success:true, newPath };
  } catch(err) { return { success:false, error: err.message }; }
});

// ── IPC: Copy file ────────────────────────────────────────────────────────────
ipcMain.handle('fs:copyFile', async (e, src, dest) => {
  if (!isPathAllowed(src) || !isPathAllowed(dest)) {
    return { success: false, error: 'Access denied: Path is not allowed.' };
  }
  try {
    fs.copyFileSync(src, dest);
    addAllowedPath(dest);
    return { success:true };
  } catch(err) { return { success:false, error: err.message }; }
});

// ── IPC: Settings ─────────────────────────────────────────────────────────────
ipcMain.handle('store:get',    (e, k)    => store[k] !== undefined ? store[k] : DEFAULTS[k]);
ipcMain.handle('store:set',    (e, k, v) => { store[k] = v; saveStore(store); });
ipcMain.handle('store:getAll', ()        => store);
ipcMain.handle('store:reset',  ()        => { store = { ...DEFAULTS }; saveStore(store); return store; });
ipcMain.handle('app:getPath',  (e, n)    => app.getPath(n));
ipcMain.handle('app:getVersion',()       => app.getVersion());

// ── IPC: Recent files ─────────────────────────────────────────
function addRecent(fp) {
  store.lastFile = fp;
  let r = store.recentFiles || [];
  r = [fp, ...r.filter(x => x !== fp)].slice(0, 10);
  store.recentFiles = r;
  saveStore(store);
  mainWin?.webContents.send('recent-updated');
}
ipcMain.handle('app:getRecent', () => {
  const recent = (store.recentFiles || []).filter(f => fs.existsSync(f));
  const pinned = (store.pinnedFiles || []).filter(f => fs.existsSync(f));
  return { recent, pinned };
});
ipcMain.handle('app:clearRecent', () => { store.recentFiles=[]; store.pinnedFiles=[]; store.lastFile=null; saveStore(store); });
ipcMain.handle('app:pinFile', (e, fp) => {
  let pinned = store.pinnedFiles || [];
  if (!pinned.includes(fp)) {
    pinned.push(fp);
  }
  store.pinnedFiles = pinned;
  saveStore(store);
  return pinned;
});
ipcMain.handle('app:unpinFile', (e, fp) => {
  let pinned = store.pinnedFiles || [];
  pinned = pinned.filter(x => x !== fp);
  store.pinnedFiles = pinned;
  saveStore(store);
  return pinned;
});
ipcMain.handle('app:removeRecent', (e, fp) => {
  let r = store.recentFiles || [];
  r = r.filter(x => x !== fp);
  store.recentFiles = r;
  saveStore(store);
  return r;
});

// ── IPC: Library (PDFs created by app) ───────────────────────
ipcMain.handle('app:getLibrary', () => {
  const lib = store.library || [];
  return lib.filter(f => fs.existsSync(f.path));
});
ipcMain.handle('app:addToLibrary', (e, entry) => {
  let lib = store.library || [];
  lib = [entry, ...lib.filter(x => x.path !== entry.path)].slice(0, 50);
  store.library = lib;
  saveStore(store);
  mainWin?.webContents.send('library-updated', lib.filter(f => fs.existsSync(f.path)));
});
ipcMain.handle('app:removeFromLibrary', (e, filePath) => {
  let lib = store.library || [];
  lib = lib.filter(x => x.path !== filePath);
  store.library = lib;
  saveStore(store);
  mainWin?.webContents.send('library-updated', lib.filter(f => fs.existsSync(f.path)));
  return lib.filter(f => fs.existsSync(f.path));
});
ipcMain.handle('app:updateLibraryEntry', (e, oldPath, updates) => {
  let lib = store.library || [];
  const idx = lib.findIndex(x => x.path === oldPath);
  if (idx < 0) return lib.filter(f => fs.existsSync(f.path));
  lib[idx] = { ...lib[idx], ...updates };
  if (updates.path && updates.path !== oldPath) {
    lib = [lib[idx], ...lib.filter((x, i) => i !== idx && x.path !== updates.path)];
  }
  store.library = lib;
  saveStore(store);
  mainWin?.webContents.send('library-updated', lib.filter(f => fs.existsSync(f.path)));
  return lib.filter(f => fs.existsSync(f.path));
});
ipcMain.handle('fs:deleteFile', async (e, filePath, mode) => {
  if (!isPathAllowed(filePath)) {
    return { success: false, error: 'Access denied: Path is not allowed.' };
  }
  try {
    if (mode === 'recycle') {
      await shell.trashItem(filePath);
      return { success: true };
    } else if (mode === 'permanent') {
      fs.unlinkSync(filePath);
      return { success: true };
    }
    return { success: false, error: 'Invalid deletion mode' };
  } catch(err) {
    return { success: false, error: err.message };
  }
});

// ── IPC: Shell ────────────────────────────────────────────────────────────────
ipcMain.handle('shell:openPath',        (e, p) => shell.openPath(p));
ipcMain.handle('shell:showInFolder',    (e, p) => { shell.showItemInFolder(p); });

const PAGE_SIZE_MAP = {
  A4: 'A4', A3: 'A3', A5: 'A5',
  Letter: 'Letter', Legal: 'Legal', Tabloid: 'Tabloid'
};

async function generateEditorPdf(pageSize) {
  await mainWin.webContents.executeJavaScript(
    'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'
  );
  return mainWin.webContents.printToPDF({
    printBackground: true,
    pageSize: PAGE_SIZE_MAP[pageSize] || 'A4',
    margins: { marginType: 'none' },
    preferCSSPageSize: true,
    // Suppress Chromium's "Generating PDF..." / "Print Preview" header and footer
    displayHeaderFooter: false,
    headerTemplate: '',
    footerTemplate: ''
  });
}

// ── IPC: Generate PDF buffer for print preview / export ───────────────────────
ipcMain.handle('pdf:generateBuffer', async (e, pageSize) => {
  try {
    const pdfData = await generateEditorPdf(pageSize);
    return { success: true, data: pdfData.toString('base64') };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── IPC: Print a PDF buffer via hidden window (Kaivo-branded flow) ────────────
ipcMain.handle('pdf:printBuffer', async (e, base64) => {
  const tempPath = path.join(os.tmpdir(), `kaivo-print-${Date.now()}.pdf`);
  try {
    fs.writeFileSync(tempPath, Buffer.from(base64, 'base64'));
    const printWin = new BrowserWindow({
      show: false,
      title: 'Print — Kaivo PDF',
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    });
    await printWin.loadFile(tempPath);
    return await new Promise(resolve => {
      printWin.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
        printWin.destroy();
        try { fs.unlinkSync(tempPath); } catch {}
        resolve({ success, error: failureReason || null });
      });
    });
  } catch (err) {
    try { fs.unlinkSync(tempPath); } catch {}
    return { success: false, error: err.message };
  }
});

// ── IPC: Export PDF using printToPDF (NOT print dialog) ───────────────────────
ipcMain.handle('pdf:exportFromEditor', async (e, savePath) => {
  if (!isPathAllowed(savePath)) {
    return { success: false, error: 'Access denied: Path is not allowed.' };
  }
  try {
    const pdfData = await generateEditorPdf('A4');
    fs.writeFileSync(savePath, pdfData);
    return { success: true };
  } catch(err) {
    return { success: false, error: err.message };
  }
});

// ── IPC: Export PDF with custom page size ─────────────────────────────────────
ipcMain.handle('pdf:exportWithSize', async (e, savePath, pageSize, marginKey, margins) => {
  if (!isPathAllowed(savePath)) {
    return { success: false, error: 'Access denied: Path is not allowed.' };
  }
  try {
    const pdfData = await generateEditorPdf(pageSize || 'A4');
    fs.writeFileSync(savePath, pdfData);
    return { success: true };
  } catch(err) {
    return { success: false, error: err.message };
  }
});

// ── IPC: Set default PDF reader ───────────────────────────────────────────────
ipcMain.handle('app:setDefault', async () => {
  if (process.platform !== 'win32') return { success:false, error:'Windows only' };
  try {
    const exe  = process.execPath;
    const ico  = app.isPackaged
      ? path.join(process.resourcesPath, 'pdf-file-icon.ico')
      : path.join(__dirname, 'pdf-file-icon.ico');
    const prog = 'KaivoPDF.pdf';
    const regCalls = [
      ['add', `HKCU\\Software\\Classes\\${prog}`, '/ve', '/t', 'REG_SZ', '/d', 'PDF Document', '/f'],
      ['add', `HKCU\\Software\\Classes\\${prog}\\DefaultIcon`, '/ve', '/t', 'REG_SZ', '/d', `${ico},0`, '/f'],
      ['add', `HKCU\\Software\\Classes\\${prog}\\shell\\open\\command`, '/ve', '/t', 'REG_SZ', '/d', `"${exe}" "%1"`, '/f'],
      ['add', 'HKCU\\Software\\Classes\\.pdf', '/ve', '/t', 'REG_SZ', '/d', prog, '/f'],
      ['add', 'HKCU\\Software\\Classes\\.pdf\\OpenWithProgids', '/v', prog, '/t', 'REG_SZ', '/d', '', '/f'],
      ['add', 'HKCU\\Software\\Kaivo\\KaivoPDF\\Capabilities', '/v', 'ApplicationDescription', '/t', 'REG_SZ', '/d', 'Free PDF Reader & Editor', '/f'],
      ['add', 'HKCU\\Software\\Kaivo\\KaivoPDF\\Capabilities', '/v', 'ApplicationName', '/t', 'REG_SZ', '/d', 'Kaivo PDF', '/f'],
      ['add', 'HKCU\\Software\\Kaivo\\KaivoPDF\\Capabilities\\FileAssociations', '/v', '.pdf', '/t', 'REG_SZ', '/d', prog, '/f'],
      ['add', 'HKCU\\Software\\RegisteredApplications', '/v', 'KaivoPDF', '/t', 'REG_SZ', '/d', 'Software\\Kaivo\\KaivoPDF\\Capabilities', '/f'],
    ];

    for (const args of regCalls) {
      try { spawnSync('reg', args, { windowsHide: true }); } catch {}
    }
    // Force icon/shell refresh without requiring Explorer restart
    try { spawnSync('ie4uinit.exe', ['-show'], { windowsHide: true }); } catch {}
    try { spawnSync('rundll32.exe', ['shell32.dll,SHChangeNotify', '0x08000000', '0x0000', '0', '0'], { windowsHide: true }); } catch {}
    
    store.isDefaultReader = true;
    store.iconApplied = true;
    saveStore(store);
    
    shell.openExternal('ms-settings:defaultapps').catch(() => {});
    return { success:true };
  } catch(err) { return { success:false, error:err.message }; }
});

// ── IPC: Remove default ───────────────────────────────────────────────────────
ipcMain.handle('app:removeDefault', async () => {
  if (process.platform !== 'win32') return { success:false };
  const regCalls = [
    ['delete', 'HKCU\\Software\\Classes\\.pdf', '/f'],
    ['delete', 'HKCU\\Software\\Classes\\KaivoPDF.pdf', '/f'],
    ['delete', 'HKCU\\Software\\Kaivo', '/f'],
    ['delete', 'HKCU\\Software\\RegisteredApplications', '/v', 'KaivoPDF', '/f'],
  ];
  for (const args of regCalls) { try { spawnSync('reg', args, { windowsHide: true }); } catch {} }
  try { spawnSync('ie4uinit.exe', ['-show'], { windowsHide: true }); } catch {}
  try { spawnSync('rundll32.exe', ['shell32.dll,SHChangeNotify', '0x08000000', '0x0000', '0', '0'], { windowsHide: true }); } catch {}
  
  store.isDefaultReader = false; store.iconApplied = false; saveStore(store);
  return { success:true };
});

// ── IPC: Apply icon only ──────────────────────────────────────────────────────
ipcMain.handle('app:applyIcon', async () => {
  if (process.platform !== 'win32') return { success:false };
  try {
    const ico  = app.isPackaged
      ? path.join(process.resourcesPath, 'pdf-file-icon.ico')
      : path.join(__dirname, 'pdf-file-icon.ico');
    const prog = 'KaivoPDF.pdf';
    const regCalls = [
      ['add', `HKCU\\Software\\Classes\\${prog}`, '/ve', '/t', 'REG_SZ', '/d', 'PDF Document', '/f'],
      ['add', `HKCU\\Software\\Classes\\${prog}\\DefaultIcon`, '/ve', '/t', 'REG_SZ', '/d', `${ico},0`, '/f'],
      ['add', 'HKCU\\Software\\Classes\\.pdf', '/ve', '/t', 'REG_SZ', '/d', prog, '/f'],
      ['add', 'HKCU\\Software\\Classes\\.pdf\\OpenWithProgids', '/v', prog, '/t', 'REG_SZ', '/d', '', '/f'],
    ];
    for (const args of regCalls) {
      try { spawnSync('reg', args, { windowsHide: true }); } catch {}
    }
    // Force Windows Explorer icon cache refresh
    try { spawnSync('ie4uinit.exe', ['-show'], { windowsHide: true }); } catch {}
    try { spawnSync('rundll32.exe', ['shell32.dll,SHChangeNotify', '0x08000000', '0x0000', '0', '0'], { windowsHide: true }); } catch {}
    store.iconApplied = true; saveStore(store);
    return { success:true };
  } catch(err) { return { success:false, error:err.message }; }
});



