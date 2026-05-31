/**
 * Sidebar + Bottom Nav — Creative Production OS
 * Desktop: fixed sidebar. Mobile: slide-in sidebar + bottom nav bar.
 */
import { h, icon } from '../utils/dom.js';
import { store } from '../js/store.js';
import { authService, storageService, dbService } from '../firebase/service.js';

// Primary nav (shown in sidebar AND bottom nav)
const primaryNavItems = [
    { href: '#dashboard',    icon: 'layout-dashboard', label: 'Dashboard' },
    { href: '#assignments',  icon: 'briefcase',        label: 'Mi Trabajo', adminLabel: 'Asignaciones' },
    { href: '#clients',      icon: 'users',             label: 'Clientes' },
    { href: '#billing',      icon: 'credit-card',       label: 'Pagos Pendientes' },
    { href: '#assets',       icon: 'video',             label: 'Assets' },
];

// Secondary nav (sidebar only)
const secondaryNavItems = [
    { href: '#formats',      icon: 'film',              label: 'Formatos' },
    { href: '#scripts',      icon: 'file-text',         label: 'Guiones' },
    { href: '#hooks',        icon: 'zap',               label: 'Hooks' },
    { href: '#sops',         icon: 'check-square',      label: 'SOPs' },
    { href: '#references',   icon: 'bookmark',          label: 'Referencias' },
    { href: '#ai-assistant', icon: 'sparkles',          label: 'AI Assistant' },
    { href: '#workers',      icon: 'users',             label: 'Workers', adminOnly: true },
    { href: '#admin',        icon: 'shield',            label: 'Admin', adminOnly: true },
];

const createNavItem = ({ href, icon: iconName, label, adminOnly, adminLabel }) => {
    const { user } = store.getState();
    if (adminOnly && user?.role !== 'admin') return null;

    const currentHash = window.location.hash || '#dashboard';
    const isActive = currentHash === href || currentHash.startsWith(href + '/');
    const finalLabel = (user?.role === 'admin' && adminLabel) ? adminLabel : label;
    const finalIcon = (user?.role === 'admin' && href === '#assignments') ? 'list-todo' : iconName;
    
    return h('a', { href, className: `nav-item${isActive ? ' active' : ''}` }, [
        icon(finalIcon, 17),
        h('span', {}, finalLabel)
    ]);
};

const createBottomNavItem = ({ href, icon: iconName, label, adminOnly, adminLabel }) => {
    const { user } = store.getState();
    if (adminOnly && user?.role !== 'admin') return null;

    const currentHash = window.location.hash || '#dashboard';
    const isActive = currentHash === href || currentHash.startsWith(href + '/');
    const finalLabel = (user?.role === 'admin' && adminLabel) ? adminLabel : label;
    const finalIcon = (user?.role === 'admin' && href === '#assignments') ? 'list-todo' : iconName;
    
    return h('a', {
        href,
        className: `bottom-nav-item${isActive ? ' active' : ''}`,
        'aria-label': finalLabel
    }, [
        icon(finalIcon, 22),
        h('span', {}, finalLabel)
    ]);
};

