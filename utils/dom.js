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
