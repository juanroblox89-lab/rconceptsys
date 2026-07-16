/**
 * Admin Panel Page - Creative Production OS
 * Full admin CRUD organized as a modular control center.
 */
import { h, icon } from '../utils/dom.js';
import { store } from '../js/store.js';
import { userService } from '../services/userService.js';
import { storageService, dbService } from '../supabase/service.js';
import { invoiceService } from '../services/invoiceService.js';
import { isMasterAdmin } from '../services/permissionsService.js';

let activeAdminTab = 'members'; // members, financial, roles, system

export const render = () => {
    const { user } = store.getState();
    const container = h('div', { className: 'fade-in flex-column gap-6 w-full' });

    if (user?.role !== 'admin') {
        return h('div', { className: 'card p-8 text-center flex-column items-center gap-3', style: { marginTop: '2rem' } }, [
            icon('shield-alert', 48),
            h('h3', { style: { marginTop: '12px' } }, 'Acceso Restringido'),
            h('p', { className: 'text-xs text-muted', style: { maxWidth: '320px' } },
                'Este panel es exclusivo del Administrador Global. Usa el botón ⚡ ADMIN en la cabecera para elevar permisos.'),
        ]);
    }

    const showFeedback = (el, msg, type = 'success') => {
        const fb = h('span', {
            style: { fontSize: '0.65rem', color: type === 'success' ? 'var(--success)' : 'var(--error)', fontWeight: 600, marginLeft: '6px' }
        }, msg);
        el.parentNode?.insertBefore(fb, el.nextSibling);
        setTimeout(() => fb.remove(), 3000);
    };

    const loadAdminDashboard = async () => {
        container.innerHTML = '<div class="loader mb-4"></div>';

        try {
            const [allUsers, clientsList, rolesList] = await Promise.all([
                userService.getAllUsers(),
                dbService.getAll('clients').catch(() => []),
                dbService.getAll('roles').catch(() => [])
            ]);
            const pendingUsers = allUsers.filter(u => !u.approved);
            const approvedUsers = allUsers.filter(u => u.approved);

            container.innerHTML = '';

            // Header
            container.appendChild(
                h('div', { className: 'content-header flex justify-between items-center w-full mb-3' }, [
                    h('div', {}, [
                        h('h1', {}, 'Centro de Control Administrativo'),
                        h('p', { className: 'text-xs text-muted mt-1' }, `${approvedUsers.length} miembros activos · ${pendingUsers.length} pendientes de aprobación`)
                    ]),
                    h('span', { className: 'badge badge-success text-xs font-bold' }, '👑 ADMIN MAESTRO')
                ])
            );

            // Tab Navigation
            const tabsNav = h('div', { className: 'tab-nav-premium mb-4' }, [
                h('button', { className: `tab-btn-premium ${activeAdminTab === 'members' ? 'active' : ''}`, onClick: () => { activeAdminTab = 'members'; loadAdminDashboard(); } }, 'Equipo & Accesos'),
                h('button', { className: `tab-btn-premium ${activeAdminTab === 'financial' ? 'active' : ''}`, onClick: () => { activeAdminTab = 'financial'; loadAdminDashboard(); } }, 'Tarifas y Finanzas'),
                h('button', { className: `tab-btn-premium ${activeAdminTab === 'roles' ? 'active' : ''}`, onClick: () => { activeAdminTab = 'roles'; loadAdminDashboard(); } }, 'Roles de Producción'),
                h('button', { className: `tab-btn-premium ${activeAdminTab === 'system' ? 'active' : ''}`, onClick: () => { activeAdminTab = 'system'; loadAdminDashboard(); } }, 'Sistema & Backups')
            ]);
            container.appendChild(tabsNav);

            // Modular View Router
            if (activeAdminTab === 'members') {
                // Member management module
                const pendingCardGrid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' } });
                pendingUsers.forEach(pu => pendingCardGrid.appendChild(renderPendingCard(pu, loadAdminDashboard, rolesList)));

                container.appendChild(h('div', { className: 'flex-column gap-4 w-full' }, [
                    h('h3', { className: 'text-sm font-bold text-primary border-bottom pb-2' }, `Solicitudes Pendientes (${pendingUsers.length})`),
                    pendingUsers.length === 0 
                        ? h('div', { className: 'card p-5 text-center text-xs text-muted' }, '✅ No hay usuarios pendientes en este momento.')
                        : pendingCardGrid,
                    
                    h('h3', { className: 'text-sm font-bold text-primary border-bottom pb-2 mt-4' }, 'Miembros Aprobados'),
                    h('div', { className: 'card p-4 flex-column gap-2' }, [
                        h('div', { className: 'relative mb-2' }, [
                            h('span', { className: 'absolute', style: { left: '8px', top: '7px', color: 'var(--text-muted)' } }, icon('search', 14)),
                            h('input', { 
                                type: 'text', 
                                className: 'form-input text-xs', 
                                placeholder: 'Buscar usuario...',
                                style: { width: '220px', paddingLeft: '28px', borderRadius: '20px' },
                                onInput: (e) => {
                                    const term = e.target.value.toLowerCase();
                                    const tbody = container.querySelector('tbody');
                                    if (tbody) {
                                        Array.from(tbody.children).forEach(row => {
                                            const txt = row.textContent.toLowerCase();
                                            row.style.display = txt.includes(term) ? '' : 'none';
                                        });
                                    }
                                }
                            })
                        ]),
                        h('div', { className: 'table-container' }, [
                            h('table', { style: { width: '100%', borderCollapse: 'collapse' } }, [
                                h('thead', { style: { background: 'var(--bg-tertiary)' } }, h('tr', {}, [
                                    h('th', { style: { padding: '12px' } }, 'Usuario'),
                                    h('th', { style: { padding: '12px' } }, 'Rol de Producción'),
                                    h('th', { style: { padding: '12px' } }, 'Estado'),
                                    h('th', { style: { padding: '12px' } }, 'Acciones')
                                ])),
                                h('tbody', {}, approvedUsers.map(u =>
                                    renderTeamRow(u, user, loadAdminDashboard, showFeedback, clientsList, rolesList)
                                ))
                            ])
                        ])
                    ])
                ]));

            } else if (activeAdminTab === 'financial') {
                // Financial module
                const finConfig = await renderPricingConfigSection();
                container.appendChild(h('div', { className: 'card p-5 flex-column gap-3' }, [
                    h('h3', { className: 'text-sm font-bold border-bottom pb-2' }, 'Configuración Financiera (COP)'),
                    finConfig
                ]));

            } else if (activeAdminTab === 'roles') {
                // Roles module
                container.appendChild(renderRolesSection(rolesList, loadAdminDashboard));

            } else if (activeAdminTab === 'system') {
                // System maintenance, backup, logs, logo module
                container.appendChild(h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', width: '100%' } }, [
                    h('div', { className: 'card p-5 flex-column gap-3' }, [
                        h('h3', { className: 'text-sm font-bold border-bottom pb-2 text-primary' }, 'Subida de Logo Oficial'),
                        renderUploadSection()
                    ]),
                    h('div', { className: 'card p-5 flex-column gap-3' }, [
                        h('h3', { className: 'text-sm font-bold border-bottom pb-2 text-primary' }, 'Mantenimiento del Sistema'),
                        renderDatabaseMaintenanceSection()
                    ])
                ]));
            }

            if (window.lucide) window.lucide.createIcons();

        } catch (err) {
            console.error('[Admin] Load failed:', err);
            container.innerHTML = `<div class="card p-8 text-center text-danger">⚠️ Error al cargar el panel de control: ${err.message}</div>`;
        }
    };

    loadAdminDashboard();
    return container;
};

