/**
 * Modal utilities for Creative Production OS.
 * Centralizes the overlay creation / teardown boilerplate that was
 * duplicated across nearly every page.
 */
import { h } from './dom.js';

/**
 * Creates a modal overlay element and appends it to the document body.
 * @param {Object} [opts]
 * @param {boolean} [opts.fadeIn=true] Apply the `fade-in` animation class.
 * @param {number} [opts.zIndex] Optional explicit z-index.
 * @returns {HTMLElement} the overlay element (already in the DOM).
 */
export const createOverlay = ({ fadeIn = true, zIndex } = {}) => {
    const overlay = h('div', {
        className: fadeIn ? 'modal-overlay fade-in' : 'modal-overlay',
        style: zIndex != null ? { zIndex: String(zIndex) } : undefined
    });
    document.body.appendChild(overlay);
    return overlay;
};

/**
 * Removes a modal overlay from the DOM (safe to call multiple times).
 * @param {HTMLElement} overlay
 */
export const closeModal = (overlay) => {
    if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
    }
};

/**
 * Shows a standard confirmation dialog.
 * @param {Object} opts
 * @param {string} opts.title
 * @param {string|HTMLElement} opts.message
 * @param {() => (void|Promise<void>)} opts.onConfirm
 * @param {string} [opts.confirmText='Confirmar']
 * @param {string} [opts.cancelText='Cancelar']
 * @param {boolean} [opts.danger=false] Style the confirm button as destructive.
 * @returns {HTMLElement} the overlay element.
 */
export const confirmDialog = ({
    title,
    message,
    onConfirm,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    danger = false
}) => {
    const overlay = createOverlay();
    const dangerStyle = danger ? { color: 'var(--error)', borderColor: 'var(--error)' } : undefined;

    const modal = h('div', { className: 'modal-container' }, [
        h('div', { className: 'modal-header text-sm font-bold' }, title),
        h('div', { className: 'modal-body text-xs' }, message),
        h('div', { className: 'modal-footer' }, [
            h('button', {
                className: 'btn btn-outline text-xs',
                onClick: () => closeModal(overlay)
            }, cancelText),
            h('button', {
                className: 'btn text-xs',
                style: dangerStyle,
                onClick: async () => {
                    closeModal(overlay);
                    await onConfirm();
                }
            }, confirmText)
        ])
    ]);

    overlay.appendChild(modal);
    return overlay;
};
