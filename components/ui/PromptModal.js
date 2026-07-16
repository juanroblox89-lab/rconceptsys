/**
 * PromptModal - Replacement for native prompt() using the existing modal system.
 * Returns a Promise<string|null> — the user's input or null if cancelled.
 */
import { h, icon } from '../../utils/dom.js';

export function promptModal({ title, message, defaultValue = '', inputType = 'text', placeholder = '' }) {
    return new Promise((resolve) => {
        const overlay = h('div', { className: 'modal-overlay' });
        const input = h('input', {
            className: 'form-input',
            type: inputType,
            value: defaultValue,
            placeholder,
        });

        const close = (value) => {
            overlay.remove();
            resolve(value);
        };

        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });

        const container = h('div', { className: 'modal-container' }, [
            h('div', { className: 'modal-header' }, [
                h('h3', { className: 'modal-title' }, title),
                h('button', { className: 'btn-icon', onClick: () => close(null) }, [icon('x', 16)])
            ]),
            h('div', { className: 'modal-body' }, [
                h('p', { className: 'text-sm text-secondary' }, message),
                input
            ]),
            h('div', { className: 'modal-footer' }, [
                h('button', { className: 'btn btn-outline text-xs', onClick: () => close(null) }, 'Cancelar'),
                h('button', {
                    className: 'btn btn-primary text-xs',
                    onClick: () => close(input.value || null)
                }, 'Aceptar')
            ])
        ]);

        overlay.appendChild(container);
        document.body.appendChild(overlay);

        input.focus();
        input.select();

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') close(input.value || null);
            if (e.key === 'Escape') close(null);
        });
    });
}
