/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

const { ipcRenderer } = require('electron');

const allowedPopupTags = new Set(['A', 'B', 'BR', 'CODE', 'DIV', 'EM', 'I', 'P', 'SPAN', 'STRONG', 'U']);
const allowedPopupAttributes = {
    A: new Set(['href', 'target', 'rel'])
};

const isSafeURL = value => {
    try {
        let url = new URL(value, window.location.href);
        return ['http:', 'https:', 'mailto:'].includes(url.protocol);
    } catch {
        return false;
    }
};

const sanitizePopupNode = node => {
    if (node.nodeType === Node.TEXT_NODE) return;
    if (node.nodeType !== Node.ELEMENT_NODE) {
        node.remove();
        return;
    }

    for (let child of [...node.childNodes]) sanitizePopupNode(child);

    if (!allowedPopupTags.has(node.tagName)) {
        node.replaceWith(...node.childNodes);
        return;
    }

    for (let attribute of [...node.attributes]) {
        let name = attribute.name.toLowerCase();
        let allowed = allowedPopupAttributes[node.tagName]?.has(name) || false;

        if (name.startsWith('on') || name === 'style' || !allowed) {
            node.removeAttribute(attribute.name);
            continue;
        }

        if (name === 'href' && !isSafeURL(attribute.value)) node.removeAttribute(attribute.name);
    }

    if (node.tagName === 'A' && node.hasAttribute('href')) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
    }
};

const sanitizePopupHTML = value => {
    let template = document.createElement('template');
    template.innerHTML = String(value ?? '');
    for (let child of [...template.content.childNodes]) sanitizePopupNode(child);
    return template.innerHTML;
};

export default class popup {
    constructor() {
        this.popup = document.querySelector('.popup');
        this.popupTitle = document.querySelector('.popup-title');
        this.popupContent = document.querySelector('.popup-content');
        this.popupOptions = document.querySelector('.popup-options');

    }

    openPopup(info) {
        this.popupButton = document.querySelector('.popup-button');
        this.popup.style.display = 'flex';
        // Reset background to allow CSS to handle it, unless explicitly disabled
        if (info.background === false) this.popup.style.background = 'none';
        else this.popup.style.background = '';

        this.popupTitle.textContent = info.title ?? '';
        this.popupContent.style.color = info.color ? info.color : '#e21212';
        this.popupContent.innerHTML = sanitizePopupHTML(info.content);

        if (info.onClose) this.onClose = info.onClose;

        if (info.options || info.close || info.exit) this.popupOptions.style.display = 'flex';

        // Wait a frame to allow display:flex to apply before adding opacity class
        requestAnimationFrame(() => {
            this.popup.classList.add('active');
        });

        if (this.popupOptions.style.display !== 'none') {
            this.popupButton.onclick = () => {
                if (info.exit) return ipcRenderer.send('main-window-close');
                this.closePopup();
            }
        }
    }

    closePopup() {
        this.popup.classList.remove('active');
        // Wait for transition to finish
        setTimeout(() => {
            this.popup.style.display = 'none';
            this.popupTitle.textContent = '';
            this.popupContent.innerHTML = '';
            this.popupOptions.style.display = 'none';
            if (this.onClose) {
                this.onClose();
                this.onClose = null;
            }
        }, 300);
    }
}