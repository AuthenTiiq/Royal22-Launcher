/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */
const { AZauth, Mojang } = require('minecraft-java-core');
const { ipcRenderer } = require('electron');

import { popup, database, changePanel, accountSelect, addAccount, config, setStatus, toggleNavbar } from '../utils.js';
import EventManager from '../utils/event-manager.js';

class Login {
    static id = "login";
    async init(config) {
        this.config = config;
        this.db = new database();
        this.eventManager = new EventManager();

        if (typeof this.config.online == 'boolean') {
            this.config.online ? this.getMicrosoft() : this.getCrack()
        } else if (typeof this.config.online == 'string') {
            if (this.config.online.match(/^(http|https):\/\/[^ "]+$/)) {
                this.getAZauth();
            }
        }

        this.eventManager.add(document.querySelector('.cancel-home'), 'click', () => {
            document.querySelector('.cancel-home').style.display = 'none'
            toggleNavbar(true)
            changePanel('settings')
        })
    }

    /**
     * Cleanup method to remove all event listeners
     */
    destroy() {
        this.eventManager.cleanup();
    }

    async getMicrosoft() {
        console.log('Initializing Microsoft login...');
        let popupLogin = new popup();
        let loginHome = document.querySelector('.login-home');
        let microsoftBtn = document.querySelector('.connect-home');
        loginHome.style.display = 'block';

        this.eventManager.add(microsoftBtn, "click", () => {
            loginHome.style.display = 'none';
            popupLogin.openPopup({
                title: 'Connexion',
                content: 'Veuillez patienter...',
                color: 'var(--color)',
                onClose: () => {
                    loginHome.style.display = 'block';
                }
            });

            ipcRenderer.invoke('Microsoft-window', this.config.client_id).then(async account_connect => {
                console.log('Microsoft auth response:', account_connect);

                if (account_connect == 'cancel' || !account_connect) {
                    popupLogin.closePopup();
                    return;
                }

                // Check if response contains an error
                if (account_connect.error) {
                    popupLogin.openPopup({
                        title: 'Erreur',
                        content: account_connect.error || account_connect.errorMessage || 'Erreur d\'authentification Microsoft',
                        color: 'red',
                        options: true
                    });
                    return;
                }

                // Verify required fields are present
                if (!account_connect.name || !account_connect.uuid) {
                    console.error('Invalid account data:', account_connect);
                    popupLogin.openPopup({
                        title: 'Erreur',
                        content: 'Données de compte invalides reçues de Microsoft',
                        color: 'red',
                        options: true
                    });
                    return;
                }

                await this.saveData(account_connect);
                popupLogin.closePopup();

            }).catch(err => {
                console.error('Microsoft auth error:', err);
                popupLogin.openPopup({
                    title: 'Erreur',
                    content: err.message || err,
                    options: true
                });
            });
        })
    }

    async getCrack() {
        console.log('Initializing offline login...');
        let popupLogin = new popup();
        let loginOffline = document.querySelector('.login-offline');

        let emailOffline = document.querySelector('.email-offline');
        let connectOffline = document.querySelector('.connect-offline');
        loginOffline.style.display = 'block';

        this.eventManager.add(connectOffline, 'click', async () => {
            if (emailOffline.value.length < 3) {
                popupLogin.openPopup({
                    title: 'Erreur',
                    content: 'Votre pseudo doit faire au moins 3 caractères.',
                    options: true
                });
                return;
            }

            if (emailOffline.value.match(/ /g)) {
                popupLogin.openPopup({
                    title: 'Erreur',
                    content: 'Votre pseudo ne doit pas contenir d\'espaces.',
                    options: true
                });
                return;
            }

            let MojangConnect = await Mojang.login(emailOffline.value);

            if (MojangConnect.error) {
                popupLogin.openPopup({
                    title: 'Erreur',
                    content: MojangConnect.message,
                    options: true
                });
                return;
            }
            await this.saveData(MojangConnect)
            popupLogin.closePopup();
        });
    }

    async getAZauth() {
        console.log('Initializing AZauth login...');
        let AZauthClient = new AZauth(this.config.online);
        let PopupLogin = new popup();
        let loginAZauth = document.querySelector('.login-AZauth');
        let loginAZauthA2F = document.querySelector('.login-AZauth-A2F');

        let AZauthEmail = document.querySelector('.email-AZauth');
        let AZauthPassword = document.querySelector('.password-AZauth');
        let AZauthA2F = document.querySelector('.A2F-AZauth');
        let connectAZauthA2F = document.querySelector('.connect-AZauth-A2F');
        let AZauthConnectBTN = document.querySelector('.connect-AZauth');
        let AZauthCancelA2F = document.querySelector('.cancel-AZauth-A2F');

        loginAZauth.style.display = 'block';

        this.eventManager.add(AZauthConnectBTN, 'click', async () => {
            loginAZauth.style.display = 'none';
            PopupLogin.openPopup({
                title: 'Connexion en cours...',
                content: 'Veuillez patienter...',
                color: 'var(--color)',
                onClose: () => {
                    loginAZauth.style.display = 'block';
                }
            });

            if (AZauthEmail.value == '' || AZauthPassword.value == '') {
                PopupLogin.openPopup({
                    title: 'Erreur',
                    content: 'Veuillez remplir tous les champs.',
                    options: true
                });
                return;
            }

            let AZauthConnect = await AZauthClient.login(AZauthEmail.value, AZauthPassword.value);

            if (AZauthConnect.error) {
                PopupLogin.openPopup({
                    title: 'Erreur',
                    content: AZauthConnect.message,
                    options: true
                });
                return;
            } else if (AZauthConnect.A2F) {
                loginAZauthA2F.style.display = 'block';
                loginAZauth.style.display = 'none';
                PopupLogin.closePopup();

                this.eventManager.add(AZauthCancelA2F, 'click', () => {
                    loginAZauthA2F.style.display = 'none';
                    loginAZauth.style.display = 'block';
                });

                this.eventManager.add(connectAZauthA2F, 'click', async () => {
                    loginAZauthA2F.style.display = 'none';
                    PopupLogin.openPopup({
                        title: 'Connexion en cours...',
                        content: 'Veuillez patienter...',
                        color: 'var(--color)',
                        onClose: () => {
                            loginAZauthA2F.style.display = 'block';
                        }
                    });

                    if (AZauthA2F.value == '') {
                        PopupLogin.openPopup({
                            title: 'Erreur',
                            content: 'Veuillez entrer le code A2F.',
                            options: true
                        });
                        return;
                    }

                    AZauthConnect = await AZauthClient.login(AZauthEmail.value, AZauthPassword.value, AZauthA2F.value);

                    if (AZauthConnect.error) {
                        PopupLogin.openPopup({
                            title: 'Erreur',
                            content: AZauthConnect.message,
                            options: true
                        });
                        return;
                    }

                    await this.saveData(AZauthConnect)
                    PopupLogin.closePopup();
                });
            } else if (!AZauthConnect.A2F) {
                await this.saveData(AZauthConnect)
                PopupLogin.closePopup();
            }
        });
    }

    async saveData(connectionData) {
        let configClient = await this.db.readData('configClient');
        let accounts = await this.db.readAllData('accounts');
        let existingAccount = accounts.find(acc => acc.uuid === connectionData.uuid);
        let account;

        if (existingAccount) {
            connectionData.ID = existingAccount.ID; // Ensure we keep the old ID if we want, or just update data
            // Actually, existingAccount.ID is what we want to target.
            // connectionData usually comes from auth and might not have our DB ID yet.
            await this.db.updateData('accounts', connectionData, existingAccount.ID);
            account = { ...connectionData, ID: existingAccount.ID };
        } else {
            account = await this.db.createData('accounts', connectionData);
        }
        let instanceSelect = configClient.instance_selct
        let instancesList = await config.getInstanceList()
        configClient.account_selected = account.ID;

        for (let instance of instancesList) {
            if (instance.whitelistActive) {
                let whitelist = instance.whitelist.find(whitelist => whitelist == account.name)
                if (whitelist !== account.name) {
                    if (instance.name == instanceSelect) {
                        let newInstanceSelect = instancesList.find(i => i.whitelistActive == false)
                        configClient.instance_selct = newInstanceSelect.name
                        await setStatus(newInstanceSelect.status)
                    }
                }
            }
        }

        await this.db.updateData('configClient', configClient);
        await addAccount(account);
        await accountSelect(account);
        toggleNavbar(true);
        changePanel('home');
    }
}
export default Login;