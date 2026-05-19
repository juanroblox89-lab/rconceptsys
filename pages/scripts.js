/**
 * Scripts Page - Creative Production OS
 * Notion Light UI presenting recommended scripts grouped by client,
 * alongside active monthly production scripts (assignments).
 * Only editable by Admins.
 */
import { h, icon } from '../utils/dom.js';
import { dbService } from '../firebase/service.js';
import { store } from '../js/store.js';
import { assignmentService } from '../services/assignmentService.js';
import { userService } from '../services/userService.js';

let localScriptsCache = [];

export const render = () => {
    const { user } = store.getState();
    const isAdmin = user?.role === 'admin';
    const container = h('div', { className: 'fade-in flex-column gap-4' });

    let searchQuery = '';
    let scriptsList = [];
    let assignmentsList = [];
    let clientsList = [];
    let usersList = [];

    const loadScripts = async () => {
        container.innerHTML = '<div class="loader mb-4"></div>';
        
        try {
            const [list, assignments, clients, users] = await Promise.all([
                dbService.getAll('scripts'),
                assignmentService.getAllAssignments(),
                dbService.getAll('clients'),
                userService.getAllUsers()
            ]);
            scriptsList = list.length ? list : localScriptsCache;
            assignmentsList = assignments || [];
            clientsList = clients || [];
            if (!isAdmin && user.allowedClients) {
                clientsList = clientsList.filter(c => user.allowedClients.includes(c.id));
            }
            usersList = users || [];
        } catch (err) {
            console.warn("Error fetching scripts/assignments, using local cache:", err);
            scriptsList = localScriptsCache;
        }

        renderUI();
    };

    const renderUI = () => {
        container.innerHTML = '';

        // 1. Header
        const header = h('div', { className: 'content-header flex justify-between items-center w-full mb-4', style: { paddingBottom: '1rem' } }, [
            h('div', {}, [
                h('h1', {}, 'Control de Guiones y Producción Mensual'),
                h('p', { className: 'text-xs text-muted mt-1' }, 'Planificación de copies y guiones a trabajar este mes, agrupados por cliente.')
            ]),
            h('div', { className: 'flex gap-2' }, [
                isAdmin ? h('button', { 
                    className: 'btn btn-primary text-xs',
                    onClick: () => openScriptModal(null, { clients: clientsList }) 
                }, [icon('plus', 14), h('span', {}, 'Nuevo Guión Recomendado')]) : null
            ])
        ]);

        // 2. Search Box
        const searchInput = h('input', {
            type: 'text',
            className: 'form-input text-xs',
            placeholder: 'Buscar por cliente, título, guión o tarea...',
            value: searchQuery,
            style: { maxWidth: '320px', height: '36px' },
            onInput: (e) => {
                searchQuery = e.target.value.toLowerCase();
                applyFiltersAndRenderGrid();
            }
        });

        const controlsRow = h('div', { 
            className: 'flex justify-between items-center gap-3 mb-4 w-full flex-wrap',
            style: { padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)' }
        }, [
            h('div', { className: 'flex items-center gap-2', style: { flex: 1 } }, [
                icon('search', 14, 'text-muted'),
                searchInput
            ]),
            h('span', { className: 'text-xs text-muted font-medium' }, 'Filtrando plan de producción actual')
        ]);

        // Grouped Container Placeholder
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

        // Construct client map
        const clientMap = {};

        // 1. Group recommended scripts
        scriptsList.forEach(s => {
            const clientName = s.client || 'General';
            if (!clientMap[clientName]) {
                clientMap[clientName] = { name: clientName, recommended: [], activeMonthly: [] };
            }
            clientMap[clientName].recommended.push(s);
        });

        // 2. Group current month's active assignments
        assignmentsList.forEach(asg => {
            const dueDateVal = asg.dueDate ? new Date(asg.dueDate) : null;
            const isThisMonth = dueDateVal && dueDateVal.getFullYear() === currentYear && dueDateVal.getMonth() === currentMonth;
            
            if (isThisMonth) {
                const clientName = asg.client || 'General';
                if (!clientMap[clientName]) {
                    clientMap[clientName] = { name: clientName, recommended: [], activeMonthly: [] };
                }
                clientMap[clientName].activeMonthly.push(asg);
            }
        });

        // 3. Make sure all registered clients appear
        clientsList.forEach(c => {
            const name = c.name;
            if (name && !clientMap[name]) {
                clientMap[name] = { name, recommended: [], activeMonthly: [] };
            }
        });

        // Filter keys by search query
        const filteredClientNames = Object.keys(clientMap).filter(clientName => {
            if (!searchQuery) return true;
            
            const info = clientMap[clientName];
            const matchesClientName = clientName.toLowerCase().includes(searchQuery);
            const matchesRecommended = info.recommended.some(s => 
                (s.title || '').toLowerCase().includes(searchQuery) ||
                (s.script || '').toLowerCase().includes(searchQuery) ||
                (s.recommendations || '').toLowerCase().includes(searchQuery)
            );
            const matchesActive = info.activeMonthly.some(a => 
                (a.title || '').toLowerCase().includes(searchQuery) ||
                (a.description || '').toLowerCase().includes(searchQuery) ||
                (a.linkedScript || '').toLowerCase().includes(searchQuery)
            );
            
            return matchesClientName || matchesRecommended || matchesActive;
        });

        if (filteredClientNames.length === 0) {
            groupedContainer.appendChild(h('div', { className: 'text-center p-10 card flex-column items-center justify-center gap-3', style: { border: '1px dashed var(--border)' } }, [
                icon('file-text', 28, 'text-muted'),
                h('span', { className: 'text-xs font-bold text-muted' }, 'No se encontraron clientes ni guiones que coincidan con la búsqueda.')
            ]));
            return;
        }

        // Render each client block
        filteredClientNames.forEach(clientName => {
            const data = clientMap[clientName];
            
            const clientSection = h('div', { 
                className: 'card flex-column gap-3 p-5', 
                style: { border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-secondary)' } 
            }, [
                // Header
                h('div', { className: 'flex justify-between items-center border-bottom pb-2' }, [
                    h('div', { className: 'flex items-center gap-2' }, [
                        h('div', { className: 'glass flex items-center justify-center font-bold text-accent text-xs', style: { width: '28px', height: '28px', borderRadius: '50%' } }, clientName.slice(0,2).toUpperCase()),
                        h('h2', { className: 'text-sm font-bold text-primary', style: { margin: 0 } }, clientName),
                        h('span', { className: 'badge badge-secondary text-xs', style: { fontSize: '0.65rem' } }, `${data.recommended.length} biblioteca • ${data.activeMonthly.length} este mes`)
                    ]),
                    isAdmin ? h('button', {
                        className: 'btn btn-outline text-xs',
                        style: { padding: '4px 8px' },
                        onClick: () => openScriptModal(null, { clients: clientsList, preselectedClient: clientName })
                    }, '+ Añadir a Biblioteca') : null
                ]),

                // Columns Grid
                h('div', { 
                    className: 'grid gap-4 mt-2', 
                    style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' } 
                }, [
                    // Column 1: Biblioteca de Guiones
                    h('div', { 
                        className: 'flex-column gap-3 p-4 bg-tertiary rounded', 
                        style: { background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '6px' } 
                    }, [
                        h('h3', { className: 'text-xs font-bold text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5' }, [
                            icon('book-open', 13, 'text-accent'),
                            h('span', {}, 'Biblioteca de Guiones Recomendados')
                        ]),
                        data.recommended.length === 0 
                            ? h('div', { className: 'text-center p-6 text-xs text-muted italic' }, 'Sin guiones recomendados en biblioteca.')
                            : h('div', { className: 'flex-column gap-3' }, data.recommended.map(script => createScriptSubCard(script)))
                    ]),

                    // Column 2: Producción Activa del Mes
                    h('div', { 
                        className: 'flex-column gap-3 p-4 bg-secondary rounded', 
                        style: { border: '1px solid var(--border)', borderRadius: '6px', background: 'rgba(var(--info-rgb), 0.02)' } 
                    }, [
                        h('h3', { className: 'text-xs font-bold text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5' }, [
                            icon('film', 13, 'text-info'),
                            h('span', {}, `Trabajos en Producción (Este Mes)`)
                        ]),
                        data.activeMonthly.length === 0 
                            ? h('div', { className: 'text-center p-6 text-xs text-muted italic' }, 'Sin trabajos de producción agendados este mes.')
                            : h('div', { className: 'flex-column gap-3' }, data.activeMonthly.map(asg => createAssignmentSubCard(asg)))
                    ])
                ])
            ]);

            groupedContainer.appendChild(clientSection);
        });

        if (window.lucide) window.lucide.createIcons();
    };

    // Recommended Script card element
    const createScriptSubCard = (s) => {
        return h('div', { className: 'card p-4 flex-column gap-2 hover-border transition bg-secondary relative' }, [
            h('div', { className: 'flex justify-between items-start' }, [
                h('div', {}, [
                    h('h4', { className: 'text-xs font-bold text-accent' }, s.title || 'Guión General'),
                    h('span', { className: 'text-muted', style: { fontSize: '0.6rem' } }, `ID: ${s.id || 'SCR'}`)
                ]),
                h('div', { className: 'flex gap-1 items-center' }, [
                    h('button', { 
                        className: 'btn-icon text-muted', 
                        style: { width: '20px', height: '20px', title: 'Copiar Guión' },
                        onClick: (e) => {
                            navigator.clipboard.writeText(s.content || s.script || '');
                            const btn = e.currentTarget;
                            const originalHTML = btn.innerHTML;
                            btn.innerHTML = icon('check', 11).outerHTML;
                            setTimeout(() => { btn.innerHTML = originalHTML; }, 1500);
                        }
                    }, [icon('copy', 11)]),
                    isAdmin ? h('button', { 
                        className: 'btn-icon text-accent', 
                        style: { width: '20px', height: '20px' },
                        onClick: () => openScriptModal(s, { clients: clientsList })
                    }, [icon('edit-3', 11)]) : null,
                    isAdmin ? h('button', { 
                        className: 'btn-icon text-error', 
                        style: { width: '20px', height: '20px' },
                        onClick: () => deleteScriptFlow(s)
                    }, [icon('trash-2', 11)]) : null
                ].filter(Boolean))
            ]),

            // Copy box
            h('div', { 
                className: 'p-3 bg-tertiary rounded relative flex-column mt-1', 
                style: { border: '1px solid var(--border)', borderRadius: '4px' } 
            }, [
                h('pre', { 
                    className: 'text-xs font-mono text-secondary leading-relaxed',
                    style: { whiteSpace: 'pre-wrap', margin: 0, maxHeight: '120px', overflowY: 'auto', paddingRight: '4px' }
                }, s.content || s.script || 'Sin contenido')
            ]),

            // Recs box
            s.recommendations ? h('div', { className: 'flex gap-1.5 items-start mt-1 bg-tertiary p-2 rounded', style: { borderLeft: '3px solid var(--accent)' } }, [
                icon('info', 11, 'text-accent mt-0.5'),
                h('p', { className: 'text-xs text-muted leading-relaxed italic m-0', style: { fontSize: '0.65rem' } }, s.recommendations)
            ]) : null
        ]);
    };

    // Assignment Sub Card element
    const createAssignmentSubCard = (asg) => {
        const emp = usersList.find(u => u.uid === asg.employeeId);
        const empName = emp ? (emp.nombre || emp.email.split('@')[0]) : 'Sin asignar';
        
        const due = new Date(asg.dueDate);
        const statusClass = asg.status === 'Completado' ? 'success' : (asg.status === 'En Proceso' || asg.status === 'En Producción' ? 'info' : 'warning');

        return h('div', { className: 'card p-4 flex-column gap-2 hover-border transition bg-secondary relative' }, [
            h('div', { className: 'flex justify-between items-start flex-wrap gap-1' }, [
                h('div', { className: 'flex items-center gap-2' }, [
                    h('div', {}, [
                        h('h4', { className: 'text-xs font-bold text-primary' }, asg.title),
                        h('span', { className: `badge badge-${statusClass} mt-1 text-xs`, style: { fontSize: '0.55rem', padding: '1px 5px' } }, asg.status)
                    ]),
                    h('button', { 
                        className: 'btn-icon text-muted', 
                        style: { width: '20px', height: '20px', title: 'Copiar Tarea' },
                        onClick: (e) => {
                            navigator.clipboard.writeText(asg.linkedScript || asg.description || '');
                            const btn = e.currentTarget;
                            const originalHTML = btn.innerHTML;
                            btn.innerHTML = icon('check', 11).outerHTML;
                            setTimeout(() => { btn.innerHTML = originalHTML; }, 1500);
                        }
                    }, [icon('copy', 11)])
                ]),
                h('div', { className: 'text-right' }, [
                    h('span', { className: 'text-muted block', style: { fontSize: '0.65rem' } }, `Encargado: ${empName}`),
                    h('span', { className: 'text-muted block mt-0.5', style: { fontSize: '0.6rem' } }, `Límite: ${due.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`)
                ])
            ]),

            // Body script/copy box if linked
            (asg.linkedScript || asg.description) ? h('div', { 
                className: 'p-3 bg-tertiary rounded relative flex-column mt-1', 
                style: { border: '1px solid var(--border)', borderRadius: '4px' } 
            }, [
                h('pre', { 
                    className: 'text-xs font-mono text-secondary leading-relaxed',
                    style: { whiteSpace: 'pre-wrap', margin: 0, maxHeight: '100px', overflowY: 'auto', paddingRight: '4px' }
                }, asg.linkedScript || asg.description)
            ]) : null,

            // Linked Asset Reference link if present
            asg.linkedAsset ? h('div', { className: 'flex items-center justify-between mt-1 bg-tertiary p-2 rounded' }, [
                h('span', { className: 'text-xs text-muted font-medium', style: { fontSize: '0.65rem' } }, '🖼️ Asset Referenciado:'),
                h('a', { href: asg.linkedAsset, target: '_blank', className: 'text-xs text-info font-bold' }, 'Ver Referencia')
            ]) : null
        ]);
    };

    const openScriptModal = (editingScript = null, context = {}) => {
        const overlay = h('div', { className: 'modal-overlay' });
        
        const saveScriptFlow = async (e) => {
            e.preventDefault();
            const titleVal = form.querySelector('#sc-title').value.trim();
            const clientVal = form.querySelector('#sc-client').value;
            const scriptVal = form.querySelector('#sc-script').value.trim();
            const recVal = form.querySelector('#sc-rec').value.trim();

            const scriptId = editingScript ? editingScript.id : `SCR-${Date.now().toString().slice(-3)}`;

            const newScript = {
                id: scriptId,
                title: titleVal,
                client: clientVal,
                script: scriptVal,
                recommendations: recVal
            };

            try {
                await dbService.set('scripts', scriptId, newScript);
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
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Título del Guión'),
                    h('input', { 
                        id: 'sc-title', 
                        className: 'form-input', 
                        placeholder: 'Ej. Gancho de Curiosidad para Reels', 
                        required: true,
                        value: editingScript ? editingScript.title : ''
                    })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Cliente Asignado'),
                    h('select', { id: 'sc-client', className: 'form-select text-xs', style: { height: '38px' }, required: true }, 
                        (context.clients || []).map(c => h('option', { value: c.name, selected: editingScript?.client === c.name || c.name === context.preselectedClient }, c.name))
                    )
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Guión (Cuerpo del Copy)'),
                    h('textarea', { 
                        id: 'sc-script', 
                        className: 'form-textarea font-mono text-xs', 
                        placeholder: '[0-3s] Gancho: "..."\n[3-10s] Desarrollo: "..."\n[10-15s] CTA: "..."', 
                        required: true, 
                        rows: 7
                    }, editingScript ? editingScript.script : '')
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Recomendaciones de Grabación y Edición'),
                    h('textarea', { 
                        id: 'sc-rec', 
                        className: 'form-textarea text-xs', 
                        placeholder: 'Ej. Tomas en primer plano, efectos de sonido de impacto, ritmo dinámico...', 
                        rows: 4
                    }, editingScript ? editingScript.recommendations : '')
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
