/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */
import { config, database, logger, changePanel, appdata, setStatus, pkg, popup } from '../utils.js'
import EventManager from '../utils/event-manager.js';

const { Launch } = require('minecraft-java-core')
const { shell, ipcRenderer } = require('electron')
const { spawn } = require('child_process')

const htmlEntities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
};

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => htmlEntities[char]);

const allowedHTMLTags = new Set([
    'A', 'ABBR', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DEL', 'DIV', 'EM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'I',
    'IMG', 'LI', 'OL', 'P', 'PRE', 'S', 'SPAN', 'STRONG', 'SUB', 'SUP', 'TABLE', 'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'U', 'UL'
]);

const blockedHTMLTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'BUTTON', 'META', 'LINK']);
const globalHTMLAttributes = new Set(['class', 'title']);
const tagHTMLAttributes = {
    A: new Set(['href', 'target', 'rel']),
    IMG: new Set(['src', 'alt', 'title', 'width', 'height']),
    TD: new Set(['colspan', 'rowspan']),
    TH: new Set(['colspan', 'rowspan'])
};

const isSafeURL = (value, protocols = ['http:', 'https:', 'mailto:']) => {
    try {
        let url = new URL(value, window.location.href);
        return protocols.includes(url.protocol);
    } catch {
        return false;
    }
};

const sanitizeAttributes = element => {
    for (let attribute of [...element.attributes]) {
        let name = attribute.name.toLowerCase();
        let tagName = element.tagName;
        let allowedForTag = tagHTMLAttributes[tagName]?.has(name) || false;
        let allowedGlobally = globalHTMLAttributes.has(name);

        if (name.startsWith('on') || name === 'style' || name === 'srcdoc' || (!allowedForTag && !allowedGlobally)) {
            element.removeAttribute(attribute.name);
            continue;
        }

        if (name === 'href' && !isSafeURL(attribute.value)) element.removeAttribute(attribute.name);
        if (name === 'src' && !isSafeURL(attribute.value, ['http:', 'https:'])) element.removeAttribute(attribute.name);
    }

    if (element.tagName === 'A' && element.hasAttribute('href')) {
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noopener noreferrer');
    }
};

const sanitizeNode = node => {
    if (node.nodeType === Node.TEXT_NODE) return;
    if (node.nodeType !== Node.ELEMENT_NODE) {
        node.remove();
        return;
    }

    if (blockedHTMLTags.has(node.tagName)) {
        node.remove();
        return;
    }

    for (let child of [...node.childNodes]) sanitizeNode(child);

    if (!allowedHTMLTags.has(node.tagName)) {
        node.replaceWith(...node.childNodes);
        return;
    }

    sanitizeAttributes(node);
};

const sanitizeNewsHTML = value => {
    let template = document.createElement('template');
    template.innerHTML = String(value ?? '').replace(/\n/g, '<br>');
    for (let child of [...template.content.childNodes]) sanitizeNode(child);
    return template.innerHTML;
};

const getPlainTextFromHTML = value => {
    let template = document.createElement('template');
    template.innerHTML = String(value ?? '');
    return template.content.textContent || '';
};

const getNewsPreview = (value, maxLength = 150) => {
    let text = getPlainTextFromHTML(value).replace(/\s+/g, ' ').trim();
    return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
};

const normalizeVerifyPath = (value) => {
    let path = String(value ?? '').trim().replace(/\\+/g, '/');
    if (!path) return '';

    path = path.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
    return path;
};

const isSameOrParentPath = (candidate, target) => {
    return candidate === target || target.startsWith(`${candidate}/`);
};

const shouldForceVerifyPath = (ignoredPath, forcedPath) => {
    // If one path contains the other, keeping ignored would prevent forced verify.
    return isSameOrParentPath(ignoredPath, forcedPath) || isSameOrParentPath(forcedPath, ignoredPath);
};

