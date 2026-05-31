/**
 * Main Application Controller - Creative Production OS
 * Handles global lifecycle, authentication state, and layout hydration.
 */
import { store } from './store.js';
import { router } from './router.js';
import { authService, dbService } from '../firebase/service.js';
import { Sidebar } from '../components/Sidebar.js';
import { Header } from '../components/layout/Header.js';
import { CommandPalette } from '../components/ui/CommandPalette.js';

const escapeHTML = (str) => String(str || '').replace(/[&<>'"]/g, 
    tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag])
);

// Debugging helper for headless testing
window.debugLog = [];
const originalLog = console.log;
console.log = (...args) => {
    window.debugLog.push(`[LOG] ${args.join(' ')}`);
    originalLog(...args);
};
const originalError = console.error;
console.error = (...args) => {
    window.debugLog.push(`[ERR] ${args.join(' ')}`);
    originalError(...args);
};

class App {
    constructor() {
        this.appContainer = document.getElementById('app');
    }

    init() {
        console.log("[CreativeOS] Initializing App...");
        
        try {
            // 1. Initial State
            store.setState({ user: null, authLoading: true });

            // Initial Loader to prevent blank screen
            if (this.appContainer) {
                this.appContainer.innerHTML = `
                    <div id="initial-loader" class="flex items-center justify-center w-full h-full bg-secondary" style="min-height: 100vh; position: fixed; inset: 0; z-index: 999; background: #0a0a0a; color: white;">
                        <div class="flex-column items-center gap-3">
                            <div class="loader" style="width:32px;height:32px; border: 3px solid #333; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                            <span class="text-xs uppercase tracking-widest font-bold">Iniciando CreativeOS...</span>
                        </div>
                    </div>
                    <style>
                        @keyframes spin { to { transform: rotate(360deg); } }
                        .flex { display: flex; }
                        .items-center { align-items: center; }
                        .justify-center { justify-content: center; }
                        .flex-column { display: flex; flex-direction: column; }
                        .gap-3 { gap: 0.75rem; }
                        .text-xs { font-size: 0.75rem; }
                        .text-muted { color: #666; }
                        .uppercase { text-transform: uppercase; }
                        .tracking-widest { letter-spacing: 0.1em; }
                        .font-bold { font-weight: bold; }
                    </style>
                `;
            }

            // 2. Auth Listener
            if (this.unsubscribeAuth) this.unsubscribeAuth();
            this.unsubscribeAuth = authService.onAuthChange(async (user) => {
                console.log("[CreativeOS] Auth State Changed:", user ? user.email : "Logged Out");
                
                if (user) {
                    try {
                        const roles = await dbService.getAll('roles');
                        store.setState({ roles });
                    } catch(err) {
                        console.error("Failed to load roles globally", err);
                        store.setState({ roles: [] });
                    }
                    
                    store.setState({ user, authLoading: false });
                    if (user.approved === true) {
                        this.renderAuthenticatedApp();
                    } else {
                        this.renderPendingApprovalScreen(user);
                    }
                } else {
                    store.setState({ user: null, authLoading: false });
                    this.renderLoginScreen();
                }
            });
        } catch (err) {
            console.error("[App] Init Failed:", err);
            document.body.innerHTML = `<div style="color:red; padding:20px;">CRITICAL INIT ERROR: ${escapeHTML(err.message)}</div>`;
        }
    }