// ── Pending User Card ────────────────────────────────────────
function renderPendingCard(pu, reload, rolesList = []) {
    const avatar = pu.photoURL
        ? h('img', { src: pu.photoURL, style: { width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0 } })
        : h('div', {
            style: {
                width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
                background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)'
            }
        }, (pu.nombre || pu.email || 'US').slice(0, 2).toUpperCase());

    const defaultRoles = [
        { id: 'camarógrafo', label: 'Camarógrafo' },
        { id: 'editor', label: 'Editor de Video' },
        { id: 'editorcamarografo', label: 'Creador 360° (Camarógrafo + Editor)' },
        { id: 'uploader', label: 'Publicador / Uploader' },
        { id: 'estratega', label: 'Estratega Creativo' },
        { id: 'diseñador', label: 'Diseñador Gráfico' },
        { id: 'administración digital', label: 'Administración Digital' }
    ];
    const roleOptions = rolesList.length > 0
        ? rolesList.filter(r => r.active !== false).map(r => ({ id: r.id, label: r.label }))
        : defaultRoles;

    const roleSelect = h('select', { className: 'form-select text-xs' },
        roleOptions.map(r => h('option', { value: r.id }, r.label))
    );

    return h('div', { className: 'card flex-column gap-3' }, [
        h('div', { className: 'flex items-center gap-3' }, [
            avatar,
            h('div', { className: 'flex-column', style: { minWidth: 0 } }, [
                h('span', { className: 'font-bold text-xs truncate' }, pu.nombre || 'Usuario'),
                h('span', { className: 'text-xs text-muted truncate' }, pu.email || ''),
                h('span', { className: 'badge badge-warning text-xs mt-1' }, 'PENDIENTE')
            ])
        ]),
        h('div', { className: 'form-group' }, [
            h('label', { className: 'form-label' }, 'Rol de producción:'),
            roleSelect
        ]),
        h('div', { className: 'flex gap-2 w-full mt-1' }, [
            h('button', {
                className: 'btn btn-outline flex-1 text-xs text-error',
                style: { borderColor: 'var(--error)' },
                onClick: async (e) => {
                    const btn = e.currentTarget;
                    if (confirm('¿Rechazar solicitud?')) {
                        try {
                            await userService.rejectUser(pu.uid || pu.id);
                            reload();
                        } catch (err) {
                            alert('Error al rechazar usuario.');
                        }
                    }
                }
            }, 'Rechazar'),
            h('button', {
                className: 'btn btn-primary text-xs flex-1',
                onClick: async (e) => {
                    const btn = e.currentTarget;
                    btn.disabled = true;
                    try {
                        await userService.approveUser(pu.uid, roleSelect.value);
                        reload();
                    } catch (err) {
                        btn.disabled = false;
                        alert("Error: " + err.message);
                    }
                }
            }, 'Aprobar')
        ])
    ]);
}

