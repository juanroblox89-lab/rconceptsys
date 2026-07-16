import { h, icon, sumInvoiceItems } from '../utils/dom.js';
import { dbService } from '../supabase/service.js';
import { invoiceService } from '../services/invoiceService.js';
import { store } from '../js/store.js';
import { formatCurrency } from '../utils/format.js';

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

    // Header
    const header = h('div', { className: 'flex justify-between items-end w-full border-bottom pb-4' }, [
        h('div', {}, [
            h('h1', { className: 'text-xl font-bold flex items-center gap-2' }, [
                icon('trending-up', 20, 'text-accent'),
                h('span', {}, 'Ventas y Prospección')
            ]),
            h('p', { className: 'text-xs text-muted mt-1' }, 'Registra tus visitas de ventas y reporta cierres de nuevos clientes directamente al líder.')
        ])
    ]);
    container.appendChild(header);

    // Get system configuration for WhatsApp contact
    let systemPricing = {};
    try { systemPricing = await dbService.getById('system_config', 'pricing') || {}; } catch(e) {}
    const adminPhone = systemPricing.adminPhone || '573000000000';
    const bonusVisitasMarketing = systemPricing.bonusVisitasMarketing ?? 50000;

    const loadData = async () => {
        try {
            // Clear dynamic sections
            container.querySelectorAll('.marketing-dynamic-section').forEach(el => el.remove());

            const visitsList = await dbService.getAll('marketing_visits').catch(() => []);
            const users = await dbService.getAll('users');
            const currentUser = users.find(u => u.uid === user.uid) || user;
            const currentCount = currentUser.marketingVisits || 0;

            // Dashboard Grid
            const dashboardGrid = h('div', { 
                className: 'grid gap-5 marketing-dynamic-section w-full',
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
                            onClick: () => openRegisterVisitModal(currentUser, currentCount, bonusVisitasMarketing, loadData)
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
            container.appendChild(dashboardGrid);

            // History Panel
            const historyPanel = h('div', { className: 'card p-5 flex-column gap-3 w-full marketing-dynamic-section' });
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
                // Admin monitor
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
            container.appendChild(historyPanel);

            if (window.lucide) window.lucide.createIcons();
        } catch(err) {
            console.error("Error loading marketing dashboard:", err);
        }
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
                    alert(`¡Bono completado! Se ha auto-facturado ${formatCurrency(bonusVisitas)} COP en tu cuenta.`);
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
                h('button', { type: 'button', class: 'close-btn', onClick: () => overlay.remove() }, '×')
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

    loadData();
    return container;
};
