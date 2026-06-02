/**
 * Workers Page - Creative Production OS
 * Admin-only: team management with role-based views, embedded assignments, and SOP progress.
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
        const [allUsers, assignments, clients, sops, roles] = await Promise.all([
            userService.getAllUsers(),
            assignmentService.getAllAssignments(),
            dbService.getAll('clients').catch(() => []),
            dbService.getAll('sops').catch(() => []),
            dbService.getAll('roles').catch(() => [])
        ]);

        const workers = allUsers.filter(u => u.approved && u.role !== 'admin');
        container.innerHTML = '';

        // Header
        container.appendChild(h('div', { className: 'content-header flex justify-between items-center w-full' }, [
            h('div', {}, [
                h('h1', {}, 'Gestión de Workers'),
                h('p', { className: 'text-xs text-muted mt-1' }, `${workers.length} trabajadores activos en el equipo`)
            ]),
            h('div', { className: 'flex gap-2' }, [
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

        const grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' } });
        workers.forEach(w => grid.appendChild(renderWorkerCard(w, assignments, clients, sops, roles, load)));
        container.appendChild(grid);
        if (window.lucide) window.lucide.createIcons();
    };

    load();
    return container;
};

function renderWorkerCard(w, assignments, clients, sops, roles, reload) {
    const roleDef = roles.find(r => r.id === w.role);
    const meta = {
        label: roleDef ? roleDef.label : w.role,
        color: (ROLE_META[w.role] && ROLE_META[w.role].color) ? ROLE_META[w.role].color : '#64748b',
        icon: (ROLE_META[w.role] && ROLE_META[w.role].icon) ? ROLE_META[w.role].icon : 'user',
        invoiceType: (ROLE_META[w.role] && ROLE_META[w.role].invoiceType) ? ROLE_META[w.role].invoiceType : 'Factura General'
    };
    const myAsgs = assignments.filter(a => a.employeeId === (w.uid || w.id));
    const pending = myAsgs.filter(a => a.status !== 'Completado');
    const done = myAsgs.filter(a => a.status === 'Completado');

    // SOP progress for this role
    const roleSops = sops.filter(s => !s.targetRole || s.targetRole === w.role || s.targetRole === 'all');
    const completedSteps = roleSops.reduce((sum, s) => sum + (s.steps || []).filter(st => st.done).length, 0);
    const totalSteps = roleSops.reduce((sum, s) => sum + (s.steps || []).length, 0);
    const sopPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

    const avatar = w.photoURL
        ? h('img', { src: w.photoURL, style: { width: '42px', height: '42px', borderRadius: '50%', flexShrink: 0 } })
        : h('div', {
            style: {
                width: '42px', height: '42px', borderRadius: '50%', flexShrink: 0, fontSize: '0.8rem',
                background: meta.color + '22', color: meta.color, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontWeight: 700, border: `2px solid ${meta.color}44`
            }
        }, (w.nombre || w.email || 'US').slice(0, 2).toUpperCase());

    return h('div', { className: 'card p-0 flex-column hover-border transition', style: { overflow: 'hidden' } }, [
        // Color top strip
        h('div', { style: { height: '3px', background: meta.color } }),
        h('div', { className: 'p-4 flex-column gap-3' }, [
            // Top: avatar + info + role badge
            h('div', { className: 'flex items-center gap-3' }, [
                avatar,
                h('div', { className: 'flex-column gap-0.5', style: { flex: 1, minWidth: 0 } }, [
                    h('span', { className: 'font-bold text-sm text-primary truncate' }, w.nombre || w.email?.split('@')[0]),
                    h('span', { className: 'text-xs text-muted truncate' }, w.email),
                    h('span', { className: 'badge text-xs mt-1', style: { background: meta.color + '22', color: meta.color, border: `1px solid ${meta.color}44`, width: 'fit-content' } }, meta.label)
                ]),
                h('div', { className: 'flex gap-1' }, [
                    h('button', { className: 'btn-icon text-muted', title: 'Ver Factura', onClick: () => window.location.hash = '#billing' }, [icon('credit-card', 14)]),
                    h('button', { className: 'btn-icon text-muted', title: 'Gestionar Asignaciones', onClick: () => openWorkerAssignmentsPanel(w, myAsgs, clients, reload) }, [icon('list-checks', 14)])
                ])
            ]),

            // Stats row
            h('div', { className: 'flex gap-3 text-xs', style: { borderTop: '1px solid var(--border)', paddingTop: '10px' } }, [
                h('div', { className: 'flex-column items-center gap-0.5', style: { flex: 1, textAlign: 'center' } }, [
                    h('span', { className: 'font-bold text-primary' }, pending.length),
                    h('span', { className: 'text-muted', style: { fontSize: '0.6rem' } }, 'Pendientes')
                ]),
                h('div', { style: { width: '1px', background: 'var(--border)' } }),
                h('div', { className: 'flex-column items-center gap-0.5', style: { flex: 1, textAlign: 'center' } }, [
                    h('span', { className: 'font-bold text-success' }, done.length),
                    h('span', { className: 'text-muted', style: { fontSize: '0.6rem' } }, 'Completadas')
                ]),
                h('div', { style: { width: '1px', background: 'var(--border)' } }),
                h('div', { className: 'flex-column items-center gap-0.5', style: { flex: 1, textAlign: 'center' } }, [
                    h('span', { className: 'font-bold text-accent' }, `${sopPct}%`),
                    h('span', { className: 'text-muted', style: { fontSize: '0.6rem' } }, 'SOPs')
                ])
            ]),

            // Pending tasks preview
            pending.length > 0 ? h('div', { className: 'flex-column gap-1', style: { borderTop: '1px solid var(--border)', paddingTop: '10px' } },
                pending.slice(0, 2).map(a => {
                    const due = new Date(a.dueDate);
                    const isLate = due < new Date();
                    return h('div', { className: 'flex justify-between items-center text-xs p-2 rounded', style: { background: 'var(--bg-tertiary)', borderRadius: '4px' } }, [
                        h('span', { className: 'truncate text-secondary font-medium', style: { maxWidth: '200px' } }, `${a.client}: ${a.title}`),
                        h('span', { className: isLate ? 'text-error font-bold' : 'text-muted', style: { fontSize: '0.6rem', flexShrink: 0 } },
                            due.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }))
                    ]);
                })
            ) : null,

            // Invoice type info
            h('div', { className: 'flex items-center gap-2 text-xs', style: { borderTop: '1px solid var(--border)', paddingTop: '8px' } }, [
                icon('file-text', 11, 'text-muted'),
                h('span', { className: 'text-muted' }, meta.invoiceType),
                h('a', { href: '#billing', className: 'ml-auto text-accent', style: { fontSize: '0.6rem' } }, 'Ver factura →')
            ]),

            // Actions
            h('div', { className: 'flex gap-2', style: { borderTop: '1px solid var(--border)', paddingTop: '10px' } }, [
                h('button', {
                    className: 'btn btn-outline text-xs flex-1',
                    style: { fontSize: '0.65rem' },
                    onClick: () => openAssignmentModal(null, { users: [w], preselectedUser: w.uid || w.id, clients, assignments: myAsgs, reload, sops })
                }, [icon('plus', 11), h('span', {}, 'Asignar')]),
                h('button', {
                    className: 'btn btn-outline text-xs flex-1',
                    style: { fontSize: '0.65rem' },
                    onClick: () => openChangeRoleModal(w, roles, reload)
                }, [icon('refresh-cw', 11), h('span', {}, 'Cambiar Rol')])
            ])
        ])
    ]);
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
        ...activeRoles.map(r => h('option', { value: r.id, selected: w.role === r.id }, r.label)),
        (!activeRoles.find(r => r.id === w.role)) ? h('option', { value: w.role, selected: true }, w.role) : null
    ].filter(Boolean));

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
                    users.map(u => h('option', { value: u.uid, selected: u.uid === (existing?.employeeId || preselectedUser) }, u.nombre || u.email))
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
