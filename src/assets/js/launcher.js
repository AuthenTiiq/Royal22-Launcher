/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */
// import panel
import Login from './panels/login.js';
import Home from './panels/home.js';
import Settings from './panels/settings.js';

// import modules
import { logger, config, changePanel, database, popup, setBackground, accountSelect, addAccount, pkg, toggleNavbar } from './utils.js';
import EventManager from './utils/event-manager.js';
const { AZauth, Microsoft, Mojang } = require('minecraft-java-core');

// libs
const { ipcRenderer } = require('electron');
const fs = require('fs');

class Launcher {
    async init() {
        this.eventManager = new EventManager();
        this.accountRefreshPromises = new Map();
        window.launcherAccountRefresh = {
            waitFor: accountID => this.waitForAccountRefresh(accountID)
        };
        this.initLog();
        console.log('Initializing Launcher...');
        this.shortcut()
        this.initBackground();
        let backgroundReady = setBackground().catch(err => console.error('Background initialization failed:', err));
        if (process.platform == 'win32') this.initFrame();
        this.db = new database();
        this.config = await this.loadConfig();
        if (await this.config.error) return this.errorConnect()
        await Promise.all([backgroundReady, this.initConfigClient()]);
        this.createPanels(Login, Home, Settings);
        this.initGlobalNavigation();
        this.startLauncher();
        this.eventManager.add(ipcRenderer, 'open-settings-panel', () => {
            this.showSettingsPanel();
        });

    }

    initGlobalNavigation() {
        this.eventManager.add(document.getElementById('nav-home'), 'click', () => {
            changePanel('home');
            this.updateNavState('nav-home');
        });

        this.eventManager.add(document.getElementById('nav-settings'), 'click', () => {
            this.showSettingsPanel();
        });


    }

    updateNavState(activeId) {
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        document.getElementById(activeId).classList.add('active');
    }

    showSettingsPanel() {
        this.initPanel('settings');
        changePanel('settings');
        this.updateNavState('nav-settings');
    }

    initLog() {
        this.eventManager.add(document, 'keydown', e => {
            if (e.ctrlKey && e.shiftKey && e.keyCode == 173 || e.keyCode == 123) {
                ipcRenderer.send('main-window-dev-tools-close');
                ipcRenderer.send('main-window-dev-tools');
            }
        })
        new logger(pkg.name, '#7289da')
    }

    async initBackground() {
        const video = document.getElementById("background-video");

        const changeSource = (url) => {
            const video = document.getElementById("background-video");
            console.log("Chargement du background RoyalCreeps : ", url);
            video.src = url;
            video.poster = ""; // Réinitialise le poster
            video.load(); // Charge la nouvelle source
            video.onloadeddata = () => {
                // console.log("La vidéo est chargée, en train de jouer...");
                video.play(); // Lance la lecture une fois la vidéo chargée
            };
        };


        const getVideoUrl = () => {
            const hour = new Date().getHours();
            if (hour >= 6 && hour < 18) {
                return "https://data.royalcreeps.fr/launcher/r22launcher/background/royalcreeps-background-bleu-jour.mov";
            } else {
                return "https://data.royalcreeps.fr/launcher/r22launcher/background/royalcreeps-background-bleu-nuit.mov";
            }
        };

        const updateVideo = () => {
            const currentUrl = video.src;
            const newUrl = getVideoUrl();
            if (currentUrl !== newUrl) {
                changeSource(newUrl);
            }
        };


        updateVideo();
        setInterval(updateVideo, 60000);
    }

    shortcut() {
        this.eventManager.add(document, 'keydown', e => {
            if (e.ctrlKey && e.keyCode == 87) {
                ipcRenderer.send('main-window-close');
            }
        })
    }


    errorConnect() {
        new popup().openPopup({
            title: this.config.error.code,
            content: this.config.error.message,
            color: 'red',
            exit: true,
            options: true
        });
    }

    async loadConfig() {
        let cachedConfig = await this.db.readData('launcherConfigCache').catch(() => undefined);
        let remoteConfig = config.GetConfig().then(async res => {
            if (!res?.error) await this.saveConfigCache(res);
            return res;
        }).catch(err => err);

        if (cachedConfig?.config) {
            remoteConfig.then(res => {
                if (!res?.error) this.config = res;
            }).catch(err => console.error('Background config refresh failed:', err));

            return cachedConfig.config;
        }

        return await remoteConfig;
    }

    async saveConfigCache(remoteConfig) {
        try {
            let cachedConfig = await this.db.readData('launcherConfigCache');
            let data = {
                config: remoteConfig,
                cachedAt: Date.now()
            };

            if (cachedConfig) return await this.db.updateData('launcherConfigCache', data, cachedConfig.ID);
            return await this.db.createData('launcherConfigCache', data);
        } catch (err) {
            console.error('Config cache update failed:', err);
        }
    }

    initFrame() {
        console.log('Initializing Frame...')
        document.querySelector('.frame').classList.toggle('hide')
        document.querySelector('.dragbar').classList.toggle('hide')

        this.eventManager.add(document.querySelector('#minimize'), 'click', () => {
            ipcRenderer.send('main-window-minimize');
        });

        let maximized = false;
        let maximize = document.querySelector('#maximize')
        this.eventManager.add(maximize, 'click', () => {
            if (maximized) ipcRenderer.send('main-window-maximize')
            else ipcRenderer.send('main-window-maximize');
            maximized = !maximized
            maximize.classList.toggle('icon-maximize')
            maximize.classList.toggle('icon-restore-down')
        });

        this.eventManager.add(document.querySelector('#close'), 'click', () => {
            ipcRenderer.send('main-window-close');
        })
    }

