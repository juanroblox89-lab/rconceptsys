/**
 * Main Application Controller - Creative Production OS
 * Handles global lifecycle, authentication state, and layout hydration.
 */
import { store } from './store.js';
import { router } from './router.js';
import { authService } from '../firebase/service.js';
import { Sidebar } from '../components/Sidebar.js';
import { Header } from '../components/layout/Header.js';
import { CommandPalette } from '../components/ui/CommandPalette.js';

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
            authService.onAuthChange((user) => {
                console.log("[CreativeOS] Auth State Changed:", user ? user.email : "Logged Out");
                
                if (user) {
                    store.setState({ user, authLoading: false });
                    this.renderAuthenticatedApp();
                } else {
                    store.setState({ user: null, authLoading: false });
                    this.renderLoginScreen();
                }
            });
        } catch (err) {
            console.error("[App] Init Failed:", err);
            document.body.innerHTML = `<div style="color:red; padding:20px;">CRITICAL INIT ERROR: ${err.message}</div>`;
        }
    }

    renderLoginScreen() {
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
            this.appContainer.innerHTML += `<div style="color:red; padding:10px;">Layout Error: ${err.message}</div>`;
        }
    }
}

const app = new App();
window.addEventListener('DOMContentLoaded', () => {
    console.log("[DOM] DOMContentLoaded fired.");
    app.init();
});
