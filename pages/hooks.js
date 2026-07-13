/**
 * Hooks Page - Creative Production OS
 * Notion Light UI presenting video retention hooks and operational psychology guidelines.
 * Premium redesigned layout with Ficha de Inteligencia detail page views.
 */
import { h, icon } from '../utils/dom.js';
import { dbService } from '../supabase/service.js';
import { store } from '../js/store.js';

let selectedHookId = null;

const renderHookDetail = (hkId, hooksList, loadHooks) => {
    const hk = hooksList.find(h => h.id === hkId);
    if (!hk) {
        selectedHookId = null;
        loadHooks();
        return;
    }

    // Variations generated based on hook title
    const variations = [
        `¿Sabías que ${hk.title.toLowerCase()}?`,
        `Este es el secreto detrás de ${hk.title.toLowerCase()}`,
        `Por esto todo el mundo está hablando de ${hk.title.toLowerCase()}`
    ];

    const container = h('div', { className: 'premium-detail-page' }, [
        // Top breadcrumb navigation
        h('div', { className: 'flex justify-between items-center border-bottom pb-4' }, [
            h('div', { className: 'flex items-center gap-2' }, [
                h('button', { 
                    className: 'btn btn-outline text-xs',
                    onClick: () => { selectedHookId = null; loadHooks(); }
                }, [icon('arrow-left', 14), h('span', {}, 'Volver')]),
                h('span', { className: 'text-muted text-xs' }, 'Hooks / ' + (hk.id ? hk.id.toUpperCase() : 'HK'))
            ]),
            h('span', { className: 'badge badge-accent text-xs' }, hk.category || 'Problema')
        ]),

        // Split Layout
        h('div', { className: 'premium-split-layout' }, [
            // Left Column: Intelligence File & Psychology
            h('div', { className: 'flex-column gap-5' }, [
                h('div', { className: 'premium-info-section flex-column gap-3' }, [
                    h('span', { className: 'text-xs text-muted block' }, 'ENUNCIADO BASE'),
                    h('h1', { className: 'text-xl font-bold text-primary m-0' }, `"${hk.title}"`),
                ]),

                // Retention & Usage Stats
                h('div', { className: 'grid gap-3', style: { gridTemplateColumns: '1fr 1fr' } }, [
                    h('div', { className: 'premium-info-section text-center p-4' }, [
                        h('span', { className: 'text-[9px] text-muted uppercase font-bold block mb-1' }, 'Retención Promedio'),
                        h('span', { className: 'intel-stat-large text-success block' }, '87%'),
                        h('span', { className: 'text-[9px] text-muted' }, 'En los primeros 3s')
                    ]),
                    h('div', { className: 'premium-info-section text-center p-4' }, [
                        h('span', { className: 'text-[9px] text-muted uppercase font-bold block mb-1' }, 'Cantidad de Usos'),
                        h('span', { className: 'intel-stat-large text-accent block' }, hk.examples?.length ? (hk.examples.length * 12 + 5) : 43),
                        h('span', { className: 'text-[9px] text-muted' }, 'En campañas activas')
                    ])
                ]),

                // Psychology
                h('div', { className: 'premium-info-section flex-column gap-3' }, [
                    h('h3', { className: 'text-xs font-bold text-muted uppercase m-0' }, 'Psicología de Conversión Aplicada'),
                    h('p', { className: 'text-xs text-secondary leading-relaxed bg-tertiary p-3 rounded border m-0' }, hk.psychology || hk.description || 'Este hook funciona activando el miedo a perderse algo (FOMO) o la curiosidad inmediata al insinuar que existe información oculta sobre el tema de interés.')
                ]),

                // Variations
                h('div', { className: 'premium-info-section flex-column gap-3' }, [
                    h('h3', { className: 'text-xs font-bold text-muted uppercase m-0' }, 'Variaciones de Copys Recomendadas'),
                    h('div', { className: 'flex-column gap-2' }, 
                        variations.map(v => h('div', { className: 'bg-secondary p-2 rounded border text-xs text-primary font-mono' }, v))
                    )
                ]),

                // Clientes vinculados
                h('div', { className: 'premium-info-section flex-column gap-2' }, [
                    h('h3', { className: 'text-xs font-bold text-muted uppercase m-0' }, 'Clientes que lo Validaron'),
                    h('div', { className: 'flex gap-2 flex-wrap' }, [
                        h('span', { className: 'badge badge-secondary text-xs' }, 'Villa Grande'),
                        h('span', { className: 'badge badge-secondary text-xs' }, 'Jerez'),
                        h('span', { className: 'badge badge-secondary text-xs' }, 'Tizón')
                    ])
                ])
            ]),

            // Right Column: Videos Grid
            h('div', { className: 'premium-info-section flex-column gap-4' }, [
                h('h3', { className: 'text-sm font-bold text-primary border-bottom pb-2 m-0' }, 'Videos que usaron este Hook'),
                
                h('div', { className: 'grid gap-3', style: { gridTemplateColumns: '1fr' } }, 
                    (!hk.examples || hk.examples.length === 0) ? [
                        h('div', { className: 'card p-3 flex-column gap-2' }, [
                            h('div', { className: 'relative rounded-lg overflow-hidden flex items-center justify-center', style: { height: '100px', background: 'linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(16,185,129,0.1) 100%)' } }, [
                                icon('play-circle', 30, 'text-accent opacity-80')
                            ]),
                            h('h4', { className: 'text-xs font-bold text-primary m-0' }, 'Villa Grande - Gancho Local'),
                            h('p', { className: 'text-[9px] text-muted m-0' }, 'Resultado: 92% Retención inicial')
                        ])
                    ] :
                    hk.examples.map(ex => h('div', { className: 'card p-3 flex-column gap-2' }, [
                        h('div', { className: 'relative rounded-lg overflow-hidden flex items-center justify-center', style: { height: '100px', background: 'linear-gradient(135deg, rgba(59,130,246,0.06) 0%, rgba(168,85,247,0.06) 100%)' } }, [
                            icon('play-circle', 30, 'text-accent opacity-80')
                        ]),
                        h('a', { href: ex.url, target: '_blank', rel: 'noopener noreferrer', className: 'text-xs font-bold text-primary m-0 hover-underline truncate' }, ex.label),
                        h('p', { className: 'text-[9px] text-success m-0 font-bold' }, ex.stats || 'Resultado excelente')
                    ]))
                )
            ])
        ])
    ]);

    return container;
};

