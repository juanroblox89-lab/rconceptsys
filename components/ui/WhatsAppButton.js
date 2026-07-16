/**
 * WhatsAppButton - Opens a WhatsApp chat with pre-filled message.
 * @param {Object} opts
 * @param {string} opts.phone - Phone number with country code (e.g. "573001234567")
 * @param {string} opts.message - Message to pre-fill
 * @param {string} opts.label - Button text (default: "WhatsApp")
 * @param {string} opts.className - Additional CSS classes
 * @param {string} opts.iconSize - Lucide icon size (default: 14)
 */
import { h, icon } from '../../utils/dom.js';

export function WhatsAppButton({ phone, message, label = '', className = 'btn btn-outline text-xs flex items-center gap-1', iconSize = 14 }) {
    const cleanPhone = (phone || '').replace(/[^0-9]/g, '');
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message || '')}`;

    return h('a', {
        href: url,
        target: '_blank',
        rel: 'noopener noreferrer',
        className,
        style: { borderColor: '#25d366', color: '#25d366' }
    }, [
        icon('message-circle', iconSize),
        label ? h('span', {}, label) : null
    ].filter(Boolean));
}