// ── Team Row ─────────────────────────────────────────────────
function renderTeamRow(u, currentUser, reload, showFeedback, clientsList, rolesList = []) {
    const isCurrentUser = (u.uid || u.id) === (currentUser.uid || currentUser.id);
    const isAdmin = u.role === 'admin';

    const avatar = u.photoURL
        ? h('img', { src: u.photoURL, style: { width: '24px', height: '24px', borderRadius: '50%' } })
        : h('div', {
            style: {
                width: '24px', height: '24px', borderRadius: '50%',
                background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontWeight: 700, fontSize: '0.65rem', color: 'var(--text-secondary)'
            }
        }, (u.nombre || u.email || 'US').slice(0, 2).toUpperCase());

    const actions = [];

    if (isCurrentUser) {
        actions.push(h('span', { className: 'badge badge-secondary text-xs' }, 'Tú'));
    }

    if (!isAdmin && !isCurrentUser) {
        actions.push(h('button', {
            className: 'btn btn-outline text-xs',
            style: { padding: '3px 8px', fontSize: '0.65rem' },
            onClick: () => openClientAccessModal(u, clientsList, reload)
        }, 'Accesos'));
    }

    if (isAdmin && !isCurrentUser) {
        actions.push(h('button', {
            className: 'btn btn-outline text-xs',
            style: { padding: '3px 8px', fontSize: '0.65rem' },
            onClick: () => openUserPhoneModal(u, reload)
        }, 'WhatsApp'));
    }

    if (!isAdmin && !isCurrentUser) {
        if (isMasterAdmin()) {
            actions.push(h('button', {
                className: 'btn btn-primary text-xs',
                style: { padding: '3px 8px', fontSize: '0.65rem' },
                onClick: async (e) => {
                    if (!window.confirm(`¿Promover a ${u.nombre || u.email} como Administrador?`)) return;
                    const btn = e.currentTarget;
                    try {
                        await userService.approveUser(u.uid || u.id, 'admin');
                        showFeedback(btn, '✓ Promovido');
                        setTimeout(() => reload(), 1200);
                    } catch (err) {
                        showFeedback(btn, '✗ Error', 'error');
                    }
                }
            }, 'Hacer Admin'));
        }
    }

    if (!isCurrentUser && !isAdmin) {
        actions.push(h('button', {
            className: 'btn btn-outline text-xs text-error',
            style: { padding: '3px 8px', fontSize: '0.65rem', borderColor: 'var(--error)' },
            onClick: async () => {
                if (!window.confirm(`¿Eliminar a ${u.nombre || u.email} permanentemente?`)) return;
                const { promptModal } = await import('../components/ui/PromptModal.js');
                const confirmText = await promptModal({ title: 'Confirmar eliminación', message: `Escribe "Eliminar" para confirmar la eliminación de ${u.nombre || u.email}.`, placeholder: 'Eliminar' });
                if (confirmText !== 'Eliminar') return;
                await userService.rejectUser(u.uid || u.id);
                reload();
            }
        }, 'Eliminar'));
    }

    return h('tr', {}, [
        h('td', {}, h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [avatar, h('span', {}, u.nombre || u.email)])),
        h('td', {}, 
            (currentUser.role === 'admin' && !isAdmin) ? 
            (() => {
                const selectEl = h('select', { 
                    className: 'form-select text-xs', 
                    style: { padding: '2px 8px' },
                    onChange: async (e) => {
                        const newRole = e.target.value;
                        await userService.approveUser(u.uid || u.id, newRole);
                        showFeedback(e.target.parentNode, '✓ Guardado');
                    }
                }, [
                    ...rolesList.filter(r => r.active !== false).map(r => h('option', { value: r.id }, r.label)),
                    (!rolesList.find(r => r.id === u.role)) ? h('option', { value: u.role }, u.role) : null
                ].filter(Boolean));
                setTimeout(() => { selectEl.value = u.role || ''; }, 0);
                return selectEl;
            })()
            : 
            h('span', { className: `badge ${isAdmin ? 'badge-success' : 'badge-info'} text-xs` }, (u.role || 'viewer').toUpperCase())
        ),
        h('td', {}, h('span', { className: 'badge badge-success text-xs' }, 'Activo')),
        h('td', {}, h('div', { style: { display: 'flex', gap: '4px' } }, actions))
    ]);
}

