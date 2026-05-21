/**
 * Admin Panel Page - Creative Production OS
 * Full admin CRUD: user approval, role management, logo upload.
 * Fixed: circular permission, empty actions column, mobile table overflow.
 */
import { h, icon } from '../utils/dom.js';
import { store } from '../js/store.js';
import { userService } from '../services/userService.js';
import { storageService, dbService } from '../firebase/service.js';

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
                h('div', { className: 'content-header flex justify-between items-center w-full' }, [
                    h('div', {}, [
                        h('h1', {}, 'Panel de Administración'),
                        h('p', { className: 'text-xs text-muted mt-1' },
                            `${approvedUsers.length} miembros activos · ${pendingUsers.length} pendientes`)
                    ]),
                    h('span', { className: 'badge badge-success text-xs' }, '👑 ADMIN MAESTRO')
                ])
            );

            // ── 2. Pending Users ────────────────────────────
            const pendingSection = h('section', { className: 'flex-column gap-3' }, [
                h('div', { className: 'flex justify-between items-center' }, [
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
            const teamSection = h('section', { className: 'flex-column gap-3' }, [
                h('h3', { className: 'section-label' }, `Equipo Activo Aprobado (${approvedUsers.length})`),
                approvedUsers.length === 0
                    ? h('div', { className: 'card p-5 text-center text-xs text-muted' }, 'No hay miembros aprobados todavía.')
                    : h('div', { className: 'table-container' }, [
                        h('table', {}, [
                            h('thead', {}, h('tr', {}, [
                                h('th', {}, 'Usuario'),
                                h('th', {}, 'Rol'),
                                h('th', {}, 'Estado'),
                                h('th', {}, 'Acciones')
                            ])),
                            h('tbody', {}, approvedUsers.map(u =>
                                renderTeamRow(u, user, loadAdminDashboard, showFeedback, clientsList)
                            ))
                        ])
                    ])
            ]);
            container.appendChild(teamSection);

            // ── 4. Roles Management ─────────────────────────
            container.appendChild(renderRolesSection(rolesList, loadAdminDashboard));

            // ── 5. Visual Identity (logo upload) ────────────
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
        { id: 'editor', label: 'Editor de Video' },
        { id: 'camarógrafo', label: 'Camarógrafo' },
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
                    e.currentTarget.disabled = true;
                    e.currentTarget.textContent = 'Rechazando...';
                    await userService.rejectUser(pu.uid);
                    reload();
                }
            }, 'Rechazar'),
            h('button', {
                className: 'btn btn-primary text-xs flex-1',
                style: { padding: '6px' },
                onClick: async (e) => {
                    e.currentTarget.disabled = true;
                    e.currentTarget.textContent = 'Aprobando...';
                    await userService.approveUser(pu.uid, roleSelect.value);
                    reload();
                }
            }, 'Aprobar ✓')
        ])
    ]);
}

// ── Team Row ─────────────────────────────────────────────────
function renderTeamRow(u, currentUser, reload, showFeedback, clientsList) {
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

    if (!isAdmin && !isCurrentUser) {
        // Promote to admin
        actions.push(h('button', {
            className: 'btn btn-primary text-xs',
            style: { padding: '3px 8px', fontSize: '0.68rem' },
            onClick: async (e) => {
                if (!window.confirm(`¿Promover a ${u.nombre || u.email} como Administrador?`)) return;
                e.currentTarget.disabled = true;
                e.currentTarget.textContent = '...';
                try {
                    await userService.approveUser(u.uid, 'admin');
                    showFeedback(e.currentTarget, '✓ Promovido');
                    setTimeout(() => reload(), 1200);
                } catch (err) {
                    showFeedback(e.currentTarget, '✗ Error', 'error');
                    e.currentTarget.disabled = false;
                    e.currentTarget.textContent = 'Hacer Admin';
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
                e.currentTarget.disabled = true;
                e.currentTarget.textContent = '...';
                try {
                    await userService.approveUser(u.uid, 'editor');
                    showFeedback(e.currentTarget, '✓ Revocado');
                    setTimeout(() => reload(), 1200);
                } catch (err) {
                    showFeedback(e.currentTarget, '✗ Error', 'error');
                    e.currentTarget.disabled = false;
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
                e.currentTarget.disabled = true;
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
                e.currentTarget.disabled = true;
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
        h('td', {}, h('span', {
            className: `badge ${isAdmin ? 'badge-success' : 'badge-info'} text-xs`
        }, (u.role || 'viewer').toUpperCase())),
        h('td', {}, h('span', { className: 'badge badge-success text-xs' }, 'Activo')),
        h('td', {}, h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap', minWidth: '80px' } }, actions))
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
                        e.currentTarget.disabled = true;
                        e.currentTarget.textContent = 'Subiendo...';
                        try {
                            await storageService.uploadFile('logos/rohlfing-concept-logo.jpg', fileInput.files[0]);
                            alert('✅ Logo actualizado correctamente. La página se recargará.');
                            window.location.reload();
                        } catch (err) {
                            alert(`Error al subir: ${err.message}`);
                            e.currentTarget.disabled = false;
                            e.currentTarget.textContent = 'Subir Logo';
                        }
                    }
                }, [icon('upload', 13), h('span', { style: { marginLeft: '4px' } }, 'Subir Logo')])
            ])
        ])
    ]);
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
                e.currentTarget.disabled = true;
                e.currentTarget.textContent = 'Guardando...';
                try {
                    await dbService.update('users', user.uid, { allowedClients: currentAllowed });
                    overlay.remove();
                    reload();
                } catch (err) {
                    console.error('Error updating allowed clients:', err);
                    alert('Error al guardar accesos');
                    e.currentTarget.disabled = false;
                    e.currentTarget.textContent = 'Guardar Accesos';
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

