import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { h, icon, openLightbox, skeleton } from '../utils/dom.js';

describe('DOM utilities', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('creates elements with supported attributes, events, and nested children', () => {
        const onClick = vi.fn();
        const child = document.createElement('span');
        child.textContent = 'child';

        const element = h('button', {
            className: 'primary',
            style: { color: 'red' },
            dataset: { assignmentId: 'asg-1' },
            onClick,
            key: 'ignored',
            value: 'save',
            checked: true,
            disabled: false,
            title: 'Guardar',
            ignored: null
        }, ['Guardar ', [child, 2, false, null]]);

        element.click();

        expect(element.className).toBe('primary');
        expect(element.style.color).toBe('red');
        expect(element.dataset.assignmentId).toBe('asg-1');
        expect(element.value).toBe('save');
        expect(element.getAttribute('value')).toBe('save');
        expect(element.checked).toBe(true);
        expect(element.hasAttribute('checked')).toBe(true);
        expect(element.disabled).toBe(false);
        expect(element.hasAttribute('disabled')).toBe(false);
        expect(element.getAttribute('title')).toBe('Guardar');
        expect(element.hasAttribute('key')).toBe(false);
        expect(element.textContent).toBe('Guardar child2');
        expect(onClick).toHaveBeenCalledOnce();
    });

    it('creates icon and skeleton helpers with their expected presentation', () => {
        const lucideIcon = icon('search', 20, 'muted');
        const placeholder = skeleton('50%', '12px');

        expect(lucideIcon.tagName).toBe('I');
        expect(lucideIcon.dataset.lucide).toBe('search');
        expect(lucideIcon.getAttribute('size')).toBe('20');
        expect(lucideIcon.className).toBe('muted');
        expect(placeholder.className).toBe('skeleton');
        expect(placeholder.style.width).toBe('50%');
        expect(placeholder.style.height).toBe('12px');
        expect(placeholder.style.animation).toContain('shimmer');
    });

    it('opens an interactive lightbox and removes its listeners when closed', () => {
        vi.useFakeTimers();
        const addWindowListener = vi.spyOn(window, 'addEventListener');
        const removeWindowListener = vi.spyOn(window, 'removeEventListener');

        openLightbox('https://example.com/asset.png');

        const overlay = document.querySelector('.modal-overlay');
        const image = overlay.querySelector('img');
        const closeButton = overlay.querySelector('button');

        expect(image.src).toBe('https://example.com/asset.png');
        expect(document.body.contains(overlay)).toBe(true);
        expect(addWindowListener).toHaveBeenCalledWith('mousemove', expect.any(Function));
        expect(addWindowListener).toHaveBeenCalledWith('mouseup', expect.any(Function));

        overlay.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true }));
        expect(image.style.transform).toContain('scale(1.5)');

        image.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            clientX: 20,
            clientY: 30
        }));
        window.dispatchEvent(new MouseEvent('mousemove', {
            clientX: 45,
            clientY: 55
        }));
        expect(image.style.transform).toContain('translate(25px, 25px)');

        window.dispatchEvent(new MouseEvent('mouseup'));
        expect(image.style.cursor).toBe('grab');

        closeButton.click();
        expect(removeWindowListener).toHaveBeenCalledWith('mousemove', expect.any(Function));
        expect(removeWindowListener).toHaveBeenCalledWith('mouseup', expect.any(Function));

        vi.advanceTimersByTime(300);
        expect(document.body.contains(overlay)).toBe(false);
    });
});
