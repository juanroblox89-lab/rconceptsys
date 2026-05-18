/**
 * Billing Page - Creative Production OS
 * Minimalist Notion Light UI presenting unified single-invoice management per approved user.
 */
import { h, icon } from '../utils/dom.js';
import { Table } from '../components/ui/Table.js';
import { store } from '../js/store.js';
import { invoiceService } from '../services/invoiceService.js';
import { userService } from '../services/userService.js';
import { dbService } from '../firebase/service.js';

export const render = () => {
    const { user } = store.getState();
    const isAdmin = user?.role === 'admin';

    const container = h('div', { className: 'fade-in flex-column gap-4' });
    let clientsList = [];

    const loadAndRender = async () => {
        container.innerHTML = '<div class="loader mb-4"></div>';

        try {
            try {
                clientsList = await dbService.getAll('clients');
            } catch (cErr) {
                console.warn("Error loading clients for billing:", cErr);
            }
            if (isAdmin) {
                // Admin Flow: Fetch approved team members and their invoices
                const allUsers = await userService.getAllUsers();
                const approvedUsers = allUsers.filter(u => u.approved && u.role !== 'admin');

                // Pre-fetch all employee & admin invoices in parallel
                const [empInvoices, admInvoices] = await Promise.all([
                    invoiceService.getAllInvoices('invoices'),
                    invoiceService.getAllInvoices('admin_invoices')
                ]);

                container.innerHTML = '';

                // Header
                const header = h('div', { className: 'content-header flex justify-between items-center w-full mb-4', style: { paddingBottom: '1rem' } }, [
                    h('div', {}, [
                        h('h1', { style: { fontSize: '1.4rem' } }, 'Pagos Pendientes: Auditoría de Equipo'),
                        h('p', { className: 'text-xs text-muted mt-1' }, 'Gestión de cobro simplificada. Un reporte consolidado por cada miembro aprobado de la agencia.')
                    ]),
                    h('div', { className: 'flex gap-2 items-center flex-wrap' }, [
                        h('button', { 
                            className: 'btn btn-outline text-xs', 
                            title: 'Exportar Facturas Consolidadas Admin',
                            onClick: () => invoiceService.exportToCsv(admInvoices, '') 
                        }, [icon('file-spreadsheet', 14), h('span', {}, 'Exportar CSV')])
                    ])
                ]);

                // Invoices Table
                const invoicesTable = Table({
                    headers: ['Miembro del Equipo', 'Servicio', 'Cliente / Proyecto', 'Monto Reportado', 'Monto Admin', 'Diferencia', 'Estado', 'Acciones'],
                    data: approvedUsers,
                    renderRow: (teamMember) => {
                        const tr = h('tr', { key: teamMember.uid });
                        
                        // Find matching invoices
                        const empInv = empInvoices.find(i => i.employeeId === teamMember.uid) || { amount: 0, client: 'Sin Reportar', type: 'Sin Reportar' };
                        const admInv = admInvoices.find(i => i.employeeId === teamMember.uid) || { amount: 0, client: 'General', type: 'Factura Consolidada', status: 'Pendiente' };

                        const isMatch = empInv.amount === admInv.amount && empInv.amount > 0;
                        const hasDifference = empInv.amount !== admInv.amount && empInv.amount > 0;

                        const avatar = teamMember.photoURL
                            ? h('img', { src: teamMember.photoURL, style: { width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0 } })
                            : h('div', {
                                style: {
                                    width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                                    background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', fontWeight: 700, fontSize: '0.6rem', color: 'var(--text-secondary)'
                                }
                            }, (teamMember.nombre || teamMember.email || 'US').slice(0, 2).toUpperCase());

                        // Member cell
                        tr.appendChild(h('td', {}, [
                            h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
                                avatar,
                                h('div', {}, [
                                    h('div', { className: 'font-bold text-xs' }, teamMember.nombre || 'Miembro'),
                                    h('div', { className: 'text-xs text-muted', style: { fontSize: '0.65rem' } }, teamMember.role || 'Colaborador')
                                    
                                ])
                            ])
                        ]));

                        tr.appendChild(h('td', { className: 'text-xs' }, admInv.type || 'Consolidado'));
                        tr.appendChild(h('td', { className: 'text-xs' }, admInv.client || 'Sin asignar'));
                        tr.appendChild(h('td', { className: 'text-xs font-bold' }, `COP ${empInv.amount.toLocaleString()}`));
                        tr.appendChild(h('td', { className: 'text-xs font-bold text-primary' }, `COP ${admInv.amount.toLocaleString()}`));
                        
                        // Dynamic comparison cell
                        tr.appendChild(h('td', {}, [
                            isMatch ? h('span', { className: 'badge badge-success text-xs', style: { fontSize: '0.65rem' } }, 'Coincide ✓') :
                            hasDifference ? h('span', { className: 'badge badge-error text-xs', style: { fontSize: '0.65rem' } }, 'Diferencia ⚠️') :
                            h('span', { className: 'badge badge-secondary text-xs', style: { fontSize: '0.65rem' } }, 'Sin Reportar')
                        ]));

                        tr.appendChild(h('td', {}, [
                            h('span', { className: `badge badge-${admInv.status === 'Aprobado' ? 'success' : 'warning'} text-xs` }, admInv.status)
                        ]));

                        // Actions
                        tr.appendChild(h('td', { className: 'flex gap-1' }, [
                            h('button', { 
                                className: 'btn btn-primary text-xs', 
                                style: { padding: '4px 8px' },
                                onClick: () => openAdminManageModal(teamMember, admInv) 
                            }, 'Gestionar Admin'),
                            empInv.amount > 0 ? h('button', { 
                                className: 'btn btn-outline text-xs', 
                                style: { padding: '4px 8px' },
                                onClick: () => openEmployeeReportViewModal(teamMember, empInv) 
                            }, 'Ver Reporte') : null
                        ]));

                        return tr;
                    }
                });

                const disclaimerPanel = h('div', { className: 'p-4 mt-2 bg-tertiary border-radius-md text-xs text-muted flex items-center gap-2', style: { borderRadius: '6px', border: '1px solid var(--border)' } }, [
                    icon('info', 16),
                    h('span', {}, 'Aviso Operativo: Este panel gestiona exclusivamente el control de entregas de empleados y costos unitarios por pieza. Los ingresos globales y rentabilidad contable empresarial se manejan de forma externa.')
                ]);

                container.appendChild(header);
                container.appendChild(h('div', { className: 'card p-0 w-full mb-4' }, [invoicesTable]));
                container.appendChild(disclaimerPanel);

            } else {
                // Employee Flow: View my reported invoice and admin consolidated invoice
                const [empInv, admInv] = await Promise.all([
                    invoiceService.getEmployeeInvoice(user.uid),
                    invoiceService.getAdminInvoice(user.uid)
                ]);

                container.innerHTML = '';

                // Header
                const header = h('div', { className: 'content-header flex justify-between items-center w-full mb-4', style: { paddingBottom: '1rem' } }, [
                    h('div', {}, [
                        h('h1', { style: { fontSize: '1.4rem' } }, 'Mi Facturación Operativa'),
                        h('p', { className: 'text-xs text-muted mt-1' }, 'Reporta tus honorarios mensuales y compara tus totales con la factura del Administrador.')
                    ]),
                    h('div', { className: 'flex gap-2' }, [
                        h('button', { 
                            className: 'btn btn-primary text-xs',
                            onClick: () => openEmployeeInvoiceFormModal(empInv) 
                        }, [icon(empInv ? 'edit' : 'plus', 14), h('span', {}, empInv ? 'Modificar Mi Reporte' : 'Reportar Trabajo')])
                    ])
                ]);

                if (!empInv) {
                    const emptyState = h('div', { className: 'text-center p-20 card flex-column items-center justify-center gap-4' }, [
                        icon('wallet', 40, 'text-muted mb-2'),
                        h('h3', { className: 'text-md font-bold' }, 'Sin Reportes Este Mes'),
                        h('p', { className: 'text-xs text-muted max-w-xs' }, 'No has reportado ningún trabajo o monto de honorarios en este ciclo operativo aún.'),
                        h('button', { 
                            className: 'btn btn-primary text-xs mt-2',
                            onClick: () => openEmployeeInvoiceFormModal(null) 
                        }, [icon('plus', 14), h('span', {}, 'Reportar Trabajo')])
                    ]);
                    container.appendChild(header);
                    container.appendChild(emptyState);
                    if (window.lucide) window.lucide.createIcons();
                    return;
                }

                // Invoices overview cards grid
                const totalsMatch = admInv && empInv.amount === admInv.amount;
                
                const cardsGrid = h('div', { className: 'grid gap-4 w-full flex-wrap', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' } }, [
                    // Employee's Invoice Card
                    h('div', { className: 'card p-6 flex-column gap-3 bg-secondary' }, [
                        h('div', { className: 'flex justify-between items-start' }, [
                            h('div', {}, [
                                h('span', { className: 'badge badge-info text-xs mb-1' }, 'TU REPORTE ENTREGADO'),
                                h('h3', { className: 'text-sm font-bold mt-1' }, empInv.type)
                            ]),
                            h('span', { className: `badge badge-${empInv.status === 'Aprobado' ? 'success' : 'warning'} text-xs` }, empInv.status)
                        ]),
                        h('div', { className: 'text-xs' }, [h('strong', {}, 'Cliente / Proyecto: '), h('span', {}, empInv.client)]),
                        h('div', { className: 'text-xs' }, [h('strong', {}, 'Fecha de Envío: '), h('span', {}, new Date(empInv.createdAt).toLocaleDateString())]),
                        h('div', { className: 'text-sm font-bold text-accent mt-2' }, `COP ${empInv.amount.toLocaleString()}`),
                        h('div', { className: 'text-xs text-muted mt-2 border-top pt-2' }, [
                            h('strong', {}, 'Detalle del Reporte:'),
                            h('p', { className: 'mt-1 leading-normal' }, empInv.observations || 'Sin observaciones.')
                        ])
                    ]),

                    // Match Check Card
                    h('div', { className: 'card p-6 flex-column justify-between gap-4' }, [
                        h('div', { className: 'flex-column gap-2' }, [
                            h('span', { className: 'text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-1 border-bottom pb-2' }, [
                                icon('shield-check', 14, 'text-primary'),
                                h('span', {}, 'Comprobación de Totales')
                            ]),
                            h('p', { className: 'text-xs leading-relaxed text-secondary mt-1' }, 
                                'Tu reporte es validado mensualmente por el Administrador. Puedes comparar tu total reportado contra el consolidado del Admin haciendo clic en el botón de abajo.'
                            ),
                            admInv ? h('div', { className: 'p-3 rounded mt-2 border text-xs', style: { background: totalsMatch ? 'rgba(34, 197, 94, 0.08)' : 'rgba(234, 179, 8, 0.08)', borderColor: totalsMatch ? 'var(--success)' : 'var(--warning)' } }, [
                                totalsMatch ? h('div', { className: 'flex items-center gap-2 text-success font-semibold' }, [
                                    icon('check-circle', 14),
                                    h('span', {}, '¡Coincide 100% con la Factura Admin!')
                                ]) : h('div', { className: 'flex items-center gap-2 text-warning font-semibold' }, [
                                    icon('alert-triangle', 14),
                                    h('span', {}, 'Diferencia detectada en el total.')
                                ])
                            ]) : h('div', { className: 'p-3 bg-tertiary rounded text-xs text-muted mt-2 text-center' }, 'El Administrador aún no ha cargado tu factura consolidada.')
                        ]),

                        h('button', { 
                            className: 'btn btn-primary text-xs w-full justify-center gap-2 py-3',
                            onClick: () => openViewAdminInvoiceModal(admInv, empInv)
                        }, [icon('eye', 14), h('span', {}, 'Ver Factura de Admin')])
                    ])
                ]);

                container.appendChild(header);
                container.appendChild(cardsGrid);
            }

            if (window.lucide) window.lucide.createIcons();

        } catch (err) {
            console.error("Billing Load Failed:", err);
            container.innerHTML = `<div class="error-state text-sm p-10">${err.message}</div>`;
        }
    };

    // ── MODALS FOR ADMIN ───────────────────────────────────────
    
    // Modal to Manage Admin's Consolidated Invoice for an Employee
    const openAdminManageModal = (teamMember, currentAdmInv) => {
        const overlay = h('div', { className: 'modal-overlay' });
        const hasInv = !!currentAdmInv.amount;

        const submitForm = async (e) => {
            e.preventDefault();
            const typeVal = form.querySelector('#adm-type').value;
            const clientVal = form.querySelector('#adm-client').value.trim();
            const amountVal = Number(form.querySelector('#adm-amount').value);
            const obsVal = form.querySelector('#adm-obs').value.trim();
            const statusVal = form.querySelector('#adm-status').value;

            await invoiceService.saveAdminInvoice(teamMember.uid, {
                employeeName: teamMember.nombre || teamMember.email,
                type: typeVal,
                client: clientVal,
                amount: amountVal,
                observations: obsVal,
                status: statusVal
            });

            document.body.removeChild(overlay);
            loadAndRender();
        };

        const form = h('form', { className: 'modal-container', onSubmit: submitForm }, [
            h('div', { className: 'modal-header' }, [
                h('span', { className: 'modal-title text-sm' }, `Gestionar Factura Admin: ${teamMember.nombre || 'Miembro'}`),
                h('button', { type: 'button', onClick: () => document.body.removeChild(overlay) }, '×')
            ]),
            h('div', { className: 'modal-body flex-column gap-3' }, [
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Tipo de Servicio Especializado'),
                    h('select', { id: 'adm-type', className: 'form-select text-xs' }, [
                        h('option', { value: 'Factura Consolidada', selected: currentAdmInv.type === 'Factura Consolidada' }, 'Factura Consolidada (Edición + Grabación)'),
                        h('option', { value: 'Factura de Edición de Video', selected: currentAdmInv.type === 'Factura de Edición de Video' }, 'Factura de Edición de Video'),
                        h('option', { value: 'Factura de Grabación de Video', selected: currentAdmInv.type === 'Factura de Grabación de Video' }, 'Factura de Grabación de Video')
                    ])
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Cliente / Proyectos Cubiertos'),
                    h('select', { id: 'adm-client', className: 'form-select text-xs' }, [
                        h('option', { value: 'General' }, '🌍 General / Otro'),
                        ...clientsList.map(c => h('option', { value: c.nombre || c.name || c.id, selected: (hasInv ? currentAdmInv.client : 'General') === (c.nombre || c.name || c.id) }, c.nombre || c.name))
                    ])
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Monto Total Autorizado (COP)'),
                    h('input', { id: 'adm-amount', type: 'number', className: 'form-input text-xs font-bold', placeholder: '350000', value: hasInv ? currentAdmInv.amount : '', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Observaciones o Ajuste de Tarifas'),
                    h('textarea', { id: 'adm-obs', className: 'form-textarea text-xs', placeholder: 'Detalles del cálculo de pago, incentivos por retención o justificación...', rows: 3 }, hasInv ? currentAdmInv.observations : '')
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Estado de Factura Admin'),
                    h('select', { id: 'adm-status', className: 'form-select text-xs' }, [
                        h('option', { value: 'Pendiente', selected: currentAdmInv.status === 'Pendiente' }, 'Pendiente (Borrador)'),
                        h('option', { value: 'Aprobado', selected: currentAdmInv.status === 'Aprobado' }, 'Aprobado (Listo para Pago)')
                    ])
                ])
            ]),
            h('div', { className: 'modal-footer' }, [
                h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => document.body.removeChild(overlay) }, 'Cancelar'),
                h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, 'Guardar Factura Admin')
            ])
        ]);

        overlay.appendChild(form);
        document.body.appendChild(overlay);
    };

    // Modal to View Employee's Raw Reported Work Detail
    const openEmployeeReportViewModal = (teamMember, empInv) => {
        const overlay = h('div', { className: 'modal-overlay' });
        const panel = h('div', { className: 'modal-container p-6 flex-column gap-3' }, [
            h('div', { className: 'flex justify-between items-center border-bottom pb-2' }, [
                h('h4', { className: 'font-bold' }, `Reporte de Trabajo: ${teamMember.nombre}`),
                h('span', { className: `badge badge-${empInv.status === 'Aprobado' ? 'success' : 'warning'} text-xs` }, empInv.status)
            ]),
            h('div', { className: 'text-xs' }, [h('strong', {}, 'Tipo de Trabajo: '), h('span', {}, empInv.type)]),
            h('div', { className: 'text-xs' }, [h('strong', {}, 'Cliente: '), h('span', {}, empInv.client)]),
            h('div', { className: 'text-sm font-bold text-accent' }, `Monto Reclamado: COP ${empInv.amount.toLocaleString()}`),
            h('div', { className: 'text-xs mt-2 bg-tertiary p-3 border-radius-sm' }, [
                h('strong', {}, 'Detalle del Empleado:'),
                h('p', { className: 'mt-1 text-muted' }, empInv.observations || 'Sin observaciones.')
            ]),
            h('div', { className: 'flex justify-end gap-2 mt-4 pt-2 border-top' }, [
                h('button', { className: 'btn btn-outline text-xs', onClick: () => document.body.removeChild(overlay) }, 'Cerrar')
            ])
        ]);

        overlay.appendChild(panel);
        document.body.appendChild(overlay);
    };

    // ── MODALS FOR EMPLOYEE ─────────────────────────────────────

    // Modal for Employee to Create/Edit their Reported Invoice
    const openEmployeeInvoiceFormModal = (existingEmpInv) => {
        const overlay = h('div', { className: 'modal-overlay' });
        const isEdit = !!existingEmpInv;

        const submitForm = async (e) => {
            e.preventDefault();
            const typeVal = form.querySelector('#emp-type').value;
            const clientVal = form.querySelector('#emp-client').value.trim();
            const amountVal = Number(form.querySelector('#emp-amount').value);
            const obsVal = form.querySelector('#emp-obs').value.trim();

            await invoiceService.saveEmployeeInvoice(user.uid, {
                employeeName: user.nombre || user.email,
                type: typeVal,
                client: clientVal,
                amount: amountVal,
                observations: obsVal,
                status: 'Pendiente'
            });

            document.body.removeChild(overlay);
            loadAndRender();
        };

        const form = h('form', { className: 'modal-container', onSubmit: submitForm }, [
            h('div', { className: 'modal-header' }, [
                h('span', { className: 'modal-title text-sm' }, isEdit ? 'Editar Mi Reporte de Trabajo' : 'Reportar Mi Trabajo'),
                h('button', { type: 'button', onClick: () => document.body.removeChild(overlay) }, '×')
            ]),
            h('div', { className: 'modal-body flex-column gap-3' }, [
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Servicio Realizado'),
                    h('select', { id: 'emp-type', className: 'form-select text-xs' }, [
                        h('option', { value: 'Factura de Edición de Video', selected: isEdit && existingEmpInv.type === 'Factura de Edición de Video' }, 'Factura de Edición de Video'),
                        h('option', { value: 'Factura de Grabación de Video', selected: isEdit && existingEmpInv.type === 'Factura de Grabación de Video' }, 'Factura de Grabación de Video'),
                        h('option', { value: 'Factura Consolidada', selected: isEdit && existingEmpInv.type === 'Factura Consolidada' }, 'Factura Consolidada (Varios Servicios)')
                    ])
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Cliente / Proyecto'),
                    h('select', { id: 'emp-client', className: 'form-select text-xs' }, [
                        h('option', { value: 'General' }, '🌍 General / Otro'),
                        ...clientsList.map(c => h('option', { value: c.nombre || c.name || c.id, selected: isEdit && existingEmpInv.client === (c.nombre || c.name || c.id) }, c.nombre || c.name))
                    ])
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Monto a Cobrar (COP)'),
                    h('input', { id: 'emp-amount', type: 'number', className: 'form-input text-xs font-bold', placeholder: '150000', value: isEdit ? existingEmpInv.amount : '', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Observaciones y Links de Entregas'),
                    h('textarea', { id: 'emp-obs', className: 'form-textarea text-xs', placeholder: 'Especifica la cantidad de piezas, horas de grabación o links de descarga...', rows: 3 }, isEdit ? existingEmpInv.observations : '')
                ])
            ]),
            h('div', { className: 'modal-footer' }, [
                h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => document.body.removeChild(overlay) }, 'Cancelar'),
                h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, isEdit ? 'Guardar Cambios' : 'Enviar Reporte')
            ])
        ]);

        overlay.appendChild(form);
        document.body.appendChild(overlay);
    };

    // Modal to View Admin's Consolidated Invoice for Employee (Total Check)
    const openViewAdminInvoiceModal = (admInv, empInv) => {
        const overlay = h('div', { className: 'modal-overlay' });
        const hasInv = !!admInv;

        const totalsMatch = hasInv && empInv.amount === admInv.amount;

        const panel = h('div', { className: 'modal-container p-6 flex-column gap-3' }, [
            h('div', { className: 'flex justify-between items-center border-bottom pb-2' }, [
                h('h4', { className: 'font-bold flex items-center gap-1' }, [
                    icon('shield-check', 16, 'text-primary'),
                    h('span', {}, 'Factura Consolidada del Administrador')
                ]),
                h('span', { className: `badge badge-${hasInv && admInv.status === 'Aprobado' ? 'success' : 'warning'} text-xs` }, hasInv ? admInv.status : 'Borrador')
            ]),
            
            hasInv ? h('div', { className: 'flex-column gap-2 text-xs mt-2' }, [
                h('div', {}, [h('strong', {}, 'Tipo de Servicio: '), h('span', {}, admInv.type)]),
                h('div', {}, [h('strong', {}, 'Clientes / Proyectos: '), h('span', {}, admInv.client)]),
                h('div', { className: 'text-md font-bold text-primary mt-2 border-top pt-2 pb-1' }, `Total Autorizado Admin: COP ${admInv.amount.toLocaleString()}`),
                h('div', { className: 'text-xs text-muted mt-2 bg-tertiary p-3 rounded' }, [
                    h('strong', {}, 'Observaciones del Administrador:'),
                    h('p', { className: 'mt-1 leading-normal' }, admInv.observations || 'Sin observaciones adicionales.')
                ]),
                // Direct dynamic matching visual panel
                h('div', { 
                    className: 'p-3 rounded mt-3 text-xs flex items-center gap-3', 
                    style: { 
                        background: totalsMatch ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)', 
                        border: '1px solid',
                        borderColor: totalsMatch ? 'var(--success)' : 'var(--error)' 
                    } 
                }, [
                    icon(totalsMatch ? 'check-circle' : 'alert-octagon', 16, totalsMatch ? 'text-success' : 'text-error'),
                    h('div', { className: totalsMatch ? 'text-success font-semibold' : 'text-error font-semibold' }, [
                        totalsMatch ? h('span', {}, '¡Los totales coinciden perfectamente!') :
                        h('span', {}, `Diferencia detectada. Tú reportaste COP ${empInv.amount.toLocaleString()} pero el Admin autorizó COP ${admInv.amount.toLocaleString()}.`)
                    ])
                ])
            ]) : h('div', { className: 'text-center p-6 text-xs text-muted' }, [
                icon('clock', 24, 'text-muted mb-2'),
                h('p', {}, 'El administrador no ha generado tu factura consolidada en este periodo.')
            ]),

            h('div', { className: 'flex justify-end mt-4 pt-2 border-top' }, [
                h('button', { className: 'btn btn-outline text-xs', onClick: () => document.body.removeChild(overlay) }, 'Cerrar')
            ])
        ]);

        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        if (window.lucide) window.lucide.createIcons();
    };

    loadAndRender();
    return container;
};
