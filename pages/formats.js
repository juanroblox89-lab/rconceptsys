/**
 * Formats Page - Creative Production OS
 * Notion Light UI presenting video production structures and operational objectives.
 * Updated: Supports adding and editing an example script/copy for each format.
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
                h('p', { className: 'text-xs text-muted mt-1' }, 'Estructuras narrativas estandarizadas para producción de contenido orgánico.')
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
        const grid = h('div', { className: 'grid gap-4', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' } }, 
            formatsList.map(f => h('div', { key: f.id || f.name, className: 'card interactive-card flex-column gap-3 p-5 relative' }, [
                h('div', { className: 'flex justify-between items-start' }, [
                    h('span', { className: 'badge badge-info text-xs font-bold' }, f.id || 'NUEVO'),
                    h('div', { className: 'flex items-center gap-2' }, [

                        isAdmin ? h('button', {
                            className: 'btn-icon text-accent',
                            style: { padding: '2px', width: '22px', height: '22px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
                            title: 'Editar Formato',
                            onClick: () => openCreateFormatModal(f)
                        }, [icon('edit-3', 12)]) : null,
                        isAdmin ? h('button', {
                            className: 'btn-icon text-error',
                            style: { padding: '2px', width: '22px', height: '22px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
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

                // Elegant Collapsible example script code card
                h('div', { className: 'p-3 bg-tertiary border-radius-sm mt-1 flex-column gap-1', style: { border: '1px solid var(--border)', borderRadius: '4px' } }, [
                    h('div', { className: 'text-xs font-bold text-muted uppercase tracking-wider mb-1 flex justify-between items-center', style: { fontSize: '0.65rem' } }, [
                        h('span', {}, 'Guión / Copy de Ejemplo'),
                        icon('file-text', 11, 'text-muted')
                    ]),
                    h('p', { 
                        className: 'text-xs text-secondary leading-relaxed italic font-mono', 
                        style: { whiteSpace: 'pre-wrap', maxHeight: '110px', overflowY: 'auto', margin: 0, color: 'var(--text-secondary)' } 
                    }, f.exampleScript || 'Sin guión de ejemplo registrado.')
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

    const openCreateFormatModal = (editingFormat = null) => {
        const overlay = h('div', { className: 'modal-overlay' });
        const form = h('form', { 
            className: 'modal-container', 
            onSubmit: async (e) => {
                e.preventDefault();
                const codeVal = form.querySelector('#fmt-code').value.trim();
                const nameVal = form.querySelector('#fmt-name').value.trim();
                const objVal = form.querySelector('#fmt-objective').value.trim();
                const structVal = form.querySelector('#fmt-structure').value.trim();
                const scriptVal = form.querySelector('#fmt-script').value.trim();
                const hooksVal = form.querySelector('#fmt-hooks').value.split(',').map(s=>s.trim()).filter(Boolean);

                const newFormat = {
                    id: codeVal,
                    name: nameVal,
                    objective: objVal,
                    structure: structVal,
                    exampleScript: scriptVal,
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
                h('span', { className: 'modal-title' }, editingFormat ? 'Editar Formato de Video' : 'Crear Nuevo Formato de Video'), 
                h('button', { type: 'button', onClick: () => document.body.removeChild(overlay) }, '×')
            ]),
            h('div', { className: 'modal-body flex-column gap-3' }, [
                h('div', { className: 'grid gap-3', style: { gridTemplateColumns: '1fr 2fr' } }, [
                    h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label' }, 'Código / ID'),
                        h('input', { 
                            id: 'fmt-code', 
                            className: 'form-input', 
                            placeholder: 'Ej. RC-03', 
                            required: true,
                            value: editingFormat ? editingFormat.id : '',
                            disabled: !!editingFormat,
                            style: { background: editingFormat ? 'var(--bg-tertiary)' : 'transparent' }
                        })
                    ]),
                    h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label' }, 'Nombre del Formato'),
                        h('input', { 
                            id: 'fmt-name', 
                            className: 'form-input', 
                            placeholder: 'Ej. Comparativa Directa', 
                            required: true,
                            value: editingFormat ? (editingFormat.name || editingFormat.title || '') : ''
                        })
                    ])
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Objetivo Operativo'),
                    h('textarea', { 
                        id: 'fmt-objective', 
                        className: 'form-textarea', 
                        placeholder: 'Describe el objetivo del formato...', 
                        required: true,
                        rows: 2
                    }, editingFormat ? (editingFormat.objective || editingFormat.description || '') : '')
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Secuencia de Estructura'),
                    h('input', { 
                        id: 'fmt-structure', 
                        className: 'form-input', 
                        placeholder: 'Ej. Hook Impacto > Problema > Solución > CTA', 
                        required: true,
                        value: editingFormat ? (editingFormat.structure || '') : ''
                    })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Guión de Ejemplo'),
                    h('textarea', { 
                        id: 'fmt-script', 
                        className: 'form-textarea font-mono text-xs', 
                        placeholder: 'Redacta un guión corto de ejemplo que demuestre la estructura práctica...', 
                        rows: 4
                    }, editingFormat ? (editingFormat.exampleScript || '') : '')
                ]),
                h('div', { className: 'grid gap-3', style: { gridTemplateColumns: '1fr 1fr' } }, [

                    h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label' }, 'Hooks Recomendados (Separados por coma)'),
                        h('input', { 
                            id: 'fmt-hooks', 
                            className: 'form-input', 
                            placeholder: 'Problema-Solución, Sabías que?',
                            value: editingFormat ? ((editingFormat.hooks || []).join(', ')) : ''
                        })
                    ])
                ])
            ]),
            h('div', { className: 'modal-footer' }, [
                h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => document.body.removeChild(overlay) }, 'Cancelar'),
                h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, editingFormat ? 'Guardar Cambios' : 'Crear Formato')
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
