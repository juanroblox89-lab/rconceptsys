/**
 * Profile Page - Creative Production OS
 * Permite a los usuarios editar su información básica (nombre, número, foto de perfil) y tener accesos rápidos.
 */
import { h, icon } from '../utils/dom.js';
import { store } from '../js/store.js';
import { dbService, storageService } from '../firebase/service.js';
import { router } from '../js/router.js';

export const render = () => {
    const { user, roles } = store.getState();
    const container = h('div', { className: 'fade-in flex-column gap-4' });

    const loadAndRenderProfile = async () => {
        container.innerHTML = '<div class="loader mb-4"></div>';
        
        let currentUserData = null;
        try {
            currentUserData = await dbService.getById('users', user.id || user.uid);
        } catch (err) {
            console.error(err);
            currentUserData = user;
        }

        container.innerHTML = '';

        // 1. Header
        const header = h('div', { className: 'content-header flex-column gap-1 w-full mb-3' }, [
            h('h1', {}, 'Mi Perfil y Ajustes'),
            h('p', { className: 'text-xs text-muted' }, 'Configura tu información personal y accede rápidamente a tus módulos permitidos.')
        ]);

        container.appendChild(header);

        // Layout Principal
        const grid = h('div', { className: 'grid gap-4', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' } });

        // Tarjeta de Edición de Información
        const formCard = h('div', { className: 'card p-4 flex-column gap-3' }, [
            h('h3', { className: 'text-sm font-bold flex items-center gap-2 mb-2 border-bottom pb-2' }, [icon('user', 14), h('span', {}, 'Información Personal')]),
            h('form', {
                className: 'flex-column gap-3',
                onSubmit: async (e) => {
                    e.preventDefault();
                    const submitBtn = e.target.querySelector('button[type="submit"]');
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Guardando...';

                    const nombre = e.target.querySelector('#prof-name').value;
                    const phone = e.target.querySelector('#prof-phone').value;
                    const photoFile = e.target.querySelector('#prof-photo').files[0];
                    let photoURL = currentUserData.photoURL || '';

                    if (photoFile) {
                        try {
                            photoURL = await storageService.uploadFile(`profiles/${currentUserData.id || currentUserData.uid}`, photoFile);
                        } catch (err) {
                            console.error(err);
                            alert('Error subiendo foto de perfil');
                        }
                    }

                    try {
                        await dbService.update('users', currentUserData.id || currentUserData.uid, {
                            nombre,
                            phone,
                            photoURL
                        });
                        alert('¡Perfil actualizado con éxito!');
                        loadAndRenderProfile();
                    } catch (err) {
                        console.error(err);
                        alert('Error al actualizar el perfil.');
                        submitBtn.disabled = false;
                        submitBtn.textContent = 'Guardar Cambios';
                    }
                }
            }, [
                h('div', { className: 'flex items-center gap-3 mb-2' }, [
                    currentUserData.photoURL 
                        ? h('img', { src: currentUserData.photoURL, className: 'rounded-full', style: { width: '64px', height: '64px', objectFit: 'cover', border: '2px solid var(--border)' } })
                        : h('div', { className: 'rounded-full bg-tertiary flex items-center justify-center font-bold text-lg', style: { width: '64px', height: '64px', border: '2px solid var(--border)' } }, (currentUserData.nombre || currentUserData.email).slice(0, 2).toUpperCase()),
                    h('div', { className: 'form-group flex-1' }, [
                        h('label', { className: 'form-label' }, 'Cambiar Foto (Opcional)'),
                        h('input', { id: 'prof-photo', type: 'file', className: 'form-input', accept: 'image/*' })
                    ])
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Nombre de Visualización'),
                    h('input', { id: 'prof-name', type: 'text', className: 'form-input', value: currentUserData.nombre || '', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Número de Teléfono / WhatsApp'),
                    h('input', { id: 'prof-phone', type: 'tel', className: 'form-input', value: currentUserData.phone || '', placeholder: 'Ej. +57 300 000 0000' })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Correo Electrónico (No modificable)'),
                    h('input', { type: 'email', className: 'form-input bg-tertiary text-muted', value: currentUserData.email, disabled: true })
                ]),
                h('button', { type: 'submit', className: 'btn btn-primary text-xs w-full mt-2' }, 'Guardar Cambios')
            ])
        ]);

        // Tarjeta de Rol y Atajos
        let userRoleObj = roles?.find(r => r.id === currentUserData.role) || { id: currentUserData.role, name: currentUserData.role };
        
        let allowedModules = userRoleObj.allowedModules || ['dashboard', 'assignments', 'sops', 'aiAssistant'];
        if (currentUserData.role === 'admin') {
            allowedModules = ['dashboard', 'assignments', 'formats', 'scripts', 'hooks', 'sops', 'references', 'aiAssistant', 'admin', 'workers', 'clients', 'billing', 'assets'];
        }

        const shortcutsCard = h('div', { className: 'card p-4 flex-column gap-3' }, [
            h('h3', { className: 'text-sm font-bold flex items-center gap-2 mb-2 border-bottom pb-2' }, [icon('compass', 14), h('span', {}, 'Mi Rol y Accesos Rápidos')]),
            
            h('div', { className: 'p-3 rounded mb-2 flex items-center gap-3', style: { background: 'var(--primary)', color: '#fff' } }, [
                icon(userRoleObj.icon || 'shield', 24),
                h('div', {}, [
                    h('h4', { className: 'font-bold' }, userRoleObj.label || userRoleObj.name || 'Usuario Padrón'),
                    h('p', { className: 'text-xs opacity-80' }, 'Nivel de acceso operativo')
                ])
            ]),

            h('p', { className: 'text-xs text-muted mb-1' }, 'Tienes acceso directo a los siguientes módulos de acuerdo a tu rol en la plataforma:'),

            h('div', { className: 'grid gap-2', style: { gridTemplateColumns: '1fr 1fr' } }, allowedModules.map(mod => {
                const routeInfo = router.routes?.find(r => r.module === mod) || { title: mod, path: mod };
                return h('button', {
                    className: 'btn btn-outline text-xs text-left justify-start',
                    onClick: () => window.location.hash = `#${routeInfo.path}`
                }, routeInfo.title);
            }))
        ]);

        grid.appendChild(formCard);
        grid.appendChild(shortcutsCard);
        container.appendChild(grid);

        if (window.lucide) window.lucide.createIcons();
    };

    loadAndRenderProfile();

    return container;
};
