/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const path = require("path");
const os = require("os");
const pkg = require("../../../../package.json");
let dev = process.env.DEV_TOOL === 'open';
let mainWindow = undefined;

function getWindow() {
    return mainWindow;
}

function destroyWindow() {
    if (!mainWindow) return;
    app.quit();
    mainWindow = undefined;
}

function createWindow() {
    destroyWindow();
    mainWindow = new BrowserWindow({
        title: pkg.preductname,
        width: 1280,
        height: 720,
        minWidth: 980,
        minHeight: 552,
        resizable: true,
        icon: `./src/assets/images/icon.${os.platform() === "win32" ? "ico" : "png"}`,
        frame: os.platform() !== 'win32',
        show: false,
        webPreferences: {
            contextIsolation: false,
            nodeIntegration: true
        },
    });
    Menu.setApplicationMenu(null);
    mainWindow.setMenuBarVisibility(false);
    mainWindow.loadFile(path.join(`${app.getAppPath()}/src/launcher.html`));
    mainWindow.once('ready-to-show', () => {
        if (mainWindow) {
            if (dev) mainWindow.webContents.openDevTools({ mode: 'detach' })
            mainWindow.show()
        }
    });

    // Ajout du menu
    const isMac = process.platform === 'darwin';

    const template = [
        ...(isMac ? [{
            label: app.name,
            submenu: [
                { label: 'À propos de RoyalCreeps', role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { label: 'Masquer RoyalCreeps', role: 'hide' },
                { label:'Masquer les autres', role: 'hideOthers' },
                { label: 'Afficher tout', role: 'unhide' },
                { type: 'separator' },
                { label: 'Quitter', role: 'quit' }
            ]
        }] : []),
        {
            label: 'Fichier',
            submenu: [
                isMac ? { label: 'Fermer', role: 'close' } : { role: 'quit' },
                { type:'separator'},
                { label: 'Couper', accelerator: 'CmdOrCtrl+X', role: 'cut' },
                { label: 'Copier', accelerator: 'CmdOrCtrl+C', role: 'copy' },
                { label: 'Coller', accelerator: 'CmdOrCtrl+V', role: 'paste' }
            ]
        },
        {
            label: 'Réglages',
            submenu: [
                { label: 'Gérer mes comptes', click() { mainWindow.webContents.send('open-settings-panel'), mainWindow.webContents.send('open-settings-accounts');}, accelerator: 'CmdOrCtrl+Shift+A' },
                { label: 'Se déconnecter' },
                { type: 'separator' },
                { label: 'Réglages', submenu: [
                    { label: 'Gestions des comptes', click() { mainWindow.webContents.send('open-settings-panel'), mainWindow.webContents.send('open-settings-accounts');}, accelerator: 'Shift+1'},
                    { label: 'Gestion de la RAM', click() { mainWindow.webContents.send('open-settings-panel'), mainWindow.webContents.send('open-settings-java');}, accelerator: 'Shift+2'},
                    { label: 'Résolution', click() { mainWindow.webContents.send('open-settings-panel'), mainWindow.webContents.send('open-settings-resolution');}, accelerator: 'Shift+3'},
                    { label: 'Launcher', click() { mainWindow.webContents.send('open-settings-panel'), mainWindow.webContents.send('open-settings-launcher');}, accelerator: 'Shift+4'},
                ] },
                { type: 'separator'},
                { label: 'Accéder au site web', click: async () => {
                    const { shell } = require('electron')
                    await shell.openExternal('https://royalcreeps.fr')
                }}

            ]
        },
        {
            label: 'Affichage',
            submenu: [
                { label: 'Recharger', role: 'reload' },
                { label: 'Afficher la vue développeur', role: 'toggleDevTools' },
                { type: 'separator' },
                { label: 'Pleine écran', role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Fenêtre',
            submenu: [
                { label: 'Minimiser', role: 'minimize' },
                { label: 'Zoom', role: 'zoom' },
                { type: 'separator' },
                { label: 'Fermer', role: 'close' }
            ]
        },
        {
            label: 'Aide',
            role: 'help',
            submenu: [
                {
                    label: 'Site web',
                    click: async () => {
                        const { shell } = require('electron')
                        await shell.openExternal('https://royalcreeps.fr')
                    }
                },
                { label: "Wiki RoyalCreep's", click: async () => {
                    const { shell } = require('electron')
                    await shell.openExternal('https://royalcreeps.fr/wiki')
                }},
                { type: 'separator'},
                { label: "État des serveurs", click: openServersStatusWindow, accelerator: 'CmdOrCtrl+E'}
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

let serversStatusWindow = null;

function openServersStatusWindow() {
    if (serversStatusWindow === null || serversStatusWindow.closed) {
        serversStatusWindow = new BrowserWindow({
            // Propriétés de votre fenêtre
            width: 800,
            height: 600,
            titleBarStyle: 'hidden',
            // Autres propriétés...
        });

        // Masque les boutons de fenêtre macOS par défaut
        serversStatusWindow.setWindowButtonVisibility(false);

        // Charger le fichier HTML ou une URL pour afficher l'état des serveurs
        serversStatusWindow.loadURL("https://status.royalcreeps.fr");

        // Attacher un gestionnaire d'événements pour la fermeture de la fenêtre
        serversStatusWindow.on('close', () => {
            serversStatusWindow = null;
        });

        // Gestionnaire d'événements pour la touche Échap
        serversStatusWindow.webContents.on('before-input-event', (event, input) => {
            if (input.key === 'Escape') {
                serversStatusWindow.close();
            }
        });

        // Gestionnaire d'événements pour intercepter les tentatives de navigation
        serversStatusWindow.webContents.on('will-navigate', (event, url) => {
            // Vérifier si l'URL de destination est différente de celle de la page de statut
            if (url !== "https://status.royalcreeps.fr") {
                // Empêcher la navigation
                event.preventDefault();
            }
        });


    } else {
        serversStatusWindow.focus();
    }
}


module.exports = {
    getWindow,
    createWindow,
    destroyWindow,
};
