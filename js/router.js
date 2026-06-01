/**
 * Creative Production OS - Dynamic Router
 * ESM Compatible - Works without Vite if needed.
 */
import { store } from './store.js';

export const routes = [
    { path: 'dashboard', module: 'dashboard', title: "Dashboard", subtitle: "Resumen de operaciones" },
    { path: 'assignments', module: 'assignments', title: "Asignaciones", subtitle: "Gestión operativa de equipo" },
    { path: 'formats', module: 'formats', title: "Formatos", subtitle: "Biblioteca de estructuras narrativas" },
    { path: 'scripts', module: 'scripts', title: "Guiones Recomendados", subtitle: "Biblioteca de copies y estructuras virales de alta retención" },
    { path: 'hooks', module: 'hooks', title: "Hooks", subtitle: "Patrones de retención psicológica" },
    { path: 'clients', module: 'clients', title: "Clientes", subtitle: "Gestión de cuentas y estilos" },
    { path: 'client/:id', module: 'clientDetail', title: "Detalle de Cliente", subtitle: "Estrategia y assets específicos" },
    { path: 'billing', module: 'billing', title: "Pagos Pendientes", subtitle: "Control operativo y auditoría" },
    { path: 'sops', module: 'sops', title: "SOPs", subtitle: "Procesos y estándares de calidad" },
    { path: 'assets', module: 'assets', title: "Assets", subtitle: "Gestión de producción" },
    { path: 'references', module: 'references', title: "Referencias", subtitle: "Inspiración curada" },
    { path: 'aiAssistant', module: 'aiAssistant', title: "AI Assistant", subtitle: "Inteligencia generativa y análisis" },
    { path: 'admin', module: 'admin', title: "Panel de Administración", subtitle: "Aprobación de usuarios y control integral" },
    { path: 'workers', module: 'workers', title: "Equipo y Productividad", subtitle: "Asignaciones y SOPs del personal" },
    { path: 'marketing', module: 'marketing', title: "Ventas y Marketing", subtitle: "Control de visitas y comisiones" }
];

class Router {
    constructor() {
        window.addEventListener('hashchange', () => this.handleRoute());
        this.lastUserRole = null;
        
        store.subscribe(({ user }) => {
            if (user && user.role !== this.lastUserRole) {
                this.lastUserRole = user.role;
                if (document.getElementById('router-view')) {
                    this.handleRoute();
                }
            }
        });
    }

    init() {
        this.handleRoute();
    }

