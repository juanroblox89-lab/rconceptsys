/**
 * Billing Page - Creative Production OS
 * Realistic Microsoft Excel themed billing portal presenting clean dynamic spreadsheets
 * for employees and administrators with live production task coordination.
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
    
    // Page state
    let clientsList = [];
    let allUsers = [];
    let approvedUsers = [];
    let empInvoices = [];
    let admInvoices = [];
    let allAssignments = [];
    let selectedUserId = null;

    // Excel Spreadsheet Renderer Helper
    const renderExcelSpreadsheet = ({ title, sheetName, prefix, isEditable, data, onSave }) => {
        const totalAmount = Number(data?.amount) || 0;
        
        return h('div', { 
            className: 'excel-sheet card p-0 overflow-hidden mb-4 shadow-sm w-full', 
            style: { 
                border: '1px solid #107c41', 
                borderRadius: '8px', 
                background: 'var(--bg-secondary)',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
            } 
        }, [
            // Excel Green Header Title Bar
            h('div', { 
                className: 'flex justify-between items-center px-4 py-2 text-xs font-bold text-white', 
                style: { background: '#107c41', borderBottom: '1px solid #0d6635' } 
            }, [
                h('div', { className: 'flex items-center gap-2' }, [
                    icon('file-spreadsheet', 14),
                    h('span', {}, title)
                ]),
                h('span', { 
                    className: 'text-xs px-2 py-0.5 rounded font-mono', 
                    style: { background: '#0d6635', color: '#a3e635', border: '1px solid rgba(255,255,255,0.2)' } 
                }, sheetName)
            ]),
            
            // Excel Mock Ribbon
            h('div', { 
                className: 'flex items-center px-3 py-1 bg-tertiary gap-3 text-muted border-bottom', 
                style: { fontSize: '0.68rem', background: '#f3f2f1', color: '#323130', borderColor: '#d2d2d2' } 
            }, [
                h('span', { style: { fontWeight: 600, color: '#107c41', cursor: 'pointer' } }, 'Archivo'),
                h('span', { style: { fontWeight: 600, color: '#323130', cursor: 'pointer' } }, 'Inicio'),
                h('span', { style: { color: '#595959', cursor: 'pointer' } }, 'Insertar'),
                h('span', { style: { color: '#595959', cursor: 'pointer' } }, 'Fórmulas'),
                h('span', { style: { color: '#595959', cursor: 'pointer' } }, 'Datos'),
                h('span', { style: { color: '#595959', cursor: 'pointer' } }, 'Revisar'),
                h('span', { style: { color: '#595959', cursor: 'pointer' } }, 'Vista')
            ]),

            // Formula Bar
            h('div', { 
                className: 'excel-formula-bar flex items-center px-3 py-1.5 border-bottom text-xs gap-2', 
                style: { borderColor: '#d2d2d2', background: '#fff', color: '#323130' } 
            }, [
                h('div', { 
                    className: 'flex items-center justify-center font-bold font-mono', 
                    style: { width: '24px', height: '20px', background: '#f3f2f1', border: '1px solid #d2d2d2', borderRadius: '3px', color: '#107c41' } 
                }, 'fx'),
                h('div', { className: 'font-mono text-xs flex-1', style: { padding: '2px 8px', background: '#f3f2f1', borderRadius: '3px', border: '1px solid #d2d2d2', minHeight: '20px' } }, 
                    `=SUMA(C2) | Total Billed: COP ${totalAmount.toLocaleString()} COP`
                )
            ]),

            // Spreadsheet Grid Area
            h('div', { className: 'overflow-x-auto w-full' }, [
                h('table', { className: 'w-full text-xs font-mono', style: { borderCollapse: 'collapse', minWidth: '750px' } }, [
                    h('thead', {}, [
                        h('tr', { style: { background: '#f3f2f1' } }, [
                            h('th', { style: { width: '40px', textAlign: 'center', border: '1px solid #d2d2d2', color: '#595959', padding: '6px 0', background: '#f3f2f1' } }, ''),
                            h('th', { style: { border: '1px solid #d2d2d2', color: '#323130', padding: '6px 8px', fontWeight: 600, textAlign: 'left', background: '#f3f2f1', width: '220px' } }, 'A (Servicio Realizado)'),
                            h('th', { style: { border: '1px solid #d2d2d2', color: '#323130', padding: '6px 8px', fontWeight: 600, textAlign: 'left', background: '#f3f2f1', width: '200px' } }, 'B (Cliente / Proyecto)'),
                            h('th', { style: { border: '1px solid #d2d2d2', color: '#323130', padding: '6px 8px', fontWeight: 600, textAlign: 'left', background: '#f3f2f1', width: '150px' } }, 'C (Monto COP)'),
                            h('th', { style: { border: '1px solid #d2d2d2', color: '#323130', padding: '6px 8px', fontWeight: 600, textAlign: 'left', background: '#f3f2f1', width: '130px' } }, 'D (Fecha Presentación)'),
                            h('th', { style: { border: '1px solid #d2d2d2', color: '#323130', padding: '6px 8px', fontWeight: 600, textAlign: 'left', background: '#f3f2f1' } }, 'E (Observaciones y Links)')
                        ])
                    ]),
                    h('tbody', {}, [
                        // Row 1: Spreadsheet Headers (Mock Sheet Rows)
                        h('tr', {}, [
                            h('td', { style: { background: '#f3f2f1', textAlign: 'center', border: '1px solid #d2d2d2', color: '#595959', fontWeight: 'bold', padding: '8px 0' } }, '1'),
                            h('td', { style: { border: '1px solid #d2d2d2', padding: '8px', background: '#e1dfdd', fontWeight: 'bold', color: '#323130' } }, 'SERVICIO REALIZADO'),
                            h('td', { style: { border: '1px solid #d2d2d2', padding: '8px', background: '#e1dfdd', fontWeight: 'bold', color: '#323130' } }, 'CLIENTE / PROYECTO'),
                            h('td', { style: { border: '1px solid #d2d2d2', padding: '8px', background: '#e1dfdd', fontWeight: 'bold', color: '#323130' } }, 'MONTO AUTORIZADO'),
                            h('td', { style: { border: '1px solid #d2d2d2', padding: '8px', background: '#e1dfdd', fontWeight: 'bold', color: '#323130' } }, 'FECHA REGISTRO'),
                            h('td', { style: { border: '1px solid #d2d2d2', padding: '8px', background: '#e1dfdd', fontWeight: 'bold', color: '#323130' } }, 'OBSERVACIONES')
                        ]),
                        // Row 2: Spreadsheet Data Cells
                        h('tr', {}, [
                            h('td', { style: { background: '#f3f2f1', textAlign: 'center', border: '1px solid #d2d2d2', color: '#595959', fontWeight: 'bold', padding: '8px 0' } }, '2'),
                            
                            // A2: Service
                            isEditable ? h('td', { style: { border: '1px solid #d2d2d2', padding: '2px', background: '#fff' } }, [
                                h('select', { 
                                    id: `excel-${prefix}-type`,
                                    className: 'form-select font-mono', 
                                    style: { border: 'none', background: 'transparent', width: '100%', fontSize: '0.75rem', padding: '4px' } 
                                }, [
                                    h('option', { value: 'Factura de Edición de Video', selected: data?.type === 'Factura de Edición de Video' }, 'Factura de Edición de Video'),
                                    h('option', { value: 'Factura de Grabación de Video', selected: data?.type === 'Factura de Grabación de Video' }, 'Factura de Grabación de Video'),
                                    h('option', { value: 'Factura Consolidada', selected: data?.type === 'Factura Consolidada' }, 'Factura Consolidada')
                                ])
                            ]) : h('td', { style: { border: '1px solid #d2d2d2', padding: '8px', background: '#faf9f8', color: '#323130' } }, data?.type || 'Sin registrar'),

                            // B2: Client
                            isEditable ? h('td', { style: { border: '1px solid #d2d2d2', padding: '2px', background: '#fff' } }, [
                                h('select', { 
                                    id: `excel-${prefix}-client`,
                                    className: 'form-select font-mono', 
                                    style: { border: 'none', background: 'transparent', width: '100%', fontSize: '0.75rem', padding: '4px' } 
                                }, [
                                    h('option', { value: 'General' }, '🌍 General / Otro'),
                                    ...clientsList.map(c => h('option', { value: c.nombre || c.name || c.id, selected: data?.client === (c.nombre || c.name || c.id) }, c.nombre || c.name))
                                ])
                            ]) : h('td', { style: { border: '1px solid #d2d2d2', padding: '8px', background: '#faf9f8', color: '#323130' } }, data?.client || 'Sin registrar'),

                            // C2: Amount
                            isEditable ? h('td', { style: { border: '1px solid #d2d2d2', padding: '2px', background: '#fff' } }, [
                                h('input', { 
                                    id: `excel-${prefix}-amount`,
                                    type: 'number',
                                    className: 'form-input font-mono font-bold text-success',
                                    style: { border: 'none', background: 'transparent', width: '100%', fontSize: '0.75rem', padding: '4px', color: '#107c41' },
                                    value: totalAmount || '',
                                    placeholder: 'Ej. 300000',
                                    required: true
                                })
                            ]) : h('td', { style: { border: '1px solid #d2d2d2', padding: '8px', background: '#faf9f8', fontWeight: 'bold', color: '#107c41' } }, `COP ${totalAmount.toLocaleString()}`),

                            // D2: Date (Always generated / saved automatically)
                            h('td', { style: { border: '1px solid #d2d2d2', padding: '8px', background: '#faf9f8', color: '#595959' } }, 
                                data?.createdAt ? new Date(data.createdAt).toLocaleDateString() : new Date().toLocaleDateString()
                            ),

                            // E2: Observations
                            isEditable ? h('td', { style: { border: '1px solid #d2d2d2', padding: '2px', background: '#fff' } }, [
                                h('input', { 
                                    id: `excel-${prefix}-obs`,
                                    type: 'text',
                                    className: 'form-input font-mono',
                                    style: { border: 'none', background: 'transparent', width: '100%', fontSize: '0.75rem', padding: '4px' },
                                    value: data?.observations || '',
                                    placeholder: 'Ej: Links de Drive, cantidad de videos, etc...'
                                })
                            ]) : h('td', { style: { border: '1px solid #d2d2d2', padding: '8px', background: '#faf9f8', color: '#595959' } }, data?.observations || 'Sin observaciones.')
                        ])
                    ])
                ])
            ]),

            // Spreadsheet Toolbar/Save button
            isEditable ? h('div', { 
                className: 'flex justify-end p-2 bg-tertiary border-top gap-2', 
                style: { background: '#f3f2f1', borderTop: '1px solid #d2d2d2' } 
            }, [
                h('button', { 
                    type: 'button',
                    className: 'btn text-xs font-bold text-white py-1.5 px-4 flex items-center gap-1.5',
                    style: { background: '#107c41', borderRadius: '4px', border: '1px solid #0a522b' },
                    onClick: () => {
                        const selectType = document.getElementById(`excel-${prefix}-type`).value;
                        const selectClient = document.getElementById(`excel-${prefix}-client`).value;
                        const inputAmount = Number(document.getElementById(`excel-${prefix}-amount`).value) || 0;
                        const inputObs = document.getElementById(`excel-${prefix}-obs`).value.trim();
                        
                        onSave({
                            type: selectType,
                            client: selectClient,
                            amount: inputAmount,
                            observations: inputObs,
                            createdAt: data?.createdAt || new Date().toISOString()
                        });
                    }
                }, [
                    icon('file-check', 12),
                    h('span', {}, '💾 Guardar Hoja (.xlsx)')
                ])
            ]) : null
        ]);
    };

    const loadAndRender = async () => {
        container.innerHTML = '<div class="loader mb-4"></div>';

        try {
            // Load global references
            [clientsList, allUsers, allAssignments] = await Promise.all([
                dbService.getAll('clients').catch(() => []),
                userService.getAllUsers().catch(() => []),
                assignmentService.getAllAssignments().catch(() => [])
            ]);

            approvedUsers = allUsers.filter(u => u.approved && u.role !== 'admin');

            if (isAdmin) {
                // Fetch all invoices
                [empInvoices, admInvoices] = await Promise.all([
                    invoiceService.getAllInvoices('invoices').catch(() => []),
                    invoiceService.getAllInvoices('admin_invoices').catch(() => [])
                ]);

                // Auto-select first user if none selected
                if (!selectedUserId && approvedUsers.length > 0) {
                    selectedUserId = approvedUsers[0].uid;
                }

                container.innerHTML = '';

                // Header
                const header = h('div', { className: 'content-header flex justify-between items-center w-full mb-2', style: { paddingBottom: '1rem' } }, [
                    h('div', {}, [
                        h('h1', { style: { fontSize: '1.4rem' } }, 'Auditoría de Facturación Excel'),
                        h('p', { className: 'text-xs text-muted mt-1' }, 'Gestión directa de hojas de reporte y generación de facturas administrativas por colaborador.')
                    ]),
                    h('button', { 
                        className: 'btn btn-outline text-xs', 
                        title: 'Exportar Facturas Consolidadas Admin',
                        onClick: () => invoiceService.exportToCsv(admInvoices, '') 
                    }, [icon('file-spreadsheet', 14), h('span', {}, 'Exportar CSV')])
                ]);

                container.appendChild(header);

                // Two-Column Grid
                const mainGrid = h('div', { 
                    className: 'flex gap-4 w-full flex-wrap', 
                    style: { display: 'flex', flexDirection: 'row', alignItems: 'stretch' } 
                });

                // Left Column: User Directory Sidebar (width: 260px)
                const userDirectorySidebar = h('div', { 
                    className: 'card p-4 flex-column gap-3', 
                    style: { width: '260px', minWidth: '240px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' } 
                }, [
                    h('span', { className: 'text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-1 border-bottom pb-2' }, [
                        icon('users', 14, 'text-primary'),
                        h('span', {}, 'Directorio de Miembros')
                    ]),
                    
                    // User List rows
                    h('div', { className: 'flex-column gap-2 overflow-y-auto', style: { maxHeight: '450px' } }, approvedUsers.map(member => {
                        const isSelected = member.uid === selectedUserId;
                        
                        // Extract totals for quick summary
                        const empTotal = empInvoices.find(i => i.employeeId === member.uid)?.amount || 0;
                        const admTotal = admInvoices.find(i => i.employeeId === member.uid)?.amount || 0;

                        return h('div', {
                            className: `flex-column p-2 rounded cursor-pointer transition-all ${isSelected ? 'active-user-row' : 'hover-bg-tertiary'}`,
                            style: {
                                border: isSelected ? '1px solid #107c41' : '1px solid var(--border)',
                                background: isSelected ? 'rgba(16, 124, 65, 0.08)' : 'transparent',
                                borderRadius: '6px',
                                padding: '10px'
                            },
                            onClick: () => {
                                selectedUserId = member.uid;
                                loadAndRender();
                            }
                        }, [
                            h('div', { className: 'flex items-center gap-2 mb-1.5' }, [
                                member.photoURL 
                                    ? h('img', { src: member.photoURL, style: { width: '20px', height: '20px', borderRadius: '50%' } })
                                    : h('div', { 
                                        style: { 
                                            width: '20px', height: '20px', borderRadius: '50%', background: 'var(--bg-tertiary)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 'bold' 
                                        } 
                                      }, (member.nombre || member.email).slice(0,2).toUpperCase()),
                                h('span', { className: 'font-bold text-xs flex-1 truncate' }, member.nombre || member.email)
                            ]),
                            h('div', { className: 'flex justify-between items-center text-muted', style: { fontSize: '0.65rem' } }, [
                                h('span', {}, 'Reportado:'),
                                h('span', { className: 'font-bold' }, `COP ${empTotal.toLocaleString()}`)
                            ]),
                            h('div', { className: 'flex justify-between items-center mt-0.5 text-primary', style: { fontSize: '0.65rem' } }, [
                                h('span', {}, 'Admin:'),
                                h('span', { className: 'font-bold' }, `COP ${admTotal.toLocaleString()}`)
                            ])
                        ]);
                    }))
                ]);

                // Right Column: User Portal View
                const portalViewContainer = h('div', { className: 'flex-column gap-3 flex-1', style: { minWidth: '320px' } });

                if (selectedUserId) {
                    const selectedUser = approvedUsers.find(u => u.uid === selectedUserId);
                    
                    if (selectedUser) {
                        // User Profile Summary Header Card
                        const userHeader = h('div', { 
                            className: 'card p-4 flex justify-between items-center flex-wrap gap-2 mb-1',
                            style: { background: 'var(--bg-secondary)', borderLeft: '3px solid #107c41' }
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
                            h('span', { className: 'badge text-xs font-mono font-bold text-white', style: { background: '#107c41' } }, 'Portal Activo')
                        ]);

                        portalViewContainer.appendChild(userHeader);

                        // Section 1: Dynamic Assignments list
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

                        // Section 2: Employee's Invoice Sheet (Excel #1 - Read-Only for Admin)
                        const userEmpInv = empInvoices.find(i => i.employeeId === selectedUserId) || {
                            amount: 0, client: 'General', type: 'Factura de Edición de Video', observations: 'El colaborador aún no ha presentado reportes de cobro.', createdAt: new Date().toISOString()
                        };

                        const empSheet = renderExcelSpreadsheet({
                            title: `Hoja de Honorarios Presentada por el Colaborador (${selectedUser.nombre || selectedUser.email})`,
                            sheetName: 'Reporte_Empleado',
                            prefix: 'emp-view',
                            isEditable: false,
                            data: userEmpInv
                        });

                        portalViewContainer.appendChild(empSheet);

                        // Section 3: Admin's Invoice Sheet (Excel #2 - Editable for Admin)
                        const userAdmInv = admInvoices.find(i => i.employeeId === selectedUserId) || {
                            amount: 0, client: 'General', type: 'Factura Consolidada', observations: '', createdAt: new Date().toISOString()
                        };

                        const admSheet = renderExcelSpreadsheet({
                            title: 'Hoja de Honorarios Autorizada por el Administrador (Abajo de la reportada)',
                            sheetName: 'Factura_Admin',
                            prefix: 'adm',
                            isEditable: true,
                            data: userAdmInv,
                            onSave: async (updatedData) => {
                                container.innerHTML = '<div class="loader mb-4"></div>';
                                try {
                                    await invoiceService.saveAdminInvoice(selectedUserId, {
                                        employeeName: selectedUser.nombre || selectedUser.email,
                                        type: updatedData.type,
                                        client: updatedData.client,
                                        amount: updatedData.amount,
                                        observations: updatedData.observations,
                                        createdAt: updatedData.createdAt
                                    });
                                    alert("¡Factura Administrativa guardada con éxito en Firestore!");
                                } catch (e) {
                                    alert(`Error al guardar factura: ${e.message}`);
                                }
                                loadAndRender();
                            }
                        });

                        portalViewContainer.appendChild(admSheet);
                    }
                } else {
                    portalViewContainer.appendChild(h('div', { className: 'text-center p-20 card text-muted text-xs' }, 'No hay miembros aprobados registrados en el sistema.'));
                }

                mainGrid.appendChild(userDirectorySidebar);
                mainGrid.appendChild(portalViewContainer);
                container.appendChild(mainGrid);

            } else {
                // Employee Flow: Render employee's own portal directly with both Excel sheets stacked
                const [myEmpInv, myAdmInv] = await Promise.all([
                    invoiceService.getEmployeeInvoice(user.uid).catch(() => null),
                    invoiceService.getAdminInvoice(user.uid).catch(() => null)
                ]);

                container.innerHTML = '';

                // Header
                const header = h('div', { className: 'content-header flex-column gap-1 w-full mb-3', style: { paddingBottom: '1rem' } }, [
                    h('h1', { style: { fontSize: '1.4rem' } }, 'Mi Portal de Facturación Excel'),
                    h('p', { className: 'text-xs text-muted' }, 'Edita tu hoja de cobros mensual y revisa la hoja autorizada por el Administrador en tiempo real.')
                ]);

                container.appendChild(header);

                // Section 1: My Production Tasks Checklist
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

                // Section 2: Edit my reported invoice (Excel #1 - Editable for Employee)
                const empInvData = myEmpInv || {
                    amount: 0, client: 'General', type: 'Factura de Edición de Video', observations: '', createdAt: new Date().toISOString()
                };

                const myEmpSheet = renderExcelSpreadsheet({
                    title: 'Mi Hoja de Honorarios Presentada (Doble clic en celdas para editar)',
                    sheetName: 'Mi_Reporte',
                    prefix: 'emp',
                    isEditable: true,
                    data: empInvData,
                    onSave: async (updatedData) => {
                        container.innerHTML = '<div class="loader mb-4"></div>';
                        try {
                            await invoiceService.saveEmployeeInvoice(user.uid, {
                                employeeName: user.nombre || user.email,
                                type: updatedData.type,
                                client: updatedData.client,
                                amount: updatedData.amount,
                                observations: updatedData.observations,
                                createdAt: updatedData.createdAt
                            });
                            alert("¡Tu hoja de reporte ha sido guardada en Firestore!");
                        } catch (e) {
                            alert(`Error al guardar reporte: ${e.message}`);
                        }
                        loadAndRender();
                    }
                });

                container.appendChild(myEmpSheet);

                // Section 3: View Admin's authorized invoice (Excel #2 - Read-Only for Employee)
                const admInvData = myAdmInv || {
                    amount: 0, client: 'General', type: 'Factura Consolidada', observations: 'El Administrador aún no ha cargado tu factura consolidada.', createdAt: new Date().toISOString()
                };

                const myAdmSheet = renderExcelSpreadsheet({
                    title: 'Hoja de Honorarios Autorizada por el Administrador (Abajo de tu reporte)',
                    sheetName: 'Factura_Admin',
                    prefix: 'adm-view',
                    isEditable: false,
                    data: admInvData
                });

                container.appendChild(myAdmSheet);
            }

            if (window.lucide) window.lucide.createIcons();

        } catch (err) {
            console.error("Billing load failed:", err);
            container.innerHTML = `<div class="error-state text-sm p-10">${err.message}</div>`;
        }
    };

    loadAndRender();
    return container;
};
