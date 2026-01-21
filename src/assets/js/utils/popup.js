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
        this.popupButton = document.querySelector('.popup-button');
    }

    openPopup(info) {
        this.popup.style.display = 'flex';
        // Reset background to allow CSS to handle it, unless explicitly disabled
        if (info.background === false) this.popup.style.background = 'none';
        else this.popup.style.background = '';

        this.popupTitle.innerHTML = info.title;
        this.popupContent.style.color = info.color ? info.color : '#e21212';
        this.popupContent.innerHTML = info.content;

        if (info.options) this.popupOptions.style.display = 'flex';

        // Wait a frame to allow display:flex to apply before adding opacity class
        requestAnimationFrame(() => {
            this.popup.classList.add('active');
        });

        if (this.popupOptions.style.display !== 'none') {
            // Remove old listeners to avoid duplicates (though this implementation is simple, 
            // ideally we normally handle this better, but consistent with existing code structure)
            const newBtn = this.popupButton.cloneNode(true);
            this.popupButton.parentNode.replaceChild(newBtn, this.popupButton);
            this.popupButton = newBtn;

            this.popupButton.addEventListener('click', () => {
                if (info.exit) return ipcRenderer.send('main-window-close');
                this.closePopup();
            })
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
        }, 300);
    }
}