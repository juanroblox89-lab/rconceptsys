/**
 * Assignments Page - Creative Production OS
 * Admin-only module to manage recordings and edits for the team.
 * Inspired by Linear and Notion for a minimalist, operational feel.
 */
import { h, icon } from '../utils/dom.js';
import { store } from '../js/store.js';
import { dbService, storageService } from '../firebase/service.js';
import { assignmentService } from '../services/assignmentService.js';
import { userService } from '../services/userService.js';
import { invoiceService } from '../services/invoiceService.js';

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
            const [users, assignments, clients, scripts, assets, sops, mySopSubmissions] = await Promise.all([
                userService.getAllUsers(),
                assignmentService.getAllAssignments(),
                dbService.getAll('clients').catch(() => []),
                dbService.getAll('scripts').catch(() => []),
                dbService.getAll('assets').catch(() => []),
                dbService.getAll('sops').catch(() => []),
                (!isAdmin && user) ? dbService.getByQuery('sop_submissions', 'userId', '==', user.uid).catch(() => []) : Promise.resolve([])
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
                const activeMyAsgs = myAssignments.filter(a => a.status !== 'Completado' && a.status !== 'Cancelado');
                const completedMyAsgs = myAssignments.filter(a => a.status === 'Completado');
                const totalVisible = activeMyAsgs.length + completedMyAsgs.length;

                const header = h('div', { className: 'flex justify-between items-end mb-2 w-full border-bottom pb-3' }, [
                    h('div', {}, [
                        h('h1', { className: 'text-xl font-bold' }, 'Mi Espacio de Trabajo'),
                        h('p', { className: 'text-xs text-muted mt-1' }, 'Listado de tareas y SOPs asignados a tu cuenta.')
                    ]),
                    h('span', { className: 'badge text-xs font-mono font-bold' }, `Total: ${totalVisible} Tareas`)
                ]);
                container.appendChild(header);

                // Workflow Guide for Employee
                const getRoleSpecificGuide = (roleName) => {
                    const r = (roleName || '').toLowerCase();
                    if (r.includes('marketing') || r.includes('venta')) {
                        return [
                            h('li', {}, [h('span', { className: 'font-bold' }, '1. Prospectar: '), 'Sal a buscar clientes. Por cada 10 prospectos visitados, recibes un bono.']),
                            h('li', {}, [h('span', { className: 'font-bold' }, '2. Registrar Visitas: '), 'Entra a la pestaña "Ventas y Marketing" y registra cada visita para llevar la cuenta.']),
                            h('li', {}, [h('span', { className: 'font-bold' }, '3. Cerrar Clientes: '), 'Cuando consigas un cliente, márcalo como "Cerrado" en la misma pestaña para cobrar tu gran comisión.']),
                            h('li', {}, [h('span', { className: 'font-bold' }, '4. Cobrar: '), 'Ve a "Pagos Pendientes" para ver cómo se acumulan tus bonos y comisiones.'])
                        ];
                    } else if (r.includes('camarógrafo') || r.includes('grabador')) {
                        return [
                            h('li', {}, [h('span', { className: 'font-bold' }, '1. Preparación: '), 'Revisa tus tareas pendientes. Verifica el cliente, el día y lee el Guion asignado.']),
                            h('li', {}, [h('span', { className: 'font-bold' }, '2. Confirmación: '), 'Recuerda confirmar la asistencia con el cliente el día antes por el grupo de WhatsApp.']),
                            h('li', {}, [h('span', { className: 'font-bold' }, '3. Grabación y Subida: '), 'Ve al lugar, sácate el guion del cerebro y graba. Al terminar, sube los archivos crudos al Drive.']),
                            h('li', {}, [h('span', { className: 'font-bold' }, '4. Notificar y Cobrar: '), 'Avisa al equipo que el crudo está listo, dale a "Cobrar Tarea" e ingresa los minutos que grabaste.'])
                        ];
                    } else if (r.includes('editor')) {
                        return [
                            h('li', {}, [h('span', { className: 'font-bold' }, '1. Recepción: '), 'Revisa tu tarea. El líder te habrá notificado que los crudos están en Drive junto al Guion.']),
                            h('li', {}, [h('span', { className: 'font-bold' }, '2. Edición: '), 'Descarga los crudos, edita el video aplicando formatos virales y exporta el archivo final.']),
                            h('li', {}, [h('span', { className: 'font-bold' }, '3. Entrega: '), 'Sube el video final al Drive y manda el link por WhatsApp para revisión.']),
                            h('li', {}, [h('span', { className: 'font-bold' }, '4. Cobrar: '), 'Marca la tarea como completada y dale a "Cobrar Tarea" para añadir tu pago a la factura.'])
                        ];
                    } else if (r.includes('estratega') || r.includes('lider') || r.includes('admin')) {
                        return [
                            h('li', {}, [h('span', { className: 'font-bold' }, '1. Creación de Cliente: '), 'Anota el nuevo cliente en la pestaña "Clientes" y asígnale su paquete de videos (4, 6 u 8).']),
                            h('li', {}, [h('span', { className: 'font-bold' }, '2. Estrategia: '), 'Redacta los guiones utilizando la pestaña de Formatos y Hooks.']),
                            h('li', {}, [h('span', { className: 'font-bold' }, '3. Asignar Grabación: '), 'Crea una tarea para el Camarógrafo adjuntando el guion y el cliente.']),
                            h('li', {}, [h('span', { className: 'font-bold' }, '4. Asignar Edición: '), 'Cuando los crudos estén en Drive, asígnale la tarea de edición al Editor, y revisa el progreso del paquete.'])
                        ];
                    } else {
                        // Default Guide
                        return [
                            h('li', {}, [h('span', { className: 'font-bold' }, '1. Revisa tu Tarea: '), 'Abre tu tarea pendiente y revisa las instrucciones, el Guion y el Asset de muestra.']),
                            h('li', {}, [h('span', { className: 'font-bold' }, '2. Ejecuta y Llenar SOP: '), 'Haz clic en "Llenar SOP" para abrir tu lista de verificación y entregar los enlaces o archivos requeridos.']),
                            h('li', {}, [h('span', { className: 'font-bold' }, '3. Completar: '), 'Al terminar todos los pasos del SOP, la tarea se marcará como Completada automáticamente.']),
                            h('li', {}, [h('span', { className: 'font-bold' }, '4. Cobrar: '), 'Dale a "Cobrar Tarea" para sumar el pago a tu factura en "Pagos Pendientes".'])
                        ];
                    }
                };

                const roleNameDisplay = (user.role && user.role !== 'admin' && user.role !== 'viewer') 
                    ? user.role.charAt(0).toUpperCase() + user.role.slice(1) 
                    : 'Miembro del Equipo';

                container.appendChild(
                    h('div', { className: 'card p-4 flex-column gap-2 mb-4 w-full', style: { borderLeft: '4px solid var(--accent)', background: 'var(--bg-tertiary)' } }, [
                        h('h3', { className: 'text-sm font-bold flex items-center gap-2' }, [icon('info', 16, 'text-accent'), h('span', {}, `Guía de Flujo Operativo: ${roleNameDisplay}`)]),
                        h('ol', { className: 'text-xs text-muted pl-4', style: { margin: 0, paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '4px' } }, 
                            getRoleSpecificGuide(user.role)
                        )
                    ])
                );

                // Assignments already split above

                // Render Task Row
                const renderEmployeeTaskRow = (asg) => {
                    const now = new Date();
                    const due = new Date(asg.dueDate);
                    const isExpired = due < now && asg.status !== 'Completado';
                    const isToday = !isExpired && due.toDateString() === now.toDateString();

                    // Status Badge styling
                    const statusClass = asg.status === 'En Proceso' || asg.status === 'En Producción' ? 'info' : 
                                        asg.status === 'Completado' ? 'success' : asg.status === 'Cancelado' ? 'error' : 'warning';

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
                                    onClick: async (e) => {
                                        const btn = e.currentTarget;
                                        btn.disabled = true;
                                        try {
                                            await assignmentService.saveAssignment({ ...asg, status: 'En Proceso' });
                                            loadAndRender();
                                        } catch(err) {
                                            btn.disabled = false;
                                            alert("Error al actualizar la tarea.");
                                        }
                                    }
                                }, [icon('play', 12), h('span', {}, 'Empezar')]) : null,

                                (asg.status === 'Pendiente' || asg.status === 'En Proceso' || asg.status === 'En Producción') ? (() => {
                                    const asgClient = finalClients.find(c => c.name === asg.client || c.id === asg.client);
                                    const hasDrive = asgClient && asgClient.driveFolderUrl;
                                    const isRecording = asg.type === 'Grabación' || asg.type === 'Creador 360° (Grabación + Edición)';
                                    
                                    const hasSop = !!asg.sopId;
                                    const sopObj = hasSop ? sops.find(s => s.id === asg.sopId) : null;
                                    const sopSub = hasSop ? mySopSubmissions.find(sub => sub.sopId === asg.sopId && sub.assignmentId === asg.id) : null;
                                    const sopCompleted = sopSub?.status === 'completed';

                                    const btnList = [];

                                    // Drive Upload Button
                                    if (hasDrive && isRecording) {
                                        btnList.push(h('a', {
                                            href: asgClient.driveFolderUrl,
                                            target: '_blank',
                                            className: 'btn btn-outline text-xs py-1 px-3 flex items-center gap-1 font-bold',
                                            style: { color: 'var(--primary)', borderColor: 'rgba(var(--primary-rgb), 0.3)' }
                                        }, [icon('folder', 12), h('span', {}, 'Abrir Drive')]));
                                        
                                        btnList.push(h('button', {
                                            className: 'btn btn-primary text-xs py-1 px-3 flex items-center gap-1 font-bold',
                                            style: { background: 'var(--success)', borderColor: 'var(--success)', color: '#fff' },
                                            onClick: async (e) => {
                                                const btn = e.currentTarget;
                                                btn.disabled = true;
                                                try {
                                                    const descAddition = `\n\n[Auto] Medios subidos a la carpeta de Drive del cliente: ${asgClient.driveFolderUrl}`;
                                                    const newDesc = (asg.description || '') + descAddition;
                                                    await assignmentService.saveAssignment({ ...asg, status: 'Completado', description: newDesc });
                                                    loadAndRender();
                                                } catch(err) {
                                                    btn.disabled = false;
                                                    alert("Error al actualizar la tarea.");
                                                }
                                            }
                                        }, [icon('check', 12), h('span', {}, 'Medios Subidos')]));
                                        
                                        return h('div', { className: 'flex gap-2' }, btnList);
                                    }

                                    if (hasSop && sopObj && !sopCompleted) {
                                        return h('button', {
                                            className: 'btn btn-primary text-xs py-1 px-3 flex items-center gap-1 font-bold',
                                            style: { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' },
                                            onClick: () => openSopViewerModal(sopObj, asg, sopSub, loadAndRender)
                                        }, [icon('check-square', 12), h('span', {}, 'Llenar SOP')]);
                                    } else {
                                        return h('button', {
                                            className: 'btn btn-primary text-xs py-1 px-3 flex items-center gap-1 font-bold',
                                            style: { background: 'var(--success)', borderColor: 'var(--success)', color: '#fff' },
                                            onClick: async (e) => {
                                                const btn = e.currentTarget;
                                                btn.disabled = true;
                                                try {
                                                    await assignmentService.saveAssignment({ ...asg, status: 'Completado' });
                                                    loadAndRender();
                                                } catch(err) {
                                                    btn.disabled = false;
                                                    alert("Error al actualizar la tarea.");
                                                }
                                            }
                                        }, [icon('check', 12), h('span', {}, 'Completar')]);
                                    }
                                })() : null,

                                asg.status === 'Completado' && !asg.billed ? h('button', {
                                    className: 'btn btn-outline text-xs py-1 px-3 flex items-center gap-1 font-bold',
                                    style: { color: 'var(--success)', borderColor: 'rgba(var(--success-rgb), 0.3)' },
                                    onClick: async (e) => {
                                        const btn = e.currentTarget;
                                        openBillingModal(asg, async (price, obs) => {
                                            btn.disabled = true;
                                            try {
                                                let currentInv = await invoiceService.getEmployeeInvoice(user.uid);
                                                if (!currentInv) {
                                                    currentInv = { items: [] };
                                                } else if (!currentInv.items) {
                                                    currentInv.items = [];
                                                }
                                                
                                                const newItem = {
                                                    id: `item-${Date.now()}`,
                                                    type: asg.type,
                                                    client: asg.client,
                                                    title: asg.title,
                                                    price: price,
                                                    date: new Date().toISOString(),
                                                    observations: obs
                                                };
                                                
                                                currentInv.items.push(newItem);
                                                
                                                await invoiceService.saveEmployeeInvoice(user.uid, currentInv);
                                                
                                                await assignmentService.saveAssignment({ ...asg, status: 'Completado', billed: true });
                                                
                                                if (btn) showFeedback(btn, '✅ Cobrado');
                                                setTimeout(() => loadAndRender(), 1200);
                                            } catch (err) {
                                                console.error(err);
                                                if (btn) { showFeedback(btn, '✗ Error', 'error'); btn.disabled = false; }
                                            }
                                        });
                                    }
                                }, [icon('file-text', 12), h('span', {}, 'Cobrar Tarea')]) : null,
                                
                                asg.billed ? h('span', { className: 'badge badge-success text-xs flex items-center gap-1 font-bold', style: { padding: '4px 8px' } }, [icon('check-circle', 12), h('span', {}, 'Facturado')]) : null,

                                asg.status === 'Completado' || asg.status === 'Cancelado' ? h('button', {
                                    className: 'btn btn-outline text-xs py-1 px-3 flex items-center gap-1',
                                    style: { color: 'var(--text-muted)', borderColor: 'var(--border)' },
                                    onClick: async (e) => {
                                        const btn = e.currentTarget;
                                        btn.disabled = true;
                                        try {
                                            await assignmentService.saveAssignment({ ...asg, status: 'Pendiente' });
                                            loadAndRender();
                                        } catch(err) {
                                            btn.disabled = false;
                                            alert("Error al actualizar la tarea.");
                                        }
                                    }
                                }, [icon('rotate-ccw', 12), h('span', {}, 'Reabrir')]) : null,

                                asg.status !== 'Completado' && asg.status !== 'Cancelado' ? h('button', {
                                    className: 'btn btn-outline text-xs py-1 px-3 flex items-center gap-1',
                                    style: { color: 'var(--error)', borderColor: 'rgba(var(--error-rgb), 0.3)' },
                                    onClick: async (e) => {
                                        if (confirm('¿Estás seguro de que deseas cancelar esta asignación?')) {
                                            const btn = e.currentTarget;
                                            btn.disabled = true;
                                            try {
                                                await assignmentService.saveAssignment({ ...asg, status: 'Cancelado' });
                                                loadAndRender();
                                            } catch(err) {
                                                btn.disabled = false;
                                                alert("Error al cancelar la tarea.");
                                            }
                                        }
                                    }
                                }, [icon('x-circle', 12), h('span', {}, 'Cancelar')]) : null
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
                        onClick: () => openAssignmentModal(null, { users: approvedUsers, clients: finalClients, scripts: scripts || [], assets: assets || [], sops: sops || [] })
                    }, [icon('plus', 14), h('span', {}, 'Nueva Asignación')])
                ])
            ]);

            // Kanban Board for Admin
            const statuses = ['Pendiente', 'En Proceso', 'Completado'];
            
            const board = h('div', { className: 'kanban-board mt-4' }, 
                statuses.map(status => {
                    const colAsgs = assignments.filter(a => a.status === status || (status === 'En Proceso' && a.status === 'En Producción'));
                    
                    return h('div', { className: 'kanban-column' }, [
                        h('div', { className: 'kanban-column-header' }, [
                            h('span', {}, status),
                            h('span', { className: 'kanban-column-count' }, colAsgs.length)
                        ]),
                        h('div', { 
                            className: 'kanban-column-body',
                            ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); },
                            ondragleave: (e) => { e.currentTarget.classList.remove('drag-over'); },
                            ondrop: async (e) => {
                                e.preventDefault();
                                e.currentTarget.classList.remove('drag-over');
                                const asgId = e.dataTransfer.getData('text/plain');
                                if (!asgId) return;
                                const asg = assignments.find(a => a.id === asgId);
                                if (asg && asg.status !== status) {
                                    try {
                                        await assignmentService.updateAssignmentStatus(asgId, status);
                                        loadAndRender(); // Re-render to reflect changes
                                    } catch (err) {
                                        console.error(err);
                                        alert("Error actualizando estado");
                                    }
                                }
                            }
                        }, colAsgs.map(asg => {
                            const emp = approvedUsers.find(u => u.uid === asg.employeeId);
                            const empName = emp ? (emp.nombre || emp.email.split('@')[0]) : 'Sin Asignar';
                            const now = new Date();
                            const due = new Date(asg.dueDate);
                            const isExpired = due < now && asg.status !== 'Completado';
                            
                            return h('div', { 
                                className: 'kanban-card',
                                draggable: true,
                                ondragstart: (e) => {
                                    e.dataTransfer.setData('text/plain', asg.id);
                                    setTimeout(() => e.target.classList.add('dragging'), 0);
                                },
                                ondragend: (e) => {
                                    e.target.classList.remove('dragging');
                                },
                                onClick: () => openAssignmentModal(asg, { users: approvedUsers, clients: finalClients, scripts: scripts || [], assets: assets || [], sops: sops || [] })
                            }, [
                                h('div', { className: 'flex justify-between items-start mb-1' }, [
                                    h('div', { className: 'kanban-card-title mb-0 pr-2' }, asg.title),
                                    isExpired ? h('div', { className: 'badge badge-urgent', style: { padding: '2px', width: '8px', height: '8px', borderRadius: '50%' }, title: 'Atrasado' }) : null
                                ]),
                                h('div', { className: 'text-xs text-muted mb-2 truncate' }, `${asg.client} • ${asg.type}`),
                                h('div', { className: 'kanban-card-meta border-top pt-2 mt-2' }, [
                                    h('div', { className: 'flex items-center gap-1 font-medium', style: { color: 'var(--accent)' } }, [
                                        icon('user', 12),
                                        h('span', {}, empName)
                                    ]),
                                    h('div', { className: 'flex gap-1 items-center' }, [
                                        asg.billed ? h('span', { className: 'badge badge-success text-[10px] py-0 px-1' }, 'Cobrado') : null
                                    ])
                                ])
                            ]);
                        }))
                    ]);
                })
            );

            container.appendChild(header);
            container.appendChild(board);
            if (window.lucide) window.lucide.createIcons();

        } catch (err) {
            console.error("Assignments render failed:", err);
            container.innerHTML = `<div class="error-state text-sm p-10">${err.message.replace(/</g, "&lt;")}</div>`;
        }
    };

    const openAssignmentModal = (existing = null, context = {}) => {
        const overlay = h('div', { className: 'modal-overlay', style: { zIndex: 1000 } });
        let form; // Define form here so helpers can access it early
        
        const showMiniModal = (title, fields, onSubmit) => {
            const miniOverlay = h('div', { className: 'modal-overlay', style: { zIndex: 10000 } });
            const btnSubmit = h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, 'Guardar');
            
            const mForm = h('form', { 
                className: 'modal-container card fade-in', 
                style: { maxWidth: '350px' },
                onSubmit: async (e) => {
                    e.preventDefault();
                    btnSubmit.disabled = true;
                    btnSubmit.textContent = 'Guardando...';
                    const data = {};
                    fields.forEach(f => {
                        data[f.id] = mForm.querySelector(`#mini-${f.id}`).value;
                    });
                    try {
                        await onSubmit(data);
                        if (document.body.contains(miniOverlay)) document.body.removeChild(miniOverlay);
                    } catch (err) {
                        alert("Error: " + err.message);
                        btnSubmit.disabled = false;
                        btnSubmit.textContent = 'Guardar';
                    }
                }
            }, [
                h('div', { className: 'modal-header' }, [
                    h('span', { className: 'modal-title' }, title),
                    h('button', { type: 'button', onClick: () => document.body.removeChild(miniOverlay) }, '×')
                ]),
                h('div', { className: 'modal-body flex-column gap-3' }, fields.map(f => h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, f.label),
                    f.type === 'textarea' 
                        ? h('textarea', { id: `mini-${f.id}`, className: 'form-textarea text-xs', placeholder: f.placeholder, required: true, style: { minHeight: '100px' } })
                        : h('input', { id: `mini-${f.id}`, type: f.type || 'text', className: 'form-input text-xs', placeholder: f.placeholder, required: true })
                ]))),
                h('div', { className: 'modal-footer' }, [
                    h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => document.body.removeChild(miniOverlay) }, 'Cancelar'),
                    btnSubmit
                ])
            ]);
            miniOverlay.appendChild(mForm);
            document.body.appendChild(miniOverlay);
            setTimeout(() => {
                const firstInput = mForm.querySelector('input, textarea');
                if (firstInput) firstInput.focus();
            }, 50);
        };

        const handleCreateClient = () => {
            showMiniModal('Nuevo Cliente', [
                { id: 'name', label: 'Nombre del Cliente', placeholder: 'Ej. Villa Grande' }
            ], async (data) => {
                const id = data.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                await dbService.set('clients', id, { id, name: data.name, active: true });
                
                const sel = form.querySelector('#asg-client');
                const opt = document.createElement('option');
                opt.value = data.name;
                opt.text = data.name;
                opt.selected = true;
                sel.appendChild(opt);
                if(!context.clients) context.clients = [];
                context.clients.push({ id, name: data.name });
            });
        };

        const handleCreateScript = () => {
            const currentClient = form.querySelector('#asg-client')?.value || 'General';
            showMiniModal('Nuevo Guión', [
                { id: 'title', label: 'Título', placeholder: 'Ej. Video Promocional' },
                { id: 'script', label: 'Contenido del Guión', placeholder: 'Texto...', type: 'textarea' }
            ], async (data) => {
                const id = 'scr_' + Date.now();
                const doc = {
                    id, client: currentClient, title: data.title, script: data.script,
                    createdBy: user.uid, createdAt: new Date().toISOString()
                };
                await dbService.set('scripts', id, doc);
                
                const sel = form.querySelector('#asg-link-script');
                const opt = document.createElement('option');
                opt.value = data.script;
                opt.text = `[${currentClient}] ${data.title}`;
                opt.selected = true;
                sel.appendChild(opt);
                if(!context.scripts) context.scripts = [];
                context.scripts.push(doc);
                
                const textarea = form.querySelector('#asg-desc');
                if (textarea) textarea.value = (textarea.value ? textarea.value + '\n\n' : '') + data.script;
            });
        };

        const handleUploadAsset = () => {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*,video/*';
            fileInput.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                const currentClient = form.querySelector('#asg-client')?.value || 'General';
                showMiniModal('Detalles del Asset', [
                    { id: 'title', label: 'Título / Descripción', placeholder: 'Ej. Referencia de color' }
                ], async (data) => {
                    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
                    const path = `assets/${currentClient.replace(/\s+/g, '-')}/${Date.now()}_${safeName}`;
                    
                    const url = await storageService.uploadFile(path, file);
                    const assetDoc = {
                        id: 'ast_' + Date.now(), client: currentClient, title: data.title,
                        url: url, type: file.type.startsWith('video') ? 'video' : 'image',
                        uploadedBy: user.uid, createdAt: new Date().toISOString()
                    };
                    await dbService.set('assets', assetDoc.id, assetDoc);
                    
                    const sel = form.querySelector('#asg-link-asset');
                    const opt = document.createElement('option');
                    opt.value = url;
                    opt.text = `[${currentClient}] ${data.title}`;
                    opt.selected = true;
                    sel.appendChild(opt);
                    if(!context.assets) context.assets = [];
                    context.assets.push(assetDoc);
                    
                    const textarea = form.querySelector('#asg-desc');
                    if (textarea) textarea.value = (textarea.value ? textarea.value + '\n\n' : '') + `Referencia de Galería: ${url}`;
                });
            };
            fileInput.click();
        };
        
        const submit = async (e) => {
            e.preventDefault();
            const btnSubmit = form.querySelector('button[type="submit"]');
            if (btnSubmit) btnSubmit.disabled = true;

            const descVal = form.querySelector('#asg-desc').value.trim();
            if (descVal.split(/\s+/).length < 5) {
                alert("La guía / descripción debe contener al menos 5 palabras para dar suficiente contexto al equipo (Ej: En la parte 'Eventos especiales' poner clip de niños).");
                if (btnSubmit) btnSubmit.disabled = false;
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
                linkedAsset: form.querySelector('#asg-link-asset').value,
                sopId: form.querySelector('#asg-sop')?.value || null
            };

            try {
                await assignmentService.saveAssignment(formData);
                if (document.body.contains(overlay)) {
                    document.body.removeChild(overlay);
                }
                loadAndRender();
            } catch (err) {
                if (btnSubmit) btnSubmit.disabled = false;
                alert("Error guardando asignación.");
            }
        };

        form = h('form', { className: 'modal-container', onSubmit: submit }, [
            h('div', { className: 'modal-header' }, [
                h('span', { className: 'modal-title' }, existing ? 'Editar Asignación' : 'Nueva Asignación'),
                h('button', { type: 'button', onClick: () => document.body.contains(overlay) && document.body.removeChild(overlay) }, '×')
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
                    h('div', { className: 'flex justify-between items-center w-full mb-1' }, [
                        h('label', { className: 'form-label m-0' }, 'Cliente'),
                        h('button', { 
                            type: 'button', 
                            className: 'text-xs text-accent hover-underline flex items-center gap-1 font-bold',
                            onClick: handleCreateClient
                        }, [icon('plus', 10), h('span', {}, 'Crear Nuevo')])
                    ]),
                    h('select', { id: 'asg-client', className: 'form-select text-xs', required: true }, 
                        context.clients.map(c => h('option', { value: c.name, selected: existing?.client === c.name }, c.name))
                    )
                ]),
                h('div', { className: 'grid gap-3', style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' } }, [
                    h('div', { className: 'form-group' }, [
                        h('div', { className: 'flex justify-between items-center w-full mb-1' }, [
                            h('label', { className: 'form-label m-0' }, 'Vincular Guión'),
                            h('button', { 
                                type: 'button', 
                                className: 'text-xs text-accent hover-underline flex items-center gap-1 font-bold',
                                onClick: handleCreateScript
                            }, [icon('plus', 10), h('span', {}, 'Escribir Nuevo')])
                        ]),
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
                        h('div', { className: 'flex justify-between items-center w-full mb-1' }, [
                            h('label', { className: 'form-label m-0' }, 'Asset de Galería'),
                            h('button', { 
                                type: 'button', 
                                className: 'text-xs text-accent hover-underline flex items-center gap-1 font-bold',
                                onClick: handleUploadAsset
                            }, [icon('upload-cloud', 10), h('span', {}, 'Subir Nuevo')])
                        ]),
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
                    ]),
                    h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label mb-1' }, 'SOP Recomendado'),
                        h('select', { 
                            id: 'asg-sop', 
                            className: 'form-select text-xs',
                            style: { height: '38px' }
                        }, [
                            h('option', { value: '' }, '-- Sin Vincular --'),
                            ...(context.sops || []).map(s => h('option', { value: s.id, selected: existing?.sopId === s.id }, s.title))
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
                h('button', { 
                    type: 'button', 
                    className: 'btn btn-outline text-xs', 
                    onClick: () => {
                        if (confirm('¿Estás seguro de que deseas cancelar? Se perderán los datos no guardados.')) {
                            document.body.removeChild(overlay);
                        }
                    } 
                }, 'Cancelar'),
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
                h('button', { type: 'button', onClick: () => document.body.contains(overlay) && document.body.removeChild(overlay) }, '×')
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
                                if (document.body.contains(overlay)) document.body.removeChild(overlay);
                                openAssignmentModal(asg, { users: [emp], clients: context.clients, scripts: context.scripts || [], assets: context.assets || [], sops: context.sops || [] });
                            }
                        }, [icon('edit', 14)]),
                        h('button', { 
                            className: 'btn-icon text-error', 
                            onClick: async (e) => {
                                if (confirm('¿Eliminar esta asignación?')) {
                                    e.currentTarget.disabled = true;
                                    try {
                                        await assignmentService.deleteAssignment(asg.id);
                                        if (document.body.contains(overlay)) document.body.removeChild(overlay);
                                        loadAndRender();
                                    } catch(err) {
                                        e.currentTarget.disabled = false;
                                    }
                                }
                            }
                        }, [icon('trash-2', 14)])
                    ])
                ]))
            ),
            h('div', { className: 'modal-footer' }, [
                h('button', { className: 'btn btn-outline text-xs', onClick: () => document.body.contains(overlay) && document.body.removeChild(overlay) }, 'Cerrar')
            ])
        ]);
        overlay.appendChild(listContainer);
        document.body.appendChild(overlay);
    };

    loadAndRender();
    return container;
};

// --- SOP Viewer Modal ---
function openSopViewerModal(sop, asg, currentSub, reload) {
    const overlay = h('div', { className: 'modal-overlay' });
    let stepsData = currentSub?.steps || sop.steps.map(s => ({ done: false, userValue: '' }));
    const { user } = store.getState();

    const updateStep = async (idx, done, val) => {
        stepsData[idx] = { done, userValue: val };
        const isAllDone = stepsData.every(s => s.done);
        
        let subId = currentSub?.id || `sub-${sop.id}-${asg.id}`;
        
        const submissionData = {
            id: subId,
            sopId: sop.id,
            assignmentId: asg.id,
            userId: user.uid,
            status: isAllDone ? 'completed' : 'active',
            steps: stepsData,
            lastUpdated: new Date().toISOString(),
            completedAt: isAllDone ? new Date().toISOString() : null
        };
        
        await dbService.set('sop_submissions', subId, submissionData);

        if (isAllDone) {
            await assignmentService.saveAssignment({ ...asg, status: 'Completado' });
            overlay.remove();
            reload();
        } else {
            renderSteps();
        }
    };

    const stepsContainer = h('div', { className: 'flex-column gap-2' });
    const renderSteps = () => {
        stepsContainer.innerHTML = '';
        sop.steps.forEach((step, idx) => {
            const subData = stepsData[idx] || { done: false, userValue: '' };
            const row = h('div', { className: 'card p-3 flex-column gap-2', style: { border: '1px solid var(--border)' } }, [
                h('div', { className: 'flex gap-2 items-start' }, [
                    h('input', {
                        type: 'checkbox',
                        checked: subData.done,
                        style: { marginTop: '3px' },
                        onChange: (e) => updateStep(idx, e.target.checked, subData.userValue)
                    }),
                    h('span', { className: 'text-xs', style: { textDecoration: subData.done ? 'line-through' : 'none', opacity: subData.done ? 0.6 : 1 } }, step.text)
                ]),
                step.type === 'link' || step.type === 'text' ? h('input', {
                    type: 'text',
                    className: 'form-input text-xs mt-1',
                    placeholder: step.type === 'link' ? (step.linkPlaceholder || 'Ingresa el enlace aquí...') : (step.textDescription || 'Ingresa tu respuesta aquí...'),
                    value: subData.userValue,
                    onBlur: (e) => {
                        if (e.target.value !== subData.userValue) {
                            updateStep(idx, subData.done, e.target.value);
                        }
                    }
                }) : null
            ]);
            stepsContainer.appendChild(row);
        });
        if (window.lucide) window.lucide.createIcons();
    };

    renderSteps();

    const modal = h('div', { className: 'modal-container', style: { maxWidth: '600px' } }, [
        h('div', { className: 'modal-header' }, [
            h('span', { className: 'modal-title' }, `SOP: ${sop.title} - ${asg.client}`),
            h('button', { onClick: () => overlay.remove() }, '×')
        ]),
        h('div', { className: 'modal-body flex-column gap-3', style: { maxHeight: '70vh', overflowY: 'auto' } }, [
            sop.galleryImage ? h('img', { src: sop.galleryImage, style: { width: '100%', maxHeight: '150px', objectFit: 'cover', borderRadius: '6px' } }) : null,
            stepsContainer
        ])
    ]);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    if (window.lucide) window.lucide.createIcons();
}

// --- Billing Modal ---
function openBillingModal(asg, callback) {
    const overlay = h('div', { className: 'modal-overlay' });
    const isRecording = asg.type === 'Grabación' || asg.type === 'Creador 360° (Grabación + Edición)';
    const is360 = asg.type === 'Creador 360° (Grabación + Edición)';

    const contentDiv = h('div', { className: 'flex-column gap-3 mt-2' });
    
    // Inputs
    const minsInput = h('input', { type: 'number', className: 'form-input text-xs', placeholder: '0' });
    const editPriceInput = h('input', { type: 'number', className: 'form-input text-xs', placeholder: '0' });
    const genericPriceInput = h('input', { type: 'number', className: 'form-input text-xs', placeholder: '0' });

    if (isRecording) {
        contentDiv.appendChild(h('div', { className: 'flex-column gap-1' }, [
            h('label', { className: 'text-xs font-bold' }, 'Minutos de Grabación:'),
            h('span', { className: 'text-xs text-muted mb-1' }, '(Se multiplicará por $200 COP automáticamente)'),
            minsInput
        ]));

        if (is360) {
            contentDiv.appendChild(h('div', { className: 'flex-column gap-1 mt-2' }, [
                h('label', { className: 'text-xs font-bold' }, 'Cobro extra por Edición (Opcional):'),
                h('span', { className: 'text-xs text-muted mb-1' }, '¿Cuánto cobras por editar este material? (COP)'),
                editPriceInput
            ]));
        }
    } else {
        contentDiv.appendChild(h('div', { className: 'flex-column gap-1' }, [
            h('label', { className: 'text-xs font-bold' }, 'Monto a Cobrar (COP):'),
            h('span', { className: 'text-xs text-muted mb-1' }, 'Dejar en 0 si no aplica cobro extra por esta tarea.'),
            genericPriceInput
        ]));
    }

    const modal = h('div', { className: 'modal-container', style: { maxWidth: '400px' } }, [
        h('div', { className: 'modal-header' }, [
            h('span', { className: 'modal-title' }, `Liquidación: ${asg.title}`),
            h('button', { onClick: () => overlay.remove() }, '×')
        ]),
        h('div', { className: 'modal-body' }, [
            h('p', { className: 'text-xs text-muted mb-2' }, `Vas a registrar el cobro por la tarea de cliente: ${asg.client}.`),
            contentDiv
        ]),
        h('div', { className: 'modal-footer' }, [
            h('button', { className: 'btn btn-outline text-xs', onClick: () => overlay.remove() }, 'Cancelar'),
            h('button', {
                className: 'btn btn-primary text-xs',
                style: { background: 'var(--success)', borderColor: 'var(--success)' },
                onClick: () => {
                    let price = 0;
                    let obs = `Cobro por tarea: ${asg.title}`;

                    if (isRecording) {
                        const mins = Number(minsInput.value) || 0;
                        price = mins * 200;
                        obs = `Cobro por grabación (${mins} minutos a $200): ${asg.title}`;

                        if (is360) {
                            const editPrice = Number(editPriceInput.value) || 0;
                            price += editPrice;
                            obs += ` + Edición ($${editPrice})`;
                        }
                    } else {
                        price = Number(genericPriceInput.value) || 0;
                    }

                    overlay.remove();
                    callback(price, obs);
                }
            }, [icon('check', 12), h('span', { style: { marginLeft: '4px' } }, 'Confirmar Cobro')])
        ])
    ]);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    if (window.lucide) window.lucide.createIcons();
    
    // Focus first input
    setTimeout(() => {
        if (isRecording) minsInput.focus();
        else genericPriceInput.focus();
    }, 100);
}