const buildVerifyRules = (options) => {
    let ignored = Array.isArray(options?.ignored)
        ? options.ignored.map(normalizeVerifyPath).filter(Boolean)
        : [];
    let forceVerify = Array.isArray(options?.forceVerify)
        ? options.forceVerify.map(normalizeVerifyPath).filter(Boolean)
        : [];

    let uniqueForceVerify = [...new Set(forceVerify)];
    let effectiveIgnored = ignored.filter(ignoredPath => {
        return !uniqueForceVerify.some(forcedPath => shouldForceVerifyPath(ignoredPath, forcedPath));
    });

    return {
        ignored: [...new Set(effectiveIgnored)],
        forceVerify: uniqueForceVerify
    };
};

const INSTANCE_LIST_MAX_AGE = 60000;

const INSTANCE_TAG_LABELS = {
    upcoming: 'Prochainement',
    new: 'Nouveau',
    unavailable: 'Indisponible'
};

const normalizeTagToken = (value) => {
    if (value == null) return '';
    return String(value)
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
};

const resolveInstanceTag = (instance) => {
    let rawTag = instance?.tag ?? instance?.launcherTag ?? instance?.badge ?? instance?.displayTag ?? null;
    let normalized = normalizeTagToken(rawTag);

    if (normalized === 'prochainement' || normalized === 'upcoming' || normalized === 'soon') return 'upcoming';
    if (normalized === 'nouveau' || normalized === 'new') return 'new';
    if (normalized === 'indisponible' || normalized === 'unavailable' || normalized === 'disabled') return 'unavailable';

    if (instance?.status === 'maintenance' || instance?.enabled === false || instance?.available === false) {
        return 'unavailable';
    }

    return null;
};

const getMinecraftVersionLabel = (instance) => {
    let version = instance?.loadder?.minecraft_version || instance?.minecraft_version;
    return version ? `Minecraft ${version}` : 'Minecraft -';
};

const createInstanceTagBadge = (tagType, classPrefix = 'instance-tag') => {
    if (!tagType || !INSTANCE_TAG_LABELS[tagType]) return null;

    let tagElement = document.createElement('div');
    tagElement.classList.add(classPrefix, `${classPrefix}-${tagType}`);
    tagElement.textContent = INSTANCE_TAG_LABELS[tagType];
    return tagElement;
};

class Home {
    static id = "home";
    async init(config) {
        this.config = config;
        this.db = new database();
        this.eventManager = new EventManager();
        // Remove settings btn listener since it's global now
        this.news()
        this.socialLick()
        this.instancesSelect()
    }

    /**
     * Cleanup method to remove all event listeners
     */
    destroy() {
        this.eventManager.cleanup();
    }

