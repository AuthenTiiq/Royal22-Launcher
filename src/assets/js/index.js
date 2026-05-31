/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

const updateAPI = window.updateAPI;

if (!updateAPI) throw new Error('updateAPI preload indisponible');

const allowedStatusTags = new Set(['B', 'BR', 'DIV', 'EM', 'I', 'SPAN', 'STRONG']);
const allowedStatusAttributes = {
    DIV: new Set(['class']),
};

function sanitizeStatusHTML(value) {
    const template = document.createElement('template');
    template.innerHTML = String(value || '');

    for (const node of Array.from(template.content.childNodes)) {
        sanitizeStatusNode(node);
    }

    return template.innerHTML;
}

function sanitizeStatusNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return;

    if (node.nodeType !== Node.ELEMENT_NODE) {
        node.remove();
        return;
    }

    if (!allowedStatusTags.has(node.tagName)) {
        node.replaceWith(document.createTextNode(node.textContent || ''));
        return;
    }

    for (const attribute of Array.from(node.attributes)) {
        const allowedAttributes = allowedStatusAttributes[node.tagName];
        if (!allowedAttributes?.has(attribute.name)) {
            node.removeAttribute(attribute.name);
            continue;
        }

        if (attribute.name === 'class' && attribute.value !== 'download-update') {
            node.removeAttribute(attribute.name);
        }
    }

    for (const child of Array.from(node.childNodes)) {
        sanitizeStatusNode(child);
    }
}


class Splash {
    constructor() {
        this.splash = document.querySelector(".splash");
        this.splashMessage = document.querySelector(".splash-message");
        this.splashAuthor = document.querySelector(".splash-author");
        this.message = document.querySelector(".message");
        this.progress = document.querySelector(".progress");
        document.addEventListener('DOMContentLoaded', async () => {
            let theme = await updateAPI.getLauncherTheme();
            let isDarkTheme = await updateAPI.isDarkTheme(theme).then(res => res)
            document.body.className = isDarkTheme ? 'dark global' : 'light global';
            if (updateAPI.platform == 'win32') updateAPI.showProgressLoad()
            this.startAnimation()
        });
    }

    async startAnimation() {
        let splashes = [
            { "message": "Je vois quelque chose en direction de...", "author": "Explorateur" }, +
            { "message": "Et si ce n'était qu'un projet...", "author": "Explorateur" },
            { "message": "Je le vois ! Oui ! C'est le Royaume !", "author": "Explorateur" },
            { "message": "Et si RoyalCreep's...", "author": "Inconnu" },
            { "message": "RoyalCreep's est née en 2013...", "author": "Inconnu" },
            { "message": "Rapidité...", "author": "Inconnu" }
        ];
        let splash = splashes[Math.floor(Math.random() * splashes.length)];
        this.splashMessage.textContent = splash.message;
        this.splashAuthor.children[0].textContent = "@" + splash.author;
        await sleep(100);
        document.querySelector("#splash").style.display = "block";
        await sleep(200);
        this.splash.classList.add("opacity");
        await sleep(200);
        this.splash.classList.add("translate");
        this.splashMessage.classList.add("opacity");
        this.splashAuthor.classList.add("opacity");
        this.message.classList.add("opacity");
        await sleep(100);
        this.checkUpdate();
    }

    async checkUpdate() {
        this.setStatus(`Recherche de mise à jour...`);

        updateAPI.onUpdateAvailable(() => {
            this.setStatus(`Mise à jour disponible !<br>MacOS : royalcreeps.fr/launcher <br>`);
            if (updateAPI.platform == 'win32') updateAPI.startUpdate();
            else return this.dowloadUpdate();
        })

        updateAPI.onError((err) => {
            if (err) return this.shutdown(`${err.message}`);
        })

        updateAPI.onDownloadProgress((progress) => {
            this.toggleProgress();
            updateAPI.setWindowProgress({ progress: progress.transferred, size: progress.total })
            this.setProgress(progress.transferred, progress.total);
        })

        updateAPI.onUpdateNotAvailable(() => {
            console.error("Mise à jour non disponible");
            this.maintenanceCheck();
        })

        if (updateAPI.platform == 'darwin') {
            try {
                const macUpdate = await this.checkMacUpdate();
                if (macUpdate.available) return this.dowloadUpdate(macUpdate.release);
            } catch (err) {
                console.error('Erreur lors de la recherche de mise a jour macOS:', err);
            }

            return this.maintenanceCheck();
        }

        try {
            await updateAPI.checkForUpdates();
        } catch (err) {
            return this.shutdown(`erreur lors de la recherche de mise à jour :<br>${this.getErrorMessage(err)}`);
        }
    }

