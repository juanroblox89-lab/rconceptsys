/**
 * Billing Page - Creative Production OS
 * Minimalist Notion Light UI supporting double invoice system: Employee vs Admin side-by-side auditing.
 */
import { h, icon } from '../utils/dom.js';
import { Table } from '../components/ui/Table.js';
import { store } from '../js/store.js';
import { invoiceService } from '../services/invoiceService.js';

export const render = () => {
    const { user } = store.getState();
    const isAdmin = user?.role === 'admin';

    const container = h('div', { className: 'fade-in flex-column gap-4' });

    // Stateful render logic supporting dynamic reactivity
    const loadAndRender = async () => {
        container.innerHTML = '<div class="loader mb-4"></div>';

        // Fetch employee invoices according to role scope
        const employeeInvoices = await invoiceService.getEmployeeInvoices(user?.uid || 'viewer', user?.role);

        container.innerHTML = '';

        // 1. Header with exports & modal triggers
        const header = h('div', { className: 'content-header flex justify-between items-center w-full mb-4', style: { paddingBottom: '1rem' } }, [
            h('div', {}, [
                h('h1', { style: { fontSize: '1.4rem' } }, isAdmin ? 'Pagos Pendientes: Auditoría Operativa' : 'Mis Pagos Pendientes'),
                h('p', { className: 'text-xs text-muted mt-1' }, isAdmin ? 'Sistema de comparación de facturas: Reporte Usuario vs Validación Admin' : 'Registro de trabajos realizados y estado de validación para pago.')
            ]),
            h('div', { className: 'flex gap-2 items-center flex-wrap' }, [
                h('button', { 
                    className: 'btn btn-outline text-xs', 
                    title: 'Exportar Facturas de Grabación',
                    onClick: () => invoiceService.exportToCsv(employeeInvoices, 'Grabación') 
                }, [icon('file-spreadsheet', 14), h('span', {}, 'CSV Grabación')]),
                
                h('button', { 
                    className: 'btn btn-outline text-xs', 
                    title: 'Exportar Facturas de Edición',
                    onClick: () => invoiceService.exportToCsv(employeeInvoices, 'Edición') 
                }, [icon('file-spreadsheet', 14), h('span', {}, 'CSV Edición')]),

                h('button', { 
                    className: 'btn btn-primary text-xs',
                    onClick: () => openEmployeeInvoiceModal() 
                }, [icon('plus', 14), h('span', {}, 'Reportar Trabajo')])
            ])
        ]);

        // 2. Operational Invoicing Overview Table
        const invoicesTable = Table({
            headers: isAdmin ? ['ID / Empleado', 'Tipo de Factura', 'Cliente', 'Monto Reportado', 'Estado', 'Auditoría Interna', 'Acciones'] 
                             : ['ID Factura', 'Tipo de Servicio', 'Cliente', 'Precio Configurado', 'Fecha', 'Estado', 'Acciones'],
            data: employeeInvoices,
            renderRow: (item) => {
                const tr = h('tr', { key: item.id });
                
                if (isAdmin) {
                    tr.appendChild(h('td', {}, [
                        h('div', { className: 'font-bold text-xs' }, item.id),
                        h('div', { className: 'text-xs text-muted' }, item.employeeName || item.employeeId)
                    ]));
                    tr.appendChild(h('td', { className: 'text-xs font-semibold' }, item.type));
                    tr.appendChild(h('td', { className: 'text-xs' }, item.client));
                    tr.appendChild(h('td', { className: 'text-xs font-bold' }, `COP ${item.amount.toLocaleString()}`));
                    tr.appendChild(h('td', {}, [
                        h('span', { className: `badge badge-${item.status === 'Aprobado' ? 'success' : 'warning'} text-xs` }, item.status)
                    ]));
                    
                    // Internal check cell
                    const auditTd = h('td', { className: 'text-xs' }, h('span', { className: 'text-muted text-xs' }, 'Cargando...'));
                    invoiceService.getAdminInvoiceForEmployeeInvoice(item.id).then(admInv => {
                        auditTd.innerHTML = '';
                        if (admInv) {
                            auditTd.appendChild(h('span', { className: `badge ${admInv.verificationStatus === 'Coherente' ? 'badge-success' : 'badge-error'} text-xs` }, admInv.verificationStatus));
                        } else {
                            auditTd.appendChild(h('span', { className: 'badge badge-secondary text-xs' }, 'Sin Auditar'));
                        }
                    });
                    tr.appendChild(auditTd);

                    // Actions Side-by-Side compare
                    tr.appendChild(h('td', { className: 'flex gap-1' }, [
                        h('button', { 
                            className: 'btn btn-outline text-xs', 
                            style: { padding: '4px 8px' },
                            onClick: () => openSideBySideComparisonModal(item) 
                        }, 'Comparar Lado a Lado')
                    ]));
                } else {
                    // Employee row layout
                    tr.appendChild(h('td', { className: 'font-bold text-xs' }, item.id));
                    tr.appendChild(h('td', { className: 'text-xs font-medium' }, item.type));
                    tr.appendChild(h('td', { className: 'text-xs' }, item.client));
                    tr.appendChild(h('td', { className: 'text-xs font-bold' }, `COP ${item.amount.toLocaleString()}`));
                    tr.appendChild(h('td', { className: 'text-xs text-muted' }, new Date(item.createdAt).toLocaleDateString()));
                    tr.appendChild(h('td', {}, [
                        h('span', { className: `badge badge-${item.status === 'Aprobado' ? 'success' : 'warning'} text-xs` }, item.status)
                    ]));
                    tr.appendChild(h('td', {}, [
                        h('button', { 
                            className: 'btn btn-outline text-xs',
                            style: { padding: '4px 8px' },
                            onClick: () => openEmployeeInvoiceDetailModal(item)
                        }, 'Ver / Descargar')
                    ]));
                }

                return tr;
            }
        });

        // Informative note fulfilling "NO software contable / no ingresos generales" mandate
        const disclaimerPanel = h('div', { className: 'p-4 mt-2 bg-tertiary border-radius-md text-xs text-muted flex items-center gap-2', style: { borderRadius: '6px', border: '1px solid var(--border)' } }, [
            icon('info', 16),
            h('span', {}, 'Aviso Operativo: Este panel gestiona exclusivamente el control de entregas de empleados y costos unitarios por pieza. Los ingresos globales y rentabilidad contable empresarial se manejan de forma externa.')
        ]);

        container.appendChild(header);
        container.appendChild(h('div', { className: 'card p-0 w-full mb-4' }, [invoicesTable]));
        container.appendChild(disclaimerPanel);
    };

    // Modal logic for reporting employee invoice
    const openEmployeeInvoiceModal = () => {
        const overlay = h('div', { className: 'modal-overlay' });
        
        const submitForm = async (e) => {
            e.preventDefault();
            const typeVal = form.querySelector('#inv-type').value;
            const clientVal = form.querySelector('#inv-client').value;
            const amountVal = form.querySelector('#inv-amount').value;
            const obsVal = form.querySelector('#inv-obs').value;

            if (!amountVal || amountVal <= 0) {
                alert("Por favor ingresa un precio manual configurable mayor a 0.");
                return;
            }

            await invoiceService.saveEmployeeInvoice({
                employeeId: user?.uid || 'viewer',
                employeeName: user?.nombre || user?.email || 'Empleado',
                type: typeVal,
                client: clientVal,
                amount: amountVal,
                observations: obsVal,
                status: isAdmin ? 'Aprobado' : 'Pendiente'
            });

            document.body.removeChild(overlay);
            loadAndRender(); // refresh table smoothly
        };

        const form = h('form', { className: 'modal-container', onSubmit: submitForm }, [
            h('div', { className: 'modal-header' }, [
                h('span', { className: 'modal-title text-sm' }, 'Reportar Factura de Empleado'),
                h('button', { type: 'button', onClick: () => document.body.removeChild(overlay), style: { fontWeight: 'bold' } }, '×')
            ]),
            h('div', { className: 'modal-body' }, [
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Tipo de Factura Permitida'),
                    h('select', { id: 'inv-type', className: 'form-select' }, [
                        h('option', { value: 'Factura de Edición de Video' }, 'Factura de Edición de Video'),
                        h('option', { value: 'Factura de Grabación de Video' }, 'Factura de Grabación de Video')
                    ])
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Cliente / Proyecto Asignado'),
                    h('input', { id: 'inv-client', className: 'form-input', placeholder: 'Ej. Gimnasio Elite', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Precio Manual Editable (COP)'),
                    h('input', { id: 'inv-amount', type: 'number', className: 'form-input', placeholder: '150000', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Observaciones del Empleado / Trabajo Entregado'),
                    h('textarea', { id: 'inv-obs', className: 'form-textarea', placeholder: 'Detalle de horas invertidas, piezas de video entregadas o links de descarga...', required: true })
                ])
            ]),
            h('div', { className: 'modal-footer' }, [
                h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => document.body.removeChild(overlay) }, 'Cancelar'),
                h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, 'Guardar Factura')
            ])
        ]);

        overlay.appendChild(form);
        document.body.appendChild(overlay);
    };

    // Modal logic for Side-by-Side Comparison (Admin Requirement)
    const openSideBySideComparisonModal = async (empInvoice) => {
        const overlay = h('div', { className: 'modal-overlay' });
        const admInvoice = await invoiceService.getAdminInvoiceForEmployeeInvoice(empInvoice.id) || {
            relatedEmployeeInvoice: empInvoice.id,
            adminObservations: '',
            verificationStatus: 'Coherente',
            internalNotes: ''
        };

        const saveComparison = async (e) => {
            e.preventDefault();
            const statusVal = compForm.querySelector('#adm-check-status').value;
            const obsVal = compForm.querySelector('#adm-obs').value;
            const notesVal = compForm.querySelector('#adm-notes').value;

            await invoiceService.saveAdminInvoice({
                ...admInvoice,
                verificationStatus: statusVal,
                adminObservations: obsVal,
                internalNotes: notesVal
            });

            // If coherent, auto approve employee status
            if (statusVal === 'Coherente') {
                empInvoice.status = 'Aprobado';
                await invoiceService.saveEmployeeInvoice(empInvoice);
            }

            document.body.removeChild(overlay);
            loadAndRender();
        };

        const compForm = h('form', { className: 'modal-container', style: { maxWidth: '850px' }, onSubmit: saveComparison }, [
            h('div', { className: 'modal-header' }, [
                h('span', { className: 'modal-title text-sm' }, `Comparación de Facturas Lado a Lado: ${empInvoice.id}`),
                h('button', { type: 'button', onClick: () => document.body.removeChild(overlay), style: { fontWeight: 'bold' } }, '×')
            ]),
            h('div', { className: 'modal-body flex gap-4 flex-wrap', style: { alignItems: 'stretch' } }, [
                // Left Side: Employee Reported Invoice
                h('div', { className: 'flex-1 card bg-secondary p-4 flex-column gap-2', style: { minWidth: '300px' } }, [
                    h('div', { className: 'badge badge-info text-xs self-start' }, 'FACTURA DEL EMPLEADO'),
                    h('div', { className: 'text-xs mt-2' }, [h('strong', {}, 'Empleado: '), h('span', {}, empInvoice.employeeName || empInvoice.employeeId)]),
                    h('div', { className: 'text-xs' }, [h('strong', {}, 'Servicio: '), h('span', {}, empInvoice.type)]),
                    h('div', { className: 'text-xs' }, [h('strong', {}, 'Cliente: '), h('span', {}, empInvoice.client)]),
                    h('div', { className: 'text-sm font-bold mt-1 text-accent' }, `Monto Reportado: COP ${empInvoice.amount.toLocaleString()}`),
                    h('div', { className: 'text-xs text-muted mt-2 border-top pt-2' }, [
                        h('strong', {}, 'Trabajo Reportado:'),
                        h('p', { className: 'mt-1' }, empInvoice.observations || 'Sin observaciones.')
                    ])
                ]),
                // Right Side: Admin Internal Validation Invoice
                h('div', { className: 'flex-1 card p-4 flex-column gap-3', style: { minWidth: '300px', borderLeft: '2px solid var(--border)' } }, [
                    h('div', { className: 'badge badge-warning text-xs self-start' }, 'FACTURA INTERNA DEL ADMIN'),
                    h('div', { className: 'form-group mt-1' }, [
                        h('label', { className: 'form-label' }, 'Estado de Coherencia Operativa'),
                        h('select', { id: 'adm-check-status', className: 'form-select text-xs' }, [
                            h('option', { value: 'Coherente', selected: admInvoice.verificationStatus === 'Coherente' }, 'Coherente (Aprobar Pago)'),
                            h('option', { value: 'Inconsistencia Detectada', selected: admInvoice.verificationStatus === 'Inconsistencia Detectada' }, 'Inconsistencia Detectada (Auditar Entrega)')
                        ])
                    ]),
                    h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label' }, 'Observaciones y Validación de Calidad'),
                        h('textarea', { id: 'adm-obs', className: 'form-textarea text-xs', placeholder: 'Verificación de hooks, retención y archivos entregados...' }, admInvoice.adminObservations)
                    ]),
                    h('div', { className: 'form-group' }, [
                        h('label', { className: 'form-label' }, 'Notas Internas Privadas (Auditoría)'),
                        h('textarea', { id: 'adm-notes', className: 'form-textarea text-xs', placeholder: 'Margen de ganancia o notas operativas de costo unitario...' }, admInvoice.internalNotes)
                    ])
                ])
            ]),
            h('div', { className: 'modal-footer' }, [
                h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => document.body.removeChild(overlay) }, 'Cerrar'),
                h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, 'Validar y Guardar Factura Interna')
            ])
        ]);

        overlay.appendChild(compForm);
        document.body.appendChild(overlay);
    };

    // Detail view for employee
    const openEmployeeInvoiceDetailModal = (inv) => {
        const overlay = h('div', { className: 'modal-overlay' });
        const panel = h('div', { className: 'modal-container p-6 flex-column gap-3' }, [
            h('div', { className: 'flex justify-between items-center border-bottom pb-2' }, [
                h('h4', { className: 'font-bold' }, `Factura de Producción: ${inv.id}`),
                h('span', { className: `badge badge-${inv.status === 'Aprobado' ? 'success' : 'warning'} text-xs` }, inv.status)
            ]),
            h('div', { className: 'text-xs' }, [h('strong', {}, 'Tipo de Pieza: '), h('span', {}, inv.type)]),
            h('div', { className: 'text-xs' }, [h('strong', {}, 'Cliente: '), h('span', {}, inv.client)]),
            h('div', { className: 'text-sm font-bold text-accent' }, `Costo Configurado: COP ${inv.amount.toLocaleString()}`),
            h('div', { className: 'text-xs mt-2 bg-tertiary p-3 border-radius-sm' }, [
                h('strong', {}, 'Observaciones Entregadas:'),
                h('p', { className: 'mt-1 text-muted' }, inv.observations)
            ]),
            h('div', { className: 'flex justify-end gap-2 mt-4 pt-2 border-top' }, [
                h('button', { className: 'btn btn-outline text-xs', onClick: () => document.body.removeChild(overlay) }, 'Cerrar'),
                h('button', { 
                    className: 'btn btn-primary text-xs', 
                    onClick: () => {
                        alert(`Descargando copia local de ${inv.id} como comprobante válido.`);
                        document.body.removeChild(overlay);
                    } 
                }, 'Descargar Copia')
            ])
        ]);

        overlay.appendChild(panel);
        document.body.appendChild(overlay);
    };

    // Hydrate initially
    loadAndRender();

    return container;
};
