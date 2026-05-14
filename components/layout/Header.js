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
            // Bypass button — compact on mobile
            h('button', {
                className: 'admin-bypass-btn',
                onClick: handleAutoAdmin,
                title: 'Acceso Admin Temporal'
            }, '⚡ ADMIN'),

            // User role chip — hidden on very small screens
            h('span', {
                id: 'mobile-role-indicator',
                className: 'badge badge-secondary sm-hide',
                style: { fontSize: '0.6rem' }
            }, user?.role?.toUpperCase() || 'VIEWER'),

            // Search button — desktop only
            h('button', {
                className: 'btn-icon',
                id: 'global-search-btn',
                title: 'Buscar',
                style: { display: 'none' } // hidden until search is wired up
            }, [icon('search', 16)])
        ])
    ]);

    return header;
};
