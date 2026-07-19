/**
 * SOPs Page - Creative Production OS
 * Notion-style SOP builder with per-role targeting and interactive checklist detail views.
 */
import { h, icon } from '../utils/dom.js';
import { dbService, storageService } from '../supabase/service.js';
import { store } from '../js/store.js';

const ICONS = ['check-square', 'video', 'scissors', 'mic', 'pen-tool', 'monitor', 'camera', 'file-text', 'layers', 'zap'];
const ROLES = ['all', 'editor', 'camarógrafo', 'estratega', 'diseñador', 'administración digital', 'vendedor', 'creador de contenido', 'creador 360'];
const ROLE_LABELS = { all: 'Todos los Roles', editor: 'Editor de Video', camarógrafo: 'Camarógrafo', estratega: 'Estratega Creativo', diseñador: 'Diseñador Gráfico', 'administración digital': 'Administración Digital', vendedor: 'Vendedor', 'creador de contenido': 'Creador de Contenido', 'creador 360': 'Creador 360' };

let selectedSopId = null;

const renderSopDetail = (sopId, sopsList, user, load) => {
    const sop = sopsList.find(s => s.id === sopId);
    if (!sop) {
        selectedSopId = null;
        load();
        return;
    }

    const steps = sop.steps || [];
    const doneCount = steps.filter(s => s.done).length;
    const allDone = steps.length > 0 && doneCount === steps.length;
    const pct = steps.length > 0 ? Math.round((doneCount / steps.length) * 100) : 0;
    const roleLabel = ROLE_LABELS[sop.targetRole] || sop.targetRole || 'Todos';

    const saveStep = async (idx, updates) => {
        const currentSteps = sop.steps;
        currentSteps[idx] = { ...currentSteps[idx], ...updates };
        
        let subId = sop.activeSubmissionId;
        if (!subId) {
            subId = `sub-${sop.id}-${Date.now()}`;
            sop.activeSubmissionId = subId;
        }

        const submissionData = {
            id: subId,
            sopId: sop.id,
            sopTitle: sop.title,
            userId: user.uid,
            userName: user.nombre || user.email,
            status: 'active',
            steps: currentSteps.map(s => ({ done: s.done || false, userValue: s.userValue || '' })),
            updatedAt: new Date().toISOString()
        };

        await dbService.set('sop_submissions', subId, submissionData);
        load(false);
    };

    const detailContainer = h('div', { 
        className: `premium-detail-page ${allDone ? 'all-completed-pulse' : ''}`,
        style: { border: allDone ? '1px solid var(--success)' : '1px solid rgba(255,255,255,0.08)' }
    }, [
        // Top breadcrumb
        h('div', { className: 'flex justify-between items-center border-bottom pb-4' }, [
            h('div', { className: 'flex items-center gap-2' }, [
                h('button', { 
                    className: 'btn btn-outline text-xs',
                    onClick: () => { selectedSopId = null; load(); }
                }, [icon('arrow-left', 14), h('span', {}, 'Volver')]),
                h('span', { className: 'text-muted text-xs' }, 'SOPs / ' + sop.title)
            ]),
            h('span', { className: 'badge badge-info text-xs' }, roleLabel)
        ]),

        // SOP Title and Progress
        h('div', { className: 'grid gap-4 border-bottom pb-4', style: { gridTemplateColumns: '1.2fr 0.8fr' } }, [
            h('div', {}, [
                h('h1', { className: 'text-xl font-bold m-0 text-primary' }, sop.title),
                h('span', { className: 'text-xs text-muted block mt-1' }, `Procedimiento de Calidad Obligatorio • Tiempo estimado: ${sop.tiempoEstimado || '15 minutos'}`)
            ]),
            h('div', { className: 'flex-column gap-1' }, [
                h('div', { className: 'flex justify-between text-xs text-muted mb-1' }, [
                    h('span', {}, 'Progreso de la Misión'),
                    h('span', { className: 'font-bold' }, `${pct}%`)
                ]),
                h('div', { className: 'pipeline-progress-bar' }, [
                    h('div', { className: 'pipeline-progress-fill', style: { width: `${pct}%`, background: allDone ? 'var(--success)' : 'var(--accent)' } })
                ])
            ])
        ]),

        // Mission Layout
        h('div', { className: 'premium-split-layout' }, [
            // Left Column: Interactive SOP Checklist
            h('div', { className: 'premium-info-section flex-column gap-3' }, [
                h('h3', { className: 'text-xs font-bold text-muted uppercase m-0' }, 'Pasos de la Misión'),
                
                h('div', { className: 'flex-column gap-2 mt-2' }, 
                    steps.map((step, idx) => {
                        const isChecked = step.done || false;
                        const isUserFillable = step.type === 'link' || step.type === 'text';

                        let inputEl = null;
                        if (step.type === 'link') {
                            inputEl = h('input', {
                                type: 'url',
                                className: 'form-input text-xs mt-2',
                                placeholder: step.linkPlaceholder || 'Pega el enlace aquí...',
                                value: step.userValue || '',
                                onChange: (e) => saveStep(idx, { userValue: e.target.value })
                            });
                        } else if (step.type === 'text') {
                            inputEl = h('textarea', {
                                className: 'form-textarea text-xs mt-2',
                                placeholder: step.textDescription || 'Escribe aquí...',
                                value: step.userValue || '',
                                rows: 2,
                                onChange: (e) => saveStep(idx, { userValue: e.target.value })
                            });
                        }

                        return h('div', {
                            className: `sop-checklist-item ${isChecked ? 'checked' : ''} flex-column items-start gap-1`,
                            style: { cursor: 'pointer' },
                            onClick: async () => {
                                await saveStep(idx, { done: !isChecked });
                            }
                        }, [
                            h('div', { className: 'flex items-center gap-3 w-full' }, [
                                h('div', { className: 'checkbox-custom' }, [
                                    isChecked ? icon('check', 12) : null
                                ]),
                                h('span', { className: 'text-xs text-primary' }, step.text)
                            ]),
                            inputEl ? h('div', { className: 'w-full pl-7', onClick: (e) => e.stopPropagation() }, [inputEl]) : null
                        ]);
                    })
                ),

                allDone ? h('div', { 
                    className: 'p-4 rounded border text-center flex-column gap-2 fade-in mt-4',
                    style: { background: 'rgba(16, 185, 129, 0.08)', borderColor: 'var(--success)' }
                }, [
                    h('span', { className: 'text-sm font-bold text-success' }, '🎉 ¡SOP Completado con Éxito!'),
                    h('p', { className: 'text-xs text-muted' }, 'Todos los requerimientos de calidad han sido verificados.'),
                    h('button', {
                        className: 'btn btn-primary text-xs w-full mt-2',
                        style: { background: 'var(--success)', borderColor: 'var(--success)' },
                        onClick: async () => {
                            if (!sop.activeSubmissionId) return;
                            await dbService.update('sop_submissions', sop.activeSubmissionId, { 
                                status: 'completed', 
                                completedAt: new Date().toISOString() 
                            });
                            selectedSopId = null;
                            window.location.hash = '#billing';
                        }
                    }, 'Registrar en Factura y Finalizar')
                ]) : null
            ]),

            // Right Column: Guide & Details
            h('div', { className: 'premium-info-section flex-column gap-4' }, [
                h('h3', { className: 'text-sm font-bold text-primary border-bottom pb-2 m-0' }, 'Recursos de la Misión'),
                
                sop.galleryImage ? h('img', { 
                    src: sop.galleryImage, 
                    style: { width: '100%', maxHeight: '160px', objectFit: 'cover', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' } 
                }) : null,

                h('div', { className: 'flex-column gap-2 text-xs' }, [
                    h('span', { className: 'text-[10px] text-muted uppercase font-bold' }, 'Directriz de Calidad'),
                    h('p', { className: 'text-muted leading-relaxed m-0' }, 'Este procedimiento es obligatorio para todos los entregables. Completarlo con precisión asegura la consistencia de marca y previene devoluciones del cliente.')
                ])
            ])
        ])
    ]);

    return detailContainer;
};

export const render = () => {
    const { user } = store.getState();
    const isAdmin = user?.role === 'admin';
    const container = h('div', { className: 'fade-in flex-column gap-4' });

    const load = async (showLoader = true) => {
        if (showLoader) {
            container.innerHTML = '<div class="loader mb-4"></div>';
        }
        let sopsList = [];
        let myActiveSubmissions = [];
        try { 
            sopsList = await dbService.getAll('sops'); 
            if (user) {
                const allMySubs = await dbService.query('sop_submissions', 'userId', '==', user.uid);
                myActiveSubmissions = allMySubs.filter(s => s.status === 'active');
            }
        } catch (e) { sopsList = []; }
        container.innerHTML = '';

        const userRole = user?.role || '';
        // Filter SOPs visible to this user
        let visibleSops = isAdmin
            ? sopsList
            : sopsList.filter(s => {
                if (s.active === false) return false;
                if (!s.targetRole || s.targetRole.toLowerCase() === 'all') return true;
                return s.targetRole.trim().toLowerCase() === userRole.trim().toLowerCase();
            });

        // Merge active submissions to reflect user's current progress
        visibleSops = visibleSops.map(sopTemplate => {
            const activeSub = myActiveSubmissions.find(s => s.sopId === sopTemplate.id);
            if (activeSub) {
                const mergedSteps = (sopTemplate.steps || []).map((st, i) => {
                    const subStep = activeSub.steps?.[i] || {};
                    return { ...st, done: subStep.done || false, userValue: subStep.userValue || '' };
                });
                return { ...sopTemplate, steps: mergedSteps, activeSubmissionId: activeSub.id };
            }
            const resetSteps = (sopTemplate.steps || []).map(st => ({ ...st, done: false, userValue: '' }));
            return { ...sopTemplate, steps: resetSteps };
        });

        // Intercept for detailed SOP view
        if (selectedSopId) {
            container.appendChild(renderSopDetail(selectedSopId, visibleSops, user, load));
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        // Header
        container.appendChild(h('div', { className: 'content-header flex justify-between items-center w-full mb-4', style: { paddingBottom: '1rem' } }, [
            h('div', { className: 'flex items-center gap-3' }, [
                h('div', { className: 'icon-wrapper bg-accent-soft p-2 rounded' }, [
                    icon('layers', 24, 'text-accent')
                ]),
                h('div', {}, [
                    h('h1', {}, isAdmin ? 'Constructor de SOPs (Guías de Trabajo)' : 'Mis Procedimientos (SOPs)'),
                    h('p', { className: 'text-xs text-muted mt-1' }, isAdmin
                        ? 'Crea y gestiona SOPs por rol. Revisa el historial de entregas de tu equipo.'
                        : 'Completa cada paso de tus procedimientos estándar de calidad.')
                ])
            ]),
            h('div', { className: 'flex gap-2' }, [
                isAdmin ? h('button', { 
                    className: 'btn btn-outline text-xs flex items-center gap-1 font-bold text-accent', 
                    style: { borderColor: 'var(--accent)', color: 'var(--accent)' },
                    onClick: () => {
                        localStorage.setItem('ria_prefill', 'Créame un SOP (create_sop) detallado paso a paso para [INSERTAR MOTIVO] que sea profesional, claro y cumpla con nuestros estándares: ');
                        window.location.hash = '#ai-assistant';
                    }
                }, [icon('sparkles', 13), h('span', {}, 'Ayuda de RIA')]) : null,
                isAdmin ? h('button', {
                    className: 'btn btn-primary text-xs',
                    onClick: () => openAdminSopBuilder(null, load)
                }, [icon('plus', 13), h('span', {}, 'Crear SOP')]) : null
            ])
        ]));

        if (visibleSops.length === 0) {
            container.appendChild(h('div', { className: 'card p-12 text-center flex-column items-center gap-3' }, [
                icon('check-square', 36, 'text-muted'),
                h('h3', { className: 'font-bold text-sm' }, 'Sin SOPs todavía'),
                h('p', { className: 'text-xs text-muted' }, isAdmin ? 'Crea el primer SOP con el botón de arriba.' : 'El administrador aún no ha creado procedimientos para tu rol.'),
                isAdmin ? h('button', { className: 'btn btn-primary text-xs mt-2', onClick: () => openAdminSopBuilder(null, load) }, 'Crear Primer SOP') : null
            ]));
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        const grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' } });
        visibleSops.forEach(sop => grid.appendChild(renderSopCard(sop, isAdmin, user, load)));
        container.appendChild(grid);
        if (window.lucide) window.lucide.createIcons();
    };

    load();
    return container;
};

function renderSopCard(sop, isAdmin, user, reload) {
    const steps = sop.steps || [];
    const doneCount = steps.filter(s => s.done).length;
    const allDone = steps.length > 0 && doneCount === steps.length;
    const pct = steps.length > 0 ? Math.round((doneCount / steps.length) * 100) : 0;
    const roleLabel = ROLE_LABELS[sop.targetRole] || sop.targetRole || 'Todos';

    return h('div', {
        className: 'card interactive-card p-0 flex-column cursor-pointer',
        style: { overflow: 'hidden', opacity: sop.active === false ? 0.5 : 1 },
        onClick: () => { selectedSopId = sop.id; reload(); }
    }, [
        h('div', { style: { height: '3px', background: `linear-gradient(90deg, var(--accent) ${pct}%, var(--bg-tertiary) ${pct}%)` } }),
        h('div', { className: 'p-4 flex-column gap-3' }, [
            h('div', { className: 'flex justify-between items-start', onClick: (e) => e.stopPropagation() }, [
                h('div', { className: 'flex items-center gap-2' }, [
                    h('div', { className: 'flex items-center justify-center', style: { width: '32px', height: '32px', borderRadius: '6px', background: 'var(--bg-tertiary)', flexShrink: 0 } }, [
                        icon(sop.iconName || 'check-square', 16)
                    ]),
                    h('div', { className: 'flex-column gap-0.5' }, [
                        h('h4', { className: 'font-bold text-sm text-primary', style: { margin: 0 } }, sop.title),
                        h('span', { className: 'badge badge-secondary', style: { fontSize: '0.55rem', padding: '1px 5px', width: 'fit-content' } }, roleLabel)
                    ])
                ]),
                h('div', { className: 'flex items-center gap-1' }, [
                    sop.active === false
                        ? h('span', { className: 'badge badge-warning', style: { fontSize: '0.55rem' } }, 'Inactivo')
                        : h('span', { className: 'badge badge-success', style: { fontSize: '0.55rem' } }, 'Activo'),
                    isAdmin ? h('button', { className: 'btn-icon text-info', onClick: () => openSopHistory(sop) }, [icon('clock', 13)]) : null,
                    isAdmin ? h('button', { className: 'btn-icon text-muted', onClick: () => openAdminSopBuilder(sop, reload) }, [icon('edit-3', 13)]) : null,
                    isAdmin ? h('button', {
                        className: 'btn-icon text-error',
                        onClick: async () => {
                            if (confirm(`¿Eliminar SOP "${sop.title}"?`)) {
                                await dbService.delete('sops', sop.id);
                                reload();
                            }
                        }
                    }, [icon('trash-2', 13)]) : null
                ])
            ]),

            h('div', {}, [
                h('div', { className: 'flex justify-between text-xs text-muted mb-1' }, [
                    h('span', {}, `${doneCount}/${steps.length} pasos`),
                    h('span', { className: allDone ? 'text-success font-bold' : '' }, `${pct}%`)
                ]),
                h('div', { style: { height: '4px', background: 'var(--bg-tertiary)', borderRadius: '2px', overflow: 'hidden' } }, [
                    h('div', { style: { height: '100%', width: `${pct}%`, background: allDone ? 'var(--success)' : 'var(--accent)', transition: 'width 0.4s ease', borderRadius: '2px' } })
                ])
            ]),

            sop.galleryImage ? h('img', { src: sop.galleryImage, style: { width: '100%', height: '120px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border)' } }) : null
        ])
    ]);
}

function renderStep(step, idx, sop, user, isAdmin, reload) {
    const isUserFillable = step.type === 'link' || step.type === 'text';

    const saveStep = async (updates) => {
        const currentSteps = sop.steps;
        currentSteps[idx] = { ...currentSteps[idx], ...updates };
        
        let subId = sop.activeSubmissionId;
        if (!subId) {
            subId = `sub-${sop.id}-${Date.now()}`;
            sop.activeSubmissionId = subId;
        }

        const submissionData = {
            id: subId,
            sopId: sop.id,
            sopTitle: sop.title,
            userId: user.uid,
            userName: user.nombre || user.email,
            status: 'active',
            steps: currentSteps.map(s => ({ done: s.done || false, userValue: s.userValue || '' })),
            updatedAt: new Date().toISOString()
        };

        await dbService.set('sop_submissions', subId, submissionData);
        if (updates.done !== undefined) {
            reload(false);
        }
    };

    const checkbox = h('input', {
        type: 'checkbox',
        checked: step.done || false,
        style: { cursor: 'pointer', accentColor: 'var(--accent)', flexShrink: 0 },
        onChange: async (e) => saveStep({ done: e.target.checked })
    });

    let inputEl = null;
    if (step.type === 'link' && !isAdmin) {
        inputEl = h('input', {
            type: 'url',
            className: 'form-input text-xs mt-1',
            placeholder: step.linkPlaceholder || 'Pega el enlace aquí...',
            value: step.userValue || '',
            style: { fontSize: '0.7rem', height: '30px' },
            onChange: (e) => saveStep({ userValue: e.target.value })
        });
    } else if (step.type === 'text' && !isAdmin) {
        inputEl = h('textarea', {
            className: 'form-textarea text-xs mt-1',
            placeholder: step.textDescription || 'Escribe aquí...',
            value: step.userValue || '',
            rows: 2,
            style: { fontSize: '0.7rem', minHeight: '50px' },
            onChange: (e) => saveStep({ userValue: e.target.value })
        });
    }

    return h('div', { className: 'flex-column gap-1 p-2 rounded', style: { borderRadius: '4px', background: step.done ? 'rgba(var(--success-rgb), 0.05)' : 'var(--bg-tertiary)' } }, [
        h('div', { className: 'flex items-start gap-2' }, [
            checkbox,
            h('div', { className: 'flex-column gap-0.5', style: { flex: 1 } }, [
                h('span', { className: `text-xs ${step.done ? 'text-success font-medium line-through' : 'text-secondary'}` }, step.text),
                step.type === 'link' ? h('span', { className: 'text-xs text-muted', style: { fontSize: '0.6rem' } }, `🔗 ${step.linkPlaceholder || 'Link requerido'}`) : null,
                step.type === 'text' ? h('span', { className: 'text-xs text-muted', style: { fontSize: '0.6rem' } }, `📝 ${step.textDescription || 'Texto requerido'}`) : null
            ])
        ]),
        inputEl
    ]);
}

function openSopFullView(sop, user, isAdmin, reload) {
    selectedSopId = sop.id;
    reload();
}

function openAdminSopBuilder(existing, reload) {
    const overlay = h('div', { className: 'modal-overlay' });
    const stepsData = existing ? JSON.parse(JSON.stringify(existing.steps || [])) : [];
    let galleryImageUrl = existing?.galleryImage || '';

    const stepsContainer = h('div', { className: 'flex-column gap-2' });

    const renderAdminStepRow = (step, idx) => {
        const row = h('div', { className: 'card p-3 flex-column gap-2', style: { border: '1px solid var(--border)' } }, [
            h('div', { className: 'flex items-center gap-2' }, [
                h('span', { className: 'text-xs text-muted font-bold', style: { flexShrink: 0 } }, `${idx + 1}.`),
                h('input', {
                    className: 'form-input text-xs', style: { flex: 1, height: '30px' },
                    placeholder: 'Texto del paso...',
                    value: step.text || '',
                    onInput: (e) => { stepsData[idx].text = e.target.value; }
                }),
                h('button', {
                    className: 'btn-icon text-error', style: { width: '22px', height: '22px', flexShrink: 0 },
                    onClick: () => { stepsData.splice(idx, 1); rebuildSteps(); }
                }, [icon('trash-2', 12)])
            ]),
            h('div', { className: 'flex gap-2 items-center' }, [
                h('label', { className: 'text-xs text-muted', style: { flexShrink: 0 } }, 'Tipo de campo:'),
                h('select', {
                    className: 'form-select text-xs', style: { height: '28px', flex: 1 },
                    onChange: (e) => { stepsData[idx].type = e.target.value; rebuildSteps(); }
                }, [
                    h('option', { value: 'check', selected: step.type === 'check' || !step.type }, 'Solo Checkbox'),
                    h('option', { value: 'link', selected: step.type === 'link' }, '🔗 Link'),
                    h('option', { value: 'text', selected: step.type === 'text' }, '📝 Texto')
                ]),
                h('label', { className: 'flex items-center gap-1 text-xs cursor-pointer' }, [
                    h('input', {
                        type: 'checkbox', checked: step.active !== false,
                        onChange: (e) => { stepsData[idx].active = e.target.checked; }
                    }),
                    h('span', {}, 'Activo')
                ])
            ]),
            step.type === 'link' ? h('input', {
                className: 'form-input text-xs', style: { height: '28px' },
                placeholder: 'Texto guía del link',
                value: step.linkPlaceholder || '',
                onInput: (e) => { stepsData[idx].linkPlaceholder = e.target.value; }
            }) : null,
            step.type === 'text' ? h('input', {
                className: 'form-input text-xs', style: { height: '28px' },
                placeholder: 'Mini descripción del texto',
                value: step.textDescription || '',
                onInput: (e) => { stepsData[idx].textDescription = e.target.value; }
            }) : null
        ]);
        return row;
    };

    const rebuildSteps = () => {
        stepsContainer.innerHTML = '';
        stepsData.forEach((step, idx) => stepsContainer.appendChild(renderAdminStepRow(step, idx)));
        if (window.lucide) window.lucide.createIcons();
    };

    const addStep = () => {
        stepsData.push({ text: '', type: 'check', done: false, active: true });
        rebuildSteps();
    };

    rebuildSteps();

    const form = h('form', {
        className: 'modal-container', style: { maxWidth: '600px' },
        onSubmit: async (e) => {
            e.preventDefault();
            const titleVal = form.querySelector('#sop-title').value.trim();
            const iconVal = form.querySelector('#sop-icon').value;
            const roleVal = form.querySelector('#sop-role').value;
            const activeVal = form.querySelector('#sop-active') ? form.querySelector('#sop-active').checked : true;

            const id = existing?.id || `SOP-${Date.now().toString().slice(-5)}`;
            const newSop = {
                id, title: titleVal, iconName: iconVal,
                targetRole: roleVal, active: activeVal,
                galleryImage: galleryImageUrl || '',
                steps: stepsData.filter(s => s.text?.trim())
            };

            const hasDefault = newSop.steps.some(s => s.isDefault);
            if (!hasDefault) {
                newSop.steps.push({ text: '✅ Anotar en la factura y registrar el trabajo completado', type: 'check', done: false, isDefault: true });
            }

            try {
                await dbService.set('sops', id, newSop);
                overlay.remove();
                reload();
            } catch (err) {
                console.error(err);
                alert("Error al guardar SOP");
            }
        }
    }, [
        h('div', { className: 'modal-header' }, [
            h('span', { className: 'modal-title' }, existing ? `Editar SOP: ${existing.title}` : 'Crear Nuevo SOP'),
            h('button', { type: 'button', onClick: () => overlay.remove() }, '×')
        ]),
        h('div', { className: 'modal-body flex-column gap-3', style: { maxHeight: '70vh', overflowY: 'auto' } }, [
            h('div', { className: 'grid gap-3', style: { display: 'grid', gridTemplateColumns: '1fr auto' } }, [
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label text-xs' }, 'Título del SOP'),
                    h('input', { id: 'sop-title', className: 'form-input text-xs', required: true, value: existing?.title || '', placeholder: 'Ej. Control de Audio...' })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label text-xs' }, 'Icono'),
                    h('select', { id: 'sop-icon', className: 'form-select text-xs', style: { height: '38px' } },
                        ICONS.map(ic => h('option', { value: ic, selected: existing?.iconName === ic }, ic))
                    )
                ])
            ]),
            h('div', { className: 'form-group' }, [
                h('label', { className: 'form-label text-xs' }, 'Rol Objetivo'),
                h('select', { id: 'sop-role', className: 'form-select text-xs', style: { height: '38px' } },
                    ROLES.map(r => h('option', { value: r, selected: existing?.targetRole === r }, ROLE_LABELS[r] || r))
                )
            ]),
            h('label', { className: 'flex items-center gap-2 text-xs cursor-pointer mt-1' }, [
                h('input', { id: 'sop-active', type: 'checkbox', checked: existing ? existing.active !== false : true }),
                h('span', {}, 'SOP Activo')
            ]),
            h('div', { className: 'form-group' }, [
                h('label', { className: 'form-label text-xs' }, 'Imagen de Galería (opcional)'),
                h('div', { className: 'flex gap-2 items-center' }, [
                    h('input', { 
                        type: 'file', 
                        id: 'sop-gallery-upload',
                        style: { display: 'none' },
                        accept: 'image/*',
                        onChange: async (e) => {
                            const file = e.target.files[0];
                            if (!file) return;
                            const btn = document.getElementById('sop-upload-btn');
                            btn.innerHTML = 'Subiendo...';
                            btn.disabled = true;
                            try {
                                const url = await storageService.uploadAsset(file, 'sops/' + Date.now() + '_' + file.name);
                                galleryImageUrl = url;
                                const imgPreview = document.getElementById('sop-img-preview');
                                if (imgPreview) {
                                    imgPreview.src = url;
                                    imgPreview.style.display = 'block';
                                }
                                btn.innerHTML = '¡Subido!';
                                setTimeout(() => { btn.innerHTML = 'Cambiar Imagen'; }, 2000);
                            } catch(err) {
                                alert("Error al subir imagen");
                                btn.innerHTML = 'Subir';
                            } finally {
                                btn.disabled = false;
                            }
                        }
                    }),
                    h('button', { 
                        type: 'button', 
                        id: 'sop-upload-btn',
                        className: 'btn btn-outline text-xs',
                        onClick: () => form.querySelector('#sop-gallery-upload').click()
                    }, galleryImageUrl ? 'Cambiar Imagen' : 'Subir Imagen')
                ]),
                h('img', { 
                    id: 'sop-img-preview', 
                    src: galleryImageUrl || '', 
                    style: { width: '100%', maxHeight: '120px', objectFit: 'cover', borderRadius: '6px', marginTop: '8px', display: galleryImageUrl ? 'block' : 'none' } 
                })
            ]),
            h('div', { className: 'flex-column gap-2' }, [
                h('div', { className: 'flex justify-between items-center' }, [
                    h('label', { className: 'form-label text-xs', style: { margin: 0 } }, `Pasos del SOP (${stepsData.length})`),
                    h('button', {
                        type: 'button', className: 'btn btn-outline text-xs', style: { padding: '3px 8px' },
                        onClick: addStep
                    }, [icon('plus', 11), h('span', {}, 'Añadir Paso')])
                ]),
                stepsContainer
            ])
        ]),
        h('div', { className: 'modal-footer' }, [
            h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => overlay.remove() }, 'Cancelar'),
            h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, existing ? 'Guardar' : 'Crear')
        ])
    ]);

    overlay.appendChild(form);
    document.body.appendChild(overlay);
    if (window.lucide) window.lucide.createIcons();
}

