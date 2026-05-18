/**
 * Scripts Page - Creative Production OS
 * Notion Light UI presenting recommended scripts/copies, search filters, and copy controls.
 * Only editable by Admins.
 */
import { h, icon } from '../utils/dom.js';
import { dbService } from '../firebase/service.js';
import { store } from '../js/store.js';

let localScriptsCache = [
    { 
        id: 'SCR-001', 
        title: 'Gancho de Curiosidad - Producto Físico', 
        category: 'Ganchos', 
        script: '[0-3s] Gancho: "El mayor error al lavar tu rostro por las mañanas..."\n\n[3-10s] Desarrollo: "La mayoría usa jabón común que reseca la piel. Mira lo que pasa cuando usas este serum hidratante premium..."\n\n[10-15s] CTA: "Consigue el tuyo con 15% de descuento en el link de abajo."', 
        notes: 'Grabar tomas macro del producto y la textura del serum. Subtítulos dinámicos de color amarillo y blanco.' 
    },
    { 
        id: 'SCR-002', 
        title: 'Comparativa Directa - Marca Personal', 
        category: 'Comparativas', 
        script: '[0-3s] Gancho: "No compres un curso de edición de video sin antes saber esto..."\n\n[3-10s] Desarrollo: "La mayoría te enseña herramientas aburridas. Nosotros te enseñamos retención psicológica real y cómo cobrar $1,000 USD al mes..."\n\n[10-15s] CTA: "Haz clic abajo y regístrate a la clase gratuita."', 
        notes: 'Grabar cara a cámara con buena iluminación. Usar zoom-in/zoom-out rápidos para mantener dinamismo.' 
    },
    { 
        id: 'SCR-003', 
        title: 'POV Descriptivo - Lanzamiento de App', 
        category: 'Orgánicos', 
        script: '[0-3s] Gancho: "POV: Encontraste la app que organiza tu día en 5 minutos..."\n\n[3-10s] Desarrollo: "Ya no uso agendas aburridas. Esta app sincroniza mis tareas y me premia por completarlas..."\n\n[10-15s] CTA: "Descarga gratis con el enlace de mi perfil."', 
        notes: 'Tomas naturales de una persona usando el celular en la cama o el escritorio. Música ambiental y relajada.' 
    }
];

