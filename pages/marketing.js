import { h, icon } from '../utils/dom.js';
import { dbService } from '../firebase/service.js';
import { invoiceService } from '../services/invoiceService.js';
import { store } from '../js/store.js';

export const render = async () => {
    const { user, roles } = store.getState();
    const container = h('div', { className: 'page-container fade-in flex-column gap-6' });

    // Validate if the user has sales/marketing operational role or is admin
    const currentRole = (roles || []).find(r => r.id === user?.role);
    const isSalesRole = currentRole?.id === 'ventas' || currentRole?.id === 'marketing' || user?.role === 'admin';

    if (!isSalesRole) {
        container.innerHTML = '<div class="card p-8 text-center" style="max-width:400px; margin: 40px auto;"><h3 class="text-danger">Acceso Operativo Denegado</h3><p>Solo el equipo de Ventas puede operar este módulo. Si eres Administrador, debes asignarte el rol de Ventas para interactuar aquí.</p></div>';
        return container;
    }

    const isAdmin = user?.role === 'admin';

    // Header
    const header = h('div', { className: 'flex justify-between items-end w-full border-bottom pb-4' }, [
        h('div', {}, [
            h('h1', { className: 'text-2xl font-bold flex items-center gap-2' }, [
                icon('trending-up', 24, 'text-accent'),
                h('span', {}, 'Ventas y Marketing')
            ]),
            h('p', { className: 'text-sm text-muted mt-1' }, 'Registra tus visitas a clientes. Genera comisiones automáticamente al llegar a 10 clientes.')
        ])
    ]);
    container.appendChild(header);

    // Call to Action WhatsApp
    const whatsappBanner = h('div', { 
        className: 'card p-4 flex justify-between items-center bg-secondary border',
        style: { borderColor: 'var(--accent)', background: 'rgba(59, 130, 246, 0.05)' }
    }, [
        h('div', { className: 'flex items-center gap-3' }, [
            icon('message-circle', 24, 'text-accent'),
            h('div', {}, [
                h('h3', { className: 'text-sm font-bold text-primary m-0' }, '¿Problemas con los pagos o dudas de ventas?'),
                h('p', { className: 'text-xs text-muted m-0 mt-1' }, 'Cuadra los pagos de las comisiones personalmente con el jefe.')
            ])
        ]),
        h('a', { 
            href: 'https://wa.me/573242123300', 
            target: '_blank', 
            className: 'btn btn-primary text-xs' 
        }, [icon('phone', 14), h('span', {}, 'Contactar +57 324 212 3300')])
    ]);
    container.appendChild(whatsappBanner);

    const content = h('div', { className: 'grid gap-6', style: { gridTemplateColumns: isAdmin ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))' } });
    container.appendChild(content);

    const loadData = async () => {
        try {
            content.innerHTML = '<div class="text-muted text-sm p-4">Cargando datos de visitas...</div>';
            
            // Get all visits
            let visitsList = [];
            try {
                visitsList = await dbService.getAll('marketing_visits');
            } catch(e) { console.warn('No visits yet'); }

            const users = await dbService.getAll('users');
            const currentUser = users.find(u => u.uid === user.uid) || user;
            
            let myVisits = visitsList.filter(v => v.employeeId === currentUser.uid);
            // Sort by date descending
            myVisits.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            // Calculate progress towards 10
            const currentCount = currentUser.marketingVisits || 0;

            content.innerHTML = ''; // Clear loading

            if (!isAdmin) {
                // --- Panel 1: Worker Visit Registration ---
                const visitsPanel = h('div', { className: 'card p-5 flex-column gap-4' }, [
                    h('div', { className: 'flex items-center gap-2' }, [
                        icon('map-pin', 20, 'text-primary'),
                        h('h2', { className: 'text-lg font-bold' }, 'Registrar Nueva Visita')
                    ]),
                    
                    h('div', { className: 'flex-column items-center justify-center py-4 gap-2 bg-tertiary rounded', style: { border: '1px solid var(--border)' } }, [
                        h('span', { className: 'text-3xl font-bold text-accent' }, `${currentCount} / 10`),
                        h('span', { className: 'text-xs text-muted uppercase tracking-wider font-bold' }, 'Visitas Actuales')
                    ]),

                    h('form', { 
                        className: 'flex-column gap-3 mt-2',
                        onSubmit: async (e) => {
                            e.preventDefault();
                            const btn = e.target.querySelector('button[type="submit"]');
                            btn.disabled = true;
                            btn.innerHTML = 'Registrando...';
                            
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
                                
                                await dbService.add('marketing_visits', visitObj);
                                
                                let newVisitsCount = currentCount + 1;
                                
                                if (newVisitsCount >= 10) {
                                    // Auto-Bill
                                    const bonusAmount = 50000;
                                    let currentInv = await invoiceService.getEmployeeInvoice(currentUser.uid);
                                    if (!currentInv) currentInv = { items: [] };
                                    if (!currentInv.items) currentInv.items = [];
                                    
                                    currentInv.items.push({
                                        id: `item-${Date.now()}`,
                                        type: 'Bono 10 Visitas',
                                        client: 'RConcept',
                                        amount: bonusAmount,
                                        createdAt: new Date().toISOString(),
                                        observations: `Bono generado automáticamente al completar 10 visitas.`
                                    });
                                    currentInv.amount = currentInv.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
                                    
                                    await invoiceService.saveEmployeeInvoice(currentUser.uid, currentInv);
                                    
                                    // Reset visits
                                    await dbService.update('users', currentUser.uid, { marketingVisits: 0 });
                                    alert(`¡Felicidades! Completaste 10 visitas. Se ha autogenerado un cobro de $50.000 COP en tu cuenta.`);
                                } else {
                                    await dbService.update('users', currentUser.uid, { marketingVisits: newVisitsCount });
                                }
                                
                                loadData();
                            } catch (err) {
                                console.error(err);
                                alert("Error al registrar la visita.");
                                btn.disabled = false;
                                btn.innerHTML = 'Registrar Visita';
                            }
                        }
                    }, [
                        h('div', { className: 'form-group' }, [
                            h('label', { className: 'form-label text-xs' }, 'Nombre del Negocio/Local'),
                            h('input', { id: 'v-business', type: 'text', className: 'form-input text-xs', required: true, placeholder: 'Ej. Restaurante La Parrilla' })
                        ]),
                        h('div', { className: 'form-group' }, [
                            h('label', { className: 'form-label text-xs' }, 'Número de Teléfono'),
                            h('input', { id: 'v-phone', type: 'tel', className: 'form-input text-xs', required: true, placeholder: '+57 300 000 0000' })
                        ]),
                        h('div', { className: 'form-group' }, [
                            h('label', { className: 'form-label text-xs' }, 'Fecha de la Visita'),
                            h('input', { id: 'v-date', type: 'date', className: 'form-input text-xs', required: true, value: new Date().toISOString().split('T')[0] })
                        ]),
                        h('button', { type: 'submit', className: 'btn btn-primary w-full justify-center mt-2' }, 'Registrar Visita')
                    ])
                ]);
                
                // --- Panel 2: Historial (Worker) ---
                const historyPanel = h('div', { className: 'card p-5 flex-column gap-4' }, [
                    h('div', { className: 'flex items-center gap-2' }, [
                        icon('history', 20, 'text-primary'),
                        h('h2', { className: 'text-lg font-bold' }, 'Mis Visitas Recientes')
                    ]),
                    myVisits.length === 0 
                        ? h('div', { className: 'text-center text-xs text-muted p-4' }, 'No has registrado visitas aún.')
                        : h('div', { className: 'flex-column gap-2' }, myVisits.slice(0, 5).map(v => 
                            h('div', { className: 'flex justify-between items-center p-3 bg-tertiary rounded', style: { border: '1px solid var(--border)' } }, [
                                h('div', { className: 'flex-column' }, [
                                    h('span', { className: 'font-bold text-xs text-primary' }, v.businessName),
                                    h('span', { className: 'text-xs text-muted' }, v.phone)
                                ]),
                                h('span', { className: 'badge badge-secondary text-xs' }, v.date)
                            ])
                        ))
                ]);

                content.appendChild(visitsPanel);
                content.appendChild(historyPanel);
            } else {
                // --- Panel Admin: Ver todas las visitas ---
                const adminPanel = h('div', { className: 'card p-5 flex-column gap-4' }, [
                    h('div', { className: 'flex items-center gap-2 mb-2' }, [
                        icon('globe', 20, 'text-primary'),
                        h('h2', { className: 'text-lg font-bold' }, 'Monitor de Visitas Global')
                    ]),
                    visitsList.length === 0 
                        ? h('div', { className: 'text-center text-xs text-muted p-4' }, 'No hay visitas registradas por el equipo.')
                        : h('div', { className: 'table-container' }, [
                            h('table', { style: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' } }, [
                                h('thead', { style: { background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' } }, h('tr', {}, [
                                    h('th', { style: { padding: '10px' } }, 'Trabajador'),
                                    h('th', { style: { padding: '10px' } }, 'Negocio Visitado'),
                                    h('th', { style: { padding: '10px' } }, 'Teléfono'),
                                    h('th', { style: { padding: '10px' } }, 'Fecha')
                                ])),
                                h('tbody', {}, visitsList.sort((a,b) => new Date(b.date) - new Date(a.date)).map(v => 
                                    h('tr', { style: { borderBottom: '1px solid var(--border)' } }, [
                                        h('td', { style: { padding: '10px' }, className: 'font-bold' }, v.employeeName),
                                        h('td', { style: { padding: '10px' } }, v.businessName),
                                        h('td', { style: { padding: '10px' } }, h('a', { href: `https://wa.me/${v.phone.replace(/[^0-9]/g,'')}`, target: '_blank', className: 'text-accent hover-underline' }, v.phone)),
                                        h('td', { style: { padding: '10px' }, className: 'text-muted' }, v.date)
                                    ])
                                ))
                            ])
                        ])
                ]);
                content.appendChild(adminPanel);
            }

            if (window.lucide) window.lucide.createIcons();

        } catch (err) {
            console.error("Error loading marketing data:", err);
            content.innerHTML = '<div class="text-danger p-4">Error al cargar datos. Revisa tu conexión.</div>';
        }
    };

    loadData();

    return container;
};
