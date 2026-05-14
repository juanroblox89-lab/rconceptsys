import { h, icon } from '../../utils/dom.js';
import { store } from '../../js/store.js';
import { userService } from '../../services/userService.js';

export const Header = () => {
    const toggleSidebar = () => {
        const { ui } = store.getState();
        store.setState({ ui: { ...ui, sidebarOpen: !ui.sidebarOpen } });
    };

    const { user } = store.getState();

    const handleAutoAdmin = async () => {
        const ok = window.confirm("¿Promover todos los pendientes a ADMIN? (Bypass temporal)");
        if (ok) {
            try {
                const count = await userService.promoteAllPendingToAdmin();
                if (user && user.role !== 'admin') {
                    await userService.approveUser(user.uid, 'admin');
                }
                alert(`✅ ${count} usuarios promovidos. Recargando...`);
                window.location.reload();
            } catch (err) {
                alert("Error en la promoción. Revisa la consola.");
            }
        }
    };

    const header = h('header', { className: 'global-header' }, [
        // Left: Hamburger (mobile) + Page title
        h('div', { className: 'flex items-center gap-3', style: { minWidth: 0, flex: 1 } }, [
            // Hamburger — only visible on mobile
            h('button', {
                className: 'btn-icon md-hide',
                onClick: toggleSidebar,
                title: 'Menú',
                'aria-label': 'Abrir menú'
            }, [icon('menu', 20)]),

            h('div', { className: 'page-title-group' }, [
                h('h1', { id: 'page-title' }, 'Dashboard'),
                h('p', { id: 'page-subtitle' }, 'Resumen operativo')
            ])
        ]),

        // Right: Actions
        h('div', { className: 'flex items-center gap-2', style: { flexShrink: 0 } }, [
            // Bypass button — subtle green
            h('button', {
                className: 'admin-bypass-btn',
                style: { background: 'var(--success)', fontSize: '0.55rem', padding: '4px 8px' },
                onClick: handleAutoAdmin,
                title: 'Acceso Admin Temporal'
            }, '⚡ BYPASS'),

            // User role chip - Consolidated
            user?.role === 'admin' 
                ? h('span', { className: 'badge badge-success', style: { fontSize: '0.65rem', padding: '3px 8px' } }, [icon('shield-check', 11), h('span', { className: 'ml-1' }, 'ADMIN')])
                : h('span', { className: `badge ${user?.approved ? 'badge-info' : 'badge-warning'}`, style: { fontSize: '0.65rem' } }, user?.approved ? user?.role?.toUpperCase() : 'PENDIENTE'),

            // Search button — Premium with KBD hint
            h('button', {
                className: 'btn-icon flex items-center gap-2 px-3',
                id: 'global-search-trigger',
                title: 'Buscar (Ctrl+K)',
                style: { width: 'auto', background: 'var(--bg-secondary)', border: '1px solid var(--border)' },
                onClick: () => window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: 'k' }))
            }, [
                icon('search', 16, 'text-muted'),
                h('span', { className: 'text-xs text-muted font-medium sm-hide' }, 'Buscar...'),
                h('kbd', { className: 'kbd sm-hide', style: { marginLeft: '4px' } }, 'Ctrl+K')
            ])
        ])
    ]);

    return header;
};
