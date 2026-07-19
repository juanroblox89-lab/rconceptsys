import { h, icon, sumInvoiceItems } from '../utils/dom.js';
import { dbService } from '../supabase/service.js';
import { invoiceService } from '../services/invoiceService.js';
import { crmService } from '../services/crmService.js';
import { aiService } from '../services/aiService.js';
import { store } from '../js/store.js';

export const render = async () => {
    const { user, roles } = store.getState();
    const container = h('div', { className: 'page-container fade-in flex-column gap-5 w-full' });

    // Validate if user has sales/marketing role or is admin
    const currentRole = (roles || []).find(r => r.id === user?.role);
    const isSalesRole = currentRole?.id === 'ventas' || currentRole?.id === 'marketing' || user?.role === 'admin';

    if (!isSalesRole) {
        container.innerHTML = '<div class="card p-8 text-center" style="max-width:400px; margin: 40px auto;"><h3 class="text-danger">Acceso Operativo Denegado</h3><p>Solo el equipo de Ventas y Marketing puede operar este módulo.</p></div>';
        return container;
    }

    const isAdmin = user?.role === 'admin';

    // State of active tab
    let activeTab = 'dashboard'; // 'dashboard' | 'pipeline' | 'leads' | 'visitas' | 'ia'

    // Header
    const header = h('div', { className: 'flex justify-between items-end w-full border-bottom pb-4' }, [
        h('div', {}, [
            h('h1', { className: 'text-xl font-bold flex items-center gap-2' }, [
                icon('trending-up', 20, 'text-accent'),
                h('span', {}, 'Ventas y CRM Centralizado')
            ]),
            h('p', { className: 'text-xs text-muted mt-1' }, 'Módulo integrado de prospección de clientes, automatización de IA y comisiones de ventas.')
        ])
    ]);
    container.appendChild(header);

    // Get system configuration
    let systemPricing = {};
    try { systemPricing = await dbService.getById('system_config', 'pricing') || {}; } catch(e) {}
    const adminPhone = systemPricing.adminPhone || '573000000000';
    const bonusVisitasMarketing = systemPricing.bonusVisitasMarketing ?? 50000;

    // Tabs Navigation
    const tabsContainer = h('div', { className: 'flex gap-2 border-bottom pb-2 w-full overflow-x-auto' });
    container.appendChild(tabsContainer);

    const renderTabs = () => {
        tabsContainer.innerHTML = '';
        const tabs = [
            { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
            { id: 'pipeline', label: 'Pipeline (Kanban)', icon: 'kanban' },
            { id: 'leads', label: 'Directorio de Leads', icon: 'users' },
            { id: 'visitas', label: 'Visitas y Comisiones', icon: 'map-pin' },
            { id: 'ia', label: 'Asistente IA (Llama)', icon: 'sparkles' }
        ];

        tabs.forEach(t => {
            const btn = h('button', {
                className: `btn text-xs py-2 px-4 flex items-center gap-2 transition-all ${activeTab === t.id ? 'btn-primary' : 'btn-outline'}`,
                style: { borderRadius: '20px' },
                onClick: () => {
                    activeTab = t.id;
                    renderTabs();
                    loadDynamicView();
                }
            }, [icon(t.icon, 13), h('span', {}, t.label)]);
            tabsContainer.appendChild(btn);
        });

        if (window.lucide) window.lucide.createIcons();
    };

    // Placeholder for dynamic view
    const dynamicViewContainer = h('div', { className: 'flex-column gap-5 w-full' });
    container.appendChild(dynamicViewContainer);

    const loadDynamicView = async () => {
        dynamicViewContainer.innerHTML = '<div class="loader my-10"></div>';
        
        try {
            const leads = await crmService.getAllLeads();
            const clients = await dbService.getAll('clients').catch(() => []);
            const visitsList = await dbService.getAll('marketing_visits').catch(() => []);
            const users = await dbService.getAll('users').catch(() => []);
            const currentUser = users.find(u => u.uid === user.uid) || user;
            const currentCount = currentUser.marketingVisits || 0;

            dynamicViewContainer.innerHTML = '';

            if (activeTab === 'dashboard') {
                renderDashboardTab(leads, clients);
            } else if (activeTab === 'pipeline') {
                renderPipelineTab(leads);
            } else if (activeTab === 'leads') {
                renderLeadsTab(leads, users);
            } else if (activeTab === 'visitas') {
                renderVisitasTab(visitsList, currentUser, currentCount);
            } else if (activeTab === 'ia') {
                renderIaTab(leads);
            }

            if (window.lucide) window.lucide.createIcons();
        } catch (err) {
            console.error("Error loading CRM view:", err);
            dynamicViewContainer.innerHTML = `<div class="card p-8 text-center text-danger">Error: ${err.message}</div>`;
        }
    };

    // Tab 1: Dashboard
    const renderDashboardTab = (leads, clients) => {
        const activeLeads = leads.filter(l => l.status !== 'Cerrado-Ganado' && l.status !== 'Cerrado-Perdido');
        const pipelineValue = activeLeads.reduce((sum, l) => sum + Number(l.estimated_value || 0), 0);
        
        const wonLeadsCount = leads.filter(l => l.status === 'Cerrado-Ganado').length;
        const totalClosed = leads.filter(l => l.status === 'Cerrado-Ganado' || l.status === 'Cerrado-Perdido').length;
        const conversionRate = totalClosed > 0 ? ((wonLeadsCount / totalClosed) * 100).toFixed(0) : 0;
        
        const targetClients = 15;
        const activeClientsCount = clients.filter(c => c.status === 'Activo').length;
        const targetPercentage = ((activeClientsCount / targetClients) * 100).toFixed(0);

        // Alertas inteligentes recomendadas
        const alertsList = [];
        const now = new Date();
        leads.forEach(l => {
            if (l.status !== 'Cerrado-Ganado' && l.status !== 'Cerrado-Perdido' && l.last_interaction_date) {
                const diffTime = Math.abs(now - new Date(l.last_interaction_date));
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays > 5) {
                    alertsList.push({
                        type: 'warning',
                        message: `El lead **${l.name}** lleva ${diffDays} días sin interacciones.`,
                        action: `Generar seguimiento`
                    });
                }
            }
        });

        const grid = h('div', { 
            className: 'grid gap-4 w-full mb-2',
            style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }
        }, [
            createDashboardMetricCard('Leads Activos', `${activeLeads.length} leads`, 'users', 'var(--accent)'),
            createDashboardMetricCard('Pipeline Estimado', `$${pipelineValue.toLocaleString('es-CO')}`, 'dollar-sign', 'var(--info)'),
            createDashboardMetricCard('Tasa de Conversión', `${conversionRate}%`, 'check-square', 'var(--success)'),
            createDashboardMetricCard('Meta de Clientes Fijos', `${activeClientsCount} / ${targetClients} (${targetPercentage}%)`, 'flag', 'var(--warning)')
        ]);

        const flexContainer = h('div', { className: 'flex gap-4 flex-wrap w-full' }, [
            h('div', { className: 'card p-5 flex-column gap-3', style: { flex: '7', minWidth: '320px' } }, [
                h('h3', { className: 'text-sm font-bold border-bottom pb-2 m-0' }, 'Recomendaciones y Alertas de IA'),
                h('div', { className: 'flex-column gap-3 mt-2' }, 
                    alertsList.length > 0 ? alertsList.map(a => 
                        h('div', { className: 'p-3 rounded flex justify-between items-center text-xs border', style: { background: 'rgba(245,158,11,0.04)', borderColor: 'rgba(245,158,11,0.2)' } }, [
                            h('span', { className: 'text-primary' }, a.message),
                            h('button', { 
                                className: 'btn btn-primary py-1 px-3 text-[10px]', 
                                onClick: () => { activeTab = 'ia'; renderTabs(); loadDynamicView(); } 
                            }, a.action)
                        ])
                    ) : [h('div', { className: 'p-4 text-center text-muted italic' }, 'No hay alertas urgentes pendientes. ¡Todo al día!')]
                )
            ]),

            h('div', { className: 'card p-5 flex-column gap-3', style: { flex: '3', minWidth: '240px' } }, [
                h('h3', { className: 'text-sm font-bold border-bottom pb-2 m-0' }, 'Proyección Imperio (Meta 15)'),
                h('div', { className: 'flex-column items-center justify-center p-6 text-center' }, [
                    h('div', { 
                        style: {
                            width: '120px', height: '120px', borderRadius: '50%',
                            background: `conic-gradient(var(--accent) ${targetPercentage}%, var(--bg-tertiary) 0%)`,
                            display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center'
                        }
                    }, [
                        h('div', { 
                            className: 'flex-column justify-center items-center',
                            style: { width: '100px', height: '100px', borderRadius: '50%', background: 'var(--bg-secondary)', display: 'flex' } 
                        }, [
                            h('span', { className: 'text-lg font-bold text-primary' }, `${targetPercentage}%`),
                            h('span', { className: 'text-[8px] text-muted uppercase font-bold' }, 'Logrado')
                        ])
                    ]),
                    h('p', { className: 'text-xs text-muted mt-4 leading-relaxed' }, `Faltan **${Math.max(0, targetClients - activeClientsCount)}** clientes fijos para alcanzar la meta de la Operación Imperio al 31/10/2026.`)
                ])
            ])
        ]);

        dynamicViewContainer.appendChild(grid);
        dynamicViewContainer.appendChild(flexContainer);
    };

    // Tab 2: Pipeline (Kanban)
    const renderPipelineTab = (leads) => {
        const statuses = ['Prospecto', 'En contacto', 'Propuesta enviada', 'Negociación', 'Cerrado-Ganado', 'Cerrado-Perdido'];
        
        const kanbanBoard = h('div', { 
            className: 'flex gap-3 overflow-x-auto w-full pb-4',
            style: { minHeight: '60vh', alignItems: 'flex-start' } 
        });

        statuses.forEach(status => {
            const statusLeads = leads.filter(l => l.status === status);
            const totalVal = statusLeads.reduce((sum, l) => sum + Number(l.estimated_value || 0), 0);

            const col = h('div', { 
                className: 'card flex-column gap-3 p-3 bg-tertiary',
                style: { width: '280px', flexShrink: 0, minHeight: '50vh', border: '1px solid var(--border)' }
            }, [
                // Column Header
                h('div', { className: 'flex justify-between items-center border-bottom pb-2' }, [
                    h('div', { className: 'flex-column' }, [
                        h('span', { className: 'text-xs font-bold text-primary' }, status),
                        h('span', { className: 'text-[9px] text-muted uppercase font-bold mt-0.5' }, `$${totalVal.toLocaleString('es-CO')}`)
                    ]),
                    h('span', { className: 'badge badge-secondary text-[10px] font-bold px-2 py-0.5' }, `${statusLeads.length}`)
                ]),
                // Cards List
                h('div', { className: 'flex-column gap-2 overflow-y-auto', style: { maxHeight: '48vh' } }, 
                    statusLeads.map(lead => {
                        const days = lead.last_interaction_date ? Math.ceil(Math.abs(new Date() - new Date(lead.last_interaction_date)) / (1000 * 60 * 60 * 24)) : 0;
                        return h('div', { 
                            className: 'card p-3 flex-column gap-2 hover-lift cursor-pointer bg-secondary',
                            style: { border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' },
                            onClick: () => openLeadModal(lead, loadDynamicView)
                        }, [
                            h('div', { className: 'flex justify-between items-start w-full' }, [
                                h('span', { className: 'text-xs font-bold text-primary truncate', style: { maxWidth: '160px' } }, lead.name),
                                h('span', { className: 'badge badge-accent text-[9px] uppercase' }, lead.source)
                            ]),
                            h('div', { className: 'flex justify-between items-center text-[10px] text-muted' }, [
                                h('span', { className: 'font-semibold text-accent' }, `$${Number(lead.estimated_value || 0).toLocaleString('es-CO')}`),
                                h('span', {}, days > 0 ? `Hace ${days}d` : 'Hoy')
                            ]),
                            // Quick Action Tools
                            h('div', { className: 'flex gap-1.5 justify-end mt-1 pt-1.5 border-top w-full' }, [
                                // Quick Status Switcher Dropdown
                                h('select', {
                                    className: 'form-select text-[9px] py-0.5 px-1.5 border',
                                    style: { width: '90px', borderRadius: '4px' },
                                    value: lead.status,
                                    onClick: (e) => e.stopPropagation(),
                                    onChange: async (e) => {
                                        const newStatus = e.target.value;
                                        if (newStatus === 'Cerrado-Ganado') {
                                            if (confirm(`¿Convertir a "${lead.name}" en un cliente activo en RConcept OS?`)) {
                                                await crmService.convertToClient(lead);
                                                loadDynamicView();
                                            }
                                        } else {
                                            await crmService.updateLead(lead.id, { status: newStatus, last_interaction_date: new Date().toISOString() });
                                            loadDynamicView();
                                        }
                                    }
                                }, statuses.map(s => h('option', { value: s }, s))),
                                
                                // Direct WhatsApp Contact
                                h('button', {
                                    className: 'btn py-0.5 px-2 text-[9px] flex items-center gap-0.5 border text-success',
                                    style: { borderColor: 'rgba(37,211,102,0.3)', background: 'rgba(37,211,102,0.05)', borderRadius: '4px' },
                                    onClick: (e) => {
                                        e.stopPropagation();
                                        const msg = encodeURIComponent(`Hola ${lead.name}, te escribo de Rohlfing Concept...`);
                                        window.open(`https://wa.me/${lead.phone || ''}?text=${msg}`, '_blank');
                                    }
                                }, [icon('message-circle', 10), h('span', {}, 'WA')])
                            ])
                        ]);
                    })
                )
            ]);
            kanbanBoard.appendChild(col);
        });

        dynamicViewContainer.appendChild(kanbanBoard);
    };

    // Tab 3: Directory
    const renderLeadsTab = (leads, users) => {
        const topActions = h('div', { className: 'flex justify-between items-center w-full' }, [
            h('h3', { className: 'text-sm font-bold m-0' }, 'Clientes Potenciales y Prospectos'),
            h('button', { 
                className: 'btn btn-primary text-xs flex items-center gap-1.5',
                onClick: () => openAddLeadModal(users, loadDynamicView)
            }, [icon('plus', 13), h('span', {}, 'Añadir Lead')])
        ]);

        const table = h('div', { className: 'table-container w-full card' }, [
            h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' } }, [
                h('thead', { style: { background: 'var(--bg-tertiary)' } }, h('tr', {}, [
                    h('th', { style: { padding: '10px' } }, 'Nombre'),
                    h('th', { style: { padding: '10px' } }, 'Contacto'),
                    h('th', { style: { padding: '10px' } }, 'Fuente'),
                    h('th', { style: { padding: '10px' } }, 'Estado'),
                    h('th', { style: { padding: '10px' } }, 'Valor Estimado'),
                    h('th', { style: { padding: '10px' } }, 'Acciones')
                ])),
                h('tbody', {}, leads.map(l => 
                    h('tr', { style: { borderBottom: '1px solid var(--border)' } }, [
                        h('td', { style: { padding: '10px' }, className: 'font-bold' }, l.name),
                        h('td', { style: { padding: '10px' } }, [
                            h('div', { className: 'flex-column text-[10px]' }, [
                                h('span', {}, l.phone || 'Sin teléfono'),
                                h('span', { className: 'text-muted' }, l.email || 'Sin email')
                            ])
                        ]),
                        h('td', { style: { padding: '10px' } }, h('span', { className: 'badge badge-secondary text-[10px]' }, l.source)),
                        h('td', { style: { padding: '10px' } }, h('span', { className: `badge ${l.status === 'Cerrado-Ganado' ? 'badge-success' : l.status === 'Cerrado-Perdido' ? 'badge-error' : 'badge-info'} text-[10px]` }, l.status)),
                        h('td', { style: { padding: '10px' }, className: 'font-semibold' }, `$${Number(l.estimated_value || 0).toLocaleString('es-CO')}`),
                        h('td', { style: { padding: '10px' } }, [
                            h('button', { 
                                className: 'btn btn-outline text-[10px] py-1 px-2.5 flex items-center gap-1',
                                onClick: () => openLeadModal(l, loadDynamicView)
                            }, [icon('edit', 10), h('span', {}, 'Editar / Estrategia')])
                        ])
                    ])
                ))
            ])
        ]);

        dynamicViewContainer.appendChild(topActions);
        dynamicViewContainer.appendChild(table);
    };

    // Tab 4: Visitas & Comisiones
    const renderVisitasTab = (visitsList, currentUser, currentCount) => {
        const dashboardGrid = h('div', { 
            className: 'grid gap-5 w-full',
            style: { gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', display: 'grid' }
        }, [
            // Visitas Card with count
            h('div', { className: 'card p-5 flex-column justify-between gap-3' }, [
                h('div', {}, [
                    h('h3', { className: 'text-sm font-bold border-bottom pb-2 flex items-center gap-2 m-0' }, [
                        icon('map-pin', 16, 'text-accent'),
                        h('span', {}, 'Visitas Acumuladas')
                    ]),
                    h('p', { className: 'text-xs text-muted mt-2' }, 'Completa 10 visitas de prospección para recibir un bono automático.')
                ]),
                h('div', { className: 'flex items-center justify-between py-2' }, [
                    h('div', { className: 'flex-column' }, [
                        h('span', { className: 'text-2xl font-bold text-accent' }, `${currentCount} / 10`),
                        h('span', { className: 'text-[9px] text-muted uppercase tracking-wider font-bold' }, 'Meta de visitas')
                    ]),
                    h('button', {
                        className: 'btn btn-primary text-xs flex items-center gap-1.5',
                        onClick: () => openRegisterVisitModal(currentUser, currentCount, bonusVisitasMarketing, loadDynamicView)
                    }, [icon('plus', 13), h('span', {}, 'Nueva Visita')])
                ])
            ]),

            // Cierre de Cliente Card
            h('div', { className: 'card p-5 flex-column justify-between gap-3' }, [
                h('div', {}, [
                    h('h3', { className: 'text-sm font-bold border-bottom pb-2 flex items-center gap-2 m-0' }, [
                        icon('check-circle', 16, 'text-success'),
                        h('span', {}, 'Reportar Cierre al Líder')
                    ]),
                    h('p', { className: 'text-xs text-muted mt-2' }, '¿Conseguiste un cliente? Informa al líder directamente sobre el paquete contratado.')
                ]),
                h('div', { className: 'flex justify-end pt-2' }, [
                    h('button', {
                        className: 'btn btn-outline text-xs flex items-center gap-1.5 w-full justify-center',
                        style: { borderColor: '#25D366', color: '#25D366', background: 'rgba(37,211,102,0.03)' },
                        onClick: () => openNewClientWhatsappModal(adminPhone)
                    }, [icon('message-circle', 13), h('span', {}, 'Conseguí un Cliente (WhatsApp)')])
                ])
            ])
        ]);

        const historyPanel = h('div', { className: 'card p-5 flex-column gap-3 w-full' });
        if (!isAdmin) {
            let myVisits = visitsList.filter(v => v.employeeId === currentUser.uid);
            myVisits.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            historyPanel.appendChild(h('h3', { className: 'text-sm font-bold border-bottom pb-2 flex items-center gap-2 m-0' }, [
                icon('history', 16, 'text-muted'),
                h('span', {}, 'Historial de Visitas Recientes')
            ]));

            if (myVisits.length === 0) {
                historyPanel.appendChild(h('span', { className: 'text-xs text-muted italic text-center p-6 block' }, 'No has registrado visitas este ciclo.'));
            } else {
                const list = h('div', { className: 'flex-column gap-2' }, myVisits.slice(0, 5).map(v => 
                    h('div', { className: 'p-3 bg-secondary rounded flex justify-between items-center text-xs border' }, [
                        h('div', { className: 'flex-column gap-0.5' }, [
                            h('span', { className: 'font-bold text-primary' }, v.businessName),
                            h('span', { className: 'text-muted text-[10px]' }, `Tel: ${v.phone}`)
                        ]),
                        h('span', { className: 'badge badge-secondary text-xs' }, new Date(v.date).toLocaleDateString('es-ES'))
                    ])
                ));
                historyPanel.appendChild(list);
            }
        } else {
            historyPanel.appendChild(h('h3', { className: 'text-sm font-bold border-bottom pb-2 m-0' }, 'Monitor Global de Visitas Registradas'));
            
            if (visitsList.length === 0) {
                historyPanel.appendChild(h('span', { className: 'text-xs text-muted italic text-center p-6 block' }, 'No hay visitas registradas por el equipo.'));
            } else {
                historyPanel.appendChild(h('div', { className: 'table-container' }, [
                    h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' } }, [
                        h('thead', { style: { background: 'var(--bg-tertiary)' } }, h('tr', {}, [
                            h('th', { style: { padding: '10px' } }, 'Colaborador'),
                            h('th', { style: { padding: '10px' } }, 'Negocio Visitado'),
                            h('th', { style: { padding: '10px' } }, 'WhatsApp'),
                            h('th', { style: { padding: '10px' } }, 'Fecha')
                        ])),
                        h('tbody', {}, visitsList.map(v => 
                            h('tr', { style: { borderBottom: '1px solid var(--border)' } }, [
                                h('td', { style: { padding: '10px' }, className: 'font-bold' }, v.employeeName),
                                h('td', { style: { padding: '10px' } }, v.businessName),
                                h('td', { style: { padding: '10px' } }, v.phone),
                                h('td', { style: { padding: '10px' }, className: 'text-muted' }, v.date)
                            ])
                        ))
                    ])
                ]));
            }
        }

        dynamicViewContainer.appendChild(dashboardGrid);
        dynamicViewContainer.appendChild(historyPanel);
    };

    // Tab 5: IA Generator (Gemini)
    const renderIaTab = (leads) => {
        const leadSelector = h('select', { className: 'form-select text-xs w-full mb-3' }, [
            h('option', { value: '' }, '-- Selecciona un Lead / Cliente --'),
            ...leads.map(l => h('option', { value: l.id }, l.name))
        ]);

        const actionSelector = h('select', { className: 'form-select text-xs w-full mb-3' }, [
            h('option', { value: 'proposal' }, 'Crear Propuesta Comercial'),
            h('option', { value: 'followup' }, 'Crear Mensaje de Seguimiento WhatsApp'),
            h('option', { value: 'copy' }, 'Crear Lote de Copies de Redes Sociales')
        ]);

        const formatDiv = h('div', { className: 'form-group mb-3', style: { display: 'none' } }, [
            h('label', { className: 'form-label' }, 'Formato Creativo:'),
            h('input', { id: 'ia-format', type: 'text', className: 'form-input text-xs', placeholder: 'Ej. Trend de humor, testimonial, proceso' })
        ]);

        actionSelector.addEventListener('change', (e) => {
            formatDiv.style.display = e.target.value === 'copy' ? 'block' : 'none';
        });

        const resultOutput = h('div', { 
            className: 'p-4 rounded border text-xs font-mono w-full leading-relaxed bg-tertiary',
            style: { minHeight: '200px', whiteSpace: 'pre-wrap', maxHeight: '400px', overflowY: 'auto' }
        }, 'El entregable generado por la IA aparecerá aquí...');

        const generateBtn = h('button', {
            className: 'btn btn-primary text-xs flex items-center gap-1.5 w-full justify-center py-2.5',
            onClick: async (e) => {
                const leadId = leadSelector.value;
                if (!leadId) {
                    alert('Por favor selecciona un lead.');
                    return;
                }

                const action = actionSelector.value;
                const lead = leads.find(l => l.id === leadId);

                e.currentTarget.disabled = true;
                e.currentTarget.textContent = 'Procesando con Llama 3.1...';
                resultOutput.innerHTML = '<div class="loader m-auto"></div>';

                try {
                    let resultText = '';
                    if (action === 'proposal') {
                        resultText = await aiService.generateProposal(lead);
                    } else if (action === 'followup') {
                        resultText = await aiService.generateFollowUp(lead);
                    } else if (action === 'copy') {
                        const formatType = formatDiv.querySelector('#ia-format').value || 'General';
                        resultText = await aiService.generateSocialCopy(lead, formatType);
                    }
                    resultOutput.textContent = resultText;
                } catch (err) {
                    resultOutput.textContent = `❌ Error: ${err.message}`;
                } finally {
                    e.currentTarget.disabled = false;
                    e.currentTarget.textContent = 'Generar Contenido con IA';
                    if (window.lucide) window.lucide.createIcons();
                }
            }
        }, [icon('sparkles', 13), h('span', {}, 'Generar Contenido con IA')]);

        const flexPanel = h('div', { 
            className: 'flex gap-4 flex-wrap w-full mt-2',
            style: { display: 'flex' }
        }, [
            h('div', { className: 'card p-5 flex-column gap-3', style: { flex: '4', minWidth: '280px' } }, [
                h('h3', { className: 'text-sm font-bold border-bottom pb-2 m-0' }, 'Foco del Copiloto'),
                h('div', { className: 'flex-column gap-2 mt-2' }, [
                    h('label', { className: 'text-xs font-bold' }, 'Selecciona Prospecto:'),
                    leadSelector,
                    h('label', { className: 'text-xs font-bold' }, 'Entregable Deseado:'),
                    actionSelector,
                    formatDiv,
                    generateBtn
                ])
            ]),
            h('div', { className: 'card p-5 flex-column gap-3', style: { flex: '6', minWidth: '320px' } }, [
                h('h3', { className: 'text-sm font-bold border-bottom pb-2 m-0 flex justify-between items-center' }, [
                    h('span', {}, 'Contenido Generado'),
                    h('button', { 
                        className: 'btn btn-outline py-1 px-3 text-[10px]',
                        onClick: () => {
                            navigator.clipboard.writeText(resultOutput.textContent);
                            alert('Copiado al portapapeles');
                        }
                    }, 'Copiar')
                ]),
                resultOutput
            ])
        ]);

        dynamicViewContainer.appendChild(flexPanel);
    };

    // Help UI Components
    const createDashboardMetricCard = (label, value, iconName, color) => {
        return h('div', { 
            className: 'card hover-lift metric-card flex-column justify-between p-4',
            style: {
                background: 'linear-gradient(145deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.0) 100%)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-sm)'
            }
        }, [
            h('div', { className: 'metric-label text-[10px] uppercase font-bold text-muted tracking-wider' }, label),
            h('div', { className: 'metric-value text-xl font-bold text-primary mt-1 mb-2' }, value),
            h('div', { className: 'flex items-center gap-1 text-[10px] font-medium', style: { color: color } }, [
                icon(iconName, 12),
                h('span', {}, 'Consolidado')
            ])
        ]);
    };

    // Modal to create new Lead
    const openAddLeadModal = (users, reload) => {
        const overlay = h('div', { className: 'modal-overlay fade-in', style: { zIndex: 1000 } });
        
        const submit = async (e) => {
            e.preventDefault();
            const btnSubmit = form.querySelector('button[type="submit"]');
            btnSubmit.disabled = true;
            btnSubmit.textContent = 'Creando...';

            const name = form.querySelector('#l-name').value;
            const email = form.querySelector('#l-email').value;
            const phone = form.querySelector('#l-phone').value;
            const source = form.querySelector('#l-source').value;
            const estimatedValue = Number(form.querySelector('#l-val').value) || 0;
            const notes = form.querySelector('#l-notes').value;
            const assignedTo = form.querySelector('#l-user').value || null;

            try {
                await crmService.createLead({
                    name,
                    email,
                    phone,
                    source,
                    estimated_value: estimatedValue,
                    notes,
                    assigned_to: assignedTo,
                    first_contact_date: new Date().toISOString(),
                    last_interaction_date: new Date().toISOString()
                });

                overlay.remove();
                reload();
            } catch (err) {
                alert('Error al crear el lead: ' + err.message);
                btnSubmit.disabled = false;
                btnSubmit.textContent = 'Crear Lead';
            }
        };

        const usersHtml = users.map(u => `<option value="${u.uid}">${u.nombre || u.email}</option>`).join('');

        const form = h('form', { className: 'modal-container', style: { maxWidth: '450px' }, onSubmit: submit }, [
            h('div', { className: 'modal-header' }, [
                h('span', { className: 'modal-title font-bold' }, 'Añadir Nuevo Lead'),
                h('button', { type: 'button', onClick: () => overlay.remove() }, '×')
            ]),
            h('div', { className: 'modal-body flex-column gap-3', style: { maxHeight: '70vh', overflowY: 'auto' } }, [
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Nombre de la Marca / Negocio'),
                    h('input', { id: 'l-name', type: 'text', className: 'form-input text-xs', placeholder: 'Restaurante X', required: true })
                ]),
                h('div', { className: 'grid gap-3', style: { display: 'grid', gridTemplateColumns: '1fr 1fr' } }, [
                    h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label' }, 'Email'),
                        h('input', { id: 'l-email', type: 'email', className: 'form-input text-xs', placeholder: 'correo@ejemplo.com' })
                    ]),
                    h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label' }, 'Teléfono / WhatsApp'),
                        h('input', { id: 'l-phone', type: 'tel', className: 'form-input text-xs', placeholder: '+57 300 000 0000', required: true })
                    ])
                ]),
                h('div', { className: 'grid gap-3', style: { display: 'grid', gridTemplateColumns: '1fr 1fr' } }, [
                    h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label' }, 'Fuente'),
                        h('select', { id: 'l-source', className: 'form-select text-xs' }, [
                            h('option', { value: 'fisica' }, 'Física'),
                            h('option', { value: 'virtual' }, 'Virtual / Redes'),
                            h('option', { value: 'referencia' }, 'Referencia')
                        ])
                    ]),
                    h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label' }, 'Valor Estimado (COP)'),
                        h('input', { id: 'l-val', type: 'number', className: 'form-input text-xs', placeholder: '500000' })
                    ])
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Asignado a'),
                    h('select', { id: 'l-user', className: 'form-select text-xs' }, [
                        h('option', { value: '' }, '-- Selecciona Colaborador --'),
                        usersHtml
                    ])
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Notas Iniciales'),
                    h('textarea', { id: 'l-notes', className: 'form-textarea text-xs', rows: '3', placeholder: 'Necesidades de video, estilo o hooks...' })
                ])
            ]),
            h('div', { className: 'modal-footer' }, [
                h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => overlay.remove() }, 'Cancelar'),
                h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, 'Crear Lead')
            ])
        ]);

        overlay.appendChild(form);
        document.body.appendChild(overlay);
        if (window.lucide) window.lucide.createIcons();
    };

    // Modal to Edit / view Lead Profile and strategy
    const openLeadModal = (lead, reload) => {
        const overlay = h('div', { className: 'modal-overlay fade-in', style: { zIndex: 1000 } });
        
        const submit = async (e) => {
            e.preventDefault();
            const btnSubmit = form.querySelector('button[type="submit"]');
            btnSubmit.disabled = true;
            btnSubmit.textContent = 'Guardando...';

            const name = form.querySelector('#l-name').value;
            const email = form.querySelector('#l-email').value;
            const phone = form.querySelector('#l-phone').value;
            const estimatedValue = Number(form.querySelector('#l-val').value) || 0;
            const notes = form.querySelector('#l-notes').value;

            // Strategy Learning Database parse
            let strategy = {};
            try {
                strategy = JSON.parse(form.querySelector('#l-strat').value);
            } catch(err) {
                alert('La estrategia estratégica (JSON) no es válida.');
                btnSubmit.disabled = false;
                btnSubmit.textContent = 'Guardar Cambios';
                return;
            }

            try {
                await crmService.updateLead(lead.id, {
                    name,
                    email,
                    phone,
                    estimated_value: estimatedValue,
                    notes,
                    client_strategy: strategy,
                    last_interaction_date: new Date().toISOString()
                });
                overlay.remove();
                reload();
            } catch (err) {
                alert('Error al guardar lead: ' + err.message);
                btnSubmit.disabled = false;
                btnSubmit.textContent = 'Guardar Cambios';
            }
        };

        const form = h('form', { className: 'modal-container', style: { maxWidth: '500px' }, onSubmit: submit }, [
            h('div', { className: 'modal-header' }, [
                h('span', { className: 'modal-title font-bold' }, `Lead: ${lead.name}`),
                h('button', { type: 'button', onClick: () => overlay.remove() }, '×')
            ]),
            h('div', { className: 'modal-body flex-column gap-3', style: { maxHeight: '75vh', overflowY: 'auto' } }, [
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Nombre de la Marca'),
                    h('input', { id: 'l-name', type: 'text', className: 'form-input text-xs', value: lead.name, required: true })
                ]),
                h('div', { className: 'grid gap-3', style: { display: 'grid', gridTemplateColumns: '1fr 1fr' } }, [
                    h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label' }, 'Email'),
                        h('input', { id: 'l-email', type: 'email', className: 'form-input text-xs', value: lead.email || '' })
                    ]),
                    h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label' }, 'Teléfono'),
                        h('input', { id: 'l-phone', type: 'tel', className: 'form-input text-xs', value: lead.phone || '', required: true })
                    ])
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Monto Estimado de Cierre (COP)'),
                    h('input', { id: 'l-val', type: 'number', className: 'form-input text-xs', value: lead.estimated_value || 0 })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Notas del Lead'),
                    h('textarea', { id: 'l-notes', className: 'form-textarea text-xs', rows: '3', value: lead.notes || '' })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Estrategia por Cliente (BD de Aprendizaje JSON)'),
                    h('textarea', { 
                        id: 'l-strat', 
                        className: 'form-textarea text-xs font-mono', 
                        rows: '5',
                        style: { background: 'var(--bg-tertiary)' },
                        value: JSON.stringify(lead.client_strategy || { colors: '#000000', hooks: [], formats: [] }, null, 2)
                    })
                ])
            ]),
            h('div', { className: 'modal-footer flex justify-between' }, [
                h('button', { 
                    type: 'button', 
                    className: 'btn btn-outline text-error text-xs',
                    onClick: async () => {
                        if (confirm('¿Eliminar este lead permanentemente de la base de datos crm?')) {
                            await crmService.deleteLead(lead.id);
                            overlay.remove();
                            reload();
                        }
                    }
                }, 'Eliminar Lead'),
                h('div', { className: 'flex gap-2' }, [
                    h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => overlay.remove() }, 'Cancelar'),
                    h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, 'Guardar Cambios')
                ])
            ])
        ]);

        overlay.appendChild(form);
        document.body.appendChild(overlay);
        if (window.lucide) window.lucide.createIcons();
    };

    // Modal to register a visit
    const openRegisterVisitModal = (currentUser, currentCount, bonusVisitas, reload) => {
        const overlay = h('div', { className: 'modal-overlay fade-in', style: { zIndex: 1000 } });
        
        const submit = async (e) => {
            e.preventDefault();
            const btn = form.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = 'Guardando...';

            const businessName = form.querySelector('#v-business').value;
            const phone = form.querySelector('#v-phone').value;
            const date = form.querySelector('#v-date').value;

            try {
                const visitObj = {
                    employeeId: currentUser.uid,
                    employeeName: currentUser.nombre || currentUser.email,
                    businessName,
                    phone,
                    date,
                    createdAt: new Date().toISOString()
                };

                let newVisitsCount = currentCount + 1;

                if (newVisitsCount >= 10) {
                    let currentInv = await invoiceService.getEmployeeInvoice(currentUser.uid) || { items: [] };
                    if (!currentInv.items) currentInv.items = [];

                    currentInv.items.push({
                        id: `item-${Date.now()}`,
                        type: 'Bono 10 Visitas',
                        client: 'RConcept',
                        amount: bonusVisitas,
                        createdAt: new Date().toISOString(),
                        observations: 'Bono autogenerado al completar 10 visitas.'
                    });
                    currentInv.amount = sumInvoiceItems(currentInv);

                    await dbService.add('marketing_visits', visitObj);
                    await dbService.update('users', currentUser.uid, { marketingVisits: 0 });
                    await dbService.set('invoices', `emp-inv-${currentUser.uid}`, {
                        id: `emp-inv-${currentUser.uid}`,
                        employeeId: currentUser.uid,
                        employeeName: currentUser.nombre || currentUser.email,
                        amount: currentInv.amount,
                        items: currentInv.items,
                        status: 'Pendiente',
                        updatedAt: new Date().toISOString()
                    });
                    alert(`¡Bono completado! Se ha auto-facturado $${bonusVisitas.toLocaleString('es-CO')} COP en tu cuenta.`);
                } else {
                    await dbService.add('marketing_visits', visitObj);
                    await dbService.update('users', currentUser.uid, { marketingVisits: newVisitsCount });
                }

                overlay.remove();
                reload();
            } catch (err) {
                alert("Error al guardar visita: " + err.message);
                btn.disabled = false;
                btn.textContent = 'Guardar Visita';
            }
        };

        const form = h('form', { className: 'modal-container', style: { maxWidth: '380px' }, onSubmit: submit }, [
            h('div', { className: 'modal-header' }, [
                h('span', { className: 'modal-title font-bold' }, 'Registrar Nueva Visita'),
                h('button', { type: 'button', onClick: () => overlay.remove() }, '×')
            ]),
            h('div', { className: 'modal-body flex-column gap-3' }, [
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Nombre del Negocio'),
                    h('input', { id: 'v-business', type: 'text', className: 'form-input text-xs', placeholder: 'Ej: Jerez el Caballero', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'WhatsApp de Contacto'),
                    h('input', { id: 'v-phone', type: 'tel', className: 'form-input text-xs', placeholder: '+57 300 000 0000', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Fecha de Visita'),
                    h('input', { id: 'v-date', type: 'date', className: 'form-input text-xs', value: new Date().toISOString().split('T')[0], required: true })
                ])
            ]),
            h('div', { className: 'modal-footer' }, [
                h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => overlay.remove() }, 'Cancelar'),
                h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, 'Guardar Visita')
            ])
        ]);

        overlay.appendChild(form);
        document.body.appendChild(overlay);
        if (window.lucide) window.lucide.createIcons();
    };

    // Modal to open WhatsApp message templates for new clients
    const openNewClientWhatsappModal = (adminPhone) => {
        const overlay = h('div', { className: 'modal-overlay fade-in', style: { zIndex: 1000 } });
        
        const submit = (e) => {
            e.preventDefault();
            const clientName = form.querySelector('#c-name').value.trim();
            const packageName = form.querySelector('#c-package').value.trim();

            const message = `Hola líder, conseguí un nuevo cliente: *${clientName}* con el paquete: *${packageName}*.`;
            const waUrl = `https://wa.me/${adminPhone}?text=${encodeURIComponent(message)}`;
            
            window.open(waUrl, '_blank');
            overlay.remove();
        };

        const form = h('form', { className: 'modal-container', style: { maxWidth: '380px' }, onSubmit: submit }, [
            h('div', { className: 'modal-header', style: { background: '#25D366', color: 'white' } }, [
                h('span', { className: 'modal-title font-bold' }, 'Cierre de Nuevo Cliente'),
                h('button', { type: 'button', style: { color: 'white', background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }, onClick: () => overlay.remove() }, '×')
            ]),
            h('div', { className: 'modal-body flex-column gap-3' }, [
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Nombre del Cliente / Negocio'),
                    h('input', { id: 'c-name', type: 'text', className: 'form-input text-xs', placeholder: 'Ej: Restaurante Don Julio', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Paquete / Plan Adquirido'),
                    h('input', { id: 'c-package', type: 'text', className: 'form-input text-xs', placeholder: 'Ej: Plan Básico 4 Reels', required: true })
                ])
            ]),
            h('div', { className: 'modal-footer' }, [
                h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => overlay.remove() }, 'Cancelar'),
                h('button', { type: 'submit', className: 'btn text-xs font-bold', style: { background: '#25D366', color: 'white', border: '1px solid #25D366' } }, 'Enviar WhatsApp')
            ])
        ]);

        overlay.appendChild(form);
        document.body.appendChild(overlay);
        if (window.lucide) window.lucide.createIcons();
    };

    renderTabs();
    await loadDynamicView();
    return container;
};
