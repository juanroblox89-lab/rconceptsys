import { h, icon } from '../utils/dom.js';
import { dbService } from '../firebase/service.js';
import { invoiceService } from '../services/invoiceService.js';
import { store } from '../js/store.js';

const STAGES = ['Prospecto', 'Reunión', 'Propuesta', 'Cierre', 'Cliente'];

export const render = async () => {
    const { user, roles } = store.getState();
    const container = h('div', { className: 'page-container fade-in flex-column gap-5 w-full' });

    // Validate if the user has sales/marketing operational role or is admin
    const currentRole = (roles || []).find(r => r.id === user?.role);
    const isSalesRole = currentRole?.id === 'ventas' || currentRole?.id === 'marketing' || user?.role === 'admin';

    if (!isSalesRole) {
        container.innerHTML = '<div class="card p-8 text-center" style="max-width:400px; margin: 40px auto;"><h3 class="text-danger">Acceso Operativo Denegado</h3><p>Solo el equipo de Ventas y Marketing puede operar este módulo.</p></div>';
        return container;
    }

    const isAdmin = user?.role === 'admin';

    // Header
    const header = h('div', { className: 'flex justify-between items-end w-full border-bottom pb-4' }, [
        h('div', {}, [
            h('h1', { className: 'text-xl font-bold flex items-center gap-2' }, [
                icon('trending-up', 20, 'text-accent'),
                h('span', {}, 'CRM de Ventas y Embudo')
            ]),
            h('p', { className: 'text-xs text-muted mt-1' }, 'Gestiona el embudo de nuevos clientes y registra tus visitas operativas para comisiones.')
        ])
    ]);
    container.appendChild(header);

    // Load dynamic pricing for admin phone
    let systemPricing = {};
    try { systemPricing = await dbService.getById('system_config', 'pricing') || {}; } catch(e) {}
    const adminPhone = systemPricing.adminPhone || '573000000000';

    const loadData = async () => {
        try {
            container.querySelectorAll('.crm-dynamic-section').forEach(el => el.remove());

            // Fetch leads and visits
            let leadsList = [];
            let visitsList = [];
            try {
                leadsList = await dbService.getAll('crm_leads').catch(() => []);
                visitsList = await dbService.getAll('marketing_visits').catch(() => []);
            } catch(e) { console.warn(e); }

            const users = await dbService.getAll('users');
            const currentUser = users.find(u => u.uid === user.uid) || user;
            const bonusVisitasMarketing = systemPricing.bonusVisitasMarketing ?? 50000;
            const currentCount = currentUser.marketingVisits || 0;

            // ── 1. EMBUTO VISUAL DE VENTAS (CRM BOARD) ────────────────────
            const crmBoard = h('div', { className: 'crm-funnel-board w-full crm-dynamic-section' });
            
            STAGES.forEach((stage, idx) => {
                const stageLeads = leadsList.filter(l => l.stage === stage);
                
                const column = h('div', { className: 'crm-funnel-column' }, [
                    h('div', { className: 'flex justify-between items-center border-bottom pb-2' }, [
                        h('span', { className: 'text-xs font-bold text-primary uppercase' }, stage),
                        h('span', { className: 'badge badge-secondary text-xs' }, stageLeads.length)
                    ]),
                    // Add Button per column
                    h('button', {
                        className: 'btn btn-outline text-xs w-full py-1 justify-center gap-1',
                        onClick: () => openAddLeadModal(stage, loadData)
                    }, [icon('plus', 11), h('span', {}, 'Añadir Lead')]),
                    // List leads
                    h('div', { className: 'flex-column gap-2', style: { flex: 1, minHeight: '100px' } }, 
                        stageLeads.length === 0 
                            ? [h('div', { className: 'text-center text-xs text-muted py-6 italic' }, 'Vacío')]
                            : stageLeads.map(lead => renderLeadCard(lead, idx, loadData))
                    )
                ]);
                crmBoard.appendChild(column);
            });

            // Insert CRM Funnel Board right after header
            header.parentNode.insertBefore(crmBoard, header.nextSibling);

            // ── 2. VISITAS Y COMISIONES (BOTTOM GRID) ────────────────────
            const bottomGrid = h('div', {
                className: 'grid gap-5 crm-dynamic-section',
                style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', width: '100%' }
            });
            container.appendChild(bottomGrid);

            if (!isAdmin) {
                // Worker visit registry panel
                const visitForm = h('div', { className: 'card p-4 flex-column gap-3' }, [
                    h('h3', { className: 'text-sm font-bold border-bottom pb-2 flex items-center gap-2' }, [icon('map-pin', 16), h('span', {}, 'Registrar Nueva Visita')]),
                    h('div', { className: 'flex-column items-center py-3 bg-tertiary rounded text-center' }, [
                        h('span', { className: 'text-2xl font-bold text-accent' }, `${currentCount} / 10`),
                        h('span', { className: 'text-xs text-muted uppercase tracking-wider font-bold' }, 'Visitas Acumuladas')
                    ]),
                    h('form', {
                        className: 'flex-column gap-2',
                        onSubmit: async (e) => {
                            e.preventDefault();
                            const btn = e.target.querySelector('button[type="submit"]');
                            btn.disabled = true;
                            
                            const businessName = e.target.querySelector('#v-business').value;
                            const phone = e.target.querySelector('#v-phone').value;
                            const date = e.target.querySelector('#v-date').value;

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
                                    const bonusAmount = bonusVisitasMarketing;
                                    let currentInv = await invoiceService.getEmployeeInvoice(currentUser.uid) || { items: [] };
                                    if (!currentInv.items) currentInv.items = [];
                                    
                                    currentInv.items.push({
                                        id: `item-${Date.now()}`,
                                        type: 'Bono 10 Visitas',
                                        client: 'RConcept',
                                        amount: bonusAmount,
                                        createdAt: new Date().toISOString(),
                                        observations: 'Bono autogenerado al completar 10 visitas.'
                                    });
                                    currentInv.amount = currentInv.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
                                    
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
                                    alert(`¡Bono completado! Se ha auto-facturado $${bonusAmount.toLocaleString('es-CO')} COP en tu cuenta.`);
                                } else {
                                    await dbService.add('marketing_visits', visitObj);
                                    await dbService.update('users', currentUser.uid, { marketingVisits: newVisitsCount });
                                }
                                loadData();
                            } catch (err) {
                                alert("Error al guardar la visita: " + err.message);
                                btn.disabled = false;
                            }
                        }
                    }, [
                        h('div', { className: 'form-group' }, [h('label', { className: 'form-label' }, 'Negocio'), h('input', { id: 'v-business', type: 'text', className: 'form-input text-xs', placeholder: 'Ej: Jerez el Caballero', required: true })]),
                        h('div', { className: 'form-group' }, [h('label', { className: 'form-label' }, 'WhatsApp'), h('input', { id: 'v-phone', type: 'tel', className: 'form-input text-xs', placeholder: '+57 300 000 0000', required: true })]),
                        h('div', { className: 'form-group' }, [h('label', { className: 'form-label' }, 'Fecha'), h('input', { id: 'v-date', type: 'date', className: 'form-input text-xs', value: new Date().toISOString().split('T')[0], required: true })]),
                        h('button', { type: 'submit', className: 'btn btn-primary text-xs w-full justify-center mt-2' }, 'Registrar Visita')
                    ])
                ]);
                bottomGrid.appendChild(visitForm);

                // History Panel
                let myVisits = visitsList.filter(v => v.employeeId === currentUser.uid);
                myVisits.sort((a, b) => new Date(b.date) - new Date(a.date));
                const historyPanel = h('div', { className: 'card p-4 flex-column gap-3' }, [
                    h('h3', { className: 'text-sm font-bold border-bottom pb-2 flex items-center gap-2' }, [icon('history', 16), h('span', {}, 'Visitas Recientes')]),
                    myVisits.length === 0 
                        ? h('span', { className: 'text-xs text-muted italic text-center p-4' }, 'No has registrado visitas.')
                        : h('div', { className: 'flex-column gap-2' }, myVisits.slice(0, 4).map(v => 
                            h('div', { className: 'p-2 bg-tertiary rounded flex justify-between items-center text-xs', style: { border: '1px solid var(--border)' } }, [
                                h('div', { className: 'flex-column' }, [
                                    h('span', { className: 'font-bold text-primary' }, v.businessName),
                                    h('span', { className: 'text-muted' }, v.phone)
                                ]),
                                h('span', { className: 'badge badge-secondary text-xs' }, v.date)
                            ])
                        ))
                ]);
                bottomGrid.appendChild(historyPanel);
            } else {
                // Admin monitor
                const adminMonitor = h('div', { className: 'card p-5 flex-column gap-3 w-full' }, [
                    h('h3', { className: 'text-sm font-bold border-bottom pb-2' }, 'Monitor Global de Visitas y Comisiones'),
                    visitsList.length === 0 
                        ? h('span', { className: 'text-xs text-muted italic' }, 'Sin visitas registradas.')
                        : h('div', { className: 'table-container' }, [
                            h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' } }, [
                                h('thead', { style: { background: 'var(--bg-tertiary)' } }, h('tr', {}, [
                                    h('th', { style: { padding: '10px' } }, 'Trabajador'),
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
                        ])
                ]);
                bottomGrid.appendChild(adminMonitor);
            }

            if (window.lucide) window.lucide.createIcons();

        } catch (err) {
            console.error(err);
        }
    };

    const renderLeadCard = (lead, stageIdx, reload) => {
        return h('div', { className: 'crm-lead-card flex-column gap-1' }, [
            h('div', { className: 'flex justify-between items-start' }, [
                h('span', { className: 'font-bold text-xs text-primary truncate', style: { maxWidth: '140px' } }, lead.name),
                h('button', {
                    className: 'btn-icon text-muted p-0.5 hover-text-danger',
                    style: { background: 'none', border: 'none' },
                    onClick: async () => {
                        if (confirm(`¿Eliminar prospecto "${lead.name}"?`)) {
                            await dbService.delete('crm_leads', lead.id);
                            reload();
                        }
                    }
                }, [icon('x', 11)])
            ]),
            h('span', { className: 'text-xs text-muted' }, lead.contact || 'Sin contacto'),
            h('div', { className: 'flex justify-between items-center mt-2 border-top pt-1' }, [
                // Amount
                h('span', { className: 'text-xs font-semibold text-success' }, lead.amount ? `$${Number(lead.amount).toLocaleString('es-CO')}` : '$0'),
                // Direction buttons to change stages
                h('div', { className: 'flex gap-1' }, [
                    stageIdx > 0 ? h('button', {
                        className: 'btn-icon p-1 bg-tertiary hover-bg-secondary text-xs',
                        style: { width: '18px', height: '18px' },
                        onClick: async () => {
                            await dbService.update('crm_leads', lead.id, { stage: STAGES[stageIdx - 1] });
                            reload();
                        }
                    }, '←') : null,
                    stageIdx < STAGES.length - 1 ? h('button', {
                        className: 'btn-icon p-1 bg-tertiary hover-bg-secondary text-xs',
                        style: { width: '18px', height: '18px' },
                        onClick: async () => {
                            await dbService.update('crm_leads', lead.id, { stage: STAGES[stageIdx + 1] });
                            reload();
                        }
                    }, '→') : null
                ])
            ])
        ]);
    };

    const openAddLeadModal = (defaultStage, reload) => {
        const overlay = h('div', { className: 'modal-overlay' });
        
        const submit = async (e) => {
            e.preventDefault();
            const name = form.querySelector('#lead-name').value;
            const contact = form.querySelector('#lead-contact').value;
            const amount = Number(form.querySelector('#lead-amount').value) || 0;
            const stage = form.querySelector('#lead-stage').value;

            try {
                await dbService.add('crm_leads', {
                    id: `LD-${Date.now()}`,
                    name,
                    contact,
                    amount,
                    stage,
                    createdAt: new Date().toISOString()
                });
                overlay.remove();
                reload();
            } catch (err) {
                alert('Error al agregar lead: ' + err.message);
            }
        };

        const form = h('form', { className: 'modal-container', style: { maxWidth: '380px' }, onSubmit: submit }, [
            h('div', { className: 'modal-header' }, [
                h('span', { className: 'modal-title' }, 'Nuevo Prospecto CRM'),
                h('button', { type: 'button', onClick: () => overlay.remove() }, '×')
            ]),
            h('div', { className: 'modal-body flex-column gap-3' }, [
                h('div', { className: 'form-group' }, [h('label', { className: 'form-label' }, 'Nombre del Negocio'), h('input', { id: 'lead-name', type: 'text', className: 'form-input text-xs', placeholder: 'Ej: Villa Grande', required: true })]),
                h('div', { className: 'form-group' }, [h('label', { className: 'form-label' }, 'Contacto/WhatsApp'), h('input', { id: 'lead-contact', type: 'text', className: 'form-input text-xs', placeholder: '+57 300 000 0000', required: true })]),
                h('div', { className: 'form-group' }, [h('label', { className: 'form-label' }, 'Monto Estimado (COP)'), h('input', { id: 'lead-amount', type: 'number', className: 'form-input text-xs', placeholder: '1500000' })]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Etapa Inicial'),
                    h('select', { id: 'lead-stage', className: 'form-select text-xs' }, 
                        STAGES.map(s => h('option', { value: s, selected: s === defaultStage }, s))
                    )
                ])
            ]),
            h('div', { className: 'modal-footer' }, [
                h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => overlay.remove() }, 'Cancelar'),
                h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, 'Guardar Lead')
            ])
        ]);

        overlay.appendChild(form);
        document.body.appendChild(overlay);
        if (window.lucide) window.lucide.createIcons();
    };

    loadData();
    return container;
};