    async news() {
        let newsElement = document.querySelector('.news-list');
        if (!newsElement) return;

        let news = await config.getNews().then(res => res).catch(err => false);
        if (news) {
            if (!news.length) {
                let blockNews = document.createElement('div');
                blockNews.classList.add('news-block');
                blockNews.innerHTML = `
                    <div class="news-header">
                        <img class="server-status-icon" src="assets/images/icon.png">
                        <div class="header-text">
                            <div class="title">Aucun news n'ai actuellement disponible.</div>
                        </div>
                        <div class="date">
                            <div class="day">1</div>
                            <div class="month">Janvier</div>
                        </div>
                    </div>
                    <div class="news-content">
                        <div class="bbWrapper">
                            <p>Vous pourrez suivre ici toutes les news relative au serveur.</p>
                        </div>
                    </div>`
                newsElement.appendChild(blockNews);
            } else {
                let newsPopup = document.querySelector('.news-popup');
                if (newsPopup && newsPopup.parentElement !== document.body) {
                    document.body.appendChild(newsPopup);
                }

                let popupTitle = document.querySelector('.news-popup-title');
                let popupDate = document.querySelector('.news-popup-date');
                let popupAuthor = document.querySelector('.news-popup-author');
                let popupBody = document.querySelector('.news-popup-body');

                for (let News of news) {
                    let date = this.getdate(News.publish_date)
                    let dateLabel = `${date.day} ${date.month} ${date.year}`;
                    let title = News.title ?? '';
                    let author = News.author ?? '';
                    let content = News.content ?? '';
                    let plainContent = getPlainTextFromHTML(content).trim();
                    let hasLongContent = plainContent.length > 150;
                    let preview = hasLongContent ? getNewsPreview(content) : content;
                    let blockNews = document.createElement('div');
                    blockNews.className = 'news-block';
                    let readMoreHtml = hasLongContent ? '<div class="read-more-btn">Afficher plus</div>' : '';
                    let contentHtml = hasLongContent ? `<p>${escapeHTML(preview)}</p>` : sanitizeNewsHTML(preview);

                    blockNews.innerHTML = `
                        <div class="news-header">
                            <img src="assets/images/icon.png">
                            <div class="header-text">
                                <div class="title">${escapeHTML(title)}</div>
                                <div class="date-small" style="font-size:0.8rem; opacity:0.7;">${escapeHTML(dateLabel)}</div>
                            </div>
                        </div>
                        <div class="news-content">
                            <div class="bbWrapper">
                                ${contentHtml}
                                ${readMoreHtml}
                                <p class="news-author">Publié par <span>${escapeHTML(author)}</span></p>
                            </div>
                        </div>`
                    newsElement.appendChild(blockNews);

                    let readMoreBtn = blockNews.querySelector('.read-more-btn');
                    if (readMoreBtn && newsPopup && popupTitle && popupDate && popupAuthor && popupBody) {
                        this.eventManager.add(readMoreBtn, 'click', () => {
                            popupTitle.textContent = title;
                            popupDate.textContent = dateLabel;
                            popupAuthor.textContent = 'Publié par ';
                            let authorSpan = document.createElement('span');
                            authorSpan.textContent = author;
                            popupAuthor.appendChild(authorSpan);
                            popupBody.innerHTML = sanitizeNewsHTML(content);
                            newsPopup.classList.add('active');
                        });
                    }
                }

                if (newsPopup) {
                    let closeBtn = document.querySelector('.close-news-popup');
                    if (closeBtn) {
                        this.eventManager.add(closeBtn, 'click', () => {
                            newsPopup.classList.remove('active');
                        });
                    }

                    this.eventManager.add(window, 'click', e => {
                        if (e.target === newsPopup) {
                            newsPopup.classList.remove('active');
                        }
                    });
                }
            }
        } else {
            let blockNews = document.createElement('div');
            blockNews.classList.add('news-block');
            blockNews.innerHTML = `
                <div class="news-header">
                        <img class="server-status-icon" src="assets/images/icon.png">
                        <div class="header-text">
                            <div class="title">Error.</div>
                        </div>
                        <div class="date">
                            <div class="day">1</div>
                            <div class="month">Janvier</div>
                        </div>
                    </div>
                    <div class="news-content">
                        <div class="bbWrapper">
                            <p>Impossible de contacter le serveur des news.</br>Merci de vérifier votre configuration.</p>
                        </div>
                    </div>`
            newsElement.appendChild(blockNews);
        }
    }

    socialLick() {
        let socials = document.querySelectorAll('.social-pill')

        socials.forEach(social => {
            this.eventManager.add(social, 'click', e => {
                shell.openExternal(e.target.dataset.url)
            })
        });
    }

