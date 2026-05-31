import { h, icon } from '../utils/dom.js';
import { dbService } from '../firebase/service.js';
import { invoiceService } from '../services/invoiceService.js';
import { store } from '../js/store.js';

export const render = async () => {
    const { user } = store.getState();
    const container = h('div', { className: 'page-container fade-in' });

    // Header
    const header = h('div', { className: 'flex justify-between items-end mb-6 w-full border-bottom pb-4' }, [
        h('div', {}, [
            h('h1', { className: 'text-2xl font-bold flex items-center gap-2' }, [
                icon('trending-up', 24, 'text-accent'),
                h('span', {}, 'Ventas y Marketing')
            ]),
            h('p', { className: 'text-sm text-muted mt-1' }, 'Registra tus visitas y cierra clientes para generar comisiones.')
        ])
    ]);
    container.appendChild(header);

    // Content wrapper
    const content = h('div', { className: 'grid gap-6', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' } });
    container.appendChild(content);

    const loadData = async () => {
        try {
            content.innerHTML = '<div class="text-muted text-sm p-4">Cargando datos...</div>';
            
            // Get current user data for visits
            const users = await dbService.getAll('users');
            const currentUser = users.find(u => u.uid === user.uid) || user;
            const currentVisits = currentUser.marketingVisits || 0;
            
            // Get clients for closing dropdown
            const clients = await dbService.getAll('clients');

            content.innerHTML = ''; // Clear loading

            // --- Panel 1: Visits ---
            const visitsPanel = h('div', { className: 'card p-5 flex-column gap-4' }, [
                h('div', { className: 'flex items-center gap-2' }, [
                    icon('map-pin', 20, 'text-primary'),
                    h('h2', { className: 'text-lg font-bold' }, 'Rastreo de Visitas')
                ]),
                h('p', { className: 'text-xs text-muted' }, 'Registra cada local visitado. Cada 10 visitas ganarás un bono de productividad.'),
                
                h('div', { className: 'flex-column items-center justify-center py-4 gap-2 bg-secondary rounded' }, [
                    h('span', { className: 'text-3xl font-bold text-accent' }, `${currentVisits} / 10`),
                    h('span', { className: 'text-xs text-muted uppercase tracking-wider font-bold' }, 'Visitas Actuales')
                ]),

                h('button', {
                    className: 'btn btn-primary w-full flex items-center justify-center gap-2 mt-2',
                    onClick: async (e) => {
                        const btn = e.currentTarget;
                        btn.disabled = true;
                        try {
                            let newVisits = currentVisits + 1;
                            
                            if (newVisits >= 10) {
                                // Give Bonus!
                                const bonusAmountStr = prompt("¡Felicidades! Llegaste a 10 visitas. Ingresa el monto del bono a cobrar:", "1000");
                                if (bonusAmountStr !== null) {
                                    const bonusAmount = Number(bonusAmountStr.replace(/[^0-9.-]+/g,"")) || 0;
                                    
                                    let currentInv = await invoiceService.getEmployeeInvoice(user.uid);
                                    if (!currentInv) currentInv = { items: [] };
                                    if (!currentInv.items) currentInv.items = [];
                                    
                                    currentInv.items.push({
                                        id: `item-${Date.now()}`,
                                        type: 'Bono Ventas',
                                        client: 'RConcept',
                                        amount: bonusAmount,
                                        createdAt: new Date().toISOString(),
                                        observations: `Bono por 10 visitas de marketing completadas.`
                                    });
                                    currentInv.amount = currentInv.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
                                    
                                    await invoiceService.saveEmployeeInvoice(user.uid, currentInv);
                                    alert("¡Bono agregado a tu factura!");
                                    newVisits = 0; // Reset
                                } else {
                                    // User cancelled the prompt, so don't increment to 10 yet
                                    newVisits = currentVisits;
                                }
                            }
                            
                            // Save user
                            await dbService.update('users', user.uid, { marketingVisits: newVisits });
                            loadData(); // Reload UI
                        } catch (err) {
                            console.error(err);
                            alert("Error al registrar la visita.");
                            btn.disabled = false;
                        }
                    }
                }, [icon('plus', 16), h('span', {}, 'Registrar Visita Local')])
            ]);

            // --- Panel 2: Client Closing ---
            const closingPanel = h('div', { className: 'card p-5 flex-column gap-4' }, [
                h('div', { className: 'flex items-center gap-2' }, [
                    icon('award', 20, 'text-success'),
                    h('h2', { className: 'text-lg font-bold' }, 'Cierre de Clientes')
                ]),
                h('p', { className: 'text-xs text-muted' }, '¿Conseguiste un cliente nuevo? Regístralo aquí para llevarte tu gran comisión de cierre.'),
                
                h('div', { className: 'form-group mt-2' }, [
                    h('label', { className: 'form-label' }, 'Selecciona el Cliente Cerrado'),
                    h('select', { id: 'mkt-client-select', className: 'form-select text-sm' }, [
                        h('option', { value: '' }, '-- Elige un cliente --'),
                        ...clients.map(c => h('option', { value: c.name }, c.name))
                    ])
                ]),

                h('button', {
                    className: 'btn btn-outline w-full flex items-center justify-center gap-2 mt-2',
                    style: { borderColor: 'var(--success)', color: 'var(--success)' },
                    onClick: async (e) => {
                        const select = closingPanel.querySelector('#mkt-client-select');
                        const clientName = select.value;
                        if (!clientName) {
                            alert("Por favor selecciona un cliente de la lista.");
                            return;
                        }
                        
                        const comAmountStr = prompt(`Ingresa el monto de comisión por cerrar a "${clientName}":`, "3000");
                        if (comAmountStr === null) return;
                        const comAmount = Number(comAmountStr.replace(/[^0-9.-]+/g,"")) || 0;
                        
                        const btn = e.currentTarget;
                        btn.disabled = true;
                        
                        try {
                            let currentInv = await invoiceService.getEmployeeInvoice(user.uid);
                            if (!currentInv) currentInv = { items: [] };
                            if (!currentInv.items) currentInv.items = [];
                            
                            currentInv.items.push({
                                id: `item-${Date.now()}`,
                                type: 'Comisión Cierre',
                                client: clientName,
                                amount: comAmount,
                                createdAt: new Date().toISOString(),
                                observations: `Gran Comisión por cierre de cliente: ${clientName}`
                            });
                            currentInv.amount = currentInv.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
                            
                            await invoiceService.saveEmployeeInvoice(user.uid, currentInv);
                            alert("¡Comisión de cierre agregada a tu factura! ¡Buen trabajo!");
                            select.value = '';
                            btn.disabled = false;
                        } catch(err) {
                            console.error(err);
                            alert("Error al guardar la comisión.");
                            btn.disabled = false;
                        }
                    }
                }, [icon('check-circle', 16), h('span', {}, 'Marcar Cliente Cerrado y Cobrar')])
            ]);

            content.appendChild(visitsPanel);
            content.appendChild(closingPanel);

        } catch (err) {
            console.error("Error loading marketing data:", err);
            content.innerHTML = '<div class="text-danger p-4">Error al cargar datos. Revisa tu conexión.</div>';
        }
    };

    loadData();

    return container;
};
