/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 * 
 * Event Manager - Manages event listeners lifecycle to prevent memory leaks
 */

class EventManager {
    constructor() {
        this.listeners = [];
    }

    /**
     * Add an event listener and track it for cleanup
     * Automatically detects DOM vs IPC events
     * @param {Element|Document|Window|IPC} element - Target element or IPC renderer
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     * @param {Object} options - Event listener options
     * @returns {Function} The handler function for reference
     */
    add(element, event, handler, options = {}) {
        // Check if this is an IPC event (has 'on' method but not 'addEventListener')
        const isIPC = element && typeof element.on === 'function' && typeof element.addEventListener !== 'function';

        if (isIPC) {
            // Use IPC's .on() method
            element.on(event, handler);
            this.listeners.push({ element, event, handler, options, isIPC: true });
        } else {
            // Use standard DOM addEventListener
            element.addEventListener(event, handler, options);
            this.listeners.push({ element, event, handler, options, isIPC: false });
        }

        return handler;
    }

    /**
     * Remove a specific event listener
     * @param {Element|Document|Window|IPC} element - Target element or IPC renderer
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     */
    remove(element, event, handler) {
        const listener = this.listeners.find(
            l => l.element === element && l.event === event && l.handler === handler
        );

        if (listener) {
            if (listener.isIPC) {
                element.removeListener(event, handler);
            } else {
                element.removeEventListener(event, handler);
            }

            this.listeners = this.listeners.filter(l => l !== listener);
        }
    }

    /**
     * Remove all tracked event listeners
     */
    cleanup() {
        for (const listener of this.listeners) {
            const { element, event, handler, isIPC } = listener;

            if (isIPC) {
                // Use IPC's removeListener
                element.removeListener(event, handler);
            } else {
                // Use DOM removeEventListener
                element.removeEventListener(event, handler);
            }
        }
        this.listeners = [];
    }

    /**
     * Get the number of tracked listeners
     * @returns {number}
     */
    count() {
        return this.listeners.length;
    }
}

export default EventManager;
