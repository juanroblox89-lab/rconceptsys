/**
 * Admin Panel Page - Creative Production OS
 * Full admin CRUD: user approval, role management, logo upload.
 * Fixed: circular permission, empty actions column, mobile table overflow.
 */
import { h, icon } from '../utils/dom.js';
import { store } from '../js/store.js';
import { userService } from '../services/userService.js';
import { storageService, dbService } from '../firebase/service.js';
import { invoiceService } from '../services/invoiceService.js';

export const render = () => {
    const { user } = store.getState();
    const container = h('div', { className: 'fade-in flex-column gap-6' });

    // ── Access Guard ─────────────────────────────────────────
    if (user?.role !== 'admin') {
        return h('div', { className: 'card p-8 text-center flex-column items-center gap-3', style: { marginTop: '2rem' } }, [
            icon('shield-alert', 48),
            h('h3', { style: { marginTop: '12px' } }, 'Acceso Restringido'),
            h('p', { className: 'text-xs text-muted', style: { maxWidth: '320px' } },
                'Este panel es exclusivo del Administrador Global. Usa el botón ⚡ ADMIN en la cabecera para elevar permisos.'),
        ]);
    }

    // ── Helpers ──────────────────────────────────────────────
    const showFeedback = (el, msg, type = 'success') => {
        const fb = h('span', {
            style: {
                fontSize: '0.65rem',
                color: type === 'success' ? 'var(--success)' : 'var(--error)',
                fontWeight: 600
            }
        }, msg);
        el.parentNode?.insertBefore(fb, el.nextSibling);
        setTimeout(() => fb.remove(), 3000);
    };

    // ── Main load function ───────────────────────────────────
    const loadAdminDashboard = async () => {
        container.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:center; padding: 60px 0; gap: 12px; flex-direction: column;">
                <div class="loader"></div>
                <span class="text-xs text-muted">Cargando datos del equipo...</span>
            </div>`;

        // Safety timeout
        const timeout = setTimeout(() => {
            if (container.querySelector('.loader')) {
                container.innerHTML = `
                    <div class="card p-8 text-center flex-column items-center gap-3">
                        <span class="text-xs text-muted">La carga tardó demasiado. ¿Hay un problema de conexión con Firebase?</span>
                        <button class="btn btn-outline text-xs" onclick="window.location.reload()">Forzar Recarga</button>
                    </div>`;
            }
        }, 10000);

        try {
            const [allUsers, clientsList, rolesList] = await Promise.all([
                userService.getAllUsers(),
                dbService.getAll('clients').catch(() => []),
                dbService.getAll('roles').catch(() => [])
            ]);
            const pendingUsers = allUsers.filter(u => !u.approved);
            const approvedUsers = allUsers.filter(u => u.approved);

            clearTimeout(timeout);
            container.innerHTML = '';

            // ── 1. Page Header ──────────────────────────────
            container.appendChild(
                h('div', { className: 'content-header flex justify-between items-center flex-wrap gap-2 w-full' }, [
                    h('div', {}, [
                        h('h1', {}, 'Panel de Administración'),
                        h('p', { className: 'text-xs text-muted mt-1' },
                            `${approvedUsers.length} miembros activos · ${pendingUsers.length} pendientes`)
                    ]),
                    h('span', { className: 'badge badge-success text-xs' }, '👑 ADMIN MAESTRO')
                ])
            );

            // ── 1.5 Workflow Guide ──────────────────────────
            container.appendChild(
                h('div', { className: 'card p-4 flex-column gap-2 mb-4 w-full', style: { borderLeft: '4px solid var(--accent)', background: 'var(--bg-tertiary)' } }, [
                    h('h3', { className: 'text-sm font-bold flex items-center gap-2' }, [icon('info', 16, 'text-accent'), h('span', {}, 'Guía Rápida de Trabajo (Admin)')]),
                    h('p', { className: 'text-xs text-muted mb-1' }, 'Flujo recomendado desde que entra un cliente hasta que facturas:'),
                    h('ol', { className: 'text-xs text-muted pl-4', style: { margin: 0, paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '4px' } }, [
                        h('li', {}, [h('span', { className: 'font-bold' }, '1. Registrar Cliente: '), 'Añádelo en la pestaña ', h('b', {}, 'Clientes')]),
                        h('li', {}, [h('span', { className: 'font-bold' }, '2. Crear Guiones y Formatos: '), 'Redacta el contenido en ', h('b', {}, 'Guiones')]),
                        h('li', {}, [h('span', { className: 'font-bold' }, '3. Preparar SOPs: '), 'Crea la lista de pasos obligatorios en ', h('b', {}, 'SOPs')]),
                        h('li', {}, [h('span', { className: 'font-bold' }, '4. Asignar Trabajo: '), 'Ve a ', h('b', {}, 'Workers'), ', elige a tu trabajador y asígnale la tarea (puedes vincular el Guion, Asset y SOP).']),
                        h('li', {}, [h('span', { className: 'font-bold' }, '5. Facturación: '), 'A fin de mes, revisa y liquida los pagos en ', h('b', {}, 'Pagos Pendientes')])
                    ])
                ])
            );

            // ── 2. Pending Users ────────────────────────────
            const pendingSection = h('section', { className: 'flex-column gap-3' }, [
                h('div', { className: 'flex justify-between items-center flex-wrap gap-2' }, [
                    h('h3', { className: 'section-label', style: { marginBottom: 0 } },
                        `Empleados Pendientes (${pendingUsers.length})`),
                    h('button', {
                        className: 'btn btn-outline text-xs',
                        style: { padding: '4px 10px' },
                        onClick: () => loadAdminDashboard()
                    }, [icon('refresh-cw', 12), h('span', { style: { marginLeft: '4px' } }, 'Refrescar')])
                ]),
                pendingUsers.length === 0
                    ? h('div', { className: 'card p-5 text-center text-xs text-muted' },
                        '✅ No hay usuarios pendientes en este momento.')
                    : h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' } },
                        pendingUsers.map(pu => renderPendingCard(pu, loadAdminDashboard, rolesList)))
            ]);
            container.appendChild(pendingSection);

            // ── 3. Team Table ───────────────────────────────
            const teamSection = h('section', { className: 'flex-column gap-3 card p-5', style: { border: '1px solid var(--border)' } }, [
                h('div', { className: 'flex justify-between items-center flex-wrap gap-2 mb-2' }, [
                    h('h3', { className: 'section-label flex items-center gap-2 m-0', style: { marginBottom: 0 } }, [
                        icon('users', 18, 'text-accent'),
                        h('span', {}, `Equipo Activo Aprobado (${approvedUsers.length})`)
                    ]),
                    h('div', { className: 'relative' }, [
                        h('span', { className: 'absolute', style: { left: '8px', top: '7px', color: 'var(--text-muted)' } }, icon('search', 14)),
                        h('input', { 
                            type: 'text', 
                            className: 'form-input text-xs', 
                            placeholder: 'Buscar usuario...',
                            style: { width: '220px', paddingLeft: '28px', borderRadius: '20px' },
                            onInput: (e) => {
                                const term = e.target.value.toLowerCase();
                                const tbody = teamSection.querySelector('tbody');
                                if (tbody) {
                                    Array.from(tbody.children).forEach(row => {
                                        const txt = row.textContent.toLowerCase();
                                        row.style.display = txt.includes(term) ? '' : 'none';
                                    });
                                }
                            }
                        })
                    ])
                ]),
                approvedUsers.length === 0
                    ? h('div', { className: 'card p-5 text-center text-xs text-muted' }, 'No hay miembros aprobados todavía.')
                    : h('div', { className: 'table-container', style: { borderRadius: '8px', overflow: 'hidden' } }, [
                        h('table', { style: { width: '100%', borderCollapse: 'collapse' } }, [
                            h('thead', { style: { background: 'var(--bg-tertiary)' } }, h('tr', {}, [
                                h('th', { style: { padding: '12px' } }, 'Usuario'),
                                h('th', { style: { padding: '12px' } }, 'Rol'),
                                h('th', { style: { padding: '12px' } }, 'Estado'),
                                h('th', { style: { padding: '12px' } }, 'Acciones')
                            ])),
                            h('tbody', {}, approvedUsers.map(u =>
                                renderTeamRow(u, user, loadAdminDashboard, showFeedback, clientsList, rolesList)
                            ))
                        ])
                    ])
            ]);
            container.appendChild(teamSection);

            // ── 3.5. Dynamic Rates ─────────────────────────
            try {
                const rates = await invoiceService.getRateCards();
                container.appendChild(renderDynamicRatesSection(rates));
            } catch(e) {
                console.warn("Could not load rate cards:", e);
            }

            // ── 4. Roles Management ─────────────────────────
            container.appendChild(renderRolesSection(rolesList, loadAdminDashboard));

            // ── 5. Database Maintenance ────────────────────────
            container.appendChild(renderDatabaseMaintenanceSection());
            
            // ── 6. Logo Upload ───────────────────────────────
            container.appendChild(renderUploadSection());

            // Hydrate icons
            if (window.lucide) window.lucide.createIcons();

        } catch (err) {
            clearTimeout(timeout);
            console.error('[Admin] Load failed:', err);
            container.innerHTML = `
                <div class="card p-8 text-center flex-column items-center gap-3">
                    <span style="font-size:2rem">⚠️</span>
                    <strong class="text-sm">Error al cargar datos</strong>
                    <code class="text-xs text-muted" style="background:var(--bg-tertiary); padding:4px 8px; border-radius:4px;">${err.message}</code>
                    <p class="text-xs text-muted">
                        Probablemente las <strong>Reglas de Firestore</strong> aún no están publicadas.<br>
                        Ejecuta: <code>firebase deploy --only firestore</code>
                    </p>
                    <button class="btn btn-outline text-xs" onclick="window.location.reload()">Reintentar</button>
                </div>`;
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

    // Build options from Firestore roles, fallback to defaults
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
                h('span', { className: 'font-bold text-xs', style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                    pu.nombre || 'Usuario'),
                h('span', { className: 'text-xs text-muted', style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                    pu.email || ''),
                h('span', { className: 'badge badge-warning text-xs', style: { marginTop: '2px', width: 'fit-content' } }, 'PENDIENTE')
            ])
        ]),
        h('div', { className: 'form-group' }, [
            h('label', { className: 'form-label' }, 'Rol de producción:'),
            roleSelect
        ]),
        h('div', { className: 'flex gap-2', style: { paddingTop: '8px', borderTop: '1px solid var(--border)' } }, [
            h('button', {
                className: 'btn btn-outline text-xs flex-1',
                style: { color: 'var(--error)', borderColor: 'var(--error)', padding: '6px' },
                onClick: async (e) => {
                    const btn = e.currentTarget;
                    btn.disabled = true;
                    btn.textContent = 'Rechazando...';
                    await userService.rejectUser(pu.uid);
                    reload();
                }
            }, 'Rechazar'),
            h('button', {
                className: 'btn btn-primary text-xs flex-1',
                style: { padding: '6px' },
                onClick: async (e) => {
                    const btn = e.currentTarget;
                    btn.disabled = true;
                    btn.textContent = 'Aprobando...';
                    await userService.approveUser(pu.uid, roleSelect.value);
                    reload();
                }
            }, 'Aprobar ✓')
        ])
    ]);
}

// ── Team Row ─────────────────────────────────────────────────
function renderTeamRow(u, currentUser, reload, showFeedback, clientsList, rolesList = []) {
    const isCurrentUser = u.uid === currentUser.uid;
    const isAdmin = u.role === 'admin';

    const avatar = u.photoURL
        ? h('img', { src: u.photoURL, style: { width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0 } })
        : h('div', {
            style: {
                width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
                background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontWeight: 700, fontSize: '0.65rem', color: 'var(--text-secondary)'
            }
        }, (u.nombre || u.email || 'US').slice(0, 2).toUpperCase());

    // Actions column — always show something meaningful
    const actions = [];

    if (isCurrentUser) {
        actions.push(h('span', { className: 'badge badge-secondary text-xs' }, 'Tú'));
    }

    if (!isAdmin && !isCurrentUser) {
        // Client Access Modal Button
        actions.push(h('button', {
            className: 'btn btn-outline text-xs',
            style: { padding: '3px 8px', fontSize: '0.68rem', borderColor: 'var(--accent)', color: 'var(--accent)' },
            onClick: () => openClientAccessModal(u, clientsList, reload)
        }, [icon('eye', 11), h('span', { style: { marginLeft: '3px' } }, 'Accesos')]));
    }

    if (isAdmin && !isCurrentUser) {
        // Edit WhatsApp Number Button
        actions.push(h('button', {
            className: 'btn btn-outline text-xs',
            style: { padding: '3px 8px', fontSize: '0.68rem' },
            onClick: () => openUserPhoneModal(u, reload)
        }, [icon('phone', 11), h('span', { style: { marginLeft: '3px' } }, 'WhatsApp')]));
    }

    if (!isAdmin && !isCurrentUser) {
        // Promote to admin
        actions.push(h('button', {
            className: 'btn btn-primary text-xs',
            style: { padding: '3px 8px', fontSize: '0.68rem' },
            onClick: async (e) => {
                if (!window.confirm(`¿Promover a ${u.nombre || u.email} como Administrador?`)) return;
                const btn = e.currentTarget;
                btn.disabled = true;
                btn.textContent = '...';
                try {
                    await userService.approveUser(u.uid, 'admin');
                    if (btn) showFeedback(btn, '✓ Promovido');
                    setTimeout(() => reload(), 1200);
                } catch (err) {
                    if (btn) { showFeedback(btn, '✗ Error', 'error'); btn.disabled = false; btn.textContent = 'Hacer Admin'; }
                }
            }
        }, [icon('shield-check', 11), h('span', { style: { marginLeft: '3px' } }, 'Hacer Admin')]));
    }

    if (isAdmin && !isCurrentUser) {
        // Revoke admin
        actions.push(h('button', {
            className: 'btn btn-outline text-xs',
            style: { padding: '3px 8px', fontSize: '0.68rem', color: 'var(--error)', borderColor: 'var(--error)' },
            onClick: async (e) => {
                if (!window.confirm(`¿Quitar permisos Admin a ${u.nombre || u.email}?`)) return;
                const btn = e.currentTarget;
                btn.disabled = true;
                btn.textContent = '...';
                try {
                    await userService.approveUser(u.uid, 'editor');
                    if (btn) showFeedback(btn, '✓ Revocado');
                    setTimeout(() => reload(), 1200);
                } catch (err) {
                    if (btn) { showFeedback(btn, '✗ Error', 'error'); btn.disabled = false; }
                }
            }
        }, [icon('user-minus', 11), h('span', { style: { marginLeft: '3px' } }, 'Quitar Admin')]));
    }

    if (!isAdmin && !isCurrentUser) {
        // Cede admin (swap)
        actions.push(h('button', {
            className: 'btn btn-outline text-xs',
            style: { padding: '3px 8px', fontSize: '0.68rem', color: 'var(--warning)', borderColor: 'var(--warning)' },
            onClick: async (e) => {
                if (!window.confirm(`⚠️ CEDER ADMIN: Perderás tus permisos de administrador. ¿Continuar?`)) return;
                if (!window.confirm(`Confirmar: ¿Ceder el control total a ${u.nombre || u.email}?`)) return;
                const btn = e.currentTarget;
                btn.disabled = true;
                await userService.delegateAdminRole(u.uid, currentUser.uid);
                window.location.reload();
            }
        }, [icon('shield-off', 11), h('span', { style: { marginLeft: '3px' } }, 'Ceder')]));
    }

    // Remove from team (non-admin, non-self)
    if (!isCurrentUser && !isAdmin) {
        actions.push(h('button', {
            className: 'btn btn-outline text-xs',
            style: { padding: '3px 8px', fontSize: '0.68rem', color: 'var(--error)', borderColor: 'var(--error)' },
            onClick: async (e) => {
                if (!window.confirm(`¿Eliminar a ${u.nombre || u.email} del equipo permanentemente?`)) return;
                const btn = e.currentTarget;
                btn.disabled = true;
                await userService.rejectUser(u.uid);
                reload();
            }
        }, [icon('trash-2', 11), h('span', { style: { marginLeft: '3px' } }, 'Eliminar')]));
    }

    return h('tr', {}, [
        h('td', {}, [
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
                avatar,
                h('div', { style: { minWidth: 0 } }, [
                    h('div', {
                        style: { fontWeight: 600, fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }
                    }, u.nombre || u.email?.split('@')[0]),
                    h('div', { style: { fontSize: '0.65rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' } },
                        u.email)
                ])
            ])
        ]),
        h('td', {}, 
            (currentUser.role === 'admin' && !isAdmin) ? 
            h('select', { 
                className: 'form-select text-xs', 
                style: { padding: '2px 20px 2px 8px', borderRadius: '4px', height: 'auto', minHeight: '24px' },
                onChange: async (e) => {
                    const newRole = e.target.value;
                    const el = e.target;
                    el.disabled = true;
                    try {
                        await userService.approveUser(u.uid, newRole);
                        showFeedback(el.parentNode, '✓ Guardado');
                    } catch(err) {
                        alert('Error: ' + err.message);
                    } finally {
                        el.disabled = false;
                        reload();
                    }
                }
            }, [
                ...rolesList.filter(r => r.active !== false).map(r => 
                    h('option', { value: r.id, selected: u.role === r.id }, r.label)
                ),
                // Fallback option in case the role doesn't exist
                (!rolesList.find(r => r.id === u.role)) ? h('option', { value: u.role, selected: true }, u.role) : null
            ].filter(Boolean)) 
            : 
            h('span', { className: `badge ${isAdmin ? 'badge-success' : 'badge-info'} text-xs` }, (u.role || 'viewer').toUpperCase())
        ),
        h('td', {}, h('span', { className: 'badge badge-success text-xs' }, 'Activo')),
        h('td', {}, h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap', minWidth: '80px' } }, actions))
    ]);
}

// ── Role Permissions Modal ──────────────────────────────────────
function openRoleConfigModal(role, reload) {
    const overlay = h('div', { className: 'modal-overlay' });
    
    // Lista de todos los módulos disponibles en el sistema
    const systemModules = [
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'assignments', label: 'Mi Trabajo' },
        { id: 'workers', label: 'Workers (Asignar tareas)' },
        { id: 'clients', label: 'Clientes' },
        { id: 'billing', label: 'Pagos Pendientes' },
        { id: 'marketing', label: 'Ventas y Marketing' },
        { id: 'assets', label: 'Assets' },
        { id: 'formats', label: 'Formatos' },
        { id: 'scripts', label: 'Guiones' },
        { id: 'hooks', label: 'Hooks' },
        { id: 'sops', label: 'SOPs' },
        { id: 'references', label: 'Referencias' },
        { id: 'aiAssistant', label: 'AI Assistant' }
    ];

    // Módulos por defecto si el rol es nuevo y no tiene arreglo
    const defaultModules = ['dashboard', 'assignments', 'sops', 'aiAssistant'];
    const currentModules = role.allowedModules || defaultModules;

    const checkboxes = systemModules.map(mod => {
        return h('label', { className: 'flex items-center gap-2 cursor-pointer p-2 hover-bg-secondary rounded' }, [
            h('input', { 
                type: 'checkbox', 
                value: mod.id, 
                checked: currentModules.includes(mod.id),
                className: 'form-checkbox'
            }),
            h('span', { className: 'text-sm' }, mod.label)
        ]);
    });

    const submit = async (e) => {
        e.preventDefault();
        const btnSubmit = form.querySelector('button[type="submit"]');
        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Guardando...';

        const checkedInputs = Array.from(form.querySelectorAll('input[type="checkbox"]:checked'));
        const allowedModules = checkedInputs.map(input => input.value);

        try {
            await dbService.set('roles', role.id, { ...role, allowedModules });
            document.body.removeChild(overlay);
            reload();
        } catch (err) {
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Guardar Permisos';
            alert("Error al guardar permisos: " + err.message);
        }
    };

    const form = h('form', { className: 'modal-container', onSubmit: submit }, [
        h('div', { className: 'modal-header' }, [
            h('span', { className: 'modal-title' }, `Configurar Permisos: ${role.label}`),
            h('button', { type: 'button', onClick: () => document.body.removeChild(overlay) }, '×')
        ]),
        h('div', { className: 'modal-body flex-column gap-2', style: { maxHeight: '60vh', overflowY: 'auto' } }, [
            h('p', { className: 'text-xs text-muted mb-2' }, 'Selecciona a qué secciones del sistema puede acceder este rol. (El Administrador siempre tiene acceso a todo).'),
            ...checkboxes
        ]),
        h('div', { className: 'modal-footer' }, [
            h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => document.body.removeChild(overlay) }, 'Cancelar'),
            h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, 'Guardar Permisos')
        ])
    ]);

    overlay.appendChild(form);
    document.body.appendChild(overlay);
}

// ── Roles Management Section ──────────────────────────────────
function renderRolesSection(rolesList = [], reload) {
    const defaultRoles = [
        { id: 'camarógrafo', label: 'Camarógrafo', active: true },
        { id: 'editor', label: 'Editor de Video', active: true },
        { id: 'editorcamarografo', label: 'Creador 360° (Camarógrafo + Editor)', active: true },
        { id: 'uploader', label: 'Publicador / Uploader', active: true },
        { id: 'estratega', label: 'Estratega Creativo', active: true },
        { id: 'diseñador', label: 'Diseñador Gráfico', active: true },
        { id: 'administración digital', label: 'Administración Digital', active: true }
    ];

    const listToRender = rolesList.length > 0 ? rolesList : defaultRoles;

    const container = h('section', { className: 'flex-column gap-3' }, [
        h('h3', { className: 'section-label' }, 'Roles de Producción'),
        h('div', { className: 'card flex-column gap-3 bg-secondary' }, [
            h('div', { className: 'flex justify-between items-center', style: { flexWrap: 'wrap', gap: '8px' } }, [
                h('div', { className: 'flex-column gap-1' }, [
                    h('span', { className: 'font-bold text-xs' }, 'Configuración de Roles'),
                    h('p', { className: 'text-xs text-muted' }, 'Administra los roles disponibles para la asignación de tareas en el equipo.')
                ]),
                h('button', {
                    className: 'btn btn-outline text-xs',
                    style: { padding: '4px 10px', fontSize: '0.68rem' },
                    onClick: async (e) => {
                        if (!confirm('¿Agregar/Actualizar los roles base recomendados en Firestore? (Esto no borrará tus roles personalizados)')) return;
                        const btn = e.currentTarget;
                        btn.disabled = true;
                        btn.textContent = 'Actualizando...';
                        try {
                            await Promise.all(defaultRoles.map(r => dbService.set('roles', r.id, r)));
                            alert('✅ Roles base actualizados en Firestore con éxito.');
                            reload();
                        } catch (err) {
                            alert(`Error al actualizar: ${err.message}`);
                            if (btn) { btn.disabled = false; btn.textContent = 'Actualizar Roles Base'; }
                        }
                    }
                }, [icon('settings-2', 11), h('span', { style: { marginLeft: '4px' } }, 'Actualizar Roles Base')])
            ]),

            // Button to open new role modal
            h('div', { className: 'mt-2 border-top pt-3' }, [
                h('button', {
                    className: 'btn btn-primary text-xs',
                    onClick: () => openNewRoleModal(reload)
                }, [icon('plus', 13), h('span', { style: { marginLeft: '4px' } }, 'Crear Nuevo Rol')])
            ]),

            // List of roles
            h('div', { className: 'flex-column gap-2 mt-2', style: { borderTop: '1px solid var(--border)', paddingTop: '12px' } }, 
                listToRender.map(role => {
                    const isActive = role.active !== false;
                    return h('div', {
                        className: 'flex justify-between items-center p-2 rounded',
                        style: { background: 'var(--bg-tertiary)', borderRadius: '4px', border: '1px solid var(--border)', padding: '8px 12px' }
                    }, [
                        h('div', { className: 'flex items-center gap-2' }, [
                            icon(isActive ? 'check-circle' : 'circle', 14, isActive ? 'text-success' : 'text-muted'),
                            h('span', { className: 'text-xs font-semibold text-primary' }, role.label),
                            h('span', { className: `badge badge-${isActive ? 'success' : 'secondary'} text-xs`, style: { fontSize: '0.65rem' } }, 
                                isActive ? 'Activo' : 'Inactivo'
                            )
                        ]),
                        h('div', { className: 'flex gap-2' }, [
                            h('button', {
                                className: 'btn btn-outline text-xs',
                                style: { padding: '3px 8px', fontSize: '0.65rem' },
                                onClick: () => openRoleConfigModal(role, reload)
                            }, [icon('settings', 12), h('span', { style: { marginLeft: '4px' } }, 'Configurar Permisos')]),
                            
                            // Toggle active status — uses set+merge so it works even if doc doesn't exist yet
                            h('button', {
                                className: 'btn btn-outline text-xs',
                                style: { padding: '3px 8px', fontSize: '0.65rem' },
                                onClick: async (e) => {
                                    const btn = e.currentTarget;
                                    btn.disabled = true;
                                    try {
                                        await dbService.set('roles', role.id, { ...role, active: !isActive });
                                        reload();
                                    } catch (err) {
                                        alert(`Error al cambiar estado: ${err.message}`);
                                        if (btn) btn.disabled = false;
                                    }
                                }
                            }, isActive ? 'Desactivar' : 'Activar'),
                            // Delete button (visible only if roles are stored in database)
                            rolesList.length > 0 ? h('button', {
                                className: 'btn btn-outline text-xs',
                                style: { padding: '3px 8px', fontSize: '0.65rem', color: 'var(--error)', borderColor: 'var(--error)' },
                                onClick: async (e) => {
                                    if (!confirm(`¿Eliminar de forma permanente el rol "${role.label}"?`)) return;
                                    const btn = e.currentTarget;
                                    btn.disabled = true;
                                    try {
                                        const allUsrs = await dbService.getAll('users');
                                        for (const u of allUsrs) {
                                            if (u.role === role.id || u.role === role.label) {
                                                await dbService.update('users', u.uid || u.id, { role: 'viewer' });
                                            }
                                        }
                                        await dbService.delete('roles', role.id);
                                        await reload();
                                    } catch (err) {
                                        alert(`Error al eliminar: ${err.message}`);
                                        if (btn) btn.disabled = false;
                                    }
                                }
                            }, 'Eliminar') : null
                        ])
                    ]);
                })
            )
        ])
    ]);

    return container;
}

// ── Database Maintenance Section ────────────────────────────
function renderDatabaseMaintenanceSection() {
    return h('section', { className: 'flex-column gap-3' }, [
        h('h3', { className: 'section-label', style: { color: 'var(--error)' } }, 'Mantenimiento Avanzado de BD'),
        h('div', { className: 'card flex-column gap-3 bg-secondary' }, [
            h('div', { className: 'flex-column gap-1' }, [
                h('span', { className: 'font-bold text-xs', style: { color: 'var(--error)' } }, 'Purgar Tareas Antiguas (Cuello de Botella)'),
                h('p', { className: 'text-xs text-muted' }, 'Elimina de forma permanente todas las tareas de la base de datos que tengan más de 30 días de antigüedad. Útil para mantener la velocidad del sistema.')
            ]),
            h('button', {
                className: 'btn btn-primary text-xs',
                style: { alignSelf: 'flex-start', background: 'var(--error)', borderColor: 'var(--error)' },
                onClick: async (e) => {
                    const confirm1 = window.confirm("⚠️ ADVERTENCIA: Estás a punto de eliminar permanentemente todas las tareas mayores a 30 días. Esta acción no se puede deshacer. ¿Deseas continuar?");
                    if (!confirm1) return;
                    
                    const confirm2 = window.prompt("¿Estás absolutamente seguro? Escribe 'Aceptar' para confirmar.");
                    if (confirm2 !== 'Aceptar') return;
                    
                    const btn = e.currentTarget;
                    btn.disabled = true;
                    btn.textContent = 'Purgando...';
                    
                    try {
                        const { assignmentService } = await import('../services/assignmentService.js');
                        const count = await assignmentService.purgeOldAssignments();
                        alert(`✅ Mantenimiento completado. Se eliminaron ${count} tareas antiguas.`);
                        btn.textContent = 'Purgar Tareas Antiguas';
                        btn.disabled = false;
                    } catch (err) {
                        alert(`Error durante la purga: ${err.message}`);
                        btn.disabled = false;
                        btn.textContent = 'Purgar Tareas Antiguas';
                    }
                }
            }, [icon('trash-2', 14), h('span', { style: { marginLeft: '4px' } }, 'Purgar Tareas Antiguas')])
        ])
    ]);
}

// ── Logo Upload Section ──────────────────────────────────────
function renderUploadSection() {
    return h('section', { className: 'flex-column gap-3' }, [
        h('h3', { className: 'section-label' }, 'Identidad Visual'),
        h('div', { className: 'card flex-column gap-3 bg-secondary' }, [
            h('div', { className: 'flex-column gap-1' }, [
                h('span', { className: 'font-bold text-xs' }, 'Logo de la Agencia'),
                h('p', { className: 'text-xs text-muted' }, 'Sube el logo principal (Rohlfing Concept) a Firebase Storage.')
            ]),
            h('div', { className: 'flex gap-2', style: { flexWrap: 'wrap' } }, [
                h('input', { type: 'file', id: 'admin-logo-upload', className: 'form-input text-xs', accept: 'image/*', style: { flex: 1, minWidth: '160px' } }),
                h('button', {
                    className: 'btn btn-primary text-xs',
                    style: { flexShrink: 0 },
                    onClick: async (e) => {
                        const fileInput = document.getElementById('admin-logo-upload');
                        if (!fileInput?.files?.[0]) {
                            alert('Selecciona un archivo primero.');
                            return;
                        }
                        const btn = e.currentTarget;
                        btn.disabled = true;
                        btn.textContent = 'Subiendo...';
                        try {
                            await storageService.uploadFile('logos/rohlfing-concept-logo.jpg', fileInput.files[0]);
                            alert('✅ Logo actualizado correctamente. La página se recargará.');
                            window.location.reload();
                        } catch (err) {
                            alert(`Error al subir: ${err.message}`);
                            if (btn) { btn.disabled = false; btn.textContent = 'Subir Logo'; }
                        }
                    }
                }, [icon('upload', 13), h('span', { style: { marginLeft: '4px' } }, 'Subir Logo')])
            ])
        ])
    ]);
}

// ── New Role Modal ───────────────────────────────────────────
function openNewRoleModal(reload) {
    const overlay = h('div', { className: 'modal-overlay' });
    
    const submit = async (e) => {
        e.preventDefault();
        const input = form.querySelector('#modal-role-label');
        const label = input?.value?.trim();
        if (!label) {
            alert('Ingresa el nombre del rol.');
            return;
        }
        const id = label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        if (!id) {
            alert('El nombre del rol contiene caracteres no permitidos.');
            return;
        }
        
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = 'Guardando...';
        
        try {
            await dbService.set('roles', id, { id, label, active: true });
            document.body.removeChild(overlay);
            // Mostrar un pequeño feedback en lugar de un alert feo
            const toast = h('div', { 
                className: 'card fade-in text-xs', 
                style: { position: 'fixed', bottom: '20px', right: '20px', background: 'var(--success)', color: '#fff', padding: '12px 20px', zIndex: 10000, fontWeight: 'bold' }
            }, '✓ Rol creado exitosamente');
            document.body.appendChild(toast);
            setTimeout(() => { if (document.body.contains(toast)) document.body.removeChild(toast); }, 3000);
            
            reload();
        } catch (err) {
            alert(`Error al guardar: ${err.message}`);
            if (btn) { btn.disabled = false; btn.textContent = 'Crear Rol'; }
        }
    };

    const form = h('form', { className: 'modal-container', style: { maxWidth: '400px' }, onSubmit: submit }, [
        h('div', { className: 'modal-header' }, [
            h('span', { className: 'modal-title' }, 'Crear Nuevo Rol'),
            h('button', { type: 'button', onClick: () => document.body.removeChild(overlay) }, '×')
        ]),
        h('div', { className: 'modal-body flex-column gap-3' }, [
            h('p', { className: 'text-xs text-muted' }, 'Añade un nuevo rol de producción para categorizar a los miembros de tu equipo.'),
            h('div', { className: 'form-group' }, [
                h('label', { className: 'form-label' }, 'Nombre del Rol'),
                h('input', { 
                    id: 'modal-role-label', 
                    type: 'text', 
                    className: 'form-input', 
                    placeholder: 'Ej. Diseñador 3D, Motion Grapher...', 
                    required: true,
                    autoFocus: true
                })
            ])
        ]),
        h('div', { className: 'modal-footer' }, [
            h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => document.body.removeChild(overlay) }, 'Cancelar'),
            h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, 'Crear Rol')
        ])
    ]);

    overlay.appendChild(form);
    document.body.appendChild(overlay);
    
    // Auto-focus after appending
    setTimeout(() => {
        const input = form.querySelector('#modal-role-label');
        if (input) input.focus();
    }, 50);
}

// ── Client Access Modal ──────────────────────────────────────
function openClientAccessModal(user, clients, reload) {
    let currentAllowed = user.allowedClients || [];
    
    const overlay = h('div', {
        style: {
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: '20px'
        }
    });

    const modal = h('div', {
        className: 'card fade-in flex-column',
        style: { width: '100%', maxWidth: '400px', maxHeight: '80vh', overflow: 'hidden', backgroundColor: 'var(--bg-primary)' }
    });

    const header = h('div', { className: 'flex justify-between items-center p-4 border-bottom' }, [
        h('h3', { className: 'font-bold' }, `Accesos de ${user.nombre || user.email}`),
        h('button', {
            className: 'btn btn-outline', style: { border: 'none', padding: '4px' },
            onClick: () => overlay.remove()
        }, icon('x', 16))
    ]);

    const content = h('div', { className: 'p-4 flex-column gap-3', style: { overflowY: 'auto' } });
    
    if (clients.length === 0) {
        content.appendChild(h('div', { className: 'text-xs text-muted text-center' }, 'No hay clientes registrados.'));
    } else {
        content.appendChild(h('p', { className: 'text-xs text-muted mb-2' }, 'Selecciona los clientes que este trabajador puede ver. Si desactivas todos, no verá ningún cliente.'));
        
        clients.forEach(c => {
            let isAllowed = currentAllowed.includes(c.id);
            
            const label = h('div', {
                className: 'toggle-label flex items-center',
                style: {
                    position: 'relative', display: 'inline-block', width: '36px', height: '20px',
                    backgroundColor: isAllowed ? 'var(--success)' : 'var(--bg-tertiary)',
                    borderRadius: '20px', cursor: 'pointer', transition: 'background-color 0.3s'
                },
                onClick: () => {
                    isAllowed = !isAllowed;
                    label.style.backgroundColor = isAllowed ? 'var(--success)' : 'var(--bg-tertiary)';
                    knob.style.left = isAllowed ? '18px' : '2px';
                    
                    if (isAllowed) {
                        currentAllowed.push(c.id);
                    } else {
                        currentAllowed = currentAllowed.filter(id => id !== c.id);
                    }
                }
            });
            const knob = h('span', {
                style: {
                    position: 'absolute', top: '2px', left: isAllowed ? '18px' : '2px',
                    width: '16px', height: '16px', backgroundColor: '#fff', borderRadius: '50%',
                    transition: 'left 0.3s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                }
            });
            label.appendChild(knob);

            const row = h('div', { className: 'flex justify-between items-center py-2 border-bottom' }, [
                h('div', { className: 'flex items-center gap-2' }, [
                    h('span', { className: 'font-semibold text-sm' }, c.nombre || c.name),
                    h('span', { className: 'badge badge-secondary text-xs' }, c.businessType || 'General')
                ]),
                h('div', { className: 'flex items-center' }, [label])
            ]);
            content.appendChild(row);
        });
    }

    const footer = h('div', { className: 'p-4 border-top flex justify-end gap-2 bg-secondary' }, [
        h('button', { className: 'btn btn-outline text-xs', onClick: () => overlay.remove() }, 'Cancelar'),
        h('button', { 
            className: 'btn btn-primary text-xs',
            onClick: async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                btn.textContent = 'Guardando...';
                try {
                    await dbService.update('users', user.uid, { allowedClients: currentAllowed });
                    overlay.remove();
                    reload();
                } catch (err) {
                    console.error('Error updating allowed clients:', err);
                    alert('Error al guardar accesos');
                    if (btn) { btn.disabled = false; btn.textContent = 'Guardar Accesos'; }
                }
            }
        }, 'Guardar Accesos')
    ]);

    modal.appendChild(header);
    modal.appendChild(content);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}

// ── User Phone Modal ──────────────────────────────────────
function openUserPhoneModal(user, reload) {
    const overlay = h('div', { className: 'modal-overlay' });
    
    const submit = async (e) => {
        e.preventDefault();
        const input = form.querySelector('#modal-user-phone');
        let phone = input?.value?.trim() || '';
        phone = phone.replace(/\+/g, '').replace(/\s+/g, '');
        if (!phone) {
            alert('Ingresa el número de WhatsApp.');
            return;
        }
        
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = 'Guardando...';
        
        try {
            await dbService.update('users', user.uid, { phone: phone });
            document.body.removeChild(overlay);
            
            const toast = h('div', { 
                className: 'card fade-in text-xs', 
                style: { position: 'fixed', bottom: '20px', right: '20px', background: 'var(--success)', color: '#fff', padding: '12px 20px', zIndex: 10000, fontWeight: 'bold' }
            }, '✓ Número guardado exitosamente');
            document.body.appendChild(toast);
            setTimeout(() => { if (document.body.contains(toast)) document.body.removeChild(toast); }, 3000);
            
            reload();
        } catch (err) {
            alert(`Error al guardar: ${err.message}`);
            if (btn) { btn.disabled = false; btn.textContent = 'Guardar Número'; }
        }
    };

    const form = h('form', { className: 'modal-container', style: { maxWidth: '350px' }, onSubmit: submit }, [
        h('div', { className: 'modal-header' }, [
            h('span', { className: 'modal-title' }, `Editar WhatsApp: ${user.nombre || user.email}`),
            h('button', { type: 'button', onClick: () => document.body.removeChild(overlay) }, '×')
        ]),
        h('div', { className: 'modal-body flex-column gap-3' }, [
            h('p', { className: 'text-xs text-muted' }, 'Ingresa el número de teléfono con código de país (ej. 573001234567) para notificaciones y alertas.'),
            h('div', { className: 'form-group' }, [
                h('label', { className: 'form-label' }, 'Número de WhatsApp'),
                h('input', { 
                    id: 'modal-user-phone', 
                    type: 'tel', 
                    className: 'form-input', 
                    placeholder: 'Ej. 573001234567', 
                    value: user.phone || '',
                    required: true,
                    autoFocus: true
                })
            ])
        ]),
        h('div', { className: 'modal-footer' }, [
            h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => document.body.removeChild(overlay) }, 'Cancelar'),
            h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, 'Guardar Número')
        ])
    ]);

    overlay.appendChild(form);
    document.body.appendChild(overlay);
    
    // Auto-focus after appending
    setTimeout(() => {
        const input = form.querySelector('#modal-user-phone');
        if (input) input.focus();
    }, 50);
}

