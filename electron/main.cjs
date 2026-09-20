const { app, BrowserWindow, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

app.whenReady().then(() => {
  const trustedUrl = pathToFileURL(path.join(__dirname, '../dist/index.html')).href;
  const trusted = contents => contents && contents.getURL().split('#')[0] === trustedUrl;
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(!!(trusted(contents) && permission === 'media' && details.isMainFrame !== false && details.mediaTypes?.length && details.mediaTypes.every(type => type === 'audio')));
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) => {
    return !!(trusted(contents) && permission === 'media' && details.isMainFrame !== false && details.mediaType === 'audio');
  });
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
