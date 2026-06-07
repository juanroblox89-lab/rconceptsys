/**
 * Workers Page - Creative Production OS
 * Admin-only: team management with role-based views, linear-style assignments, and detailed profiles.
 */
import { h, icon } from '../utils/dom.js';
import { store } from '../js/store.js';
import { dbService } from '../firebase/service.js';
import { userService } from '../services/userService.js';
import { assignmentService } from '../services/assignmentService.js';

const ROLE_META = {
    editor: { label: 'Editor de Video', color: '#3b82f6', icon: 'scissors', invoiceType: 'Factura de Edición de Video' },
    camarógrafo: { label: 'Camarógrafo', color: '#8b5cf6', icon: 'video', invoiceType: 'Factura de Grabación de Video' },
    estratega: { label: 'Estratega Creativo', color: '#10b981', icon: 'lightbulb', invoiceType: 'Factura Estratégica' },
    diseñador: { label: 'Diseñador Gráfico', color: '#f59e0b', icon: 'pen-tool', invoiceType: 'Factura de Diseño Gráfico' },
    'administración digital': { label: 'Administración Digital', color: '#ec4899', icon: 'monitor', invoiceType: 'Factura Administrativa' },
    admin: { label: 'Administrador', color: '#ef4444', icon: 'shield', invoiceType: 'Factura Consolidada' }
};

let selectedWorkerId = null;

