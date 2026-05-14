/**
 * References Page - Creative Production OS
 * Notion Light UI presenting curated visual and conceptual reference links for video editing inspiration.
 */
import { h, icon } from '../utils/dom.js';

let localRefsCache = [
    { title: 'Edición Dinámica estilo Alex H.', style: 'Retention Editor / Subtítulos Dinámicos', url: 'https://www.youtube.com', platform: 'YouTube' },
    { title: 'Color Grading Cinemático B2B', style: 'Moody / Minimalist Light', url: 'https://vimeo.com', platform: 'Vimeo' },
    { title: 'Ritmo de Montaje Rápido en Reels', style: 'Corte por Compás Musical', url: 'https://www.instagram.com', platform: 'Instagram' }
];

export const render = () => {
    const header = h('div', { className: 'content-header flex justify-between items-center w-full mb-4', style: { paddingBottom: '1rem' } }, [
        h('div', {}, [
            h('h1', {}, 'Biblioteca Curada de Referencias Visuales'),
            h('p', { className: 'text-xs text-muted mt-1' }, 'Estilos de edición, técnicas de retención y esquemas de gradación de color utilizados como benchmark de agencia.')
        ]),
        h('div', { className: 'flex gap-2' }, [
            h('button', { 
                className: 'btn btn-primary text-xs',
                onClick: () => {
                    const titleVal = prompt("Ingresa el título de la nueva referencia curada:");
                    if (titleVal) {
                        const styleVal = prompt("Describe el estilo o técnica:");
                        localRefsCache.push({ title: titleVal, style: styleVal || 'General', url: 'https://youtube.com', platform: 'Web' });
                        // Trigger soft update
                        alert("Referencia añadida exitosamente al directorio local.");
                        const view = document.getElementById('router-view');
                        if (view) {
                            view.innerHTML = '';
                            view.appendChild(render());
                            if (window.lucide) window.lucide.createIcons();
                        }
                    }
                } 
            }, [icon('plus', 14), h('span', {}, 'Añadir Referencia')])
        ])
    ]);

    const grid = h('div', { className: 'grid gap-4', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' } }, 
        localRefsCache.map((refItem, idx) => h('div', { key: idx, className: 'card flex-column justify-between p-0 overflow-hidden' }, [
            h('div', { className: 'bg-secondary flex items-center justify-center relative', style: { aspectRatio: '16/9', borderBottom: '1px solid var(--border)' } }, [
                icon('video', 32, 'text-muted'),
                h('span', { className: 'absolute bottom-2 right-2 badge badge-secondary text-xs', style: { fontSize: '0.55rem' } }, refItem.platform)
            ]),
            h('div', { className: 'p-3 flex-column gap-1' }, [
                h('div', { className: 'font-bold text-xs text-primary truncate' }, refItem.title),
                h('div', { className: 'text-muted', style: { fontSize: '0.65rem' } }, `Estilo: ${refItem.style}`),
                h('a', { 
                    href: refItem.url, 
                    target: '_blank', 
                    className: 'btn btn-outline text-xs mt-2 justify-center w-full',
                    style: { padding: '4px', textDecoration: 'none' } 
                }, [icon('external-link', 12), h('span', { className: 'ml-1' }, 'Abrir Inspiración')])
            ])
        ]))
    );

    return h('div', { className: 'fade-in flex-column gap-4' }, [header, grid]);
};
