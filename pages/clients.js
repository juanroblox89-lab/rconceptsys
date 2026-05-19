/**
 * Clients Page - Creative Production OS
 * Notion Light UI supporting business profiles, assigned formats, custom hooks, storage assets, and manual viral video embeds.
 */
import { h, icon } from '../utils/dom.js';
import { store } from '../js/store.js';
import { dbService, storageService } from '../firebase/service.js';

export const render = () => {
    const { user } = store.getState();
    const isAdmin = user?.role === 'admin';
    const container = h('div', { className: 'fade-in flex-column gap-4' });

    const loadAndRenderClients = async () => {
        container.innerHTML = '<div class="loader mb-4"></div>';

        let clientsList = [];
        try {
            clientsList = await dbService.getAll('clients');
            if (!isAdmin && user.allowedClients) {
                clientsList = clientsList.filter(c => user.allowedClients.includes(c.id));
            }
        } catch (err) {
            console.warn("Error fetching real clients from DB:", err);
            clientsList = [];
        }

        container.innerHTML = '';

        // 1. Header with robust creation action
        const header = h('div', { className: 'content-header flex justify-between items-center w-full mb-4', style: { paddingBottom: '1rem' } }, [
            h('div', {}, [
                h('h1', {}, 'Directorio Operativo de Clientes'),
                h('p', { className: 'text-xs text-muted mt-1' }, 'Cuentas activas, formatos narrativos asignados, hooks validados y registro de piezas virales.')
            ]),
            isAdmin ? h('button', { 
                className: 'btn btn-primary text-xs',
                onClick: () => openCreateClientModal() 
            }, [icon('plus', 14), h('span', {}, 'Nuevo Cliente')]) : null
        ]);

        if (clientsList.length === 0) {
            const emptyState = h('div', { className: 'text-center p-20 card flex-column items-center justify-center gap-4' }, [
                icon('users', 40, 'text-muted mb-2'),
                h('h3', { className: 'text-md font-bold' }, 'Directorio de Clientes Vacío'),
                h('p', { className: 'text-xs text-muted max-w-xs' }, 'No tienes ningún cliente registrado en tu base de datos actualmente.'),
                isAdmin ? h('button', { 
                    className: 'btn btn-primary text-xs mt-2',
                    onClick: () => openCreateClientModal() 
                }, [icon('plus', 14), h('span', {}, 'Crear Primer Cliente')]) : null
            ]);
            container.appendChild(header);
            container.appendChild(emptyState);
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        // 2. Clients Horizontal Layout
        const grid = h('div', { className: 'flex-column gap-2 w-full mt-2' }, 
            clientsList.map(c => {
                return h('div', { 
                    key: c.id, 
                    className: 'card hover-bg-secondary transition relative flex gap-3 items-center justify-between p-3 flex-wrap', 
                    style: { 
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        padding: '10px 16px',
                        gap: '16px'
                    }
                }, [
                    // Identity section (left)
                    h('div', { className: 'flex items-center gap-3', style: { flex: '1 1 200px', minWidth: '180px' } }, [
                        c.logo ? h('img', { src: c.logo, style: { width: '36px', height: '36px', borderRadius: '6px', objectFit: 'cover', border: '1px solid var(--border)' } }) :
                        h('div', { className: 'glass flex items-center justify-center font-bold text-accent text-xs', style: { width: '36px', height: '36px', borderRadius: '6px' } }, c.name.slice(0,2).toUpperCase()),
                        h('div', { className: 'flex-column' }, [
                            h('h3', { className: 'text-xs font-bold text-primary', style: { margin: 0 } }, c.name),
                            h('span', { className: 'text-muted mt-0.5', style: { fontSize: '0.65rem', fontWeight: '500' } }, c.businessType || 'General')
                        ])
                    ]),

                    // Strategy/Description section (middle)
                    h('div', { className: 'flex items-center gap-4', style: { flex: '2 1 300px', minWidth: '240px', justifyContent: 'space-between' } }, [
                        h('p', { 
                            className: 'text-xs text-muted', 
                            style: { 
                                margin: 0, 
                                overflow: 'hidden', 
                                textOverflow: 'ellipsis', 
                                whiteSpace: 'nowrap', 
                                maxWidth: '300px' 
                            } 
                        }, c.description || 'Sin descripción estratégica.'),
                        
                        h('div', { className: 'flex gap-1.5' }, [
                            h('span', { className: 'badge badge-info text-xs font-normal', style: { fontSize: '0.6rem', padding: '2px 6px' } }, `${c.assignedFormats?.length || 0} Formatos`),
                            h('span', { className: 'badge badge-secondary text-xs font-normal', style: { fontSize: '0.6rem', padding: '2px 6px' } }, `${c.usedHooks?.length || 0} Hooks`)
                        ])
                    ]),

                    // Actions section (right)
                    h('div', { className: 'flex items-center gap-2', style: { flex: '0 0 auto' } }, [
                        h('button', { 
                            className: 'btn btn-outline text-xs flex items-center gap-1',
                            style: { padding: '4px 8px', height: '28px' },
                            onClick: () => window.location.hash = `#client/${c.id}`
                        }, [icon('external-link', 11), h('span', {}, 'Estrategia')]),
                        
                        isAdmin ? h('div', { className: 'flex gap-0.5' }, [
                            h('button', { 
                                className: 'btn-icon text-accent', 
                                style: { width: '26px', height: '26px', padding: '3px' }, 
                                title: 'Editar Cliente',
                                onClick: () => openCreateClientModal(c) 
                            }, [icon('edit-3', 11)]),
                            h('button', { 
                                className: 'btn-icon text-error', 
                                style: { width: '26px', height: '26px', padding: '3px' }, 
                                title: 'Eliminar Cliente',
                                onClick: async (e) => {
                                    e.stopPropagation();
                                    if (confirm(`¿Estás seguro de eliminar a ${c.name}?`)) {
                                        try {
                                            await dbService.delete('clients', c.id);
                                            loadAndRenderClients();
                                        } catch (err) {
                                            alert("Error al eliminar cliente.");
                                        }
                                    }
                                } 
                            }, [icon('trash-2', 11)])
                        ]) : null
                    ])
                ]);
            })
        );

        container.appendChild(header);
        container.appendChild(grid);
        if (window.lucide) window.lucide.createIcons();
    };

    // Form modal to Create or Edit Client Profile
    const openCreateClientModal = (existingClient = null) => {
        const overlay = h('div', { className: 'modal-overlay' });
        
        const submitForm = async (e) => {
            e.preventDefault();
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Guardando...';

            const nameVal = form.querySelector('#cli-name').value;
            const typeVal = form.querySelector('#cli-type').value;
            const descVal = form.querySelector('#cli-desc').value;
            const formatsVal = form.querySelector('#cli-formats').value.split(',').map(s=>s.trim()).filter(Boolean);
            const hooksVal = form.querySelector('#cli-hooks').value.split(',').map(s=>s.trim()).filter(Boolean);
            const logoUrlVal = form.querySelector('#cli-logo-url').value.trim();
            const logoFile = form.querySelector('#cli-logo-file').files[0];

            const clientId = existingClient?.id || nameVal.toLowerCase().replace(/\s+/g, '-');
            let logoUrl = logoUrlVal || existingClient?.logo || '';

            if (logoFile) {
                try {
                    logoUrl = await storageService.uploadFile(`client-logos/${clientId}`, logoFile);
                } catch (err) {
                    console.warn("Storage upload failed:", err);
                }
            }

            if (!logoUrl) {
                // Fallback to high-quality Unsplash brand identity cover placeholder
                logoUrl = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&q=80';
            }

            const payload = {
                id: clientId,
                name: nameVal,
                businessType: typeVal,
                description: descVal,
                assignedFormats: formatsVal.length ? formatsVal : ['RC-01: Recorrido Comercial'],
                usedHooks: hooksVal.length ? hooksVal : ['Problema-Solución'],
                viralVideos: existingClient?.viralVideos || [],
                assets: existingClient?.assets || [],
                logo: logoUrl,
                recommendedLinks: existingClient?.recommendedLinks || []
            };

            try {
                await dbService.set('clients', payload.id, payload);
            } catch (err) {
                console.warn("Firestore client write failed:", err);
            }

            document.body.removeChild(overlay);
            loadAndRenderClients();
        };

        const form = h('form', { className: 'modal-container', onSubmit: submitForm }, [
            h('div', { className: 'modal-header' }, [
                h('span', { className: 'modal-title text-sm' }, existingClient ? `Editar Perfil: ${existingClient.name}` : 'Crear Nuevo Cliente'),
                h('button', { type: 'button', onClick: () => document.body.removeChild(overlay), style: { fontWeight: 'bold' } }, '×')
            ]),
            h('div', { className: 'modal-body flex-column gap-3' }, [
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Nombre del Negocio / Cliente'),
                    h('input', { id: 'cli-name', className: 'form-input', value: existingClient?.name || '', placeholder: 'Ej. Clínica Dental Sonrisa', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Tipo de Industria / Negocio'),
                    h('input', { id: 'cli-type', className: 'form-input', value: existingClient?.businessType || '', placeholder: 'Ej. Salud y Odontología', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Descripción Estratégica General'),
                    h('textarea', { id: 'cli-desc', className: 'form-textarea', placeholder: 'Enfoque de marca, tono de comunicación y público objetivo...' }, existingClient?.description || '')
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Subir Foto de Perfil / Logo (Imagen)'),
                    h('input', { id: 'cli-logo-file', type: 'file', className: 'form-input', accept: 'image/*' })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'O, Enlace a Foto de Perfil (URL)'),
                    h('input', { id: 'cli-logo-url', className: 'form-input', value: existingClient?.logo || '', placeholder: 'Ej. https://images.unsplash.com/...' })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Formatos Asignados (Separados por coma)'),
                    h('input', { id: 'cli-formats', className: 'form-input', value: (existingClient?.assignedFormats || []).join(', '), placeholder: 'RC-01: Recorrido, ED-02: Educativo' })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Hooks Documentados (Separados por coma)'),
                    h('input', { id: 'cli-hooks', className: 'form-input', value: (existingClient?.usedHooks || []).join(', '), placeholder: 'Problema-Solución, Sabías que?' })
                ])
            ]),
            h('div', { className: 'modal-footer' }, [
                h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => document.body.removeChild(overlay) }, 'Cancelar'),
                h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, 'Guardar Perfil')
            ])
        ]);

        overlay.appendChild(form);
        document.body.appendChild(overlay);
    };

    // Modal to manually insert Viral Video Link
    const openAddViralVideoModal = (targetClient) => {
        const overlay = h('div', { className: 'modal-overlay' });
        
        const saveViralLink = async (e) => {
            e.preventDefault();
            const platVal = vform.querySelector('#v-platform').value;
            const titleVal = vform.querySelector('#v-title').value;
            const urlVal = vform.querySelector('#v-url').value;

            if (!targetClient.viralVideos) targetClient.viralVideos = [];
            targetClient.viralVideos.push({
                platform: platVal,
                title: titleVal,
                url: urlVal
            });

            try {
                await dbService.set('clients', targetClient.id, targetClient);
            } catch (err) {
                console.warn("Offline list update simulation:", err);
            }

            document.body.removeChild(overlay);
            loadAndRenderClients();
        };

        const vform = h('form', { className: 'modal-container', onSubmit: saveViralLink }, [
            h('div', { className: 'modal-header' }, [
                h('span', { className: 'modal-title text-sm' }, `Añadir Link Viral a: ${targetClient.name}`),
                h('button', { type: 'button', onClick: () => document.body.removeChild(overlay), style: { fontWeight: 'bold' } }, '×')
            ]),
            h('div', { className: 'modal-body flex-column gap-3' }, [
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Plataforma de Publicación'),
                    h('select', { id: 'v-platform', className: 'form-select text-xs' }, [
                        h('option', { value: 'TikTok' }, 'TikTok'),
                        h('option', { value: 'Instagram' }, 'Instagram Reels'),
                        h('option', { value: 'YouTube' }, 'YouTube Shorts')
                    ])
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Título o Métrica Visual (Ej. Recorrido Principal - 1.5M Vistas)'),
                    h('input', { id: 'v-title', className: 'form-input', placeholder: 'Pieza viral con gancho inicial...', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Enlace Real (URL)'),
                    h('input', { id: 'v-url', type: 'url', className: 'form-input', placeholder: 'https://www.tiktok.com/@...', required: true })
                ])
            ]),
            h('div', { className: 'modal-footer' }, [
                h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => document.body.removeChild(overlay) }, 'Cancelar'),
                h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, 'Añadir Video')
            ])
        ]);

        overlay.appendChild(vform);
        document.body.appendChild(overlay);
    };

    loadAndRenderClients();
    return container;
};
