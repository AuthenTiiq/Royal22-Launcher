/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

const { app, ipcMain, nativeTheme } = require('electron');
console.log('App defined:', !!app);
try {
    console.log('App version:', app.getVersion());
} catch (e) {
    console.error('Error getting app version:', e);
}

const { autoUpdater } = require('electron-updater')
const { Microsoft } = require('minecraft-java-core');

const path = require('path');
const fs = require('fs');

const UpdateWindow = require("./assets/js/windows/updateWindow.js");
const MainWindow = require("./assets/js/windows/mainWindow.js");

let dev = process.env.NODE_ENV === 'dev';

function getSafeWindow(getWindow) {
    const browserWindow = getWindow();
    if (!browserWindow || browserWindow.isDestroyed()) return null;
    return browserWindow;
}

function withWindow(getWindow, callback) {
    const browserWindow = getSafeWindow(getWindow);
    if (!browserWindow) return;
    callback(browserWindow);
}

function setWindowProgress(getWindow, options) {
    const browserWindow = getSafeWindow(getWindow);
    if (!browserWindow) return;

    if (!options || typeof options.progress !== 'number' || typeof options.size !== 'number' || options.size <= 0) {
        browserWindow.setProgressBar(-1);
        return;
    }

    const progress = Math.max(0, Math.min(1, options.progress / options.size));
    browserWindow.setProgressBar(progress);
}

function isTrustedSender(event, allowedWindows) {
    return allowedWindows.some(getWindow => {
        const browserWindow = getSafeWindow(getWindow);
        return browserWindow && event.sender === browserWindow.webContents;
    });
}

function onTrusted(channel, allowedWindows, callback) {
    ipcMain.on(channel, (event, ...args) => {
        if (!isTrustedSender(event, allowedWindows)) return;
        callback(event, ...args);
    });
}

function handleTrusted(channel, allowedWindows, callback) {
    ipcMain.handle(channel, (event, ...args) => {
        if (!isTrustedSender(event, allowedWindows)) {
            throw new Error(`Unauthorized IPC sender for ${channel}`);
        }
        return callback(event, ...args);
    });
}

if (dev) {
    let appPath = path.resolve('./data/Launcher').replace(/\\/g, '/');
    let appdata = path.resolve('./data').replace(/\\/g, '/');
    if (!fs.existsSync(appPath)) fs.mkdirSync(appPath, { recursive: true });
    if (!fs.existsSync(appdata)) fs.mkdirSync(appdata, { recursive: true });
    app.setPath('userData', appPath);
    app.setPath('appData', appdata)
}

if (!app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(() => {
    if (dev) return MainWindow.createWindow()
    UpdateWindow.createWindow()
});

onTrusted('main-window-open', [UpdateWindow.getWindow], () => MainWindow.createWindow())
onTrusted('main-window-dev-tools', [MainWindow.getWindow], () => withWindow(MainWindow.getWindow, window => window.webContents.openDevTools({ mode: 'detach' })))
onTrusted('main-window-dev-tools-close', [MainWindow.getWindow], () => withWindow(MainWindow.getWindow, window => window.webContents.closeDevTools()))
onTrusted('main-window-close', [MainWindow.getWindow], () => MainWindow.destroyWindow())
onTrusted('main-window-reload', [MainWindow.getWindow], () => withWindow(MainWindow.getWindow, window => window.reload()))
onTrusted('main-window-progress', [MainWindow.getWindow], (event, options) => setWindowProgress(MainWindow.getWindow, options))
onTrusted('main-window-progress-reset', [MainWindow.getWindow], () => withWindow(MainWindow.getWindow, window => window.setProgressBar(-1)))
onTrusted('main-window-progress-load', [MainWindow.getWindow], () => withWindow(MainWindow.getWindow, window => window.setProgressBar(2)))
onTrusted('main-window-minimize', [MainWindow.getWindow], () => withWindow(MainWindow.getWindow, window => window.minimize()))

onTrusted('update-window-close', [UpdateWindow.getWindow], () => UpdateWindow.destroyWindow())
onTrusted('update-window-dev-tools', [UpdateWindow.getWindow], () => withWindow(UpdateWindow.getWindow, window => window.webContents.openDevTools({ mode: 'detach' })))
onTrusted('update-window-progress', [UpdateWindow.getWindow], (event, options) => setWindowProgress(UpdateWindow.getWindow, options))
onTrusted('update-window-progress-reset', [UpdateWindow.getWindow], () => withWindow(UpdateWindow.getWindow, window => window.setProgressBar(-1)))
onTrusted('update-window-progress-load', [UpdateWindow.getWindow], () => withWindow(UpdateWindow.getWindow, window => window.setProgressBar(2)))

handleTrusted('path-user-data', [MainWindow.getWindow, UpdateWindow.getWindow], () => app.getPath('userData'))
handleTrusted('appData', [MainWindow.getWindow, UpdateWindow.getWindow], () => app.getPath('appData'))

onTrusted('main-window-maximize', [MainWindow.getWindow], () => {
    const mainWindow = getSafeWindow(MainWindow.getWindow);
    if (!mainWindow) return;

    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow.maximize();
    }
})

onTrusted('main-window-hide', [MainWindow.getWindow], () => withWindow(MainWindow.getWindow, window => window.hide()))
onTrusted('main-window-show', [MainWindow.getWindow], () => withWindow(MainWindow.getWindow, window => window.show()))

handleTrusted('Microsoft-window', [MainWindow.getWindow], async (_, client_id) => {
    console.log('[Microsoft Auth] Starting with client_id:', client_id);
    try {
        const result = await new Microsoft(client_id).getAuth();
        //console.log('[Microsoft Auth] Result:', JSON.stringify(result, null, 2));
        return result;
    } catch (error) {
        //console.error('[Microsoft Auth] Error:', error);
        return { error: error.message || 'Unknown error during Microsoft authentication' };
    }
})

handleTrusted('is-dark-theme', [MainWindow.getWindow, UpdateWindow.getWindow], (_, theme) => {
    if (theme === 'dark') return true
    if (theme === 'light') return false
    return nativeTheme.shouldUseDarkColors;
})

app.on('window-all-closed', () => app.quit());

autoUpdater.autoDownload = false;

handleTrusted('update-app', [UpdateWindow.getWindow], async () => {
    try {
        return await autoUpdater.checkForUpdates();
    } catch (error) {
        throw new Error(error?.message || String(error));
    }
})

autoUpdater.on('update-available', () => {
    const updateWindow = getSafeWindow(UpdateWindow.getWindow);
    if (updateWindow) updateWindow.webContents.send('updateAvailable');
});

onTrusted('start-update', [UpdateWindow.getWindow], () => {
    autoUpdater.downloadUpdate();
})

autoUpdater.on('update-not-available', () => {
    const updateWindow = getSafeWindow(UpdateWindow.getWindow);
    if (updateWindow) updateWindow.webContents.send('update-not-available');
});

autoUpdater.on('update-downloaded', () => {
    autoUpdater.quitAndInstall();
});

autoUpdater.on('download-progress', (progress) => {
    const updateWindow = getSafeWindow(UpdateWindow.getWindow);
    if (updateWindow) updateWindow.webContents.send('download-progress', progress);
})

autoUpdater.on('error', (err) => {
    const updateWindow = getSafeWindow(UpdateWindow.getWindow);
    if (updateWindow) updateWindow.webContents.send('error', err);
});