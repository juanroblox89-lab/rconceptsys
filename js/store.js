/**
 * Creative Production OS - Centralized State Management
 */

class Store {
    constructor() {
        this.state = {
            user: null, // Set on auth change
            authLoading: true,
            ui: {
                sidebarOpen: window.innerWidth > 1024,
                currentTheme: 'dark',
                activeTab: 'dashboard'
            },
            currentView: "dashboard",
            params: {}, // For dynamic routes like /clients/:id
            metrics: {
                activeFormats: 12,
                recentHooks: 45,
                activeClients: 8,
                monthlyInvoiced: 'COP 48.000.000'
            }
        };
        this.listeners = [];
    }

    getState() {
        return this.state;
    }

    setState(newState) {
        // Deep merge for UI state
        if (newState.ui) {
            newState.ui = { ...this.state.ui, ...newState.ui };
        }
        this.state = { ...this.state, ...newState };
        this.notify();
    }

    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    notify() {
        this.listeners.forEach(listener => listener(this.state));
    }
}

export const store = new Store();
