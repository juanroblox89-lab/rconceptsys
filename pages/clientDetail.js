/**
 * Client Detail Page - Creative Production OS
 * Deep dive into client strategy, assets, and recommended scripts.
 */
import { h, icon } from '../utils/dom.js';
import { store } from '../js/store.js';
import { dbService } from '../firebase/service.js';

export const render = async (params) => {
    const { id } = params;
    const { user } = store.getState();
    const isAdmin = user?.role === 'admin';
    
    const container = h('div', { className: 'fade-in flex-column gap-6' });

    const loadClient = async () => {
        container.innerHTML = '<div class="loader"></div>';
        
        try {
            const client = await dbService.getById('clients', id);
            if (!client) throw new Error("Cliente no encontrado.");

            container.innerHTML = '';

            // Header with Back Button
            const header = h('div', { className: 'flex justify-between items-center mb-4' }, [
                h('div', { className: 'flex items-center gap-4' }, [
                    h('button', { 
                        className: 'btn-icon', 
                        onClick: () => window.location.hash = '#clients' 
                    }, [icon('arrow-left', 18)]),
                    h('div', { className: 'flex items-center gap-3' }, [
                        client.logo ? h('img', { src: client.logo, style: { width: '40px', height: '40px', borderRadius: '8px' } }) : null,
                        h('div', {}, [
                            h('h1', { className: 'text-xl font-bold' }, client.name),
                            h('span', { className: 'text-xs text-muted' }, client.businessType)
                        ])
                    ])
                ]),
                isAdmin ? h('button', { 
                    className: 'btn btn-outline text-xs',
                    onClick: () => alert("Función de edición rápida próximamente.")
                }, [icon('edit-3', 14), h('span', {}, 'Editar Estrategia')]) : null
            ]);

            // Top Summary Section
            const summaryGrid = h('div', { className: 'grid gap-6', style: { display: 'grid', gridTemplateColumns: '2fr 1fr' } }, [
                // Main Content
                h('div', { className: 'flex-column gap-6' }, [
                    // Resumen del Negocio
                    h('section', { className: 'card p-6 flex-column gap-3' }, [
                        h('div', { className: 'flex items-center gap-2 mb-1' }, [icon('briefcase', 16, 'text-accent'), h('h3', { className: 'text-sm font-bold' }, 'Resumen del Negocio')]),
                        h('p', { className: 'text-sm text-muted leading-relaxed' }, client.description || 'Sin descripción detallada.')
                    ]),

                    // Guión Recomendado (Admin Editable)
                    h('section', { className: 'card p-6 flex-column gap-3' }, [
                        h('div', { className: 'flex justify-between items-center mb-1' }, [
                            h('div', { className: 'flex items-center gap-2' }, [icon('file-text', 16, 'text-success'), h('h3', { className: 'text-sm font-bold' }, 'Guión Recomendado')]),
                            isAdmin ? h('span', { className: 'text-xs text-info font-bold cursor-pointer', onClick: () => editGuion(client) }, 'Editar') : null
                        ]),
                        h('div', { 
                            className: 'p-4 bg-secondary border-radius-sm text-sm italic text-muted leading-relaxed',
                            style: { borderLeft: '3px solid var(--bg-accent)', whiteSpace: 'pre-wrap' }
                        }, client.guionRecomendado || 'Documentar aquí las estructuras narrativas que mejor funcionan para este cliente...')
                    ]),

                    // Formatos y Hooks Efectivos
                    h('div', { className: 'grid gap-4', style: { display: 'grid', gridTemplateColumns: '1fr 1fr' } }, [
                        h('div', { className: 'card p-5' }, [
                            h('h4', { className: 'text-xs font-bold uppercase tracking-wider text-muted mb-3' }, 'Formatos Asignados'),
                            h('div', { className: 'flex gap-2 flex-wrap' }, (client.assignedFormats || []).map(f => h('span', { className: 'badge badge-info text-xs' }, f)))
                        ]),
                        h('div', { className: 'card p-5' }, [
                            h('h4', { className: 'text-xs font-bold uppercase tracking-wider text-muted mb-3' }, 'Hooks Validados'),
                            h('div', { className: 'flex gap-2 flex-wrap' }, (client.usedHooks || []).map(h => h('span', { className: 'badge badge-secondary text-xs' }, h)))
                        ])
                    ])
                ]),

                // Sidebar Info
                h('div', { className: 'flex-column gap-6' }, [
                    // Estilo Visual
                    h('section', { className: 'card p-5 flex-column gap-3' }, [
                        h('h3', { className: 'text-xs font-bold uppercase text-muted' }, 'Estilo Visual'),
                        h('div', { className: 'flex-column gap-2' }, [
                            h('div', { className: 'flex items-center gap-2' }, [h('div', { style: { width: '12px', height: '12px', borderRadius: '2px', background: '#3b82f6' } }), h('span', { className: 'text-xs' }, 'Dinámico')]),
                            h('div', { className: 'flex items-center gap-2' }, [h('div', { style: { width: '12px', height: '12px', borderRadius: '2px', background: '#10b981' } }), h('span', { className: 'text-xs' }, 'Premium/Limpio')]),
                            h('p', { className: 'text-xs text-muted mt-2 italic' }, client.visualStyle || 'Subtítulos grandes, transiciones rápidas, música trending.')
                        ])
                    ]),

                    // Videos Virales
                    h('section', { className: 'card p-5 flex-column gap-3' }, [
                        h('h3', { className: 'text-xs font-bold uppercase text-muted' }, 'Videos Virales'),
                        h('div', { className: 'flex-column gap-2' }, 
                            (!client.viralVideos || !client.viralVideos.length) ? [h('span', { className: 'text-xs text-muted' }, 'Sin videos registrados.')] :
                            client.viralVideos.map(vv => h('a', { 
                                href: vv.url, 
                                target: '_blank', 
                                className: 'flex items-center justify-between p-2 bg-secondary rounded hover-bg-tertiary transition no-underline text-inherit' 
                            }, [
                                h('span', { className: 'text-xs truncate', style: { maxWidth: '140px' } }, vv.title),
                                icon('external-link', 12, 'text-muted')
                            ]))
                        )
                    ]),

                    // Assets
                    h('section', { className: 'card p-5 flex-column gap-3' }, [
                        h('h3', { className: 'text-xs font-bold uppercase text-muted' }, 'Assets Rápidos'),
                        h('div', { className: 'flex gap-2 flex-wrap' }, 
                            (client.assets || []).map(as => h('span', { className: 'badge badge-outline text-xs' }, as.title))
                        )
                    ])
                ])
            ]);

            container.appendChild(header);
            container.appendChild(summaryGrid);

        } catch (err) {
            container.innerHTML = `<div class="p-10 text-center text-error">${err.message}</div>`;
        }
    };

    const editGuion = (client) => {
        const overlay = h('div', { className: 'modal-overlay' });
        const form = h('form', { 
            className: 'modal-container', 
            onSubmit: async (e) => {
                e.preventDefault();
                const newVal = form.querySelector('textarea').value;
                client.guionRecomendado = newVal;
                await dbService.set('clients', client.id, client);
                document.body.removeChild(overlay);
                loadClient();
            }
        }, [
            h('div', { className: 'modal-header' }, [h('span', { className: 'modal-title' }, 'Editar Guión Recomendado'), h('button', { type: 'button', onClick: () => document.body.removeChild(overlay) }, '×')]),
            h('div', { className: 'modal-body' }, [
                h('textarea', { className: 'form-textarea', style: { minHeight: '300px' }, required: true }, client.guionRecomendado || '')
            ]),
            h('div', { className: 'modal-footer' }, [
                h('button', { type: 'button', className: 'btn btn-outline', onClick: () => document.body.removeChild(overlay) }, 'Cancelar'),
                h('button', { type: 'submit', className: 'btn btn-primary' }, 'Guardar Cambios')
            ])
        ]);
        overlay.appendChild(form);
        document.body.appendChild(overlay);
    };

    loadClient();
    return container;
};