    async instancesSelect() {
        let instanceBTN = document.querySelector('.play-btn')
        let instancePopup = document.querySelector('.instance-popup')
        if (instancePopup && instancePopup.parentElement !== document.body) {
            document.body.appendChild(instancePopup);
        }
        let instancesListPopup = document.querySelector('.instances-List')
        let instanceCloseBTN = document.querySelector('.close-popup')
        let instanceSelectBtn = document.querySelector('.instance-select')

        this.eventManager.add(instanceBTN, 'click', async e => {
            this.startGame();
        })

        this.eventManager.add(instanceCloseBTN, 'click', () => {
            instancePopup.classList.remove('active');
            setTimeout(() => instancePopup.style.display = 'none', 300);
        })

        let configClient = await this.db.readData('configClient')
        let auth = await this.db.readData('accounts', configClient.account_selected)
        let instancesList

        try {
            instancesList = await this.refreshInstancesList()
        } catch (err) {
            console.error('Impossible de charger la liste distante des instances:', err)
            if (instanceSelectBtn) instanceSelectBtn.style.display = 'none'
            return
        }

        let instanceSelect = instancesList.find(i => i.id == configClient?.instance_selct) ? configClient?.instance_selct : null

        if (instancesList.length > 1) {
            if (instanceSelectBtn) {
                instanceSelectBtn.style.display = 'flex'
                this.eventManager.add(instanceSelectBtn, 'click', () => {
                    instancePopup.style.display = 'flex'
                    requestAnimationFrame(() => instancePopup.classList.add('active'))
                })
            }
        } else {
            if (instanceSelectBtn) instanceSelectBtn.style.display = 'none'
        }

        if (!instanceSelect) {
            let newInstanceSelect = instancesList.find(i => i.id === 'royalcreeps') || instancesList.find(i => i.whitelistActive == false)
            let configClient = await this.db.readData('configClient')
            configClient.instance_selct = newInstanceSelect.id
            instanceSelect = newInstanceSelect.id
            await this.db.updateData('configClient', configClient)
        }

        instancesListPopup.innerHTML = ''

        // Sort instances so that 'royalcreeps' is always first
        instancesList.sort((a, b) => {
            if (a.id === 'royalcreeps') return -1;
            if (b.id === 'royalcreeps') return 1;
            return 0;
        })

        let renderDetails = (instanceId) => {
            let instance = instancesList.find(i => i.id === instanceId)
            let detailsContainer = document.querySelector('.details-content')
            if (!instance) return;
            let tagType = resolveInstanceTag(instance);
            let versionLabel = getMinecraftVersionLabel(instance);
            // Fix broken unicode escapes where backslash is stripped
            let cleanDesc = instance.description
                ? instance.description.replace(/u([0-9a-fA-F]{4})/g, (m, hex) => String.fromCharCode(parseInt(hex, 16)))
                : null;

            detailsContainer.replaceChildren();

            let detailHeader = document.createElement('div');
            detailHeader.classList.add('detail-header');

            let detailTitle = document.createElement('div');
            detailTitle.classList.add('detail-title');
            detailTitle.textContent = instance.name || instance.id;

            let detailMeta = document.createElement('div');
            detailMeta.classList.add('detail-meta');

            let detailVersion = document.createElement('div');
            detailVersion.classList.add('detail-version');
            detailVersion.textContent = versionLabel;

            let detailTag = createInstanceTagBadge(tagType, 'detail-tag');
            detailMeta.appendChild(detailVersion);
            if (detailTag) detailMeta.appendChild(detailTag);

            let descriptionElement = document.createElement('div');
            descriptionElement.classList.add('detail-description');
            if (cleanDesc) {
                descriptionElement.innerHTML = sanitizeNewsHTML(cleanDesc);
            } else {
                descriptionElement.style.fontStyle = 'italic';
                descriptionElement.style.opacity = '0.5';
                descriptionElement.textContent = 'Aucune description disponible pour cette instance.';
            }

            let detailActions = document.createElement('div');
            detailActions.classList.add('detail-actions');

            let selectBtn = document.createElement('button');
            selectBtn.classList.add('btn-select-instance');
            selectBtn.type = 'button';
            selectBtn.textContent = 'Sélectionner';

            detailHeader.append(detailTitle, detailMeta);
            detailActions.appendChild(selectBtn);
            detailsContainer.append(detailHeader, descriptionElement, detailActions);

            // Add click event for the "Sélectionner" button
            if (selectBtn) {
                // Must register event manually because eventManager might clear it, or we can use eventManager but with care 
                // since this DOM node gets destroyed. Better to handle it directly on the document or re-bind.
                // We'll bind it here directly since it's re-created entirely on click.
                selectBtn.addEventListener('click', async () => {
                    let configClient = await this.db.readData('configClient')
                    configClient.instance_selct = instance.id
                    await this.db.updateData('configClient', configClient)

                    instanceSelect = instancesList.filter(i => i.id == instance.id)
                    instanceSelect = instancesList.filter(i => i.id == instance.id) // keep original double logic just to be safe

                    instancePopup.classList.remove('active');
                    setTimeout(() => instancePopup.style.display = 'none', 300);

                    await setStatus(instance.status)
                });
            }
        };

        for (let instance of instancesList) {
            if (instance.whitelistActive) {
                let whitelist = instance.whitelist.find(whitelist => whitelist == auth?.name)
                if (whitelist !== auth?.name) {
                    if (instance.id == instanceSelect) {
                        let newInstanceSelect = instancesList.find(i => i.id === 'royalcreeps') || instancesList.find(i => i.whitelistActive == false)
                        let configClient = await this.db.readData('configClient')
                        configClient.instance_selct = newInstanceSelect.id
                        instanceSelect = newInstanceSelect.id
                        setStatus(newInstanceSelect.status)
                        await this.db.updateData('configClient', configClient)
                    }
                }
            } else {
                let DOM = document.createElement('div')
                DOM.classList.add('instance-elements')
                DOM.id = instance.id
                DOM.dataset.instanceId = instance.id
                if (instance.id == instanceSelect) {
                    DOM.classList.add('active-instance')
                    // Pre-render the active instance details right away
                    renderDetails(instance.id)
                }
                let instanceName = document.createElement('div')
                let instanceMeta = document.createElement('div')
                let instanceVersion = document.createElement('div')
                let instanceTag = createInstanceTagBadge(resolveInstanceTag(instance))

                instanceMeta.classList.add('instance-elements-meta')
                instanceName.classList.add('instance-elements-name')
                instanceName.style.pointerEvents = 'none'
                instanceName.textContent = instance.name || instance.id

                instanceVersion.classList.add('instance-elements-version')
                instanceVersion.style.pointerEvents = 'none'
                instanceVersion.textContent = getMinecraftVersionLabel(instance)

                instanceMeta.append(instanceName, instanceVersion)
                if (instanceTag) {
                    instanceTag.style.pointerEvents = 'none'
                    instanceMeta.appendChild(instanceTag)
                }
                DOM.appendChild(instanceMeta)
                instancesListPopup.appendChild(DOM)
            }
            if (instance.id == instanceSelect) setStatus(instance.status)
        }

        this.eventManager.add(instancePopup, 'click', async e => {
            let target = e.target.closest('.instance-elements');
            if (target) {
                let newInstanceSelect = target.dataset.instanceId
                let activeInstanceSelect = document.querySelector('.active-instance')

                if (activeInstanceSelect) activeInstanceSelect.classList.remove('active-instance');
                target.classList.add('active-instance');

                // Render detail pane (do NOT save to config or close popup yet)
                renderDetails(newInstanceSelect);
            }
        })

    }

