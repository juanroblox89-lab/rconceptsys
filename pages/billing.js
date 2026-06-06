/**
 * Billing Page - Creative Production OS
 * Premium Stripe-style billing portal featuring personal billing timelines
 * and admin side-by-side discrepancy audit screens.
 */
import { h, icon } from '../utils/dom.js';
import { store } from '../js/store.js';
import { invoiceService } from '../services/invoiceService.js';
import { userService } from '../services/userService.js';
import { dbService } from '../firebase/service.js';
import { assignmentService } from '../services/assignmentService.js';

export const render = () => {
    const { user } = store.getState();
    const isAdmin = user?.role === 'admin';

    const container = h('div', { className: 'fade-in flex-column gap-6 w-full' });
    
    let approvedUsers = [];
    let empInvoices = [];
    let admInvoices = [];
    let allAssignments = [];
    let selectedUserId = null;
    let auditComparisonMode = false;

    const loadAndRender = async () => {
        container.innerHTML = '<div class="loader mb-4"></div>';
        try {
            const [users, empInvs, admInvs, assignments] = await Promise.all([
                userService.getAllUsers(),
                invoiceService.getAllInvoices('invoices'),
                invoiceService.getAllInvoices('admin_invoices'),
                assignmentService.getAllAssignments()
            ]);

            approvedUsers = users.filter(u => u.approved && u.role !== 'admin');
            empInvoices = empInvs || [];
            admInvoices = admInvs || [];
            allAssignments = assignments || [];

            if (!selectedUserId && approvedUsers.length > 0) {
                selectedUserId = approvedUsers[0].uid;
            }

            drawDOM();
        } catch (err) {
            console.error(err);
            container.innerHTML = `<div class="p-10 text-center text-error">${err.message}</div>`;
        }
    };

    const drawDOM = () => {
        container.innerHTML = '';

        if (isAdmin) {
            // ==========================================
            // ADMIN VIEW: STRIPE AUDIT DASHBOARD
            // ==========================================
            const header = h('div', { className: 'flex justify-between items-end border-bottom pb-4' }, [
                h('div', {}, [
                    h('h1', { className: 'text-xl font-bold text-primary m-0' }, 'Panel de Auditoría y Pagos'),
                    h('p', { className: 'text-xs text-muted mt-1' }, 'Verifica discrepancias de facturación entre el reporte de empleados y el cálculo oficial de la agencia.')
                ]),
                h('button', { 
                    className: 'btn btn-outline text-xs',
                    onClick: () => invoiceService.exportToCsv([...empInvoices, ...admInvoices], 'Auditoría_Pagos')
                }, [icon('file-spreadsheet', 14), h('span', {}, 'Exportar Excel')])
            ]);

            // Auditoría Cards Grid
            const auditGrid = h('div', { className: 'grid gap-4 mb-4', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' } }, 
                approvedUsers.map(member => {
                    const empInv = empInvoices.find(i => i.employeeId === member.uid) || { amount: 0, items: [] };
                    const admInv = admInvoices.find(i => i.employeeId === member.uid) || { amount: 0, items: [] };

                    const empTotal = empInv.amount || empInv.items?.reduce((s, i) => s + Number(i.amount), 0) || 0;
                    const admTotal = admInv.amount || admInv.items?.reduce((s, i) => s + Number(i.amount), 0) || 0;
                    const diff = Math.abs(empTotal - admTotal);

                    const hasDiscrepancy = diff > 0;

                    return h('div', { 
                        className: 'card p-4 flex-column gap-3 relative overflow-hidden',
                        style: { 
                            borderLeft: `4px solid ${hasDiscrepancy ? 'var(--warning)' : 'var(--success)'}`,
                            background: 'var(--bg-secondary)'
                        }
                    }, [
                        h('div', { className: 'flex justify-between items-start' }, [
                            h('div', {}, [
                                h('h3', { className: 'text-xs font-bold text-primary m-0' }, member.nombre || member.email),
                                h('span', { className: 'text-[10px] text-muted' }, member.role || 'Colaborador')
                            ]),
                            hasDiscrepancy 
                                ? h('span', { className: 'badge badge-warning text-[10px]' }, 'Diferencia')
                                : h('span', { className: 'badge badge-success text-[10px]' }, 'Verificado')
                        ]),

                        h('div', { className: 'grid gap-2 text-xs', style: { gridTemplateColumns: '1fr 1fr' } }, [
                            h('div', {}, [
                                h('span', { className: 'text-[9px] text-muted block' }, 'Factura Personal'),
                                h('span', { className: 'font-mono font-bold' }, `$${empTotal.toLocaleString()}`)
                            ]),
                            h('div', {}, [
                                h('span', { className: 'text-[9px] text-muted block' }, 'Factura Admin'),
                                h('span', { className: 'font-mono font-bold text-accent' }, `$${admTotal.toLocaleString()}`)
                            ])
                        ]),

                        h('div', { className: 'border-top pt-2 flex justify-between items-center' }, [
                            h('span', { className: 'text-[10px] font-bold text-warning' }, `Diferencia: $${diff.toLocaleString()}`),
                            h('button', { 
                                className: 'btn btn-outline text-[10px] py-1 px-3',
                                onClick: () => {
                                    selectedUserId = member.uid;
                                    auditComparisonMode = true;
                                    drawDOM();
                                }
                            }, 'Comparar')
                        ])
                    ]);
                })
            );

            container.appendChild(header);
            container.appendChild(auditGrid);

            // Audit Comparison Panel (Side-by-side Sheet comparison)
            if (auditComparisonMode && selectedUserId) {
                const targetUser = approvedUsers.find(u => u.uid === selectedUserId);
                const empInv = empInvoices.find(i => i.employeeId === selectedUserId) || { items: [] };
                const admInv = admInvoices.find(i => i.employeeId === selectedUserId) || { items: [] };

                const comparisonPanel = h('div', { className: 'premium-info-section flex-column gap-4 mt-2' }, [
                    h('div', { className: 'flex justify-between items-center border-bottom pb-2' }, [
                        h('h3', { className: 'text-sm font-bold text-primary flex items-center gap-2 m-0' }, [
                            icon('git-compare', 16),
                            h('span', {}, `Comparación de Hojas: ${targetUser.nombre || targetUser.email}`)
                        ]),
                        h('button', { 
                            className: 'btn btn-outline text-xs', 
                            onClick: () => { auditComparisonMode = false; drawDOM(); }
                        }, 'Cerrar Comparación')
                    ]),

                    h('div', { className: 'grid gap-4', style: { gridTemplateColumns: '1fr 1fr' } }, [
                        // Left Sheet: Employee reported
                        h('div', { className: 'premium-info-section flex-column gap-3 bg-tertiary' }, [
                            h('h4', { className: 'text-xs font-bold text-muted uppercase tracking-wider border-bottom pb-1' }, 'Reporte de Empleado'),
                            h('div', { className: 'flex-column gap-2' }, 
                                (empInv.items || []).map(item => h('div', { className: 'flex justify-between items-center p-2 rounded bg-secondary text-xs' }, [
                                    h('div', {}, [
                                        h('span', { className: 'font-bold text-primary block' }, item.type),
                                        h('span', { className: 'text-[10px] text-muted' }, `${item.client} • ${item.observations || 'Sin obs'}`)
                                    ]),
                                    h('span', { className: 'font-bold font-mono text-primary' }, `$${(item.amount || 0).toLocaleString()}`)
                                ]))
                            )
                        ]),

                        // Right Sheet: Admin calculated
                        h('div', { className: 'premium-info-section flex-column gap-3 bg-tertiary' }, [
                            h('h4', { className: 'text-xs font-bold text-muted uppercase tracking-wider border-bottom pb-1' }, 'Cálculo Oficial Admin'),
                            h('div', { className: 'flex-column gap-2' }, 
                                (admInv.items || []).map(item => h('div', { className: 'flex justify-between items-center p-2 rounded bg-secondary text-xs' }, [
                                    h('div', {}, [
                                        h('span', { className: 'font-bold text-accent block' }, item.type),
                                        h('span', { className: 'text-[10px] text-muted' }, `${item.client} • ${item.observations || 'Sin obs'}`)
                                    ]),
                                    h('span', { className: 'font-bold font-mono text-accent' }, `$${(item.amount || 0).toLocaleString()}`)
                                ]))
                            ),

                            // Admin Actions
                            h('div', { className: 'border-top pt-3 flex justify-between' }, [
                                h('button', {
                                    className: 'btn btn-outline text-xs',
                                    onClick: async () => {
                                        // Quick match admin total to employee reported total to reconcile
                                        const empTotal = empInv.items?.reduce((s, i) => s + Number(i.amount), 0) || 0;
                                        await invoiceService.saveAdminInvoice(selectedUserId, {
                                            employeeName: targetUser.nombre || targetUser.email,
                                            amount: empTotal,
                                            items: empInv.items || [],
                                            status: 'Reconciliado',
                                            updatedAt: new Date().toISOString()
                                        });
                                        alert("Facturas conciliadas.");
                                        loadAndRender();
                                    }
                                }, 'Aprobar Reporte Empleado'),

                                h('button', {
                                    className: 'btn btn-primary text-xs',
                                    style: { background: 'var(--success)', borderColor: 'var(--success)' },
                                    onClick: async () => {
                                        // Mark officially approved
                                        await dbService.update('admin_invoices', admInv.id, { status: 'Pagado' });
                                        alert("Marcar pago exitoso.");
                                        loadAndRender();
                                    }
                                }, 'Marcar Pago Realizado')
                            ])
                        ])
                    ])
                ]);

                container.appendChild(comparisonPanel);
            }

        } else {
            // ==========================================
            // EMPLOYEE VIEW: PERSONAL INVOICE (STRIPE STYLE)
            // ==========================================
            const myEmpInv = empInvoices.find(i => i.employeeId === user.uid) || { amount: 0, items: [] };
            const myAdmInv = admInvoices.find(i => i.employeeId === user.uid) || { amount: 0, items: [] };

            const empTotal = myEmpInv.amount || myEmpInv.items?.reduce((s, i) => s + Number(i.amount), 0) || 0;
            const admTotal = myAdmInv.amount || myAdmInv.items?.reduce((s, i) => s + Number(i.amount), 0) || 0;

            const header = h('div', { className: 'flex justify-between items-end border-bottom pb-4' }, [
                h('div', {}, [
                    h('h1', { className: 'text-xl font-bold text-primary m-0' }, 'Mi Factura Personal'),
                    h('p', { className: 'text-xs text-muted mt-1' }, 'Resumen acumulado del mes actual y liquidación de video-entregas.')
                ]),
                h('button', { 
                    className: 'btn btn-outline text-xs',
                    onClick: () => invoiceService.exportToCsv([myEmpInv], 'Mi_Factura')
                }, [icon('file-spreadsheet', 14), h('span', {}, 'Exportar Excel')])
            ]);

            // Big metrics widget
            const metrics = h('div', { className: 'grid gap-4 w-full', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' } }, [
                h('div', { className: 'premium-info-section text-center p-4' }, [
                    h('span', { className: 'text-[10px] text-muted uppercase font-bold block mb-1' }, 'Monto Reportado por Ti'),
                    h('span', { className: 'intel-stat-large text-primary block' }, `$${empTotal.toLocaleString()}`),
                    h('span', { className: 'text-[9px] text-muted' }, 'Mes actual')
                ]),
                h('div', { className: 'premium-info-section text-center p-4' }, [
                    h('span', { className: 'text-[10px] text-muted uppercase font-bold block mb-1' }, 'Monto Autorizado por Admin'),
                    h('span', { className: 'intel-stat-large text-accent block' }, `$${admTotal.toLocaleString()}`),
                    h('span', { className: 'text-[9px] text-muted' }, 'Base conciliada')
                ])
            ]);

            // video-by-video timeline list
            const timeline = h('div', { className: 'premium-info-section flex-column gap-3 mt-4' }, [
                h('h3', { className: 'text-xs font-bold text-muted uppercase m-0 border-bottom pb-2' }, 'Detalle de Cobros Item por Item'),
                
                h('div', { className: 'flex-column gap-2 mt-1' }, 
                    (myEmpInv.items || []).map(item => h('div', { className: 'flex justify-between items-center p-3 rounded bg-secondary border text-xs', style: { borderColor: 'rgba(255,255,255,0.05)' } }, [
                        h('div', { className: 'flex-column gap-0.5' }, [
                            h('span', { className: 'font-bold text-primary' }, item.type),
                            h('span', { className: 'text-muted text-[10px]' }, `${item.client} • ${item.observations || 'Sin observaciones.'}`),
                            h('span', { className: 'text-muted text-[9px]' }, item.createdAt ? new Date(item.createdAt).toLocaleDateString() : new Date().toLocaleDateString())
                        ]),
                        h('span', { className: 'font-bold font-mono text-primary' }, `$${(item.amount || 0).toLocaleString()}`)
                    ]))
                )
            ]);

            container.appendChild(header);
            container.appendChild(metrics);
            container.appendChild(timeline);
        }

        if (window.lucide) window.lucide.createIcons();
    };

    loadAndRender();
    return container;
};