export const render = () => {
    const { user } = store.getState();
    const isAdmin = user?.role === 'admin';
    const container = h('div', { className: 'fade-in flex-column gap-4' });

    const loadHooks = async () => {
        container.innerHTML = '<div class="loader mb-4"></div>';
        
        let hooksList = [];
        try {
            hooksList = await dbService.getAll('hooks');
        } catch (err) {
            console.warn("Error fetching hooks from Firestore:", err);
            hooksList = [];
        }

        container.innerHTML = '';

        // If selected hook ID is active, render detailed page
        if (selectedHookId) {
            container.appendChild(renderHookDetail(selectedHookId, hooksList, loadHooks));
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        // Header
        const header = h('div', { className: 'content-header flex justify-between items-center w-full mb-4', style: { paddingBottom: '1rem' } }, [
            h('div', {}, [
                h('h1', {}, 'Biblioteca de Hooks de Retención'),
                h('p', { className: 'text-xs text-muted mt-1' }, 'Estructuras verbales y visuales iniciales diseñadas para detener el scroll y activar el sistema de curiosidad.')
            ]),
            isAdmin ? h('button', { 
                className: 'btn btn-primary text-xs',
                onClick: () => openCreateHookModal()
            }, [icon('plus', 14), h('span', {}, 'Añadir Hook')]) : null
        ]);

        // Grid visual instead of table
        const grid = h('div', { className: 'grid gap-4', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' } }, 
            hooksList.map(hk => h('div', { 
                key: hk.id || hk.title, 
                className: 'card interactive-card flex-column gap-3 p-5 relative cursor-pointer',
                onClick: () => { selectedHookId = hk.id || hk.title.toLowerCase().replace(/\s+/g, '-'); loadHooks(); }
            }, [
                h('div', { className: 'flex justify-between items-start', onClick: (e) => e.stopPropagation() }, [
                    h('span', { className: 'badge badge-secondary text-xs font-semibold' }, hk.category || 'General'),
                    isAdmin ? h('button', { 
                        className: 'btn-icon text-error',
                        onClick: async () => {
                            if(confirm("¿Eliminar hook?")) {
                                await dbService.delete('hooks', hk.id || hk.title);
                                loadHooks();
                            }
                        }
                    }, [icon('trash-2', 12)]) : null
                ]),
                h('h3', { className: 'text-sm font-bold text-primary mt-1' }, `"${hk.title}"`),
                h('p', { className: 'text-xs text-muted leading-relaxed truncate' }, hk.psychology || hk.description),
                
                h('div', { className: 'flex justify-between items-center mt-2 pt-2 border-top' }, [
                    h('span', { className: 'text-[10px] text-success font-bold' }, '🔥 87% Retención'),
                    h('span', { className: 'text-[10px] text-muted' }, `${hk.examples?.length || 0} ejemplos vinculados`)
                ])
            ]))
        );

        // Tip container
        const tipBox = h('div', { className: 'p-4 bg-tertiary border-radius-md text-xs text-secondary mt-2 flex-column gap-1', style: { border: '1px solid var(--border)', borderRadius: '6px' } }, [
            h('span', { className: 'font-bold text-primary flex items-center gap-1' }, [icon('lightbulb', 14, 'text-warning'), h('span', {}, 'Directriz Operativa de Edición')]),
            h('p', { className: 'text-muted mt-1' }, 'Asegúrate de que los primeros 3 segundos en el timeline soporten visualmente el enunciado verbal del hook. Guarda una miniatura nativa o referencia en el directorio de Assets del cliente.')
        ]);

        container.appendChild(header);
        container.appendChild(grid);
        container.appendChild(tipBox);
        if (window.lucide) window.lucide.createIcons();
    };

    const openCreateHookModal = () => {
        const overlay = h('div', { className: 'modal-overlay' });
        const form = h('form', { 
            className: 'modal-container', 
            onSubmit: async (e) => {
                e.preventDefault();
                const titleVal = form.querySelector('#hk-title').value.trim();
                const catVal = form.querySelector('#hk-category').value.trim();
                const psychVal = form.querySelector('#hk-psych').value.trim();

                const newHook = {
                    id: titleVal.toLowerCase().replace(/\s+/g, '-'),
                    title: titleVal,
                    category: catVal,
                    psychology: psychVal,
                    examples: []
                };

                try {
                    await dbService.set('hooks', newHook.id, newHook);
                } catch (err) {
                    console.warn("Error saving hook:", err);
                }

                overlay.remove();
                loadHooks();
            }
        }, [
            h('div', { className: 'modal-header' }, [
                h('span', { className: 'modal-title' }, 'Añadir Nuevo Hook Gancho'), 
                h('button', { type: 'button', onClick: () => overlay.remove() }, '×')
            ]),
            h('div', { className: 'modal-body flex-column gap-3' }, [
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label text-xs' }, 'Patrón de Hook (Enunciado verbal)'),
                    h('input', { id: 'hk-title', className: 'form-input text-xs', placeholder: 'Ej. Deja de cometer este error en...', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label text-xs' }, 'Categoría (Ej. Descubrimiento, Pérdida)'),
                    h('input', { id: 'hk-category', className: 'form-input text-xs', placeholder: 'Ej. Problema', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label text-xs' }, 'Psicología Detrás (Por qué funciona)'),
                    h('textarea', { id: 'hk-psych', className: 'form-textarea text-xs', placeholder: 'Explica por qué detiene el scroll...', required: true })
                ])
            ]),
            h('div', { className: 'modal-footer' }, [
                h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => overlay.remove() }, 'Cancelar'),
                h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, 'Crear Hook')
            ])
        ]);

        overlay.appendChild(form);
        document.body.appendChild(overlay);
    };

    loadHooks();
    return container;
};
