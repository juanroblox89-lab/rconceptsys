/**
 * Billing Page - Creative Production OS
 * Premium, minimal table layout supporting dynamic multi-row charges
 * and expandable admin reconciliation details for agency team members.
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

    const container = h('div', { className: 'fade-in flex-column gap-4 w-full' });
    
    // Global Page State
    let clientsList = [];
    let allUsers = [];
    let approvedUsers = [];
    let empInvoices = [];
    let admInvoices = [];
    let allAssignments = [];
    
    // UI state
    let selectedUserId = null;
    let currentEmpItems = [];
    let currentAdmItems = [];
    let employeeAdmInvoice = null;
    let showAdminInvoicePanel = false; // State to show/hide admin invoice for employee
    let globalBillingConfig = { showAdminInvoiceToWorkers: true };

    // Helper to render the clean Grid Table of charges
    const renderSpreadsheetGrid = ({ title, prefix, isEditable, itemsArray, onSave }) => {
        const totalSum = itemsArray.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);

        return h('div', { 
            className: 'card p-4 flex-column gap-3 mb-4 shadow-sm w-full',
            style: { background: 'var(--bg-secondary)', border: '1px solid var(--border)' }
        }, [
            // Header bar
            h('div', { className: 'flex justify-between items-center border-bottom pb-2 mb-1' }, [
                h('div', {}, [
                    h('h3', { className: 'text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-1.5' }, [
                        icon('file-spreadsheet', 14, 'text-primary'),
                        h('span', {}, title)
                    ]),
                    h('p', { className: 'text-muted mt-1', style: { fontSize: '0.65rem' } }, 
                        isEditable ? 'Gestiona múltiples cobros en tu reporte. Usa los controles para añadir o eliminar filas.' : 'Detalles de la liquidación oficial de cobros.'
                    )
                ]),
                h('span', { className: 'badge text-xs font-mono font-bold' }, `Total: COP ${totalSum.toLocaleString()}`)
            ]),

            // Table Grid Container (Excel-like Horizontal Scrollable Wrapper)
            h('div', { className: 'excel-table-wrapper w-full', style: { overflowX: 'auto', display: 'block', maxWidth: '100%' } }, [
                h('table', { className: 'excel-table', style: { width: '100%', minWidth: '900px' } }, [
                    h('thead', {}, [
                        h('tr', {}, [
                            h('th', { style: { width: '220px' } }, 'Servicio Realizado'),
                            h('th', { style: { width: '200px' } }, 'Cliente / Proyecto'),
                            h('th', { style: { width: '140px' } }, 'Monto (COP)'),
                            h('th', { style: { width: '110px' } }, 'Fecha'),
                            h('th', {}, 'Observaciones y Links de Entrega'),
                            isEditable ? h('th', { style: { width: '50px', textAlign: 'center' } }, '') : null
                        ])
                    ]),
                    h('tbody', {}, itemsArray.length === 0 ? [
                        h('tr', {}, [
                            h('td', { 
                                colSpan: isEditable ? 6 : 5, 
                                className: 'text-center text-muted italic p-6',
                                style: { background: 'var(--bg-tertiary)' }
                            }, 'Sin cobros registrados en esta hoja de liquidación.')
                        ])
                    ] : itemsArray.map((item, idx) => {
                        return h('tr', { key: idx }, [
                            
                            // 1. Service select/input
                            isEditable ? h('td', {}, [
                                h('select', { 
                                    className: 'form-select text-xs w-full',
                                    style: { background: 'var(--bg-tertiary)', borderColor: 'var(--border)' },
                                    onChange: (e) => { item.type = e.target.value; }
                                }, [
                                    h('option', { value: 'Factura de Edición de Video', selected: item.type === 'Factura de Edición de Video' }, 'Factura de Edición de Video'),
                                    h('option', { value: 'Factura de Grabación de Video', selected: item.type === 'Factura de Grabación de Video' }, 'Factura de Grabación de Video'),
                                    h('option', { value: 'Factura Consolidada', selected: item.type === 'Factura Consolidada' }, 'Factura Consolidada')
                                ])
                            ]) : h('td', { style: { color: 'var(--text-primary)' } }, item.type || 'N/A'),

                            // 2. Client select/input
                            isEditable ? h('td', {}, [
                                h('select', { 
                                    className: 'form-select text-xs w-full',
                                    style: { background: 'var(--bg-tertiary)', borderColor: 'var(--border)' },
                                    onChange: (e) => { item.client = e.target.value; }
                                }, [
                                    h('option', { value: 'General' }, '🌍 General / Otro'),
                                    ...clientsList.map(c => h('option', { value: c.nombre || c.name || c.id, selected: item.client === (c.nombre || c.name || c.id) }, c.nombre || c.name))
                                ])
                            ]) : h('td', { style: { color: 'var(--text-primary)' } }, item.client || 'N/A'),

                            // 3. Amount input/text
                            isEditable ? h('td', {}, [
                                h('input', { 
                                    type: 'number',
                                    className: 'form-input text-xs w-full font-bold',
                                    style: { background: 'var(--bg-tertiary)', borderColor: 'var(--border)', color: 'var(--primary)' },
                                    value: item.amount || '',
                                    placeholder: 'Monto',
                                    onInput: (e) => { 
                                        item.amount = Number(e.target.value) || 0; 
                                        const totLabel = container.querySelector('#total-formula-bar');
                                        if (totLabel) {
                                            const newTotal = itemsArray.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
                                            totLabel.textContent = `=SUMA(Renglon_Cobros) | Monto Total de Liquidación: COP ${newTotal.toLocaleString()}`;
                                        }
                                    }
                                })
                            ]) : h('td', { style: { fontWeight: 'bold', color: 'var(--primary)' } }, `COP ${(item.amount || 0).toLocaleString()}`),

                            // 4. Date (Always auto-calculated or stored)
                            h('td', { style: { color: 'var(--text-muted)' } }, 
                                item.createdAt ? new Date(item.createdAt).toLocaleDateString() : new Date().toLocaleDateString()
                            ),

                            // 5. Observations input/text
                            isEditable ? h('td', {}, [
                                h('input', { 
                                    type: 'text',
                                    className: 'form-input text-xs w-full',
                                    style: { background: 'var(--bg-tertiary)', borderColor: 'var(--border)' },
                                    value: item.observations || '',
                                    placeholder: 'Ej: Cantidad de piezas, links de entrega...',
                                    onInput: (e) => { item.observations = e.target.value; }
                                })
                            ]) : h('td', { style: { color: 'var(--text-secondary)' } }, item.observations || 'Sin observaciones.'),

                            // 6. Delete row action
                            isEditable ? h('td', { style: { textAlign: 'center' } }, [
                                h('button', { 
                                    type: 'button',
                                    className: 'btn btn-outline text-xs p-1 hover-bg-tertiary border-radius-sm',
                                    style: { borderColor: 'rgba(239, 68, 68, 0.2)', color: 'var(--error)' },
                                    onClick: () => {
                                        itemsArray.splice(idx, 1);
                                        drawDOM();
                                    }
                                }, [icon('trash', 12)])
                            ]) : null

                        ]);
                    }))
                ])
            ]),

            // Dynamic bottom row formula display
            h('div', { 
                className: 'billing-formula-bar text-xs font-mono w-full'
            }, [
                h('span', { id: 'total-formula-bar', className: 'text-secondary font-bold' }, 
                    `=SUMA(Renglon_Cobros) | Monto Total de Liquidación: COP ${totalSum.toLocaleString()}`
                ),
                isEditable ? h('div', { className: 'flex gap-2' }, [
                    // Add Row Button
                    h('button', {
                        type: 'button',
                        className: 'btn btn-outline text-xs py-1 px-3 flex items-center gap-1 font-bold',
                        onClick: () => {
                            itemsArray.push({
                                type: 'Factura de Edición de Video',
                                client: 'General',
                                amount: 0,
                                observations: '',
                                createdAt: new Date().toISOString()
                            });
                            drawDOM();
                        }
                    }, [icon('plus', 12), h('span', {}, 'Agregar Cobro')]),

                    // Save Spreadsheet Button
                    h('button', {
                        type: 'button',
                        className: 'btn btn-primary text-xs py-1.5 px-4 flex items-center gap-1 font-bold',
                        onClick: () => {
                            if (itemsArray.length === 0) {
                                alert("Por favor agrega al menos un cobro a la hoja de liquidación.");
                                return;
                            }
                            onSave(itemsArray, totalSum);
                        }
                    }, [icon('save', 12), h('span', {}, 'Guardar Cobros')])
                ]) : null
            ])
        ]);
    };

    // Draw the UI content dynamically
    const drawDOM = () => {
        container.innerHTML = '';

        if (isAdmin) {
            // Header
            const header = h('div', { className: 'billing-header w-full' }, [
                h('div', {}, [
                    h('h1', { style: { fontSize: '1.4rem' } }, 'Auditoría de Liquidaciones y Cobros'),
                    h('p', { className: 'text-xs text-muted mt-1' }, 'Estructura de liquidación directa de cobros y facturación administrativa de la agencia.')
                ]),
                h('div', { className: 'flex gap-2 flex-wrap' }, [
                    h('button', { 
                        className: 'btn btn-outline text-xs', 
                        title: 'Exportar todas las facturas a CSV',
                        onClick: () => invoiceService.exportToCsv([...empInvoices, ...admInvoices], '') 
                    }, [icon('file-spreadsheet', 14), h('span', {}, 'Exportar CSV')]),
                    
                    // Toggle Admin Invoice Visibility for Workers
                    h('button', { 
                        className: 'btn btn-outline text-xs', 
                        style: { borderColor: globalBillingConfig.showAdminInvoiceToWorkers ? 'var(--success)' : 'var(--warning)', color: globalBillingConfig.showAdminInvoiceToWorkers ? 'var(--success)' : 'var(--warning)' },
                        title: 'Permitir o denegar a los trabajadores ver la factura consolidada del admin',
                        onClick: async (e) => {
                            const btn = e.currentTarget;
                            btn.disabled = true;
                            const newVal = !globalBillingConfig.showAdminInvoiceToWorkers;
                            try {
                                await dbService.set('system_rules', 'billing', { showAdminInvoiceToWorkers: newVal });
                                globalBillingConfig.showAdminInvoiceToWorkers = newVal;
                                loadAndRender(false);
                            } catch (err) {
                                console.error(err);
                                alert("Error al guardar la configuración. (Revisa tus reglas de Firebase)");
                                btn.disabled = false;
                            }
                        }
                    }, [
                        icon(globalBillingConfig.showAdminInvoiceToWorkers ? 'eye' : 'eye-off', 14), 
                        h('span', {}, globalBillingConfig.showAdminInvoiceToWorkers ? 'Trabajadores: Viendo Facturas' : 'Trabajadores: Ocultas')
                    ]),
                    h('button', { 
                        className: 'btn btn-outline text-xs',
                        style: { borderColor: 'rgba(239,68,68,0.3)', color: 'var(--error)' },
                        title: 'Eliminar TODAS las facturas de empleados y admin para iniciar nuevo ciclo',
                        onClick: async () => {
                            if (!confirm('⚠️ ¿Reiniciar el mes de facturación?\n\nEsto ELIMINARÁ PERMANENTEMENTE todas las facturas de todos los trabajadores (empleado y admin).\n\nEsta acción NO se puede deshacer. ¿Continuar?')) return;
                            if (!confirm('CONFIRMACIÓN FINAL: ¿Estás seguro? Se borrarán todas las liquidaciones.')) return;
                            container.innerHTML = '<div class="loader mb-4"></div>';
                            try {
                                const result = await invoiceService.resetAllInvoices();
                                alert(`Mes reiniciado. Se eliminaron ${result.deleted} facturas.`);
                            } catch (err) {
                                alert(`Error: ${err.message}`);
                            }
                            loadAndRender(true);
                        }
                    }, [icon('refresh-cw', 14), h('span', {}, 'Reiniciar Mes')])
                ])
            ]);

            container.appendChild(header);

            // Two-Column Layout (Flexbox to prevent cutoff on mobile)
            const mainGrid = h('div', { 
                className: 'w-full',
                style: { display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'flex-start' }
            });

            // Left Directory Sidebar
            const userDirectorySidebar = h('div', { 
                className: 'card p-4 flex-column gap-3',
                style: { flex: '1', minWidth: '280px', maxWidth: '350px', background: 'var(--bg-secondary)' }
            }, [
                h('span', { className: 'text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-1 border-bottom pb-2' }, [
                    icon('users', 14, 'text-primary'),
                    h('span', {}, 'Directorio de Miembros')
                ]),
                
                h('div', { className: 'flex-column gap-2 overflow-y-auto', style: { maxHeight: '500px' } }, approvedUsers.map(member => {
                    const isSelected = member.uid === selectedUserId;
                    const empTotal = empInvoices.find(i => i.employeeId === member.uid)?.amount || 0;
                    const admTotal = admInvoices.find(i => i.employeeId === member.uid)?.amount || 0;

                    return h('button', {
                        className: `flex-column p-2 rounded cursor-pointer transition-all w-full text-left`,
                        style: {
                            border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                            background: isSelected ? 'var(--primary)' : 'var(--bg-tertiary)',
                            color: isSelected ? '#fff' : 'var(--text-primary)',
                            borderRadius: '8px',
                            padding: '12px'
                        },
                        onClick: async () => {
                            selectedUserId = member.uid;
                            const userAdmInv = admInvoices.find(i => i.employeeId === member.uid);
                            currentAdmItems = JSON.parse(JSON.stringify(userAdmInv?.items || [
                                {
                                    type: userAdmInv?.type || 'Factura Consolidada',
                                    client: userAdmInv?.client || 'General',
                                    amount: userAdmInv?.amount || 0,
                                    observations: userAdmInv?.observations || '',
                                    createdAt: userAdmInv?.createdAt || new Date().toISOString()
                                }
                            ]));
                            loadAndRender(false);
                        }
                    }, [
                        h('div', { className: 'flex items-center gap-2 mb-1.5' }, [
                            member.photoURL 
                                ? h('img', { src: member.photoURL, style: { width: '24px', height: '24px', borderRadius: '50%', border: isSelected ? '2px solid rgba(255,255,255,0.5)' : 'none' } })
                                : h('div', { 
                                    style: { 
                                        width: '24px', height: '24px', borderRadius: '50%', background: isSelected ? 'rgba(255,255,255,0.2)' : 'var(--bg-secondary)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 'bold' 
                                    } 
                                  }, (member.nombre || member.email).slice(0,2).toUpperCase()),
                            h('span', { className: 'font-bold text-xs flex-1 truncate' }, member.nombre || member.email)
                        ]),
                        h('div', { className: 'flex justify-between items-center', style: { fontSize: '0.65rem', color: isSelected ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)' } }, [
                            h('span', {}, 'Reportado:'),
                            h('span', { className: 'font-bold' }, `COP ${empTotal.toLocaleString()}`)
                        ]),
                        h('div', { className: 'flex justify-between items-center mt-0.5', style: { fontSize: '0.65rem', color: isSelected ? '#fff' : 'var(--primary)' } }, [
                            h('span', {}, 'Admin:'),
                            h('span', { className: 'font-bold' }, `COP ${admTotal.toLocaleString()}`)
                        ])
                    ]);
                }))
            ]);

            // Right Detail Panel
            const portalViewContainer = h('div', { className: 'flex-column gap-3 flex-1', style: { minWidth: '320px', width: '100%' } });

            if (selectedUserId) {
                const selectedUser = approvedUsers.find(u => u.uid === selectedUserId);
                
                if (selectedUser) {
                    // Profile Header Card
                    const userHeader = h('div', { 
                        className: 'card p-4 flex justify-between items-center flex-wrap gap-2 mb-1',
                        style: { background: 'var(--bg-secondary)', borderLeft: '3px solid var(--primary)' }
                    }, [
                        h('div', { className: 'flex items-center gap-3' }, [
                            selectedUser.photoURL
                                ? h('img', { src: selectedUser.photoURL, style: { width: '32px', height: '32px', borderRadius: '50%' } })
                                : h('div', {
                                    style: {
                                        width: '32px', height: '32px', borderRadius: '50%', background: 'var(--bg-tertiary)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'var(--text-secondary)'
                                    }
                                  }, (selectedUser.nombre || selectedUser.email).slice(0, 2).toUpperCase()),
                            h('div', {}, [
                                h('h3', { className: 'text-sm font-bold' }, selectedUser.nombre || selectedUser.email),
                                h('p', { className: 'text-xs text-muted' }, `Rol: ${selectedUser.role || 'Colaborador'} | ID: ${selectedUser.uid.slice(0, 8)}...`)
                            ])
                        ]),
                        h('span', { className: 'badge text-xs font-mono font-bold' }, 'Auditoría en Curso')
                    ]);

                    portalViewContainer.appendChild(userHeader);

                    // Section 1: Active Production tasks
                    const userAsgs = allAssignments.filter(a => a.employeeId === selectedUserId);
                    
                    const assignmentsSection = h('div', { className: 'card p-4 mb-2 flex-column gap-2' }, [
                        h('span', { className: 'text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-1 border-bottom pb-2' }, [
                            icon('clipboard-list', 14, 'text-primary'),
                            h('span', {}, 'Asignaciones de Producción Activas')
                        ]),
                        userAsgs.length === 0 
                            ? h('p', { className: 'text-xs text-muted italic p-2' }, 'Sin tareas de grabación o edición registradas para este miembro actualmente.')
                            : h('div', { className: 'flex-column gap-2 mt-1' }, userAsgs.map(asg => {
                                return h('div', { 
                                    className: 'flex justify-between items-center p-2 rounded', 
                                    style: { background: 'var(--bg-tertiary)', border: '1px solid var(--border)', fontSize: '0.72rem' } 
                                }, [
                                    h('div', {}, [
                                        h('strong', { className: 'text-secondary' }, `[${asg.type}] `),
                                        h('span', { className: 'font-bold' }, asg.title),
                                        h('span', { className: 'text-muted' }, ` - Marca: ${asg.client}`)
                                    ]),
                                    h('span', { className: `badge text-xs font-semibold badge-${asg.status === 'Completado' ? 'success' : asg.status === 'En Producción' ? 'info' : 'warning'}` }, asg.status)
                                ]);
                              }))
                    ]);

                    portalViewContainer.appendChild(assignmentsSection);

                    // Section 2: Employee reported invoice (Excel #1 - Read-Only for Admin)
                    const userEmpInv = empInvoices.find(i => i.employeeId === selectedUserId) || { amount: 0, items: [] };
                    
                    const reportedItems = userEmpInv.items?.length > 0 ? userEmpInv.items : [
                        {
                            type: userEmpInv.type || 'Factura de Edición de Video',
                            client: userEmpInv.client || 'General',
                            amount: userEmpInv.amount || 0,
                            observations: userEmpInv.observations || 'Sin cobros reportados por el empleado.',
                            createdAt: userEmpInv.createdAt || new Date().toISOString()
                        }
                    ];

                    const empGrid = renderSpreadsheetGrid({
                        title: `Reporte de Cobros Presentado por el Colaborador (${selectedUser.nombre || selectedUser.email})`,
                        prefix: 'emp-view',
                        isEditable: false,
                        itemsArray: reportedItems
                    });

                    portalViewContainer.appendChild(empGrid);

                    // Section 3: Admin generated invoice (Excel #2 - Editable for Admin)
                    const admGrid = renderSpreadsheetGrid({
                        title: 'Liquidación Oficial Autorizada por el Administrador (Factura Admin)',
                        prefix: 'adm',
                        isEditable: true,
                        itemsArray: currentAdmItems,
                        onSave: async (savedItems, computedTotal) => {
                            container.innerHTML = '<div class="loader mb-4"></div>';
                            try {
                                await invoiceService.saveAdminInvoice(selectedUserId, {
                                    employeeName: selectedUser.nombre || selectedUser.email,
                                    type: 'Factura Consolidada',
                                    client: savedItems[0]?.client || 'General',
                                    amount: computedTotal,
                                    observations: savedItems[0]?.observations || '',
                                    items: savedItems,
                                    createdAt: new Date().toISOString(),
                                    status: 'Aprobado'
                                });
                                alert("¡Hoja de Liquidación Administrativa guardada con éxito en Firestore!");
                            } catch (e) {
                                alert(`Error al guardar liquidación: ${e.message}`);
                            }
                            loadAndRender(true);
                        }
                    });

                    portalViewContainer.appendChild(admGrid);
                }
            } else {
                portalViewContainer.appendChild(h('div', { className: 'text-center p-20 card text-muted text-xs' }, 'No hay miembros aprobados registrados en el sistema.'));
            }

            mainGrid.appendChild(userDirectorySidebar);
            mainGrid.appendChild(portalViewContainer);
            container.appendChild(mainGrid);

        } else {
            // Employee Flow
            container.innerHTML = '';

            // Header
            const header = h('div', { className: 'content-header flex-column gap-1 w-full mb-3', style: { paddingBottom: '1rem' } }, [
                h('h1', { style: { fontSize: '1.4rem' } }, 'Mi Portal de Liquidaciones de Cobros'),
                h('p', { className: 'text-xs text-muted' }, 'Edita tu hoja de cobros mensual detalladamente y revisa tu factura oficial consolidada por la agencia.')
            ]);

            container.appendChild(header);

            // Section 1: My Production Tasks
            const myAsgs = allAssignments.filter(a => a.employeeId === user.uid);
            
            const tasksSection = h('div', { className: 'card p-4 mb-2 flex-column gap-2' }, [
                h('span', { className: 'text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-1 border-bottom pb-2' }, [
                    icon('clipboard-list', 14, 'text-primary'),
                    h('span', {}, 'Mis Tareas de Producción Activas')
                ]),
                myAsgs.length === 0 
                    ? h('p', { className: 'text-xs text-muted italic p-2' }, 'No tienes tareas activas asignadas en este ciclo.')
                    : h('div', { className: 'flex-column gap-2 mt-1' }, myAsgs.map(asg => {
                        return h('div', { 
                            className: 'flex justify-between items-center p-2 rounded', 
                            style: { background: 'var(--bg-tertiary)', border: '1px solid var(--border)', fontSize: '0.72rem' } 
                        }, [
                            h('div', {}, [
                                h('strong', { className: 'text-secondary' }, `[${asg.type}] `),
                                h('span', { className: 'font-bold' }, asg.title),
                                h('span', { className: 'text-muted' }, ` - Marca: ${asg.client}`)
                            ]),
                            h('span', { className: `badge text-xs font-semibold badge-${asg.status === 'Completado' ? 'success' : asg.status === 'En Producción' ? 'info' : 'warning'}` }, asg.status)
                        ]);
                      }))
            ]);

            container.appendChild(tasksSection);

            // Section 2: Edit my reported invoice (Excel #1 - Editable)
            const myEmpGrid = renderSpreadsheetGrid({
                title: 'Mi Hoja de Reporte de Cobros',
                prefix: 'emp',
                isEditable: true,
                itemsArray: currentEmpItems,
                onSave: async (savedItems, computedTotal) => {
                    container.innerHTML = '<div class="loader mb-4"></div>';
                    try {
                        await invoiceService.saveEmployeeInvoice(user.uid, {
                            employeeName: user.nombre || user.email,
                            type: savedItems[0]?.type || 'Factura de Edición de Video',
                            client: savedItems[0]?.client || 'General',
                            amount: computedTotal,
                            observations: savedItems[0]?.observations || '',
                            items: savedItems,
                            createdAt: new Date().toISOString(),
                            status: 'Pendiente'
                        });
                        alert("¡Tu reporte de cobros ha sido guardado exitosamente!");
                    } catch (e) {
                        alert(`Error al guardar reporte: ${e.message}`);
                    }
                    loadAndRender(true);
                }
            });

            container.appendChild(myEmpGrid);

            // Section 3: Expandable Admin Invoice Section (With Warning Banner)
            if (globalBillingConfig.showAdminInvoiceToWorkers) {
                const toggleButton = h('button', {
                    type: 'button',
                    className: 'btn btn-outline text-xs w-full py-3 justify-center gap-2 mb-2 font-bold transition-all',
                    style: { borderStyle: 'dashed', background: 'var(--bg-secondary)', borderColor: 'var(--border)' },
                    onClick: () => {
                        showAdminInvoicePanel = !showAdminInvoicePanel;
                        drawDOM();
                    }
                }, [
                    icon(showAdminInvoicePanel ? 'eye-off' : 'eye', 14, 'text-primary'),
                    h('span', {}, showAdminInvoicePanel ? 'Ocultar Liquidación Autorizada del Administrador' : '👁️ Ver Factura Consolidada del Administrador')
                ]);

                container.appendChild(toggleButton);

                if (showAdminInvoicePanel) {
                    // Warning Banner explaining standard operational precision rules
                    const warningBanner = h('div', { 
                        className: 'p-4 bg-tertiary rounded flex gap-3 text-xs mb-3 border',
                        style: { background: 'var(--bg-tertiary)', borderColor: 'var(--border)', borderRadius: '8px', lineHeight: '1.5' } 
                    }, [
                        icon('alert-circle', 18, 'text-warning'),
                        h('div', {}, [
                            h('strong', { className: 'text-primary' }, 'Aviso de Conciliación de Pagos: '),
                            h('p', { className: 'text-muted mt-1' }, 
                                'El Administrador registra su factura consolidada de forma periódica para una mayor exactitud en la liquidación. Ten en cuenta que a veces no se actualiza de inmediato. Esta factura consolidada sirve como la base oficial y definitiva para conciliar las horas, entregas y pagos de la agencia al cierre de cada ciclo.'
                            )
                        ])
                    ]);

                    container.appendChild(warningBanner);

                    const admInvData = employeeAdmInvoice || { amount: 0, items: [] };
                    
                    const adminViewItems = admInvData.items?.length > 0 ? admInvData.items : [
                        {
                            type: admInvData.type || 'Factura Consolidada',
                            client: admInvData.client || 'General',
                            amount: admInvData.amount || 0,
                            observations: admInvData.observations || 'El Administrador aún no ha cargado tu liquidación autorizada para este ciclo.',
                            createdAt: admInvData.createdAt || new Date().toISOString()
                        }
                    ];

                    const myAdmGrid = renderSpreadsheetGrid({
                        title: 'Liquidación Oficial Autorizada por la Agencia (Solo Lectura)',
                        prefix: 'adm-view',
                        isEditable: false,
                        itemsArray: adminViewItems
                    });

                    container.appendChild(myAdmGrid);
                }
            } else {
                // If visibility is disabled, show a small badge or nothing
                const disabledBanner = h('div', { 
                    className: 'p-4 bg-tertiary rounded flex items-center justify-center gap-2 text-xs mb-3 border text-muted',
                    style: { background: 'var(--bg-tertiary)', borderColor: 'var(--border)', borderRadius: '8px' } 
                }, [
                    icon('lock', 14),
                    h('span', {}, 'La visualización de la Factura Consolidada del Administrador ha sido bloqueada temporalmente.')
                ]);
                container.appendChild(disabledBanner);
            }
        }

        if (window.lucide) window.lucide.createIcons();
    };

    const loadAndRender = async (fetchFromDb = true) => {
        if (fetchFromDb) {
            container.innerHTML = '<div class="loader mb-4"></div>';
            try {
                // Load global references safely
                let settingsBillingData = null;
                [clientsList, allUsers, allAssignments, settingsBillingData] = await Promise.all([
                    dbService.getAll('clients').catch(() => []),
                    userService.getAllUsers().catch(() => []),
                    assignmentService.getAllAssignments().catch(() => []),
                    dbService.getById('system_rules', 'billing').catch(() => null)
                ]);
                
                if (settingsBillingData) {
                    globalBillingConfig.showAdminInvoiceToWorkers = settingsBillingData.showAdminInvoiceToWorkers !== false;
                }

                if (!isAdmin && user.allowedClients) {
                    clientsList = clientsList.filter(c => user.allowedClients.includes(c.id));
                }

                approvedUsers = allUsers.filter(u => u.approved && u.role !== 'admin');

                if (isAdmin) {
                    [empInvoices, admInvoices] = await Promise.all([
                        invoiceService.getAllInvoices('invoices').catch(() => []),
                        invoiceService.getAllInvoices('admin_invoices').catch(() => [])
                    ]);
                    
                    if (!selectedUserId && approvedUsers.length > 0) {
                        selectedUserId = approvedUsers[0].uid;
                    }
                    
                    if (selectedUserId) {
                        const userAdmInv = admInvoices.find(i => i.employeeId === selectedUserId);
                        currentAdmItems = JSON.parse(JSON.stringify(userAdmInv?.items || [
                            {
                                type: userAdmInv?.type || 'Factura Consolidada',
                                client: userAdmInv?.client || 'General',
                                amount: userAdmInv?.amount || 0,
                                observations: userAdmInv?.observations || '',
                                createdAt: userAdmInv?.createdAt || new Date().toISOString()
                            }
                        ]));
                    }
                } else {
                    const [myEmpInv, myAdmInv] = await Promise.all([
                        invoiceService.getEmployeeInvoice(user.uid).catch(() => null),
                        invoiceService.getAdminInvoice(user.uid).catch(() => null)
                    ]);
                    
                    currentEmpItems = myEmpInv?.items || [
                        {
                            type: myEmpInv?.type || 'Factura de Edición de Video',
                            client: myEmpInv?.client || 'General',
                            amount: myEmpInv?.amount || 0,
                            observations: myEmpInv?.observations || '',
                            createdAt: myEmpInv?.createdAt || new Date().toISOString()
                        }
                    ];
                    employeeAdmInvoice = myAdmInv;
                }
            } catch (err) {
                console.error("Billing Load Failed:", err);
                container.innerHTML = `<div class="error-state text-sm p-10">${err.message.replace(/</g, "&lt;")}</div>`;
                return;
            }
        }

        drawDOM();
    };

    loadAndRender(true);
    return container;
};
