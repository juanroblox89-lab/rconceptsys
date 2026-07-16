/**
 * Dashboard Page - Creative Production OS
 * Notion Light UI supporting core dynamic operations triggers and real-time production analytics.
 */
import { h, icon } from '../utils/dom.js';
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
            const totalInvoiced = invoices.reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0);
            const currentMonth = new Date().getMonth();
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

            // 6. Production over last 6 months (Linear-style line chart canvas placeholder)
            const chartSection = h('div', { className: 'card p-6 flex-column gap-4' }, [
                h('div', { className: 'flex justify-between items-center' }, [
                    h('h3', { className: 'text-xs font-bold uppercase tracking-wider text-secondary' }, 'Producción últimos 6 meses'),
                    h('span', { className: 'text-[10px] text-muted' }, 'Línea suave de videos completados')
                ]),
                h('div', { 
                    style: { height: '140px', width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }
                }, [
                    h('canvas', { id: 'dashboard-chart', style: { width: '100%', height: '120px' } })
                ])
            ]);

            // Assemble everything
            container.appendChild(greeting);
            container.appendChild(metricsGrid);
            container.appendChild(splitPanel);
            container.appendChild(chartSection);

            if (window.lucide) window.lucide.createIcons();

            // Canvas renderer for elegant smooth chart
            setTimeout(() => {
                const canvas = document.getElementById('dashboard-chart');
                if (canvas) {
                    const ctx = canvas.getContext('2d');
                    canvas.width = canvas.parentElement.clientWidth;
                    canvas.height = 120;
                    
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    
                    // Simple dummy gradient curve to look exactly like Linear
                    ctx.beginPath();
                    ctx.strokeStyle = '#3b82f6';
                    ctx.lineWidth = 3;
                    
                    const points = [
                        { x: 0, y: 100 },
                        { x: canvas.width * 0.2, y: 80 },
                        { x: canvas.width * 0.4, y: 90 },
                        { x: canvas.width * 0.6, y: 40 },
                        { x: canvas.width * 0.8, y: 60 },
                        { x: canvas.width, y: 20 }
                    ];
                    
                    ctx.moveTo(points[0].x, points[0].y);
                    for (let i = 0; i < points.length - 1; i++) {
                        const xc = (points[i].x + points[i + 1].x) / 2;
                        const yc = (points[i].y + points[i + 1].y) / 2;
                        ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
                    }
                    ctx.stroke();

                    // Fill gradient
                    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
                    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.2)');
                    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');
                    ctx.fillStyle = gradient;
                    ctx.lineTo(canvas.width, canvas.height);
                    ctx.lineTo(0, canvas.height);
                    ctx.fill();
                }
            }, 300);

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
