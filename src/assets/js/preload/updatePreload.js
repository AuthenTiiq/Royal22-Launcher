/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

"use strict";

const { contextBridge, ipcRenderer, shell } = require('electron');
const { NodeBDD, DataType } = require('node-bdd');
const nodeFetch = require('node-fetch');
const pkg = require('../../../../package.json');

const nodedatabase = new NodeBDD();
const dev = process.env.NODE_ENV === 'dev';
const repositoryURL = pkg.repository?.url || '';
const launcherBaseURL = pkg.user ? `${pkg.url}/${pkg.user}` : pkg.url;

function getRepositorySlug() {
    return repositoryURL
        .replace('git+', '')
        .replace('.git', '')
        .replace('https://github.com/', '')
        .split('/');
}

async function fetchJSON(url, headers = {}) {
    const response = await nodeFetch(url, { headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

async function fetchLatestRelease() {
    const [owner, repo] = getRepositorySlug();
    if (!owner || !repo) throw new Error('Repository GitHub introuvable');

    return fetchJSON(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
        Accept: 'application/vnd.github+json'
    });
}

function getConfigURL() {
    return `${launcherBaseURL}/launcher/config-launcher/config.json`;
}

async function getRemoteConfig() {
    return fetchJSON(getConfigURL());
}

async function readData(tableName, key = 1) {
    const userDataPath = await ipcRenderer.invoke('path-user-data');
    const table = await nodedatabase.intilize({
        databaseName: 'Databases',
        fileType: dev ? 'sqlite' : 'db',
        tableName,
        path: `${userDataPath}${dev ? '../..' : '/databases'}`,
        tableColumns: {
            json_data: DataType.TEXT.TEXT,
        },
    });

    let data = await nodedatabase.getDataById(table, key);
    if (!data) return undefined;

    const id = data.id;
    data = JSON.parse(data.json_data);
    data.ID = id;
    return data;
}

async function getLauncherTheme() {
    try {
        const configClient = await readData('configClient');
        return configClient?.launcher_config?.theme || 'auto';
    } catch (error) {
        console.error('Impossible de lire le theme du launcher:', error);
        return 'auto';
    }
}

function isSafeExternalURL(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

function on(channel, callback) {
    if (typeof callback !== 'function') return () => { };
    const listener = (_event, ...args) => callback(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('updateAPI', {
    appInfo: {
        version: pkg.version,
        repositoryURL,
    },
    platform: process.platform,
    getLauncherTheme,
    getRemoteConfig,
    fetchLatestRelease,
    isDarkTheme: theme => ipcRenderer.invoke('is-dark-theme', theme),
    checkForUpdates: () => ipcRenderer.invoke('update-app'),
    startUpdate: () => ipcRenderer.send('start-update'),
    openMainWindow: () => ipcRenderer.send('main-window-open'),
    closeUpdateWindow: () => ipcRenderer.send('update-window-close'),
    openDevTools: () => ipcRenderer.send('update-window-dev-tools'),
    showProgressLoad: () => ipcRenderer.send('update-window-progress-load'),
    setWindowProgress: options => ipcRenderer.send('update-window-progress', options),
    openExternal: url => {
        if (!isSafeExternalURL(url)) throw new Error('URL externe refusee');
        return shell.openExternal(url);
    },
    onUpdateAvailable: callback => on('updateAvailable', callback),
    onError: callback => on('error', callback),
    onDownloadProgress: callback => on('download-progress', callback),
    onUpdateNotAvailable: callback => on('update-not-available', callback),
});