// ── Client Access Modal ──────────────────────────────────────────
function openClientAccessModal(u, clientsList, reload) {
    const overlay = h('div', { className: 'modal-overlay' });
    const currentAllowed = u.allowedClients || [];

    const checkboxes = clientsList.map(c => {
        return h('label', { className: 'flex items-center gap-2 cursor-pointer p-1' }, [
            h('input', { 
                type: 'checkbox', 
                value: c.id, 
                checked: currentAllowed.includes(c.id),
                className: 'form-checkbox'
            }),
            h('span', { className: 'text-xs' }, c.nombre || c.name)
        ]);
    });

    const submit = async (e) => {
        e.preventDefault();
        const checked = Array.from(form.querySelectorAll('input[type="checkbox"]:checked')).map(i => i.value);
        await dbService.update('users', u.uid || u.id, { allowedClients: checked });
        overlay.remove();
        reload();
    };

    const form = h('form', { className: 'modal-container', style: { maxWidth: '350px' }, onSubmit: submit }, [
        h('div', { className: 'modal-header' }, [
            h('span', { className: 'modal-title' }, `Accesos: ${u.nombre || u.email}`),
            h('button', { type: 'button', onClick: () => overlay.remove() }, '×')
        ]),
        h('div', { className: 'modal-body flex-column gap-2' }, checkboxes),
        h('div', { className: 'modal-footer' }, [
            h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => overlay.remove() }, 'Cancelar'),
            h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, 'Guardar')
        ])
    ]);

    overlay.appendChild(form);
    document.body.appendChild(overlay);
}

// ── Edit User Phone Modal ───────────────────────────────────────
function openUserPhoneModal(u, reload) {
    const overlay = h('div', { className: 'modal-overlay' });
    const input = h('input', { type: 'text', className: 'form-input text-xs', value: u.whatsapp || '', placeholder: '573000000000' });

    const submit = async (e) => {
        e.preventDefault();
        await dbService.update('users', u.uid || u.id, { whatsapp: input.value });
        overlay.remove();
        reload();
    };

    const form = h('form', { className: 'modal-container', style: { maxWidth: '350px' }, onSubmit: submit }, [
        h('div', { className: 'modal-header' }, [
            h('span', { className: 'modal-title' }, `Configurar WhatsApp: ${u.nombre || u.email}`),
            h('button', { type: 'button', onClick: () => overlay.remove() }, '×')
        ]),
        h('div', { className: 'modal-body flex-column gap-2' }, [
            h('label', { className: 'form-label' }, 'Número WhatsApp (con prefijo país)'),
            input
        ]),
        h('div', { className: 'modal-footer' }, [
            h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => overlay.remove() }, 'Cancelar'),
            h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, 'Guardar')
        ])
    ]);

    overlay.appendChild(form);
    document.body.appendChild(overlay);
}