export const render = () => {
    const { user } = store.getState();
    const isAdmin = user?.role === 'admin';
    const container = h('div', { className: 'fade-in flex-column gap-4' });

    let activeFilter = 'Todos';
    let searchQuery = '';
    let scriptsList = [];

    const loadScripts = async () => {
        container.innerHTML = '<div class="loader mb-4"></div>';
        
        try {
            const list = await dbService.getAll('scripts');
            scriptsList = list.length ? list : localScriptsCache;
        } catch (err) {
            console.warn("Error fetching scripts, using local cache:", err);
            scriptsList = localScriptsCache;
        }

        renderUI();
    };

    const renderUI = () => {
        container.innerHTML = '';

        // 1. Header
        const header = h('div', { className: 'content-header flex justify-between items-center w-full mb-4', style: { paddingBottom: '1rem' } }, [
            h('div', {}, [
                h('h1', {}, 'Biblioteca de Guiones Recomendados'),
                h('p', { className: 'text-xs text-muted mt-1' }, 'Copies ganadores y estructuras narrativas virales validadas, listos para duplicar y adaptar.')
            ]),
            h('div', { className: 'flex gap-2' }, [
                isAdmin ? h('button', { 
                    className: 'btn btn-primary text-xs',
                    onClick: () => openScriptModal() 
                }, [icon('plus', 14), h('span', {}, 'Nuevo Guión')]) : null
            ])
        ]);

        // 2. Search & Category Filters Row
        const searchInput = h('input', {
            type: 'text',
            className: 'form-input text-xs',
            placeholder: 'Buscar por título, contenido o notas...',
            value: searchQuery,
            style: { maxWidth: '280px', height: '36px' },
            onInput: (e) => {
                searchQuery = e.target.value.toLowerCase();
                applyFiltersAndRenderGrid();
            }
        });

        const categories = ['Todos', 'Ganchos', 'Comparativas', 'Orgánicos', 'Educativos', 'Pauta'];
        const filterBar = h('div', { className: 'flex gap-1 flex-wrap' }, categories.map(cat => {
            const isActive = cat === activeFilter;
            return h('button', {
                className: `btn text-xs ${isActive ? 'btn-primary' : 'btn-outline'}`,
                style: { padding: '6px 12px', height: '36px' },
                onClick: () => {
                    activeFilter = cat;
                    applyFiltersAndRenderGrid();
                }
            }, cat);
        }));

        const controlsRow = h('div', { 
            className: 'flex justify-between items-center gap-3 mb-4 w-full flex-wrap',
            style: { padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)' }
        }, [
            h('div', { className: 'flex items-center gap-2' }, [
                icon('search', 14, 'text-muted'),
                searchInput
            ]),
            filterBar
        ]);

        // Grid Container Placeholder
        const gridContainer = h('div', { id: 'scripts-grid-container' });

        container.appendChild(header);
        container.appendChild(controlsRow);
        container.appendChild(gridContainer);

        applyFiltersAndRenderGrid();
    };

    const applyFiltersAndRenderGrid = () => {
        const gridContainer = container.querySelector('#scripts-grid-container');
        if (!gridContainer) return;

        gridContainer.innerHTML = '';

        // Filter and Search logic
        const filtered = scriptsList.filter(s => {
            const matchesCat = activeFilter === 'Todos' || s.category === activeFilter;
            const matchesSearch = !searchQuery || 
                (s.title || '').toLowerCase().includes(searchQuery) || 
                (s.script || '').toLowerCase().includes(searchQuery) ||
                (s.notes || '').toLowerCase().includes(searchQuery);
            return matchesCat && matchesSearch;
        });

        if (filtered.length === 0) {
            gridContainer.appendChild(h('div', { className: 'text-center p-10 card flex-column items-center justify-center gap-3', style: { border: '1px dashed var(--border)' } }, [
                icon('file-text', 28, 'text-muted'),
                h('span', { className: 'text-xs font-bold text-muted' }, 'No se encontraron guiones que coincidan con los filtros actuales.')
            ]));
            return;
        }

        const grid = h('div', {
            className: 'grid gap-4',
            style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }
        }, filtered.map(script => createScriptCard(script)));

        gridContainer.appendChild(grid);
        if (window.lucide) window.lucide.createIcons();
    };

    const createScriptCard = (s) => {
        return h('div', { className: 'card flex-column justify-between p-5 hover-border transition relative gap-3' }, [
            // Top Bar
            h('div', { className: 'flex justify-between items-center' }, [
                h('div', { className: 'flex items-center gap-1.5' }, [
                    h('span', { className: 'badge badge-info text-xs font-bold' }, s.id),
                    h('span', { className: 'badge badge-secondary text-xs font-normal' }, s.category || 'General')
                ]),
                isAdmin ? h('div', { className: 'flex gap-1' }, [
                    h('button', { 
                        className: 'btn-icon text-accent', 
                        style: { width: '24px', height: '24px' },
                        onClick: () => openScriptModal(s)
                    }, [icon('edit-3', 12)]),
                    h('button', { 
                        className: 'btn-icon text-error', 
                        style: { width: '24px', height: '24px' },
                        onClick: () => deleteScriptFlow(s)
                    }, [icon('trash-2', 12)])
                ]) : null
            ]),

            // Content
            h('div', { className: 'flex-column gap-1' }, [
                h('h3', { className: 'text-sm font-bold text-primary truncate' }, s.title),
                
                // Script Code Container
                h('div', { 
                    className: 'p-3 bg-secondary border-radius-sm mt-1 flex-column relative',
                    style: { border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg-tertiary)' } 
                }, [
                    h('button', {
                        className: 'btn btn-outline text-xs',
                        style: { position: 'absolute', top: '6px', right: '6px', padding: '4px 8px', fontSize: '0.65rem' },
                        onClick: (e) => {
                            navigator.clipboard.writeText(s.script);
                            const btn = e.currentTarget;
                            const origText = btn.innerHTML;
                            btn.innerHTML = '¡Copiado!';
                            btn.style.color = 'var(--success)';
                            setTimeout(() => {
                                btn.innerHTML = origText;
                                btn.style.color = '';
                            }, 1500);
                        }
                    }, [icon('copy', 10), h('span', { className: 'ml-1' }, 'Copiar')]),
                    h('span', { className: 'text-xs text-muted uppercase tracking-wider mb-2 font-bold', style: { fontSize: '0.55rem' } }, 'Cuerpo del Guión'),
                    h('pre', { 
                        className: 'text-xs font-mono text-secondary leading-relaxed',
                        style: { whiteSpace: 'pre-wrap', margin: 0, maxHeight: '180px', overflowY: 'auto', paddingRight: '2.5rem' }
                    }, s.script)
                ])
            ]),

            // Footer Tips
            s.notes ? h('div', { 
                className: 'p-3 bg-secondary flex gap-2 items-start mt-1', 
                style: { borderRadius: '4px', borderLeft: '3px solid var(--accent)' } 
            }, [
                icon('info', 13, 'text-accent mt-0.5'),
                h('p', { className: 'text-xs text-muted leading-relaxed italic m-0', style: { fontSize: '0.7rem' } }, s.notes)
            ]) : null
        ]);
    };

    const openScriptModal = (editingScript = null) => {
        const overlay = h('div', { className: 'modal-overlay' });
        
        const saveScriptFlow = async (e) => {
            e.preventDefault();
            const idVal = form.querySelector('#sc-id').value.trim();
            const titleVal = form.querySelector('#sc-title').value.trim();
            const catVal = form.querySelector('#sc-cat').value;
            const scriptVal = form.querySelector('#sc-script').value.trim();
            const notesVal = form.querySelector('#sc-notes').value.trim();

            const newScript = {
                id: idVal,
                title: titleVal,
                category: catVal,
                script: scriptVal,
                notes: notesVal
            };

            try {
                await dbService.set('scripts', idVal, newScript);
            } catch (err) {
                console.warn("Failed to write to Firestore, applying to local cache:", err);
            }

            if (editingScript) {
                localScriptsCache = localScriptsCache.map(sc => sc.id === editingScript.id ? newScript : sc);
            } else {
                localScriptsCache.push(newScript);
            }

            document.body.removeChild(overlay);
            loadScripts();
        };

        const form = h('form', { className: 'modal-container', onSubmit: saveScriptFlow }, [
            h('div', { className: 'modal-header' }, [
                h('span', { className: 'modal-title text-sm' }, editingScript ? 'Editar Guión Recomendado' : 'Crear Nuevo Guión Recomendado'),
                h('button', { type: 'button', onClick: () => document.body.removeChild(overlay), style: { fontWeight: 'bold' } }, '×')
            ]),
            h('div', { className: 'modal-body flex-column gap-3' }, [
                h('div', { className: 'grid gap-3', style: { display: 'grid', gridTemplateColumns: '1fr 1fr' } }, [
                    h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label' }, 'Código / ID'),
                        h('input', { 
                            id: 'sc-id', 
                            className: 'form-input', 
                            placeholder: 'Ej. SCR-004', 
                            required: true,
                            value: editingScript ? editingScript.id : `SCR-${Date.now().toString().slice(-3)}`,
                            disabled: !!editingScript
                        })
                    ]),
                    h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label' }, 'Categoría'),
                        h('select', { id: 'sc-cat', className: 'form-input', style: { height: '38px' } }, [
                            'Ganchos', 'Comparativas', 'Orgánicos', 'Educativos', 'Pauta'
                        ].map(cat => h('option', { value: cat, selected: editingScript?.category === cat }, cat)))
                    ])
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Título descriptivo'),
                    h('input', { 
                        id: 'sc-title', 
                        className: 'form-input', 
                        placeholder: 'Ej. Gancho de Retención para Infoproductos', 
                        required: true,
                        value: editingScript ? editingScript.title : ''
                    })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Estructura / Cuerpo del Guión'),
                    h('textarea', { 
                        id: 'sc-script', 
                        className: 'form-textarea font-mono text-xs', 
                        placeholder: '[0-3s] Gancho: "..."\n[3-10s] Desarrollo: "..."\n[10-15s] CTA: "..."', 
                        required: true, 
                        rows: 6
                    }, editingScript ? editingScript.script : '')
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Consejos de Edición o Grabación'),
                    h('textarea', { 
                        id: 'sc-notes', 
                        className: 'form-textarea text-xs', 
                        placeholder: 'Ej. Usar transiciones rápidas de zoom, incluir efectos de sonido...', 
                        rows: 3
                    }, editingScript ? editingScript.notes : '')
                ])
            ]),
            h('div', { className: 'modal-footer' }, [
                h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => document.body.removeChild(overlay) }, 'Cancelar'),
                h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, editingScript ? 'Guardar Cambios' : 'Crear y Publicar')
            ])
        ]);

        overlay.appendChild(form);
        document.body.appendChild(overlay);
        if (window.lucide) window.lucide.createIcons();
    };

    const deleteScriptFlow = async (s) => {
        if (!confirm(`¿Estás seguro de que deseas eliminar permanentemente el guión "${s.title}"?`)) return;

        try {
            await dbService.delete('scripts', s.id);
        } catch (err) {
            console.warn("Failed to delete from Firestore, updating local cache:", err);
        }

        localScriptsCache = localScriptsCache.filter(sc => sc.id !== s.id);
        loadScripts();
    };

    loadScripts();
    return container;
};
