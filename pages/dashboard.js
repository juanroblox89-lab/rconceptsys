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

            // 3. Activity Timeline Construction (Left Column 70% data)
            const timelineEvents = [];
            assignments.forEach(asg => {
                const emp = usersList.find(u => u.uid === asg.employeeId) || { nombre: asg.employeeName };
                const empName = emp.nombre || emp.email?.split('@')[0] || 'Miembro';
                const photo = emp.photoURL || '';
                
                if (asg.status === 'Completado') {
                    timelineEvents.push({
                        user: empName,
                        photo,
                        action: `entregó la tarea "${asg.title}" para ${asg.client}`,
                        time: new Date(asg.date || asg.dueDate || Date.now())
                    });
                } else if (asg.status === 'En Proceso') {
                    timelineEvents.push({
                        user: empName,
                        photo,
                        action: `inició la tarea "${asg.title}" para ${asg.client}`,
                        time: new Date(asg.date || Date.now())
                    });
                }
            });

            sopSubmissions.forEach(sub => {
                timelineEvents.push({
                    user: sub.userName || 'Miembro',
                    photo: '',
                    action: `completó el SOP "${sub.sopTitle}"`,
                    time: new Date(sub.completedAt || Date.now())
                });
            });

            timelineEvents.sort((a, b) => b.time - a.time);
            const displayEvents = timelineEvents.slice(0, 5);

            const timelineList = h('div', { className: 'flex-column gap-4 mt-2' }, 
                displayEvents.length > 0 ? displayEvents.map(ev => {
                    const timeString = ev.time.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
                    return h('div', { className: 'flex gap-3 items-center' }, [
                        ev.photo 
                            ? h('img', { src: ev.photo, className: 'sidebar-user-avatar', style: { width: '28px', height: '28px' } })
                            : h('div', { className: 'sidebar-user-avatar-fallback', style: { width: '28px', height: '28px', fontSize: '10px' } }, [icon('user', 10)]),
                        h('div', { className: 'flex-1 flex-column' }, [
                            h('div', { className: 'text-xs text-primary' }, [
                                h('strong', {}, ev.user), ' ', h('span', { className: 'text-secondary' }, ev.action)
                            ]),
                            h('span', { className: 'text-[10px] text-muted' }, timeString)
                        ])
                    ]);
                }) : [h('p', { className: 'text-xs text-muted italic p-4' }, 'Sin actividad registrada hoy.')]
            );

            // 4. Right Column (30%) Quick Info panels
            const recordings = assignments.filter(a => a.type === 'Grabación' && a.status !== 'Completado' && a.status !== 'Archivado')
                .sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate))
                .slice(0, 3);

            const deadLines = activeAssignments.sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate))
                .slice(0, 3);

            const pendingUsers = usersList.filter(u => u.approved === false).slice(0, 3);

            const rightPanel = h('div', { className: 'flex-column gap-6' }, [
                // Upcoming recordings
                h('div', { className: 'flex-column gap-2' }, [
                    h('h4', { className: 'text-[11px] font-bold uppercase tracking-wider text-muted' }, 'Próximas grabaciones'),
                    h('div', { className: 'flex-column gap-2' }, 
                        recordings.length > 0 ? recordings.map(rec => {
                            const emp = usersList.find(u => u.uid === rec.employeeId);
                            const name = emp ? (emp.nombre || emp.email.split('@')[0]) : 'Sin Asignar';
                            return h('div', { className: 'card p-2 flex justify-between items-center text-xs' }, [
                                h('div', {}, [
                                    h('div', { className: 'font-semibold' }, rec.client),
                                    h('div', { className: 'text-[10px] text-muted' }, `Asignado a: ${name}`)
                                ]),
                                h('span', { className: 'text-accent font-medium' }, new Date(rec.dueDate).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }))
                            ]);
                        }) : [h('span', { className: 'text-xs text-muted italic' }, 'No hay grabaciones programadas.')]
                    )
                ]),
                // Deadlines
                h('div', { className: 'flex-column gap-2' }, [
                    h('h4', { className: 'text-[11px] font-bold uppercase tracking-wider text-muted' }, 'Próximos vencimientos'),
                    h('div', { className: 'flex-column gap-2' }, 
                        deadLines.length > 0 ? deadLines.map(dl => {
                            return h('div', { className: 'card p-2 flex justify-between items-center text-xs' }, [
                                h('span', { className: 'font-semibold truncate', style: { maxWidth: '140px' } }, dl.title),
                                h('span', { className: 'badge badge-warning text-[10px]' }, new Date(dl.dueDate).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }))
                            ]);
                        }) : [h('span', { className: 'text-xs text-muted italic' }, 'No hay vencimientos pendientes.')]
                    )
                ]),
                // Pending Users (Admin only)
                isAdmin ? h('div', { className: 'flex-column gap-2' }, [
                    h('h4', { className: 'text-[11px] font-bold uppercase tracking-wider text-muted' }, 'Usuarios pendientes'),
                    h('div', { className: 'flex-column gap-2' }, 
                        pendingUsers.length > 0 ? pendingUsers.map(pu => {
                            return h('div', { className: 'card p-2 flex justify-between items-center text-xs' }, [
                                h('span', { className: 'font-semibold' }, pu.nombre || pu.email),
                                h('button', { 
                                    className: 'btn btn-primary text-[10px] py-1 px-2', 
                                    onClick: () => window.location.hash = '#admin' 
                                }, 'Aprobar')
                            ]);
                        }) : [h('span', { className: 'text-xs text-muted italic' }, 'No hay usuarios pendientes.')]
                    )
                ]) : null
            ]);

            // 5. Build two column structure (70% Timeline, 30% Quick info)
            const splitPanel = h('div', { 
                className: 'flex gap-6 flex-wrap', 
                style: { display: 'flex', width: '100%' } 
            }, [
                h('div', { 
                    className: 'card', 
                    style: { flex: '7', minWidth: '320px', padding: '1.5rem' } 
                }, [
                    h('h3', { className: 'text-xs font-bold uppercase tracking-wider text-secondary mb-4 border-bottom pb-2' }, 'Actividad reciente'),
                    timelineList
                ]),
                h('div', { 
                    style: { flex: '3', minWidth: '240px' } 
                }, [rightPanel])
            ]);

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

            const chartSection = h('div', { className: 'card p-6 flex-column gap-4' }, [
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
            container.appendChild(splitPanel);
            container.appendChild(chartSection);

            if (window.lucide) window.lucide.createIcons();

        } catch (err) {
            console.error("Dashboard render failed:", err);
            container.innerHTML = `<div class="error-state text-sm p-10">${String(err.message || '').replace(/</g, "&lt;")}</div>`;
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

const createQuickAction = (iconName, title, desc, onClickHandler) => {
    return h('button', { 
        className: 'card interactive-card flex items-center gap-3 w-full text-left p-3',
        onClick: onClickHandler 
    }, [
        h('div', { className: 'btn-icon flex items-center justify-center font-bold text-primary bg-tertiary', style: { width: '32px', height: '32px', borderRadius: '6px' } }, [
            icon(iconName, 16)
        ]),
        h('div', { className: 'flex-1' }, [
            h('div', { className: 'font-bold text-sm text-primary' }, title),
            h('div', { className: 'text-xs text-muted mt-1' }, desc)
        ]),
        icon('chevron-right', 14, 'text-muted')
    ]);
};

const getStatusColor = (status) => {
    if (status === 'Completado') return 'var(--success)';
    if (status === 'En Proceso' || status === 'En Edición') return 'var(--info)';
    return 'var(--warning)';
};

const getStatusClass = (status) => {
    if (status === 'Completado') return 'success';
    if (status === 'En Proceso' || status === 'En Edición') return 'info';
    return 'warning';
};