    async initConfigClient() {
        console.log('Initializing Config Client...')
        let configClient = await this.db.readData('configClient')

        if (!configClient) {
            await this.db.createData('configClient', {
                account_selected: null,
                instance_selct: null,
                java_config: {
                    java_path: null,
                    java_memory: {
                        min: 2,
                        max: 4
                    }
                },
                game_config: {
                    screen_size: {
                        width: 854,
                        height: 480
                    }
                },
                launcher_config: {
                    download_multi: 5,
                    theme: 'auto',
                    closeLauncher: 'close-launcher',
                    intelEnabledMac: true
                }
            })
        }
    }

    createPanels(...panels) {
        this.panelControllers = new Map();
        let panelsElem = document.querySelector('.panels')
        for (let panel of panels) {
            console.log(`Initializing ${panel.name} Panel...`);
            let div = document.createElement('div');
            div.classList.add('panel', panel.id)
            div.innerHTML = fs.readFileSync(`${__dirname}/panels/${panel.id}.html`, 'utf8');
            panelsElem.appendChild(div);
            let instance = new panel();
            this.panelControllers.set(panel.id, { instance, initialized: panel.id !== 'settings' });
            if (panel.id !== 'settings') instance.init(this.config);
        }
    }

    initPanel(id) {
        let controller = this.panelControllers?.get(id);
        if (!controller || controller.initialized) return;
        controller.instance.init(this.config);
        controller.initialized = true;
    }

    async refreshAccount(account) {
        if (account.meta?.type === 'Xbox') return await new Microsoft(this.config.client_id).refresh(account);
        if (account.meta?.type === 'AZauth') return await new AZauth(this.config.online).verify(account);
        if (account.meta?.type === 'Mojang') {
            if (account.meta.online == false) return await Mojang.login(account.name);
            return await Mojang.refresh(account);
        }

        return { error: true, errorMessage: 'Account Type Not Found' };
    }

    waitForAccountRefresh(accountID) {
        if (!accountID) return Promise.resolve();
        return this.accountRefreshPromises.get(String(accountID)) || Promise.resolve();
    }

    queueAccountRefresh(account) {
        let accountID = String(account.ID);
        if (this.accountRefreshPromises.has(accountID)) return this.accountRefreshPromises.get(accountID);

        let refreshPromise = this.refreshAccountRecord(account).finally(() => {
            this.accountRefreshPromises.delete(accountID);
        });
        this.accountRefreshPromises.set(accountID, refreshPromise);
        return refreshPromise;
    }

    async refreshAccountRecord(account) {
        let configClient = await this.db.readData('configClient');

        try {
            let refreshAccount = await this.refreshAccount(account);

            if (refreshAccount.error) {
                await this.db.deleteData('accounts', account.ID);
                document.getElementById(`${account.ID}`)?.remove();

                if (configClient.account_selected == account.ID) {
                    configClient = await this.db.readData('configClient');
                    await this.selectFallbackAccount(configClient);
                }

                console.error(`[Account] ${account.name}: ${refreshAccount.errorMessage || refreshAccount.message || refreshAccount.error}`);
                return;
            }

            refreshAccount.ID = account.ID;
            await this.db.updateData('accounts', refreshAccount, account.ID);
            await addAccount(refreshAccount);

            if (configClient.account_selected == account.ID) {
                await accountSelect(refreshAccount);
            }
        } catch (err) {
            console.error(`[Account] ${account.name}: background refresh failed`, err);
        }
    }

    async selectFallbackAccount(configClient) {
        let accounts = await this.db.readAllData('accounts');
        let fallbackAccount = accounts.find(account => !account.error);

        if (!fallbackAccount) {
            configClient.account_selected = null;
            await this.db.updateData('configClient', configClient);
            toggleNavbar(false);
            changePanel('login');
            return null;
        }

        configClient.account_selected = fallbackAccount.ID;
        await this.db.updateData('configClient', configClient);
        await accountSelect(fallbackAccount);
        return fallbackAccount;
    }

    async refreshAccountsInBackground(accounts, selectedID) {
        let orderedAccounts = [...accounts].sort((a, b) => {
            if (a.ID == selectedID) return -1;
            if (b.ID == selectedID) return 1;
            return 0;
        });

        for (let account of orderedAccounts) {
            await this.queueAccountRefresh(account);
        }
    }

    async startLauncher() {
        toggleNavbar(false);
        let [accounts, configClient] = await Promise.all([
            this.db.readAllData('accounts'),
            this.db.readData('configClient')
        ]);

        let validAccounts = (accounts || []).filter(account => !account.error);
        for (let account of (accounts || []).filter(account => account.error)) {
            await this.db.deleteData('accounts', account.ID);
        }

        if (!validAccounts.length) {
            if (configClient?.account_selected) {
                configClient.account_selected = null;
                await this.db.updateData('configClient', configClient);
            }
            toggleNavbar(false);
            return changePanel('login');
        }

        for (let account of validAccounts) {
            await addAccount(account);
        }

        let accountSelected = configClient?.account_selected;
        let selectedAccount = validAccounts.find(account => account.ID == accountSelected);

        if (!selectedAccount) {
            selectedAccount = validAccounts[0];
            configClient.account_selected = selectedAccount.ID;
            accountSelected = selectedAccount.ID;
            await this.db.updateData('configClient', configClient);
        }

        await accountSelect(selectedAccount);
        toggleNavbar(true);
        changePanel('home');

        this.refreshAccountsInBackground(validAccounts, accountSelected).catch(err => {
            console.error('Background account refresh failed:', err);
        });
    }
}

new Launcher().init();
