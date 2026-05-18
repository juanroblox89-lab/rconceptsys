/**
 * Formats Page - Creative Production OS
 * Notion Light UI presenting video production structures and operational objectives.
 */
import { h, icon } from '../utils/dom.js';
import { dbService } from '../firebase/service.js';
import { store } from '../js/store.js';

export const render = () => {
    const { user } = store.getState();
    const isAdmin = user?.role === 'admin';
    const container = h('div', { className: 'fade-in flex-column gap-4' });

    const loadFormats = async () => {
        container.innerHTML = '<div class="loader mb-4"></div>';
        
        let formatsList = [];
        try {
            formatsList = await dbService.getAll('formats');
        } catch (err) {
            console.warn("Error fetching formats from Firestore:", err);
            formatsList = [];
        }

        container.innerHTML = '';

        // Header
        const header = h('div', { className: 'content-header flex justify-between items-center w-full mb-4', style: { paddingBottom: '1rem' } }, [
            h('div', {}, [
                h('h1', {}, 'Librería Operativa de Formatos de Video'),
                h('p', { className: 'text-xs text-muted mt-1' }, 'Estructuras narrativas estandarizadas para maximizar la retención y conversión en pauta o contenido orgánico.')
            ]),
            isAdmin ? h('button', { 
                className: 'btn btn-primary text-xs',
                onClick: () => openCreateFormatModal()
            }, [icon('plus', 14), h('span', {}, 'Crear Formato')]) : null
        ]);

        if (formatsList.length === 0) {
            const emptyState = h('div', { className: 'text-center p-20 card flex-column items-center justify-center gap-4' }, [
                icon('trending-up', 40, 'text-muted mb-2'),
                h('h3', { className: 'text-md font-bold' }, 'Librería de Formatos Vacía'),
                h('p', { className: 'text-xs text-muted max-w-xs' }, 'No has registrado ningún formato narrativo de video en tu base de datos actualmente.'),
                isAdmin ? h('button', { 
                    className: 'btn btn-primary text-xs mt-2',
                    onClick: () => openCreateFormatModal() 
                }, [icon('plus', 14), h('span', {}, 'Crear Primer Formato')]) : null
            ]);
            container.appendChild(header);
            container.appendChild(emptyState);
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        // Grid
        const grid = h('div', { className: 'grid gap-4', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' } }, 
            formatsList.map(f => h('div', { key: f.id || f.name, className: 'card flex-column gap-3 p-5 relative' }, [
                h('div', { className: 'flex justify-between items-start' }, [
                    h('span', { className: 'badge badge-info text-xs font-bold' }, f.id || 'NUEVO'),
                    h('div', { className: 'flex items-center gap-2' }, [
                        h('span', { className: 'text-xs text-muted font-semibold' }, f.kpis || 'Retención > 45%'),
                        isAdmin ? h('button', {
                            className: 'btn-icon text-error',
                            style: { padding: '2px', width: '20px', height: '20px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
                            title: 'Eliminar Formato',
                            onClick: async () => {
                                if (confirm('¿Eliminar este formato?')) {
                                    try {
                                        await dbService.delete('formats', f.id);
                                    } catch (err) {
                                        console.warn("Error deleting format:", err);
                                    }
                                    loadFormats();
                                }
                            }
                        }, [icon('trash-2', 12)]) : null
                    ])
                ]),
                h('h3', { className: 'text-sm font-bold text-primary mt-1' }, f.name || f.title),
                h('p', { className: 'text-xs text-muted leading-relaxed' }, f.objective || f.description),
                
                h('div', { className: 'p-3 bg-secondary border-radius-sm mt-1', style: { border: '1px solid var(--border)', borderRadius: '4px' } }, [
                    h('div', { className: 'text-xs font-bold text-muted uppercase tracking-wider mb-1', style: { fontSize: '0.65rem' } }, 'Secuencia de Estructura'),
                    h('div', { className: 'text-xs font-medium text-primary' }, f.structure || 'Intro Gancho > Desarrollo > CTA')
                ]),

                h('div', { className: 'flex-column gap-1 mt-1 pt-2 border-top' }, [
                    h('span', { className: 'text-xs font-semibold text-secondary' }, 'Hooks Relacionados:'),
                    h('div', { className: 'flex gap-1 flex-wrap mt-1' }, 
                        (f.hooks || ['Problema-Solución']).map((hk, i) => h('span', { key: i, className: 'badge badge-secondary text-xs font-normal' }, hk))
                    )
                ])
            ]))
        );

        container.appendChild(header);
        container.appendChild(grid);
        if (window.lucide) window.lucide.createIcons();
    };

    const openCreateFormatModal = () => {
        const overlay = h('div', { className: 'modal-overlay' });
        const form = h('form', { 
            className: 'modal-container', 
            onSubmit: async (e) => {
                e.preventDefault();
                const codeVal = form.querySelector('#fmt-code').value.trim();
                const nameVal = form.querySelector('#fmt-name').value.trim();
                const objVal = form.querySelector('#fmt-objective').value.trim();
                const structVal = form.querySelector('#fmt-structure').value.trim();
                const kpiVal = form.querySelector('#fmt-kpi').value.trim();
                const hooksVal = form.querySelector('#fmt-hooks').value.split(',').map(s=>s.trim()).filter(Boolean);

                const newFormat = {
                    id: codeVal,
                    name: nameVal,
                    objective: objVal,
                    structure: structVal,
                    kpis: kpiVal,
                    hooks: hooksVal.length ? hooksVal : ['Problema-Solución']
                };

                try {
                    await dbService.set('formats', codeVal, newFormat);
                } catch (err) {
                    console.warn("Error saving format:", err);
                }

                document.body.removeChild(overlay);
                loadFormats();
            }
        }, [
            h('div', { className: 'modal-header' }, [
                h('span', { className: 'modal-title' }, 'Crear Nuevo Formato de Video'), 
                h('button', { type: 'button', onClick: () => document.body.removeChild(overlay) }, '×')
            ]),
            h('div', { className: 'modal-body flex-column gap-3' }, [
                h('div', { className: 'grid gap-3', style: { gridTemplateColumns: '1fr 2fr' } }, [
                    h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label' }, 'Código / ID'),
                        h('input', { id: 'fmt-code', className: 'form-input', placeholder: 'Ej. RC-03', required: true })
                    ]),
                    h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label' }, 'Nombre del Formato'),
                        h('input', { id: 'fmt-name', className: 'form-input', placeholder: 'Ej. Comparativa Directa', required: true })
                    ])
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Objetivo Operativo'),
                    h('textarea', { id: 'fmt-objective', className: 'form-textarea', placeholder: 'Describe el objetivo del formato...', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Secuencia de Estructura'),
                    h('input', { id: 'fmt-structure', className: 'form-input', placeholder: 'Ej. Hook Impacto > Problema > Solución > CTA', required: true })
                ]),
                h('div', { className: 'grid gap-3', style: { gridTemplateColumns: '1fr 1fr' } }, [
                    h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label' }, 'KPI de Retención'),
                        h('input', { id: 'fmt-kpi', className: 'form-input', placeholder: 'Ej. Retención > 50%', required: true })
                    ]),
                    h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label' }, 'Hooks Recomendados (Separados por coma)'),
                        h('input', { id: 'fmt-hooks', className: 'form-input', placeholder: 'Problema-Solución, Sabías que?' })
                    ])
                ])
            ]),
            h('div', { className: 'modal-footer' }, [
                h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => document.body.removeChild(overlay) }, 'Cancelar'),
                h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, 'Crear Formato')
            ])
        ]);
        overlay.appendChild(form);
        document.body.appendChild(overlay);
        
        setTimeout(() => {
            if (window.lucide) window.lucide.createIcons();
        }, 50);
    };

    loadFormats();
    return container;
};
