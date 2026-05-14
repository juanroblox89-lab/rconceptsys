/**
 * DOM Utilities for Creative Production OS
 */

/**
 * Creates an element with attributes and children.
 * @param {string} tag 
 * @param {Object} attrs 
 * @param {Array|string|Element} children 
 * @returns {HTMLElement}
 */
export const h = (tag, attrs = {}, children = []) => {
    const el = document.createElement(tag);
    
    // Set attributes
    for (const [key, value] of Object.entries(attrs)) {
        if (value === null || value === undefined) continue;
        if (key === 'className') {
            el.className = value;
        } else if (key === 'style' && typeof value === 'object') {
            Object.assign(el.style, value);
        } else if (key.startsWith('on') && typeof value === 'function') {
            const eventName = key.toLowerCase().substring(2);
            el.addEventListener(eventName, value);
        } else if (key === 'dataset' && typeof value === 'object') {
            Object.assign(el.dataset, value);
        } else if (key === 'key') {
            // React-like key prop - skip as HTML attr, just used internally
        } else {
            el.setAttribute(key, value);
        }
    }
    
    // Add children - handle null/false/undefined gracefully
    const addChildren = (child) => {
        if (child === null || child === undefined || child === false) return;
        if (Array.isArray(child)) {
            child.forEach(addChildren);
        } else if (typeof child === 'string' || typeof child === 'number') {
            el.appendChild(document.createTextNode(String(child)));
        } else if (child instanceof HTMLElement || child instanceof SVGElement || child instanceof Node) {
            el.appendChild(child);
        }
    };
    
    addChildren(children);
    
    return el;
};

/**
 * Quick helper for Lucide icons
 * Lucide icons need createIcons() called after being added to the DOM.
 */
export const icon = (name, size = 18, className = '') => {
    const attrs = { 'data-lucide': name };
    if (size) attrs.size = size;
    if (className) attrs.className = className;
    return h('i', attrs);
};

/**
 * Skeleton loader helper
 */
export const skeleton = (width = '100%', height = '20px') => {
    return h('div', {
        className: 'skeleton',
        style: {
            width,
            height,
            borderRadius: '4px',
            background: 'linear-gradient(90deg, var(--bg-accent) 25%, var(--bg-tertiary) 50%, var(--bg-accent) 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite'
        }
    });
};
