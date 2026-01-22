/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

import { changePanel, accountSelect, database, config, setStatus, popup, appdata, setBackground, toggleNavbar, cacheManager, debounce } from '../utils.js'
import EventManager from '../utils/event-manager.js';
const { ipcRenderer } = require('electron');
const os = require('os');

class Settings {
    static id = "settings";
    async init(config) {
        this.config = config;
        this.db = new database();
        this.eventManager = new EventManager();
        this.navBTN()
        this.accounts()
        this.ram()
        this.javaPath()
        this.resolution()
        this.launcher()

        this.eventManager.add(ipcRenderer, 'open-settings-accounts', () => {
            this.showAccountsSettingsPanel();
        })
        this.eventManager.add(ipcRenderer, 'open-settings-java', () => {
            this.showJavaSettingsPanel();
        })
        this.eventManager.add(ipcRenderer, 'open-settings-resolution', () => {
            this.showResolutionSettingsPanel();
        })
        this.eventManager.add(ipcRenderer, 'open-settings-launcher', () => {
            this.showLauncherSettingsPanel();
        })

        // Gestionnaire d'événements pour la touche Échap
        this.eventManager.add(document, 'keyup', (event) => {
            if (event.key === 'Escape') {
                changePanel('home');
            }
        });
    }

    /**
     * Cleanup method to remove all event listeners
     * Call this when settings panel is destroyed/closed
     */
    destroy() {
        this.eventManager.cleanup();
    }

    showJavaSettingsPanel() {
        document.querySelector('.settings-tab-btn#java').click();
    }

    showResolutionSettingsPanel() {
        document.querySelector('.settings-tab-btn#resolution').click();
    }

    showLauncherSettingsPanel() {
        document.querySelector('.settings-tab-btn#launcher').click();
    }

    showAccountsSettingsPanel() {
        document.querySelector('.settings-tab-btn#account').click();
    }

    navBTN() {
        this.eventManager.add(document.querySelector('.settings-nav-bar'), 'click', e => {
            if (e.target.classList.contains('settings-tab-btn')) {
                let id = e.target.id

                let activeTab = document.querySelector('.active-tab')
                let activeSection = document.querySelector('.active-section')

                if (activeTab) activeTab.classList.remove('active-tab');
                e.target.classList.add('active-tab');

                if (activeSection) activeSection.classList.remove('active-section');
                document.querySelector(`#${id}-tab`).classList.add('active-section');
            }
        })
    }

    accounts() {
        this.eventManager.add(document.querySelector('.accounts-list'), 'click', async e => {
            let popupAccount = new popup()
            try {
                // Use closest() to detect clicks on account card or its children
                let accountCard = e.target.closest('.account');
                let deleteBtn = e.target.closest('.delete-profile');

                if (deleteBtn) {
                    let id = deleteBtn.id;
                    popupAccount.openPopup({
                        title: 'Connexion',
                        content: 'Suppression du compte...',
                        color: 'var(--color)'
                    })
                    await this.db.deleteData('accounts', id);
                    let deleteProfile = document.getElementById(`${id}`);
                    let accountListElement = document.querySelector('.accounts-list');
                    accountListElement.removeChild(deleteProfile);

                    if (accountListElement.children.length == 1) {
                        toggleNavbar(false)
                        return changePanel('login')
                    }

                    let configClient = await this.db.readData('configClient');

                    if (configClient.account_selected == id) {
                        let allAccounts = await this.db.readAllData('accounts');
                        configClient.account_selected = allAccounts[0].ID
                        accountSelect(allAccounts[0]);
                        let newInstanceSelect = await this.setInstance(allAccounts[0]);
                        configClient.instance_selct = newInstanceSelect.instance_selct
                        return await this.db.updateData('configClient', configClient);
                    }
                    return;
                }

                if (accountCard) {
                    let id = accountCard.id;

                    // Check if clicking "add account" button
                    if (id == 'add') {
                        document.querySelector('.cancel-home').style.display = 'inline'
                        toggleNavbar(false)
                        return changePanel('login')
                    }

                    // Prevent re-selecting already selected account
                    let configClient = await this.db.readData('configClient');
                    if (configClient.account_selected === id) {
                        console.log('Account already selected, ignoring click');
                        return; // Do nothing if already selected
                    }

                    popupAccount.openPopup({
                        title: 'Connexion',
                        content: 'Veuillez patienter...',
                        color: 'var(--color)'
                    })

                    let account = await this.db.readData('accounts', id);
                    configClient = await this.setInstance(account);
                    await accountSelect(account);
                    configClient.account_selected = account.ID;
                    return await this.db.updateData('configClient', configClient);
                }
            } catch (err) {
                console.error(err)
            } finally {
                popupAccount.closePopup();
            }
        })
    }

