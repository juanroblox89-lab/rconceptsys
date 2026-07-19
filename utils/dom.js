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
        } else if (key === 'value') {
            el.value = value;
            el.setAttribute(key, value);
        } else if (key === 'checked' || key === 'disabled' || key === 'selected') {
            el[key] = !!value;
            if (value) {
                el.setAttribute(key, '');
            } else {
                el.removeAttribute(key);
            }
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

/**
 * Image Lightbox Helper
 * Opens a modal with a zoomed version of the image, with pan & zoom support.
 */
export const openLightbox = (url) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay fade-in';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.95)';
    overlay.style.backdropFilter = 'blur(10px)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '99999';
    overlay.style.overflow = 'hidden';

    const img = document.createElement('img');
    img.src = url;
    img.style.maxWidth = '95vw';
    img.style.maxHeight = '95vh';
    img.style.objectFit = 'contain';
    img.style.borderRadius = '4px';
    img.style.boxShadow = '0 10px 40px rgba(0,0,0,0.5)';
    img.style.transition = 'transform 0.1s ease-out';
    img.style.cursor = 'grab';

    let scale = 1;
    let isDragging = false;
    let startX, startY;
    let translateX = 0, translateY = 0;

    const updateTransform = () => {
        img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    };

    // Zoom on wheel
    overlay.addEventListener('wheel', (e) => {
        e.preventDefault();
        scale += e.deltaY * -0.005;
        scale = Math.min(Math.max(0.5, scale), 5); // Limit zoom between 0.5x and 5x
        updateTransform();
    });

    // Pan
    img.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isDragging = true;
        img.style.cursor = 'grabbing';
        startX = e.clientX - translateX;
        startY = e.clientY - translateY;
    });

    const onMouseMove = (e) => {
        if (!isDragging) return;
        translateX = e.clientX - startX;
        translateY = e.clientY - startY;
        updateTransform();
    };

    const onMouseUp = () => {
        isDragging = false;
        img.style.cursor = 'grab';
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    // Zoom in animation initially
    setTimeout(() => { img.style.transform = 'scale(1)'; }, 10);

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '20px';
    closeBtn.style.right = '30px';
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.color = '#fff';
    closeBtn.style.fontSize = '40px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.opacity = '0.8';

    const close = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        overlay.classList.remove('fade-in');
        overlay.style.opacity = '0';
        setTimeout(() => document.body.removeChild(overlay), 300);
    };

    overlay.onclick = (e) => { 
        if (e.target === overlay) close(); 
    };
    closeBtn.onclick = close;

    overlay.appendChild(img);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
};

/**
 * Sum the `amount` field of all items in an invoice.
 * Handles both `items` array and flat `amount` fallback.
 */
export function sumInvoiceItems(invoice) {
    if (!invoice) return 0;
    if (invoice.items && invoice.items.length > 0) {
        return invoice.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    }
    return Number(invoice.amount) || 0;
}

/**
 * Sum the `amount` field of all items in a plain array.
 */
export function sumItems(items) {
    if (!items || items.length === 0) return 0;
    return items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}

/**
 * Searchable Select Component
 * Creates an input with a dropdown for filtering options.
 */
export const SearchableSelect = (options, value, onChange, placeholder = 'Buscar...', required = false, id = '') => {
    const container = document.createElement('div');
    container.className = 'searchable-select';
    container.style.position = 'relative';
    if (id) container.id = id + '-container';

    const selectedOpt = options.find(o => o.value === value);
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-input text-xs w-full';
    input.placeholder = placeholder;
    input.value = selectedOpt ? selectedOpt.label : '';
    if (required) {
        input.required = true;
        if (!selectedOpt) input.setCustomValidity('Selecciona una opción de la lista');
    }

    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    if (id) hidden.id = id;
    hidden.value = value || '';

    const list = document.createElement('div');
    list.className = 'searchable-select-list card p-1 hidden';
    list.style.position = 'absolute';
    list.style.top = '100%';
    list.style.left = '0';
    list.style.right = '0';
    list.style.maxHeight = '200px';
    list.style.overflowY = 'auto';
    list.style.zIndex = '1000';
    list.style.marginTop = '4px';
    list.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
    list.style.border = '1px solid var(--border)';
    list.style.background = 'var(--bg-secondary)';

    const renderList = (filter = '') => {
        list.innerHTML = '';
        const lowerFilter = filter.toLowerCase();
        const filtered = options.filter(o => o.label.toLowerCase().includes(lowerFilter) || o.value.toLowerCase().includes(lowerFilter));
        
        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'p-2 text-xs text-muted text-center';
            empty.textContent = 'No hay resultados';
            list.appendChild(empty);
            return;
        }

        filtered.forEach(opt => {
            const item = document.createElement('div');
            item.className = 'p-2 text-xs cursor-pointer hover-bg-tertiary rounded';
            item.textContent = opt.label;
            item.onclick = (e) => {
                e.stopPropagation();
                input.value = opt.label;
                hidden.value = opt.value;
                input.setCustomValidity('');
                list.classList.add('hidden');
                if (onChange) onChange(opt.value);
            };
            list.appendChild(item);
        });
    };

    input.onfocus = () => {
        renderList('');
        list.classList.remove('hidden');
    };
    
    input.oninput = (e) => {
        hidden.value = '';
        if (required) input.setCustomValidity('Selecciona una opción de la lista');
        renderList(e.target.value);
        list.classList.remove('hidden');
    };

    input.onkeydown = (e) => {
        if (e.key === 'Escape') {
            list.classList.add('hidden');
        }
    };

    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            list.classList.add('hidden');
            const currentOpt = options.find(o => o.value === hidden.value);
            input.value = currentOpt ? currentOpt.label : '';
            if (required && !hidden.value) input.setCustomValidity('Selecciona una opción de la lista');
        }
    });

    Object.defineProperty(container, 'value', {
        get: () => hidden.value,
        set: (v) => {
            hidden.value = v;
            const o = options.find(x => x.value === v);
            input.value = o ? o.label : '';
            if (required) input.setCustomValidity(v ? '' : 'Selecciona una opción de la lista');
        }
    });

    container.addOption = (opt) => {
        options.push(opt);
    };

    container.appendChild(input);
    container.appendChild(hidden);
    container.appendChild(list);
    return container;
};
