/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0/
 */

'use strict';

export default class Slider {
    constructor(id, minValue, maxValue) {
        this.slider = document.querySelector(id);
        this.touchLeft = this.slider.querySelector('.slider-touch-left');
        this.touchRight = this.slider.querySelector('.slider-touch-right');
        this.lineSpan = this.slider.querySelector('.slider-line span');

        this.min = parseFloat(this.slider.getAttribute('min'));
        this.max = parseFloat(this.slider.getAttribute('max'));
        this.step = parseFloat(this.slider.getAttribute('step')) || 0.5;

        if (!minValue || minValue < this.min) minValue = this.min;
        if (!maxValue || maxValue > this.max) maxValue = this.max;

        this.minValue = minValue;
        this.maxValue = maxValue;

        // Track which handle is being dragged: 'left', 'right', or null
        this.dragging = null;
        this.startX = 0;
        this.startLeft = 0;

        // Calculate slider dimensions
        this.handleWidth = this.touchLeft.offsetWidth || 18;
        this.sliderWidth = this.slider.offsetWidth;
        this.trackWidth = this.sliderWidth - this.handleWidth;

        // Initialize positions
        this.setPositions();

        // Bind event handlers
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);

        // Add event listeners
        this.touchLeft.addEventListener('mousedown', (e) => this.onMouseDown(e, 'left'));
        this.touchRight.addEventListener('mousedown', (e) => this.onMouseDown(e, 'right'));
        this.touchLeft.addEventListener('touchstart', (e) => this.onMouseDown(e, 'left'), { passive: false });
        this.touchRight.addEventListener('touchstart', (e) => this.onMouseDown(e, 'right'), { passive: false });

        this.func = {};
    }

    setPositions() {
        // Calculate positions based on current values
        let minRatio = (this.minValue - this.min) / (this.max - this.min);
        let maxRatio = (this.maxValue - this.min) / (this.max - this.min);

        let leftPos = minRatio * this.trackWidth;
        let rightPos = maxRatio * this.trackWidth;

        this.touchLeft.style.left = leftPos + 'px';
        this.touchRight.style.left = rightPos + 'px';

        this.updateLine();
    }

    updateLine() {
        let leftPos = parseFloat(this.touchLeft.style.left) || 0;
        let rightPos = parseFloat(this.touchRight.style.left) || this.trackWidth;

        this.lineSpan.style.marginLeft = leftPos + 'px';
        this.lineSpan.style.width = (rightPos - leftPos) + 'px';
    }

    onMouseDown(e, handle) {
        e.preventDefault();
        e.stopPropagation();

        this.dragging = handle;

        // Get the starting X position
        let clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        this.startX = clientX;

        // Get current position of the handle being dragged
        if (handle === 'left') {
            this.startLeft = parseFloat(this.touchLeft.style.left) || 0;
        } else {
            this.startLeft = parseFloat(this.touchRight.style.left) || this.trackWidth;
        }

        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('mouseup', this.onMouseUp);
        document.addEventListener('touchmove', this.onMouseMove, { passive: false });
        document.addEventListener('touchend', this.onMouseUp);
    }

    onMouseMove(e) {
        if (!this.dragging) return;

        e.preventDefault();

        let clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        let deltaX = clientX - this.startX;
        let newPos = this.startLeft + deltaX;

        // Get current positions
        let leftPos = parseFloat(this.touchLeft.style.left) || 0;
        let rightPos = parseFloat(this.touchRight.style.left) || this.trackWidth;

        if (this.dragging === 'left') {
            // Constrain left handle
            newPos = Math.max(0, newPos);
            newPos = Math.min(rightPos - this.handleWidth, newPos);
            this.touchLeft.style.left = newPos + 'px';
        } else if (this.dragging === 'right') {
            // Constrain right handle
            newPos = Math.max(leftPos + this.handleWidth, newPos);
            newPos = Math.min(this.trackWidth, newPos);
            this.touchRight.style.left = newPos + 'px';
        }

        this.updateLine();
        this.calculateValue();
    }

    onMouseUp() {
        this.dragging = null;

        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('mouseup', this.onMouseUp);
        document.removeEventListener('touchmove', this.onMouseMove);
        document.removeEventListener('touchend', this.onMouseUp);

        this.calculateValue();
    }

    calculateValue() {
        let leftPos = parseFloat(this.touchLeft.style.left) || 0;
        let rightPos = parseFloat(this.touchRight.style.left) || this.trackWidth;

        // Calculate ratios
        let minRatio = leftPos / this.trackWidth;
        let maxRatio = rightPos / this.trackWidth;

        // Clamp ratios
        minRatio = Math.max(0, Math.min(1, minRatio));
        maxRatio = Math.max(0, Math.min(1, maxRatio));

        // Convert to values
        let minValue = minRatio * (this.max - this.min) + this.min;
        let maxValue = maxRatio * (this.max - this.min) + this.min;

        // Apply step rounding
        if (this.step > 0) {
            this.minValue = Math.round(minValue / this.step) * this.step;
            this.maxValue = Math.round(maxValue / this.step) * this.step;
        } else {
            this.minValue = minValue;
            this.maxValue = maxValue;
        }

        // Clamp to valid range
        this.minValue = Math.max(this.min, Math.min(this.max, this.minValue));
        this.maxValue = Math.max(this.min, Math.min(this.max, this.maxValue));

        // Ensure min <= max
        if (this.minValue > this.maxValue) {
            this.minValue = this.maxValue;
        }

        this.emit('change', this.minValue, this.maxValue);
    }

    on(name, func) {
        this.func[name] = func;
    }

    emit(name, ...args) {
        if (this.func[name]) this.func[name](...args);
    }
}