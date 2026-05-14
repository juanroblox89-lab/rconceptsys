/**
 * Creative Production OS - Dynamic Router
 * ESM Compatible - Works without Vite if needed.
 */
import { store } from './store.js';

export const routes = [
    { path: 'dashboard', module: 'dashboard', title: "Dashboard", subtitle: "Resumen de operaciones" },
    { path: 'assignments', module: 'assignments', title: "Asignaciones", subtitle: "Gestión operativa de equipo" },
    { path: 'formats', module: 'formats', title: "Formatos", subtitle: "Biblioteca de estructuras narrativas" },
    { path: 'hooks', module: 'hooks', title: "Hooks", subtitle: "Patrones de retención psicológica" },
    { path: 'clients', module: 'clients', title: "Clientes", subtitle: "Gestión de cuentas y estilos" },
    { path: 'client/:id', module: 'clientDetail', title: "Detalle de Cliente", subtitle: "Estrategia y assets específicos" },
    { path: 'billing', module: 'billing', title: "Pagos Pendientes", subtitle: "Control operativo y auditoría" },
    { path: 'sops', module: 'sops', title: "SOPs", subtitle: "Procesos y estándares de calidad" },
    { path: 'metrics', module: 'metrics', title: "Métricas", subtitle: "Aprendizaje basado en datos" },
    { path: 'assets', module: 'assets', title: "Assets", subtitle: "Gestión de producción" },
    { path: 'references', module: 'references', title: "Referencias", subtitle: "Inspiración curada" },
    { path: 'ai-assistant', module: 'aiAssistant', title: "AI Assistant", subtitle: "Inteligencia generativa y análisis" },
    { path: 'admin', module: 'admin', title: "Panel de Administración", subtitle: "Aprobación de usuarios y control integral" }
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
                    hooks: () => import('../pages/hooks.js'),
                    clients: () => import('../pages/clients.js'),
                    clientDetail: () => import('../pages/clientDetail.js'),
                    billing: () => import('../pages/billing.js'),
                    sops: () => import('../pages/sops.js'),
                    metrics: () => import('../pages/metrics.js'),
                    assets: () => import('../pages/assets.js'),
                    references: () => import('../pages/references.js'),
                    aiAssistant: () => import('../pages/aiAssistant.js'),
                    admin: () => import('../pages/admin.js')
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
                
                if (window.lucide) window.lucide.createIcons();
                
            } catch (error) {
                console.error(`[Router] Failed to load page: ${route.module}`, error);
                viewContainer.innerHTML = `<div class="error-state" style="padding: 40px; text-align: center; color: #ef4444;">
                    <strong>Error cargando la página</strong><br>
                    <code style="font-size: 0.75rem; color: #666;">${error.message}</code>
                </div>`;
            }
        } else {
            window.location.hash = '#dashboard';
        }
        this.updateActiveLinks(hash);
    }

    findMatch(hash) {
        for (const route of routes) {
            const pattern = route.path.replace(/:[^\s/]+/g, '([^/]+)');
            const regex = new RegExp(`^${pattern}$`);
            const match = hash.match(regex);
            if (match) {
                const params = {};
                const paramNames = (route.path.match(/:[^\s/]+/g) || []).map(p => p.slice(1));
                paramNames.forEach((name, index) => { params[name] = match[index + 1]; });
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
