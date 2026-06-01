/**
 * SOPs Page - Creative Production OS
 * Admin: Notion-style SOP builder with per-role targeting, gallery images, links, text fields.
 * User: Fill in their own SOPs, mark steps done, redirect to billing at the end.
 */
import { h, icon } from '../utils/dom.js';
import { dbService, storageService } from '../firebase/service.js';
import { store } from '../js/store.js';

const ICONS = ['check-square', 'video', 'scissors', 'mic', 'pen-tool', 'monitor', 'camera', 'file-text', 'layers', 'zap'];
const ROLES = ['all', 'editor', 'camarógrafo', 'estratega', 'diseñador', 'administración digital'];
const ROLE_LABELS = { all: 'Todos los Roles', editor: 'Editor de Video', camarógrafo: 'Camarógrafo', estratega: 'Estratega Creativo', diseñador: 'Diseñador Gráfico', 'administración digital': 'Administración Digital' };

export const render = () => {
    const { user } = store.getState();
    const isAdmin = user?.role === 'admin';
    const container = h('div', { className: 'fade-in flex-column gap-4' });

    const load = async () => {
        container.innerHTML = '<div class="loader mb-4"></div>';
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
            : sopsList.filter(s => s.active !== false && (!s.targetRole || s.targetRole === 'all' || s.targetRole === userRole));

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
            // No active submission: ensure template steps are reset to 0% locally
            const resetSteps = (sopTemplate.steps || []).map(st => ({ ...st, done: false, userValue: '' }));
            return { ...sopTemplate, steps: resetSteps };
        });

        // Header
        container.appendChild(h('div', { className: 'content-header flex justify-between items-center w-full mb-4', style: { paddingBottom: '1rem' } }, [
            h('div', { className: 'flex items-center gap-3' }, [
                h('div', { className: 'icon-wrapper bg-accent-soft p-2 rounded' }, [
                    icon('layers', 24, 'text-accent')
                ]),
                h('div', {}, [
                    h('h1', {}, isAdmin ? 'Constructor de SOPs' : 'Mis Procedimientos (SOPs)'),
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

// ── SOP Card ─────────────────────────────────────────────────────────────────
function renderSopCard(sop, isAdmin, user, reload) {
    const steps = sop.steps || [];
    const doneCount = steps.filter(s => s.done).length;
    const allDone = steps.length > 0 && doneCount === steps.length;
    const pct = steps.length > 0 ? Math.round((doneCount / steps.length) * 100) : 0;
    const roleLabel = ROLE_LABELS[sop.targetRole] || sop.targetRole || 'Todos';

    return h('div', {
        className: 'card interactive-card p-0 flex-column',
        style: { overflow: 'hidden', opacity: sop.active === false ? 0.5 : 1 }
    }, [
        // Top bar with progress color
        h('div', { style: { height: '3px', background: `linear-gradient(90deg, var(--accent) ${pct}%, var(--bg-tertiary) ${pct}%)` } }),
        h('div', { className: 'p-4 flex-column gap-3' }, [
            // Header row
            h('div', { className: 'flex justify-between items-start' }, [
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
                    // Active/inactive badge
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

            // Progress bar
            h('div', {}, [
                h('div', { className: 'flex justify-between text-xs text-muted mb-1' }, [
                    h('span', {}, `${doneCount}/${steps.length} pasos`),
                    h('span', { className: allDone ? 'text-success font-bold' : '' }, `${pct}%`)
                ]),
                h('div', { style: { height: '4px', background: 'var(--bg-tertiary)', borderRadius: '2px', overflow: 'hidden' } }, [
                    h('div', { style: { height: '100%', width: `${pct}%`, background: allDone ? 'var(--success)' : 'var(--accent)', transition: 'width 0.4s ease', borderRadius: '2px' } })
                ])
            ]),

            // Gallery image if set
            sop.galleryImage ? h('img', { src: sop.galleryImage, style: { width: '100%', height: '120px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border)' } }) : null,

            // Steps list
            h('div', { className: 'flex-column gap-2' },
                steps.map((step, idx) => renderStep(step, idx, sop, user, isAdmin, reload))
            ),

            // Bottom actions
            h('div', { className: 'flex gap-2 border-top pt-3 mt-1' }, [
                allDone
                    ? h('button', {
                        className: 'btn btn-primary text-xs flex-1 text-center flex justify-center items-center',
                        onClick: async (e) => {
                            if (!sop.activeSubmissionId) return;
                            const btn = e.currentTarget;
                            btn.disabled = true;
                            btn.innerHTML = 'Guardando...';
                            await dbService.update('sop_submissions', sop.activeSubmissionId, { 
                                status: 'completed', 
                                completedAt: new Date().toISOString() 
                            });
                            // Go to billing
                            window.location.hash = '#billing';
                        }
                    }, [icon('check-circle', 12), h('span', { style: { marginLeft: '4px' } }, 'Anotar en Factura →')])
                    : h('button', {
                        className: 'btn btn-outline text-xs flex-1',
                        onClick: () => openSopFullView(sop, user, isAdmin, reload)
                    }, 'Ver Detalle Completo')
            ])
        ])
    ]);
}

// ── Individual Step ───────────────────────────────────────────────────────────
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
        reload();
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

    return h('div', { className: 'flex-column gap-1 p-2 rounded', style: { borderRadius: '4px', background: step.done ? 'rgba(16,185,129,0.05)' : 'var(--bg-tertiary)' } }, [
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

// ── Full SOP View Modal ───────────────────────────────────────────────────────
function openSopFullView(sop, user, isAdmin, reload) {
    const overlay = h('div', { className: 'modal-overlay' });
    const steps = sop.steps || [];

    const modal = h('div', { className: 'modal-container', style: { maxWidth: '580px' } }, [
        h('div', { className: 'modal-header' }, [
            h('span', { className: 'modal-title' }, sop.title),
            h('button', { type: 'button', onClick: () => overlay.remove() }, '×')
        ]),
        h('div', { className: 'modal-body flex-column gap-3', style: { maxHeight: '60vh', overflowY: 'auto' } }, [
            sop.galleryImage ? h('img', { src: sop.galleryImage, style: { width: '100%', height: '160px', objectFit: 'cover', borderRadius: '6px' } }) : null,
            h('div', { className: 'flex-column gap-2' },
                steps.map((step, idx) => renderStep(step, idx, sop, user, isAdmin, () => { overlay.remove(); reload(); }))
            )
        ]),
        h('div', { className: 'modal-footer' }, [
            h('button', { className: 'btn btn-outline text-xs', onClick: () => overlay.remove() }, 'Cerrar'),
            h('a', { href: '#billing', className: 'btn btn-primary text-xs', style: { textDecoration: 'none' }, onClick: () => overlay.remove() }, [icon('credit-card', 12), h('span', { style: { marginLeft: '4px' } }, 'Ir a Factura')])
        ])
    ]);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    if (window.lucide) window.lucide.createIcons();
}

// ── Admin SOP Builder Modal ───────────────────────────────────────────────────
function openAdminSopBuilder(existing, reload) {
    const overlay = h('div', { className: 'modal-overlay' });
    const stepsData = existing ? JSON.parse(JSON.stringify(existing.steps || [])) : [];
    let galleryImageUrl = existing?.galleryImage || '';

    const stepsContainer = h('div', { className: 'flex-column gap-2' });

    const renderAdminStepRow = (step, idx) => {
        const row = h('div', { className: 'card p-3 flex-column gap-2', style: { border: '1px solid var(--border)' } }, [
            // Step text (admin sets this)
            h('div', { className: 'flex items-center gap-2' }, [
                h('span', { className: 'text-xs text-muted font-bold', style: { flexShrink: 0 } }, `${idx + 1}.`),
                h('input', {
                    className: 'form-input text-xs', style: { flex: 1, height: '30px' },
                    placeholder: 'Texto del paso (solo editable por admin)...',
                    value: step.text || '',
                    onInput: (e) => { stepsData[idx].text = e.target.value; }
                }),
                h('button', {
                    className: 'btn-icon text-error', style: { width: '22px', height: '22px', flexShrink: 0 },
                    onClick: () => { stepsData.splice(idx, 1); rebuildSteps(); }
                }, [icon('trash-2', 12)])
            ]),
            // Step type selector
            h('div', { className: 'flex gap-2 items-center' }, [
                h('label', { className: 'text-xs text-muted', style: { flexShrink: 0 } }, 'Tipo de campo:'),
                h('select', {
                    className: 'form-select text-xs', style: { height: '28px', flex: 1 },
                    onChange: (e) => { stepsData[idx].type = e.target.value; rebuildSteps(); }
                }, [
                    h('option', { value: 'check', selected: step.type === 'check' || !step.type }, 'Solo Checkbox'),
                    h('option', { value: 'link', selected: step.type === 'link' }, '🔗 Link (usuario pone su link)'),
                    h('option', { value: 'text', selected: step.type === 'text' }, '📝 Texto (usuario escribe)')
                ]),
                // Active toggle
                h('label', { className: 'flex items-center gap-1 text-xs cursor-pointer' }, [
                    h('input', {
                        type: 'checkbox', checked: step.active !== false,
                        onChange: (e) => { stepsData[idx].active = e.target.checked; }
                    }),
                    h('span', {}, 'Activo')
                ])
            ]),
            // Link placeholder (only if type === link)
            step.type === 'link' ? h('input', {
                className: 'form-input text-xs', style: { height: '28px' },
                placeholder: 'Texto guía del link (ej: "Pega el link del drive aquí")',
                value: step.linkPlaceholder || '',
                onInput: (e) => { stepsData[idx].linkPlaceholder = e.target.value; }
            }) : null,
            // Text description (only if type === text)
            step.type === 'text' ? h('input', {
                className: 'form-input text-xs', style: { height: '28px' },
                placeholder: 'Mini descripción del texto que debe poner (solo editable por admin)',
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
            const activeVal = form.querySelector('#sop-active').checked;
            const galleryVal = form.querySelector('#sop-gallery').value.trim();

            const id = existing?.id || `SOP-${Date.now().toString().slice(-5)}`;
            const newSop = {
                id, title: titleVal, iconName: iconVal,
                targetRole: roleVal, active: activeVal,
                galleryImage: galleryImageUrl || '',
                steps: stepsData.filter(s => s.text?.trim())
            };

            // Add default last step: "Anotar en factura" if not present
            const hasDefault = newSop.steps.some(s => s.isDefault);
            if (!hasDefault) {
                newSop.steps.push({ text: '✅ Anotar en la factura y registrar el trabajo completado', type: 'check', done: false, isDefault: true });
            }

            await dbService.set('sops', id, newSop);
            overlay.remove();
            reload();
        }
    }, [
        h('div', { className: 'modal-header' }, [
            h('span', { className: 'modal-title' }, existing ? `Editar SOP: ${existing.title}` : 'Crear Nuevo SOP'),
            h('button', { type: 'button', onClick: () => overlay.remove() }, '×')
        ]),
        h('div', { className: 'modal-body flex-column gap-3', style: { maxHeight: '70vh', overflowY: 'auto' } }, [
            // Title + icon + role
            h('div', { className: 'grid gap-3', style: { display: 'grid', gridTemplateColumns: '1fr auto auto' } }, [
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Título del SOP'),
                    h('input', { id: 'sop-title', className: 'form-input text-xs', required: true, value: existing?.title || '', placeholder: 'Ej. Control de Audio en Grabación' })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Icono'),
                    h('select', { id: 'sop-icon', className: 'form-select text-xs', style: { height: '38px' } },
                        ICONS.map(ic => h('option', { value: ic, selected: existing?.iconName === ic }, ic))
                    )
                ]),
                h('div', { className: 'form-group' }, [
                    // Empty placeholder to maintain grid layout
                ])
            ]),
            // Role target
            h('div', { className: 'form-group' }, [
                h('label', { className: 'form-label' }, 'Rol Objetivo'),
                h('select', { id: 'sop-role', className: 'form-select text-xs', style: { height: '38px' } },
                    ROLES.map(r => h('option', { value: r, selected: existing?.targetRole === r }, ROLE_LABELS[r] || r))
                )
            ]),
            // Gallery image upload
            h('div', { className: 'form-group' }, [
                h('label', { className: 'form-label' }, 'Imagen de Galería (opcional)'),
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
                            const originalText = btn.innerHTML;
                            btn.innerHTML = 'Subiendo...';
                            btn.disabled = true;
                            try {
                                const url = await storageService.uploadAsset(file, 'sops/' + Date.now() + '_' + file.name);
                                galleryImageUrl = url;
                                
                                const { user } = store.getState();
                                await dbService.add('assets', {
                                    title: `SOP Imagen: ${file.name}`,
                                    type: 'image',
                                    url: url,
                                    uploadedBy: user?.uid || 'admin',
                                    createdAt: new Date().toISOString()
                                });

                                const imgPreview = document.getElementById('sop-img-preview');
                                if (imgPreview) {
                                    imgPreview.src = url;
                                    imgPreview.style.display = 'block';
                                }
                                btn.innerHTML = '¡Subido!';
                                setTimeout(() => { btn.innerHTML = 'Cambiar Imagen'; }, 2000);
                            } catch(err) {
                                console.error(err);
                                alert("Error al subir imagen");
                                btn.innerHTML = originalText;
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
                    }, galleryImageUrl ? 'Cambiar Imagen' : 'Subir Imagen'),
                    
                    h('button', {
                        type: 'button',
                        id: 'sop-delete-img-btn',
                        className: 'btn-icon text-error',
                        title: 'Eliminar imagen',
                        style: { display: galleryImageUrl ? 'flex' : 'none' },
                        onClick: () => {
                            galleryImageUrl = '';
                            const imgPreview = document.getElementById('sop-img-preview');
                            if (imgPreview) imgPreview.style.display = 'none';
                            const btn = document.getElementById('sop-upload-btn');
                            if (btn) btn.innerHTML = 'Subir Imagen';
                            document.getElementById('sop-delete-img-btn').style.display = 'none';
                        }
                    }, [icon('trash-2', 14)])
                ]),
                h('img', { 
                    id: 'sop-img-preview', 
                    src: galleryImageUrl || '', 
                    style: { width: '100%', maxHeight: '120px', objectFit: 'cover', borderRadius: '6px', marginTop: '8px', display: galleryImageUrl ? 'block' : 'none' } 
                })
            ]),
            // Steps
            h('div', { className: 'flex-column gap-2' }, [
                h('div', { className: 'flex justify-between items-center' }, [
                    h('label', { className: 'form-label', style: { margin: 0 } }, `Pasos del SOP (${stepsData.length})`),
                    h('button', {
                        type: 'button', className: 'btn btn-outline text-xs', style: { padding: '3px 8px' },
                        onClick: addStep
                    }, [icon('plus', 11), h('span', {}, 'Añadir Paso')])
                ]),
                stepsContainer,
                h('p', { className: 'text-xs text-muted italic' }, '💡 Al final se añade automáticamente el paso "Anotar en factura" redirigiendo a Pagos.')
            ])
        ]),
        h('div', { className: 'modal-footer' }, [
            h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => overlay.remove() }, 'Cancelar'),
            h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, existing ? 'Guardar Cambios' : 'Crear SOP')
        ])
    ]);

    overlay.appendChild(form);
    document.body.appendChild(overlay);
    if (window.lucide) window.lucide.createIcons();
}

// ── Admin SOP History Modal ───────────────────────────────────────────────────
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
