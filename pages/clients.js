/**
 * Clients Page - Creative Production OS
 * Notion Light UI supporting business profiles, assigned formats, custom hooks, storage assets, and manual viral video embeds.
 */
import { h, icon } from '../utils/dom.js';
import { store } from '../js/store.js';
import { dbService, storageService } from '../firebase/service.js';

// Fully populated robust offline/online pre-populated demo database
let localClients = [
    {
        id: 'gimnasio-elite',
        name: 'Gimnasio Elite',
        logo: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=100&q=80',
        description: 'Cadena de centros de acondicionamiento físico premium enfocada en alto rendimiento y comunidad.',
        businessType: 'Salud y Deporte',
        assignedFormats: ['RC-01: Recorrido Comercial', 'HK-04: Hook Impacto'],
        usedHooks: ['Problema-Solución', 'POV Curiosidad'],
        viralVideos: [
            { platform: 'TikTok', url: 'https://www.tiktok.com/@gimnasioelite/video/123456789', title: 'Recorrido Sala de Fuerza (1.2M Vistas)' },
            { platform: 'Instagram', url: 'https://www.instagram.com/reel/123456789', title: 'Reto 30 Días Transformación (450K Vistas)' }
        ],
        assets: [
            { title: 'Logo Vectorial', url: '#', type: 'logo' },
            { title: 'Branding Guidelines', url: '#', type: 'reference' }
        ],
        recommendedLinks: [
            { title: 'Carpeta de Material Bruto Drive', url: 'https://drive.google.com' },
            { title: 'Moodboard de Inspiración Pinterest', url: 'https://pinterest.com' }
        ]
    },
    {
        id: 'barberia-classic',
        name: 'Barbería Classic',
        logo: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=100&q=80',
        description: 'Barbería tradicional con enfoque en experiencia estética, cortes clásicos y cuidado de barba.',
        businessType: 'Estética y Cuidado Personal',
        assignedFormats: ['ED-02: Educativo Rápido'],
        usedHooks: ['Sabías que?', 'Error común al peinar'],
        viralVideos: [
            { platform: 'YouTube', url: 'https://www.youtube.com/shorts/123456789', title: 'Cómo mantener el fade en casa (890K Vistas)' }
        ],
        assets: [
            { title: 'Intro Animada', url: '#', type: 'video' }
        ],
        recommendedLinks: [
            { title: 'Carpeta de Assets Compartidos Drive', url: 'https://drive.google.com' }
        ]
    }
];

