/**
 * Dashboard Page - Creative Production OS
 * Notion Light UI supporting core dynamic operations triggers and real-time production analytics.
 */
import { h, icon, sumInvoiceItems } from '../utils/dom.js';
import { store } from '../js/store.js';
import { Table } from '../components/ui/Table.js';
import { dbService } from '../supabase/service.js';
import { assignmentService } from '../services/assignmentService.js';

export const render = () => {
    const { user } = store.getState();
    const container = h('div', { className: 'fade-in flex-column gap-6' });

    const loadDashboard = async () => {
        container.innerHTML = '<div class="loader mb-4"></div>';

        try {
            const isAdmin = user?.role === 'admin';
            let [formats, hooks, clients, assignments, usersList, invoices, sopSubmissions] = await Promise.all([
                dbService.getAll('formats').catch(() => []),
                dbService.getAll('hooks').catch(() => []),
                dbService.getAll('clients').catch(() => []),
                isAdmin ? assignmentService.getAllAssignments().catch(() => []) : assignmentService.getAssignmentsByEmployee(user?.uid).catch(() => []),
                dbService.getAll('users').catch(() => []),
                dbService.getAll('invoices').catch(() => []),
                dbService.getAll('sop_submissions').catch(() => [])
            ]);

            if (!isAdmin && user.allowedClients) {
                clients = clients.filter(c => user.allowedClients.includes(c.id));
            }

            const activeAssignments = isAdmin
                ? assignments.filter(a => a.status !== 'Completado' && a.status !== 'Archivado')
                : assignments.filter(a => a.employeeId === user?.uid && a.status !== 'Completado' && a.status !== 'Archivado');

            // --- Calculation for Metric Cards ---
            const now = new Date();
            const currentMonth = now.getMonth();
            const totalInvoiced = invoices.filter(inv => {
                const invDate = inv.createdAt || inv.date;
                if (!invDate) return false;
                const d = new Date(invDate);
                return d.getMonth() === currentMonth && d.getFullYear() === now.getFullYear();
            }).reduce((sum, inv) => sum + sumInvoiceItems(inv), 0);
            
            const monthlyProduction = assignments.filter(a => {
                const dateVal = a.date || a.dueDate;
                return a.status === 'Completado' && dateVal && new Date(dateVal).getMonth() === currentMonth;
            }).length;

            container.innerHTML = '';

            // 1. Header greeting
            const greeting = h('div', { className: 'flex-column gap-1 mb-2' }, [
                h('h2', { className: 'text-primary font-bold text-2xl', style: { letterSpacing: '-0.03em' } }, `Buenos días, ${user?.nombre || 'Miembro'}`),
                h('p', { className: 'text-xs text-muted font-medium' }, 'Resumen operativo de hoy.')
            ]);

            // 2. Stripe-like Metric Cards Grid
            const metricsGrid = h('div', { 
                className: 'grid gap-4 mb-4', 
                style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' } 
            }, [
                createMetricCard('Clientes Activos', `${clients.length}`, 'users', 'var(--info)', `+ ${clients.length} registrados`),
                createMetricCard('Asignaciones Pendientes', `${activeAssignments.length}`, 'clock', 'var(--warning)', `${activeAssignments.length} en producción`),
                createMetricCard('Facturación del Mes', `$${totalInvoiced.toLocaleString('es-CO')}`, 'credit-card', 'var(--success)', 'Cobros consolidados'),
                createMetricCard('Producción del Mes', `${monthlyProduction} Videos`, 'video', 'var(--accent)', 'Entregables completados')
            ]);

            // 3. Admin Operational Widgets (The 8 Questions)
            let operationalWidgets = null;
            if (isAdmin) {
                // Q1: ¿Qué está atrasado?
                const overdue = assignments.filter(a => {
                    if (a.status === 'Completado' || a.status === 'Cancelado' || a.status === 'Archivado') return false;
                    return new Date(a.dueDate) < now;
                }).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).slice(0, 5);

                const w1Content = overdue.length > 0 ? overdue.map(a => {
                    const days = Math.floor((now - new Date(a.dueDate)) / (1000 * 60 * 60 * 24));
                    const empName = usersList.find(u => u.uid === a.employeeId)?.nombre?.split(' ')[0] || 'Alguien';
                    return h('div', { className: 'flex justify-between items-center mb-2 pb-2 border-bottom text-xs' }, [
                        h('div', { className: 'flex-column' }, [
                            h('span', { className: 'font-bold truncate', style: { maxWidth: '150px' } }, a.title),
                            h('span', { className: 'text-[10px] text-muted' }, `${a.client} • ${empName}`)
                        ]),
                        h('span', { className: 'badge badge-error text-[10px]' }, `Hace ${days}d`)
                    ]);
                }) : [h('span', { className: 'text-xs text-muted italic' }, 'Nada atrasado.')];
                
                const w1 = createWidget('¿Qué está atrasado?', 'alert-circle', w1Content);

                // Q2: ¿Quién está libre?
                const approvedUsers = usersList.filter(u => u.approved !== false);
                const freeUsers = approvedUsers.filter(u => {
                    const userAsgs = activeAssignments.filter(a => a.employeeId === u.uid || a.employeeId === u.id);
                    return userAsgs.length === 0;
                }).slice(0, 5);

                const w2Content = freeUsers.length > 0 ? freeUsers.map(u => {
                    const lastCompleted = assignments.filter(a => (a.employeeId === u.uid || a.employeeId === u.id) && a.status === 'Completado')
                        .sort((a,b) => new Date(b.date || b.dueDate) - new Date(a.date || a.dueDate))[0];
                    const days = lastCompleted ? Math.floor((now - new Date(lastCompleted.date || lastCompleted.dueDate)) / 86400000) : '?';
                    return h('div', { className: 'flex justify-between items-center mb-2 pb-2 border-bottom text-xs' }, [
                        h('div', { className: 'flex-column' }, [
                            h('span', { className: 'font-bold' }, u.nombre),
                            h('span', { className: 'text-[10px] text-muted' }, u.role)
                        ]),
                        h('span', { className: 'text-[10px] text-muted' }, lastCompleted ? `Libre hace ${days}d` : 'Sin historial')
                    ]);
                }) : [h('span', { className: 'text-xs text-muted italic' }, 'Todos están ocupados.')];

                const w2 = createWidget('¿Quién está libre?', 'user-check', w2Content);

                // Q3: ¿Qué cliente necesita atención?
                const needyClients = clients.filter(c => {
                    const activeForClient = activeAssignments.filter(a => a.client === c.name || a.client === c.id);
                    if (activeForClient.length > 0) return false;
                    const completed = assignments.filter(a => (a.client === c.name || a.client === c.id) && a.status === 'Completado')
                        .sort((a,b) => new Date(b.date || b.dueDate) - new Date(a.date || a.dueDate));
                    if (completed.length === 0) return true; // Never had a task
                    const daysSince = Math.floor((now - new Date(completed[0].date || completed[0].dueDate)) / 86400000);
                    return daysSince > 14;
                }).slice(0, 5);

                const w3Content = needyClients.length > 0 ? needyClients.map(c => {
                    const completed = assignments.filter(a => (a.client === c.name || a.client === c.id) && a.status === 'Completado')
                        .sort((a,b) => new Date(b.date || b.dueDate) - new Date(a.date || a.dueDate));
                    const days = completed.length > 0 ? Math.floor((now - new Date(completed[0].date || completed[0].dueDate)) / 86400000) : '?';
                    return h('div', { className: 'flex justify-between items-center mb-2 pb-2 border-bottom text-xs' }, [
                        h('span', { className: 'font-bold' }, c.name),
                        h('span', { className: 'badge badge-warning text-[10px]' }, days === '?' ? 'Nuevo' : `Inactivo ${days}d`)
                    ]);
                }) : [h('span', { className: 'text-xs text-muted italic' }, 'Todos atendidos recientemente.')];

                const w3 = createWidget('¿Cliente sin atención?', 'help-circle', w3Content);

                // Q4: ¿Cuánto falta por entregar? (Desglose)
                const cntPend = activeAssignments.filter(a => a.status === 'Pendiente').length;
                const cntProc = activeAssignments.filter(a => a.status === 'En Proceso' || a.status === 'En Producción').length;
                const cntBlock = activeAssignments.filter(a => a.status === 'blocked').length;
                const cntReview = activeAssignments.filter(a => a.status === 'Entregado').length; 
                
                const w4Content = h('div', { className: 'flex-column gap-2 text-xs' }, [
                    h('div', { className: 'flex justify-between items-center p-2 bg-secondary rounded' }, [
                        h('span', {}, 'Pendientes:'), h('span', { className: 'badge badge-info' }, `${cntPend}`)
                    ]),
                    h('div', { className: 'flex justify-between items-center p-2 bg-secondary rounded' }, [
                        h('span', {}, 'En Producción:'), h('span', { className: 'badge badge-warning' }, `${cntProc}`)
                    ]),
                    h('div', { className: 'flex justify-between items-center p-2 bg-secondary rounded' }, [
                        h('span', {}, 'Bloqueados/Espera:'), h('span', { className: 'badge badge-error' }, `${cntBlock}`)
                    ]),
                    h('div', { className: 'flex justify-between items-center p-2 bg-secondary rounded' }, [
                        h('span', {}, 'En Revisión (Nuevos):'), h('span', { className: 'badge badge-success' }, `${cntReview}`)
                    ])
                ]);
                const w4 = createWidget('¿Cuánto falta entregar?', 'pie-chart', [w4Content]);

                // Q5: ¿Cuánto falta por pagar?
                const unpaidInvoices = invoices.filter(i => i.status === 'Pendiente');
                const unpaidTotal = unpaidInvoices.reduce((sum, i) => sum + sumInvoiceItems(i), 0);
                
                const w5Content = h('div', { className: 'flex-column items-center justify-center h-full gap-2 py-4' }, [
                    h('span', { className: 'text-2xl font-bold text-error' }, `$${unpaidTotal.toLocaleString('es-CO')}`),
                    h('span', { className: 'text-[10px] text-muted' }, `En ${unpaidInvoices.length} facturas pendientes`)
                ]);
                const w5 = createWidget('¿Cuánto falta pagar?', 'dollar-sign', [w5Content]);

                // Q6: ¿Qué hook funciona?
                const completedAsgs = assignments.filter(a => a.status === 'Completado');
                const hookCounts = {};
                completedAsgs.forEach(a => {
                    if (a.hookUsed) {
                        hookCounts[a.hookUsed] = (hookCounts[a.hookUsed] || 0) + 1;
                    }
                });
                const topHooks = Object.entries(hookCounts).sort((a,b) => b[1] - a[1]).slice(0, 4);

                const w6Content = topHooks.length > 0 ? topHooks.map(h_entry => {
                    return h('div', { className: 'flex justify-between items-center mb-2 pb-2 border-bottom text-xs' }, [
                        h('span', { className: 'font-medium truncate', style: { maxWidth: '160px' } }, h_entry[0]),
                        h('span', { className: 'badge badge-secondary text-[10px]' }, `${h_entry[1]} usos`)
                    ]);
                }) : [h('span', { className: 'text-xs text-muted italic' }, 'Sin datos de hooks.')];
                
                const w6 = createWidget('¿Qué hook funciona?', 'anchor', w6Content);

                // Q7: ¿Qué formato funciona?
                const typeCounts = {};
                completedAsgs.forEach(a => {
                    if (a.type) {
                        typeCounts[a.type] = (typeCounts[a.type] || 0) + 1;
                    }
                });
                const topTypes = Object.entries(typeCounts).sort((a,b) => b[1] - a[1]).slice(0, 4);

                const w7Content = topTypes.length > 0 ? topTypes.map(t_entry => {
                    return h('div', { className: 'flex justify-between items-center mb-2 pb-2 border-bottom text-xs' }, [
                        h('span', { className: 'font-medium truncate', style: { maxWidth: '160px' } }, t_entry[0]),
                        h('span', { className: 'badge badge-secondary text-[10px]' }, `${t_entry[1]} entregas`)
                    ]);
                }) : [h('span', { className: 'text-xs text-muted italic' }, 'Sin datos de formatos.')];

                const w7 = createWidget('¿Qué formato funciona?', 'layout', w7Content);

                // Q8: ¿Qué videos faltan este mes?
                const pkgClients = clients.filter(c => c.packageLimit && c.packageLimit > 0);
                const w8Content = pkgClients.length > 0 ? pkgClients.map(c => {
                    const comp = c.videosCompleted || 0;
                    const limit = c.packageLimit;
                    const pct = (comp / limit) * 100;
                    const isLow = pct < 50;
                    return h('div', { className: 'flex-column gap-1 mb-3' }, [
                        h('div', { className: 'flex justify-between text-xs' }, [
                            h('span', { className: 'font-bold' }, c.name),
                            h('span', { className: isLow ? 'text-error' : 'text-success' }, `${comp}/${limit}`)
                        ]),
                        h('div', { className: 'w-full bg-secondary', style: { height: '6px', borderRadius: '3px' } }, [
                            h('div', { style: { width: `${Math.min(pct, 100)}%`, height: '100%', background: isLow ? 'var(--error)' : 'var(--success)', borderRadius: '3px' } })
                        ])
                    ]);
                }).slice(0, 4) : [h('span', { className: 'text-xs text-muted italic' }, 'Ningún cliente tiene límite de paquete configurado.')];

                const w8 = createWidget('¿Qué falta este mes?', 'target', w8Content);

                operationalWidgets = h('div', { 
                    className: 'grid gap-4 mb-6', 
                    style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' } 
                }, [w1, w2, w3, w4, w5, w6, w7, w8]);
            }

            // Timeline and right panel for non-admins (fallback) or general
            // Let's keep a simplified timeline at the bottom for everyone
            const timelineEvents = [];
            assignments.forEach(asg => {
                const emp = usersList.find(u => u.uid === asg.employeeId) || { nombre: asg.employeeName };
                const empName = emp.nombre || emp.email?.split('@')[0] || 'Miembro';
                const photo = emp.photoURL || '';
                
                if (asg.status === 'Completado') {
                    timelineEvents.push({ user: empName, photo, action: `entregó la tarea "${asg.title}" para ${asg.client}`, time: new Date(asg.date || asg.dueDate || Date.now()) });
                } else if (asg.status === 'En Proceso') {
                    timelineEvents.push({ user: empName, photo, action: `inició la tarea "${asg.title}" para ${asg.client}`, time: new Date(asg.date || Date.now()) });
                }
            });

            sopSubmissions.forEach(sub => {
                timelineEvents.push({ user: sub.userName || 'Miembro', photo: '', action: `completó el SOP "${sub.sopTitle}"`, time: new Date(sub.completedAt || Date.now()) });
            });

            timelineEvents.sort((a, b) => b.time - a.time);
            const displayEvents = timelineEvents.slice(0, 5);

            const timelineList = h('div', { className: 'flex-column gap-4' }, 
                displayEvents.length > 0 ? displayEvents.map(ev => {
                    const timeString = ev.time.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
                    return h('div', { className: 'flex gap-3 items-center' }, [
                        ev.photo 
                            ? h('img', { src: ev.photo, className: 'sidebar-user-avatar', style: { width: '28px', height: '28px', objectFit: 'cover', borderRadius: '50%' } })
                            : h('div', { className: 'sidebar-user-avatar-fallback', style: { width: '28px', height: '28px', fontSize: '10px' } }, [icon('user', 10)]),
                        h('div', { className: 'flex-1 flex-column' }, [
                            h('div', { className: 'text-xs text-primary' }, [h('strong', {}, ev.user), ' ', h('span', { className: 'text-secondary' }, ev.action)]),
                            h('span', { className: 'text-[10px] text-muted' }, timeString)
                        ])
                    ]);
                }) : [h('p', { className: 'text-xs text-muted italic p-4' }, 'Sin actividad registrada hoy.')]
            );

            // 6. Production over last 6 months (real data)
            const monthNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
            const last6Months = [];
            for (let i = 5; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const month = d.getMonth();
                const year = d.getFullYear();
                const count = assignments.filter(a => {
                    if (a.status !== 'Completado') return false;
                    const dateVal = a.date || a.dueDate;
                    if (!dateVal) return false;
                    const ad = new Date(dateVal);
                    return ad.getMonth() === month && ad.getFullYear() === year;
                }).length;
                last6Months.push({ label: `${monthNames[month]} ${year.toString().slice(-2)}`, count });
            }
            const maxCount = Math.max(...last6Months.map(m => m.count), 1);

            const chartSection = h('div', { className: 'card p-6 flex-column gap-4 mt-2 h-full' }, [
                h('div', { className: 'flex justify-between items-center' }, [
                    h('h3', { className: 'text-xs font-bold uppercase tracking-wider text-secondary' }, 'Producción últimos 6 meses'),
                    h('span', { className: 'text-[10px] text-muted' }, 'Videos completados por mes')
                ]),
                h('div', { 
                    style: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '8px', height: '120px', padding: '10px 0', borderBottom: '1px solid var(--border)' }
                }, last6Months.map(m => {
                    const barHeight = Math.max((m.count / maxCount) * 100, 4);
                    return h('div', { style: { flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' } }, [
                        h('span', { className: 'text-[10px] font-bold text-primary' }, `${m.count}`),
                        h('div', { style: { width: '100%', height: `${barHeight}px`, background: 'linear-gradient(180deg, #3b82f6, #60a5fa)', borderRadius: '4px 4px 0 0', transition: 'height 0.3s ease' } }),
                        h('span', { className: 'text-[9px] text-muted font-medium' }, m.label)
                    ]);
                }))
            ]);

            // Assemble everything
            container.appendChild(greeting);
            container.appendChild(metricsGrid);
            
            if (isAdmin) {
                container.appendChild(operationalWidgets);
            }

            const bottomPanel = h('div', { className: 'grid gap-6', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' } }, [
                h('div', { className: 'card p-6 h-full' }, [
                    h('h3', { className: 'text-xs font-bold uppercase tracking-wider text-secondary mb-4 border-bottom pb-2' }, 'Actividad reciente'),
                    timelineList
                ]),
                chartSection
            ]);

            container.appendChild(bottomPanel);

            if (window.lucide) window.lucide.createIcons();

        } catch (err) {
            console.error("Dashboard render failed:", err);
            container.innerHTML = `<div class="error-state text-sm p-10">${err.message}</div>`;
        }
    };

    loadDashboard();
    return container;
};

// Helpers
const createMetricCard = (label, value, iconName, color, subtext) => {
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
            h('span', {}, subtext)
        ])
    ]);
};

const createWidget = (title, iconName, contentArr) => {
    return h('div', { className: 'card p-4 flex-column h-full', style: { minHeight: '180px' } }, [
        h('div', { className: 'flex items-center gap-2 mb-3 border-bottom pb-2 text-secondary' }, [
            icon(iconName, 14),
            h('h4', { className: 'text-[11px] font-bold uppercase tracking-wider' }, title)
        ]),
        h('div', { className: 'flex-column flex-1 overflow-y-auto' }, contentArr)
    ]);
};
