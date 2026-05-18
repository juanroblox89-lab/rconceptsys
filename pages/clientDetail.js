/**
 * Client Detail Page - Creative Production OS
 * Deep dive into client strategy, assets, and recommended scripts.
 */
import { h, icon } from '../utils/dom.js';
import { store } from '../js/store.js';
import { dbService } from '../firebase/service.js';
import { assignmentService } from '../services/assignmentService.js';

export const render = async (params) => {
    const { id } = params;
    const { user } = store.getState();
    const isAdmin = user?.role === 'admin';
    
    const container = h('div', { className: 'fade-in flex-column gap-6' });

    const loadClient = async () => {
        container.innerHTML = '<div class="loader"></div>';
        
        try {
            let client = await dbService.getById('clients', id);
            
            // Fix: Fallback to local clients for details if DB fetch fails/null
            if (!client) {
                const localClients = [
                    { 
                        id: 'gimnasio-elite', 
                        name: 'Gimnasio Elite', 
                        businessType: 'Salud y Deporte', 
                        description: 'Cadena de centros de acondicionamiento físico premium enfocada en alto rendimiento y comunidad.',
                        logo: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=100&q=80',
                        guionRecomendado: 'RC-01 - Recorrido POV: Mostrar la sala de fuerza, el sauna premium y los coaches.\nHK-04 - Reto 30 Días: Ofrecer un gancho directo al dolor de perder el año.',
                        assignedFormats: ['RC-01: Recorrido Comercial', 'HK-04: Hook Impacto'],
                        usedHooks: ['Problema-Solución', 'POV Curiosidad'],
                        recommendedLinks: [
                            { title: 'Carpeta de Material Bruto Drive', url: 'https://drive.google.com' },
                            { title: 'Moodboard de Inspiración Pinterest', url: 'https://pinterest.com' }
                        ]
                    },
                    { 
                        id: 'barberia-classic', 
                        name: 'Barbería Classic', 
                        businessType: 'Estética y Cuidado Personal', 
                        description: 'Barbería tradicional con enfoque en experiencia estética, cortes clásicos y cuidado de barba.',
                        logo: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=100&q=80',
                        guionRecomendado: 'ED-02 - Educativo Rápido: Mostrar cómo peinar el pompadour en casa paso a paso.',
                        assignedFormats: ['ED-02: Educativo Rápido'],
                        usedHooks: ['Sabías que?', 'Error común al peinar'],
                        recommendedLinks: [
                            { title: 'Carpeta de Assets Compartidos Drive', url: 'https://drive.google.com' }
                        ]
                    }
                ];
                client = localClients.find(c => c.id === id);
            }

            if (!client) throw new Error("Cliente no encontrado.");

            container.innerHTML = '';

            // Header with Back Button
            const header = h('div', { className: 'flex justify-between items-center mb-4' }, [
                h('div', { className: 'flex items-center gap-4' }, [
                    h('button', { 
                        className: 'btn-icon', 
                        onClick: () => window.location.hash = '#clients' 
                    }, [icon('arrow-left', 18)]),
                    h('div', { className: 'flex items-center gap-3' }, [
                        client.logo ? h('img', { src: client.logo, style: { width: '40px', height: '40px', borderRadius: '8px' } }) : null,
                        h('div', {}, [
                            h('h1', { className: 'text-xl font-bold' }, client.name),
                            h('span', { className: 'text-xs text-muted' }, client.businessType)
                        ])
                    ])
                ]),
                isAdmin ? h('button', { 
                    className: 'btn btn-outline text-xs',
                    onClick: () => alert("Función de edición rápida próximamente.")
                }, [icon('edit-3', 14), h('span', {}, 'Editar Estrategia')]) : null
            ]);

            // Top Summary Section
            const summaryGrid = h('div', { className: 'grid gap-6', style: { display: 'grid', gridTemplateColumns: '2fr 1fr' } }, [
                // Main Content
                h('div', { className: 'flex-column gap-6' }, [
                    // Resumen del Negocio
                    h('section', { className: 'card p-6 flex-column gap-3' }, [
                        h('div', { className: 'flex items-center gap-2 mb-1' }, [icon('briefcase', 16, 'text-accent'), h('h3', { className: 'text-sm font-bold' }, 'Resumen del Negocio')]),
                        h('p', { className: 'text-sm text-muted leading-relaxed' }, client.description || 'Sin descripción detallada.')
                    ]),

                    // Guión Recomendado (Admin Editable)
                    h('section', { className: 'card p-6 flex-column gap-3' }, [
                        h('div', { className: 'flex justify-between items-center mb-1' }, [
                            h('div', { className: 'flex items-center gap-2' }, [icon('file-text', 16, 'text-success'), h('h3', { className: 'text-sm font-bold' }, 'Guión Recomendado')]),
                            isAdmin ? h('span', { className: 'text-xs text-info font-bold cursor-pointer', onClick: () => editGuion(client) }, 'Editar') : null
                        ]),
                        h('div', { 
                            className: 'p-4 bg-secondary border-radius-sm text-sm italic text-muted leading-relaxed',
                            style: { borderLeft: '3px solid var(--bg-accent)', whiteSpace: 'pre-wrap' }
                        }, client.guionRecomendado || 'Documentar aquí las estructuras narrativas que mejor funcionan para este cliente...')
                    ]),

                    // Links Recomendados de Referencia (Admin Dynamic List)
                    h('section', { className: 'card p-6 flex-column gap-3' }, [
                        h('div', { className: 'flex justify-between items-center mb-1' }, [
                            h('div', { className: 'flex items-center gap-2' }, [
                                icon('link', 16, 'text-warning'), 
                                h('h3', { className: 'text-sm font-bold' }, 'Links Recomendados de Referencia')
                            ]),
                            isAdmin ? h('button', { 
                                className: 'btn btn-primary text-xs',
                                style: { padding: '4px 8px' },
                                onClick: () => addRecommendedLink(client) 
                            }, [icon('plus', 12), h('span', { className: 'ml-1' }, 'Añadir Link')]) : null
                        ]),
                        h('div', { className: 'flex-column gap-2' }, 
                            (!client.recommendedLinks || !client.recommendedLinks.length) ? [
                                h('div', { className: 'p-4 text-center text-xs text-muted italic bg-secondary rounded border', style: { borderStyle: 'dashed', borderRadius: '6px' } }, 'No hay links recomendados registrados aún.')
                            ] :
                            client.recommendedLinks.map((rl, idx) => h('div', { 
                                key: idx, 
                                className: 'p-3 bg-secondary rounded flex items-center justify-between border hover-bg-tertiary transition',
                                style: { border: '1px solid var(--border)', borderRadius: '6px' }
                            }, [
                                h('a', { 
                                    href: rl.url, 
                                    target: '_blank', 
                                    className: 'flex items-center gap-2 text-xs font-semibold text-primary hover-underline no-underline',
                                    style: { color: 'inherit' }
                                }, [
                                    icon('external-link', 12, 'text-muted'),
                                    h('span', {}, rl.title)
                                ]),
                                isAdmin ? h('button', { 
                                    className: 'btn-icon text-error', 
                                    style: { padding: '2px', width: '24px', height: '24px', borderRadius: '4px' },
                                    title: 'Eliminar Link',
                                    onClick: () => deleteRecommendedLink(client, idx) 
                                }, [icon('trash-2', 12)]) : null
                            ]))
                        )
                    ]),

                    // Connected Data: Active Assignments
                    h('section', { className: 'card p-6 flex-column gap-3' }, [
                        h('div', { className: 'flex justify-between items-center mb-1' }, [
                            h('div', { className: 'flex items-center gap-2' }, [icon('clock', 16, 'text-info'), h('h3', { className: 'text-sm font-bold' }, 'Asignaciones Activas')]),
                            h('button', { className: 'text-xs text-info font-bold', onClick: () => window.location.hash = '#assignments' }, 'Ver Todas')
                        ]),
                        h('div', { id: 'client-active-assignments', className: 'flex-column gap-2' }, [h('div', { className: 'loader' })])
                    ]),

                    // Formatos y Hooks Efectivos
                    h('div', { className: 'grid gap-4', style: { display: 'grid', gridTemplateColumns: '1fr 1fr' } }, [
                        h('div', { className: 'card p-5' }, [
                            h('h4', { className: 'text-xs font-bold uppercase tracking-wider text-muted mb-3' }, 'Formatos Asignados'),
                            h('div', { className: 'flex gap-2 flex-wrap' }, (client.assignedFormats || []).map(f => h('span', { className: 'badge badge-info text-xs' }, f)))
                        ]),
                        h('div', { className: 'card p-5' }, [
                            h('h4', { className: 'text-xs font-bold uppercase tracking-wider text-muted mb-3' }, 'Hooks Validados'),
                            h('div', { className: 'flex gap-2 flex-wrap' }, (client.usedHooks || []).map(hk => h('span', { className: 'badge badge-secondary text-xs' }, hk)))
                        ])
                    ])
                ]),

                // Sidebar Info
                h('div', { className: 'flex-column gap-6' }, [
                    // Estilo Visual
                    h('section', { className: 'card p-5 flex-column gap-3' }, [
                        h('h3', { className: 'text-xs font-bold uppercase text-muted' }, 'Estilo Visual'),
                        h('div', { className: 'flex-column gap-2' }, [
                            h('div', { className: 'flex items-center gap-2' }, [h('div', { style: { width: '12px', height: '12px', borderRadius: '2px', background: '#3b82f6' } }), h('span', { className: 'text-xs' }, 'Dinámico')]),
                            h('div', { className: 'flex items-center gap-2' }, [h('div', { style: { width: '12px', height: '12px', borderRadius: '2px', background: '#10b981' } }), h('span', { className: 'text-xs' }, 'Premium/Limpio')]),
                            h('p', { className: 'text-xs text-muted mt-2 italic' }, client.visualStyle || 'Subtítulos grandes, transiciones rápidas, música trending.')
                        ])
                    ]),

                    // Videos Virales
                    h('section', { className: 'card p-5 flex-column gap-3' }, [
                        h('h3', { className: 'text-xs font-bold uppercase text-muted' }, 'Videos Virales'),
                        h('div', { className: 'flex-column gap-2' }, 
                            (!client.viralVideos || !client.viralVideos.length) ? [h('span', { className: 'text-xs text-muted' }, 'Sin videos registrados.')] :
                            client.viralVideos.map(vv => h('a', { 
                                href: vv.url, 
                                target: '_blank', 
                                className: 'flex items-center justify-between p-2 bg-secondary rounded hover-bg-tertiary transition no-underline text-inherit' 
                            }, [
                                h('span', { className: 'text-xs truncate', style: { maxWidth: '140px' } }, vv.title),
                                icon('external-link', 12, 'text-muted')
                            ]))
                        )
                    ]),

                    // Assets
                    h('section', { className: 'card p-5 flex-column gap-3' }, [
                        h('h3', { className: 'text-xs font-bold uppercase text-muted' }, 'Assets Rápidos'),
                        h('div', { className: 'flex gap-2 flex-wrap' }, 
                            (client.assets || []).map(as => h('span', { className: 'badge badge-outline text-xs' }, as.title))
                        )
                    ])
                ])
            ]);

            container.appendChild(header);
            container.appendChild(summaryGrid);

            // Hydrate Connected Assignments
            setTimeout(async () => {
                const asgs = await assignmentService.getAssignmentsByClient(client.name);
                const asgList = document.getElementById('client-active-assignments');
                if (asgList) {
                    asgList.innerHTML = '';
                    const actives = asgs.filter(a => a.status !== 'Completado');
                    if (actives.length === 0) {
                        asgList.innerHTML = '<p class="text-xs text-muted italic">Sin tareas activas para este cliente.</p>';
                    } else {
                        actives.forEach(a => {
                            const isUrgent = new Date(a.dueDate) < new Date() || (new Date(a.dueDate) - new Date() < 86400000);
                            asgList.appendChild(h('div', { className: 'flex justify-between items-center p-3 bg-secondary border-radius-sm', style: { border: '1px solid var(--border)' } }, [
                                h('div', { className: 'flex-column' }, [
                                    h('span', { className: 'text-xs font-bold' }, a.title),
                                    h('span', { className: 'text-xs text-muted' }, a.type)
                                ]),
                                h('span', { className: `badge ${isUrgent ? 'badge-urgent' : 'badge-today'} text-xs` }, isUrgent ? 'URGENTE' : 'PROXIMO')
                            ]));
                        });
                    }
                }
            }, 50);

        } catch (err) {
            container.innerHTML = `<div class="p-10 text-center text-error">${err.message}</div>`;
        }
    };

    const editGuion = (client) => {
        const overlay = h('div', { className: 'modal-overlay' });
        const form = h('form', { 
            className: 'modal-container', 
            onSubmit: async (e) => {
                e.preventDefault();
                const newVal = form.querySelector('textarea').value;
                client.guionRecomendado = newVal;
                await dbService.set('clients', client.id, client);
                document.body.removeChild(overlay);
                loadClient();
            }
        }, [
            h('div', { className: 'modal-header' }, [h('span', { className: 'modal-title' }, 'Editar Guión Recomendado'), h('button', { type: 'button', onClick: () => document.body.removeChild(overlay) }, '×')]),
            h('div', { className: 'modal-body' }, [
                h('textarea', { className: 'form-textarea', style: { minHeight: '300px' }, required: true }, client.guionRecomendado || '')
            ]),
            h('div', { className: 'modal-footer' }, [
                h('button', { type: 'button', className: 'btn btn-outline', onClick: () => document.body.removeChild(overlay) }, 'Cancelar'),
                h('button', { type: 'submit', className: 'btn btn-primary' }, 'Guardar Cambios')
            ])
        ]);
        overlay.appendChild(form);
        document.body.appendChild(overlay);
    };

    const addRecommendedLink = (client) => {
        const overlay = h('div', { className: 'modal-overlay' });
        const form = h('form', { 
            className: 'modal-container', 
            onSubmit: async (e) => {
                e.preventDefault();
                const titleVal = form.querySelector('#link-title').value;
                const urlVal = form.querySelector('#link-url').value;
                
                if (!client.recommendedLinks) client.recommendedLinks = [];
                client.recommendedLinks.push({ title: titleVal, url: urlVal });
                
                await dbService.set('clients', client.id, client);
                document.body.removeChild(overlay);
                loadClient();
            }
        }, [
            h('div', { className: 'modal-header' }, [
                h('span', { className: 'modal-title' }, 'Añadir Link Recomendado'), 
                h('button', { type: 'button', onClick: () => document.body.removeChild(overlay) }, '×')
            ]),
            h('div', { className: 'modal-body flex-column gap-3' }, [
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Título o Nombre del Link'),
                    h('input', { id: 'link-title', className: 'form-input', placeholder: 'Ej. Carpeta de Material Bruto Drive', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'URL del Link'),
                    h('input', { id: 'link-url', type: 'url', className: 'form-input', placeholder: 'https://...', required: true })
                ])
            ]),
            h('div', { className: 'modal-footer' }, [
                h('button', { type: 'button', className: 'btn btn-outline', onClick: () => document.body.removeChild(overlay) }, 'Cancelar'),
                h('button', { type: 'submit', className: 'btn btn-primary' }, 'Añadir Link')
            ])
        ]);
        overlay.appendChild(form);
        document.body.appendChild(overlay);
    };

    const deleteRecommendedLink = async (client, index) => {
        if (confirm("¿Estás seguro de que deseas eliminar este link recomendado?")) {
            client.recommendedLinks.splice(index, 1);
            await dbService.set('clients', client.id, client);
            loadClient();
        }
    };

    loadClient();
    return container;
};
