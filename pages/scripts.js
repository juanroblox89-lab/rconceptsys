/**
 * Scripts Page - Creative Production OS
 * Redesigned: expandable detail view, scene directions, cross-references to formats/hooks.
 */
import { h, icon } from '../utils/dom.js';
import { dbService } from '../firebase/service.js';
import { store } from '../js/store.js';
import { assignmentService } from '../services/assignmentService.js';
import { userService } from '../services/userService.js';

export const render = () => {
    const { user } = store.getState();
    const isAdmin = user?.role === 'admin';
    const container = h('div', { className: 'fade-in flex-column gap-4' });

    let searchQuery = '';
    let scriptsList = [];
    let assignmentsList = [];
    let clientsList = [];
    let usersList = [];
    let formatsList = [];
    let hooksList = [];

    const loadScripts = async () => {
        container.innerHTML = '<div class="loader mb-4"></div>';
        try {
            const [list, assignments, clients, users, formats, hooks] = await Promise.all([
                dbService.getAll('scripts'),
                assignmentService.getAllAssignments(),
                dbService.getAll('clients'),
                userService.getAllUsers(),
                dbService.getAll('formats').catch(() => []),
                dbService.getAll('hooks').catch(() => [])
            ]);
            scriptsList = list || [];
            assignmentsList = assignments || [];
            clientsList = clients || [];
            if (!isAdmin && user.allowedClients) {
                clientsList = clientsList.filter(c => user.allowedClients.includes(c.id));
            }
            usersList = users || [];
            formatsList = formats || [];
            hooksList = hooks || [];
        } catch (err) {
            console.warn("Error fetching scripts:", err);
        }
        renderUI();
    };

    const renderUI = () => {
        container.innerHTML = '';

        const header = h('div', { className: 'content-header flex justify-between items-center w-full mb-4', style: { paddingBottom: '1rem' } }, [
            h('div', {}, [
                h('h1', {}, 'Control de Guiones y Producción Mensual'),
                h('p', { className: 'text-xs text-muted mt-1' }, 'Guiones agrupados por cliente. Toca cualquier guión para ver el detalle completo.')
            ]),
            h('div', { className: 'flex gap-2' }, [
                h('button', { 
                    className: 'btn btn-outline text-xs flex items-center gap-1 font-bold text-accent', 
                    style: { borderColor: 'var(--accent)', color: 'var(--accent)' },
                    onClick: () => {
                        localStorage.setItem('ria_prefill', 'Redacta un guion corto y persuasivo para [INSERTAR TEMA/PRODUCTO], que incluya un hook potente y un llamado a la acción claro: ');
                        window.location.hash = '#ai-assistant';
                    }
                }, [icon('sparkles', 13), h('span', {}, 'Ayuda de RIA')]),
                isAdmin ? h('button', { 
                    className: 'btn btn-primary text-xs',
                    onClick: () => openScriptModal(null, { clients: clientsList }) 
                }, [icon('plus', 14), h('span', {}, 'Nuevo Guión')]) : null
            ])
        ]);

        const searchInput = h('input', {
            type: 'text', className: 'form-input text-xs',
            placeholder: 'Buscar por cliente, título o contenido...',
            value: searchQuery, style: { maxWidth: '320px', height: '36px' },
            onInput: (e) => { searchQuery = e.target.value.toLowerCase(); applyFiltersAndRenderGrid(); }
        });

        const controlsRow = h('div', { 
            className: 'flex justify-between items-center gap-3 mb-4 w-full flex-wrap',
            style: { padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)' }
        }, [
            h('div', { className: 'flex items-center gap-2', style: { flex: 1 } }, [icon('search', 14, 'text-muted'), searchInput]),
            h('span', { className: 'text-xs text-muted font-medium' }, `${scriptsList.length} guiones en sistema`)
        ]);

        const groupedContainer = h('div', { id: 'scripts-grouped-container', className: 'flex-column gap-5 w-full' });

        container.appendChild(header);
        container.appendChild(controlsRow);
        container.appendChild(groupedContainer);
        applyFiltersAndRenderGrid();
    };

    const applyFiltersAndRenderGrid = () => {
        const groupedContainer = container.querySelector('#scripts-grouped-container');
        if (!groupedContainer) return;
        groupedContainer.innerHTML = '';

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        const clientMap = {};
        scriptsList.forEach(s => {
            const cn = s.client || 'General';
            if (!clientMap[cn]) clientMap[cn] = { name: cn, recommended: [], activeMonthly: [] };
            clientMap[cn].recommended.push(s);
        });
        assignmentsList.forEach(asg => {
            const d = asg.dueDate ? new Date(asg.dueDate) : null;
            if (d && d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
                const cn = asg.client || 'General';
                if (!clientMap[cn]) clientMap[cn] = { name: cn, recommended: [], activeMonthly: [] };
                clientMap[cn].activeMonthly.push(asg);
            }
        });
        clientsList.forEach(c => {
            if (c.name && !clientMap[c.name]) clientMap[c.name] = { name: c.name, recommended: [], activeMonthly: [] };
        });

        const filtered = Object.keys(clientMap).filter(cn => {
            if (!searchQuery) return true;
            const info = clientMap[cn];
            return cn.toLowerCase().includes(searchQuery) ||
                info.recommended.some(s => (s.title||'').toLowerCase().includes(searchQuery) || (s.content||s.script||'').toLowerCase().includes(searchQuery)) ||
                info.activeMonthly.some(a => (a.title||'').toLowerCase().includes(searchQuery));
        });

        if (filtered.length === 0) {
            groupedContainer.appendChild(h('div', { className: 'text-center p-10 card flex-column items-center justify-center gap-3', style: { border: '1px dashed var(--border)' } }, [
                icon('file-text', 28, 'text-muted'),
                h('span', { className: 'text-xs font-bold text-muted' }, 'No se encontraron guiones.')
            ]));
            return;
        }

        filtered.forEach(clientName => {
            const data = clientMap[clientName];
            const clientObj = clientsList.find(c => c.name === clientName);

            const clientSection = h('div', { 
                className: 'card flex-column gap-3 p-5', 
                style: { border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-secondary)' } 
            }, [
                h('div', { className: 'flex justify-between items-center border-bottom pb-2' }, [
                    h('div', { className: 'flex items-center gap-2' }, [
                        clientObj?.logo 
                            ? h('img', { src: clientObj.logo, style: { width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' } })
                            : h('div', { className: 'glass flex items-center justify-center font-bold text-accent text-xs', style: { width: '28px', height: '28px', borderRadius: '50%' } }, clientName.slice(0,2).toUpperCase()),
                        h('h2', { className: 'text-sm font-bold text-primary', style: { margin: 0 } }, clientName),
                        h('span', { className: 'badge badge-secondary text-xs', style: { fontSize: '0.65rem' } }, `${data.recommended.length} guiones`)
                    ]),
                    h('div', { className: 'flex gap-2' }, [
                        clientObj ? h('a', { href: `#clients/${clientObj.id}`, className: 'btn-icon text-muted', title: 'Ver cliente', style: { width: '24px', height: '24px' } }, [icon('external-link', 12)]) : null,
                        isAdmin ? h('button', { className: 'btn btn-outline text-xs', style: { padding: '4px 8px' }, onClick: () => openScriptModal(null, { clients: clientsList, preselectedClient: clientName }) }, '+ Añadir') : null
                    ].filter(Boolean))
                ]),

                h('div', { className: 'grid gap-3 mt-2', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' } },
                    data.recommended.length === 0
                        ? [h('div', { className: 'text-center p-6 text-xs text-muted italic' }, 'Sin guiones para este cliente.')]
                        : data.recommended.map(s => createScriptCard(s))
                )
            ]);
            groupedContainer.appendChild(clientSection);
        });

        if (window.lucide) window.lucide.createIcons();
    };

    // --- Script Card (redesigned) ---
    const createScriptCard = (s) => {
        const content = s.content || s.script || '';
        const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
        const fmt = formatsList.find(f => f.id === s.recommendedFormat);
        const hk = hooksList.find(h => h.id === s.recommendedHook);

        return h('div', { 
            className: 'card interactive-card p-0 flex-column bg-secondary cursor-pointer',
            style: { overflow: 'hidden' },
            onClick: (e) => { if (!e.target.closest('button')) openDetailModal(s); }
        }, [
            // Color top bar
            h('div', { style: { height: '3px', background: 'var(--accent)' } }),
            h('div', { className: 'p-4 flex-column gap-2' }, [
                // Header row
                h('div', { className: 'flex justify-between items-start' }, [
                    h('div', { className: 'flex-column gap-1', style: { flex: 1 } }, [
                        h('h4', { className: 'text-xs font-bold text-primary' }, s.title || 'Guión'),
                        h('div', { className: 'flex gap-1 flex-wrap mt-1' }, [
                            fmt ? h('span', { className: 'badge badge-info', style: { fontSize: '0.55rem', padding: '1px 5px' } }, fmt.name?.split(':')[0] || fmt.id) : null,
                            hk ? h('span', { className: 'badge badge-accent', style: { fontSize: '0.55rem', padding: '1px 5px' } }, `🎯 ${hk.title?.substring(0, 25)}...`) : null,
                            h('span', { className: 'badge badge-success', style: { fontSize: '0.55rem', padding: '1px 5px' } }, 'Biblioteca')
                        ].filter(Boolean))
                    ]),
                    h('div', { className: 'flex gap-1' }, [
                        h('button', { 
                            className: 'btn-icon text-muted', style: { width: '20px', height: '20px' },
                            onClick: async (e) => { 
                                e.stopPropagation(); 
                                try {
                                    await navigator.clipboard.writeText(content); 
                                    const b = e.currentTarget; 
                                    b.innerHTML = icon('check',11).outerHTML; 
                                    setTimeout(()=>{b.innerHTML=icon('copy',11).outerHTML;},1500); 
                                } catch (err) {
                                    alert('Error al copiar: ' + err.message);
                                }
                            }
                        }, [icon('copy', 11)]),
                        isAdmin ? h('button', { className: 'btn-icon text-accent', style: { width: '20px', height: '20px' }, onClick: (e) => { e.stopPropagation(); openScriptModal(s, { clients: clientsList }); } }, [icon('edit-3', 11)]) : null,
                        isAdmin ? h('button', { className: 'btn-icon text-error', style: { width: '20px', height: '20px' }, onClick: (e) => { e.stopPropagation(); deleteScriptFlow(s); } }, [icon('trash-2', 11)]) : null
                    ].filter(Boolean))
                ]),
                // Preview
                h('p', { className: 'text-xs text-muted leading-relaxed', style: { margin: 0 } }, preview || 'Sin contenido'),
                // Scene directions preview
                s.sceneDirections ? h('div', { className: 'flex items-center gap-1 mt-1', style: { borderTop: '1px solid var(--border)', paddingTop: '6px' } }, [
                    icon('clapperboard', 10, 'text-warning'),
                    h('span', { className: 'text-xs text-warning font-medium', style: { fontSize: '0.6rem' } }, 'Incluye puesta en escena')
                ]) : null,
                // Tap to expand hint
                h('div', { className: 'flex items-center gap-1 mt-1 justify-end' }, [
                    h('span', { className: 'text-muted', style: { fontSize: '0.55rem' } }, 'Toca para ver detalle'),
                    icon('chevron-right', 10, 'text-muted')
                ])
            ])
        ]);
    };

    // (Removed createAssignmentCard)

    // --- Detail Modal (full script view for ALL users) ---
    const openDetailModal = (s) => {
        const overlay = h('div', { className: 'modal-overlay' });
        const content = s.content || s.script || 'Sin contenido';
        const fmt = formatsList.find(f => f.id === s.recommendedFormat);
        const hk = hooksList.find(h => h.id === s.recommendedHook);

        const modal = h('div', { className: 'modal-container', style: { maxWidth: '650px', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' } }, [
            h('div', { className: 'modal-header' }, [
                h('div', { className: 'flex-column gap-1' }, [
                    h('span', { className: 'modal-title' }, s.title || 'Guión'),
                    h('span', { className: 'text-xs text-muted' }, `Cliente: ${s.client || 'General'}`)
                ]),
                h('button', { type: 'button', onClick: () => document.body.removeChild(overlay), style: { fontWeight: 'bold' } }, '×')
            ]),
            h('div', { className: 'modal-body flex-column gap-3', style: { overflowY: 'auto', flex: 1 } }, [
                // Tags
                h('div', { className: 'flex gap-2 flex-wrap' }, [
                    fmt ? h('a', { href: '#formats', className: 'badge badge-info text-xs no-underline', style: { cursor: 'pointer' } }, `📐 Formato: ${fmt.name?.split(':')[0] || fmt.id}`) : null,
                    hk ? h('a', { href: '#hooks', className: 'badge badge-accent text-xs no-underline', style: { cursor: 'pointer' } }, `🎯 Hook: ${hk.title?.substring(0, 30)}`) : null
                ].filter(Boolean)),
                // Full Script
                h('div', { className: 'flex-column gap-1' }, [
                    h('label', { className: 'text-xs font-bold text-secondary uppercase' }, 'Guión Completo'),
                    h('div', { className: 'p-4 bg-tertiary rounded', style: { border: '1px solid var(--border)', borderRadius: '6px' } }, [
                        h('pre', { className: 'text-xs font-mono text-primary leading-relaxed', style: { whiteSpace: 'pre-wrap', margin: 0 } }, content)
                    ])
                ]),
                // Scene directions
                s.sceneDirections ? h('div', { className: 'flex-column gap-1' }, [
                    h('label', { className: 'text-xs font-bold text-warning uppercase flex items-center gap-1' }, [icon('clapperboard', 12), h('span', {}, 'Puesta en Escena')]),
                    h('div', { className: 'p-4 bg-tertiary rounded', style: { border: '1px solid var(--border)', borderLeft: '3px solid var(--warning)', borderRadius: '6px' } }, [
                        h('pre', { className: 'text-xs text-secondary leading-relaxed', style: { whiteSpace: 'pre-wrap', margin: 0 } }, s.sceneDirections)
                    ])
                ]) : null,
                // Recommendations
                s.recommendations ? h('div', { className: 'flex-column gap-1' }, [
                    h('label', { className: 'text-xs font-bold text-accent uppercase' }, 'Recomendaciones de Edición'),
                    h('div', { className: 'p-3 bg-tertiary rounded', style: { borderLeft: '3px solid var(--accent)' } }, [
                        h('p', { className: 'text-xs text-muted leading-relaxed italic', style: { margin: 0 } }, s.recommendations)
                    ])
                ]) : null
            ]),
            h('div', { className: 'modal-footer flex gap-2' }, [
                h('button', { type: 'button', className: 'btn btn-outline text-xs flex items-center gap-1', onClick: async () => { 
                    try {
                        await navigator.clipboard.writeText(content); 
                        alert('¡Guión copiado!'); 
                    } catch (err) {
                        alert('Error al copiar: ' + err.message);
                    }
                } }, [icon('copy', 12), h('span', {}, 'Copiar Guión')]),
                h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => document.body.removeChild(overlay) }, 'Cerrar')
            ])
        ]);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        if (window.lucide) window.lucide.createIcons();
    };

    // --- Script Modal (create/edit with cross-reference selectors) ---
    const openScriptModal = (editingScript = null, context = {}) => {
        const overlay = h('div', { className: 'modal-overlay' });
        
        const saveScriptFlow = async (e) => {
            e.preventDefault();
            const titleVal = form.querySelector('#sc-title').value.trim();
            const clientVal = form.querySelector('#sc-client').value;
            const scriptVal = form.querySelector('#sc-script').value.trim();
            const sceneVal = form.querySelector('#sc-scene').value.trim();
            const recVal = form.querySelector('#sc-rec').value.trim();
            const fmtVal = form.querySelector('#sc-format').value;
            const hookVal = form.querySelector('#sc-hook').value;

            const scriptId = editingScript ? editingScript.id : `SCR-${crypto.randomUUID().split('-')[0]}`;
            const newScript = {
                id: scriptId, title: titleVal, client: clientVal,
                content: scriptVal, script: scriptVal,
                sceneDirections: sceneVal, recommendations: recVal,
                recommendedFormat: fmtVal || '', recommendedHook: hookVal || ''
            };

            try { 
                await dbService.set('scripts', scriptId, newScript); 
                document.body.removeChild(overlay);
                loadScripts();
            } catch (err) { 
                console.warn("Save error:", err); 
                alert("Error al guardar: " + err.message);
            }
        };

        const form = h('form', { className: 'modal-container', style: { maxWidth: '600px' }, onSubmit: saveScriptFlow }, [
            h('div', { className: 'modal-header' }, [
                h('span', { className: 'modal-title text-sm' }, editingScript ? 'Editar Guión' : 'Crear Nuevo Guión'),
                h('button', { type: 'button', onClick: () => document.body.removeChild(overlay), style: { fontWeight: 'bold' } }, '×')
            ]),
            h('div', { className: 'modal-body flex-column gap-3', style: { maxHeight: '65vh', overflowY: 'auto' } }, [
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Título del Guión'),
                    h('input', { id: 'sc-title', className: 'form-input', placeholder: 'Ej. Recorrido Apertura Restaurante', required: true, value: editingScript?.title || '' })
                ]),
                h('div', { className: 'grid gap-3', style: { display: 'grid', gridTemplateColumns: '1fr 1fr' } }, [
                    h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label' }, 'Cliente'),
                        h('select', { id: 'sc-client', className: 'form-select text-xs', style: { height: '38px' }, required: true }, 
                            (context.clients || []).map(c => h('option', { value: c.name, selected: editingScript?.client === c.name || c.name === context.preselectedClient }, c.name))
                        )
                    ]),
                    h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label flex items-center gap-1' }, [h('span', {}, 'Formato'), h('a', { href: '#formats', className: 'text-info', style: { fontSize: '0.6rem' } }, '(ver todos)')]),
                        h('select', { id: 'sc-format', className: 'form-select text-xs', style: { height: '38px' } }, [
                            h('option', { value: '' }, '— Ninguno —'),
                            ...formatsList.map(f => h('option', { value: f.id, selected: editingScript?.recommendedFormat === f.id }, f.name || f.id))
                        ])
                    ])
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label flex items-center gap-1' }, [h('span', {}, 'Hook Asociado'), h('a', { href: '#hooks', className: 'text-info', style: { fontSize: '0.6rem' } }, '(ver todos)')]),
                    h('select', { id: 'sc-hook', className: 'form-select text-xs', style: { height: '38px' } }, [
                        h('option', { value: '' }, '— Ninguno —'),
                        ...hooksList.map(hk => h('option', { value: hk.id, selected: editingScript?.recommendedHook === hk.id }, `${hk.title?.substring(0,50)}`))
                    ])
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Guión (Texto Completo)'),
                    h('textarea', { id: 'sc-script', className: 'form-textarea font-mono text-xs', placeholder: '[0-3s] Hook: "..."\n[3-15s] Desarrollo: "..."\n[15-30s] CTA: "..."', required: true, rows: 7 }, editingScript ? (editingScript.content || editingScript.script || '') : '')
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label flex items-center gap-1' }, [icon('clapperboard', 12, 'text-warning'), h('span', {}, 'Puesta en Escena (Indicaciones de Grabación)')]),
                    h('textarea', { id: 'sc-scene', className: 'form-textarea text-xs', placeholder: 'Ej:\n• [0-3s] Plano cerrado de los platos, cámara a 45°\n• [3-8s] El dueño habla a cámara diciendo el hook\n• [8-15s] Recorrido POV del local con tomas dinámicas\n• [15-20s] Mostrar clientes satisfechos, tomas espontáneas', rows: 5 }, editingScript?.sceneDirections || '')
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Notas de Edición (Opcional)'),
                    h('textarea', { id: 'sc-rec', className: 'form-textarea text-xs', placeholder: 'Ej. Subtítulos animados, SFX en cortes, música energética...', rows: 3 }, editingScript?.recommendations || '')
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
        if (!confirm(`¿Eliminar permanentemente "${s.title}"?`)) return;
        try { await dbService.delete('scripts', s.id); } catch (err) { console.warn("Delete error:", err); }
        loadScripts();
    };

    loadScripts();
    return container;
};
