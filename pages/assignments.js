/**
 * Assignments Page - Creative Production OS
 * Admin-only module to manage recordings and edits for the team.
 * Inspired by Linear and Notion for a minimalist, operational feel.
 */
import { h, icon } from '../utils/dom.js';
import { store } from '../js/store.js';
import { dbService } from '../firebase/service.js';
import { assignmentService } from '../services/assignmentService.js';
import { userService } from '../services/userService.js';

export const render = async () => {
    const { user } = store.getState();
    const isAdmin = user?.role === 'admin';
    
    const container = h('div', { className: 'fade-in flex-column gap-6' });

    const loadAndRender = async () => {
        container.innerHTML = '<div class="loader mb-4"></div>';

        try {
            // 0. Cleanup expired assignments (2 days past due)
            await assignmentService.cleanupAssignments();

            // 1. Load Data
            const [users, assignments, clients, scripts, assets] = await Promise.all([
                userService.getAllUsers(),
                assignmentService.getAllAssignments(),
                dbService.getAll('clients'),
                dbService.getAll('scripts'),
                dbService.getAll('assets')
            ]);

            const approvedUsers = users.filter(u => u.approved && u.role !== 'admin');
            let finalClients = clients || [];
            if (!isAdmin && user.allowedClients) {
                finalClients = finalClients.filter(c => user.allowedClients.includes(c.id));
            }
            
            container.innerHTML = '';

            if (!isAdmin) {
                // Regular Employee Task Management Flow
                const myAssignments = assignments.filter(a => a.employeeId === user.uid);

                // Header for Employee
                const header = h('div', { className: 'flex justify-between items-end mb-2 w-full border-bottom pb-3' }, [
                    h('div', {}, [
                        h('h1', { className: 'text-xl font-bold' }, 'Mis Tareas Asignadas'),
                        h('p', { className: 'text-xs text-muted mt-1' }, 'Listado de grabaciones y ediciones asignadas a tu cuenta.')
                    ]),
                    h('span', { className: 'badge text-xs font-mono font-bold' }, `Total: ${myAssignments.length} Tareas`)
                ]);

                // Split my assignments
                const activeMyAsgs = myAssignments.filter(a => a.status !== 'Completado');
                const completedMyAsgs = myAssignments.filter(a => a.status === 'Completado');

                // Render Task Row
                const renderEmployeeTaskRow = (asg) => {
                    const now = new Date();
                    const due = new Date(asg.dueDate);
                    const isExpired = due < now && asg.status !== 'Completado';
                    const isToday = !isExpired && due.toDateString() === now.toDateString();

                    // Status Badge styling
                    const statusClass = asg.status === 'En Proceso' || asg.status === 'En Producción' ? 'info' : 
                                        asg.status === 'Completado' ? 'success' : 'warning';

                    return h('div', { 
                        key: asg.id, 
                        className: 'card p-4 flex-column gap-3 hover-border transition w-full',
                        style: { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px' }
                    }, [
                        h('div', { className: 'flex justify-between items-start flex-wrap gap-2' }, [
                            h('div', { className: 'flex-column gap-1' }, [
                                h('div', { className: 'flex items-center gap-2 flex-wrap' }, [
                                    h('span', { className: 'badge badge-secondary text-xs font-bold' }, asg.client),
                                    h('span', { className: `badge badge-${statusClass} text-xs font-semibold` }, asg.status),
                                    isExpired ? h('span', { className: 'badge badge-urgent text-xs font-bold' }, '⚠️ ATRASADO') : null,
                                    isToday ? h('span', { className: 'badge badge-today text-xs font-bold' }, '⚡ HOY') : null,
                                ]),
                                h('h3', { className: 'text-sm font-bold text-primary mt-1' }, asg.title)
                            ]),
                            h('div', { className: 'flex items-center gap-2' }, [
                                // Action buttons
                                asg.status === 'Pendiente' ? h('button', {
                                    className: 'btn btn-outline text-xs py-1 px-3 flex items-center gap-1 font-bold',
                                    style: { color: 'var(--info)', borderColor: 'rgba(var(--info-rgb), 0.3)' },
                                    onClick: async () => {
                                        await assignmentService.saveAssignment({ ...asg, status: 'En Proceso' });
                                        loadAndRender();
                                    }
                                }, [icon('play', 12), h('span', {}, 'Empezar')]) : null,

                                (asg.status === 'Pendiente' || asg.status === 'En Proceso' || asg.status === 'En Producción') ? h('button', {
                                    className: 'btn btn-primary text-xs py-1 px-3 flex items-center gap-1 font-bold',
                                    style: { background: 'var(--success)', borderColor: 'var(--success)', color: '#fff' },
                                    onClick: async () => {
                                        await assignmentService.saveAssignment({ ...asg, status: 'Completado' });
                                        loadAndRender();
                                    }
                                }, [icon('check', 12), h('span', {}, 'Completar')]) : null,

                                asg.status === 'Completado' ? h('button', {
                                    className: 'btn btn-outline text-xs py-1 px-3 flex items-center gap-1',
                                    style: { color: 'var(--text-muted)', borderColor: 'var(--border)' },
                                    onClick: async () => {
                                        await assignmentService.saveAssignment({ ...asg, status: 'Pendiente' });
                                        loadAndRender();
                                    }
                                }, [icon('rotate-ccw', 12), h('span', {}, 'Reabrir')]) : null
                            ])
                        ]),

                        h('div', { className: 'flex-column gap-2 border-top pt-2 mt-1' }, [
                            h('div', { className: 'flex justify-between items-center text-xs text-muted flex-wrap gap-2' }, [
                                h('span', {}, [h('strong', {}, 'Tipo de Trabajo: '), asg.type]),
                                h('span', {}, [
                                    h('strong', {}, 'Fecha Límite: '), 
                                    due.toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                                ])
                            ]),
                            asg.description ? h('p', { 
                                className: 'text-xs text-secondary leading-relaxed p-3 bg-secondary rounded mt-1', 
                                style: { whiteSpace: 'pre-wrap', borderLeft: '3px solid var(--border)' } 
                            }, asg.description) : null,

                            // Linked script box
                            asg.linkedScript ? h('div', { 
                                className: 'p-3 bg-tertiary mt-2 relative flex-column gap-2', 
                                style: { border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-tertiary)' } 
                            }, [
                                h('div', { className: 'flex justify-between items-center w-full' }, [
                                    h('span', { className: 'text-xs text-accent uppercase font-bold tracking-wider', style: { fontSize: '0.6rem' } }, '📄 Guión Vinculado'),
                                    h('button', {
                                        type: 'button',
                                        className: 'btn btn-outline text-xs',
                                        style: { padding: '2px 6px', fontSize: '0.65rem' },
                                        onClick: (e) => {
                                            navigator.clipboard.writeText(asg.linkedScript);
                                            const btn = e.currentTarget;
                                            btn.innerText = '¡Copiado!';
                                            setTimeout(() => { btn.innerText = 'Copiar Guión'; }, 1500);
                                        }
                                    }, 'Copiar Guión')
                                ]),
                                h('pre', { className: 'text-xs font-mono text-secondary leading-relaxed mt-1', style: { whiteSpace: 'pre-wrap', margin: 0, maxHeight: '150px', overflowY: 'auto' } }, asg.linkedScript)
                            ]) : null,

                            // Linked asset box
                            asg.linkedAsset ? h('div', { className: 'p-2 bg-secondary mt-2 flex items-center justify-between', style: { borderRadius: '6px', border: '1px solid var(--border)' } }, [
                                h('span', { className: 'text-xs text-muted font-medium flex items-center gap-1' }, [icon('image', 12), h('span', {}, 'Asset / Referencia Vinculada')]),
                                h('a', { href: asg.linkedAsset, target: '_blank', className: 'btn btn-outline text-xs', style: { padding: '4px 8px' } }, 'Ver Referencia')
                            ]) : null
                        ])
                    ]);
                };

                const activeList = h('div', { className: 'flex-column gap-3 w-full' }, 
                    activeMyAsgs.length === 0 
                        ? [h('div', { className: 'p-8 text-center text-xs text-muted bg-secondary rounded border', style: { borderStyle: 'dashed', borderRadius: '6px' } }, '¡Felicidades! No tienes tareas activas pendientes.')]
                        : activeMyAsgs.map(renderEmployeeTaskRow)
                );

                const completedList = h('div', { className: 'flex-column gap-3 w-full' }, 
                    completedMyAsgs.length === 0 
                        ? [h('div', { className: 'p-8 text-center text-xs text-muted bg-secondary rounded border', style: { borderStyle: 'dashed', borderRadius: '6px' } }, 'No has completado tareas en este ciclo.')]
                        : completedMyAsgs.map(renderEmployeeTaskRow)
                );

                const employeeLayout = h('div', { className: 'flex-column gap-5 w-full mt-2' }, [
                    h('div', { className: 'flex-column gap-3 w-full' }, [
                        h('span', { className: 'text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-1.5' }, [
                            icon('clock', 14, 'text-warning'),
                            h('span', {}, `Tareas Pendientes / En Proceso (${activeMyAsgs.length})`)
                        ]),
                        activeList
                    ]),
                    h('div', { className: 'flex-column gap-3 w-full border-top pt-4' }, [
                        h('span', { className: 'text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-1.5' }, [
                            icon('check-circle', 14, 'text-success'),
                            h('span', {}, `Tareas Completadas (${completedMyAsgs.length})`)
                        ]),
                        completedList
                    ])
                ]);

                container.appendChild(header);
                container.appendChild(employeeLayout);
                if (window.lucide) window.lucide.createIcons();
                return;
            }

            // Header for Admin
            const header = h('div', { className: 'flex justify-between items-end mb-2' }, [
                h('div', {}, [
                    h('h1', { className: 'text-xl font-bold' }, 'Gestión de Asignaciones'),
                    h('p', { className: 'text-xs text-muted mt-1' }, 'Organiza grabaciones, ediciones y controla flujos de trabajo del equipo.')
                ]),
                h('div', { className: 'flex gap-2' }, [
                    h('button', { 
                        className: 'btn btn-primary text-xs',
                        onClick: () => openAssignmentModal(null, { users: approvedUsers, clients: finalClients, scripts: scripts || [], assets: assets || [] })
                    }, [icon('plus', 14), h('span', {}, 'Nueva Asignación')])
                ])
            ]);

            // Grid of Employee Cards
            const grid = h('div', { className: 'grid gap-4', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))' } }, 
                approvedUsers.map(emp => {
                    const empAsgs = assignments.filter(a => a.employeeId === emp.uid);
                    const pendingAsgs = empAsgs.filter(a => a.status !== 'Completado');
                    
                    return h('div', { className: 'card p-5 flex-column gap-4 hover-border transition' }, [
                        // Card Header
                        h('div', { className: 'flex items-center justify-between' }, [
                            h('div', { className: 'flex items-center gap-3' }, [
                                emp.photoURL ? h('img', { src: emp.photoURL, style: { width: '36px', height: '36px', borderRadius: '50%' } }) : 
                                h('div', { className: 'glass flex items-center justify-center', style: { width: '36px', height: '36px', borderRadius: '50%' } }, [icon('user', 16)]),
                                h('div', {}, [
                                    h('h3', { className: 'text-sm font-bold text-primary' }, emp.nombre || emp.email.split('@')[0]),
                                    h('span', { className: 'text-xs text-muted' }, `${pendingAsgs.length} asignaciones pendientes`)
                                ])
                            ]),
                            h('div', { className: 'flex gap-1' }, [
                                h('button', { className: 'btn-icon text-muted', title: 'Ver Factura Admin', onClick: () => window.location.hash = '#billing' }, [icon('credit-card', 14)]),
                                h('button', { className: 'btn-icon text-muted', title: 'Editar Asignaciones', onClick: () => openEmployeeTasksModal(emp, empAsgs, { clients: finalClients, scripts: scripts || [], assets: assets || [] }) }, [icon('more-horizontal', 14)])
                            ])
                        ]),

                        // Tasks Preview
                        h('div', { className: 'flex-column gap-2' }, 
                            pendingAsgs.length === 0 ? [h('span', { className: 'text-xs text-muted italic' }, 'Sin tareas pendientes.')] :
                            pendingAsgs.slice(0, 3).map(asg => {
                                    const now = new Date();
                                    const due = new Date(asg.dueDate);
                                    const isExpired = due < now;
                                    const isToday = !isExpired && due.toDateString() === now.toDateString();
                                    
                                    return h('div', { className: 'flex items-center justify-between p-2 bg-secondary border-radius-sm hover-bg-tertiary transition', style: { border: '1px solid var(--border)' } }, [
                                        h('div', { className: 'flex items-center gap-2 overflow-hidden' }, [
                                            h('div', { className: `badge ${isExpired ? 'badge-urgent' : (isToday ? 'badge-today' : 'badge-info')}`, style: { width: '8px', height: '8px', padding: 0, borderRadius: '50%' } }),
                                            h('span', { className: 'text-xs font-medium truncate', style: { maxWidth: '200px' } }, `${asg.client}: ${asg.title}`)
                                        ]),
                                        h('div', { className: 'flex items-center gap-2' }, [
                                            h('span', { className: `text-xs ${isExpired ? 'text-error font-bold' : 'text-muted'}` }, 
                                                isToday ? 'Hoy' : due.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
                                            ),
                                            h('button', { className: 'action-btn', style: { padding: '2px' }, onClick: () => openAssignmentModal(asg, { users: approvedUsers, clients: finalClients, scripts: scripts || [], assets: assets || [] }) }, [icon('edit-3', 10)])
                                        ])
                                    ]);
                            })
                        ),

                        // Footer Stats
                        h('div', { className: 'flex justify-between items-center mt-2' }, [
                            h('div', { className: 'flex gap-3' }, [
                                h('div', { className: 'flex items-center gap-1 text-xs text-muted', title: 'Grabaciones' }, [icon('film', 12), h('span', {}, empAsgs.filter(a => a.type === 'Grabación').length)]),
                                h('div', { className: 'flex items-center gap-1 text-xs text-muted', title: 'Ediciones' }, [icon('zap', 12), h('span', {}, empAsgs.filter(a => a.type === 'Edición').length)]),
                                h('div', { className: 'flex items-center gap-1 text-xs text-muted', title: 'Creador 360°' }, [icon('sparkles', 12), h('span', {}, empAsgs.filter(a => a.type === 'Creador 360° (Grabación + Edición)').length)])
                            ]),
                            h('button', { 
                                className: 'btn btn-outline py-1 px-3 text-xs',
                                onClick: () => openAssignmentModal(null, { users: [emp], clients: finalClients, preselectedUser: emp.uid, scripts: scripts || [], assets: assets || [] })
                            }, '+ Asignar')
                        ])
                    ]);
                })
            );

            container.appendChild(header);
            container.appendChild(grid);
            if (window.lucide) window.lucide.createIcons();

        } catch (err) {
            console.error("Assignments render failed:", err);
            container.innerHTML = `<div class="error-state text-sm p-10">${err.message.replace(/</g, "&lt;")}</div>`;
        }
    };

    const openAssignmentModal = (existing = null, context = {}) => {
        const overlay = h('div', { className: 'modal-overlay' });
        
        const submit = async (e) => {
            e.preventDefault();
            const descVal = form.querySelector('#asg-desc').value.trim();
            if (descVal.split(/\s+/).length < 5) {
                alert("La guía / descripción debe contener al menos 5 palabras para dar suficiente contexto al equipo (Ej: En la parte 'Eventos especiales' poner clip de niños).");
                return;
            }

            const formData = {
                id: existing?.id,
                employeeId: form.querySelector('#asg-emp').value,
                type: form.querySelector('#asg-type').value,
                client: form.querySelector('#asg-client').value,
                title: form.querySelector('#asg-title').value,
                description: descVal,
                dueDate: form.querySelector('#asg-due').value,
                status: existing?.status || 'Pendiente',
                createdBy: user.uid,
                linkedScript: form.querySelector('#asg-link-script').value,
                linkedAsset: form.querySelector('#asg-link-asset').value
            };

            await assignmentService.saveAssignment(formData);
            document.body.removeChild(overlay);
            loadAndRender();
        };

        const form = h('form', { className: 'modal-container', onSubmit: submit }, [
            h('div', { className: 'modal-header' }, [
                h('span', { className: 'modal-title' }, existing ? 'Editar Asignación' : 'Nueva Asignación'),
                h('button', { type: 'button', onClick: () => document.body.removeChild(overlay) }, '×')
            ]),
            h('div', { className: 'modal-body flex-column gap-3' }, [
                h('div', { className: 'grid gap-3', style: { gridTemplateColumns: '1fr 1fr' } }, [
                    h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label' }, 'Empleado'),
                        h('select', { id: 'asg-emp', className: 'form-select text-xs', required: true }, 
                            context.users.map(u => h('option', { value: u.uid, selected: u.uid === (existing?.employeeId || context.preselectedUser) }, u.nombre || u.email))
                        )
                    ]),
                    h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label' }, 'Tipo'),
                        h('select', { id: 'asg-type', className: 'form-select text-xs' }, [
                            h('option', { value: 'Grabación', selected: existing?.type === 'Grabación' }, 'Grabación'),
                            h('option', { value: 'Edición', selected: existing?.type === 'Edición' }, 'Edición'),
                            h('option', { value: 'Creador 360° (Grabación + Edición)', selected: existing?.type === 'Creador 360° (Grabación + Edición)' }, 'Creador 360° (Grabación + Edición)')
                        ])
                    ])
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Cliente'),
                    h('select', { id: 'asg-client', className: 'form-select text-xs', required: true }, 
                        context.clients.map(c => h('option', { value: c.name, selected: existing?.client === c.name }, c.name))
                    )
                ]),
                h('div', { className: 'grid gap-3', style: { display: 'grid', gridTemplateColumns: '1fr 1fr' } }, [
                    h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label' }, 'Vincular Guión Recomendado'),
                        h('select', { 
                            id: 'asg-link-script', 
                            className: 'form-select text-xs',
                            style: { height: '38px' },
                            onChange: (e) => {
                                const val = e.target.value;
                                if (val) {
                                    const textarea = form.querySelector('#asg-desc');
                                    if (textarea) {
                                        textarea.value = (textarea.value ? textarea.value + '\n\n' : '') + val;
                                    }
                                }
                            }
                        }, [
                            h('option', { value: '' }, '-- Sin Vincular --'),
                            ...(context.scripts || []).map(s => h('option', { value: s.script, selected: existing?.linkedScript === s.script }, `[${s.client}] ${s.title || 'Sin Título'}`))
                        ])
                    ]),
                    h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label' }, 'Vincular Asset de Galería'),
                        h('select', { 
                            id: 'asg-link-asset', 
                            className: 'form-select text-xs',
                            style: { height: '38px' },
                            onChange: (e) => {
                                const val = e.target.value;
                                if (val) {
                                    const textarea = form.querySelector('#asg-desc');
                                    if (textarea) {
                                        textarea.value = (textarea.value ? textarea.value + '\n\n' : '') + `Referencia de Galería: ${val}`;
                                    }
                                }
                            }
                        }, [
                            h('option', { value: '' }, '-- Sin Vincular --'),
                            ...(context.assets || []).map(a => h('option', { value: a.url || a.thumbnail, selected: existing?.linkedAsset === (a.url || a.thumbnail) }, `[${a.client}] ${a.title}`))
                        ])
                    ])
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Título del Trabajo'),
                    h('input', { id: 'asg-title', className: 'form-input', value: existing?.title || '', placeholder: 'Ej. Edición Reel Villagrande', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Fecha Límite'),
                    h('input', { id: 'asg-due', type: 'datetime-local', className: 'form-input', value: existing?.dueDate ? existing.dueDate.slice(0, 16) : '', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label text-error font-bold' }, 'Guía / Observaciones (Obligatorio, mín. 5 palabras)'),
                    h('textarea', { id: 'asg-desc', className: 'form-textarea', placeholder: 'Detalles específicos del requerimiento...', required: true }, existing?.description || '')
                ])
            ]),
            h('div', { className: 'modal-footer' }, [
                h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => document.body.removeChild(overlay) }, 'Cancelar'),
                h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, 'Asignar Trabajo')
            ])
        ]);

        overlay.appendChild(form);
        document.body.appendChild(overlay);
    };

    const openEmployeeTasksModal = (emp, asgs, context) => {
        const overlay = h('div', { className: 'modal-overlay' });
        const listContainer = h('div', { className: 'modal-container', style: { maxWidth: '600px' } }, [
            h('div', { className: 'modal-header' }, [
                h('span', { className: 'modal-title' }, `Asignaciones: ${emp.nombre || emp.email}`),
                h('button', { type: 'button', onClick: () => document.body.removeChild(overlay) }, '×')
            ]),
            h('div', { className: 'modal-body flex-column gap-3' }, 
                asgs.length === 0 ? [h('p', { className: 'text-xs text-muted italic p-4 text-center' }, 'No hay tareas asignadas.')] :
                asgs.map(asg => h('div', { className: 'card p-3 flex justify-between items-center' }, [
                    h('div', { className: 'flex-column' }, [
                        h('span', { className: 'text-xs font-bold' }, `${asg.client}: ${asg.title}`),
                        h('span', { className: 'text-xs text-muted' }, `${asg.type} — Límite: ${new Date(asg.dueDate).toLocaleString()}`),
                        asg.linkedScript ? h('span', { className: 'text-xs text-accent font-medium mt-0.5 flex items-center gap-1', style: { fontSize: '0.65rem' } }, [icon('file-text', 10), h('span', {}, 'Guión Vinculado')]) : null,
                        asg.linkedAsset ? h('span', { className: 'text-xs text-success font-medium mt-0.5 flex items-center gap-1', style: { fontSize: '0.65rem' } }, [icon('image', 10), h('span', {}, 'Asset Vinculado')]) : null
                    ]),
                    h('div', { className: 'flex gap-2' }, [
                        h('button', { 
                            className: 'btn-icon text-muted', 
                            onClick: () => {
                                document.body.removeChild(overlay);
                                openAssignmentModal(asg, { users: [emp], clients: context.clients, scripts: context.scripts || [], assets: context.assets || [] });
                            }
                        }, [icon('edit', 14)]),
                        h('button', { 
                            className: 'btn-icon text-error', 
                            onClick: async () => {
                                if (confirm('¿Eliminar esta asignación?')) {
                                    await assignmentService.deleteAssignment(asg.id);
                                    document.body.removeChild(overlay);
                                    loadAndRender();
                                }
                            }
                        }, [icon('trash-2', 14)])
                    ])
                ]))
            ),
            h('div', { className: 'modal-footer' }, [
                h('button', { className: 'btn btn-outline text-xs', onClick: () => document.body.removeChild(overlay) }, 'Cerrar')
            ])
        ]);
        overlay.appendChild(listContainer);
        document.body.appendChild(overlay);
    };

    loadAndRender();
    return container;
};
