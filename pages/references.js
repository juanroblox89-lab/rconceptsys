/**
 * References Page - Creative Production OS
 * Notion Light UI presenting curated visual and conceptual reference links for video editing inspiration.
 */
import { h, icon } from '../utils/dom.js';
import { dbService } from '../firebase/service.js';
import { store } from '../js/store.js';

export const render = () => {
    const { user } = store.getState();
    const isAdmin = user?.role === 'admin';
    const container = h('div', { className: 'fade-in flex-column gap-4' });

    const loadReferences = async () => {
        container.innerHTML = '<div class="loader mb-4"></div>';
        
        let refs = [];
        try {
            refs = await dbService.getAll('references');
        } catch (err) {
            console.error("Failed to load references from Firestore:", err);
            refs = [];
        }

        container.innerHTML = '';

        // Header
        const header = h('div', { className: 'content-header flex justify-between items-center w-full mb-4', style: { paddingBottom: '1rem' } }, [
            h('div', {}, [
                h('h1', {}, 'Biblioteca Curada de Referencias Visuales'),
                h('p', { className: 'text-xs text-muted mt-1' }, 'Estilos de edición, técnicas de retención y esquemas de gradación de color utilizados como benchmark de la agencia.')
            ]),
            h('div', { className: 'flex gap-2' }, [
                isAdmin ? h('button', { 
                    className: 'btn btn-primary text-xs',
                    onClick: () => openAddEditModal() 
                }, [icon('plus', 14), h('span', {}, 'Añadir Referencia')]) : null
            ])
        ]);

        if (refs.length === 0) {
            const emptyState = h('div', { className: 'text-center p-20 card flex-column items-center justify-center gap-4' }, [
                icon('video', 40, 'text-muted mb-2'),
                h('h3', { className: 'text-md font-bold' }, 'Biblioteca de Referencias Vacía'),
                h('p', { className: 'text-xs text-muted max-w-xs' }, 'No hay ninguna referencia visual cargada en tu base de datos actualmente.'),
                isAdmin ? h('button', { 
                    className: 'btn btn-primary text-xs mt-2',
                    onClick: () => openAddEditModal() 
                }, [icon('plus', 14), h('span', {}, 'Crear Primera Referencia')]) : null
            ]);
            container.appendChild(header);
            container.appendChild(emptyState);
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        const grid = h('div', { className: 'grid gap-4', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' } }, 
            refs.map((refItem) => h('div', { key: refItem.id, className: 'card flex-column justify-between p-0 overflow-hidden hover-border transition' }, [
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
                    h('div', { className: 'text-muted' }, [
                        h('span', { style: { fontSize: '0.65rem' } }, `Estilo: ${refItem.style || 'General'}`)
                    ]),
                    h('div', { className: 'flex gap-2 mt-3' }, [
                        h('a', { 
                            href: refItem.url, 
                            target: '_blank', 
                            className: 'btn btn-primary text-xs flex items-center justify-center gap-1',
                            style: { flex: 1, padding: '6px', textDecoration: 'none' } 
                        }, [icon('external-link', 12), h('span', {}, 'Ver Video')]),
                        
                        isAdmin ? h('button', {
                            className: 'btn btn-outline text-xs',
                            style: { padding: '6px' },
                            title: 'Editar',
                            onClick: () => openAddEditModal(refItem)
                        }, [icon('edit', 12)]) : null,

                        isAdmin ? h('button', {
                            className: 'btn btn-outline text-error',
                            style: { padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
                            title: 'Eliminar Referencia',
                            onClick: async () => {
                                if (confirm('¿Eliminar esta referencia permanentemente?')) {
                                    try {
                                        await dbService.delete('references', refItem.id);
                                        loadReferences();
                                    } catch (err) {
                                        console.error("Error deleting reference:", err);
                                    }
                                }
                            }
                        }, [icon('trash-2', 12)]) : null
                    ])
                ])
            ]))
        );

        container.appendChild(header);
        container.appendChild(grid);
        if (window.lucide) window.lucide.createIcons();
    };

    const openAddEditModal = (refItem = null) => {
        const overlay = h('div', { className: 'modal-overlay' });
        const isEdit = !!refItem;

        const form = h('form', {
            className: 'modal-container',
            onSubmit: async (e) => {
                e.preventDefault();
                const titleVal = form.querySelector('#ref-title').value.trim();
                const styleVal = form.querySelector('#ref-style').value.trim();
                const urlVal = form.querySelector('#ref-url').value.trim();
                const platformVal = form.querySelector('#ref-platform').value;
                let coverVal = form.querySelector('#ref-cover').value.trim();

                if (!coverVal) {
                    coverVal = getCoverPlaceholder(platformVal);
                }

                const id = isEdit ? refItem.id : `ref-${Date.now()}`;
                const newRef = {
                    id,
                    title: titleVal,
                    style: styleVal,
                    url: urlVal,
                    platform: platformVal,
                    cover: coverVal
                };

                try {
                    await dbService.set('references', id, newRef);
                } catch (err) {
                    console.error("Failed to save reference:", err);
                }

                document.body.removeChild(overlay);
                loadReferences();
            }
        }, [
            h('div', { className: 'modal-header' }, [
                h('span', { className: 'modal-title' }, isEdit ? 'Editar Referencia Visual' : 'Añadir Nueva Referencia'),
                h('button', { type: 'button', onClick: () => document.body.removeChild(overlay) }, '×')
            ]),
            h('div', { className: 'modal-body flex-column gap-3' }, [
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Título de la Referencia'),
                    h('input', { id: 'ref-title', className: 'form-input', placeholder: 'Ej. Edición Dinámica estilo Alex H.', value: isEdit ? refItem.title : '', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Estilo / Técnica de Retención'),
                    h('input', { id: 'ref-style', className: 'form-input', placeholder: 'Ej. Subtítulos de impacto y efectos de sonido', value: isEdit ? refItem.style : '', required: true })
                ]),
                h('div', { className: 'grid gap-3', style: { display: 'grid', gridTemplateColumns: '1fr 1fr' } }, [
                    h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label' }, 'Plataforma'),
                        h('select', { id: 'ref-platform', className: 'form-select text-xs', required: true }, [
                            h('option', { value: 'YouTube', selected: isEdit && refItem.platform === 'YouTube' }, 'YouTube'),
                            h('option', { value: 'Instagram', selected: isEdit && refItem.platform === 'Instagram' }, 'Instagram'),
                            h('option', { value: 'Vimeo', selected: isEdit && refItem.platform === 'Vimeo' }, 'Vimeo'),
                            h('option', { value: 'TikTok', selected: isEdit && refItem.platform === 'TikTok' }, 'TikTok')
                        ])
                    ]),
                    h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label' }, 'URL del Video'),
                        h('input', { id: 'ref-url', className: 'form-input text-xs', placeholder: 'https://...', value: isEdit ? refItem.url : '', required: true })
                    ])
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'URL de Imagen de Portada (Opcional)'),
                    h('input', { id: 'ref-cover', className: 'form-input text-xs', placeholder: 'https://images.unsplash.com/... (Dejar vacío para portada temática)', value: isEdit ? refItem.cover : '' })
                ])
            ]),
            h('div', { className: 'modal-footer' }, [
                h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => document.body.removeChild(overlay) }, 'Cancelar'),
                h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, isEdit ? 'Guardar Cambios' : 'Crear Referencia')
            ])
        ]);

        overlay.appendChild(form);
        document.body.appendChild(overlay);
        if (window.lucide) window.lucide.createIcons();
    };

    const getCoverPlaceholder = (platform) => {
        if (platform === 'YouTube') return 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&q=80';
        if (platform === 'Instagram') return 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80';
        return 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&q=80';
    };

    loadReferences();
    return container;
};
