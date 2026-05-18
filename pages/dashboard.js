/**
 * Dashboard Page - Creative Production OS
 * Notion Light UI supporting core dynamic operations triggers and real-time production analytics.
 */
import { h, icon } from '../utils/dom.js';
import { store } from '../js/store.js';
import { Table } from '../components/ui/Table.js';
import { dbService } from '../firebase/service.js';
import { assignmentService } from '../services/assignmentService.js';

export const render = () => {
    const { user } = store.getState();
    const container = h('div', { className: 'fade-in flex-column gap-6' });

    const loadDashboard = async () => {
        container.innerHTML = '<div class="loader mb-4"></div>';

        try {
            const isAdmin = user?.role === 'admin';
            const [formats, hooks, clients, assignments, usersList] = await Promise.all([
                dbService.getAll('formats').catch(() => []),
                dbService.getAll('hooks').catch(() => []),
                dbService.getAll('clients').catch(() => []),
                assignmentService.getAllAssignments().catch(() => []),
                (isAdmin ? dbService.getAll('users').catch(() => []) : Promise.resolve([]))
            ]);

            const activeAssignments = assignments.filter(a => a.status !== 'Completado');

            container.innerHTML = '';

            // 1. Metrics Grid
            const metricsGrid = h('div', { className: 'metrics-grid' }, [
                createMetricCard('Formatos Activos', `${formats.length}`, 'trending-up', 'var(--success)', 'Librería de formatos'),
                createMetricCard('Hooks Documentados', `${hooks.length}`, 'zap', 'var(--warning)', 'Estrategias de gancho'),
                createMetricCard('Clientes Activos', `${clients.length}`, 'users', 'var(--info)', 'Clientes registrados'),
                createMetricCard('Asignaciones Activas', `${activeAssignments.length} Tareas`, 'clock', 'var(--info)', 'En producción actual')
            ]);

            // Map editor name/emails
            const getUserDisplayName = (uid) => {
                const found = usersList.find(u => u.uid === uid);
                if (found) {
                    return found.nombre || found.email.split('@')[0];
                }
                return '@equipo';
            };

            // 2. Production Activity Table (Active Assignments)
            const activityTable = Table({
                headers: ['Cliente / Proyecto', 'Tipo de Trabajo', 'Estado', 'Responsable'],
                data: activeAssignments.slice(0, 5), // show top 5 active
                renderRow: (asg) => {
                    const statusColor = getStatusColor(asg.status);
                    return h('tr', { key: asg.id }, [
                        h('td', { className: 'flex items-center gap-2 font-semibold text-xs' }, [
                            h('div', { style: { width: '6px', height: '6px', borderRadius: '50%', background: statusColor, flexShrink: 0 } }),
                            h('span', { className: 'truncate', style: { maxWidth: '220px' } }, `${asg.client}: ${asg.title}`)
                        ]),
                        h('td', { className: 'text-xs' }, asg.type),
                        h('td', {}, [
                            h('span', { className: `badge badge-${getStatusClass(asg.status)} text-xs` }, asg.status)
                        ]),
                        h('td', { className: 'text-xs text-muted font-medium' }, getUserDisplayName(asg.employeeId))
                    ]);
                }
            });

            // Empty state row if no active tasks
            if (activeAssignments.length === 0) {
                const tbody = activityTable.querySelector('tbody');
                if (tbody) {
                    tbody.innerHTML = '<tr><td colspan="4" class="text-xs text-muted italic p-6 text-center">Sin actividades de producción en curso en este momento.</td></tr>';
                }
            }

            // Assemble main elements inside dynamic container
            const banner = h('div', { className: 'p-6 bg-secondary border-radius-md flex justify-between items-center flex-wrap gap-4', style: { border: '1px solid var(--border)', borderRadius: '12px', background: 'linear-gradient(135deg, var(--bg-secondary) 0%, #fff 100%)' } }, [
                h('div', { className: 'flex-column gap-1' }, [
                    h('div', { className: 'flex items-center gap-2 mb-1' }, [
                        h('span', { className: 'badge badge-today' }, 'SISTEMA OPERATIVO'),
                        h('div', { className: 'flex items-center gap-1 text-xs text-muted font-medium' }, [
                            h('kbd', { className: 'kbd' }, 'Ctrl'), ' + ', h('kbd', { className: 'kbd' }, 'K'),
                            h('span', { className: 'ml-1' }, 'para buscar rápido')
                        ])
                    ]),
                    h('h2', { className: 'text-primary font-bold', style: { fontSize: '1.4rem', letterSpacing: '-0.03em' } }, `Hola, ${user?.nombre || 'Líder'}.`),
                    h('p', { className: 'text-xs text-muted max-w-lg mt-1 leading-relaxed' }, 'Tu centro de mando para narrativas de alta retención. Gestiona clientes, valida facturas y controla el flujo de producción desde un solo lugar.')
                ]),
                h('div', { className: 'flex gap-2' }, [
                    h('button', { 
                        className: 'btn btn-primary text-xs px-5',
                        onClick: () => window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: 'k' }))
                    }, [icon('search', 14), h('span', {}, 'Explorar Sistema')])
                ])
            ]);

            const layoutGrid = h('div', { className: 'grid', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' } }, [
                h('section', { style: { flex: '2', minWidth: '320px' } }, [
                    h('div', { className: 'flex justify-between items-center mb-3' }, [
                        h('h3', { className: 'text-xs font-bold uppercase tracking-wider text-secondary' }, 'Actividad de Producción en Curso'),
                        h('button', { 
                            className: 'btn btn-outline text-xs', 
                            style: { padding: '4px 8px' },
                            onClick: () => window.location.hash = '#assignments' 
                        }, 'Gestionar Tareas')
                    ]),
                    h('div', { className: 'card p-0' }, [activityTable])
                ]),

                h('aside', { style: { flex: '1', minWidth: '260px' } }, [
                    h('h3', { className: 'text-xs font-bold uppercase tracking-wider text-secondary mb-3' }, 'Accesos Rápidos Funcionales'),
                    h('div', { className: 'flex flex-column gap-2' }, [
                        createQuickAction('plus-square', 'Crear Nuevo Formato', 'Estandariza una estructura', () => {
                            window.location.hash = '#formats';
                        }),
                        createQuickAction('file-text', 'Reportar Jornada / Factura', 'Control operativo de entregas', () => {
                            window.location.hash = '#billing';
                        }),
                        createQuickAction('users', 'Directorio de Clientes', 'Ver estilos y videos virales', () => {
                            window.location.hash = '#clients';
                        }),
                        createQuickAction('shield', 'Panel de Aprobación Admin', 'Revisar pendientes y Storage', () => {
                            window.location.hash = '#admin';
                        })
                    ])
                ])
            ]);

            container.appendChild(banner);
            container.appendChild(metricsGrid);
            container.appendChild(layoutGrid);

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
    return h('div', { className: 'card metric-card flex-column justify-between' }, [
        h('div', { className: 'metric-label' }, label),
        h('div', { className: 'metric-value' }, value),
        h('div', { className: 'flex items-center gap-1 mt-1 text-xs font-medium', style: { color: color } }, [
            icon(iconName, 12),
            h('span', { style: { fontSize: '0.65rem' } }, subtext)
        ])
    ]);
};

const createQuickAction = (iconName, title, desc, onClickHandler) => {
    return h('button', { 
        className: 'card flex items-center gap-3 w-full text-left transition hover-bg-tertiary', 
        style: { padding: '12px 16px', border: '1px solid var(--border)' },
        onClick: onClickHandler 
    }, [
        h('div', { className: 'btn-icon flex items-center justify-center font-bold text-primary', style: { width: '32px', height: '32px', borderRadius: '6px', background: 'var(--bg-tertiary)' } }, [
            icon(iconName, 16)
        ]),
        h('div', { className: 'flex-1' }, [
            h('div', { className: 'font-bold text-xs text-primary' }, title),
            h('div', { className: 'text-muted', style: { fontSize: '0.65rem', marginTop: '1px' } }, desc)
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
