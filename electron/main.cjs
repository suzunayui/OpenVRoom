const { app, BrowserWindow, session } = require('electron');
const path = require('node:path');

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  const window = new BrowserWindow({
    show: process.env.OPENVROOM_HEADLESS !== '1',
    width: 1440, height: 960, minWidth: 840, minHeight: 640,
    title: 'OpenVRoom', backgroundColor: '#171d25', autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      ...(process.env.OPENVROOM_HEADLESS === '1' ? { offscreen: true, backgroundThrottling: false } : {}),
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.loadFile(path.join(__dirname, '../dist/index.html'));
});
app.on('window-all-closed', () => app.quit());