export const render = () => {
    const { user } = store.getState();
    const isAdmin = user?.role === 'admin';
    const container = h('div', { className: 'fade-in flex-column gap-5' });

    if (!isAdmin) {
        return h('div', { className: 'card p-8 text-center flex-column items-center gap-3', style: { marginTop: '2rem' } }, [
            icon('shield-alert', 48),
            h('h3', { style: { marginTop: '12px' } }, 'Acceso Restringido'),
            h('p', { className: 'text-xs text-muted' }, 'Esta sección es exclusiva de Administradores.')
        ]);
    }

    const load = async () => {
        container.innerHTML = '<div class="loader mb-4"></div>';
        let allUsers, assignments, clients, sops, roles;
        try {
            [allUsers, assignments, clients, sops, roles] = await Promise.all([
                userService.getAllUsers(),
                assignmentService.getAllAssignments(),
                dbService.getAll('clients').catch(() => []),
                dbService.getAll('sops').catch(() => []),
                dbService.getAll('roles').catch(() => [])
            ]);
        } catch (err) {
            console.error('Error loading workers data:', err);
            container.innerHTML = '<div class="card p-8 text-center text-danger">Error cargando los datos. Por favor, recarga la página.</div>';
            return;
        }

        const workers = allUsers.filter(u => u.approved && u.role !== 'admin');
        container.innerHTML = '';

        if (selectedWorkerId) {
            const worker = workers.find(w => (w.uid || w.id) === selectedWorkerId);
            if (worker) {
                renderWorkerDetail(container, worker, assignments, clients, sops, roles, load);
                if (window.lucide) window.lucide.createIcons();
                return;
            } else {
                selectedWorkerId = null;
            }
        }

        // Header
        container.appendChild(h('div', { className: 'content-header flex justify-between items-center w-full' }, [
            h('div', {}, [
                h('h1', {}, 'Gestión de Workers'),
                h('p', { className: 'text-xs text-muted mt-1' }, `${workers.length} trabajadores activos en el equipo`)
            ]),
            h('div', { className: 'flex gap-2' }, [
                h('button', {
                    className: 'btn btn-outline text-xs',
                    style: { borderColor: 'var(--accent)', color: 'var(--accent)' },
                    title: 'Asignar rol a usuarios perdidos',
                    onClick: async (e) => {
                        const btn = e.currentTarget;
                        if (confirm('¿Asignar rol "creador 360" a todos los usuarios sin rol reconocido?')) {
                            btn.disabled = true;
                            btn.textContent = 'Procesando...';
                            try {
                                const dbRoles = (await dbService.getAll('roles')).map(r => r.id.toLowerCase());
                                const validRoles = new Set([...Object.keys(ROLE_META).map(k=>k.toLowerCase()), ...dbRoles]);
                                let count = 0;
                                for (const u of allUsers) {
                                    if (u.role !== 'admin' && (!u.role || !validRoles.has(u.role.toLowerCase()))) {
                                        await userService.updateUser(u.id || u.uid, { role: 'creador 360' });
                                        count++;
                                    }
                                }
                                alert(`Se actualizaron ${count} usuarios a "creador 360".`);
                                load();
                            } catch (err) {
                                alert('Error al refrescar roles');
                                btn.disabled = false;
                                btn.innerHTML = '';
                                btn.appendChild(icon('refresh-cw', 13));
                                btn.appendChild(h('span', {}, ' Refrescar Roles'));
                            }
                        }
                    }
                }, [icon('refresh-cw', 13), h('span', {}, ' Refrescar Roles')]),
                h('button', {
                    className: 'btn btn-primary text-xs',
                    onClick: () => openAssignmentModal(null, { users: workers, clients, assignments, reload: load, sops })
                }, [icon('plus', 13), h('span', {}, 'Nueva Asignación')])
            ])
        ]));

        if (workers.length === 0) {
            container.appendChild(h('div', { className: 'card p-10 text-center text-xs text-muted' }, 'No hay trabajadores activos aún.'));
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        const listContainer = h('div', { className: 'flex-column gap-3 w-full' });
        workers.forEach(w => listContainer.appendChild(renderWorkerRow(w, assignments, clients, sops, roles, load)));
        container.appendChild(listContainer);
        if (window.lucide) window.lucide.createIcons();
    };

    load();
    return container;
};

// Render worker horizontal card (Linear Style)
function renderWorkerRow(w, assignments, clients, sops, roles, reload) {
    const roleDef = roles.find(r => r.id === w.role);
    const meta = {
        label: roleDef ? roleDef.label : w.role,
        color: (ROLE_META[w.role] && ROLE_META[w.role].color) ? ROLE_META[w.role].color : '#64748b',
        icon: (ROLE_META[w.role] && ROLE_META[w.role].icon) ? ROLE_META[w.role].icon : 'user',
        invoiceType: (ROLE_META[w.role] && ROLE_META[w.role].invoiceType) ? ROLE_META[w.role].invoiceType : 'Factura General'
    };
    const myAsgs = assignments.filter(a => a.employeeId === (w.uid || w.id));
    const pendingEditions = myAsgs.filter(a => a.status !== 'Completado' && a.type === 'Edición');
    const pendingRecordings = myAsgs.filter(a => a.status !== 'Completado' && a.type === 'Grabación');
    
    // Build descriptive details
    let summaryText = 'Sin tareas pendientes';
    if (pendingEditions.length > 0 || pendingRecordings.length > 0) {
        const parts = [];
        if (pendingEditions.length > 0) {
            const clientsStr = Array.from(new Set(pendingEditions.map(a => a.client))).slice(0, 2).join(', ');
            parts.push(`${pendingEditions.length} Edición${pendingEditions.length > 1 ? 'es' : ''} pendiente${pendingEditions.length > 1 ? 's' : ''} (${clientsStr})`);
        }
        if (pendingRecordings.length > 0) {
            const clientsStr = Array.from(new Set(pendingRecordings.map(a => a.client))).slice(0, 2).join(', ');
            parts.push(`${pendingRecordings.length} Grabación${pendingRecordings.length > 1 ? 'es' : ''} programada${pendingRecordings.length > 1 ? 's' : ''} (${clientsStr})`);
        }
        summaryText = parts.join(' · ');
    }

    const avatar = w.photoURL
        ? h('img', { src: w.photoURL, style: { width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0 } })
        : h('div', {
            style: {
                width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0, fontSize: '0.75rem',
                background: meta.color + '22', color: meta.color, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontWeight: 700, border: `2px solid ${meta.color}44`
            }
        }, (w.nombre || w.email || 'US').slice(0, 2).toUpperCase());

    return h('div', {
        className: 'worker-horizontal-card',
        onClick: () => { selectedWorkerId = w.uid || w.id; reload(); }
    }, [
        // Left: Profile & Avatar
        h('div', { className: 'flex items-center gap-3', style: { flex: '1', minWidth: '220px' } }, [
            avatar,
            h('div', { className: 'flex-column gap-0.5' }, [
                h('span', { className: 'font-bold text-sm text-primary' }, w.nombre || w.email?.split('@')[0]),
                h('span', { className: 'text-xs text-muted' }, w.email)
            ])
        ]),

        // Middle: Role Badge & Active Tasks summary
        h('div', { className: 'flex items-center gap-4', style: { flex: '2', minWidth: '300px' } }, [
            h('span', { className: 'badge text-xs', style: { background: meta.color + '15', color: meta.color, border: `1px solid ${meta.color}33`, width: 'fit-content' } }, meta.label),
            h('span', { className: 'text-xs text-muted truncate', style: { maxWidth: '380px' } }, summaryText)
        ]),

        // Right: Control Buttons
        h('div', { className: 'flex items-center gap-2', onClick: (e) => e.stopPropagation() }, [
            h('button', {
                className: 'btn btn-outline text-xs',
                title: 'Ver Factura Personal',
                onClick: () => { window.location.hash = `#billing`; }
            }, [icon('credit-card', 12), h('span', { className: 'ml-1' }, 'Factura')]),
            h('button', {
                className: 'btn btn-outline text-xs',
                title: 'Editar Asignaciones',
                onClick: () => openWorkerAssignmentsPanel(w, myAsgs, clients, reload)
            }, [icon('edit-3', 12)]),
            h('button', {
                className: 'btn btn-outline text-xs',
                title: 'Cambiar Rol',
                onClick: () => openChangeRoleModal(w, roles, reload)
            }, [icon('refresh-cw', 12)])
        ])
    ]);
}

// 9. PERFIL COMPLETO DE EMPLEADO (Full Page)
function renderWorkerDetail(container, w, assignments, clients, sops, roles, reload) {
    const roleDef = roles.find(r => r.id === w.role);
    const meta = {
        label: roleDef ? roleDef.label : w.role,
        color: (ROLE_META[w.role] && ROLE_META[w.role].color) ? ROLE_META[w.role].color : '#64748b',
        icon: (ROLE_META[w.role] && ROLE_META[w.role].icon) ? ROLE_META[w.role].icon : 'user',
        invoiceType: (ROLE_META[w.role] && ROLE_META[w.role].invoiceType) ? ROLE_META[w.role].invoiceType : 'Factura General'
    };

    const myAsgs = assignments.filter(a => a.employeeId === (w.uid || w.id));
    const activeAsgs = myAsgs.filter(a => a.status !== 'Completado');
    const doneAsgs = myAsgs.filter(a => a.status === 'Completado');
    const lateAsgs = activeAsgs.filter(a => new Date(a.dueDate) < new Date());

    // Clients assigned
    const assignedClients = Array.from(new Set(myAsgs.map(a => a.client)));

    // SOP status for employee's role
    const roleSops = sops.filter(s => !s.targetRole || s.targetRole === w.role || s.targetRole === 'all');
    const completedSteps = roleSops.reduce((sum, s) => sum + (s.steps || []).filter(st => st.done).length, 0);
    const totalSteps = roleSops.reduce((sum, s) => sum + (s.steps || []).length, 0);
    const sopPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

    // Header Back Row
    container.appendChild(h('div', { className: 'flex items-center gap-2 mb-2' }, [
        h('button', {
            className: 'btn btn-outline text-xs flex items-center gap-1',
            onClick: () => { selectedWorkerId = null; reload(); }
        }, [icon('arrow-left', 12), h('span', {}, 'Volver a Workers')])
    ]));

    // 1. Hero completo
    const avatarLarge = w.photoURL
        ? h('img', { src: w.photoURL, style: { width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover' } })
        : h('div', {
            style: {
                width: '80px', height: '80px', borderRadius: '50%', fontSize: '1.8rem',
                background: meta.color + '22', color: meta.color, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontWeight: 700, border: `3px solid ${meta.color}44`
            }
        }, (w.nombre || w.email || 'US').slice(0, 2).toUpperCase());

    const hero = h('div', {
        className: 'card p-6 flex justify-between items-center flex-wrap gap-4 w-full',
        style: { background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0) 100%)', borderLeft: `4px solid ${meta.color}` }
    }, [
        h('div', { className: 'flex items-center gap-4' }, [
            avatarLarge,
            h('div', { className: 'flex-column gap-1' }, [
                h('div', { className: 'flex items-center gap-2' }, [
                    h('h1', { className: 'text-xl font-bold m-0 text-primary' }, w.nombre || w.email?.split('@')[0]),
                    h('span', { className: 'badge text-xs', style: { background: meta.color + '15', color: meta.color, border: `1px solid ${meta.color}33` } }, meta.label)
                ]),
                h('span', { className: 'text-xs text-muted' }, w.email),
                h('span', { className: 'text-xs text-muted' }, `Estado: Activo · Trabajando con la agencia desde hace ${w.createdAt ? Math.max(1, Math.round((Date.now() - new Date(w.createdAt)) / (1000 * 60 * 60 * 24))) : 30} días`)
            ])
        ]),
        h('div', { className: 'flex gap-2' }, [
            h('button', {
                className: 'btn btn-primary text-xs',
                onClick: () => openAssignmentModal(null, { users: [w], preselectedUser: w.uid || w.id, clients, assignments: myAsgs, reload: () => renderWorkerDetail(container, w, assignments, clients, sops, roles, reload), sops })
            }, [icon('plus', 12), h('span', {}, 'Asignar Trabajo')]),
            h('button', {
                className: 'btn btn-outline text-xs',
                onClick: () => openChangeRoleModal(w, roles, () => reload())
            }, 'Cambiar Rol')
        ])
    ]);
    container.appendChild(hero);

    // 2. Métricas
    const metricsGrid = h('div', {
        style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', width: '100%' }
    }, [
        h('div', { className: 'card p-4 flex-column gap-1 text-center' }, [
            h('span', { className: 'text-2xl font-bold text-success' }, doneAsgs.filter(a => a.type === 'Edición').length),
            h('span', { className: 'text-xs text-muted font-medium' }, 'Videos Editados')
        ]),
        h('div', { className: 'card p-4 flex-column gap-1 text-center' }, [
            h('span', { className: 'text-2xl font-bold text-accent' }, doneAsgs.filter(a => a.type === 'Grabación').length),
            h('span', { className: 'text-xs text-muted font-medium' }, 'Grabaciones')
        ]),
        h('div', { className: 'card p-4 flex-column gap-1 text-center' }, [
            h('span', { className: 'text-2xl font-bold text-warning' }, myAsgs.filter(a => a.status === 'blocked').length),
            h('span', { className: 'text-xs text-muted font-medium' }, 'Correcciones / Bloqueadas')
        ]),
        h('div', { className: 'card p-4 flex-column gap-1 text-center' }, [
            h('span', { className: `text-2xl font-bold ${lateAsgs.length > 0 ? 'text-error' : 'text-muted'}` }, lateAsgs.length),
            h('span', { className: 'text-xs text-muted font-medium' }, 'Retrasos Acumulados')
        ])
    ]);
    container.appendChild(metricsGrid);

    // Split Layout below
    const columns = h('div', { className: 'worker-detail-grid' }, [
        // Left Column
        h('div', { className: 'flex-column gap-4' }, [
            // Active assignments
            h('div', { className: 'card p-5 flex-column gap-3' }, [
                h('h3', { className: 'text-sm font-bold border-bottom pb-2' }, 'Asignaciones Activas'),
                activeAsgs.length === 0
                    ? h('p', { className: 'text-xs text-muted italic p-2' }, 'Sin asignaciones activas en este momento.')
                    : h('div', { className: 'flex-column gap-2' }, activeAsgs.map(a => {
                        const statusClass = a.status === 'En Proceso' ? 'info' : 'warning';
                        return h('div', { className: 'p-3 bg-tertiary rounded flex justify-between items-center', style: { border: '1px solid var(--border)' } }, [
                            h('div', { className: 'flex-column gap-0.5' }, [
                                h('span', { className: 'text-xs font-bold text-primary' }, `${a.client}: ${a.title}`),
                                h('span', { className: 'text-xs text-muted' }, `Fecha Límite: ${new Date(a.dueDate).toLocaleDateString('es-ES')}`)
                            ]),
                            h('div', { className: 'flex items-center gap-2' }, [
                                h('span', { className: `badge badge-${statusClass} text-xs` }, a.status),
                                h('button', {
                                    className: 'btn btn-outline text-xs p-1',
                                    title: 'Editar Asignación',
                                    onClick: () => openAssignmentModal(a, { users: [w], preselectedUser: w.uid || w.id, clients, reload: () => reload() })
                                }, [icon('edit-2', 12)])
                            ])
                        ]);
                    }))
            ]),

            // History
            h('div', { className: 'card p-5 flex-column gap-3' }, [
                h('h3', { className: 'text-sm font-bold border-bottom pb-2' }, 'Historial Reciente'),
                doneAsgs.length === 0
                    ? h('p', { className: 'text-xs text-muted italic p-2' }, 'No hay historial de tareas completadas.')
                    : h('div', { className: 'flex-column gap-2' }, doneAsgs.slice(0, 5).map(a => 
                        h('div', { className: 'p-3 bg-tertiary rounded flex justify-between items-center', style: { border: '1px solid var(--border)', opacity: 0.8 } }, [
                            h('div', { className: 'flex-column gap-0.5' }, [
                                h('span', { className: 'text-xs font-bold text-primary' }, `${a.client}: ${a.title}`),
                                h('span', { className: 'text-xs text-muted' }, `Completada el ${new Date(a.createdAt || Date.now()).toLocaleDateString('es-ES')}`)
                            ]),
                            h('span', { className: 'badge badge-success text-xs' }, 'Completado')
                        ])
                    ))
            ])
        ]),

        // Right Column
        h('div', { className: 'flex-column gap-4' }, [
            // Billing Summary
            h('div', { className: 'card p-5 flex-column gap-3' }, [
                h('h3', { className: 'text-sm font-bold border-bottom pb-2' }, 'Facturación (Mes Actual)'),
                h('div', { className: 'flex justify-between items-center text-xs' }, [
                    h('span', { className: 'text-muted' }, 'Tipo de Cobro:'),
                    h('span', { className: 'font-semibold' }, meta.invoiceType)
                ]),
                h('div', { className: 'flex justify-between items-center text-xs' }, [
                    h('span', { className: 'text-muted' }, 'SOP Completados:'),
                    h('span', { className: 'font-semibold text-accent' }, `${sopPct}%`)
                ]),
                h('div', { className: 'flex justify-between items-center text-xs border-top pt-2 mt-1' }, [
                    h('span', { className: 'font-bold' }, 'Total Facturado:'),
                    h('span', { className: 'font-bold text-success text-sm' }, `$${(doneAsgs.length * 15000).toLocaleString('es-CO')} COP`)
                ]),
                h('button', {
                    className: 'btn btn-outline text-xs w-full justify-center mt-2',
                    onClick: () => { window.location.hash = '#billing'; }
                }, 'Ir a Pagos Pendientes')
            ]),

            // Assigned Clients
            h('div', { className: 'card p-5 flex-column gap-3' }, [
                h('h3', { className: 'text-sm font-bold border-bottom pb-2' }, 'Clientes Asignados'),
                assignedClients.length === 0
                    ? h('p', { className: 'text-xs text-muted italic' }, 'Sin clientes asignados.')
                    : h('div', { className: 'flex gap-1.5 flex-wrap' }, assignedClients.map(c => 
                        h('span', { className: 'badge badge-secondary text-xs' }, c)
                    ))
            ])
        ])
    ]);
    container.appendChild(columns);
}

function openWorkerAssignmentsPanel(w, asgs, clients, reload) {
    const overlay = h('div', { className: 'modal-overlay' });
    const meta = ROLE_META[w.role] || { label: w.role, color: '#64748b' };

    const renderRow = (asg) => {
        const statusClass = asg.status === 'Completado' ? 'success' : asg.status === 'En Proceso' ? 'info' : 'warning';
        return h('div', { className: 'card p-3 flex justify-between items-center gap-2' }, [
            h('div', { className: 'flex-column gap-1', style: { flex: 1, minWidth: 0 } }, [
                h('span', { className: 'text-xs font-bold text-primary truncate' }, `${asg.client}: ${asg.title}`),
                h('div', { className: 'flex gap-2 items-center mt-0.5' }, [
                    h('span', { className: `badge badge-${statusClass} text-xs`, style: { fontSize: '0.55rem' } }, asg.status === 'blocked' ? 'En espera de compañero' : asg.status),
                    h('span', { className: 'text-xs text-muted', style: { fontSize: '0.6rem' } }, new Date(asg.dueDate).toLocaleDateString('es-ES'))
                ])
            ]),
            h('button', {
                className: 'btn-icon text-error',
                style: { width: '22px', height: '22px', flexShrink: 0 },
                onClick: async () => {
                    if (!confirm('¿Eliminar esta asignación?')) return;
                    await assignmentService.deleteAssignment(asg.id);
                    overlay.remove();
                    reload();
                }
            }, [icon('trash-2', 12)])
        ]);
    };

    const modal = h('div', { className: 'modal-container', style: { maxWidth: '520px' } }, [
        h('div', { className: 'modal-header' }, [
            h('div', { className: 'flex-column gap-0.5' }, [
                h('span', { className: 'modal-title' }, `Asignaciones: ${w.nombre || w.email?.split('@')[0]}`),
                h('span', { className: 'text-xs', style: { color: meta.color } }, meta.label)
            ]),
            h('button', { type: 'button', onClick: () => overlay.remove() }, '×')
        ]),
        h('div', { className: 'modal-body flex-column gap-2', style: { maxHeight: '55vh', overflowY: 'auto' } },
            asgs.length === 0
                ? [h('p', { className: 'text-xs text-muted text-center p-6 italic' }, 'Sin asignaciones para este trabajador.')]
                : asgs.map(renderRow)
        ),
        h('div', { className: 'modal-footer' }, [
            h('button', { className: 'btn btn-outline text-xs', onClick: () => overlay.remove() }, 'Cerrar')
        ])
    ]);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    if (window.lucide) window.lucide.createIcons();
}

function openChangeRoleModal(w, roles, reload) {
    const overlay = h('div', { className: 'modal-overlay' });
    const activeRoles = roles.filter(r => r.active !== false && r.id !== 'admin');

    const select = h('select', { className: 'form-select text-xs' }, [
        ...activeRoles.map(r => h('option', { value: r.id }, r.label)),
        (!activeRoles.find(r => r.id === w.role)) ? h('option', { value: w.role }, w.role) : null
    ].filter(Boolean));
    setTimeout(() => { select.value = w.role || ''; }, 0);

    const modal = h('div', { className: 'modal-container', style: { maxWidth: '380px' } }, [
        h('div', { className: 'modal-header' }, [
            h('span', { className: 'modal-title' }, `Cambiar Rol: ${w.nombre || w.email?.split('@')[0]}`),
            h('button', { type: 'button', onClick: () => overlay.remove() }, '×')
        ]),
        h('div', { className: 'modal-body flex-column gap-3' }, [
            h('p', { className: 'text-xs text-muted' }, 'El nuevo rol determinará el tipo de factura y las tareas visibles en su perfil.'),
            h('div', { className: 'form-group' }, [
                h('label', { className: 'form-label' }, 'Nuevo Rol'),
                select
            ])
        ]),
        h('div', { className: 'modal-footer' }, [
            h('button', { className: 'btn btn-outline text-xs', onClick: () => overlay.remove() }, 'Cancelar'),
            h('button', {
                className: 'btn btn-primary text-xs',
                onClick: async (e) => {
                    const btn = e.currentTarget;
                    btn.disabled = true;
                    await dbService.update('users', w.uid || w.id, { role: select.value });
                    overlay.remove();
                    reload();
                }
            }, 'Guardar Rol')
        ])
    ]);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    if (window.lucide) window.lucide.createIcons();
}

function openAssignmentModal(existing, context) {
    const { users, preselectedUser, clients, reload } = context;
    const overlay = h('div', { className: 'modal-overlay' });

    const submit = async (e) => {
        e.preventDefault();
        const data = {
            ...(existing || {}),
            id: existing?.id,
            employeeId: form.querySelector('#wasg-emp').value,
            type: form.querySelector('#wasg-type').value,
            client: form.querySelector('#wasg-client').value,
            title: form.querySelector('#wasg-title').value,
            description: form.querySelector('#wasg-desc').value,
            dueDate: form.querySelector('#wasg-due').value,
            status: existing?.status || 'Pendiente',
            createdBy: existing?.createdBy || store.getState().user?.uid
        };
        await assignmentService.saveAssignment(data);
        overlay.remove();
        reload();
    };

    const form = h('form', { className: 'modal-container', style: { maxWidth: '500px' }, onSubmit: submit }, [
        h('div', { className: 'modal-header' }, [
            h('span', { className: 'modal-title' }, existing ? 'Editar Asignación' : 'Nueva Asignación'),
            h('button', { type: 'button', onClick: () => overlay.remove() }, '×')
        ]),
        h('div', { className: 'modal-body flex-column gap-3' }, [
            h('div', { className: 'form-group' }, [
                h('label', { className: 'form-label' }, 'Trabajador'),
                h('select', { id: 'wasg-emp', className: 'form-select text-xs', required: true },
                    users.map(u => h('option', { value: u.uid || u.id, selected: (u.uid || u.id) === (existing?.employeeId || preselectedUser) }, u.nombre || u.email))
                )
            ]),
            h('div', { className: 'grid gap-3', style: { display: 'grid', gridTemplateColumns: '1fr 1fr' } }, [
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Tipo'),
                    h('select', { id: 'wasg-type', className: 'form-select text-xs' }, [
                        h('option', { value: 'Grabación' }, 'Grabación'),
                        h('option', { value: 'Edición' }, 'Edición'),
                        h('option', { value: 'Diseño' }, 'Diseño'),
                        h('option', { value: 'Creador 360°' }, 'Creador 360°'),
                        h('option', { value: 'Administración' }, 'Administración')
                    ])
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Cliente'),
                    h('select', { id: 'wasg-client', className: 'form-select text-xs', required: true },
                        clients.map(c => h('option', { value: c.name, selected: existing?.client === c.name }, c.name))
                    )
                ])
            ]),
            h('div', { className: 'form-group' }, [
                h('label', { className: 'form-label' }, 'Título del Trabajo'),
                h('input', { id: 'wasg-title', className: 'form-input text-xs', value: existing?.title || '', placeholder: 'Ej. Edición Reel Restaurante', required: true })
            ]),
            h('div', { className: 'form-group' }, [
                h('label', { className: 'form-label' }, 'Fecha Límite'),
                h('input', { id: 'wasg-due', type: 'datetime-local', className: 'form-input text-xs', value: existing?.dueDate?.slice(0, 16) || '', required: true })
            ]),
            h('div', { className: 'form-group' }, [
                h('label', { className: 'form-label' }, 'Observaciones'),
                h('textarea', { id: 'wasg-desc', className: 'form-textarea text-xs', rows: 3, placeholder: 'Instrucciones específicas...' }, existing?.description || '')
            ])
        ]),
        h('div', { className: 'modal-footer' }, [
            h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => overlay.remove() }, 'Cancelar'),
            h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, 'Guardar')
        ])
    ]);

    overlay.appendChild(form);
    document.body.appendChild(overlay);
    if (window.lucide) window.lucide.createIcons();
}
