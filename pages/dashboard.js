/**
 * Dashboard Page - Creative Production OS
 * Notion Light UI supporting core dynamic operations triggers and real-time production analytics.
 */
import { h, icon } from '../utils/dom.js';
import { store } from '../js/store.js';
import { Table } from '../components/ui/Table.js';

export const render = () => {
    const { metrics, user } = store.getState();
    const isAdmin = user?.role === 'admin';
    
    // 1. Metrics Grid
    const metricsGrid = h('div', { className: 'metrics-grid' }, [
        createMetricCard('Formatos Activos', metrics?.activeFormats || 12, 'trending-up', 'var(--success)', '+2 esta semana'),
        createMetricCard('Hooks Documentados', metrics?.recentHooks || 45, 'zap', 'var(--warning)', 'Actualizado hoy'),
        createMetricCard('Clientes Activos', metrics?.activeClients || 8, 'users', 'var(--info)', '3 en grabación'),
        createMetricCard('Asignaciones Activas', `${metrics?.activeAssignments || 3} Tareas`, 'clock', 'var(--info)', 'En producción')
    ]);

    // 2. Production Activity Table
    const activityTable = Table({
        headers: ['Proyecto / Cliente', 'Formato Asignado', 'Estado de Entrega', 'Responsable'],
        data: [
            { id: 1, name: 'Gimnasio Elite - Reels Gancho', format: 'RC-01', status: 'En Edición', editor: '@carlos', color: 'var(--info)' },
            { id: 2, name: 'Barbería Classic - Shorts', format: 'ED-02', status: 'Entregado', editor: '@miguel', color: 'var(--success)' },
            { id: 3, name: 'Clínica Dental - Recorrido', format: 'RC-01', status: 'Grabando', editor: '@cámara', color: 'var(--warning)' },
        ],
        renderRow: (item) => h('tr', { key: item.id }, [
            h('td', { className: 'flex items-center gap-2 font-semibold text-xs' }, [
                h('div', { style: { width: '6px', height: '6px', borderRadius: '50%', background: item.color } }),
                h('span', {}, item.name)
            ]),
            h('td', { className: 'text-xs' }, item.format),
            h('td', {}, [
                h('span', { className: `badge badge-${getStatusClass(item.status)} text-xs` }, item.status)
            ]),
            h('td', { className: 'text-xs text-muted font-medium' }, item.editor)
        ])
    });

    // 3. Assemble Dashboard view
    const container = h('div', { className: 'fade-in flex-column gap-6' }, [
        // Main overview banner
        h('div', { className: 'p-6 bg-secondary border-radius-md flex justify-between items-center flex-wrap gap-4', style: { border: '1px solid var(--border)', borderRadius: '12px', background: 'linear-gradient(135deg, var(--bg-secondary) 0%, #fff 100%)' } }, [
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
        ]),

        metricsGrid,

        h('div', { className: 'grid', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' } }, [
            h('section', { style: { flex: '2', minWidth: '320px' } }, [
                h('div', { className: 'flex justify-between items-center mb-3' }, [
                    h('h3', { className: 'text-xs font-bold uppercase tracking-wider text-secondary' }, 'Actividad de Producción en Curso'),
                    h('button', { 
                        className: 'btn btn-outline text-xs', 
                        style: { padding: '4px 8px' },
                        onClick: () => window.location.hash = '#formats' 
                    }, 'Explorar Formatos')
                ]),
                h('div', { className: 'card p-0' }, [activityTable])
            ]),

            h('aside', { style: { flex: '1', minWidth: '260px' } }, [
                h('h3', { className: 'text-xs font-bold uppercase tracking-wider text-secondary mb-3' }, 'Accesos Rápidos Funcionales'),
                h('div', { className: 'flex flex-column gap-2' }, [
                    createQuickAction('plus-square', 'Crear Nuevo Formato', 'Estandariza una estructura', () => {
                        const btn = document.getElementById('new-action-btn');
                        if (btn) btn.click();
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
        ])
    ]);

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

const getStatusClass = (status) => {
    if (status === 'Entregado') return 'success';
    if (status === 'En Edición') return 'info';
    return 'warning';
};
