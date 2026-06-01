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
            // 1. Load Data
            const [users, assignments, clients, scripts, assets, sops, rates, mySopSubmissions] = await Promise.all([
                userService.getAllUsers(),
                assignmentService.getAllAssignments(),
                dbService.getAll('clients').catch(() => []),
                dbService.getAll('scripts').catch(() => []),
                dbService.getAll('assets').catch(() => []),
                dbService.getAll('sops').catch(() => []),
                invoiceService.getRateCards().catch(() => []),
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
                            h('li', {}, [h('span', { className: 'font-bold' }, '4. Completar y Cobrar: '), 'Dale a "Completar". El sistema te pedirá el monto a cobrar y cerrará la tarea.'])
                        ];
                    } else if (r.includes('editor')) {
                        return [
                            h('li', {}, [h('span', { className: 'font-bold' }, '1. Recepción: '), 'Revisa tu tarea. El líder te habrá notificado que los crudos están en Drive junto al Guion.']),
                            h('li', {}, [h('span', { className: 'font-bold' }, '2. Edición: '), 'Descarga los crudos, edita el video aplicando formatos virales y exporta el archivo final.']),
                            h('li', {}, [h('span', { className: 'font-bold' }, '3. Entrega: '), 'Sube el video final al Drive y manda el link por WhatsApp para revisión.']),
                            h('li', {}, [h('span', { className: 'font-bold' }, '4. Completar y Cobrar: '), 'Dale a "Completar" para añadir tu pago a la factura automáticamente.'])
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
                            h('li', {}, [h('span', { className: 'font-bold' }, '4. Auto-Cobro: '), 'Al hacer clic en "Completar", el sistema lanzará tu factura para asegurar tu pago.'])
                        ];
                    }
                };

                const roleNameDisplay = (user.role && user.role !== 'admin' && user.role !== 'viewer') 
                    ? user.role.charAt(0).toUpperCase() + user.role.slice(1) 
                    : 'Miembro del Equipo';

                container.appendChild(
                    h('div', { className: 'card p-4 flex-column gap-2 mb-4 w-full', style: { borderLeft: '4px solid var(--accent)', background: 'var(--bg-tertiary)' } }, [
                        h('h3', { className: 'text-sm font-bold flex items-center gap-2' }, [icon('info', 16, 'text-accent'), h('span', {}, `Guía de Flujo Operativo: ${roleNameDisplay}`)]),
                        h('ol', { className: 'text-xs text-muted pl-4 flex-column gap-1' }, 
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
                        className: 'card p-4 flex-column gap-3 interactive-card w-full'
                    }, [
                        h('div', { className: 'flex justify-between items-start flex-wrap gap-2' }, [
                            h('div', { className: 'flex-column gap-1' }, [
                                h('div', { className: 'flex items-center gap-2 flex-wrap' }, [
                                    h('span', { className: 'badge badge-secondary text-xs font-bold' }, asg.client),
                                    h('span', { className: `badge badge-${statusClass} text-xs font-semibold` }, asg.status === 'blocked' ? 'En espera de compañero' : asg.status),
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

                                    // Unified Deliverable UI
                                    const defaultLink = asg.uploadLink || (hasDrive ? asgClient.driveFolderUrl : '') || '';
                                    const inputId = `deliverable-input-${asg.id}`;

                                    return h('div', { 
                                        className: 'mt-3 p-3 border rounded', 
                                        style: { background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }
                                    }, [
                                        h('label', { className: 'text-xs font-bold mb-1 block' }, 'Enlace de Entregable (Drive, Frame.io, etc):'),
                                        h('div', { className: 'flex gap-2 items-center' }, [
                                            h('input', {
                                                id: inputId,
                                                type: 'url',
                                                className: 'form-input text-xs flex-grow',
                                                placeholder: 'https://...',
                                                defaultValue: defaultLink
                                            }),
                                            hasDrive && asgClient.driveFolderUrl ? h('a', {
                                                href: asgClient.driveFolderUrl,
                                                target: '_blank',
                                                className: 'btn btn-outline text-xs p-1 px-2',
                                                title: 'Abrir Drive del Cliente'
                                            }, [icon('folder', 14)]) : null
                                        ]),
                                        h('button', {
                                            className: 'btn btn-primary text-xs py-1.5 px-3 mt-2 w-full flex items-center justify-center gap-1 font-bold transition',
                                            style: { background: 'var(--success)', borderColor: 'var(--success)', color: '#fff' },
                                            onClick: async (e) => {
                                                const linkVal = document.getElementById(inputId).value.trim();
                                                if (!linkVal) { alert('Por favor, ingresa el enlace del entregable para poder continuar.'); return; }

                                                const btn = e.currentTarget;
                                                
                                                openBillingModal(asg, async (price, obs) => {
                                                    btn.disabled = true;
                                                    try {
                                                        let currentInv = await invoiceService.getEmployeeInvoice(user.uid);
                                                        if (!currentInv) currentInv = { items: [] };
                                                        else if (!currentInv.items) currentInv.items = [];
                                                        
                                                        const newItem = {
                                                            id: `item-${Date.now()}`,
                                                            type: asg.type,
                                                            client: asg.client,
                                                            title: asg.title,
                                                            amount: price,
                                                            date: new Date().toISOString(),
                                                            observations: obs
                                                        };
                                                        
                                                        const descAddition = `\n\n[Auto] Enlace Entregable: ${linkVal}`;
                                                        const newDesc = (asg.description || '') + descAddition;
                                                        
                                                        // Guardamos la tarea
                                                        await assignmentService.saveAssignment({ 
                                                            ...asg, 
                                                            status: 'Completado', 
                                                            billed: true,
                                                            uploadLink: linkVal,
                                                            description: newDesc
                                                        });
                                                        
                                                        try {
                                                            currentInv.items.push(newItem);
                                                            await invoiceService.saveEmployeeInvoice(user.uid, currentInv);
                                                        } catch (billingError) {
                                                            await assignmentService.saveAssignment({ ...asg, status: 'Pendiente', billed: false });
                                                            throw new Error("No se pudo guardar la factura.");
                                                        }
                                                        
                                                        if (btn) showFeedback(btn, '✅ Entregado');
                                                        setTimeout(() => loadAndRender(), 1200);
                                                    } catch (err) {
                                                        console.error(err);
                                                        if (btn) { showFeedback(btn, '✗ Error', 'error'); btn.disabled = false; }
                                                    }
                                                });
                                            }
                                        }, [icon('check-circle', 14), h('span', {}, 'Entregar y Completar')])
                                    ]);
                                })() : null,

                                // El botón "Cobrar Tarea" independiente fue removido para evitar duplicidad,
                                // ahora el cobro es automático al presionar "Completar".
                                
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

                                asg.status !== 'Completado' && asg.status !== 'Cancelado' && user.role === 'admin' ? h('button', {
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
                            asg.linkedAsset ? h('div', { className: 'p-2 bg-secondary mt-2 flex items-center justify-between card' }, [
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
                        style: { background: 'var(--success)', borderColor: 'var(--success)' },
                        onClick: () => openMasterPipelineModal({ users: approvedUsers, clients: finalClients, scripts: scripts || [], assets: assets || [], sops: sops || [], rates: rates || [] })
                    }, [icon('git-commit', 14), h('span', {}, 'Asignación Maestra')]),
                    h('button', { 
                        className: 'btn btn-primary text-xs',
                        onClick: () => openAssignmentModal(null, { users: approvedUsers, clients: finalClients, scripts: scripts || [], assets: assets || [], sops: sops || [], rates: rates || [] })
                    }, [icon('plus', 14), h('span', {}, 'Nueva Asignación')])
                ])
            ]);

            // Master Pipeline Board
            const renderMasterPipelines = () => {
                // Group assignments by projectId
                const pipelines = {};
                assignments.forEach(asg => {
                    if (asg.projectId && asg.status !== 'blocked') {
                        // wait, we need 'blocked' ones too to show the full pipeline!
                    }
                    if (asg.projectId) {
                        if (!pipelines[asg.projectId]) pipelines[asg.projectId] = [];
                        pipelines[asg.projectId].push(asg);
                    }
                });

                const pipelineIds = Object.keys(pipelines);
                if (pipelineIds.length === 0) return null;

                return h('div', { className: 'flex-column gap-3 mb-6' }, [
                    h('h3', { className: 'text-sm font-bold flex items-center gap-2 m-0 text-success' }, [
                        icon('git-merge', 16),
                        h('span', {}, 'Procesos Maestros Activos')
                    ]),
                    h('div', { className: 'grid gap-3', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' } }, 
                        pipelineIds.map(pid => {
                            const tasks = pipelines[pid].sort((a, b) => a.stageIndex - b.stageIndex);
                            const title = tasks[0]?.title.replace('[Grabación] ', '').replace('[Edición] ', '') || pid;
                            
                            // Check overall completion
                            const allDone = tasks.every(t => t.status === 'Completado');
                            
                            return h('div', { 
                                className: 'card p-3 flex-column gap-3 relative overflow-hidden',
                                style: { 
                                    borderLeft: `4px solid ${allDone ? 'var(--success)' : 'var(--accent)'}`,
                                    opacity: allDone ? '0.7' : '1'
                                }
                            }, [
                                h('div', { className: 'flex justify-between items-start' }, [
                                    h('div', { className: 'flex-column' }, [
                                        h('span', { className: 'font-bold text-xs', style: { wordBreak: 'break-all' } }, title),
                                        h('span', { className: 'text-[10px] text-muted' }, `ID: ${pid}`)
                                    ]),
                                    allDone ? h('span', { className: 'badge badge-success text-[10px]' }, 'Finalizado') : null
                                ]),
                                h('div', { className: 'flex items-center w-full gap-2 relative' }, [
                                    // Connecting line
                                    h('div', { 
                                        className: 'absolute', 
                                        style: { height: '2px', background: 'var(--border)', top: '12px', left: '20px', right: '20px', zIndex: 1 } 
                                    }),
                                    ...tasks.map((t, idx) => {
                                        const isDone = t.status === 'Completado';
                                        const isBlocked = t.status === 'blocked';
                                        const isActive = t.status === 'En Proceso' || t.status === 'Pendiente';
                                        
                                        const emp = approvedUsers.find(u => u.uid === t.employeeId);
                                        const avatarUrl = emp?.photoURL;
                                        
                                        let bubbleColor = 'var(--bg-tertiary)';
                                        let borderColor = 'var(--border)';
                                        let textColor = 'var(--text-muted)';
                                        
                                        if (isDone) {
                                            bubbleColor = 'rgba(var(--success-rgb), 0.1)';
                                            borderColor = 'var(--success)';
                                            textColor = 'var(--success)';
                                        } else if (isActive && !isBlocked) {
                                            bubbleColor = 'rgba(var(--accent-rgb), 0.1)';
                                            borderColor = 'var(--accent)';
                                            textColor = 'var(--accent)';
                                        }
                                        
                                        return h('div', { 
                                            className: 'flex-column items-center gap-1 flex-1 relative cursor-pointer', 
                                            style: { zIndex: 2 },
                                            title: `Ver detalles de ${t.title}`,
                                            onClick: () => openAssignmentModal(t, { users: approvedUsers, clients: finalClients, scripts: scripts || [], assets: assets || [], sops: sops || [] })
                                        }, [
                                            h('div', { 
                                                className: 'flex items-center justify-center rounded-full',
                                                style: { 
                                                    width: '24px', height: '24px', 
                                                    background: bubbleColor, border: `2px solid ${borderColor}`,
                                                    color: textColor
                                                }
                                            }, [
                                                isDone ? icon('check', 12) : isBlocked ? icon('lock', 12) : icon('clock', 12)
                                            ]),
                                            h('span', { className: 'text-[9px] font-bold mt-1 text-center', style: { color: textColor } }, t.type),
                                            h('span', { className: 'text-[9px] text-muted text-center', style: { maxWidth: '60px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, emp ? (emp.nombre || emp.email.split('@')[0]) : '?')
                                        ]);
                                    })
                                ]),
                                h('div', { className: 'flex justify-between items-center mt-3 pt-3 border-top w-full' }, [
                                    h('button', {
                                        className: 'btn btn-outline text-[10px] py-1 px-2 flex-1 mr-2',
                                        style: { borderColor: 'var(--accent)', color: 'var(--accent)' },
                                        onClick: () => {
                                            window.location.hash = `#ai-assistant?client=${tasks[0]?.client || ''}&context=Pipeline_${pid}`;
                                        }
                                    }, [icon('bot', 12), h('span', {}, 'Preguntar a RIA')]),
                                    user?.role === 'admin' ? h('button', {
                                        className: 'btn btn-outline text-[10px] py-1 px-2',
                                        onClick: () => openEditPipelineModal(pid, tasks, { users: approvedUsers, clients: finalClients, sops: sops || [] })
                                    }, [icon('edit', 12), h('span', {}, 'Editar / Eliminar')]) : null
                                ])
                            ]);
                        })
                    )
                ]);
            };

            const pipelineBoard = renderMasterPipelines();
            if (pipelineBoard) container.appendChild(pipelineBoard);

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
                            className: 'kanban-column-body'
                        }, colAsgs.map(asg => {
                            const emp = approvedUsers.find(u => u.uid === asg.employeeId);
                            const empName = emp ? (emp.nombre || emp.email.split('@')[0]) : 'Sin Asignar';
                            const now = new Date();
                            const due = new Date(asg.dueDate);
                            const isExpired = due < now && asg.status !== 'Completado';
                            
                            // If it's part of a pipeline, show more context in the title
                            let displayTitle = asg.title;
                            if (asg.projectId && asg.title.length < 15) {
                                // Attempt to find the pipeline context
                                const pipelineContext = assignments.find(a => a.projectId === asg.projectId && a.id !== asg.id)?.title.replace(/\[.*?\]\s*/g, '') || asg.projectId;
                                displayTitle = `${asg.title} - ${pipelineContext}`;
                            }
                            
                            return h('div', { 
                                className: 'card interactive-card kanban-card p-3 flex-column gap-2 cursor-pointer',
                                onClick: () => openAssignmentModal(asg, { users: approvedUsers, clients: finalClients, scripts: scripts || [], assets: assets || [], sops: sops || [] })
                            }, [
                                h('div', { className: 'flex justify-between items-start mb-1' }, [
                                    h('div', { className: 'text-sm font-bold mb-0 pr-2', style: { wordBreak: 'break-all' } }, displayTitle),
                                    isExpired ? h('div', { className: 'badge badge-urgent p-1 rounded-full', title: 'Atrasado' }) : null
                                ]),
                                h('div', { className: 'text-xs text-muted mb-2 truncate' }, `${asg.client} • ${asg.type}`),
                                h('div', { className: 'flex items-center justify-between border-top pt-2 mt-2' }, [
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
        const showMiniModal = (title, fields, onSubmit) => {
            const miniOverlay = document.createElement('div');
            miniOverlay.className = 'modal-overlay';
            miniOverlay.style.zIndex = '2000';
            
            const mForm = document.createElement('form');
            mForm.className = 'card p-4 text-left flex-column gap-3';
            mForm.style.width = '300px';
            
            const btnSubmit = h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, 'Guardar');
            
            mForm.addEventListener('submit', async (e) => {
                if (mForm.checkValidity()) {
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
            });

            mForm.appendChild(
                h('div', { className: 'modal-header' }, [
                    h('span', { className: 'modal-title' }, title),
                    h('button', { type: 'button', onClick: () => document.body.removeChild(miniOverlay) }, '×')
                ])
            );

            const bodyDiv = h('div', { className: 'modal-body flex-column gap-3' }, fields.map(f => {
                if (f.type === 'select') {
                    return h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label' }, f.label),
                        h('select', { id: `mini-${f.id}`, className: 'form-input text-xs', required: true }, 
                            f.options.map(o => {
                                const val = typeof o === 'object' ? o.value : o;
                                const lbl = typeof o === 'object' ? o.label : o;
                                return h('option', { value: val, selected: f.value === val }, lbl);
                            })
                        )
                    ]);
                } else if (f.type === 'textarea') {
                    return h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label' }, f.label),
                        h('textarea', { id: `mini-${f.id}`, className: 'form-textarea text-xs', placeholder: f.placeholder, required: true, style: { minHeight: '100px' } }, f.value || '')
                    ]);
                } else {
                    return h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label' }, f.label),
                        h('input', { id: `mini-${f.id}`, type: f.type || 'text', className: 'form-input text-xs', placeholder: f.placeholder, required: true, value: f.value || '' })
                    ]);
                }
            }));
            mForm.appendChild(bodyDiv);

            mForm.appendChild(
                h('div', { className: 'modal-footer' }, [
                    h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => document.body.removeChild(miniOverlay) }, 'Cancelar'),
                    btnSubmit
                ])
            );
            
            miniOverlay.appendChild(mForm);
            document.body.appendChild(miniOverlay);
            setTimeout(() => {
                const firstInput = mForm.querySelector('input, textarea, select');
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
                status: form.querySelector('#asg-status') ? form.querySelector('#asg-status').value : (existing?.status || 'Pendiente'),
                createdBy: user.uid,
                linkedScript: form.querySelector('#asg-link-script').value,
                linkedAsset: form.querySelector('#asg-link-asset').value,
                sopId: form.querySelector('#asg-sop')?.value || null
            };
            
            const rateVal = form.querySelector('#asg-rate')?.value;
            if (rateVal) {
                formData.billing = {
                    rateCardId: rateVal !== 'custom' ? rateVal : null,
                    customPrice: rateVal === 'custom' ? Number(prompt("Ingresa el Precio Personalizado ($):", existing?.billing?.customPrice || 0)) || 0 : null
                };
            }

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
                h('div', { className: 'grid gap-3', style: { gridTemplateColumns: '1fr 1fr' + (user.role === 'admin' ? ' 1fr' : '') } }, [
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
                    ]),
                    user.role === 'admin' ? h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label' }, 'Estado'),
                        h('select', { id: 'asg-status', className: 'form-select text-xs text-info font-bold' }, [
                            h('option', { value: 'blocked', selected: existing?.status === 'blocked' }, 'En espera (Blocked)'),
                            h('option', { value: 'Pendiente', selected: existing?.status === 'Pendiente' }, 'Pendiente'),
                            h('option', { value: 'En Proceso', selected: existing?.status === 'En Proceso' }, 'En Proceso'),
                            h('option', { value: 'En Producción', selected: existing?.status === 'En Producción' }, 'En Producción'),
                            h('option', { value: 'Completado', selected: existing?.status === 'Completado' }, 'Completado'),
                            h('option', { value: 'Cancelado', selected: existing?.status === 'Cancelado' }, 'Cancelado')
                        ])
                    ]) : null
                ].filter(Boolean)),
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
                h('div', { className: 'grid gap-3', style: { gridTemplateColumns: '1fr 1fr' } }, [
                    h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label' }, 'Fecha Límite'),
                        h('input', { id: 'asg-due', type: 'datetime-local', className: 'form-input', value: existing?.dueDate ? existing.dueDate.slice(0, 16) : '', required: true })
                    ]),
                    h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label' }, 'Tarifa / Pago Base'),
                        h('select', { id: 'asg-rate', className: 'form-select text-xs', required: true }, [
                            h('option', { value: '' }, '-- Selecciona Tarifa --'),
                            ...(context.rates || []).map(r => h('option', { value: r.id, selected: existing?.billing?.rateCardId === r.id }, `${r.name} ($${r.basePrice})`)),
                            h('option', { value: 'custom', selected: existing?.billing?.customPrice !== undefined }, 'Precio Personalizado')
                        ])
                    ])
                ]),
                h('div', { className: 'form-group mb-2' }, [
                    h('div', { className: 'flex justify-between items-end w-full mb-2' }, [
                        h('label', { className: 'form-label text-error font-bold m-0' }, 'Guía / Observaciones (Obligatorio, mín. 5 palabras)'),
                        h('div', { className: 'flex gap-2' }, [
                            h('button', {
                                type: 'button',
                                className: 'btn btn-outline text-[10px] py-1 px-2',
                                style: { borderColor: 'var(--accent)', color: 'var(--accent)' },
                                onClick: () => {
                                    const client = form.querySelector('#asg-client')?.value || '';
                                    if(confirm('Ir al Asistente IA cerrará esta ventana. ¿Continuar?')) {
                                        document.body.removeChild(overlay);
                                        window.location.hash = `#aiAssistant?client=${client}&context=Crear_Nueva_Asignacion`;
                                    }
                                }
                            }, [icon('bot', 12), h('span', {}, 'Pedir a RIA')]),
                            h('button', {
                                type: 'button',
                                className: 'btn btn-outline text-[10px] py-1 px-2',
                                onClick: handleUploadAsset
                            }, [icon('upload-cloud', 12), h('span', {}, 'Adjuntar Foto / Video')])
                        ])
                    ]),
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
                        user.role === 'admin' ? h('button', { 
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
                        }, [icon('trash-2', 14)]) : null
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
            // 1. Marcar completado
            const completedAsg = { ...asg, status: 'Completado', billed: true };
            await assignmentService.saveAssignment(completedAsg);

            // 2. Auto-Facturación (Tarifa dinámica o manual)
            try {
                // Determine rate
                let billingAmount = asg.billing?.customPrice || 0;
                if (!billingAmount && asg.billing?.rateCardId) {
                    const rates = await invoiceService.getRateCards();
                    const rate = rates.find(r => r.id === asg.billing.rateCardId);
                    if (rate) {
                        billingAmount = rate.rateType === 'per_minute' && asg.billing.minutes
                            ? rate.basePrice * asg.billing.minutes
                            : rate.basePrice;
                    }
                }

                if (billingAmount > 0) {
                    const invoiceItem = {
                        assignmentId: asg.id,
                        employeeName: user.name || user.email,
                        client: asg.client || 'General',
                        amount: billingAmount,
                        description: `[Auto-facturado] ${asg.title}`,
                        date: new Date().toISOString().split('T')[0]
                    };
                    // Employee invoice
                    await invoiceService.autoBilledItem(user.uid, false, invoiceItem);
                    // Admin consolidated invoice
                    await invoiceService.autoBilledItem(user.uid, true, invoiceItem);
                }
            } catch (err) {
                console.error("Error auto-facturando:", err);
            }

            // 3. Asignación Maestra Trigger (Desbloquear siguiente Fase)
            let needsAdminApproval = false;
            let driveLinkForWa = '';
            
            if (asg.projectId && asg.stageIndex !== undefined) {
                const allAsgs = await assignmentService.getAllAssignments();
                const nextPhase = allAsgs.find(a => a.projectId === asg.projectId && a.stageIndex === asg.stageIndex + 1);
                
                if (nextPhase) {
                    // Extraer enlace de drive del SOP actual
                    const driveLinkStep = stepsData.find((s, idx) => sop.steps[idx].type === 'link' || sop.steps[idx].text.toLowerCase().includes('enlace'));
                    const driveLink = driveLinkStep ? driveLinkStep.userValue : '';
                    if (driveLink) driveLinkForWa = driveLink;
                    
                    const descMsg = driveLink ? `\n\n--- Traspaso de Pipeline ---\nMaterial / Link: ${driveLink}` : '\n\n--- Traspaso de Pipeline ---';
                    
                    if (nextPhase.title.toLowerCase().includes('subida')) {
                        needsAdminApproval = true;
                        // NO cambiamos el status a 'Pendiente', se queda en 'blocked' (En espera)
                        await assignmentService.saveAssignment({
                            ...nextPhase,
                            description: (nextPhase.description || '') + descMsg
                        });
                    } else {
                        await assignmentService.saveAssignment({
                            ...nextPhase,
                            status: 'Pendiente', // Unlock it
                            description: (nextPhase.description || '') + descMsg
                        });
                    }
                }
            }

            let confirmMsg = '✅ ¡Asignación Completada! Factura validada y Pipeline actualizado.\n\n¿Deseas avisarle al jefe por WhatsApp que ya terminaste?';
            let waMsgText = `✅ *Tarea Completada*\n*Trabajo:* ${asg.title}\n*Cliente:* ${asg.client || 'General'}\n*Status:* Ya está lista y facturada en la plataforma.`;
            
            if (needsAdminApproval) {
                confirmMsg = '✅ ¡Asignación Completada!\n⚠️ La siguiente fase (Subida) requiere aprobación del Administrador.\n\n¿Notificar al líder por WhatsApp para que revise tu video y apruebe la subida?';
                waMsgText = `✅ *Video Listo para Revisión*\n*Trabajo:* ${asg.title}\n*Cliente:* ${asg.client || 'General'}\n*Material:* ${driveLinkForWa || 'En la plataforma'}\n\nPor favor, revísalo y aprueba la fase de "Subida" en la plataforma cuando estés listo.`;
            }

            if (confirm(confirmMsg)) {
                const adminPhone = "573000000000"; // Se puede cambiar después a config.adminPhone
                const msg = encodeURIComponent(waMsgText);
                window.open(`https://wa.me/${adminPhone}?text=${msg}`, '_blank');
            }
            overlay.remove();
            window.location.reload();
        } else {
            renderSteps();
        }
    };

    const stepsContainer = h('div', { className: 'flex-column gap-2' });
    const renderSteps = () => {
        stepsContainer.innerHTML = '';
        sop.steps.forEach((step, idx) => {
            const subData = stepsData[idx] || { done: false, userValue: '' };
            const msg = encodeURIComponent(`🚨 *SOS - Tarea Atascada*\n*Cliente:* ${asg?.client || 'N/A'}\n*Paso:* ${step.text}\n*Necesito ayuda con:* `);
            const adminPhone = "573000000000"; // Se puede cambiar después a config.adminPhone
            const waLink = `https://wa.me/${adminPhone}?text=${msg}`;

            const row = h('div', { className: 'card p-3 flex-column gap-2', style: { border: '1px solid var(--border)' } }, [
                h('div', { className: 'flex justify-between items-start gap-2 w-full' }, [
                    h('div', { className: 'flex gap-2 items-start' }, [
                        h('input', {
                            type: 'checkbox',
                            checked: subData.done,
                            style: { marginTop: '3px' },
                            onChange: (e) => updateStep(idx, e.target.checked, subData.userValue)
                        }),
                        h('span', { className: 'text-xs font-medium', style: { textDecoration: subData.done ? 'line-through' : 'none', opacity: subData.done ? 0.6 : 1 } }, step.text)
                    ]),
                    // Botón SOS WhatsApp
                    asg ? h('a', {
                        href: waLink,
                        target: '_blank',
                        className: 'btn text-[10px] flex items-center gap-1 font-bold transition hover-opacity',
                        style: { 
                            padding: '3px 8px', 
                            backgroundColor: 'rgba(37, 211, 102, 0.1)', 
                            color: '#25D366', 
                            border: '1px solid rgba(37, 211, 102, 0.3)',
                            borderRadius: '12px',
                            textDecoration: 'none'
                        },
                        title: 'Contactar al Jefe por WhatsApp'
                    }, [icon('message-circle', 12), h('span', {}, 'SOS')]) : null
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
        const firstInput = overlay.querySelector('input');
        if (firstInput) firstInput.focus();
    }, 100);
}

export function openMasterPipelineModal(context = {}) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay fade-in';
    overlay.style.zIndex = '1000';
    
    const submit = async (e) => {
        e.preventDefault();
        const form = e.target;
        const btnSubmit = form.querySelector('button[type="submit"]');
        btnSubmit.disabled = true;
        btnSubmit.textContent = "Creando...";
        
        const data = {
            title: form.querySelector('#mp-title').value,
            client: form.querySelector('#mp-client').value,
            description: form.querySelector('#mp-desc').value,
            dueDate: form.querySelector('#mp-due').value,
            camarografoId: form.querySelector('#mp-cam').value,
            editorId: form.querySelector('#mp-ed').value,
            uploaderId: form.querySelector('#mp-up').value,
            sopCamarografoId: form.querySelector('#mp-sop-cam').value || null,
            sopEditorId: form.querySelector('#mp-sop-ed').value || null,
            sopUploaderId: form.querySelector('#mp-sop-up').value || null,
            linkedScript: form.querySelector('#mp-script').value || '',
            linkedAsset: form.querySelector('#mp-asset').value || '',
            uploadLink: form.querySelector('#mp-up-link').value || '',
            createdBy: 'admin',
        };
        
        try {
            // dynamic import assignmentService to avoid scope issues
            const { assignmentService } = await import('../services/assignmentService.js');
            await assignmentService.createMasterPipeline(data);
            overlay.remove();
            window.location.reload(); 
        } catch(err) {
            alert('Error creating pipeline: ' + err.message);
            btnSubmit.disabled = false;
            btnSubmit.textContent = "Crear Pipeline";
        }
    };

    const usersHtml = (context.users || []).map(u => `<option value="${u.uid}">${u.nombre || u.email}</option>`).join('');
    const clientsHtml = (context.clients || []).map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    const sopsHtml = (context.sops || []).map(s => `<option value="${s.id}">${s.title}</option>`).join('');
    const scriptsHtml = (context.scripts || []).map(s => `<option value="${s.script}">[${s.client}] ${s.title}</option>`).join('');
    const assetsHtml = (context.assets || []).map(a => `<option value="${a.url || a.thumbnail}">[${a.client}] ${a.title}</option>`).join('');

    const modalHTML = `
        <form class="modal-container" style="max-width: 900px; max-height: 90vh; overflow-y: auto;">
            <div class="modal-header" style="background: linear-gradient(135deg, var(--success), #10b981); color: white;">
                <span class="modal-title font-bold">🚀 Nueva Asignación Maestra (Pipeline)</span>
                <button type="button" class="close-btn" style="color:white; background:none; border:none; font-size:1.5rem; cursor:pointer;">×</button>
            </div>
            <div class="modal-body grid gap-4" style="grid-template-columns: 1fr 1fr;">
                
                <!-- Columna Izquierda: Detalles Generales -->
                <div class="flex-column gap-3" style="border-right: 1px solid var(--border); padding-right: 1rem;">
                    <h3 class="text-sm font-bold text-accent">1. Detalles del Proyecto</h3>
                    
                    <div class="form-group">
                        <label class="form-label">Título del Proyecto</label>
                        <input type="text" id="mp-title" class="form-input" required placeholder="Ej. Reel de Verano Villagrande">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Cliente</label>
                        <select id="mp-client" class="form-select text-xs" required>${clientsHtml}</select>
                    </div>
                    <div class="form-group">
                        <label class="form-label flex justify-between items-center">
                            Guion (Script)
                            <button type="button" class="text-xs text-accent font-bold bg-transparent border-none cursor-pointer hover:underline" onclick="window.location.hash='#ai-assistant'; localStorage.setItem('ria_prefill', 'Créame un guion (create_script) detallado paso a paso para el cliente [CLIENTE] sobre [TEMA]. Asegúrate de incluir la puesta en escena (sceneDirections).'); document.querySelector('.modal-overlay').remove();">[+ Pedir a RIA]</button>
                        </label>
                        <select id="mp-script" class="form-select text-xs"><option value="">-- Sin Guion --</option>${scriptsHtml}</select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Asset (Galería)</label>
                        <select id="mp-asset" class="form-select text-xs"><option value="">-- Sin Asset --</option>${assetsHtml}</select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Descripción Global (Instrucciones)</label>
                        <textarea id="mp-desc" class="form-textarea text-xs" rows="4" required placeholder="Instrucciones que verán todos..."></textarea>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Fecha Límite Final (Uploader)</label>
                        <input type="date" id="mp-due" class="form-input" required>
                    </div>
                </div>

                <!-- Columna Derecha: El Equipo -->
                <div class="flex-column gap-3" style="padding-left: 0.5rem;">
                    <h3 class="text-sm font-bold text-success">2. Equipo de Trabajo (Fases)</h3>
                    
                    <div class="card p-3" style="background: rgba(var(--accent-rgb), 0.05); border: 1px solid var(--accent);">
                        <h4 class="text-xs font-bold mb-2">Fase 1: Grabación</h4>
                        <div class="form-group mb-2">
                            <label class="form-label text-[10px]">Asignar a</label>
                            <select id="mp-cam" class="form-select text-xs" required><option value="">-- Selecciona Empleado --</option>${usersHtml}</select>
                        </div>
                        <div class="form-group">
                            <label class="form-label text-[10px]">SOP Obligatorio</label>
                            <select id="mp-sop-cam" class="form-select text-xs" required><option value="">-- Selecciona SOP --</option>${sopsHtml}</select>
                        </div>
                    </div>

                    <div class="text-center text-muted" style="font-size: 1.2rem;">↓</div>

                    <div class="card p-3" style="background: rgba(var(--info-rgb), 0.05); border: 1px solid var(--info);">
                        <h4 class="text-xs font-bold mb-2">Fase 2: Edición (Automática)</h4>
                        <div class="form-group mb-2">
                            <label class="form-label text-[10px]">Asignar a</label>
                            <select id="mp-ed" class="form-select text-xs" required><option value="">-- Selecciona Empleado --</option>${usersHtml}</select>
                        </div>
                        <div class="form-group">
                            <label class="form-label text-[10px]">SOP Obligatorio</label>
                            <select id="mp-sop-ed" class="form-select text-xs" required><option value="">-- Selecciona SOP --</option>${sopsHtml}</select>
                        </div>
                    </div>
                    
                    <div class="text-center text-muted" style="font-size: 1.2rem;">↓</div>

                    <div class="card p-3" style="background: rgba(var(--warning-rgb), 0.05); border: 1px solid var(--warning);">
                        <h4 class="text-xs font-bold mb-2">Fase 3: Subida (Automática)</h4>
                        <div class="form-group mb-2">
                            <label class="form-label text-[10px]">Asignar a</label>
                            <select id="mp-up" class="form-select text-xs" required><option value="">-- Selecciona Empleado --</option>${usersHtml}</select>
                        </div>
                        <div class="form-group mb-2">
                            <label id="lbl-mp-up-link" class="form-label text-[10px]">Link/URL para publicar en redes sociales</label>
                            <input type="text" id="mp-up-link" class="form-input text-xs" placeholder="Ej. Link de TikTok, Google Drive, etc." required>
                        </div>
                        <div class="form-group">
                            <label class="form-label text-[10px]">SOP Obligatorio</label>
                            <select id="mp-sop-up" class="form-select text-xs" required><option value="">-- Selecciona SOP --</option>${sopsHtml}</select>
                        </div>
                    </div>
                </div>

            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline text-xs close-btn-footer">Cancelar</button>
                <button type="submit" class="btn btn-primary text-xs" style="background: var(--success); border-color: var(--success);">Crear Pipeline</button>
            </div>
        </form>
    `;
    
    overlay.innerHTML = modalHTML;
    
    const form = overlay.querySelector('form');
    const clientSelect = form.querySelector('#mp-client');
    const lblUpLink = form.querySelector('#lbl-mp-up-link');
    const inputUpLink = form.querySelector('#mp-up-link');
    if (clientSelect && lblUpLink) {
        clientSelect.addEventListener('change', () => {
            const clientName = clientSelect.options[clientSelect.selectedIndex]?.text || '';
            if (clientName && clientName !== '-- Selecciona Cliente --') {
                lblUpLink.textContent = `Publicar en redes sociales de ${clientName}`;
                inputUpLink.value = `Publicar en ${clientName}`;
            } else {
                lblUpLink.textContent = 'Link/URL para publicar en redes sociales';
            }
        });
    }
    
    overlay.querySelector('.close-btn').onclick = () => overlay.remove();
    overlay.querySelector('.close-btn-footer').onclick = () => overlay.remove();
    form.onsubmit = submit;
    
    // Build form fields
    const fields = [
        { id: 'type', label: 'Tipo de Tarea', type: 'select', options: ['Grabación', 'Edición', 'Diseño', 'Animación', 'Subida', 'Estrategia', 'Revisión'] },
        { id: 'client', label: 'Cliente', type: 'select', options: context.clients ? context.clients.map(c => c.name) : [] },
        { id: 'title', label: 'Título del Video / Proyecto', placeholder: 'Ej. Reel 1: Tips de Venta' },
        { id: 'description', label: 'Instrucciones Adicionales (Opcional)', type: 'textarea' },
        { id: 'employeeId', label: 'Asignar a', type: 'select', options: context.users ? context.users.map(u => ({ value: u.uid, label: u.nombre || u.email })) : [] },
        { id: 'dueDate', label: 'Fecha de Entrega', type: 'date' },
        { id: 'price', label: 'Precio a Pagar (Opcional)', type: 'number', placeholder: 'Ej. 5000' }
    ];
    
    const currentUser = store.getState().user;
    if (currentUser && currentUser.role === 'admin') {
        fields.push({ id: 'status', label: 'Estado', type: 'select', options: ['blocked', 'Pendiente', 'En Proceso', 'En Producción', 'Completado', 'Cancelado'] });
    }
    
    document.body.appendChild(overlay);
}

export function openEditPipelineModal(pid, tasks, context = {}) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const usersHtml = context.users ? context.users.map(u => `<option value="${u.uid}">${u.nombre || u.email.split('@')[0]}</option>`).join('') : '';
    
    // Sort tasks by stageIndex
    tasks.sort((a, b) => a.stageIndex - b.stageIndex);
    
    let modalHTML = `
        <form class="modal-container text-left flex-column" style="width: 90%; max-width: 600px; height: 90vh; max-height: 800px;" onsubmit="return false;">
            <div class="modal-header">
                <div>
                    <h2 class="modal-title font-bold flex items-center gap-2">✏️ Editar Pipeline</h2>
                    <p class="text-xs text-muted mt-1">Proyecto: ${tasks[0]?.title.replace(/\[.*?\]\s*/g, '') || pid}</p>
                </div>
                <button type="button" class="btn-icon close-btn-header">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
            </div>
            
            <div class="modal-body flex-1 overflow-y-auto pr-2 flex-column gap-4" style="background: var(--bg-tertiary);">
                
                <div class="flex-column gap-3">
                    <h3 class="text-sm font-bold text-primary mb-1">Fases del Pipeline</h3>
                    ${tasks.map(t => {
                        const emp = context.users ? context.users.find(u => u.uid === t.employeeId) : null;
                        return `
                            <div class="card p-3 flex-column gap-2" style="border: 1px solid var(--border);">
                                <div class="flex justify-between items-center">
                                    <div>
                                        <span class="badge badge-info text-[10px] mb-1">Fase ${t.stageIndex + 1} • ${t.type}</span>
                                        <h4 class="text-xs font-bold text-primary" style="margin: 0">${t.title}</h4>
                                    </div>
                                    <button type="button" class="btn btn-outline text-xs edit-task-btn" data-task-id="${t.id}" style="padding: 4px 8px;">
                                        Editar Tarea
                                    </button>
                                </div>
                                <div class="text-xs text-muted flex items-center gap-2 mt-1">
                                    <span>👤 Asignado a: <strong class="text-secondary">${emp ? (emp.nombre || emp.email.split('@')[0]) : 'Sin Asignar'}</strong></span>
                                    <span>•</span>
                                    <span>Estado: <strong>${t.status === 'blocked' ? 'En espera de compañero' : t.status}</strong></span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>

                <div class="card p-4 flex-column gap-3 mt-4" style="border: 1px solid var(--error-transparent);">
                    <h3 class="text-sm font-bold text-error flex items-center gap-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        Zona de Peligro
                    </h3>
                    <p class="text-xs text-muted mb-2">Eliminar este flujo borrará permanentemente todas las tareas y fases asociadas. Esta acción no se puede deshacer.</p>
                    <button type="button" id="btn-delete-pipeline" class="btn btn-outline text-xs text-error py-2" style="border-color: var(--error);">
                        Eliminar Pipeline Completo
                    </button>
                </div>
            </div>
            
            <div class="modal-footer">
                <button type="button" class="btn btn-outline text-xs close-btn-footer">Cerrar</button>
            </div>
        </form>
    `;

    overlay.innerHTML = modalHTML;
    
    overlay.querySelector('.close-btn-header').onclick = () => overlay.remove();
    overlay.querySelector('.close-btn-footer').onclick = () => overlay.remove();
    
    // Wire up Edit Task buttons
    overlay.querySelectorAll('.edit-task-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const taskId = btn.getAttribute('data-task-id');
            const task = tasks.find(t => t.id === taskId);
            if (task) {
                // We use openAssignmentModal to edit the specific task
                // Then reload when done
                openAssignmentModal(task, context);
                // We could close this modal, or keep it open in the background
            }
        });
    });

    const deleteBtn = overlay.querySelector('#btn-delete-pipeline');
    deleteBtn.addEventListener('click', async () => {
        if (confirm("🚨 ¿ESTÁS SEGURO? Se eliminarán todas las asignaciones de este flujo de trabajo.")) {
            deleteBtn.disabled = true;
            deleteBtn.textContent = 'Eliminando...';
            try {
                // Delete all tasks in the pipeline
                const { assignmentService } = await import('../services/assignmentService.js');
                for (const task of tasks) {
                    await assignmentService.deleteAssignment(task.id);
                }
                overlay.remove();
                // Reload
                const hash = window.location.hash;
                window.location.hash = '';
                setTimeout(() => { window.location.hash = hash; }, 50);
            } catch (err) {
                console.error("Error deleting pipeline", err);
                alert("Hubo un error al eliminar el pipeline.");
                deleteBtn.disabled = false;
                deleteBtn.textContent = 'Eliminar Pipeline Completo';
            }
        }
    });

    document.body.appendChild(overlay);
}