    async refreshInstancesList() {
        if (this.instancesListPromise) return await this.instancesListPromise

        this.instancesListPromise = config.getInstanceList().then(instancesList => {
            this.instancesList = instancesList
            this.instancesListFetchedAt = Date.now()
            return instancesList
        }).finally(() => {
            this.instancesListPromise = null
        })

        return await this.instancesListPromise
    }

    async getLaunchInstances() {
        let hasCachedInstances = Array.isArray(this.instancesList) && this.instancesList.length > 0
        let cacheAge = Date.now() - (this.instancesListFetchedAt || 0)

        if (hasCachedInstances && cacheAge < INSTANCE_LIST_MAX_AGE) return this.instancesList
        return await this.refreshInstancesList()
    }

    async startGame() {
        let configClient = await this.db.readData('configClient')
        await window.launcherAccountRefresh?.waitFor(configClient.account_selected)
        configClient = await this.db.readData('configClient')
        let authenticator = await this.db.readData('accounts', configClient.account_selected)
        let instance

        if (!authenticator) {
            new popup().openPopup({
                title: 'Erreur',
                content: 'Le compte sélectionné est introuvable ou doit être reconnecté.',
                color: 'red',
                options: true
            })
            return
        }

        try {
            instance = await this.getLaunchInstances()
        } catch (err) {
            console.error('Impossible de vérifier la configuration distante de l\'instance:', err)
            new popup().openPopup({
                title: 'Erreur',
                content: "Impossible de vérifier la configuration distante de l'instance.",
                color: 'red',
                options: true
            })
            return
        }

        let options = instance.find(i => i.id == configClient.instance_selct)

        if (!options) {
            try {
                instance = await this.refreshInstancesList()
            } catch (err) {
                console.error('Impossible de vérifier la configuration distante de l\'instance:', err)
                new popup().openPopup({
                    title: 'Erreur',
                    content: "Impossible de vérifier la configuration distante de l'instance.",
                    color: 'red',
                    options: true
                })
                return
            }

            options = instance.find(i => i.id == configClient.instance_selct)
        }

        if (!options) {
            new popup().openPopup({
                title: 'Erreur',
                content: "L'instance sélectionnée est introuvable.",
                color: 'red',
                options: true
            })
            return
        }

        let launch = new Launch()
        let playInstanceBTN = document.querySelector('.play-instance')
        let infoStartingBOX = document.querySelector('.info-starting-game')
        let infoStarting = document.querySelector(".info-starting-game-text")
        let progressBar = document.querySelector('.progress-bar')
        let lastProgressUpdate = 0;
        let lastProgressLabel = '';
        let lastProgressPercent = -1;

        const updateLaunchProgress = (label, progress, size) => {
            let now = Date.now();
            let percent = size > 0 ? Math.min(100, Math.floor((progress / size) * 100)) : 0;
            let labelChanged = lastProgressLabel !== label;
            let percentChanged = lastProgressPercent !== percent;

            if (!labelChanged && !percentChanged && now - lastProgressUpdate < 120) return;
            if (!labelChanged && now - lastProgressUpdate < 120 && progress < size) return;

            infoStarting.textContent = `${label} ${percent}%`;
            ipcRenderer.send('main-window-progress', { progress, size });
            progressBar.value = progress;
            progressBar.max = size;

            lastProgressUpdate = now;
            lastProgressLabel = label;
            lastProgressPercent = percent;
        };

        let verifyRules = buildVerifyRules(options);

        let opt = {
            url: options.url,
            authenticator: authenticator,
            timeout: 10000,
            path: `${await appdata()}/${process.platform == 'darwin' ? this.config.dataDirectory : `.${this.config.dataDirectory}`}`,
            instance: options.id,
            version: options.loadder.minecraft_version,
            detached: configClient?.launcher_config?.closeLauncher == "close-all" ? false : true,
            downloadFileMultiple: configClient?.launcher_config?.download_multi || 5,
            intelEnabledMac: configClient?.launcher_config?.intelEnabledMac ?? true,

            loader: {
                type: options.loadder.loadder_type,
                build: options.loadder.loadder_version,
                enable: options.loadder.loadder_type == 'none' ? false : true
            },

            verify: options.verify,

            ignored: verifyRules.ignored,
            forceVerify: verifyRules.forceVerify,

            javaPath: configClient?.java_config?.java_path || null,

            screen: {
                width: configClient?.game_config?.screen_size?.width || 854,
                height: configClient?.game_config?.screen_size?.height || 480
            },

            memory: {
                min: `${(configClient?.java_config?.java_memory?.min || 2) * 1024}M`,
                max: `${(configClient?.java_config?.java_memory?.max || 4) * 1024}M`
            },
        }

        // Custom JVM Arguments support
        let jvmArgsStr = configClient?.java_config?.jvm_args ?? "-XX:+UseZGC -XX:+ZGenerational";
        if (jvmArgsStr && jvmArgsStr.trim() !== '') {
            // Regex to match args, keeping those inside quotes together
            const argsRegex = /(?:[^\s"']+|"[^"]*"|'[^']*')+/g;
            const parsedArgs = jvmArgsStr.match(argsRegex);

            if (parsedArgs) {
                // Remove quotes from matched strings
                opt.JVM_ARGS = parsedArgs.map(arg => arg.replace(/^["'](.*)["']$/, '$1'));
            }
        }

        playInstanceBTN.classList.add('hidden');
        setTimeout(() => {
            infoStartingBOX.style.display = "flex";
            // Force reflow
            void infoStartingBOX.offsetWidth;
            infoStartingBOX.classList.add('visible');
        }, 300); // Wait for transition out

        progressBar.style.display = "";
        ipcRenderer.send('main-window-progress-load')

        launch.on('extract', extract => {
            ipcRenderer.send('main-window-progress-load')
            console.log(extract);
        });

        launch.on('progress', (progress, size) => {
            updateLaunchProgress('Téléchargement', progress, size);
        });

        launch.on('check', (progress, size) => {
            updateLaunchProgress('Vérification', progress, size);
        });

        launch.on('estimated', (time) => {
            let hours = Math.floor(time / 3600);
            let minutes = Math.floor((time - hours * 3600) / 60);
            let seconds = Math.floor(time - hours * 3600 - minutes * 60);
            console.log(`${hours}h ${minutes}m ${seconds}s`);
        })

        launch.on('speed', (speed) => {
            console.log(`${(speed / 1067008).toFixed(2)} Mb/s`)
        })

        launch.on('patch', patch => {
            console.log(patch);
            ipcRenderer.send('main-window-progress-load')
            infoStarting.textContent = `Patch en cours...`
        });

        launch.on('data', (e) => {
            progressBar.style.display = "none"
            if (configClient?.launcher_config?.closeLauncher == 'close-launcher') {
                ipcRenderer.send("main-window-hide")
            };
            new logger('Minecraft', '#36b030');
            ipcRenderer.send('main-window-progress-load')
            infoStarting.textContent = `Demarrage en cours...`
            console.log(e);
        })

        launch.on('close', code => {
            if (configClient?.launcher_config?.closeLauncher == 'close-launcher') {
                ipcRenderer.send("main-window-show")
            };
            ipcRenderer.send('main-window-progress-reset')

            infoStartingBOX.classList.remove('visible');
            setTimeout(() => {
                infoStartingBOX.style.display = "none";
                playInstanceBTN.classList.remove('hidden');
            }, 300);

            infoStarting.textContent = `Vérification`
            new logger(pkg.name, '#7289da');
            console.log('Close');
        });

        launch.on('error', err => {
            let popupError = new popup()

            popupError.openPopup({
                title: 'Erreur',
                content: err.error,
                color: 'red',
                options: true
            })

            if (configClient?.launcher_config?.closeLauncher == 'close-launcher') {
                ipcRenderer.send("main-window-show")
            };
            ipcRenderer.send('main-window-progress-reset')

            infoStartingBOX.classList.remove('visible');
            setTimeout(() => {
                infoStartingBOX.style.display = "none";
                playInstanceBTN.classList.remove('hidden');
            }, 300);

            infoStarting.textContent = `Vérification`
            new logger(pkg.name, '#7289da');
            console.log(err);
        });

        launch.Launch(opt);
    }

    getdate(e) {
        let date = new Date(e)
        let year = date.getFullYear()
        let month = date.getMonth() + 1
        let day = date.getDate()
        let allMonth = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
        return { year: year, month: allMonth[month - 1], day: day }
    }
}
export default Home;