export const Sidebar = () => {
    const { ui, user } = store.getState();

    // ─── Logo ──────────────────────────────────────────────
    const logoEl = h('div', {
        className: 'w-full mb-3 flex items-center justify-center',
        style: { minHeight: '44px' }
    }, [
        h('div', {
            className: 'text-xs font-bold text-center tracking-widest uppercase',
            style: { 
                border: '1.5px solid var(--border)', 
                padding: '6px 14px', 
                borderRadius: '8px', 
                letterSpacing: '0.15em',
                background: 'white',
                color: '#000',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
            }
        }, 'ROHLFING CONCEPT')
    ]);

    // Async: load logo from storage
    storageService.getLogoUrl().then(url => {
        if (url) {
            logoEl.innerHTML = '';
            logoEl.appendChild(h('img', {
                src: url,
                alt: 'Rohlfing Concept',
                style: { maxHeight: '44px', width: 'auto', display: 'block', margin: '0 auto' }
            }));
        }
    }).catch(err => {
        console.warn("Using text fallback for logo:", err);
    });

    // ─── Sidebar container ─────────────────────────────────
    const sidebar = h('aside', {
        id: 'sidebar-root',
        className: `sidebar${ui.sidebarOpen ? ' open' : ''}`
    }, [
        h('div', { className: 'sidebar-logo flex-column items-start w-full' }, [
            logoEl,
            h('span', {
                className: 'text-xs text-muted text-center w-full mt-1 font-semibold uppercase tracking-wider',
                style: { fontSize: '0.6rem' }
            }, 'Agencia de Edición')
        ]),

        h('nav', { className: 'sidebar-nav' }, [
            h('div', { className: 'nav-section-label' }, 'Principal'),
            ...primaryNavItems.map(createNavItem).filter(Boolean),
            h('div', { className: 'nav-section-label' }, 'Producción'),
            ...secondaryNavItems.map(createNavItem).filter(Boolean),
        ]),

        // User footer
        h('div', { className: 'sidebar-footer flex-column gap-2' }, [
            user
                ? h('div', {
                    className: 'flex items-center gap-2',
                    style: { padding: '8px 6px', borderRadius: '6px', background: 'var(--bg-tertiary)' }
                }, [
                    user.photoURL
                        ? h('img', { src: user.photoURL, style: { width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0 } })
                        : h('div', { style: { width: '28px', height: '28px', borderRadius: '50%', background: 'var(--bg-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } }, [icon('user', 14)]),
                    h('div', { className: 'flex-column', style: { flex: 1, minWidth: 0 } }, [
                        h('span', {
                            className: 'text-xs font-semibold',
                            style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
                        }, user.nombre || user.email?.split('@')[0]),
                        h('span', {
                            className: `badge ${user.role === 'admin' ? 'badge-success' : 'badge-warning'} text-xs`,
                            style: { fontSize: '0.55rem', padding: '1px 4px', marginTop: '2px' }
                        }, user.role === 'admin' ? 'ADMIN' : (user.approved ? user.role?.toUpperCase() : 'PENDIENTE'))
                    ]),
                    h('button', {
                        className: 'btn-icon',
                        style: { width: '28px', height: '28px', flexShrink: 0 },
                        title: 'Cerrar Sesión',
                        onClick: async () => {
                            await authService.logout();
                            store.setState({ user: null });
                            window.location.reload();
                        }
                    }, [icon('log-out', 13)])
                ])
                : h('button', {
                    className: 'btn btn-primary w-full justify-center text-xs',
                    onClick: async () => {
                        try { await authService.loginWithGoogle(); }
                        catch { alert("Error al iniciar sesión."); }
                    }
                }, [icon('log-in', 14), h('span', {}, 'Acceder con Google')])
        ])
    ]);

    // ─── Overlay (mobile) ──────────────────────────────────
    const overlay = h('div', { className: 'sidebar-overlay' });
    overlay.addEventListener('click', () => {
        store.setState({ ui: { ...store.getState().ui, sidebarOpen: false } });
    });

    // ─── Bottom Nav (mobile) ───────────────────────────────
    const bottomNav = h('nav', { className: 'bottom-nav', 'aria-label': 'Navegación principal' }, [
        ...primaryNavItems.map(createBottomNavItem).filter(Boolean),
        // "Más" button opens sidebar
        h('button', {
            className: 'bottom-nav-item bottom-nav-more',
            'aria-label': 'Más opciones',
            onClick: () => {
                const { ui } = store.getState();
                store.setState({ ui: { ...ui, sidebarOpen: !ui.sidebarOpen } });
            }
        }, [
            icon('grid-2x2', 22),
            h('span', {}, 'Más')
        ])
    ]);

    // ─── Clean up previous instances to avoid memory leaks ───
    if (window._sidebarUnsubscribe) window._sidebarUnsubscribe();
    if (window._sidebarHashHandler) window.removeEventListener('hashchange', window._sidebarHashHandler);

    // ─── Store subscription: reactivity ───────────────────
    window._sidebarUnsubscribe = store.subscribe(({ ui: nextUi }) => {
        sidebar.classList.toggle('open', nextUi.sidebarOpen);
        overlay.classList.toggle('visible', nextUi.sidebarOpen);
    });

    // ─── Hash change: update active links ─────────────────
    const updateActive = () => {
        const hash = window.location.hash || '#dashboard';

        sidebar.querySelectorAll('.nav-item[href]').forEach(link => {
            const href = link.getAttribute('href');
            link.classList.toggle('active', hash === href || hash.startsWith(href + '/'));
        });

        bottomNav.querySelectorAll('.bottom-nav-item[href]').forEach(link => {
            const href = link.getAttribute('href');
            link.classList.toggle('active', hash === href || hash.startsWith(href + '/'));
        });
    };
    window._sidebarHashHandler = updateActive;
    window.addEventListener('hashchange', updateActive);

    // Wrap all together in a fragment-like div we discard from DOM (we inject separately)
    const fragment = h('div', { id: 'nav-fragment', style: { display: 'contents' } }, [
        overlay,
        sidebar,
        bottomNav
    ]);

    return fragment;
};
