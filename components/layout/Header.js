import { h, icon } from '../../utils/dom.js';
import { store } from '../../js/store.js';
import { userService } from '../../services/userService.js';

export const Header = () => {
    const toggleSidebar = () => {
        const { ui } = store.getState();
        store.setState({ ui: { ...ui, sidebarOpen: !ui.sidebarOpen } });
    };

    const { user } = store.getState();

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
            // User role chip - Consolidated with quick-switch for testing
            user?.role === 'admin' 
                ? h('span', { 
                    className: 'badge badge-success text-xs px-2 cursor-pointer',
                    title: 'Cambiar Rol (Dev Mode)',
                    onClick: async () => {
                        const newRole = prompt('Modo Dev: Ingresa tu nuevo rol (admin, camarógrafo, editor, estratega, diseñador):', user.role);
                        if(newRole) { await userService.updateUserProfile({role: newRole.toLowerCase()}); window.location.reload(); }
                    }
                }, [icon('shield-check', 11), h('span', { className: 'ml-1' }, 'ADMIN')])
                : h('span', { 
                    className: `badge ${user?.approved ? 'badge-info' : 'badge-warning'} text-xs cursor-pointer`,
                    title: 'Cambiar Rol (Dev Mode)',
                    onClick: async () => {
                        const newRole = prompt('Modo Dev: Ingresa tu nuevo rol (admin, camarógrafo, editor, estratega, diseñador):', user?.role);
                        if(newRole) { await userService.updateUserProfile({role: newRole.toLowerCase(), approved: true}); window.location.reload(); }
                    }
                }, user?.approved ? user?.role?.toUpperCase() : 'PENDIENTE'),

            // Search button — Premium with KBD hint
            h('button', {
                className: 'btn btn-outline flex items-center gap-2 px-3',
                id: 'global-search-trigger',
                title: 'Buscar (Ctrl+K)',
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