    async setInstance(auth) {
        let configClient = await this.db.readData('configClient')
        let instanceSelect = configClient.instance_selct
        let instancesList = await config.getInstanceList()

        for (let instance of instancesList) {
            if (instance.whitelistActive) {
                let whitelist = instance.whitelist.find(whitelist => whitelist == auth.name)
                if (whitelist !== auth.name) {
                    if (instance.name == instanceSelect) {
                        let newInstanceSelect = instancesList.find(i => i.whitelistActive == false)
                        configClient.instance_selct = newInstanceSelect.name
                        await setStatus(newInstanceSelect.status)
                    }
                }
            }
        }
        return configClient
    }

    async ram() {
        let configClient = await this.db.readData('configClient');
        let totalMem = Math.trunc(os.totalmem() / 1073741824 * 10) / 10;
        let freeMem = Math.trunc(os.freemem() / 1073741824 * 10) / 10;

        document.getElementById("total-ram").textContent = `${totalMem} Go`;
        document.getElementById("free-ram").textContent = `${freeMem} Go`;

        // Calculate max allowed RAM (80% of total)
        let maxAllowedRam = Math.trunc((80 * totalMem) / 100);

        // Get saved RAM values or use defaults
        let ramMin = configClient?.java_config?.java_memory?.min || 2;
        let ramMax = configClient?.java_config?.java_memory?.max || 4;

        // Clamp values to valid range
        ramMin = Math.max(1, Math.min(ramMin, maxAllowedRam));
        ramMax = Math.max(ramMin, Math.min(ramMax, maxAllowedRam));

        // Get slider elements
        const minSlider = document.getElementById('ram-min-slider');
        const maxSlider = document.getElementById('ram-max-slider');
        const minValueDisplay = document.getElementById('ram-min-value');
        const maxValueDisplay = document.getElementById('ram-max-value');

        // Configure sliders
        minSlider.min = 1;
        minSlider.max = maxAllowedRam;
        minSlider.value = ramMin;

        maxSlider.min = 1;
        maxSlider.max = maxAllowedRam;
        maxSlider.value = ramMax;

        // Display initial values
        minValueDisplay.textContent = `${ramMin} Go`;
        maxValueDisplay.textContent = `${ramMax} Go`;

        // Create debounced save function (300ms delay)
        const debouncedSave = debounce(async (minVal, maxVal) => {
            let cfg = await this.db.readData('configClient');
            if (!cfg.java_config) cfg.java_config = {};
            cfg.java_config.java_memory = { min: minVal, max: maxVal };
            await this.db.updateData('configClient', cfg);
        }, 300);

        // Min slider change handler
        this.eventManager.add(minSlider, 'input', () => {
            let minVal = parseFloat(minSlider.value);
            let maxVal = parseFloat(maxSlider.value);

            // Ensure min doesn't exceed max
            if (minVal > maxVal) {
                minVal = maxVal;
                minSlider.value = minVal;
            }

            minValueDisplay.textContent = `${minVal} Go`;

            // Debounced save to reduce DB writes
            debouncedSave(minVal, maxVal);
        });

        // Max slider change handler
        this.eventManager.add(maxSlider, 'input', () => {
            let minVal = parseFloat(minSlider.value);
            let maxVal = parseFloat(maxSlider.value);

            // Ensure max doesn't go below min
            if (maxVal < minVal) {
                maxVal = minVal;
                maxSlider.value = maxVal;
            }

            maxValueDisplay.textContent = `${maxVal} Go`;

            // Debounced save to reduce DB writes
            debouncedSave(minVal, maxVal);
        });
    }