// ── Configuración de Precios ────────────────────────────────────
async function renderPricingConfigSection() {
    let pricing = {};
    try {
        pricing = await dbService.getById('system_config', 'pricing') || {};
    } catch(e) {}

    const defaults = {
        precioMinutoGrabacion: 200,
        precioSubidaRedes: 10000,
        precioVideoCorto: 15000,
        precioVideoLargo: 25000,
        bonusVisitasMarketing: 50000,
        adminPhone: '573000000000'
    };

    const form = h('form', {
        className: 'flex-column gap-3',
        onSubmit: async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true;

            const data = {
                precioMinutoGrabacion: Number(e.target.querySelector('#pc-min-grab').value) || defaults.precioMinutoGrabacion,
                precioSubidaRedes: Number(e.target.querySelector('#pc-sub-red').value) || defaults.precioSubidaRedes,
                precioVideoCorto: Number(e.target.querySelector('#pc-vid-short').value) || defaults.precioVideoCorto,
                precioVideoLargo: Number(e.target.querySelector('#pc-vid-long').value) || defaults.precioVideoLargo,
                bonusVisitasMarketing: Number(e.target.querySelector('#pc-bonus').value) || defaults.bonusVisitasMarketing,
                adminPhone: e.target.querySelector('#pc-phone').value || defaults.adminPhone,
                updatedAt: new Date().toISOString()
            };

            try {
                await dbService.set('system_config', 'pricing', data);
                alert('✓ Tarifas financieras guardadas correctamente.');
            } catch (err) {
                alert('Error al guardar: ' + err.message);
            } finally {
                btn.disabled = false;
            }
        }
    }, [
        h('div', { className: 'grid gap-3', style: { display: 'grid', gridTemplateColumns: '1fr 1fr' } }, [
            h('div', { className: 'form-group' }, [h('label', { className: 'form-label' }, 'Minuto Grabación (COP)'), h('input', { id: 'pc-min-grab', type: 'number', className: 'form-input text-xs', value: String(pricing.precioMinutoGrabacion ?? defaults.precioMinutoGrabacion) })]),
            h('div', { className: 'form-group' }, [h('label', { className: 'form-label' }, 'Subida Redes (COP)'), h('input', { id: 'pc-sub-red', type: 'number', className: 'form-input text-xs', value: String(pricing.precioSubidaRedes ?? defaults.precioSubidaRedes) })])
        ]),
        h('div', { className: 'grid gap-3', style: { display: 'grid', gridTemplateColumns: '1fr 1fr' } }, [
            h('div', { className: 'form-group' }, [h('label', { className: 'form-label' }, 'Video Corto (COP)'), h('input', { id: 'pc-vid-short', type: 'number', className: 'form-input text-xs', value: String(pricing.precioVideoCorto ?? defaults.precioVideoCorto) })]),
            h('div', { className: 'form-group' }, [h('label', { className: 'form-label' }, 'Video Largo (COP)'), h('input', { id: 'pc-vid-long', type: 'number', className: 'form-input text-xs', value: String(pricing.precioVideoLargo ?? defaults.precioVideoLargo) })])
        ]),
        h('div', { className: 'grid gap-3', style: { display: 'grid', gridTemplateColumns: '1fr 1fr' } }, [
            h('div', { className: 'form-group' }, [h('label', { className: 'form-label' }, 'Bono por 10 Visitas (COP)'), h('input', { id: 'pc-bonus', type: 'number', className: 'form-input text-xs', value: String(pricing.bonusVisitasMarketing ?? defaults.bonusVisitasMarketing) })]),
            h('div', { className: 'form-group' }, [h('label', { className: 'form-label' }, 'WhatsApp Admin (Alertas)'), h('input', { id: 'pc-phone', type: 'text', className: 'form-input text-xs', value: String(pricing.adminPhone ?? defaults.adminPhone) })])
        ]),
        h('button', { type: 'submit', className: 'btn btn-primary text-xs w-full justify-center mt-2' }, 'Guardar Precios y Alertas')
    ]);

    return form;
}

// ── Roles management Section ──────────────────────────────────
function renderRolesSection(rolesList = [], reload) {
    const container = h('div', { className: 'card p-5 flex-column gap-3' }, [
        h('h3', { className: 'text-sm font-bold border-bottom pb-2' }, 'Roles de Producción y Permisos'),
        h('div', { className: 'flex-column gap-2 mt-2' }, rolesList.map(r => {
            return h('div', { className: 'p-3 bg-tertiary rounded flex justify-between items-center', style: { border: '1px solid var(--border)' } }, [
                h('span', { className: 'text-xs font-bold text-primary' }, r.label),
                h('button', {
                    className: 'btn btn-outline text-xs',
                    onClick: () => openRoleConfigModal(r, reload)
                }, 'Configurar Módulos')
            ]);
        }))
    ]);
    return container;
}

