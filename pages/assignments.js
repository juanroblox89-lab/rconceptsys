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

// Pre-declare regex to prevent es-module-lexer parse issues
const RE_BRACKET_PREFIX = /\[.*?\]\s*/g;
const RE_NON_NUMERIC = /[^0-9]/g;
const RE_UNICODE_ACCENT = /[\u0300-\u036f]/g;
const RE_WHITESPACE = /\s+/g;
const RE_SAFE_FILENAME = /[^a-zA-Z0-9.\-_]/g;
const RE_SAFE_ID = /[^a-z0-9-]/g;
const RE_QUOTE = /"/g;

let selectedProjectId = null;
let selectedAssignmentId = null;
let selectedPipelineStageIdx = 0; // default to stage 0 for split screen

const renderPipelineDetail = (pid, assignments, approvedUsers, finalClients, adminConfig, loadAndRender) => {
    const { user } = store.getState();
    const tasks = assignments.filter(a => a.projectId === pid).sort((a, b) => a.stageIndex - b.stageIndex);
    if (tasks.length === 0) {
        selectedProjectId = null;
        loadAndRender();
        return;
    }
    const sampleTask = tasks[0];
    const clientName = sampleTask.client || 'General';
    const title = sampleTask.title.replace('[Grabación] ', '').replace('[Edición] ', '').replace('[Subida] ', '') || pid;
    
    // Progress calculation
    const completedTasks = tasks.filter(t => t.status === 'Completado').length;
    const progressPct = Math.round((completedTasks / tasks.length) * 100);

    const activeStage = tasks[selectedPipelineStageIdx] || tasks[0];

    const detailContainer = h('div', { className: 'premium-detail-page' }, [
        // Top breadcrumb and actions
        h('div', { className: 'flex justify-between items-center border-bottom pb-4' }, [
            h('div', { className: 'flex items-center gap-2' }, [
                h('button', { 
                    className: 'btn btn-outline text-xs',
                    onClick: () => { selectedProjectId = null; loadAndRender(); }
                }, [icon('arrow-left', 14), h('span', {}, 'Volver')]),
                h('span', { className: 'text-muted text-xs' }, 'Proyectos / ' + clientName)
            ]),
            h('span', { className: 'badge badge-info text-xs' }, sampleTask.status || 'En producción')
        ]),

        // Project Hero info
        h('div', { className: 'grid gap-4', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' } }, [
            h('div', {}, [
                h('h1', { className: 'text-2xl font-bold m-0 text-primary' }, title),
                h('p', { className: 'text-xs text-muted mt-1' }, `Cliente: ${clientName}`)
            ]),
            h('div', { className: 'flex-column gap-1' }, [
                h('span', { className: 'text-[10px] text-muted uppercase font-bold' }, 'Progreso General'),
                h('div', { className: 'flex items-center gap-2' }, [
                    h('div', { className: 'pipeline-progress-bar', style: { flex: 1 } }, [
                        h('div', { className: 'pipeline-progress-fill', style: { width: `${progressPct}%` } })
                    ]),
                    h('span', { className: 'text-xs font-mono font-bold' }, `${progressPct}%`)
                ])
            ]),
            h('div', { className: 'flex gap-4' }, [
                h('div', { className: 'flex-column' }, [
                    h('span', { className: 'text-[10px] text-muted font-bold' }, 'FECHA INICIO'),
                    h('span', { className: 'text-xs font-medium' }, sampleTask.createdAt ? new Date(sampleTask.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '1 mayo')
                ]),
                h('div', { className: 'flex-column' }, [
                    h('span', { className: 'text-[10px] text-muted font-bold' }, 'FECHA LÍMITE'),
                    h('span', { className: 'text-xs font-medium text-warning' }, sampleTask.dueDate ? new Date(sampleTask.dueDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '17 mayo')
                ])
            ])
        ]),

        // Giant horizontal timeline
        h('div', { className: 'timeline-horizontal-giant' }, 
            tasks.map((t, idx) => {
                const isCompleted = t.status === 'Completado';
                const isActive = idx === selectedPipelineStageIdx;
                const isFuture = !isCompleted && !isActive;

                let stateClass = 'future';
                if (isCompleted) stateClass = 'completed';
                else if (isActive) stateClass = 'active';

                const emp = approvedUsers.find(u => u.uid === t.employeeId);
                const empName = emp ? (emp.nombre || emp.email.split('@')[0]) : 'Sin asignar';

                return h('div', { 
                    className: `timeline-giant-stage ${stateClass}`,
                    onClick: () => {
                        selectedPipelineStageIdx = idx;
                        loadAndRender();
                    }
                }, [
                    h('div', { className: 'stage-bubble-giant' }, [
                        isCompleted ? icon('check', 16) : h('span', {}, idx + 1)
                    ]),
                    h('span', { className: 'text-xs font-bold' }, t.type),
                    h('span', { className: 'text-[10px] text-muted' }, empName)
                ]);
            })
        ),

        // Split view when stage clicked
        h('div', { className: 'premium-split-layout mt-4' }, [
            // Left Column: Information
            h('div', { className: 'premium-info-section flex-column gap-4' }, [
                h('div', { className: 'border-bottom pb-3' }, [
                    h('h3', { className: 'text-sm font-bold text-primary flex items-center gap-2' }, [
                        icon('info', 16),
                        h('span', {}, `Detalles de la Etapa: ${activeStage.type}`)
                    ]),
                    h('p', { className: 'text-xs text-secondary mt-2' }, activeStage.title)
                ]),

                h('div', { className: 'flex-column gap-2' }, [
                    h('span', { className: 'text-[10px] text-muted font-bold' }, 'DESCRIPCIÓN / INSTRUCCIONES'),
                    h('p', { className: 'text-xs bg-tertiary p-3 rounded border text-secondary leading-relaxed' }, activeStage.description || 'Sin instrucciones adicionales.')
                ]),

                activeStage.linkedScript ? h('div', { className: 'flex-column gap-2' }, [
                    h('span', { className: 'text-[10px] text-muted font-bold' }, 'GUIÓN VINCULADO'),
                    h('div', { className: 'flex items-center gap-2 bg-secondary p-2 rounded border' }, [
                        icon('file-text', 14),
                        h('a', { href: activeStage.linkedScript, target: '_blank', className: 'text-xs text-accent hover-underline truncate', style: { maxWidth: '280px' } }, 'Ver archivo de guion'),
                        h('button', {
                            className: 'btn btn-outline text-[10px] py-1 px-2 ml-auto',
                            onClick: () => {
                                navigator.clipboard.writeText(activeStage.linkedScript);
                                alert('Link copiado al portapapeles');
                            }
                        }, 'Copiar Link')
                    ])
                ]) : null,

                activeStage.linkedAsset ? h('div', { className: 'flex-column gap-2' }, [
                    h('span', { className: 'text-[10px] text-muted font-bold' }, 'ASSETS / RECURSOS DE APOYO'),
                    h('div', { className: 'flex items-center gap-2 bg-secondary p-2 rounded border' }, [
                        icon('image', 14),
                        h('a', { href: activeStage.linkedAsset, target: '_blank', className: 'text-xs text-accent hover-underline truncate', style: { maxWidth: '280px' } }, 'Ver asset principal'),
                        h('button', {
                            className: 'btn btn-outline text-[10px] py-1 px-2 ml-auto',
                            onClick: () => {
                                navigator.clipboard.writeText(activeStage.linkedAsset);
                                alert('Link copiado al portapapeles');
                            }
                        }, 'Copiar Link')
                    ])
                ]) : null,

                // Quick buttons to modify status
                h('div', { className: 'flex gap-2 pt-2 border-top' }, [
                    h('button', {
                        className: 'btn btn-outline text-xs',
                        onClick: () => {
                            selectedAssignmentId = activeStage.id;
                            loadAndRender();
                        }
                    }, 'Abrir Detalle Completo de Tarea'),
                    user?.role === 'admin' ? h('button', {
                        className: 'btn btn-primary text-xs',
                        style: { background: 'var(--success)', borderColor: 'var(--success)' },
                        onClick: async () => {
                            if (confirm('¿Marcar esta fase como completada?')) {
                                await dbService.update('assignments', activeStage.id, { status: 'Completado' });
                                loadAndRender();
                            }
                        }
                    }, 'Completar Etapa') : null
                ])
            ]),

            // Right Column: Activity
            h('div', { className: 'premium-info-section flex-column gap-4' }, [
                h('h3', { className: 'text-sm font-bold text-primary flex items-center gap-2 border-bottom pb-3 m-0' }, [
                    icon('message-square', 16),
                    h('span', {}, 'Actividad & Comentarios')
                ]),

                // Activity timeline
                h('div', { className: 'activity-feed mt-2' }, [
                    h('div', { className: 'activity-item' }, [
                        h('div', { className: 'activity-dot success' }),
                        h('span', { className: 'text-[11px] font-bold text-secondary' }, 'Proyecto Iniciado'),
                        h('span', { className: 'text-[10px] text-muted' }, sampleTask.createdAt ? new Date(sampleTask.createdAt).toLocaleString() : '')
                    ]),
                    ...(activeStage.comments || []).map(c => {
                        return h('div', { className: 'activity-item' }, [
                            h('div', { className: 'activity-dot accent' }),
                            h('div', { className: 'flex justify-between items-center w-full' }, [
                                h('span', { className: 'text-[11px] font-bold text-primary' }, c.author),
                                h('span', { className: 'text-[9px] text-muted' }, new Date(c.date).toLocaleString())
                            ]),
                            h('p', { className: 'text-xs text-secondary bg-secondary p-2 rounded border m-0 leading-relaxed' }, c.text)
                        ]);
                    })
                ]),

                // Add comment form
                h('form', {
                    className: 'flex-column gap-2 mt-4 pt-3 border-top',
                    onSubmit: async (e) => {
                        e.preventDefault();
                        const input = e.target.querySelector('input');
                        if (!input.value.trim()) return;
                        
                        const comments = activeStage.comments || [];
                        comments.push({
                            author: user.nombre || user.email,
                            text: input.value.trim(),
                            date: new Date().toISOString(),
                            role: user.role
                        });
                        
                        await dbService.update('assignments', activeStage.id, { comments });
                        input.value = '';
                        loadAndRender();
                    }
                }, [
                    h('input', { type: 'text', placeholder: 'Escribe un comentario o actualización...', className: 'form-input text-xs', required: true }),
                    h('button', { type: 'submit', className: 'btn btn-outline text-xs' }, 'Enviar')
                ])
            ])
        ])
    ]);

    return detailContainer;
};

const renderAssignmentDetail = (asgId, assignments, approvedUsers, finalClients, adminConfig, loadAndRender) => {
    const { user } = store.getState();
    const asg = assignments.find(a => a.id === asgId);
    if (!asg) {
        selectedAssignmentId = null;
        loadAndRender();
        return;
    }

    const emp = approvedUsers.find(u => u.uid === asg.employeeId);
    const empName = emp ? (emp.nombre || emp.email.split('@')[0]) : 'Sin asignar';

    // Standard SOP items fallbacks
    const steps = [
        "Seleccionar hook adecuado",
        "Sincronizar y recortar subtítulos",
        "Corregir color y gradación premium",
        "Exportar en H.264 / 1080p vertical"
    ];
    const checkedSteps = asg.checkedSteps || [];
    const isCompleted = checkedSteps.length === steps.length;

    const detailContainer = h('div', { className: 'premium-detail-page' }, [
        // Top navbar
        h('div', { className: 'flex justify-between items-center border-bottom pb-4' }, [
            h('div', { className: 'flex items-center gap-2' }, [
                h('button', { 
                    className: 'btn btn-outline text-xs',
                    onClick: () => { selectedAssignmentId = null; loadAndRender(); }
                }, [icon('arrow-left', 14), h('span', {}, 'Volver')]),
                h('span', { className: 'text-muted text-xs' }, 'Asignaciones / Tarea / ' + asg.type)
            ]),
            h('div', { className: 'flex items-center gap-2' }, [
                asg.projectId ? h('button', {
                    className: 'btn btn-outline text-xs',
                    onClick: () => {
                        selectedProjectId = asg.projectId;
                        selectedAssignmentId = null;
                        loadAndRender();
                    }
                }, 'Ver Pipeline Completo') : null,
                h('span', { className: 'badge badge-accent text-xs' }, asg.status)
            ])
        ]),

        // Title and meta
        h('div', { className: 'grid gap-4 border-bottom pb-4', style: { gridTemplateColumns: '1.5fr 1fr' } }, [
            h('div', {}, [
                h('span', { className: 'text-xs text-accent uppercase font-bold' }, asg.type),
                h('h1', { className: 'text-2xl font-bold m-0 mt-1 text-primary' }, asg.title)
            ]),
            h('div', { className: 'grid gap-3 text-xs', style: { gridTemplateColumns: '1fr 1fr' } }, [
                h('div', {}, [
                    h('span', { className: 'text-[10px] text-muted block uppercase font-bold' }, 'Cliente'),
                    h('span', { className: 'font-medium' }, asg.client)
                ]),
                h('div', {}, [
                    h('span', { className: 'text-[10px] text-muted block uppercase font-bold' }, 'Responsable'),
                    h('span', { className: 'font-medium' }, empName)
                ]),
                h('div', {}, [
                    h('span', { className: 'text-[10px] text-muted block uppercase font-bold' }, 'Fecha Límite'),
                    h('span', { className: 'font-medium text-warning' }, asg.dueDate ? new Date(asg.dueDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' }) : '')
                ]),
                h('div', {}, [
                    h('span', { className: 'text-[10px] text-muted block uppercase font-bold' }, 'Precio Pactado'),
                    h('span', { className: 'font-medium text-success' }, asg.price ? `$${Number(asg.price).toLocaleString()}` : '$0')
                ])
            ])
        ]),

        // Split Layout
        h('div', { className: 'premium-split-layout' }, [
            // Left Column: Details & Checklist SOP
            h('div', { className: 'flex-column gap-5' }, [
                h('div', { className: 'premium-info-section flex-column gap-3' }, [
                    h('h3', { className: 'text-xs font-bold text-muted uppercase m-0' }, 'Información & Brief'),
                    h('p', { className: 'text-xs text-secondary leading-relaxed bg-tertiary p-3 rounded border m-0' }, asg.description || 'Sin descripción o instrucciones detalladas.')
                ]),

                // Checklist SOP
                h('div', { className: 'premium-info-section flex-column gap-3' }, [
                    h('div', { className: 'flex justify-between items-center' }, [
                        h('h3', { className: 'text-xs font-bold text-muted uppercase m-0' }, 'Checklist SOP Obligatorio'),
                        h('span', { className: 'text-[10px] text-muted' }, `${checkedSteps.length} de ${steps.length} completados`)
                    ]),
                    
                    // Checklist progress bar
                    h('div', { className: 'pipeline-progress-bar' }, [
                        h('div', { className: 'pipeline-progress-fill', style: { width: `${(checkedSteps.length / steps.length) * 100}%` } })
                    ]),

                    h('div', { className: 'flex-column gap-2 mt-2' }, 
                        steps.map((step, idx) => {
                            const isChecked = checkedSteps.includes(idx);
                            return h('div', {
                                className: `sop-checklist-item ${isChecked ? 'checked' : ''}`,
                                onClick: async () => {
                                    const nextChecked = [...checkedSteps];
                                    if (isChecked) {
                                        const i = nextChecked.indexOf(idx);
                                        if (i > -1) nextChecked.splice(i, 1);
                                    } else {
                                        nextChecked.push(idx);
                                    }
                                    await dbService.update('assignments', asg.id, { checkedSteps: nextChecked });
                                    loadAndRender();
                                }
                            }, [
                                h('div', { className: 'checkbox-custom' }, [
                                    isChecked ? icon('check', 12) : null
                                ]),
                                h('span', { className: 'text-xs text-primary' }, step)
                            ]);
                        })
                    )
                ]),

                // Entregables / Links
                h('div', { className: 'premium-info-section flex-column gap-3' }, [
                    h('h3', { className: 'text-xs font-bold text-muted uppercase m-0' }, 'Entregables & Recursos relacionados'),
                    h('div', { className: 'grid gap-2' }, [
                        h('div', { className: 'flex items-center gap-2 bg-secondary p-2 rounded border' }, [
                            icon('link', 14),
                            h('span', { className: 'text-xs text-secondary font-bold' }, 'Material original (Drive):'),
                            asg.sourceFilesLink ? h('a', { href: asg.sourceFilesLink, target: '_blank', className: 'text-xs text-accent hover-underline truncate' }, asg.sourceFilesLink) : h('span', { className: 'text-xs text-muted' }, 'No adjuntado')
                        ]),
                        h('div', { className: 'flex items-center gap-2 bg-secondary p-2 rounded border' }, [
                            icon('video', 14),
                            h('span', { className: 'text-xs text-secondary font-bold' }, 'Link de Entregable (Frame.io/Drive):'),
                            asg.uploadLink ? h('a', { href: asg.uploadLink, target: '_blank', className: 'text-xs text-accent hover-underline truncate' }, asg.uploadLink) : h('span', { className: 'text-xs text-muted' }, 'No adjuntado')
                        ])
                    ]),

                    // Submission Form (Employee action)
                    asg.status !== 'Completado' ? h('form', {
                        className: 'flex-column gap-2 mt-4 pt-3 border-top',
                        onSubmit: async (e) => {
                            e.preventDefault();
                            const linkVal = e.target.querySelector('#submit-link').value;
                            
                            // Check SOP completion first
                            if (checkedSteps.length < steps.length) {
                                alert("Por favor completa todos los pasos del Checklist SOP antes de entregar.");
                                return;
                            }

                            // We finalize the completion
                            const confirmCompletion = async () => {
                                await dbService.update('assignments', asg.id, { 
                                    status: 'Completado',
                                    uploadLink: linkVal,
                                    completedAt: new Date().toISOString()
                                });
                                // Trigger billing item addition
                                await invoiceService.autoBilledItem(asg);
                                selectedAssignmentId = null;
                                loadAndRender();
                            };

                            confirmCompletion();
                        }
                    }, [
                        h('label', { className: 'form-label text-[10px] font-bold text-muted uppercase' }, 'Enviar Entregable Final'),
                        h('input', { id: 'submit-link', type: 'url', placeholder: 'Pega el link final del video (Frame.io, Google Drive, Veed.io)', className: 'form-input text-xs', required: true }),
                        h('button', { type: 'submit', className: 'btn btn-primary text-xs w-full', style: { background: 'var(--success)', borderColor: 'var(--success)' } }, 'Completar & Cobrar')
                    ]) : null
                ])
            ]),

            // Right Column: Comments & Activity
            h('div', { className: 'premium-info-section flex-column gap-4' }, [
                h('h3', { className: 'text-sm font-bold text-primary flex items-center gap-2 border-bottom pb-3 m-0' }, [
                    icon('message-square', 16),
                    h('span', {}, 'Actividad & Comentarios')
                ]),

                h('div', { className: 'activity-feed mt-2' }, [
                    h('div', { className: 'activity-item' }, [
                        h('div', { className: 'activity-dot success' }),
                        h('span', { className: 'text-[11px] font-bold text-secondary' }, 'Tarea creada'),
                        h('span', { className: 'text-[10px] text-muted' }, asg.createdAt ? new Date(asg.createdAt).toLocaleString() : '')
                    ]),
                    ...(asg.comments || []).map(c => {
                        return h('div', { className: 'activity-item' }, [
                            h('div', { className: 'activity-dot accent' }),
                            h('div', { className: 'flex justify-between items-center w-full' }, [
                                h('span', { className: 'text-[11px] font-bold text-primary' }, c.author),
                                h('span', { className: 'text-[9px] text-muted' }, new Date(c.date).toLocaleString())
                            ]),
                            h('p', { className: 'text-xs text-secondary bg-secondary p-2 rounded border m-0 leading-relaxed' }, c.text)
                        ]);
                    })
                ]),

                h('form', {
                    className: 'flex-column gap-2 mt-4 pt-3 border-top',
                    onSubmit: async (e) => {
                        e.preventDefault();
                        const input = e.target.querySelector('input');
                        if (!input.value.trim()) return;

                        const comments = asg.comments || [];
                        comments.push({
                            author: user.nombre || user.email,
                            text: input.value.trim(),
                            date: new Date().toISOString(),
                            role: user.role
                        });

                        await dbService.update('assignments', asg.id, { comments });
                        input.value = '';
                        loadAndRender();
                    }
                }, [
                    h('input', { type: 'text', placeholder: 'Escribe un comentario...', className: 'form-input text-xs', required: true }),
                    h('button', { type: 'submit', className: 'btn btn-outline text-xs' }, 'Comentar')
                ])
            ])
        ])
    ]);

    return detailContainer;
};

export const render = async () => {
    const { user } = store.getState();
    const isAdmin = user?.role === 'admin';
    
    const container = h('div', { className: 'fade-in flex-column gap-6' });

    const loadAndRender = async () => {
        container.innerHTML = '<div class="loader mb-4"></div>';

        try {
            // 1. Load Data
            const [users, assignments, clients, scripts, assets, rates, mySopSubmissions, systemPricing] = await Promise.all([
                userService.getAllUsers(),
                assignmentService.getAllAssignments(),
                dbService.getAll('clients').catch(() => []),
                dbService.getAll('scripts').catch(() => []),
                dbService.getAll('assets').catch(() => []),
                invoiceService.getRateCards().catch(() => []),
                (!isAdmin && user) ? dbService.getByQuery('sop_submissions', 'userId', '==', user.uid).catch(() => []) : Promise.resolve([]),
                dbService.getById('system_config', 'pricing').catch(() => ({}))
            ]);
            const adminConfig = systemPricing || {};
            const adminPhone = adminConfig.adminPhone || '573000000000';

            const approvedUsers = users.filter(u => u.approved && u.role !== 'admin');
            let finalClients = clients || [];
            if (!isAdmin && user.allowedClients) {
                finalClients = finalClients.filter(c => user.allowedClients.includes(c.id));
            }
            
            container.innerHTML = '';

            // Handle sub-pages
            if (selectedProjectId) {
                container.appendChild(renderPipelineDetail(selectedProjectId, assignments, approvedUsers, finalClients, adminConfig, loadAndRender));
                if (window.lucide) window.lucide.createIcons();
                return;
            }
            if (selectedAssignmentId) {
                container.appendChild(renderAssignmentDetail(selectedAssignmentId, assignments, approvedUsers, finalClients, adminConfig, loadAndRender));
                if (window.lucide) window.lucide.createIcons();
                return;
            }

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
                    h('div', { className: 'flex items-center gap-2' }, [
                        h('button', {
                            className: 'btn btn-outline text-xs py-1 px-2 flex items-center gap-1 font-bold',
                            style: { color: 'var(--accent)', borderColor: 'rgba(var(--accent-rgb), 0.3)' },
                            onClick: () => {
                                const dismissKey = `guideDismissed_${user.uid}`;
                                localStorage.removeItem(dismissKey);
                                loadAndRender();
                            }
                        }, [icon('info', 12), h('span', {}, 'Ver Guía')]),
                        h('span', { className: 'badge text-xs font-mono font-bold' }, `Total: ${totalVisible} Tareas`)
                    ])
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
                            h('li', {}, [h('span', { className: 'font-bold' }, '2. Ejecuta: '), 'Ejecuta la tarea asignada.']),
                            h('li', {}, [h('span', { className: 'font-bold' }, '3. Completar: '), 'Al terminar, la tarea se marcará como Completada automáticamente.']),
                            h('li', {}, [h('span', { className: 'font-bold' }, '4. Auto-Cobro: '), 'Al hacer clic en "Completar", el sistema lanzará tu factura para asegurar tu pago.'])
                        ];
                    }
                };

                const roleNameDisplay = (user.role && user.role !== 'admin' && user.role !== 'viewer') 
                    ? user.role.charAt(0).toUpperCase() + user.role.slice(1) 
                    : 'Miembro del Equipo';

                // (Guide moved to bottom as collapsible accordion)

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
                        className: 'card p-4 flex-column gap-3 interactive-card w-full cursor-pointer',
                        onClick: () => { selectedAssignmentId = asg.id; loadAndRender(); }
                    }, [
                        h('div', { className: 'flex justify-between items-start flex-wrap gap-2' }, [
                            h('div', { className: 'flex-column gap-1' }, [
                                h('div', { className: 'flex items-center gap-2 flex-wrap' }, [
                                    h('span', { className: 'badge badge-secondary text-xs font-bold' }, asg.client),
                                    h('span', { className: `badge badge-${statusClass} text-xs font-semibold` }, asg.status === 'blocked' ? 'En espera de compañero' : asg.status),
                                    isExpired ? h('span', { className: 'badge badge-urgent text-xs font-bold' }, '⚠️ ATRASADO') : null,
                                    isToday ? h('span', { className: 'badge badge-today text-xs font-bold' }, '⚡ HOY') : null,
                                ]),
                                h('h3', { className: 'text-sm font-bold text-primary mt-1' }, asg.title),
                                // sourceFilesLink replaced by review flow below
                            ]),
                            h('div', { className: 'flex items-center gap-2' }, [
                                // Action buttons
                                asg.status === 'Pendiente' ? (() => {
                                    const prevTask = typeof asg.stageIndex !== 'undefined' ? assignments.find(a => a.projectId === asg.projectId && a.stageIndex === asg.stageIndex - 1) : null;
                                    const prevWorker = prevTask ? approvedUsers.find(u => u.uid === prevTask.employeeId || u.id === prevTask.employeeId) : null;
                                    
                                    if (prevTask && prevTask.uploadLink) {
                                        return h('div', { className: 'flex-column gap-2 p-3 border mt-2 w-full transition', style: { background: 'var(--bg-tertiary)', borderColor: 'var(--success)', borderRadius: '8px' } }, [
                                            h('div', { className: 'text-xs text-primary font-bold flex items-center gap-2 mb-1' }, [
                                                icon('package', 16, 'text-success'), 
                                                h('span', {}, `📦 Materiales de la Fase Anterior: ${prevTask.title}`)
                                            ]),
                                            h('div', { className: 'text-[11px] text-muted mb-2' }, `Entregados por ${prevWorker ? prevWorker.nombre.split(' ')[0] : 'tu compañero'}. Revísalos antes de empezar.`),
                                            h('div', { className: 'flex items-center gap-2 flex-wrap mb-2' }, [
                                                h('a', { 
                                                    href: prevTask.uploadLink, 
                                                    target: '_blank', 
                                                    className: 'btn btn-primary text-xs py-2 px-3 flex items-center gap-2 font-bold w-full justify-center transform hover:scale-105 transition', 
                                                    style: { background: 'var(--accent)', borderColor: 'var(--accent)', color: 'white', borderRadius: '6px' } 
                                                }, [icon('folder-open', 16), h('span', {}, 'Abrir Archivos de Trabajo (Drive/Web)')])
                                            ]),
                                            h('div', { className: 'text-[11px] font-bold mt-1 text-center' }, '¿Están correctos los materiales?'),
                                            h('div', { className: 'flex items-center gap-2 flex-wrap mt-1 justify-center' }, [
                                                h('button', {
                                                    className: 'btn btn-outline text-xs py-1 px-3 flex items-center gap-1 font-bold',
                                                    style: { borderColor: 'var(--success)', color: 'var(--success)' },
                                                    onClick: async (e) => {
                                                        const btn = e.currentTarget; btn.disabled = true;
                                                        try { await assignmentService.saveAssignment({ ...asg, status: 'En Proceso' }); loadAndRender(); }
                                                        catch(err) { btn.disabled = false; alert("Error al actualizar la tarea."); }
                                                    }
                                                }, [icon('check-circle', 14), h('span', {}, 'Sí, Empezar')]),
                                                h('button', {
                                                    className: 'btn btn-outline text-xs py-1 px-3 flex items-center gap-1 font-bold',
                                                    style: { borderColor: 'var(--warning)', color: 'var(--warning)' },
                                                    onClick: async () => {
                                                        const just = prompt('Razón para devolver la tarea:');
                                                        if (!just) return;
                                                        try {
                                                            await assignmentService.saveAssignment({ ...asg, status: 'blocked' }); // Block original task
                                                            await assignmentService.saveAssignment({
                                                                id: `corr-${crypto.randomUUID().split('-')[0]}`,
                                                                title: `Corrección: ${prevTask.title}`,
                                                                description: `Devuelto por la fase siguiente.\n\nRazón: ${just}\n\nPor favor, sube el nuevo material corregido aquí.`,
                                                                type: prevTask.type,
                                                                client: prevTask.client,
                                                                employeeId: prevTask.employeeId,
                                                                status: 'En Proceso',
                                                                dueDate: new Date(Date.now() + 86400000).toISOString(),
                                                                projectId: prevTask.projectId,
                                                                stageIndex: prevTask.stageIndex,
                                                                billing: { customPrice: 0 }
                                                            });
                                                            alert('Tarea devuelta con éxito.');
                                                            loadAndRender();
                                                        } catch(e) { alert('Error al devolver la tarea.'); }
                                                    }
                                                }, [icon('corner-up-left', 14), h('span', {}, 'Devolver')]),
                                                h('button', {
                                                    className: 'btn btn-icon text-muted p-1',
                                                    title: 'Contactar por WhatsApp',
                                                    onClick: () => {
                                                        const phone = prevWorker?.phone ? prevWorker.phone.replace(RE_NON_NUMERIC, '') : adminPhone;
                                                        const msg = prevWorker ? `Hola ${prevWorker.nombre.split(' ')[0]}, el material de la tarea *${asg.title}* está incompleto o tiene un problema. ¿Puedes revisarlo?` : `Hola, reporto un problema con los materiales de la tarea *${asg.title}*.`;
                                                        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
                                                    }
                                                }, [icon('message-circle', 14)])
                                            ])
                                        ]);
                                    } else {
                                        return h('button', {
                                            className: 'btn btn-outline text-xs py-1 px-3 flex items-center gap-1 font-bold mt-2',
                                            style: { color: 'var(--info)', borderColor: 'rgba(var(--info-rgb), 0.3)' },
                                            onClick: async (e) => {
                                                const btn = e.currentTarget; btn.disabled = true;
                                                try { await assignmentService.saveAssignment({ ...asg, status: 'En Proceso' }); loadAndRender(); }
                                                catch(err) { btn.disabled = false; alert("Error al actualizar la tarea."); }
                                            }
                                        }, [icon('play', 12), h('span', {}, 'Empezar Tarea')]);
                                    }
                                })() : null,

                                (asg.status === 'Pendiente' || asg.status === 'En Proceso' || asg.status === 'En Producción') ? (() => {
                                    const asgClient = finalClients.find(c => c.name === asg.client || c.id === asg.client);
                                    const hasDrive = asgClient && asgClient.driveFolderUrl;
                                    
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
                                            style: { background: 'var(--success)', borderColor: 'var(--success)', color: 'var(--bg-primary)' },
                                            onClick: async (e) => {
                                                const linkVal = document.getElementById(inputId).value.trim();
                                                if (!linkVal) { alert('Por favor, ingresa el enlace del entregable para poder continuar.'); return; }

                                                const btn = e.currentTarget;
                                                if (btn.disabled) return;
                                                btn.disabled = true;
                                                
                                                const finalizeCompletion = async (price, obs) => {
                                                    try {
                                                        let currentInv = await invoiceService.getEmployeeInvoice(user.uid);
                                                        if (!currentInv) currentInv = { items: [] };
                                                        else if (!currentInv.items) currentInv.items = [];
                                                        
                                                        const newItem = {
                                                            id: `item-${crypto.randomUUID().split('-')[0]}`,
                                                            assignmentId: asg.id,
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
                                                        
                                                        if (btn) btn.textContent = '✅ Entregado';
                                                        setTimeout(() => window.location.reload(), 1200);
                                                    } catch (err) {
                                                        console.error(err);
                                                        if (btn) { btn.textContent = '✗ Error'; btn.disabled = false; }
                                                    }
                                                };

                                                if (asg.billing && (asg.billing.rateCardId || asg.billing.customPrice !== null)) {
                                                    let finalPrice = asg.billing.customPrice !== null ? asg.billing.customPrice : 0;
                                                    let finalObs = 'Cobro pre-configurado';
                                                    if (asg.billing.rateCardId === 'default') {
                                                        if (asg.type === 'Grabación') {
                                                            const mins = Number(prompt('¿Cuántos minutos de grabación efectivos reportas? (Ej: 60)', '60'));
                                                            if (!mins) { if (btn) btn.disabled = false; return; }
                                                            finalPrice = (adminConfig.precioMinutoGrabacion || 200) * mins;
                                                            finalObs = `Cobro Grabación (${mins} mins): ${asg.title}`;
                                                        } else if (asg.type === 'Subida') {
                                                            finalPrice = adminConfig.precioSubidaRedes || 10000;
                                                            finalObs = `Cobro Subida Redes: ${asg.title}`;
                                                        } else if (asg.type === 'Edición') {
                                                            const isLong = confirm('¿El video es mayor a 60 segundos? (Aceptar = Sí, Cancelar = No)');
                                                            finalPrice = isLong ? (adminConfig.precioVideoLargo || 25000) : (adminConfig.precioVideoCorto || 15000);
                                                            finalObs = `Cobro Edición ${isLong ? '>60s' : '<60s'}: ${asg.title}`;
                                                        } else {
                                                            finalPrice = 15000;
                                                            finalObs = `Cobro base predeterminado: ${asg.title}`;
                                                        }
                                                    } else if (asg.billing.rateCardId && rates) {
                                                        const rate = rates.find(r => r.id === asg.billing.rateCardId);
                                                        if (rate) {
                                                            finalPrice = rate.basePrice;
                                                            finalObs = `Cobro por tarifa ${rate.name}: ${asg.title}`;
                                                        }
                                                    } else if (asg.billing.customPrice !== null) {
                                                        finalObs = `Cobro personalizado: ${asg.title}`;
                                                    }
                                                    await finalizeCompletion(finalPrice, finalObs);
                                                } else {
                                                    openBillingModal(asg, finalizeCompletion, () => {
                                                        if (btn) btn.disabled = false;
                                                    });
                                                }
                                            }
                                        }, [icon('check-circle', 14), h('span', {}, 'Entregar y Completar')])
                                    ]);
                                })() : null,
                                
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
                                }, [icon('x-circle', 12), h('span', {}, 'Cancelar')]) : null,

                                // WhatsApp: Contact boss with context
                                asg.status !== 'Completado' && asg.status !== 'Cancelado' ? h('a', {
                                    href: `https://wa.me/${adminPhone}?text=${encodeURIComponent(`📋 *Contexto de Tarea*\n👤 *Colaborador:* ${user.nombre || user.email}\n📁 *Tarea:* ${asg.title}\n👥 *Cliente:* ${asg.client || 'General'}\n⚡ *Estado:* ${asg.status}\n📋 *Tipo:* ${asg.type || 'N/A'}\n${asg.description ? '\n📝 *Detalle:* ' + asg.description.slice(0, 120) : ''}\n\n❓ Mensaje del colaborador:`)}`,
                                    target: '_blank',
                                    className: 'btn text-xs py-1 px-3 flex items-center gap-1 font-bold',
                                    style: {
                                        backgroundColor: 'rgba(37, 211, 102, 0.12)',
                                        color: '#25D366',
                                        border: '1px solid rgba(37, 211, 102, 0.3)',
                                        borderRadius: '6px',
                                        textDecoration: 'none'
                                    },
                                    title: 'Contactar al Jefe con contexto automático de esta tarea'
                                }, [icon('message-circle', 12), h('span', {}, 'Jefe')]) : null
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

                // Dismissable work guide at the top
                const guideSteps = getRoleSpecificGuide(user.role);
                const dismissKey = `guideDismissed_${user.uid}`;
                const isDismissed = localStorage.getItem(dismissKey) === 'true';

                let guideAlert = null;
                if (!isDismissed) {
                    guideAlert = h('div', { 
                        className: 'flex-column gap-2 p-4 mb-4 relative fade-in', 
                        style: { 
                            background: 'var(--bg-tertiary)', 
                            border: '1px solid var(--accent)', 
                            borderRadius: '8px'
                        } 
                    }, [
                        h('button', {
                            type: 'button',
                            className: 'absolute top-2 right-2 text-muted hover-opacity p-1',
                            onClick: (e) => {
                                localStorage.setItem(dismissKey, 'true');
                                const p = e.currentTarget.parentNode;
                                if (p && p.parentNode) p.parentNode.removeChild(p);
                            }
                        }, icon('x', 14)),
                        h('div', { className: 'flex items-center gap-2 mb-1' }, [
                            icon('info', 16, 'text-accent'),
                            h('h4', { className: 'font-bold text-sm m-0' }, `Guía Rápida de Flujo: ${roleNameDisplay}`)
                        ]),
                        h('ol', { 
                            className: 'text-xs text-muted flex-column gap-1 pl-4 mb-0', 
                            style: { display: 'flex', flexDirection: 'column', gap: '4px', margin: 0, paddingLeft: '20px' } 
                        }, guideSteps)
                    ]);
                }

                const employeeLayout = h('div', { className: 'flex-column gap-5 w-full mt-2' }, [
                    guideAlert ? guideAlert : null,
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
                        onClick: () => openMasterPipelineModal({ users: approvedUsers, clients: finalClients, scripts: scripts || [], assets: assets || [], rates: rates || [], systemPricing: adminConfig })
                    }, [icon('git-commit', 14), h('span', {}, 'Asignación Maestra')]),
                    h('button', { 
                        className: 'btn btn-primary text-xs',
                        onClick: () => openAssignmentModal(null, { users: approvedUsers, clients: finalClients, scripts: scripts || [], assets: assets || [], rates: rates || [], systemPricing: adminConfig, assignments })
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
                                h('div', { 
                                    className: 'flex justify-between items-start cursor-pointer hover-underline', 
                                    onClick: () => { selectedProjectId = pid; selectedPipelineStageIdx = 0; loadAndRender(); }
                                }, [
                                    h('div', { className: 'flex-column' }, [
                                        h('span', { className: 'font-bold text-xs', style: { wordBreak: 'break-all' } }, title),
                                        h('span', { className: 'text-[10px] text-muted' }, `ID: ${pid}`)
                                    ]),
                                    allDone ? h('span', { className: 'badge badge-success text-[10px]' }, 'Finalizado') : null
                                ]),
                                h('div', { className: 'flex items-center w-full gap-2 relative', style: { overflowX: 'auto', paddingBottom: '8px' } }, [
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
                                            onClick: () => {
                                                selectedAssignmentId = t.id;
                                                loadAndRender();
                                            }
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
                                            window.location.hash = `#aiAssistant?client=${tasks[0]?.client || ''}&context=Pipeline_${pid}`;
                                        }
                                    }, [icon('bot', 12), h('span', {}, 'Preguntar a RIA')]),
                                    user?.role === 'admin' ? h('button', {
                                        className: 'btn btn-outline text-[10px] py-1 px-2',
                                        onClick: () => openEditPipelineModal(pid, tasks, { users: approvedUsers, clients: finalClients })
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
            const statuses = ['Pendiente', 'En Proceso', 'Completado', 'Archivado'];
            
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
                                const pipelineContext = assignments.find(a => a.projectId === asg.projectId && a.id !== asg.id)?.title.replace(RE_BRACKET_PREFIX, '') || asg.projectId;
                                displayTitle = `${asg.title} - ${pipelineContext}`;
                            }
                            
                            return h('div', { 
                                className: 'card interactive-card kanban-card p-3 flex-column gap-2 cursor-pointer',
                                onClick: () => {
                                    selectedAssignmentId = asg.id;
                                    loadAndRender();
                                }
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
                                        asg.billed ? h('span', { className: 'badge badge-success text-[10px] py-0 px-1' }, 'Cobrado') : null,
                                        (asg.uploadLink || asg.sourceFilesLink) ? h('a', {
                                            href: asg.uploadLink || asg.sourceFilesLink,
                                            target: '_blank',
                                            className: 'btn btn-outline text-[10px] py-0 px-1 ml-1',
                                            style: { borderColor: asg.uploadLink ? 'var(--success)' : 'var(--accent)', color: asg.uploadLink ? 'var(--success)' : 'var(--accent)' },
                                            onClick: (e) => e.stopPropagation()
                                        }, asg.uploadLink ? 'Entregable' : 'Materiales') : null,
                                        h('a', {
                                            href: '#/scripts',
                                            title: 'Escribir Guion para esta tarea',
                                            className: 'btn btn-outline text-[10px] py-0 px-1 ml-1',
                                            style: { borderColor: 'var(--border)', color: 'var(--text-muted)' },
                                            onClick: (e) => { e.stopPropagation(); window.location.hash = '#/scripts'; }
                                        }, [icon('pen-tool', 12)]),
                                        (function(){
                                            const w = approvedUsers.find(u => u.uid === asg.employeeId || u.id === asg.employeeId);
                                            const phone = w?.phone ? w.phone.replace(RE_NON_NUMERIC, '') : null;
                                            if (!phone) return null;
                                            
                                            const generalMsg = encodeURIComponent(`Hola ${w.nombre.split(' ')[0]}, sobre la tarea *${asg.title}*...`);
                                            const missingMsg = encodeURIComponent(`Hola ${w.nombre.split(' ')[0]}, revisando la tarea *${asg.title}* noté que falta material en el Drive. ¿Podrías subirlo lo antes posible, por favor?`);
                                            
                                            return h('div', { className: 'flex gap-1 items-center ml-1' }, [
                                                h('a', {
                                                    href: `https://wa.me/${phone}?text=${generalMsg}`,
                                                    target: '_blank',
                                                    title: 'Chat General',
                                                    className: 'text-success hover-opacity',
                                                    onClick: (e) => e.stopPropagation()
                                                }, icon('message-circle', 14)),
                                                h('a', {
                                                    href: `https://wa.me/${phone}?text=${missingMsg}`,
                                                    target: '_blank',
                                                    title: 'Pedir Materiales Faltantes al Drive',
                                                    className: 'text-warning hover-opacity',
                                                    onClick: (e) => e.stopPropagation()
                                                }, icon('folder-plus', 14))
                                            ]);
                                        })()
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
        let form;
        const showMiniModal = (title, fields, onSubmit) => {
            const miniOverlay = document.createElement('div');
            miniOverlay.className = 'modal-overlay';
            miniOverlay.style.zIndex = '2000';
            
            const mForm = document.createElement('form');
            mForm.className = 'card p-4 text-left flex-column gap-3';
            mForm.style.width = '300px';
            
            const btnSubmit = h('button', { type: 'submit', className: 'btn btn-primary text-xs', disabled: existing?.status === 'Completado' }, existing?.status === 'Completado' ? 'Solo Lectura' : 'Guardar');
            
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
            if (window.updateDefaultRateLabel) window.updateDefaultRateLabel();
            setTimeout(() => {
                const firstInput = mForm.querySelector('input, textarea, select');
                if (firstInput) firstInput.focus();
            }, 50);
        };

        const handleCreateClient = () => {
            showMiniModal('Nuevo Cliente', [
                { id: 'name', label: 'Nombre del Cliente', placeholder: 'Ej. Villa Grande' }
            ], async (data) => {
                const id = data.name.toLowerCase().normalize("NFD").replace(RE_UNICODE_ACCENT, "").replace(RE_WHITESPACE, '-').replace(RE_SAFE_ID, '');
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
                    const safeName = file.name.replace(RE_SAFE_FILENAME, '');
                    const safeClient = currentClient.replace(RE_WHITESPACE, '-');
                    const path = `assets/${safeClient}/${Date.now()}_${safeName}`;
                    
                    const url = await storageService.uploadFile(path, file);
                    const assetDoc = {
                        id: 'ast_' + crypto.randomUUID().split('-')[0], client: currentClient, title: data.title,
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
                ...(existing || {}),
                id: existing?.id,
                employeeId: form.querySelector('#asg-emp').value,
                type: form.querySelector('#asg-type').value,
                client: form.querySelector('#asg-client').value,
                title: form.querySelector('#asg-title').value,
                description: descVal,
                dueDate: form.querySelector('#asg-due').value,
                status: form.querySelector('#asg-status') ? form.querySelector('#asg-status').value : (existing?.status || 'Pendiente'),
                createdBy: existing?.createdBy || user.uid,
                linkedScript: form.querySelector('#asg-link-script').value,
                linkedAsset: form.querySelector('#asg-link-asset').value,
                videoLength: form.querySelector('#asg-video-length')?.value || 'short'
            };
            
            const isCustomRate = form.querySelector('input[name="rate-type"]:checked')?.value === 'custom';
            if (isCustomRate) {
                formData.billing = {
                    rateCardId: null,
                    customPrice: Number(form.querySelector('#asg-custom-price').value) || 0
                };
            } else {
                formData.billing = { rateCardId: 'default', customPrice: null };
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

        window.updateDefaultRateLabel = () => {
            if (!form) return;
            const type = form.querySelector('#asg-type')?.value;
            const length = form.querySelector('#asg-video-length')?.value;
            let autoPrice = 0;
            if (type === 'Grabación' || type === 'Creador 360° (Grabación + Edición)') autoPrice = context.systemPricing?.precioMinutoGrabacion || 0;
            else if (type === 'Edición') autoPrice = length === 'long' ? (context.systemPricing?.precioVideoLargo || 0) : (context.systemPricing?.precioVideoCorto || 0);
            else if (type === 'Subida') autoPrice = context.systemPricing?.precioSubidaRedes || 0;
            
            const labelEl = form.querySelector('#default-rate-label');
            if (labelEl) {
                if (type === 'Grabación' || type === 'Creador 360° (Grabación + Edición)') {
                    labelEl.textContent = `Auto ($${autoPrice.toLocaleString('es-CO')} / min)`;
                } else {
                    labelEl.textContent = `Auto ($${autoPrice.toLocaleString('es-CO')})`;
                }
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
                        h('select', { id: 'asg-type', className: 'form-select text-xs', onchange: () => {
                            const t = form.querySelector('#asg-type').value;
                            const vlEl = form.querySelector('#asg-video-length-container');
                            if(vlEl) vlEl.style.display = t === 'Edición' ? 'block' : 'none';
                            if (window.updateDefaultRateLabel) window.updateDefaultRateLabel();
                        } }, [
                            h('option', { value: 'Grabación', selected: existing?.type === 'Grabación' }, 'Grabación'),
                            h('option', { value: 'Edición', selected: existing?.type === 'Edición' }, 'Edición'),
                            h('option', { value: 'Creador 360° (Grabación + Edición)', selected: existing?.type === 'Creador 360° (Grabación + Edición)' }, 'Creador 360° (Grabación + Edición)'),
                            h('option', { value: 'Diseño', selected: existing?.type === 'Diseño' }, 'Diseño Gráfico'),
                            h('option', { value: 'Animación', selected: existing?.type === 'Animación' }, 'Animación (After Effects)'),
                            h('option', { value: 'Subida', selected: existing?.type === 'Subida' }, 'Subida a Redes (Uploader)'),
                            h('option', { value: 'Estrategia', selected: existing?.type === 'Estrategia' }, 'Estrategia y Guiones'),
                            h('option', { value: 'Revisión', selected: existing?.type === 'Revisión' }, 'Revisión de Calidad (QA)')
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
                h('div', { id: 'asg-video-length-container', className: 'form-group mb-2', style: { display: existing?.type === 'Edición' ? 'block' : 'none' } }, [
                    h('label', { className: 'form-label' }, 'Duración del Video (Afecta tarifa automática)'),
                    h('select', { id: 'asg-video-length', className: 'form-select text-xs', onchange: () => {
                        if (window.updateDefaultRateLabel) window.updateDefaultRateLabel();
                    } }, [
                        h('option', { value: 'short', selected: existing?.videoLength !== 'long' }, 'Corto (< 60s)'),
                        h('option', { value: 'long', selected: existing?.videoLength === 'long' }, 'Largo (> 60s)')
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
                h('div', { className: 'grid gap-3', style: { display: 'grid', gridTemplateColumns: '1fr 1fr' } }, [
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
                        h('div', { className: 'flex-column gap-2', style: { background: 'var(--bg-tertiary)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' } }, [
                            h('label', { className: 'flex items-center gap-2 text-xs cursor-pointer' }, [
                                h('input', { type: 'radio', name: 'rate-type', value: 'default', checked: !existing?.billing?.customPrice, onchange: (e) => {
                                    form.querySelector('#asg-custom-price-container').style.display = 'none';
                                } }),
                                h('span', { id: 'default-rate-label', className: 'font-bold text-primary' }, 'Auto ($0)')
                            ]),
                            h('label', { className: 'flex items-center gap-2 text-xs cursor-pointer mt-1' }, [
                                h('input', { type: 'radio', name: 'rate-type', value: 'custom', checked: !!existing?.billing?.customPrice, onchange: (e) => {
                                    form.querySelector('#asg-custom-price-container').style.display = 'flex';
                                    form.querySelector('#asg-custom-price').focus();
                                } }),
                                h('span', {}, 'Precio personalizado (Fijo o por minuto)')
                            ]),
                            h('div', {
                                id: 'asg-custom-price-container',
                                className: 'flex items-center gap-2',
                                style: { 
                                    display: existing?.billing?.customPrice ? 'flex' : 'none', 
                                    marginLeft: '24px', 
                                    marginTop: '8px',
                                    background: 'var(--bg-primary)',
                                    padding: '8px',
                                    borderRadius: '6px',
                                    border: '1px dashed var(--border)'
                                }
                            }, [
                                h('span', { className: 'text-xs text-muted font-bold' }, '$'),
                                h('input', {
                                    id: 'asg-custom-price',
                                    type: 'number',
                                    className: 'form-input text-xs font-bold text-accent',
                                    placeholder: 'Valor',
                                    defaultValue: existing?.billing?.customPrice || '',
                                    style: { flex: '1', border: 'none', background: 'transparent', outline: 'none' }
                                })
                            ])
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
            (existing && existing.projectId && context.assignments) ? (() => {
                const siblings = context.assignments.filter(a => a.projectId === existing.projectId).sort((a,b) => a.stageIndex - b.stageIndex);
                const hasDeliverables = siblings.some(s => s.uploadLink);
                if(!hasDeliverables) return null;
                return h('div', { className: 'mb-4 p-4 rounded', style: { background: 'var(--bg-tertiary)', border: '1px solid var(--border)' } }, [
                    h('h4', { className: 'text-sm font-bold flex items-center gap-2 mb-3' }, [icon('layers', 16, 'text-accent'), h('span', {}, 'Resumen de Entregables del Proyecto')]),
                    h('div', { className: 'flex-column gap-2' }, 
                        siblings.map(s => {
                            if(!s.uploadLink) return null;
                            return h('div', { className: 'flex items-center justify-between p-2 rounded', style: { background: 'var(--bg-secondary)', borderLeft: '3px solid var(--accent)' } }, [
                                h('div', { className: 'flex items-center gap-2' }, [
                                    h('span', { className: 'badge badge-info text-[10px]' }, `Fase ${s.stageIndex + 1}`),
                                    h('span', { className: 'text-xs font-bold' }, s.type)
                                ]),
                                h('a', {
                                    href: s.uploadLink,
                                    target: '_blank',
                                    className: 'btn btn-outline text-xs py-1 px-3 flex items-center gap-1 transition transform hover:scale-105',
                                    style: { color: 'var(--success)', borderColor: 'var(--success)' }
                                }, [icon('external-link', 12), h('span', {}, 'Abrir Material')])
                            ]);
                        }).filter(Boolean)
                    )
                ]);
            })() : null,
            h('div', { className: 'modal-footer flex justify-between' }, [
                h('div', { className: 'flex gap-2' }, [
                    (existing && existing.status === 'Archivado') ? h('button', {
                        type: 'button',
                        className: 'btn text-error text-xs',
                        style: { border: '1px solid var(--error-light)', background: 'var(--error-alpha)' },
                        onClick: async (e) => {
                            if (confirm('🚨 ¿ELIMINAR PERMANENTEMENTE? Esta acción no se puede deshacer.')) {
                                const btn = e.target;
                                btn.disabled = true;
                                btn.textContent = 'Eliminando...';
                                try {
                                    await dbService.delete('assignments', existing.id);
                                    document.body.removeChild(overlay);
                                    loadAndRender();
                                } catch(err) {
                                    btn.disabled = false;
                                    btn.textContent = 'Eliminar';
                                    alert('Error al eliminar');
                                }
                            }
                        }
                    }, [icon('trash-2', 14), h('span', { className: 'ml-1' }, 'Eliminar')]) : null,
                    (existing && existing.status === 'Archivado') ? h('button', {
                        type: 'button',
                        className: 'btn btn-primary text-xs',
                        onClick: async (e) => {
                            const btn = e.target;
                            btn.disabled = true;
                            btn.textContent = 'Restaurando...';
                            try {
                                await dbService.update('assignments', existing.id, { status: 'Pendiente' });
                                document.body.removeChild(overlay);
                                loadAndRender();
                            } catch(err) {
                                btn.disabled = false;
                                btn.textContent = 'Restaurar';
                                alert('Error al restaurar');
                            }
                        }
                    }, [icon('refresh-cw', 14), h('span', { className: 'ml-1' }, 'Restaurar')]) : null,
                    (existing && existing.status !== 'Archivado') ? h('button', {
                        type: 'button',
                        className: 'btn text-error text-xs',
                        style: { border: '1px solid var(--error-light)', background: 'var(--error-alpha)' },
                        onClick: async (e) => {
                            if (confirm('¿Estás seguro de que deseas archivar esta tarea? Se ocultará del tablero principal.')) {
                                const btn = e.target;
                                btn.disabled = true;
                                btn.textContent = 'Archivando...';
                                try {
                                    await dbService.update('assignments', existing.id, { status: 'Archivado' });
                                    document.body.removeChild(overlay);
                                    loadAndRender();
                                } catch(err) {
                                    btn.disabled = false;
                                    btn.textContent = 'Archivar';
                                    alert('Error al archivar la tarea');
                                }
                            }
                        }
                    }, [icon('archive', 14), h('span', { className: 'ml-1' }, 'Archivar')]) : null,
                ]),
                h('div', { className: 'flex gap-2' }, [
                    h('button', { 
                        type: 'button', 
                        className: 'btn btn-outline text-xs', 
                        onClick: () => {
                            if (confirm('¿Estás seguro de que deseas cancelar? Se perderán los datos no guardados.')) {
                                document.body.removeChild(overlay);
                            }
                        } 
                    }, 'Cancelar'),
                    h('button', { 
                        type: 'submit', 
                        className: 'btn btn-primary text-xs',
                        disabled: existing && existing.status === 'Completado' 
                    }, existing ? 'Guardar Cambios' : 'Asignar Trabajo')
                ])
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
                                openAssignmentModal(asg, { users: [emp], clients: context.clients, scripts: context.scripts || [], assets: context.assets || [] });
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
                let billingAmount = 0;
                let hasExplicitCustomPrice = asg.billing?.customPrice !== undefined && asg.billing?.customPrice !== null;
                
                if (hasExplicitCustomPrice) {
                    billingAmount = asg.billing.customPrice;
                } else if (asg.billing?.rateCardId === 'default') {
                    const systemPricing = await dbService.getById('system_config', 'pricing') || {};
                    if (asg.type === 'Grabación' || asg.type === 'Creador 360° (Grabación + Edición)') {
                        billingAmount = (systemPricing.precioMinutoGrabacion || 25000) * (asg.billing.minutes || 0);
                    } else if (asg.type === 'Edición') {
                        billingAmount = asg.videoLength === 'long' ? (systemPricing.precioVideoLargo || 25000) : (systemPricing.precioVideoCorto || 15000);
                    } else if (asg.type === 'Subida') {
                        billingAmount = systemPricing.precioSubidaRedes || 5000;
                    }
                } else if (asg.billing?.rateCardId) {
                    const rates = await invoiceService.getRateCards();
                    const rate = rates.find(r => r.id === asg.billing.rateCardId);
                    if (rate) {
                        billingAmount = rate.rateType === 'per_minute' && asg.billing.minutes
                            ? rate.basePrice * asg.billing.minutes
                            : rate.basePrice;
                    }
                }

                // Si hay un customPrice en 0, registramos la transacción en $0 como constancia.
                if (billingAmount > 0 || hasExplicitCustomPrice) {
                    const invoiceItem = {
                        assignmentId: asg.id,
                        employeeName: user.nombre || user.email,
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
async function openBillingModal(asg, callback, onCancel) {
    const overlay = h('div', { className: 'modal-overlay' });
    const isRecording = asg.type === 'Grabación' || asg.type === 'Creador 360° (Grabación + Edición)';
    const is360 = asg.type === 'Creador 360° (Grabación + Edición)';

    // Load pricing from Firestore
    let pricing = {};
    try { pricing = await dbService.getById('system_config', 'pricing') || {}; } catch(e) {}
    const precioMinutoGrabacion = pricing.precioMinutoGrabacion ?? 200;
    const precioSubidaRedes = pricing.precioSubidaRedes ?? 10000;
    const precioVideoCorto = pricing.precioVideoCorto ?? 15000;
    const precioVideoLargo = pricing.precioVideoLargo ?? 25000;

    const contentDiv = h('div', { className: 'flex-column gap-3 mt-2' });
    
    // Inputs
    const minsInput = h('input', { type: 'number', className: 'form-input text-xs', placeholder: '0', min: '0' });
    const editPriceInput = h('input', { type: 'number', className: 'form-input text-xs', placeholder: '0', min: '0' });
    const genericPriceInput = h('input', { type: 'number', className: 'form-input text-xs', placeholder: '0', min: '0' });
    const isUpload = asg.type === 'Subida' || (asg.type || '').toLowerCase().includes('subida');

    if (isRecording) {
        contentDiv.appendChild(h('div', { className: 'flex-column gap-1' }, [
            h('label', { className: 'text-xs font-bold' }, 'Minutos de Grabación:'),
            h('span', { className: 'text-xs text-muted mb-1' }, `(Se multiplicará por $${precioMinutoGrabacion.toLocaleString('es-CO')} COP/min automáticamente)`),
            minsInput
        ]));

        if (is360) {
            contentDiv.appendChild(h('div', { className: 'flex-column gap-1 mt-2' }, [
                h('label', { className: 'text-xs font-bold' }, 'Cobro extra por Edición (Opcional):'),
                h('span', { className: 'text-xs text-muted mb-1' }, '¿Cuánto cobras por editar este material? (COP)'),
                editPriceInput
            ]));
        }
    } else if (isUpload) {
        contentDiv.appendChild(h('div', { className: 'card p-3 flex-column gap-2', style: { background: 'var(--bg-tertiary)' } }, [
            h('span', { className: 'text-xs text-muted' }, `Tarifa de subida a redes: $${precioSubidaRedes.toLocaleString('es-CO')} COP (fijo)`),
        ]));
        genericPriceInput.value = String(precioSubidaRedes);
        contentDiv.appendChild(h('div', { className: 'flex-column gap-1 mt-2' }, [
            h('label', { className: 'text-xs font-bold' }, 'Monto a Cobrar (COP):'),
            h('span', { className: 'text-xs text-muted mb-1' }, 'Puedes ajustar si el precio fue diferente.'),
            genericPriceInput
        ]));
    } else {
        contentDiv.appendChild(h('div', { className: 'flex-column gap-1' }, [
            h('label', { className: 'text-xs font-bold' }, 'Monto a Cobrar (COP):'),
            h('div', { className: 'flex gap-2 mb-1' }, [
                h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => { genericPriceInput.value = String(precioVideoCorto); } }, `Video < 60s ($${precioVideoCorto.toLocaleString('es-CO')})`),
                h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => { genericPriceInput.value = String(precioVideoLargo); } }, `Video > 60s ($${precioVideoLargo.toLocaleString('es-CO')})`)
            ]),
            genericPriceInput
        ]));
    }

    const modal = h('div', { className: 'modal-container', style: { maxWidth: '400px' } }, [
        h('div', { className: 'modal-header' }, [
            h('span', { className: 'modal-title' }, `Liquidación: ${asg.title}`),
            h('button', { onClick: () => { overlay.remove(); if(onCancel) onCancel(); } }, '×')
        ]),
        h('div', { className: 'modal-body' }, [
            h('p', { className: 'text-xs text-muted mb-2' }, `Vas a registrar el cobro por la tarea de cliente: ${asg.client}.`),
            contentDiv
        ]),
        h('div', { className: 'modal-footer' }, [
            h('button', { className: 'btn btn-outline text-xs', onClick: () => { overlay.remove(); if(onCancel) onCancel(); } }, 'Cancelar'),
            h('button', {
                className: 'btn btn-primary text-xs',
                style: { background: 'var(--success)', borderColor: 'var(--success)' },
                onClick: () => {
                    let price = 0;
                    let obs = `Cobro por tarea: ${asg.title}`;

                    if (isRecording) {
                        const mins = Number(minsInput.value) || 0;
                        price = mins * precioMinutoGrabacion;
                        obs = `Cobro por grabación (${mins} minutos a $${precioMinutoGrabacion.toLocaleString('es-CO')}): ${asg.title}`;

                        if (is360) {
                            const editPrice = Number(editPriceInput.value) || 0;
                            price += editPrice;
                            obs += ` + Edición ($${editPrice.toLocaleString('es-CO')})`;
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
        btnSubmit.textContent = "Creando e subiendo archivos...";
        
        const getBilling = (selectorId, customInputId) => {
            const val = form.querySelector(selectorId)?.value;
            if (!val) return null;
            return {
                rateCardId: val !== 'custom' ? val : null,
                customPrice: val === 'custom' ? Number(form.querySelector(customInputId)?.value) || 0 : null
            };
        };

        const clientVal = form.querySelector('#mp-client').value;
        const titleVal = form.querySelector('#mp-title').value;

        // --- File Uploads ---
        let finalAssetUrl = form.querySelector('#mp-asset').value;
        const assetFileInput = form.querySelector('#mp-asset-file');
        if (assetFileInput?.files[0]) {
            try {
                const { storageService } = await import('../firebase/service.js');
                finalAssetUrl = await storageService.uploadFile(`assets/${clientVal}/${assetFileInput.files[0].name}`, assetFileInput.files[0]);
            } catch(e) { console.error('Error uploading asset:', e); }
        }

        let finalScriptUrl = form.querySelector('#mp-script').value;
        const scriptFileInput = form.querySelector('#mp-script-file');
        if (scriptFileInput?.files[0]) {
            try {
                const { storageService } = await import('../firebase/service.js');
                finalScriptUrl = await storageService.uploadFile(`scripts/${clientVal}/${scriptFileInput.files[0].name}`, scriptFileInput.files[0]);
            } catch(e) { console.error('Error uploading script:', e); }
        }
        // --------------------

        const camSupportSelect = form.querySelector('#mp-cam-support');
        const camSupportIds = Array.from(camSupportSelect.selectedOptions).map(opt => opt.value).filter(Boolean);

        const data = {
            title: titleVal,
            client: clientVal,
            description: form.querySelector('#mp-desc').value,
            dueDateCam: form.querySelector('#mp-due-cam').value,
            dueDateEd: form.querySelector('#mp-due-ed').value,
            dueDateUp: form.querySelector('#mp-due-up').value,
            camarografoPrincipalId: form.querySelector('#mp-cam-main').value,
            camarografoApoyoIds: camSupportIds,
            editorId: form.querySelector('#mp-ed').value,
            uploaderId: form.querySelector('#mp-up').value,
            billingCam: getBilling('#mp-rate-cam', '#mp-custom-cam'),
            billingCamSupport: getBilling('#mp-rate-cam-support', '#mp-custom-cam-support'),
            billingEd: getBilling('#mp-rate-ed', '#mp-custom-ed'),
            videoLengthEd: form.querySelector('#mp-ed-length')?.value || 'short',
            billingUp: getBilling('#mp-rate-up', '#mp-custom-up'),
            linkedScript: finalScriptUrl,
            linkedAsset: finalAssetUrl,
            uploadLink: form.querySelector('#mp-up-link').value || '',
            driveFolderUrl: form.querySelector('#mp-drive-link')?.value || '',
            createdBy: 'admin',
        };
        
        try {
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
    const scriptsHtml = (context.scripts || []).map(s => `<option value="${s.script}">[${s.client}] ${s.title}</option>`).join('');
    const assetsHtml = (context.assets || []).map(a => `<option value="${a.url || a.thumbnail}">[${a.client}] ${a.title}</option>`).join('');
    const pGrab = context.systemPricing?.precioMinutoGrabacion || 25000;
    const pEdCorto = context.systemPricing?.precioVideoCorto || 15000;
    const pEdLargo = context.systemPricing?.precioVideoLargo || 25000;
    const pSubida = context.systemPricing?.precioSubidaRedes || 5000;

    const rateOptionsCam = `<option value="default">Auto ($${pGrab.toLocaleString('es-CO')} / min)</option><option value="custom">Precio Personalizado</option>`;
    const rateOptionsEdCorto = `<option value="default">Auto ($${pEdCorto.toLocaleString('es-CO')})</option><option value="custom">Precio Personalizado</option>`;
    const rateOptionsEdLargo = `<option value="default">Auto ($${pEdLargo.toLocaleString('es-CO')})</option><option value="custom">Precio Personalizado</option>`;
    const rateOptionsUp = `<option value="default">Auto ($${pSubida.toLocaleString('es-CO')})</option><option value="custom">Precio Personalizado</option>`;
    // Pre-escape for safe use inside HTML attribute onchange
    const rateOptionsEdLargoEsc = rateOptionsEdLargo.replace(RE_QUOTE, '&quot;');
    const rateOptionsEdCortoEsc = rateOptionsEdCorto.replace(RE_QUOTE, '&quot;');
    
    const modalHTML = `
        <form class="modal-container" style="max-width: 900px; max-height: 90vh; overflow-y: auto;">
            <div class="modal-header" style="background: linear-gradient(135deg, var(--success), #10b981); color: white;">
                <span class="modal-title font-bold">🚀 Nueva Asignación Maestra (Pipeline)</span>
                <button type="button" class="close-btn" style="color:white; background:none; border:none; font-size:1.5rem; cursor:pointer;">×</button>
            </div>
            <div class="modal-body grid gap-4" style="grid-template-columns: 1fr 1.2fr;">
                
                <!-- Columna Izquierda: Detalles Generales -->
                <div class="flex-column gap-3" style="border-right: 1px solid var(--border); padding-right: 1rem;">
                    <h3 class="text-sm font-bold text-accent">1. Detalles del Proyecto</h3>
                    
                    <div class="form-group">
                        <label class="form-label">Título del Proyecto</label>
                        <input type="text" id="mp-title" class="form-input" required placeholder="Ej. Reel de Verano">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Cliente</label>
                        <select id="mp-client" class="form-select text-xs" required>${clientsHtml}</select>
                    </div>
                    
                    <div class="form-group p-2 rounded" style="background: var(--bg-tertiary); border: 1px dashed var(--border);">
                        <label class="form-label flex justify-between items-center">
                            Guion (Script)
                            <button type="button" class="text-xs text-accent font-bold bg-transparent border-none cursor-pointer" onclick="window.location.hash='#aiAssistant'; document.querySelector('.modal-overlay').remove();">[+ Pedir a RIA]</button>
                        </label>
                        <select id="mp-script" class="form-select text-xs mb-1"><option value="">-- Existente --</option>${scriptsHtml}</select>
                        <input type="file" id="mp-script-file" class="form-input text-xs" accept=".pdf,.doc,.docx,.txt" title="O subir un archivo nuevo">
                    </div>
                    
                    <div class="form-group p-2 rounded" style="background: var(--bg-tertiary); border: 1px dashed var(--border);">
                        <label class="form-label">Asset de Referencia Original</label>
                        <select id="mp-asset" class="form-select text-xs mb-1"><option value="">-- Existente --</option>${assetsHtml}</select>
                        <input type="file" id="mp-asset-file" class="form-input text-xs" accept="image/*,video/*" title="O subir un archivo nuevo">
                    </div>

                    <div class="form-group">
                        <label class="form-label">Instrucciones Globales (Todas las fases)</label>
                        <textarea id="mp-desc" class="form-textarea text-xs" rows="3" required placeholder="Instrucciones que verán todos..."></textarea>
                    </div>
                    <div class="form-group p-2 rounded" style="background: rgba(37,211,102,0.06); border: 1px dashed rgba(37,211,102,0.3);">
                        <label class="form-label flex items-center gap-1" style="color: #25D366;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                            Link Carpeta Drive (Opcional)
                        </label>
                        <input type="url" id="mp-drive-link" class="form-input text-xs" placeholder="https://drive.google.com/drive/folders/...">
                    </div>
                </div>

                <!-- Columna Derecha: El Equipo -->
                <div class="flex-column gap-3" style="padding-left: 0.5rem;">
                    <h3 class="text-sm font-bold text-success">2. Equipo y Fases</h3>
                    
                    <div class="card p-3" style="background: rgba(var(--accent-rgb), 0.05); border: 1px solid var(--accent);">
                        <div class="flex justify-between items-center mb-2">
                            <h4 class="text-xs font-bold">Fase 1: Grabación</h4>
                            <input type="date" id="mp-due-cam" class="form-input text-[10px]" style="width:110px; padding:2px;" required>
                        </div>
                        <div class="grid gap-2" style="grid-template-columns: 1fr 1fr;">
                            <div class="form-group">
                                <label class="form-label text-[10px]">Principal (Sube Medios)</label>
                                <select id="mp-cam-main" class="form-select text-[10px]"><option value="">-- Omitir Fase --</option>${usersHtml}</select>
                            </div>
                            <div class="form-group">
                                <label class="form-label text-[10px]">Tarifa Principal</label>
                                <select id="mp-rate-cam" class="form-select text-[10px]" onchange="document.getElementById('mp-custom-cam').style.display = this.value === 'custom' ? 'block' : 'none'">${rateOptionsCam}</select>
                                <input type="number" id="mp-custom-cam" class="form-input text-[10px] mt-1" style="display:none;" placeholder="Precio ($)">
                            </div>
                        </div>
                        <div class="form-group mt-2">
                            <label class="form-label text-[10px]">Apoyo (Múltiples - Solo Anotan Minutos)</label>
                            <select id="mp-cam-support" class="form-select text-[10px]" multiple size="3">${usersHtml}</select>
                        </div>
                        <div class="form-group mt-2" style="background: rgba(var(--warning-rgb),0.06); border: 1px dashed rgba(var(--warning-rgb),0.3); border-radius: 6px; padding: 8px;">
                            <label class="form-label text-[10px]" style="color: var(--warning);">Tarifa de Apoyo (por persona)</label>
                            <select id="mp-rate-cam-support" class="form-select text-[10px]" onchange="document.getElementById('mp-custom-cam-support').style.display = this.value === 'custom' ? 'block' : 'none'">${rateOptionsCam}</select>
                            <input type="number" id="mp-custom-cam-support" class="form-input text-[10px] mt-1" style="display:none;" placeholder="Precio ($)">
                        </div>
                    </div>

                    <div class="text-center text-muted" style="font-size: 1.2rem; margin: -5px 0;">↓</div>

                    <div class="card p-3" style="background: rgba(var(--info-rgb), 0.05); border: 1px solid var(--info);">
                        <div class="flex justify-between items-center mb-2">
                            <h4 class="text-xs font-bold">Fase 2: Edición (Automática)</h4>
                            <input type="date" id="mp-due-ed" class="form-input text-[10px]" style="width:110px; padding:2px;" required>
                        </div>
                        <div class="grid gap-2" style="grid-template-columns: 1fr 1fr 1fr;">
                            <div class="form-group">
                                <label class="form-label text-[10px]">Asignar a</label>
                                <select id="mp-ed" class="form-select text-[10px]"><option value="">-- Omitir Fase --</option>${usersHtml}</select>
                            </div>
                            <div class="form-group">
                                <label class="form-label text-[10px]">Duración</label>
                                <select id="mp-ed-length" class="form-select text-[10px]" onchange="document.getElementById('mp-rate-ed').innerHTML = this.value === 'long' ? '${rateOptionsEdLargoEsc}' : '${rateOptionsEdCortoEsc}';">
                                    <option value="short">Corto (< 60s)</option>
                                    <option value="long">Largo (> 60s)</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label text-[10px]">Tarifa</label>
                                <select id="mp-rate-ed" class="form-select text-[10px]" onchange="document.getElementById('mp-custom-ed').style.display = this.value === 'custom' ? 'block' : 'none'">${rateOptionsEdCorto}</select>
                                <input type="number" id="mp-custom-ed" class="form-input text-[10px] mt-1" style="display:none;" placeholder="Precio ($)">
                            </div>
                        </div>
                    </div>
                    
                    <div class="text-center text-muted" style="font-size: 1.2rem; margin: -5px 0;">↓</div>

                    <div class="card p-3" style="background: rgba(var(--warning-rgb), 0.05); border: 1px solid var(--warning);">
                        <div class="flex justify-between items-center mb-2">
                            <h4 class="text-xs font-bold">Fase 3: Subida (Automática)</h4>
                            <input type="date" id="mp-due-up" class="form-input text-[10px]" style="width:110px; padding:2px;" required>
                        </div>
                        <div class="grid gap-2" style="grid-template-columns: 1fr 1fr;">
                            <div class="form-group">
                                <label class="form-label text-[10px]">Asignar a</label>
                                <select id="mp-up" class="form-select text-[10px]"><option value="">-- Omitir Fase --</option>${usersHtml}</select>
                            </div>
                            <div class="form-group">
                                <label class="form-label text-[10px]">Tarifa</label>
                                <select id="mp-rate-up" class="form-select text-[10px]" onchange="document.getElementById('mp-custom-up').style.display = this.value === 'custom' ? 'block' : 'none'">${rateOptionsUp}</select>
                                <input type="number" id="mp-custom-up" class="form-input text-[10px] mt-1" style="display:none;" placeholder="Precio ($)">
                            </div>
                        </div>
                        <div class="form-group mt-2">
                            <label id="lbl-mp-up-link" class="form-label text-[10px]">Red Social a Publicar</label>
                            <input type="text" id="mp-up-link" class="form-input text-[10px]" placeholder="Ej. TikTok, Drive">
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
                                    <button type="button" class="btn btn-outline text-xs edit-task-btn" data-task-id="${t.id}" style="padding: 4px 8px;" ${t.status === 'Completado' ? 'disabled title="Las tareas completadas no se pueden editar"' : ''}>
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
                    <button type="button" id="btn-delete-pipeline" class="btn btn-primary text-xs py-2 w-full" style="background: var(--error); border-color: var(--error); color: white;">
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