    renderPendingApprovalScreen(user) {
        if (!this.appContainer) return;
        console.log("[App] Rendering Pending Approval Screen...");
        try {
            this.appContainer.innerHTML = '';
            
            const pendingContainer = document.createElement('div');
            pendingContainer.className = 'auth-container flex items-center justify-center bg-secondary animate-fade-in';
            pendingContainer.style.minHeight = '100vh';
            pendingContainer.style.background = '#0a0a0a';
            
            pendingContainer.innerHTML = `
                <div class="card p-10 flex-column items-center gap-6 shadow-2xl text-center" style="width: 100%; max-width: 440px; background: #121212; border-radius: 16px; color: white; border: 1px solid var(--border); box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                    <div class="brand-logo flex items-center justify-center p-3 mb-2" style="background: white; border-radius: 8px; display: inline-flex;">
                        <span style="color: #000; font-size: 0.7rem; font-weight: 900; letter-spacing: 0.15em;">ROHLFING</span>
                    </div>
                    
                    <div class="flex items-center justify-center mb-2 animate-pulse">
                        <div class="flex items-center gap-2" style="background: rgba(245, 158, 11, 0.1); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.2); padding: 6px 16px; border-radius: 30px; font-size: 0.75rem; font-weight: bold;">
                            <span style="display:inline-block; width: 6px; height: 6px; border-radius: 50%; background: #f59e0b;"></span>
                            Pendiente de Aprobación
                        </div>
                    </div>

                    <div class="text-center flex-column gap-2">
                        <h2 class="text-lg font-bold text-primary">¡Hola, ${escapeHTML(user.nombre || 'Usuario')}!</h2>
                        <p class="text-xs text-muted leading-relaxed" style="color: var(--text-secondary); max-width: 320px; margin: 0 auto;">
                            Tu cuenta ha sido creada con éxito. Para proteger la información confidencial de los clientes y las métricas de la agencia, tu acceso se encuentra actualmente en estado <strong>Pendiente</strong>.
                        </p>
                        <p class="text-xs text-muted mt-3" style="color: var(--text-muted);">
                            Por favor, solicita a un Administrador que apruebe tu solicitud en el panel de control.
                        </p>
                    </div>

                    <div class="flex gap-2 w-full mt-4">
                        <button id="check-status-btn" class="btn btn-primary flex-1 justify-center py-2.5" style="border-radius: 8px; font-weight: bold; background: var(--accent); color: white; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 0.75rem;">
                            Actualizar Estado
                        </button>
                        <button id="pending-logout-btn" class="btn btn-outline py-2.5 px-4" style="border-radius: 8px; font-weight: bold; background: transparent; border: 1px solid var(--border); color: var(--text-secondary); cursor: pointer; font-size: 0.75rem;">
                            Cerrar Sesión
                        </button>
                    </div>
                </div>
            `;
            
            this.appContainer.appendChild(pendingContainer);
            
            // Check status handler (queries Firestore for update on approved state)
            const checkStatusBtn = document.getElementById('check-status-btn');
            if (checkStatusBtn) {
                checkStatusBtn.addEventListener('click', async () => {
                    checkStatusBtn.disabled = true;
                    checkStatusBtn.textContent = 'Verificando...';
                    
                    try {
                        const freshUser = await authService.getFreshUserDoc(user.uid);
                        if (freshUser && freshUser.approved === true) {
                            store.setState({ user: freshUser });
                            this.renderAuthenticatedApp();
                        } else {
                            alert("Tu solicitud sigue pendiente. Consulta con tu administrador.");
                            checkStatusBtn.disabled = false;
                            checkStatusBtn.textContent = 'Actualizar Estado';
                        }
                    } catch (e) {
                        console.error("[Pending] Check failed:", e);
                        alert("Error al verificar el estado. Intenta de nuevo.");
                        checkStatusBtn.disabled = false;
                        checkStatusBtn.textContent = 'Actualizar Estado';
                    }
                });
            }

            // Logout handler
            const logoutBtn = document.getElementById('pending-logout-btn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', async () => {
                    try {
                        await authService.logout();
                    } catch (e) {
                        console.error("[Pending] Logout failed:", e);
                    }
                });
            }
        } catch (err) {
            console.error("[App] Render Pending Failed:", err);
        }
    }

    renderLoginScreen() {
        if (!this.appContainer) return;
        console.log("[App] Rendering Login Screen...");
        try {
            this.appContainer.innerHTML = '';
            
            const loginContainer = document.createElement('div');
            loginContainer.className = 'auth-container flex items-center justify-center bg-secondary';
            loginContainer.style.minHeight = '100vh';
            loginContainer.style.background = '#0a0a0a';
            
            loginContainer.innerHTML = `
                <div class="card p-10 flex-column items-center gap-6 shadow-xl" style="width: 100%; max-width: 400px; background: #1a1a1a; border-radius: 12px; color: white; border: 1px solid #333;">
                    <div class="brand-logo flex items-center justify-center p-4" style="background: white; border-radius: 8px; border: 1.5px solid #333;">
                        <span style="color: #000; font-size: 0.6rem; font-weight: 900; letter-spacing: 0.1em;">ROHLFING</span>
                    </div>
                    <div class="text-center">
                        <h2 class="text-xl font-bold">Creative Production OS</h2>
                        <p class="text-xs text-muted mt-2" style="color: #888;">Bienvenido de nuevo. Inicia sesión con tu cuenta corporativa de Google para continuar.</p>
                    </div>
                    <button id="google-login-btn" class="btn btn-primary w-full justify-center py-3" style="background: #3b82f6; color: white; border: none; border-radius: 6px; padding: 12px; cursor: pointer; font-weight: bold; display: flex; align-items: center; gap: 8px; justify-content: center;">
                        <svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                        Continuar con Google
                    </button>
                </div>
            `;
            
            this.appContainer.appendChild(loginContainer);
            
            const loginBtn = document.getElementById('google-login-btn');
            if (loginBtn) {
                loginBtn.addEventListener('click', async () => {
                    try {
                        await authService.loginWithGoogle();
                    } catch (e) {
                        console.error("[Login] Failed:", e);
                        alert("Error al iniciar sesión. Verifica tu conexión.");
                    }
                });
            }
        } catch (err) {
            console.error("[App] Render Login Failed:", err);
        }
    }

    renderAuthenticatedApp() {
        if (!this.appContainer) return;
        console.log("[App] Rendering Authenticated Layout...");
        try {
            // 1. Build Shell if not present
            if (!document.getElementById('sidebar-container')) {
                this.appContainer.innerHTML = `
                    <div id="sidebar-container"></div>
                    <main id="main-content">
                        <div id="header-container"></div>
                        <div id="router-view" class="fade-in"></div>
                    </main>
                `;
                
                // Inject Sidebar
                const sidebar = Sidebar();
                const sbContainer = document.getElementById('sidebar-container');
                if (sbContainer && sidebar) {
                    sbContainer.appendChild(sidebar);
                }
                
                // Inject Header
                const header = Header();
                const headContainer = document.getElementById('header-container');
                if (headContainer && header) {
                    headContainer.appendChild(header);
                }

                // Inject Command Palette
                const palette = CommandPalette();
                if (palette) {
                    this.appContainer.appendChild(palette);
                }
            }
            
            // 2. Start Router
            router.init();
            
            // 3. Hydrate Icons
            setTimeout(() => {
                if (window.lucide) {
                    console.log("[App] Creating Lucide icons...");
                    window.lucide.createIcons();
                } else {
                    console.warn("[App] Lucide not found for icon hydration.");
                }
            }, 100);
        } catch (err) {
            console.error("[App] Render Authenticated Failed:", err);
            this.appContainer.innerHTML += `<div style="color:red; padding:10px;">Layout Error: ${escapeHTML(err.message)}</div>`;
        }
    }
}

const app = new App();
window.addEventListener('DOMContentLoaded', () => {
    console.log("[DOM] DOMContentLoaded fired.");
    app.init();
});