export const render = () => {
    const { user } = store.getState();
    const isAdmin = user?.role === 'admin';
    const container = h('div', { className: 'fade-in flex-column gap-4' });

    const loadAndRenderClients = async () => {
        container.innerHTML = '<div class="loader mb-4"></div>';

        let clientsList = [];
        try {
            const list = await dbService.getAll('clients');
            clientsList = list.length ? list : localClients;
        } catch (err) {
            clientsList = localClients;
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

        // 2. Clients Grid Layout
        const grid = h('div', { className: 'grid gap-4', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' } }, 
            clientsList.map(c => {
                return h('div', { key: c.id, className: 'card flex-column gap-3 p-5 relative' }, [
                    // Top identity header
                    h('div', { className: 'flex items-start justify-between gap-3 border-bottom pb-3' }, [
                        h('div', { className: 'flex items-center gap-3' }, [
                            c.logo ? h('img', { src: c.logo, style: { width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover', border: '1px solid var(--border)' } }) :
                            h('div', { className: 'glass flex items-center justify-center font-bold text-accent text-sm', style: { width: '48px', height: '48px', borderRadius: '8px' } }, c.name.slice(0,2).toUpperCase()),
                            h('div', {}, [
                                h('h3', { className: 'text-sm font-bold text-primary' }, c.name),
                                h('span', { className: 'badge badge-secondary text-xs mt-1', style: { fontSize: '0.65rem' } }, c.businessType || 'General')
                            ])
                        ]),
                        isAdmin ? h('button', { 
                            className: 'btn-icon text-xs', 
                            style: { width: '28px', height: '28px' }, 
                            title: 'Editar Cliente',
                            onClick: () => openCreateClientModal(c) 
                        }, [icon('edit', 14)]) : null
                    ]),

                    // Description
                    h('p', { className: 'text-xs text-muted leading-relaxed' }, c.description || 'Sin descripción estratégica disponible.'),

                    // Formats & Hooks Badges
                    h('div', { className: 'flex-column gap-1 mt-1' }, [
                        h('span', { className: 'text-xs font-semibold text-secondary' }, 'Formatos Asignados:'),
                        h('div', { className: 'flex gap-1 flex-wrap mt-1' }, (c.assignedFormats || []).map(f => h('span', { className: 'badge badge-info text-xs font-normal' }, f)))
                    ]),

                    h('div', { className: 'flex-column gap-1' }, [
                        h('span', { className: 'text-xs font-semibold text-secondary' }, 'Hooks Documentados:'),
                        h('div', { className: 'flex gap-1 flex-wrap mt-1' }, (c.usedHooks || []).map(hk => h('span', { className: 'badge badge-secondary text-xs font-normal' }, hk)))
                    ]),

                    // Viral Videos embeds section (Admin manual insert logic support)
                    h('div', { className: 'flex-column gap-2 mt-2 pt-2 border-top' }, [
                        h('div', { className: 'flex justify-between items-center' }, [
                            h('span', { className: 'text-xs font-bold text-primary flex items-center gap-1' }, [icon('trending-up', 14, 'text-success'), h('span', {}, 'Videos Virales Registrados:')]),
                            isAdmin ? h('button', { 
                                className: 'text-xs text-info font-bold flex items-center gap-1',
                                title: 'Añadir Enlace Viral',
                                onClick: () => openAddViralVideoModal(c) 
                            }, '+ Añadir Link') : null
                        ]),
                        h('div', { className: 'flex-column gap-1 mt-1' }, 
                            (!c.viralVideos || !c.viralVideos.length) ? [h('span', { className: 'text-xs text-muted italic' }, 'Sin videos virales insertados aún.')] :
                            c.viralVideos.map((vv, idx) => h('a', { 
                                key: idx, 
                                href: vv.url, 
                                target: '_blank', 
                                className: 'p-2 bg-secondary border-radius-sm flex items-center justify-between text-xs hover-bg-tertiary transition', 
                                style: { border: '1px solid var(--border)', borderRadius: '4px', textDecoration: 'none', color: 'inherit' } 
                            }, [
                                h('div', { className: 'flex items-center gap-2' }, [
                                    h('span', { className: `badge ${vv.platform === 'TikTok' ? 'badge-error' : (vv.platform === 'Instagram' ? 'badge-warning' : 'badge-info')} text-xs`, style: { fontSize: '0.55rem' } }, vv.platform),
                                    h('span', { className: 'text-xs font-medium text-primary', style: { maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, vv.title)
                                ]),
                                icon('external-link', 12, 'text-muted')
                            ]))
                        )
                    ]),

                    // Storage Connected Assets Box
                    h('div', { className: 'flex-column gap-2 mt-1 pt-2 border-top' }, [
                        h('div', { className: 'flex justify-between items-center' }, [
                            h('span', { className: 'text-xs font-bold text-secondary flex items-center gap-1' }, [icon('hard-drive', 14), h('span', {}, 'Assets en Storage:')]),
                            isAdmin ? h('button', { 
                                className: 'text-xs text-accent font-bold',
                                onClick: () => alert("Sube assets directamente desde el apartado 'Subida Dinámica a Storage' en el Panel Admin.") 
                            }, 'Gestionar') : null
                        ]),
                        h('div', { className: 'flex gap-1 flex-wrap mt-1' }, 
                            (!c.assets || !c.assets.length) ? [h('span', { className: 'text-xs text-muted italic' }, 'Sin assets guardados en Storage.')] :
                            c.assets.map((as, idx) => h('span', { key: idx, className: 'badge badge-secondary text-xs font-normal flex items-center gap-1' }, [icon(as.type === 'video' ? 'video' : 'image', 10), h('span', {}, as.title)]))
                        )
                    ]),

                    // Link to Detail View
                    h('button', { 
                        className: 'btn btn-outline w-full mt-2 text-xs py-2',
                        onClick: () => window.location.hash = `#client/${c.id}`
                    }, [icon('external-link', 12), h('span', {}, 'Ver Estrategia Detallada')])
                ]);
            })
        );

        container.appendChild(header);
        container.appendChild(grid);
    };

    // Form modal to Create or Edit Client Profile
    const openCreateClientModal = (existingClient = null) => {
        const overlay = h('div', { className: 'modal-overlay' });
        
        const submitForm = async (e) => {
            e.preventDefault();
            const nameVal = form.querySelector('#cli-name').value;
            const typeVal = form.querySelector('#cli-type').value;
            const descVal = form.querySelector('#cli-desc').value;
            const formatsVal = form.querySelector('#cli-formats').value.split(',').map(s=>s.trim()).filter(Boolean);
            const hooksVal = form.querySelector('#cli-hooks').value.split(',').map(s=>s.trim()).filter(Boolean);

            const payload = {
                id: existingClient?.id || nameVal.toLowerCase().replace(/\s+/g, '-'),
                name: nameVal,
                businessType: typeVal,
                description: descVal,
                assignedFormats: formatsVal.length ? formatsVal : ['RC-01: Recorrido Comercial'],
                usedHooks: hooksVal.length ? hooksVal : ['Problema-Solución'],
                viralVideos: existingClient?.viralVideos || [],
                assets: existingClient?.assets || [],
                logo: existingClient?.logo || 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=100&q=80',
                recommendedLinks: existingClient?.recommendedLinks || []
            };

            try {
                await dbService.set('clients', payload.id, payload);
            } catch (err) {
                console.warn("Offline user persistent action simulated:", err);
            }

            // Update statefully
            if (existingClient) {
                Object.assign(existingClient, payload);
            } else {
                localClients.push(payload);
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
