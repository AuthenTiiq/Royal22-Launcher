/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0/
 */

'use strict';

// libs 
const fs = require('fs');
const { Microsoft, Mojang } = require('minecraft-java-core');
const { ipcRenderer } = require('electron');
const DiscordRPC = require('discord-rpc');

import { config, logger, changePanel, database, addAccount, accountSelect } from './utils.js';
import Login from './panels/login.js';
import Home from './panels/home.js';
import Settings from './panels/settings.js';


class Launcher {
    async init() {
        this.initLog();
        console.log("Initializing Launcher...");
        if (process.platform == "win32") this.initFrame();
        this.config = await config.GetConfig().then(res => res);
        this.news = await config.GetNews().then(res => res);
        this.database = await new database().init();
        this.createPanels(Login, Home, Settings);
        this.getaccounts();
        this.initBackground();
        this.initDiscordRPC();
        console.log("Le script JavaScript est exécuté !");

        var audio = document.getElementById("bgAudio");
        audio.volume = 0.07;
    }

    initLog() {
        document.addEventListener("keydown", (e) => {
            if (e.ctrlKey && e.shiftKey && e.keyCode == 73 || e.keyCode == 123) {
                ipcRenderer.send("main-window-dev-tools");
            }
        })
        new logger('Launcher', '#7289da')
    }

    async initBackground() {
        const video = document.getElementById("background-video");
    
        const changeSource = (url) => {
            const video = document.getElementById("background-video");
            console.log("Changement de la source de la vidéo vers :", url);
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

    initDiscordRPC() {
        if (this.config.rpc_activation === true) {
        const clientId = "1046811813217566850";
        const rpc = new DiscordRPC.Client({ transport: 'ipc' });
        rpc.on('ready', () => {
            const presence = {
                details: 'Dans le lanceur',
                state: 'royalcreeps.fr',
                largeImageKey: 'royallargeico',
                largeImageText: 'RoyalCreeps',
                smallImageKey: 'minecraft',
                smallImageText: 'Joue à Minecraft',
                buttons: [
                    { label: 'Rejoindre', url: 'https://royalcreeps.fr/launcher' }
                ]
            };
            rpc.setActivity(presence);
        });
        rpc.login({ clientId: this.config.rpc_id }).catch(console.error);
    }
}

    initFrame() {
        console.log("Initializing Frame...")
        document.querySelector(".frame").classList.toggle("hide")
        document.querySelector(".dragbar").classList.toggle("hide")

        document.querySelector("#minimize").addEventListener("click", () => {
            ipcRenderer.send("main-window-minimize");
        });

        let maximized = false;
        let maximize = document.querySelector("#maximize")
        maximize.addEventListener("click", () => {
            if (maximized) ipcRenderer.send("main-window-maximize")
            else ipcRenderer.send("main-window-maximize");
            maximized = !maximized
            maximize.classList.toggle("icon-maximize")
            maximize.classList.toggle("icon-restore-down")
        });

        document.querySelector("#close").addEventListener("click", () => {
            ipcRenderer.send("main-window-close");
        })
    }

    createPanels(...panels) {
        let panelsElem = document.querySelector(".panels")
        for (let panel of panels) {
            console.log(`Initializing ${panel.name} Panel...`);
            let div = document.createElement("div");
            div.classList.add("panel", panel.id)
            div.innerHTML = fs.readFileSync(`${__dirname}/panels/${panel.id}.html`, "utf8");
            panelsElem.appendChild(div);
            new panel().init(this.config, this.news);
        }
    }


    async getaccounts() {
        let accounts = await this.database.getAll('accounts');
        let selectaccount = (await this.database.get('1234', 'accounts-selected'))?.value?.selected;

        if (!accounts.length) {
            changePanel("login");
        } else {
            for (let account of accounts) {
                account = account.value;
                if (account.meta.type === 'Xbox') {
                    console.log(`Initializing Xbox account ${account.name}...`);
                    let refresh = await new Microsoft(this.config.client_id).refresh(account);
                    let refresh_accounts;
                    let refresh_profile;

                    if (refresh.error) {
                        this.database.delete(account.uuid, 'accounts');
                        this.database.delete(account.uuid, 'profile');
                        if (account.uuid === selectaccount) this.database.update({ uuid: "1234" }, 'accounts-selected')
                        console.error(`[Account] ${account.uuid}: ${refresh.errorMessage}`);
                        continue;
                    }

                    refresh_accounts = {
                        access_token: refresh.access_token,
                        client_token: refresh.client_token,
                        uuid: refresh.uuid,
                        name: refresh.name,
                        refresh_token: refresh.refresh_token,
                        user_properties: refresh.user_properties,
                        meta: refresh.meta
                    }

                    refresh_profile = {
                        uuid: refresh.uuid
                    }

                    this.database.update(refresh_accounts, 'accounts');
                    this.database.update(refresh_profile, 'profile');
                    addAccount(refresh_accounts);
                    if (account.uuid === selectaccount) accountSelect(refresh.uuid)
                } else if (account.meta.type === 'Mojang') {
                    if (!account.meta.online) {
                    console.log(`Initializing Crack account ${account.name}...`);
                        addAccount(account);
                        if (account.uuid === selectaccount) accountSelect(account.uuid)
                        continue;
                    }

                    let validate = await Mojang.validate(account);
                    if (!validate) {
                        this.database.delete(account.uuid, 'accounts');
                        if (account.uuid === selectaccount) this.database.update({ uuid: "1234" }, 'accounts-selected')
                        console.error(`[Account] ${account.uuid}: Token is invalid.`);
                        continue;
                    }

                    let refresh = await Mojang.refresh(account);
                    console.log(`Initializing Mojang account ${account.name}...`);
                    let refresh_accounts;

                    if (refresh.error) {
                        this.database.delete(account.uuid, 'accounts');
                        if (account.uuid === selectaccount) this.database.update({ uuid: "1234" }, 'accounts-selected')
                        console.error(`[Account] ${account.uuid}: ${refresh.errorMessage}`);
                        continue;
                    }

                    refresh_accounts = {
                        access_token: refresh.access_token,
                        client_token: refresh.client_token,
                        uuid: refresh.uuid,
                        name: refresh.name,
                        user_properties: refresh.user_properties,
                        meta: {
                            type: refresh.meta.type,
                            offline: refresh.meta.offline
                        }
                    }

                    this.database.update(refresh_accounts, 'accounts');
                    addAccount(refresh_accounts);
                    if (account.uuid === selectaccount) accountSelect(refresh.uuid)
                } else {
                    this.database.delete(account.uuid, 'accounts');
                    if (account.uuid === selectaccount) this.database.update({ uuid: "1234" }, 'accounts-selected')
                }
            }




            
            if (!(await this.database.get('1234', 'accounts-selected')).value.selected) {
                let uuid = (await this.database.getAll('accounts'))[0]?.value?.uuid
                if (uuid) {
                    this.database.update({ uuid: "1234", selected: uuid }, 'accounts-selected')
                    accountSelect(uuid)
                }
            }

            if ((await this.database.getAll('accounts')).length == 0) {
                changePanel("login");
                document.querySelector(".preload-content").style.display = "none";
                return
            }
            changePanel("home");
        }
        document.querySelector(".preload-content").style.display = "none";
    }
}

new Launcher().init();