    async javaPath() {
        let javaPathText = document.querySelector(".java-path-txt")
        javaPathText.textContent = `${await appdata()}/${process.platform == 'darwin' ? this.config.dataDirectory : `.${this.config.dataDirectory}`}/runtime`;

        let configClient = await this.db.readData('configClient')
        let javaPath = configClient?.java_config?.java_path || 'Utiliser la version de java livre avec le launcher';
        let javaPathInputTxt = document.querySelector(".java-path-input-text");
        let javaPathInputFile = document.querySelector(".java-path-input-file");
        javaPathInputTxt.value = javaPath;

        // File input change handler (replaces polling)
        const handleFileChange = async () => {
            if (javaPathInputFile.files.length > 0) {
                const file = javaPathInputFile.files[0].path;
                if (file.replace(".exe", '').endsWith("java") || file.replace(".exe", '').endsWith("javaw")) {
                    let configClient = await this.db.readData('configClient')
                    javaPathInputTxt.value = file;
                    configClient.java_config.java_path = file
                    await this.db.updateData('configClient', configClient);
                } else {
                    alert("Le nom du fichier doit être java ou javaw");
                }
            }
        };

        this.eventManager.add(javaPathInputFile, 'change', handleFileChange);

        this.eventManager.add(document.querySelector(".java-path-set"), "click", () => {
            javaPathInputFile.value = '';
            javaPathInputFile.click();
        });

        this.eventManager.add(document.querySelector(".java-path-reset"), "click", async () => {
            let configClient = await this.db.readData('configClient')
            javaPathInputTxt.value = 'Utiliser la version de java livre avec le launcher';
            configClient.java_config.java_path = null
            await this.db.updateData('configClient', configClient);
        });
    }

    async resolution() {
        let configClient = await this.db.readData('configClient')
        let resolution = configClient?.game_config?.screen_size || { width: 1920, height: 1080 };

        let width = document.querySelector(".width-size");
        let height = document.querySelector(".height-size");
        let resolutionReset = document.querySelector(".size-reset");

        width.value = resolution.width;
        height.value = resolution.height;

        this.eventManager.add(width, "change", async () => {
            let configClient = await this.db.readData('configClient')
            if (!configClient.game_config) configClient.game_config = {};
            if (!configClient.game_config.screen_size) configClient.game_config.screen_size = {};
            configClient.game_config.screen_size.width = width.value;
            await this.db.updateData('configClient', configClient);
        })

        this.eventManager.add(height, "change", async () => {
            let configClient = await this.db.readData('configClient')
            if (!configClient.game_config) configClient.game_config = {};
            if (!configClient.game_config.screen_size) configClient.game_config.screen_size = {};
            configClient.game_config.screen_size.height = height.value;
            await this.db.updateData('configClient', configClient);
        })

        this.eventManager.add(resolutionReset, "click", async () => {
            let configClient = await this.db.readData('configClient')
            if (!configClient.game_config) configClient.game_config = {};
            configClient.game_config.screen_size = { width: '854', height: '480' };
            width.value = '854';
            height.value = '480';
            await this.db.updateData('configClient', configClient);
        })
    }