function openRoleConfigModal(role, reload) {
    const overlay = h('div', { className: 'modal-overlay' });
    const systemModules = [
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'assignments', label: 'Mi Trabajo' },
        { id: 'workers', label: 'Workers' },
        { id: 'clients', label: 'Clientes' },
        { id: 'billing', label: 'Pagos Pendientes' },
        { id: 'marketing', label: 'Ventas y CRM' },
        { id: 'assets', label: 'Assets' },
        { id: 'formats', label: 'Formatos' },
        { id: 'aiAssistant', label: 'Copiloto AI' }
    ];

    const current = role.allowedModules || ['dashboard', 'assignments'];

    const checkboxes = systemModules.map(mod => {
        return h('label', { className: 'flex items-center gap-2 cursor-pointer p-1' }, [
            h('input', { 
                type: 'checkbox', 
                value: mod.id, 
                checked: current.includes(mod.id),
                className: 'form-checkbox'
            }),
            h('span', { className: 'text-xs' }, mod.label)
        ]);
    });

    const submit = async (e) => {
        e.preventDefault();
        const allowedModules = Array.from(form.querySelectorAll('input[type="checkbox"]:checked')).map(i => i.value);
        await dbService.set('roles', role.id, { ...role, allowedModules });
        overlay.remove();
        reload();
    };

    const form = h('form', { className: 'modal-container', style: { maxWidth: '350px' }, onSubmit: submit }, [
        h('div', { className: 'modal-header' }, [
            h('span', { className: 'modal-title' }, `Permisos: ${role.label}`),
            h('button', { type: 'button', onClick: () => overlay.remove() }, '×')
        ]),
        h('div', { className: 'modal-body flex-column gap-2' }, checkboxes),
        h('div', { className: 'modal-footer' }, [
            h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => overlay.remove() }, 'Cancelar'),
            h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, 'Guardar Permisos')
        ])
    ]);

    overlay.appendChild(form);
    document.body.appendChild(overlay);
}

// ── Database Maintenance Section ────────────────────────────
function renderDatabaseMaintenanceSection() {
    return h('div', { className: 'flex-column gap-2' }, [
        h('p', { className: 'text-xs text-muted' }, 'Herramienta de limpieza para acelerar Firestore purgando tareas antiguas de más de 30 días.'),
        h('button', {
            className: 'btn btn-primary text-xs w-full justify-center',
            style: { background: 'var(--error)', borderColor: 'var(--error)' },
            onClick: async () => {
                if (confirm("¿Purgar permanentemente las tareas de más de 30 días? Esta acción no se puede deshacer.")) {
                    const { promptModal } = await import('../components/ui/PromptModal.js');
                    const confirmText = await promptModal({ title: 'Confirmar purga', message: "Escribe 'Aceptar' para confirmar la purga permanente.", placeholder: 'Aceptar' });
                    if (confirmText === 'Aceptar') {
                        const { assignmentService } = await import('../services/assignmentService.js');
                        const count = await assignmentService.purgeOldAssignments();
                        alert(`✅ Purga exitosa. Se eliminaron ${count} tareas antiguas.`);
                    }
                }
            }
        }, [icon('trash-2', 12), h('span', { className: 'ml-1' }, 'Purgar Tareas Antiguas')])
    ]);
}

// ── Upload Section ───────────────────────────────────────────
function renderUploadSection() {
    const fileInput = h('input', { type: 'file', className: 'form-input text-xs', accept: 'image/*' });

    const upload = async () => {
        if (!fileInput.files[0]) {
            alert('Elige una imagen válida.');
            return;
        }
        try {
            const url = await storageService.uploadFile('branding/logo_agencia.png', fileInput.files[0]);
            await dbService.set('system_config', 'branding', { logoUrl: url, updatedAt: new Date().toISOString() });
            alert('¡Logo de la agencia actualizado con éxito!');
        } catch (err) {
            alert('Error al subir logo: ' + err.message);
        }
    };

    return h('div', { className: 'flex-column gap-2' }, [
        fileInput,
        h('button', { className: 'btn btn-outline text-xs justify-center', onClick: upload }, 'Subir Logo Corporativo')
    ]);
}