async function openSopHistory(sop) {
    const overlay = h('div', { className: 'modal-overlay' });
    const modal = h('div', { className: 'modal-container flex-column gap-3', style: { maxWidth: '700px' } }, [
        h('div', { className: 'modal-header' }, [
            h('span', { className: 'modal-title' }, `Historial: ${sop.title}`),
            h('button', { type: 'button', onClick: () => overlay.remove() }, '×')
        ]),
        h('div', { className: 'modal-body flex-column gap-3', style: { maxHeight: '60vh', overflowY: 'auto' } }, [
            h('div', { className: 'loader' })
        ])
    ]);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    try {
        const subs = await dbService.query('sop_submissions', 'sopId', '==', sop.id);
        const completed = subs.filter(s => s.status === 'completed').sort((a,b) => new Date(b.completedAt) - new Date(a.completedAt));
        
        const body = modal.querySelector('.modal-body');
        body.innerHTML = '';

        if (completed.length === 0) {
            body.appendChild(h('p', { className: 'text-muted text-center text-xs p-4' }, 'Nadie ha completado este SOP todavía.'));
            return;
        }

        completed.forEach(sub => {
            const dateStr = new Date(sub.completedAt).toLocaleString();
            const row = h('div', { className: 'card p-3 flex-column gap-2', style: { border: '1px solid var(--border)' } }, [
                h('div', { className: 'flex justify-between items-center border-bottom pb-2' }, [
                    h('span', { className: 'font-bold text-sm text-primary' }, sub.userName || sub.userId),
                    h('span', { className: 'text-xs text-muted' }, dateStr)
                ]),
                h('div', { className: 'flex-column gap-1' }, 
                    (sub.steps || []).map((st, i) => {
                        const originalStep = sop.steps[i] || {};
                        const userVal = st.userValue ? ` ➔ ${st.userValue}` : '';
                        return h('div', { className: 'text-xs flex gap-2' }, [
                            h('span', { className: st.done ? 'text-success' : 'text-error' }, st.done ? '☑' : '☒'),
                            h('span', { className: 'text-muted' }, `${originalStep.text || 'Paso'}${userVal}`)
                        ]);
                    })
                )
            ]);
            body.appendChild(row);
        });
        if (window.lucide) window.lucide.createIcons();
    } catch(e) {
        modal.querySelector('.modal-body').innerHTML = `<p class="text-error text-xs p-4">Error cargando historial: ${e.message}</p>`;
    }
}