    async launcher() {
        let configClient = await this.db.readData('configClient');

        let maxDownloadFiles = configClient?.launcher_config?.download_multi || 5;
        let maxDownloadFilesInput = document.querySelector(".max-files");
        let maxDownloadFilesReset = document.querySelector(".max-files-reset");
        maxDownloadFilesInput.value = maxDownloadFiles;

        this.eventManager.add(maxDownloadFilesInput, "change", async () => {
            let configClient = await this.db.readData('configClient')
            if (!configClient.launcher_config) configClient.launcher_config = {};
            configClient.launcher_config.download_multi = maxDownloadFilesInput.value;
            await this.db.updateData('configClient', configClient);
        })

        this.eventManager.add(maxDownloadFilesReset, "click", async () => {
            let configClient = await this.db.readData('configClient')
            if (!configClient.launcher_config) configClient.launcher_config = {};
            maxDownloadFilesInput.value = 5
            configClient.launcher_config.download_multi = 5;
            await this.db.updateData('configClient', configClient);
        })

        let themeBox = document.querySelector(".theme-box");
        let theme = configClient?.launcher_config?.theme || "auto";

        if (theme == "auto") {
            document.querySelector('.theme-btn-auto').classList.add('active-theme');
        } else if (theme == "dark") {
            document.querySelector('.theme-btn-sombre').classList.add('active-theme');
        } else if (theme == "light") {
            document.querySelector('.theme-btn-clair').classList.add('active-theme');
        }

        this.eventManager.add(themeBox, "click", async e => {
            if (e.target.classList.contains('theme-btn')) {
                let activeTheme = document.querySelector('.active-theme');
                if (e.target.classList.contains('active-theme')) return
                activeTheme?.classList.remove('active-theme');

                if (e.target.classList.contains('theme-btn-auto')) {
                    setBackground();
                    theme = "auto";
                    e.target.classList.add('active-theme');
                } else if (e.target.classList.contains('theme-btn-sombre')) {
                    setBackground(true);
                    theme = "dark";
                    e.target.classList.add('active-theme');
                } else if (e.target.classList.contains('theme-btn-clair')) {
                    setBackground(false);
                    theme = "light";
                    e.target.classList.add('active-theme');
                }

                let configClient = await this.db.readData('configClient')
                if (!configClient.launcher_config) configClient.launcher_config = {};
                configClient.launcher_config.theme = theme;
                await this.db.updateData('configClient', configClient);
            }
        })

        let closeBox = document.querySelector(".close-box");
        let closeLauncher = configClient?.launcher_config?.closeLauncher || "close-launcher";

        if (closeLauncher == "close-launcher") {
            document.querySelector('.close-launcher').classList.add('active-close');
        } else if (closeLauncher == "close-all") {
            document.querySelector('.close-all').classList.add('active-close');
        } else if (closeLauncher == "close-none") {
            document.querySelector('.close-none').classList.add('active-close');
        }

        this.eventManager.add(closeBox, "click", async e => {
            if (e.target.classList.contains('close-btn')) {
                let activeClose = document.querySelector('.active-close');
                if (e.target.classList.contains('active-close')) return
                activeClose?.classList.toggle('active-close');

                let configClient = await this.db.readData('configClient')

                if (e.target.classList.contains('close-launcher')) {
                    e.target.classList.toggle('active-close');
                    if (!configClient.launcher_config) configClient.launcher_config = {};
                    configClient.launcher_config.closeLauncher = "close-launcher";
                    await this.db.updateData('configClient', configClient);
                } else if (e.target.classList.contains('close-all')) {
                    e.target.classList.toggle('active-close');
                    if (!configClient.launcher_config) configClient.launcher_config = {};
                    configClient.launcher_config.closeLauncher = "close-all";
                    await this.db.updateData('configClient', configClient);
                } else if (e.target.classList.contains('close-none')) {
                    e.target.classList.toggle('active-close');
                    if (!configClient.launcher_config) configClient.launcher_config = {};
                    configClient.launcher_config.closeLauncher = "close-none";
                    await this.db.updateData('configClient', configClient);
                }
            }
        })
    }
}
export default Settings;