    async handleRoute() {
        const hash = window.location.hash.slice(1) || 'dashboard';
        const match = this.findMatch(hash);

        const viewContainer = document.getElementById('router-view');
        const titleElement = document.getElementById('page-title');
        const subtitleElement = document.getElementById('page-subtitle');

        if (!viewContainer) return;

        if (match) {
            const { route, params } = match;
            
            // --- Permisos ---
            const { user, roles } = store.getState();
            let hasPermission = false;
            let requiredModule = route.module;
            if (requiredModule === 'clientDetail') requiredModule = 'clients';

            if (user?.role === 'admin') {
                const adminAllowed = ['dashboard', 'assignments', 'formats', 'scripts', 'hooks', 'sops', 'references', 'aiAssistant', 'admin', 'workers', 'clients', 'billing', 'assets', 'clientDetail'];
                hasPermission = adminAllowed.includes(requiredModule);
            } else {
                const currentRole = (roles || []).find(r => r.id === user?.role);
                const defaultModules = ['dashboard', 'assignments', 'sops', 'aiAssistant'];
                const allowedModules = currentRole?.allowedModules || defaultModules;
                hasPermission = allowedModules.includes(requiredModule);
            }

            if (!hasPermission) {
                viewContainer.innerHTML = `
                    <div class="card p-8 text-center flex-column items-center gap-3" style="max-width: 400px; margin: 40px auto;">
                        <span style="font-size:3rem">🔒</span>
                        <h3>Acceso Denegado</h3>
                        <p class="text-xs text-muted">Tu rol (${user?.role}) no tiene permisos para ver "${route.title}".</p>
                        <button class="btn btn-primary mt-2 text-xs" onclick="window.location.hash='#dashboard'">Ir al Dashboard</button>
                    </div>`;
                if (titleElement) titleElement.textContent = "Acceso Restringido";
                if (subtitleElement) subtitleElement.textContent = "";
                return;
            }
            
            if (titleElement) titleElement.textContent = route.title || "CreativeOS";
            if (subtitleElement) subtitleElement.textContent = route.subtitle || "";
            
            store.setState({ currentView: route.module, params });

            viewContainer.innerHTML = '<div class="flex items-center justify-center p-20"><div class="loader" style="width:24px;height:24px; border: 2px solid #333; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite;"></div></div>';

            try {
                // Static import map for Vite compatibility in production
                const pages = {
                    dashboard: () => import('../pages/dashboard.js'),
                    assignments: () => import('../pages/assignments.js'),
                    formats: () => import('../pages/formats.js'),
                    scripts: () => import('../pages/scripts.js'),
                    hooks: () => import('../pages/hooks.js'),
                    clients: () => import('../pages/clients.js'),
                    clientDetail: () => import('../pages/clientDetail.js'),
                    billing: () => import('../pages/billing.js'),
                    sops: () => import('../pages/sops.js'),
                    assets: () => import('../pages/assets.js'),
                    references: () => import('../pages/references.js'),
                    aiAssistant: () => import('../pages/aiAssistant.js'),
                    admin: () => import('../pages/admin.js'),
                    workers: () => import('../pages/workers.js'),
                    marketing: () => import('../pages/marketing.js')
                };

                const loadPage = pages[route.module];
                if (!loadPage) throw new Error(`Módulo no encontrado: ${route.module}`);

                const module = await loadPage();
                
                let pageElement = module.render(params);
                if (pageElement && typeof pageElement.then === 'function') {
                    pageElement = await pageElement;
                }
                
                viewContainer.innerHTML = '';
                if (pageElement instanceof HTMLElement) {
                    viewContainer.appendChild(pageElement);
                } else if (typeof pageElement === 'string') {
                    viewContainer.innerHTML = pageElement;
                }
                
                setTimeout(() => {
                    if (window.lucide) window.lucide.createIcons();
                }, 50);
                
            } catch (error) {
                console.error(`[Router] Failed to load page: ${route.module}`, error);
                
                const isImportError = error.name === 'TypeError' || 
                                     error.message.includes('Failed to fetch') ||
                                     error.message.includes('dynamically imported') ||
                                     error.message.includes('importing');
                                     
                if (isImportError) {
                    viewContainer.innerHTML = `
                        <div class="error-state text-center p-10 card flex-column items-center justify-center gap-4 bg-secondary border" style="max-width: 460px; margin: 40px auto; border-radius: 12px; border: 1px solid var(--border);">
                            <div style="background: rgba(59, 130, 246, 0.1); color: var(--accent); border-radius: 50%; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;">
                                <i data-lucide="refresh-cw" class="animate-spin" style="width: 24px; height: 24px; color: var(--accent);"></i>
                            </div>
                            <h3 class="text-md font-bold text-primary">Nueva Versión de Producción</h3>
                            <p class="text-xs text-muted leading-relaxed" style="color: var(--text-secondary);">
                                Hemos publicado actualizaciones en los módulos de la plataforma. Para asegurar que todas las marcas y herramientas creativas carguen correctamente, es necesario actualizar tu caché.
                            </p>
                            <button onclick="window.location.reload(true)" class="btn btn-primary text-xs font-bold py-2.5 px-6" style="border-radius: 8px; width: 100%; cursor: pointer;">
                                Recargar y Actualizar Aplicación
                            </button>
                        </div>
                    `;
                    if (window.lucide) window.lucide.createIcons();
                } else {
                    viewContainer.innerHTML = `<div class="error-state" style="padding: 40px; text-align: center; color: #ef4444;">
                        <strong>Error cargando la página</strong><br>
                        <code style="font-size: 0.75rem; color: #666;">${error.message}</code>
                    </div>`;
                }
            }
        } else {
            window.location.hash = '#dashboard';
        }
        this.updateActiveLinks(hash);
    }

    findMatch(hashRaw) {
        const [hash, queryString] = hashRaw.split('?');
        for (const route of routes) {
            const pattern = route.path.replace(/:[^\s/]+/g, '([^/]+)');
            const regex = new RegExp(`^${pattern}$`);
            const match = hash.match(regex);
            if (match) {
                const params = {};
                // Parse URL path params
                const paramNames = (route.path.match(/:[^\s/]+/g) || []).map(p => p.slice(1));
                paramNames.forEach((name, index) => { params[name] = match[index + 1]; });
                
                // Parse query string params (e.g. ?client=123&context=abc)
                if (queryString) {
                    const urlParams = new URLSearchParams(queryString);
                    for (const [key, value] of urlParams.entries()) {
                        params[key] = value;
                    }
                }
                
                return { route, params };
            }
        }
        return null;
    }

    updateActiveLinks(hash) {
        document.querySelectorAll('.nav-item').forEach(link => {
            const href = link.getAttribute('href')?.slice(1);
            link.classList.toggle('active', hash.startsWith(href) && href !== '');
        });
    }
}

export const router = new Router();