    normalizeVersion(version) {
        return String(version || '').trim().replace(/^v/i, '');
    }

    compareVersions(currentVersion, latestVersion) {
        const currentParts = this.normalizeVersion(currentVersion).split('.').map(part => Number.parseInt(part, 10) || 0);
        const latestParts = this.normalizeVersion(latestVersion).split('.').map(part => Number.parseInt(part, 10) || 0);
        const maxLength = Math.max(currentParts.length, latestParts.length);

        for (let index = 0; index < maxLength; index++) {
            const currentPart = currentParts[index] ?? 0;
            const latestPart = latestParts[index] ?? 0;

            if (currentPart < latestPart) return -1;
            if (currentPart > latestPart) return 1;
        }

        return 0;
    }

    async fetchLatestRelease() {
        return updateAPI.fetchLatestRelease();
    }

    async checkMacUpdate() {
        const latestRelease = await this.fetchLatestRelease();
        const latestVersion = this.normalizeVersion(latestRelease.tag_name || latestRelease.name);

        if (!latestVersion || this.compareVersions(updateAPI.appInfo.version, latestVersion) >= 0) {
            return { available: false };
        }

        const release = this.getLatestReleaseForOS('mac', '.dmg', latestRelease.assets || []);
        return {
            available: Boolean(release),
            release
        };
    }

    getErrorMessage(error) {
        if (!error) return 'Erreur inconnue';
        if (typeof error === 'string') return error;
        return error.message || error.stack || JSON.stringify(error);
    }

    getLatestReleaseForOS(os, preferredFormat, asset) {
        return asset.filter(asset => {
            const name = asset.name.toLowerCase();
            const isOSMatch = name.includes(os);
            const isFormatMatch = name.endsWith(preferredFormat);
            return isOSMatch && isFormatMatch;
        }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    }

    async dowloadUpdate(latest = null) {
        let release = latest;

        if (!release) {
            const latestRelease = await this.fetchLatestRelease();
            if (updateAPI.platform == 'darwin') release = this.getLatestReleaseForOS('mac', '.dmg', latestRelease.assets || []);
            else if (updateAPI.platform == 'linux') release = this.getLatestReleaseForOS('linux', '.appimage', latestRelease.assets || []);
        }

        if (!release?.browser_download_url) {
            return this.shutdown("Aucune mise à jour téléchargeable n'a été trouvée.");
        }

        this.setStatus(`Mise à jour disponible !<br><div class="download-update">Télécharger</div>`);
        document.querySelector(".download-update").addEventListener("click", async () => {
            await updateAPI.openExternal(release.browser_download_url);
            return this.shutdown("Téléchargement en cours...");
        }, { once: true });
    }


    async maintenanceCheck() {
        updateAPI.getRemoteConfig().then(res => {
            if (res.maintenance) return this.shutdown(res.maintenance_message);
            this.startLauncher();
        }).catch(e => {
            console.error(e);
            return this.shutdown("Aucune connexion internet détectée,<br>veuillez réessayer ultérieurement.");
        })
    }

    startLauncher() {
        this.setStatus(`Démarrage du launcher`);
        updateAPI.openMainWindow();
        updateAPI.closeUpdateWindow();
    }

    shutdown(text) {
        this.setStatus(`${text}<br>Arrêt dans 5s`);
        let i = 4;
        const shutdownInterval = setInterval(() => {
            this.setStatus(`${text}<br>Arrêt dans ${i--}s`);
            if (i < 0) {
                clearInterval(shutdownInterval); // Prevent memory leak
                updateAPI.closeUpdateWindow();
            }
        }, 1000);
    }

    setStatus(text) {
        this.message.innerHTML = sanitizeStatusHTML(text);
    }

    toggleProgress() {
        if (this.progress.classList.toggle("show")) this.setProgress(0, 1);
    }

    setProgress(value, max) {
        this.progress.value = value;
        this.progress.max = max;
    }
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.keyCode == 73 || e.keyCode == 123) {
        updateAPI.openDevTools();
    }
})
new Splash();