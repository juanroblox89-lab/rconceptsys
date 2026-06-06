/**
 * Formats Page - Creative Production OS
 * Notion Light UI presenting video production structures and operational objectives.
 * Premium redesigned layout with documentation views, KPIs, and visual step indicators.
 */
import { h, icon } from '../utils/dom.js';
import { dbService } from '../firebase/service.js';
import { store } from '../js/store.js';

let selectedFormatId = null;

const renderFormatDetail = (fmtId, formatsList, loadFormats) => {
    const format = formatsList.find(f => f.id === fmtId);
    if (!format) {
        selectedFormatId = null;
        loadFormats();
        return;
    }

    // Split structure into steps for the visual map
    const steps = format.structure ? format.structure.split('>').map(s => s.trim()) : ["Hook", "Desarrollo", "CTA"];

    const container = h('div', { className: 'premium-detail-page' }, [
        // Top breadcrumb navigation
        h('div', { className: 'flex justify-between items-center border-bottom pb-4' }, [
            h('div', { className: 'flex items-center gap-2' }, [
                h('button', { 
                    className: 'btn btn-outline text-xs',
                    onClick: () => { selectedFormatId = null; loadFormats(); }
                }, [icon('arrow-left', 14), h('span', {}, 'Volver')]),
                h('span', { className: 'text-muted text-xs' }, 'Formatos / ' + format.id)
            ]),
            h('span', { className: 'badge badge-success text-xs' }, 'Activo')
        ]),

        // Split Layout
        h('div', { className: 'premium-split-layout' }, [
            // Left Column: Details & Step Map
            h('div', { className: 'flex-column gap-5' }, [
                h('div', { className: 'premium-info-section flex-column gap-3' }, [
                    h('h1', { className: 'text-xl font-bold text-primary m-0' }, format.name),
                    h('span', { className: 'text-xs text-muted block' }, `Objetivo: ${format.objective || 'Presentar el negocio completo.'}`)
                ]),

                // Mapa Visual Vertical
                h('div', { className: 'premium-info-section flex-column gap-3' }, [
                    h('h3', { className: 'text-xs font-bold text-muted uppercase m-0' }, 'Estructura / Mapa Visual Narrativo'),
                    h('div', { className: 'funnel-stepper-container mt-2' }, 
                        steps.flatMap((step, idx) => {
                            const stepNode = h('div', { className: 'funnel-step-card' }, [
                                h('div', { className: 'flex items-center gap-2' }, [
                                    h('span', { className: 'badge badge-secondary text-[10px] font-mono' }, `Paso ${idx + 1}`),
                                    h('span', { className: 'text-xs font-bold text-primary' }, step)
                                ]),
                                h('span', { className: 'text-[10px] text-muted' }, idx === 0 ? 'Captación inmediata' : idx === steps.length - 1 ? 'Conversión' : 'Desarrollo de valor')
                            ]);

                            if (idx < steps.length - 1) {
                                return [stepNode, h('div', { className: 'funnel-step-arrow text-center' }, [icon('arrow-down', 14)])];
                            }
                            return [stepNode];
                        })
                    )
                ]),

                // Metrics / Metadata
                h('div', { className: 'grid gap-3', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' } }, [
                    h('div', { className: 'premium-info-section text-center p-3' }, [
                        h('span', { className: 'text-[9px] text-muted uppercase font-bold block mb-1' }, 'Duración Ideal'),
                        h('span', { className: 'text-sm font-bold text-primary' }, format.duracion || '30s - 45s')
                    ]),
                    h('div', { className: 'premium-info-section text-center p-3' }, [
                        h('span', { className: 'text-[9px] text-muted uppercase font-bold block mb-1' }, 'Nivel de Dificultad'),
                        h('span', { className: 'text-sm font-bold text-warning' }, format.dificultad || 'Medio')
                    ]),
                    h('div', { className: 'premium-info-section text-center p-3' }, [
                        h('span', { className: 'text-[9px] text-muted uppercase font-bold block mb-1' }, 'KPI Histórico'),
                        h('span', { className: 'text-sm font-bold text-success' }, format.kpi || '+18.4% CTR')
                    ])
                ]),

                // Errores Comunes
                h('div', { className: 'premium-info-section flex-column gap-2' }, [
                    h('h3', { className: 'text-xs font-bold text-error uppercase m-0 flex items-center gap-2' }, [
                        icon('alert-circle', 14),
                        h('span', {}, 'Errores Comunes a Evitar')
                    ]),
                    h('ul', { className: 'text-xs text-secondary pl-4 m-0 leading-relaxed flex-column gap-1' }, [
                        h('li', {}, 'No mostrar el producto en los primeros 5 segundos.'),
                        h('li', {}, 'Hacer un recorrido comercial muy lento sin cortes rítmicos.'),
                        h('li', {}, 'Olvidar colocar subtítulos grandes en la parte central de la pantalla.')
                    ])
                ])
            ]),

            // Right Column: Ejemplos Reales
            h('div', { className: 'premium-info-section flex-column gap-4' }, [
                h('h3', { className: 'text-sm font-bold text-primary border-bottom pb-2 m-0' }, 'Ejemplos Reales & Casos de Éxito'),
                
                h('div', { className: 'flex-column gap-3 mt-2' }, [
                    h('div', { className: 'card p-3 flex-column gap-2', style: { border: '1px solid rgba(255,255,255,0.08)' } }, [
                        h('div', { className: 'relative rounded-lg overflow-hidden flex items-center justify-center', style: { height: '120px', background: 'linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(16,185,129,0.1) 100%)' } }, [
                            icon('play-circle', 36, 'text-accent opacity-80'),
                            h('span', { className: 'absolute bottom-2 right-2 badge badge-secondary text-[9px]' }, '120K Views')
                        ]),
                        h('h4', { className: 'text-xs font-bold text-primary m-0' }, 'Villa Grande - Lanzamiento Hamburguesa'),
                        h('p', { className: 'text-[10px] text-muted m-0' }, 'Resultado: ROI 4.2x en reservas')
                    ]),

                    h('div', { className: 'card p-3 flex-column gap-2', style: { border: '1px solid rgba(255,255,255,0.08)' } }, [
                        h('div', { className: 'relative rounded-lg overflow-hidden flex items-center justify-center', style: { height: '120px', background: 'linear-gradient(135deg, rgba(168,85,247,0.1) 0%, rgba(244,63,94,0.1) 100%)' } }, [
                            icon('play-circle', 36, 'text-accent opacity-80'),
                            h('span', { className: 'absolute bottom-2 right-2 badge badge-secondary text-[9px]' }, '85K Views')
                        ]),
                        h('h4', { className: 'text-xs font-bold text-primary m-0' }, 'Jerez - Promoción Cóctel de Fin de Año'),
                        h('p', { className: 'text-[10px] text-muted m-0' }, 'Resultado: Local lleno durante 3 fines de semana')
                    ])
                ]),

                // Guión / Copy de Ejemplo
                h('div', { className: 'flex-column gap-2 mt-4 pt-3 border-top' }, [
                    h('h3', { className: 'text-xs font-bold text-muted uppercase m-0' }, 'Guión / Copy de Ejemplo'),
                    h('pre', { className: 'text-xs text-secondary bg-secondary p-3 rounded border font-mono m-0', style: { whiteSpace: 'pre-wrap', maxHeight: '180px', overflowY: 'auto' } }, format.exampleScript || 'Sin guión de ejemplo registrado.')
                ])
            ])
        ])
    ]);

    return container;
};

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

        // If selected format ID is active, render detailed page
        if (selectedFormatId) {
            container.appendChild(renderFormatDetail(selectedFormatId, formatsList, loadFormats));
            if (window.lucide) window.lucide.createIcons();
            return;
        }

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
            formatsList.map(f => h('div', { 
                key: f.id || f.name, 
                className: 'card interactive-card flex-column gap-3 p-5 relative cursor-pointer',
                onClick: () => { selectedFormatId = f.id; loadFormats(); }
            }, [
                h('div', { className: 'flex justify-between items-start', onClick: (e) => e.stopPropagation() }, [
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

                // Elegant example script preview
                h('div', { className: 'p-3 bg-tertiary border-radius-sm mt-1 flex-column gap-1', style: { border: '1px solid var(--border)', borderRadius: '4px' } }, [
                    h('div', { className: 'text-xs font-bold text-muted uppercase tracking-wider mb-1 flex justify-between items-center', style: { fontSize: '0.65rem' } }, [
                        h('span', {}, 'Guión / Copy de Ejemplo'),
                        icon('file-text', 11, 'text-muted')
                    ]),
                    h('p', { 
                        className: 'text-xs text-secondary leading-relaxed italic font-mono truncate', 
                        style: { whiteSpace: 'pre-wrap', maxHeight: '40px', margin: 0, color: 'var(--text-secondary)' } 
                    }, f.exampleScript || 'Sin guión de ejemplo registrado.')
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
                        h('label', { className: 'form-label text-xs' }, 'Código / ID'),
                        h('input', { 
                            id: 'fmt-code', 
                            className: 'form-input text-xs', 
                            placeholder: 'Ej. RC-03', 
                            required: true,
                            value: editingFormat ? editingFormat.id : '',
                            disabled: !!editingFormat,
                            style: { background: editingFormat ? 'var(--bg-tertiary)' : 'transparent' }
                        })
                    ]),
                    h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label text-xs' }, 'Nombre del Formato'),
                        h('input', { 
                            id: 'fmt-name', 
                            className: 'form-input text-xs', 
                            placeholder: 'Ej. Comparativa Directa', 
                            required: true,
                            value: editingFormat ? (editingFormat.name || editingFormat.title || '') : ''
                        })
                    ])
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label text-xs' }, 'Objetivo Operativo'),
                    h('textarea', { 
                        id: 'fmt-objective', 
                        className: 'form-textarea text-xs', 
                        placeholder: 'Describe el objetivo del formato...', 
                        required: true,
                        rows: 2
                    }, editingFormat ? (editingFormat.objective || editingFormat.description || '') : '')
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label text-xs' }, 'Secuencia de Estructura'),
                    h('input', { 
                        id: 'fmt-structure', 
                        className: 'form-input text-xs', 
                        placeholder: 'Ej. Hook Impacto > Problema > Solución > CTA', 
                        required: true,
                        value: editingFormat ? (editingFormat.structure || '') : ''
                    })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label text-xs' }, 'Guión de Ejemplo'),
                    h('textarea', { 
                        id: 'fmt-script', 
                        className: 'form-textarea font-mono text-xs', 
                        placeholder: 'Redacta un guión corto de ejemplo...', 
                        rows: 4
                    }, editingFormat ? (editingFormat.exampleScript || '') : '')
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label text-xs' }, 'Hooks Recomendados (Separados por coma)'),
                    h('input', { 
                        id: 'fmt-hooks', 
                        className: 'form-input text-xs', 
                        placeholder: 'Problema-Solución, Sabías que?',
                        value: editingFormat ? ((editingFormat.hooks || []).join(', ')) : ''
                    })
                ])
            ]),
            h('div', { className: 'modal-footer' }, [
                h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => document.body.removeChild(overlay) }, 'Cancelar'),
                h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, editingFormat ? 'Guardar' : 'Crear')
            ])
        ]);
        overlay.appendChild(form);
        document.body.appendChild(overlay);
    };

    loadFormats();
    return container;
};
