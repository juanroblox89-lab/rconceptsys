/**
 * CopyButton - Copy text to clipboard with visual feedback.
 * @param {Object} opts
 * @param {string} opts.text - Text to copy
 * @param {string} opts.label - Button text (optional)
 * @param {number} opts.iconSize - Lucide icon size (default: 12)
 * @param {string} opts.className - Additional CSS classes
 */
import { h, icon } from '../../utils/dom.js';

export function CopyButton({ text, label = '', iconSize = 12, className = 'btn btn-outline text-xs flex items-center gap-1' }) {
    const btn = h('button', {
        className,
        onClick: async (e) => {
            const currentBtn = e.currentTarget;
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(text);
                } else {
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    ta.style.position = 'fixed';
                    ta.style.left = '-9999px';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                }
                const originalHTML = currentBtn.innerHTML;
                currentBtn.innerHTML = '';
                currentBtn.appendChild(icon('check', iconSize));
                if (label) currentBtn.appendChild(h('span', {}, 'Copiado'));
                setTimeout(() => {
                    currentBtn.innerHTML = '';
                    currentBtn.appendChild(icon('copy', iconSize));
                    if (label) currentBtn.appendChild(h('span', {}, label));
                }, 1500);
            } catch (err) {
                console.error('Copy failed:', err);
            }
        }
    }, [icon('copy', iconSize), label ? h('span', {}, label) : null].filter(Boolean));

    return btn;
}
