/**
 * References Page - Creative Production OS
 * Notion Light UI presenting curated visual and conceptual reference links for video editing inspiration.
 */
import { h, icon } from '../utils/dom.js';

let localRefsCache = [
    { 
        title: 'Edición Dinámica estilo Alex H.', 
        style: 'Retention Editor / Subtítulos Dinámicos', 
        url: 'https://www.youtube.com', 
        platform: 'YouTube',
        cover: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&q=80' // Beautiful abstract 3D
    },
    { 
        title: 'Color Grading Cinemático B2B', 
        style: 'Moody / Minimalist Light', 
        url: 'https://vimeo.com', 
        platform: 'Vimeo',
        cover: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&q=80' // Cinema projector
    },
    { 
        title: 'Ritmo de Montaje Rápido en Reels', 
        style: 'Corte por Compás Musical', 
        url: 'https://www.instagram.com', 
        platform: 'Instagram',
        cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80' // Microphone/music
    }
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
                        const urlVal = prompt("Ingresa la URL de la referencia:", "https://youtube.com");
                        const coverVal = prompt("Ingresa la URL de imagen de portada (Opcional - dejar vacío para portada automática):") || '';
                        
                        localRefsCache.push({ 
                            title: titleVal, 
                            style: styleVal || 'General', 
                            url: urlVal || 'https://youtube.com', 
                            platform: urlVal?.toLowerCase().includes('instagram') ? 'Instagram' : (urlVal?.toLowerCase().includes('vimeo') ? 'Vimeo' : 'YouTube'), 
                            cover: coverVal.trim() || 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=400&q=80'
                        });
                        
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

    const grid = h('div', { className: 'grid gap-4', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' } }, 
        localRefsCache.map((refItem, idx) => h('div', { key: idx, className: 'card flex-column justify-between p-0 overflow-hidden hover-border transition' }, [
            h('div', { 
                className: 'flex items-center justify-center relative overflow-hidden', 
                style: { 
                    aspectRatio: '16/9', 
                    borderBottom: '1px solid var(--border)',
                    backgroundImage: `url(${refItem.cover || 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=400&q=80'})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                } 
            }, [
                // Dark glassmorphic overlay for visual excellence
                h('div', { 
                    style: { 
                        position: 'absolute', 
                        inset: 0, 
                        background: 'linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.65))' 
                    } 
                }),
                h('span', { 
                    className: 'absolute top-2 left-2 badge badge-info text-xs flex items-center gap-1',
                    style: { fontSize: '0.6rem', background: 'rgba(59, 130, 246, 0.85)', backdropFilter: 'blur(4px)', color: 'white', border: 'none' }
                }, [
                    icon(refItem.platform === 'YouTube' ? 'youtube' : (refItem.platform === 'Instagram' ? 'instagram' : 'video'), 10),
                    h('span', {}, refItem.platform)
                ])
            ]),
            h('div', { className: 'p-4 flex-column gap-1' }, [
                h('div', { className: 'font-bold text-xs text-primary truncate' }, refItem.title),
                h('div', { className: 'text-muted', style: { fontSize: '0.65rem' } }, `Estilo: ${refItem.style}`),
                h('div', { className: 'flex gap-2 mt-3' }, [
                    h('a', { 
                        href: refItem.url, 
                        target: '_blank', 
                        className: 'btn btn-primary text-xs flex items-center justify-center gap-1',
                        style: { flex: 1, padding: '6px', textDecoration: 'none' } 
                    }, [icon('external-link', 12), h('span', {}, 'Ver Video')]),
                    h('button', {
                        className: 'btn btn-outline text-error',
                        style: { padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
                        title: 'Eliminar Referencia',
                        onClick: () => {
                            if (confirm('¿Eliminar esta referencia?')) {
                                localRefsCache.splice(idx, 1);
                                const view = document.getElementById('router-view');
                                if (view) {
                                    view.innerHTML = '';
                                    view.appendChild(render());
                                    if (window.lucide) window.lucide.createIcons();
                                }
                            }
                        }
                    }, [icon('trash-2', 12)])
                ])
            ])
        ]))
    );

    return h('div', { className: 'fade-in flex-column gap-4' }, [header, grid]);
};
