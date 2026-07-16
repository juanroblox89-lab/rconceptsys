/**
 * SearchInput - Reusable search input with icon and debounced callback.
 * @param {Object} opts
 * @param {string} opts.placeholder - Placeholder text
 * @param {Function} opts.onSearch - Callback with debounced value
 * @param {string} opts.value - Initial value
 * @param {string} opts.className - Additional CSS classes
 */
import { h, icon } from '../../utils/dom.js';

export function SearchInput({ placeholder = 'Buscar...', onSearch, value = '', className = '' }) {
    let debounceTimer = null;

    const input = h('input', {
        type: 'text',
        className: `form-input text-xs ${className}`,
        placeholder,
        value,
        style: { height: '36px' },
        onInput: (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                onSearch(e.target.value);
            }, 250);
        }
    });

    return h('div', { className: 'flex items-center gap-2', style: { flex: '1' } }, [
        icon('search', 14, 'text-muted'),
        input
    ]);
}
