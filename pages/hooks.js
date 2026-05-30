/**
 * Hooks Page - Creative Production OS
 * Notion Light UI presenting video retention hooks and operational psychology guidelines.
 */
import { h, icon } from '../utils/dom.js';
import { Table } from '../components/ui/Table.js';
import { dbService } from '../firebase/service.js';
import { store } from '../js/store.js';

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

        if (hooksList.length === 0) {
            const emptyState = h('div', { className: 'text-center p-20 card flex-column items-center justify-center gap-4' }, [
                icon('zap', 40, 'text-muted mb-2'),
                h('h3', { className: 'text-md font-bold' }, 'Biblioteca de Hooks Vacía'),
                h('p', { className: 'text-xs text-muted max-w-xs' }, 'No has registrado ningún hook o gancho de retención en tu base de datos actualmente.'),
                isAdmin ? h('button', { 
                    className: 'btn btn-primary text-xs mt-2',
                    onClick: () => openCreateHookModal() 
                }, [icon('plus', 14), h('span', {}, 'Crear Primer Hook')]) : null
            ]);
            container.appendChild(header);
            container.appendChild(emptyState);
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        // Table
        const hooksTable = Table({
            headers: ['Categoría', 'Patrón de Hook / Gancho', 'Psicología Aplicada', 'Ejemplos / Refs', 'Acción'],
            data: hooksList,
            renderRow: (hk) => h('tr', { key: hk.id || hk.title }, [
                h('td', {}, h('span', { className: 'badge badge-secondary text-xs font-semibold' }, hk.category || 'General')),
                h('td', { className: 'font-bold text-xs text-primary' }, `"${hk.title}"`),
                h('td', { className: 'text-xs text-muted leading-normal', style: { maxWidth: '250px' } }, hk.psychology || hk.description),
                h('td', {}, [
                    h('div', { className: 'flex-column gap-1' }, 
                        (!hk.examples || !hk.examples.length) ? [h('span', { className: 'text-xs text-muted italic' }, 'Sin ejemplos')] :
                        hk.examples.map(ex => h('div', { className: 'flex-column mb-1', style: { gap: '2px' } }, [
                            h('a', { 
                                href: ex.url, 
                                target: '_blank', 
                                className: 'text-xs text-info no-underline hover-underline flex items-center gap-1' 
                            }, [icon('external-link', 10), h('span', {}, ex.label || 'Ver Video')]),
                            ex.stats ? h('span', { className: 'text-[10px] text-success font-semibold flex items-center gap-1 mt-1' }, [icon('trending-up', 10), h('span', {}, ex.stats)]) : null
                        ]))
                    ),
                    isAdmin ? h('button', { 
                        className: 'text-xs text-accent mt-2 font-bold',
                        onClick: () => openEditExamplesModal(hk)
                    }, '+ Gestionar') : null
                ]),
                h('td', {}, [
                    h('div', { className: 'flex gap-2' }, [
                        h('button', { 
                            className: 'btn-icon', 
                            title: 'Copiar Hook',
                            onClick: () => {
                                if (navigator.clipboard) {
                                    navigator.clipboard.writeText(hk.title);
                                    alert("¡Hook copiado al portapapeles!");
                                } else {
                                    alert("Copiado: " + hk.title);
                                }
                            }
                        }, [icon('copy', 14)]),
                        isAdmin ? h('button', { 
                            className: 'btn-icon text-error',
                            onClick: async () => {
                                if(confirm("¿Eliminar hook?")) {
                                    await dbService.delete('hooks', hk.id || hk.title);
                                    loadHooks();
                                }
                            }
                        }, [icon('trash-2', 14)]) : null
                    ])
                ])
            ])
        });

        // Tip container
        const tipBox = h('div', { className: 'p-4 bg-tertiary border-radius-md text-xs text-secondary mt-2 flex-column gap-1', style: { border: '1px solid var(--border)', borderRadius: '6px' } }, [
            h('span', { className: 'font-bold text-primary flex items-center gap-1' }, [icon('lightbulb', 14, 'text-warning'), h('span', {}, 'Directriz Operativa de Edición')]),
            h('p', { className: 'text-muted mt-1' }, 'Asegúrate de que los primeros 3 segundos en el timeline soporten visualmente el enunciado verbal del hook. Guarda una miniatura nativa o referencia en el directorio de Assets del cliente.')
        ]);

        container.appendChild(header);
        container.appendChild(h('div', { className: 'card p-0 w-full' }, [hooksTable]));
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

                document.body.removeChild(overlay);
                loadHooks();
            }
        }, [
            h('div', { className: 'modal-header' }, [
                h('span', { className: 'modal-title' }, 'Añadir Nuevo Hook Gancho'), 
                h('button', { type: 'button', onClick: () => document.body.removeChild(overlay) }, '×')
            ]),
            h('div', { className: 'modal-body flex-column gap-3' }, [
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Patrón de Hook (Enunciado verbal)'),
                    h('input', { id: 'hk-title', className: 'form-input', placeholder: 'Ej. Deja de cometer este error en...', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Categoría (Ej. Descubrimiento, Pérdida)'),
                    h('input', { id: 'hk-category', className: 'form-input', placeholder: 'Ej. Problema', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Psicología Detrás (Por qué funciona)'),
                    h('textarea', { id: 'hk-psych', className: 'form-textarea', placeholder: 'Explica por qué detiene el scroll (miedo a perder, curiosidad)...', required: true })
                ])
            ]),
            h('div', { className: 'modal-footer' }, [
                h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => document.body.removeChild(overlay) }, 'Cancelar'),
                h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, 'Crear Hook')
            ])
        ]);

        overlay.appendChild(form);
        document.body.appendChild(overlay);
    };

    const openEditExamplesModal = (hk) => {
        const overlay = h('div', { className: 'modal-overlay' });
        
        const renderModalContent = () => {
            const container = h('div', { className: 'modal-container', style: { maxWidth: '550px' } });
            
            const renderModalContentBody = () => {
                const examplesList = h('div', { className: 'flex flex-column gap-2 mt-1' });
                
                if (!hk.examples || hk.examples.length === 0) {
                    examplesList.appendChild(h('p', { className: 'text-xs text-muted italic p-2 bg-secondary border-radius-sm' }, 'Sin ejemplos de video adjuntos actualmente.'));
                } else {
                    hk.examples.forEach((ex, idx) => {
                        examplesList.appendChild(h('div', { 
                            className: 'p-3 bg-secondary rounded flex justify-between items-center border',
                            style: { border: '1px solid var(--border)', borderRadius: '4px' }
                        }, [
                            h('div', { className: 'flex-column gap-1' }, [
                                h('span', { className: 'text-xs font-semibold text-primary' }, ex.label),
                                h('a', { href: ex.url, target: '_blank', className: 'text-xs text-info hover-underline' }, ex.url),
                                ex.stats ? h('span', { className: 'text-[10px] text-success font-bold mt-1' }, `📈 ${ex.stats}`) : null
                            ]),
                            h('button', { 
                                className: 'btn-icon text-error', 
                                style: { padding: '4px' },
                                onClick: async () => {
                                    hk.examples.splice(idx, 1);
                                    try {
                                        await dbService.set('hooks', hk.id || hk.title, hk);
                                    } catch (err) {
                                        console.warn("Offline simulated edit:", err);
                                    }
                                    loadHooks();
                                    container.innerHTML = '';
                                    container.appendChild(renderModalContentBody());
                                    if (window.lucide) window.lucide.createIcons();
                                }
                            }, [icon('trash-2', 12)])
                        ]));
                    });
                }

                const addForm = h('form', {
                    onSubmit: async (e) => {
                        e.preventDefault();
                        const labelVal = addForm.querySelector('#ex-label').value.trim();
                        const urlVal = addForm.querySelector('#ex-url').value.trim();
                        const statsVal = addForm.querySelector('#ex-stats').value.trim();

                        if (!hk.examples) hk.examples = [];
                        hk.examples.push({ label: labelVal, url: urlVal, stats: statsVal });

                        try {
                            await dbService.set('hooks', hk.id || hk.title, hk);
                        } catch (err) {
                            console.warn("Offline simulated edit:", err);
                        }
                        loadHooks();
                        container.innerHTML = '';
                        container.appendChild(renderModalContentBody());
                        if (window.lucide) window.lucide.createIcons();
                    }
                }, [
                    h('div', { className: 'grid gap-2 mb-2', style: { display: 'grid', gridTemplateColumns: '1fr 1fr' } }, [
                        h('div', { className: 'form-group' }, [
                            h('label', { className: 'form-label' }, 'Etiqueta'),
                            h('input', { id: 'ex-label', className: 'form-input text-xs', placeholder: 'Referencia YouTube/TikTok', required: true })
                        ]),
                        h('div', { className: 'form-group' }, [
                            h('label', { className: 'form-label' }, 'URL del Video'),
                            h('input', { id: 'ex-url', className: 'form-input text-xs', placeholder: 'https://...', required: true })
                        ])
                    ]),
                    h('div', { className: 'form-group mb-3' }, [
                        h('label', { className: 'form-label' }, 'Resultados / Estadísticas (Opcional)'),
                        h('input', { id: 'ex-stats', className: 'form-input text-xs', placeholder: 'Ej. 1.2M Vistas, 60% Retención...' })
                    ]),
                    h('button', { type: 'submit', className: 'btn btn-primary text-xs w-full justify-center mb-2' }, [icon('plus', 12), h('span', {}, 'Añadir Nuevo Ejemplo')])
                ]);

                return h('div', { style: { display: 'contents' } }, [
                    h('div', { className: 'modal-header' }, [
                        h('span', { className: 'modal-title' }, 'Gestionar Ejemplos'),
                        h('button', { type: 'button', onClick: () => document.body.removeChild(overlay) }, '×')
                    ]),
                    h('div', { className: 'modal-body flex-column gap-2' }, [
                        h('span', { className: 'text-xs font-bold text-primary' }, 'Ejemplos Actuales:'),
                        examplesList,
                        h('span', { className: 'text-xs font-bold text-primary mt-2 border-top pt-2' }, 'Añadir Ejemplo:'),
                        addForm
                    ]),
                    h('div', { className: 'modal-footer' }, [
                        h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => document.body.removeChild(overlay) }, 'Cerrar')
                    ])
                ]);
            };

            container.appendChild(renderModalContentBody());
            return container;
        };

        overlay.appendChild(renderModalContent());
        document.body.appendChild(overlay);
        if (window.lucide) window.lucide.createIcons();
    };

    loadHooks();
    return container;
};
