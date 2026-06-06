/**
 * Client Detail Page - Creative Production OS
 * Deep dive into client strategy, assets, and recommended scripts.
 * Premium redesigned layout featuring tabs: Info, Videos, Hooks, Formatos, Assets, IA.
 */
import { h, icon } from '../utils/dom.js';
import { store } from '../js/store.js';
import { dbService, storageService } from '../firebase/service.js';
import { assignmentService } from '../services/assignmentService.js';

export const render = async (params) => {
    const { id } = params;
    const { user } = store.getState();
    const isAdmin = user?.role === 'admin';
    
    const container = h('div', { className: 'fade-in flex-column gap-6' });
    let currentTab = 'informacion';

    const loadClient = async () => {
        container.innerHTML = '<div class="loader"></div>';
        
        try {
            let client = await dbService.getById('clients', id);

            if (!client) {
                container.innerHTML = '';
                const emptyDetail = h('div', { className: 'text-center p-20 card flex-column items-center justify-center gap-4' }, [
                    icon('users', 40, 'text-muted mb-2'),
                    h('h3', { className: 'text-md font-bold' }, 'Cliente no encontrado'),
                    h('p', { className: 'text-xs text-muted max-w-xs' }, 'El identificador de cliente ingresado no coincide con ningún registro en tu base de datos.'),
                    h('button', { 
                        className: 'btn btn-outline text-xs mt-2',
                        onClick: () => window.location.hash = '#clients' 
                    }, [icon('arrow-left', 14), h('span', {}, 'Volver al Directorio')])
                ]);
                container.appendChild(emptyDetail);
                if (window.lucide) window.lucide.createIcons();
                return;
            }

            container.innerHTML = '';

            // 1. Client Premium Hero
            const hero = h('div', { className: 'client-hero-container flex-column gap-4' }, [
                h('div', { className: 'flex justify-between items-center w-full border-bottom pb-4' }, [
                    h('div', { className: 'flex items-center gap-3' }, [
                        h('button', { 
                            className: 'btn btn-outline text-xs py-1.5 px-3', 
                            onClick: () => window.location.hash = '#clients' 
                        }, [icon('arrow-left', 14), h('span', {}, 'Volver')]),
                        h('span', { className: 'text-muted text-xs' }, 'Clientes / ' + client.name)
                    ]),
                    isAdmin ? h('button', { 
                        className: 'btn btn-outline text-xs',
                        onClick: () => editEstrategia(client)
                    }, [icon('edit-3', 14), h('span', {}, 'Editar Info')]) : null
                ]),

                h('div', { className: 'flex items-center gap-4' }, [
                    h('div', { 
                        className: 'relative overflow-hidden border', 
                        style: { width: '64px', height: '64px', borderRadius: '12px', background: 'var(--bg-secondary)', borderColor: 'rgba(255,255,255,0.08)' } 
                    }, [
                        h('img', { 
                            src: client.logo || '/logo-icon.svg', 
                            style: { width: '100%', height: '100%', objectFit: 'cover' } 
                        })
                    ]),
                    h('div', { className: 'flex-column gap-1' }, [
                        h('h1', { className: 'text-xl font-bold m-0' }, client.name),
                        h('span', { className: 'text-xs text-muted' }, `Tipo: ${client.businessType || 'Servicios'} • Relación: ${client.relationTime || '8 meses con la agencia'}`)
                    ])
                ])
            ]);

            // 2. Tab Navigation
            const tabs = [
                { id: 'informacion', label: 'Información', icon: 'info' },
                { id: 'videos', label: 'Videos', icon: 'video' },
                { id: 'hooks', label: 'Hooks', icon: 'zap' },
                { id: 'formatos', label: 'Formatos', icon: 'layout' },
                { id: 'assets', label: 'Assets', icon: 'folder' },
                { id: 'ia', label: 'RIA Inteligencia', icon: 'bot' }
            ];

            const tabNav = h('div', { className: 'tab-nav-premium' }, 
                tabs.map(t => h('button', {
                    className: `tab-btn-premium ${currentTab === t.id ? 'active' : ''} flex items-center gap-2`,
                    onClick: () => { currentTab = t.id; loadClient(); }
                }, [icon(t.icon, 14), h('span', {}, t.label)]))
            );

            // 3. Tab Body Content
            let tabContent = h('div', { className: 'fade-in flex-column gap-4' });

            if (currentTab === 'informacion') {
                tabContent = h('div', { className: 'grid gap-4', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' } }, [
                    h('div', { className: 'premium-info-section flex-column gap-3' }, [
                        h('h3', { className: 'text-xs font-bold text-muted uppercase tracking-wider' }, 'Identidad de Marca'),
                        h('p', { className: 'text-xs text-secondary leading-relaxed bg-tertiary p-3 rounded border m-0' }, client.identidad || client.description || 'Especialistas en ofrecer experiencias premium a comensales y amantes del buen vivir.'),
                        h('h3', { className: 'text-xs font-bold text-muted uppercase tracking-wider mt-3' }, 'Posicionamiento'),
                        h('p', { className: 'text-xs text-secondary leading-relaxed bg-tertiary p-3 rounded border m-0' }, client.posicionamiento || 'Referente local de gastronomía y ambiente exclusivo en la ciudad.')
                    ]),
                    h('div', { className: 'premium-info-section flex-column gap-3' }, [
                        h('h3', { className: 'text-xs font-bold text-muted uppercase tracking-wider' }, 'Cliente Ideal (Buyer Persona)'),
                        h('p', { className: 'text-xs text-secondary leading-relaxed bg-tertiary p-3 rounded border m-0' }, client.clienteIdeal || 'Adultos de 25-45 años, profesionales, apasionados por la comida de autor, fotos estéticas y reuniones sociales.'),
                        h('h3', { className: 'text-xs font-bold text-muted uppercase tracking-wider mt-3' }, 'Personalidad de la Cuenta'),
                        h('p', { className: 'text-xs text-secondary leading-relaxed bg-tertiary p-3 rounded border m-0' }, client.personalidad || 'Sofisticada, alegre, provocativa visualmente, atenta al detalle y cercana.')
                    ])
                ]);
            } 
            else if (currentTab === 'videos') {
                const videoItems = [
                    { title: "Campaña Día de la Madre", views: "145K", date: "Hace 2 semanas", format: "RC-01 Recorrido Comercial", hook: "HK-07 Descubrimiento Local" },
                    { title: "Detrás de Cámaras Cocina", views: "87K", date: "Hace 3 semanas", format: "Narrativa Rápida", hook: "HK-02 Curiosidad Estructurada" },
                    { title: "Presentación de Postre Especial", views: "210K", date: "Hace 1 mes", format: "ASMR Gastronómico", hook: "HK-09 Sonido Provocativo" }
                ];

                tabContent = h('div', { className: 'flex-column gap-4' }, [
                    h('h3', { className: 'text-sm font-bold text-primary mb-1' }, 'Historial de Producciones de Video'),
                    h('div', { className: 'grid gap-4', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' } }, 
                        videoItems.map(vid => h('div', { className: 'card p-3 flex-column gap-3 relative overflow-hidden', style: { border: '1px solid rgba(255,255,255,0.08)' } }, [
                            h('div', { className: 'relative rounded-lg overflow-hidden flex items-center justify-center', style: { height: '140px', background: 'linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(168,85,247,0.15) 100%)' } }, [
                                icon('play-circle', 40, 'text-accent opacity-80'),
                                h('span', { className: 'absolute bottom-2 right-2 badge badge-secondary text-[10px]' }, vid.views)
                            ]),
                            h('div', { className: 'flex-column gap-1' }, [
                                h('h4', { className: 'text-xs font-bold text-primary m-0' }, vid.title),
                                h('p', { className: 'text-[10px] text-muted m-0' }, `${vid.date} • Formato: ${vid.format}`),
                                h('span', { className: 'text-[10px] text-accent mt-2 font-bold' }, `Hook: ${vid.hook}`)
                            ])
                        ]))
                    )
                ]);
            }
            else if (currentTab === 'hooks') {
                const hookItems = [
                    { id: 'HK-07', title: 'Descubrimiento Local', retention: '87%', uses: 43 },
                    { id: 'HK-02', title: 'Storytelling de Fracaso a Éxito', retention: '79%', uses: 22 },
                    { id: 'HK-12', title: 'Cuestionamiento del Status Quo', retention: '74%', uses: 15 }
                ];
                tabContent = h('div', { className: 'flex-column gap-4' }, [
                    h('h3', { className: 'text-sm font-bold text-primary' }, 'Hooks Validados y Retención Histórica'),
                    h('div', { className: 'grid gap-3' }, 
                        hookItems.map(hk => h('div', { className: 'card p-4 flex justify-between items-center', style: { border: '1px solid rgba(255,255,255,0.08)' } }, [
                            h('div', { className: 'flex items-center gap-3' }, [
                                h('span', { className: 'badge badge-accent font-mono' }, hk.id),
                                h('div', {}, [
                                    h('h4', { className: 'text-xs font-bold text-primary m-0' }, hk.title),
                                    h('p', { className: 'text-[10px] text-muted m-0' }, `Cantidad de usos: ${hk.uses} veces`)
                                ])
                            ]),
                            h('div', { className: 'text-right' }, [
                                h('span', { className: 'intel-stat-large block text-success', style: { fontSize: '1.8rem' } }, hk.retention),
                                h('span', { className: 'text-[9px] text-muted' }, 'Retención Promedio')
                            ])
                        ]))
                    )
                ]);
            }
            else if (currentTab === 'formatos') {
                tabContent = h('div', { className: 'grid gap-4', style: { gridTemplateColumns: '1fr 1fr' } }, [
                    h('div', { className: 'premium-info-section flex-column gap-3' }, [
                        h('h3', { className: 'text-xs font-bold text-success uppercase tracking-wider flex items-center gap-2' }, [
                            icon('check-circle', 14),
                            h('span', {}, 'Formatos que funcionan')
                        ]),
                        h('ul', { className: 'flex-column gap-2 text-xs text-secondary pl-4 m-0' }, [
                            h('li', {}, 'RC-01 Recorrido Comercial (Alta conversión)'),
                            h('li', {}, 'ASMR Dinámico de preparación (Gran retención)'),
                            h('li', {}, 'Entrevistas rápidas de 3 preguntas a clientes')
                        ])
                    ]),
                    h('div', { className: 'premium-info-section flex-column gap-3' }, [
                        h('h3', { className: 'text-xs font-bold text-error uppercase tracking-wider flex items-center gap-2' }, [
                            icon('x-circle', 14),
                            h('span', {}, 'Formatos que no funcionan')
                        ]),
                        h('ul', { className: 'flex-column gap-2 text-xs text-secondary pl-4 m-0' }, [
                            h('li', {}, 'Videos explicativos largos (> 90 segundos)'),
                            h('li', {}, 'Tendencias de baile genéricas sin producto'),
                            h('li', {}, 'Vlogs institucionales de directivos')
                        ])
                    ])
                ]);
            }
            else if (currentTab === 'assets') {
                tabContent = h('div', { className: 'premium-info-section flex-column gap-4' }, [
                    h('div', { className: 'flex justify-between items-center border-bottom pb-3' }, [
                        h('h3', { className: 'text-sm font-bold text-primary' }, 'Biblioteca de Assets del Cliente'),
                        isAdmin ? h('button', { 
                            className: 'btn btn-primary text-xs',
                            onClick: () => addRecommendedLink(client) 
                        }, [icon('plus', 12), h('span', { className: 'ml-1' }, 'Añadir Asset Link')]) : null
                    ]),
                    h('div', { className: 'grid gap-2' }, 
                        (!client.recommendedLinks || !client.recommendedLinks.length) ? [
                            h('div', { className: 'p-4 text-center text-xs text-muted italic card bg-secondary' }, 'No hay links de assets o referencias registrados aún.')
                        ] :
                        client.recommendedLinks.map((rl, idx) => h('div', { 
                            key: idx, 
                            className: 'card p-3 flex items-center justify-between hover-bg-tertiary transition'
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
                                className: 'btn btn-outline text-xs p-1', 
                                style: { color: 'var(--error)' },
                                title: 'Eliminar Asset',
                                onClick: () => deleteRecommendedLink(client, idx) 
                            }, [icon('trash-2', 12)]) : null
                        ]))
                    )
                ]);
            }
            else if (currentTab === 'ia') {
                // Inline miniature bot
                const chatContainer = h('div', { className: 'flex-column gap-3 bg-secondary p-4 rounded-lg border' }, [
                    h('div', { className: 'flex items-center gap-2 border-bottom pb-2' }, [
                        icon('bot', 20, 'text-accent'),
                        h('div', {}, [
                            h('h4', { className: 'text-xs font-bold text-primary m-0' }, 'RIA Asistente Contextual'),
                            h('p', { className: 'text-[9px] text-muted m-0' }, `Consultando contexto para ${client.name}`)
                        ])
                    ]),
                    h('div', { id: 'ia-chat-box', className: 'flex-column gap-2 overflow-y-auto p-2 bg-tertiary rounded border', style: { height: '220px' } }, [
                        h('div', { className: 'text-xs text-secondary bg-secondary p-2.5 rounded border self-start max-w-xs' }, `¡Hola! Soy RIA. Puedo ayudarte con guiones, ideas de ganchos (hooks) y formatos ideales para *${client.name}*. ¿Qué deseas crear hoy?`)
                    ]),
                    h('form', {
                        className: 'flex gap-2 items-center border-top pt-2',
                        onSubmit: (e) => {
                            e.preventDefault();
                            const input = e.target.querySelector('input');
                            const val = input.value.trim();
                            if(!val) return;

                            const box = document.getElementById('ia-chat-box');
                            
                            // Append user msg
                            box.appendChild(h('div', { className: 'text-xs text-white bg-accent p-2.5 rounded self-end max-w-xs ml-auto' }, val));
                            input.value = '';

                            // Mock bot response based on keywords
                            setTimeout(() => {
                                let reply = `Tomando en cuenta la personalidad sofisticada de *${client.name}*, te recomiendo estructurar un video usando el Formato RC-01 Recorrido Comercial acoplado con el gancho HK-07 Descubrimiento Local.`;
                                if (val.toLowerCase().includes('gancho') || val.toLowerCase().includes('hook')) {
                                    reply = `Para *${client.name}*, los hooks de tipo curiosidad local como "El secreto gastronómico mejor guardado de la ciudad..." tienen un 87% de retención validada.`;
                                } else if (val.toLowerCase().includes('guion') || val.toLowerCase().includes('script')) {
                                    reply = `Aquí tienes una estructura rápida:\n1. Hook (0-3s): "No vas a creer este postre..."\n2. Cuerpo (3-15s): Muestra visual en cámara lenta del bizcocho mojado.\n3. CTA: "Link en bio para reservar."`;
                                }
                                box.appendChild(h('div', { className: 'text-xs text-secondary bg-secondary p-2.5 rounded border self-start max-w-xs' }, reply));
                                box.scrollTop = box.scrollHeight;
                            }, 700);
                        }
                    }, [
                        h('input', { type: 'text', placeholder: 'Pregúntale a la IA sobre esta cuenta...', className: 'form-input text-xs flex-1', required: true }),
                        h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, 'Preguntar')
                    ])
                ]);

                tabContent = h('div', { className: 'flex-column gap-3' }, [
                    h('h3', { className: 'text-sm font-bold text-primary' }, 'Chat Contextual Creativo IA'),
                    chatContainer
                ]);
            }

            container.appendChild(hero);
            container.appendChild(tabNav);
            container.appendChild(tabContent);

            // Initialize Lucide icons
            if (window.lucide) window.lucide.createIcons();

        } catch (err) {
            container.innerHTML = `<div class="p-10 text-center text-error">${err.message}</div>`;
        }
    };

    const editEstrategia = (client) => {
        const overlay = h('div', { className: 'modal-overlay' });
        const form = h('form', { 
            className: 'modal-container', 
            onSubmit: async (e) => {
                e.preventDefault();
                client.description = form.querySelector('#cli-strat-desc').value;
                client.identidad = form.querySelector('#cli-strat-id').value;
                client.posicionamiento = form.querySelector('#cli-strat-pos').value;
                client.clienteIdeal = form.querySelector('#cli-strat-buyer').value;
                client.personalidad = form.querySelector('#cli-strat-pers').value;
                
                await dbService.update('clients', client.id, client);
                document.body.removeChild(overlay);
                loadClient();
            }
        }, [
            h('div', { className: 'modal-header' }, [
                h('span', { className: 'modal-title' }, `Editar Información: ${client.name}`), 
                h('button', { type: 'button', onClick: () => document.body.removeChild(overlay) }, '×')
            ]),
            h('div', { className: 'modal-body flex-column gap-3' }, [
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label text-xs' }, 'Resumen / Descripción'),
                    h('textarea', { id: 'cli-strat-desc', className: 'form-textarea text-xs', style: { minHeight: '80px' }, required: true }, client.description || '')
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label text-xs' }, 'Identidad de Marca'),
                    h('input', { id: 'cli-strat-id', className: 'form-input text-xs', value: client.identidad || '', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label text-xs' }, 'Posicionamiento'),
                    h('input', { id: 'cli-strat-pos', className: 'form-input text-xs', value: client.posicionamiento || '', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label text-xs' }, 'Cliente Ideal'),
                    h('input', { id: 'cli-strat-buyer', className: 'form-input text-xs', value: client.clienteIdeal || '', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label text-xs' }, 'Personalidad de la Cuenta'),
                    h('input', { id: 'cli-strat-pers', className: 'form-input text-xs', value: client.personalidad || '', required: true })
                ])
            ]),
            h('div', { className: 'modal-footer' }, [
                h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => document.body.removeChild(overlay) }, 'Cancelar'),
                h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, 'Guardar Cambios')
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
                h('span', { className: 'modal-title' }, 'Añadir Link de Asset / Recurso'), 
                h('button', { type: 'button', onClick: () => document.body.removeChild(overlay) }, '×')
            ]),
            h('div', { className: 'modal-body flex-column gap-3' }, [
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label text-xs' }, 'Título o Nombre'),
                    h('input', { id: 'link-title', className: 'form-input text-xs', placeholder: 'Ej. Carpeta de Material Bruto Drive', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label text-xs' }, 'URL del Link'),
                    h('input', { id: 'link-url', type: 'url', className: 'form-input text-xs', placeholder: 'https://...', required: true })
                ])
            ]),
            h('div', { className: 'modal-footer' }, [
                h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => document.body.removeChild(overlay) }, 'Cancelar'),
                h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, 'Añadir')
            ])
        ]);
        overlay.appendChild(form);
        document.body.appendChild(overlay);
    };

    const deleteRecommendedLink = (client, index) => {
        const overlay = h('div', { className: 'modal-overlay fade-in' });
        const modal = h('div', { className: 'modal-container' }, [
            h('div', { className: 'modal-header text-sm font-bold' }, 'Confirmar Eliminación'),
            h('div', { className: 'modal-body text-xs' }, "¿Estás seguro de que deseas eliminar este link recomendado?"),
            h('div', { className: 'modal-footer' }, [
                h('button', { className: 'btn btn-outline text-xs', onClick: () => document.body.removeChild(overlay) }, 'Cancelar'),
                h('button', { className: 'btn text-xs', style: { color: 'var(--error)', borderColor: 'var(--error)' }, onClick: async () => {
                    document.body.removeChild(overlay);
                    client.recommendedLinks.splice(index, 1);
                    await dbService.set('clients', client.id, client);
                    loadClient();
                }}, 'Eliminar')
            ])
        ]);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    };

    loadClient();
    return container;
};
