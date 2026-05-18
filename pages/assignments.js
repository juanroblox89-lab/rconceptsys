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
    
    if (!isAdmin) {
        return h('div', { className: 'p-20 text-center' }, [
            icon('lock', 40, 'text-muted mb-4'),
            h('h2', { className: 'text-lg font-bold' }, 'Acceso Restringido'),
            h('p', { className: 'text-sm text-muted' }, 'Solo los administradores pueden gestionar asignaciones.')
        ]);
    }

    const container = h('div', { className: 'fade-in flex-column gap-6' });

    const loadAndRender = async () => {
        container.innerHTML = '<div class="loader mb-4"></div>';

        try {
            // 0. Cleanup expired assignments (2 days past due)
            await assignmentService.cleanupAssignments();

            // 1. Load Data
            const [users, assignments, clients] = await Promise.all([
                userService.getAllUsers(),
                assignmentService.getAllAssignments(),
                dbService.getAll('clients')
            ]);

            const approvedUsers = users.filter(u => u.approved && u.role !== 'admin');
            
            // Fix: Fallback to local clients if DB is empty to prevent empty dropdowns
            const localClients = [
                { name: 'Gimnasio Elite' },
                { name: 'Barbería Classic' }
            ];
            const finalClients = clients.length ? clients : localClients;
            
            container.innerHTML = '';

            // Header
            const header = h('div', { className: 'flex justify-between items-end mb-2' }, [
                h('div', {}, [
                    h('h1', { className: 'text-xl font-bold' }, 'Gestión de Asignaciones'),
                    h('p', { className: 'text-xs text-muted mt-1' }, 'Organiza grabaciones, ediciones y controla flujos de trabajo del equipo.')
                ]),
                h('div', { className: 'flex gap-2' }, [
                    h('button', { 
                        className: 'btn btn-primary text-xs',
                        onClick: () => openAssignmentModal(null, { users: approvedUsers, clients: finalClients })
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
                                h('button', { className: 'btn-icon text-muted', title: 'Editar Asignaciones', onClick: () => openEmployeeTasksModal(emp, empAsgs, { clients }) }, [icon('more-horizontal', 14)])
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
                                            h('button', { className: 'action-btn', style: { padding: '2px' }, onClick: () => openAssignmentModal(asg, { users: approvedUsers, clients: finalClients }) }, [icon('edit-3', 10)])
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
                                onClick: () => openAssignmentModal(null, { users: [emp], clients, preselectedUser: emp.uid })
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
            container.innerHTML = `<div class="error-state text-sm p-10">${err.message}</div>`;
        }
    };

    const openAssignmentModal = (existing = null, context = {}) => {
        const overlay = h('div', { className: 'modal-overlay' });
        
        const submit = async (e) => {
            e.preventDefault();
            const formData = {
                id: existing?.id,
                employeeId: form.querySelector('#asg-emp').value,
                type: form.querySelector('#asg-type').value,
                client: form.querySelector('#asg-client').value,
                title: form.querySelector('#asg-title').value,
                description: form.querySelector('#asg-desc').value,
                dueDate: form.querySelector('#asg-due').value,
                status: existing?.status || 'Pendiente',
                createdBy: user.uid
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
                            context.users.map(u => h('option', { value: u.uid, selected: u.uid === context.preselectedUser }, u.nombre || u.email))
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
                        context.clients.map(c => h('option', { value: c.name }, c.name))
                    )
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
                    h('label', { className: 'form-label' }, 'Descripción / Observaciones'),
                    h('textarea', { id: 'asg-desc', className: 'form-textarea', placeholder: 'Detalles específicos del requerimiento...' }, existing?.description || '')
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
                        h('span', { className: 'text-xs text-muted' }, `${asg.type} — Límite: ${new Date(asg.dueDate).toLocaleString()}`)
                    ]),
                    h('div', { className: 'flex gap-2' }, [
                        h('button', { 
                            className: 'btn-icon text-muted', 
                            onClick: () => {
                                document.body.removeChild(overlay);
                                openAssignmentModal(asg, { users: [emp], clients: context.clients });
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
