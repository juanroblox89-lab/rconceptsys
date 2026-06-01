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
                    <div id="initial-loader" class="fullscreen-loader flex items-center justify-center w-full h-full">
                        <div class="flex-column items-center gap-3">
                            <div class="loader-ring"></div>
                            <span class="text-xs uppercase tracking-widest font-bold">Iniciando CreativeOS...</span>
                        </div>
                    </div>
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
            pendingContainer.className = 'auth-container flex items-center justify-center animate-fade-in';
            
            pendingContainer.innerHTML = `
                <div class="auth-card flex-column items-center gap-6 text-center">
                    <div class="brand-logo-box flex items-center justify-center">
                        <span class="brand-logo-text">ROHLFING</span>
                    </div>
                    
                    <div class="flex items-center justify-center mb-2 animate-pulse">
                        <div class="status-badge-pending flex items-center gap-2">
                            <span class="status-dot"></span>
                            Pendiente de Aprobación
                        </div>
                    </div>

                    <div class="text-center flex-column gap-2">
                        <h2 class="text-lg font-bold text-primary">¡Hola, ${escapeHTML(user.nombre || 'Usuario')}!</h2>
                        <p class="text-xs text-muted leading-relaxed" style="max-width: 320px; margin: 0 auto;">
                            Tu cuenta ha sido creada con éxito. Para proteger la información confidencial de los clientes y las métricas de la agencia, tu acceso se encuentra actualmente en estado <strong>Pendiente</strong>.
                        </p>
                        <p class="text-xs text-muted mt-3">
                            Por favor, solicita a un Administrador que apruebe tu solicitud en el panel de control.
                        </p>
                    </div>

                    <div class="flex gap-2 w-full mt-4">
                        <button id="check-status-btn" class="btn btn-primary flex-1 py-2.5">
                            Actualizar Estado
                        </button>
                        <button id="pending-logout-btn" class="btn btn-outline py-2.5 px-4">
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
            loginContainer.className = 'auth-container flex items-center justify-center';
            
            loginContainer.innerHTML = `
                <div class="auth-card flex-column items-center gap-6">
                    <div class="brand-logo-box flex items-center justify-center">
                        <span class="brand-logo-text">ROHLFING</span>
                    </div>
                    <div class="text-center">
                        <h2 class="text-xl font-bold">Creative Production OS</h2>
                        <p class="text-xs text-muted mt-2">Bienvenido de nuevo. Inicia sesión con tu cuenta corporativa de Google para continuar.</p>
                    </div>
                    <button id="google-login-btn" class="btn btn-primary w-full py-3 mt-4 text-sm gap-2">
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

            // 4. Mandatory Phone Number Check
            const currentUser = store.getState().user;
            if (currentUser && !currentUser.phone) {
                this.renderPhoneModal(currentUser);
            }
        } catch (err) {
            console.error("[App] Render Authenticated Failed:", err);
            this.appContainer.innerHTML += `<div style="color:red; padding:10px;">Layout Error: ${escapeHTML(err.message)}</div>`;
        }
    }

    renderPhoneModal(user) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.zIndex = '9999'; // Ensure it's on top of everything
        
        overlay.innerHTML = `
            <div class="modal-container text-center flex-column items-center gap-4" style="max-width: 400px; padding: 2rem;">
                <div style="background: rgba(var(--accent-rgb), 0.1); color: var(--accent); border-radius: 50%; width: 64px; height: 64px; display: flex; align-items: center; justify-content: center; margin: 0 auto;">
                    <i data-lucide="smartphone" style="width: 32px; height: 32px;"></i>
                </div>
                <h3 class="text-lg font-bold">Último Paso</h3>
                <p class="text-xs text-muted">Para habilitar el contacto directo con el equipo, por favor ingresa tu número de WhatsApp (incluyendo el código de país, ej. +57300...).</p>
                <input type="tel" id="mandatory-phone-input" class="form-input w-full text-center" placeholder="+00 000000000" />
                <button id="save-phone-btn" class="btn btn-primary w-full py-2 mt-2">Guardar Número</button>
            </div>
        `;
        
        document.body.appendChild(overlay);
        if (window.lucide) window.lucide.createIcons();

        const btn = document.getElementById('save-phone-btn');
        const input = document.getElementById('mandatory-phone-input');

        btn.addEventListener('click', async () => {
            const phone = input.value.trim();
            if (!phone || phone.length < 8) {
                alert('Por favor ingresa un número de teléfono válido.');
                return;
            }
            btn.disabled = true;
            btn.textContent = 'Guardando...';
            try {
                await dbService.update('users', user.uid, { phone });
                const updatedUser = { ...user, phone };
                store.setState({ user: updatedUser });
                document.body.removeChild(overlay);
            } catch (err) {
                console.error("Error saving phone:", err);
                alert("Error al guardar el teléfono.");
                btn.disabled = false;
                btn.textContent = 'Guardar Número';
            }
        });
    }
}

const app = new App();
window.addEventListener('DOMContentLoaded', () => {
    console.log("[DOM] DOMContentLoaded fired.");
    app.init();
});
