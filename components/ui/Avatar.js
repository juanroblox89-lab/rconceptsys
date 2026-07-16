/**
 * Avatar - Reusable user avatar with image or initials fallback.
 * @param {Object} opts
 * @param {string} opts.src - Photo URL
 * @param {string} opts.name - User name (for initials fallback)
 * @param {number} opts.size - Pixel size (default 32)
 * @param {string} opts.className - Additional CSS classes
 */
import { h } from '../../utils/dom.js';

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#6366f1'];

function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return parts.length > 1
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : parts[0].slice(0, 2).toUpperCase();
}

function getColor(name) {
    if (!name) return COLORS[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return COLORS[Math.abs(hash) % COLORS.length];
}

export function Avatar({ src, name = '', size = 32, className = '' }) {
    const baseStyle = {
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        objectFit: 'cover',
        flexShrink: '0',
    };

    if (src) {
        const img = h('img', { src, className, style: baseStyle });
        const fallback = h('div', {
            className: `flex items-center justify-center font-bold text-white ${className}`,
            style: { ...baseStyle, background: getColor(name), fontSize: `${Math.max(size * 0.38, 10)}px`, display: 'none' }
        }, getInitials(name));
        img.onerror = () => { img.style.display = 'none'; fallback.style.display = 'flex'; };
        // Wrap in a container so we can have both elements
        const wrapper = h('span', { style: { display: 'inline-flex', lineHeight: '0' } }, [img, fallback]);
        return wrapper;
    }

    return h('div', {
        className: `flex items-center justify-center font-bold text-white ${className}`,
        style: { ...baseStyle, background: getColor(name), fontSize: `${Math.max(size * 0.38, 10)}px` }
    }, getInitials(name));
}
