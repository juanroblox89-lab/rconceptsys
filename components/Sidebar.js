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
    { href: '#assignments',  icon: 'briefcase',        label: 'Mi Trabajo' },
    { href: '#workers',      icon: 'users',            label: 'Workers' },
    { href: '#clients',      icon: 'users',             label: 'Clientes' },
    { href: '#marketing',    icon: 'trending-up',       label: 'Ventas / Marketing' },
    { href: '#billing',      icon: 'credit-card',       label: 'Pagos Pendientes' },
    { href: '#assets',       icon: 'video',             label: 'Assets' },
];

// Secondary nav (sidebar only)
const secondaryNavItems = [
    { href: '#formats',      icon: 'film',              label: 'Formatos' },
    { href: '#scripts',      icon: 'file-text',         label: 'Guiones' },
    { href: '#hooks',        icon: 'zap',               label: 'Hooks' },
    { href: '#references', icon: 'bookmark',        label: 'Referencias' },
    { href: '#aiAssistant', icon: 'sparkles',          label: 'AI Assistant' },
    { href: '#admin', icon: 'shield',            label: 'Administración' },
    { href: '#profile', icon: 'user',            label: 'Mi Perfil' },
];

const checkPermission = (href) => {
    const { user, roles } = store.getState();
    const moduleId = href.replace('#', '');
    
    if (user?.role === 'admin') {
        const adminAllowed = ['dashboard', 'assignments', 'formats', 'scripts', 'hooks', 'references', 'aiAssistant', 'admin', 'workers', 'clients', 'billing', 'assets', 'marketing'];
        return adminAllowed.includes(moduleId);
    }
    
    // Find role permissions
    const currentRole = (roles || []).find(r => r.id === user?.role);
    const defaultModules = ['dashboard', 'assignments', 'aiAssistant'];
    const allowedModules = currentRole?.allowedModules || defaultModules;
    
    return allowedModules.includes(moduleId);
};

const createNavItem = ({ href, icon: iconName, label }) => {
    if (!checkPermission(href)) return null;

    const currentHash = window.location.hash || '#dashboard';
    const isActive = currentHash === href || currentHash.startsWith(href + '/');
    
    return h('a', { href, className: `nav-item${isActive ? ' active' : ''}` }, [
        icon(iconName, 17),
        h('span', {}, label)
    ]);
};

const createBottomNavItem = ({ href, icon: iconName, label }) => {
    if (!checkPermission(href)) return null;

    const currentHash = window.location.hash || '#dashboard';
    const isActive = currentHash === href || currentHash.startsWith(href + '/');
    
    return h('a', {
        href,
        className: `bottom-nav-item${isActive ? ' active' : ''}`,
        'aria-label': label
    }, [
        icon(iconName, 22),
        h('span', {}, label)
    ]);
};

export const Sidebar = () => {
    const { ui, user } = store.getState();

    // ─── Logo ──────────────────────────────────────────────
    const logoEl = h('div', {
        className: 'w-full mb-3 flex items-center justify-center sidebar-logo-container'
    }, [
        h('img', {
            src: '/logo-full.svg',
            alt: 'Rohlfing Concept',
            className: 'sidebar-logo-img'
        })
    ]);

    // Async: load logo from storage
    storageService.getLogoUrl().then(url => {
        if (url) {
            logoEl.innerHTML = '';
            logoEl.appendChild(h('img', {
                src: url,
                alt: 'Rohlfing Concept',
                className: 'sidebar-logo-img loaded',
                onerror: (e) => {
                    e.target.onerror = null;
                    e.target.src = '/logo-full.svg';
                }
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
            logoEl
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
                    className: 'flex items-center gap-2 sidebar-user-card'
                }, [
                    user.photoURL
                        ? h('img', { src: user.photoURL, className: 'sidebar-user-avatar' })
                        : h('div', { className: 'sidebar-user-avatar-fallback' }, [icon('user', 14)]),
                    h('div', { className: 'flex-column sidebar-user-info' }, [
                        h('span', {
                            className: 'text-sm font-semibold truncate'
                        }, user.nombre || user.email?.split('@')[0]),
                        h('span', {
                            className: `badge ${user.role === 'admin' ? 'badge-success' : 'badge-warning'} text-xs mt-1`
                        }, user.role === 'admin' ? 'ADMIN' : (user.approved ? user.role?.toUpperCase() : 'PENDIENTE'))
                    ]),
                    h('button', {
                        className: 'btn-icon sidebar-logout-btn',
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
                        catch { 
                            const overlay = h('div', { className: 'modal-overlay fade-in' }, [
                                h('div', { className: 'modal-container' }, [
                                    h('div', { className: 'modal-header p-4' }, [
                                        h('h3', { className: 'text-sm font-bold m-0' }, 'Error de autenticación')
                                    ]),
                                    h('div', { className: 'modal-body p-4 text-sm text-secondary' }, 'Hubo un error al intentar iniciar sesión.'),
                                    h('div', { className: 'modal-footer p-4 flex justify-end border-t border-solid' }, [
                                        h('button', { className: 'btn btn-primary text-xs', onClick: () => overlay.remove() }, 'Aceptar')
                                    ])
                                ])
                            ]);
                            document.body.appendChild(overlay);
                        }
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
        ...primaryNavItems
            .filter(item => ['#dashboard', '#assignments', '#marketing'].includes(item.href))
            .map(item => {
                const mobileItem = { ...item };
                if (mobileItem.href === '#assignments') mobileItem.label = 'Trabajo';
                if (mobileItem.href === '#marketing') mobileItem.label = 'Ventas';
                return createBottomNavItem(mobileItem);
            })
            .filter(Boolean),
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
        if (window.innerWidth <= 768) {
            if (nextUi.sidebarOpen) {
                document.body.style.overflow = 'hidden';
            } else if (!document.querySelector('.modal-overlay')) {
                document.body.style.overflow = '';
            }
        } else if (!document.querySelector('.modal-overlay')) {
            document.body.style.overflow = '';
        }
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
