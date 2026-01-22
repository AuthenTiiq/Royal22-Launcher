/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

const { ipcRenderer } = require('electron');

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

        this.popupTitle.innerHTML = info.title;
        this.popupContent.style.color = info.color ? info.color : '#e21212';
        this.popupContent.innerHTML = info.content;

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
            this.popupTitle.innerHTML = '';
            this.popupContent.innerHTML = '';
            this.popupOptions.style.display = 'none';
            if (this.onClose) {
                this.onClose();
                this.onClose = null;
            }
        }, 300);
    }
}