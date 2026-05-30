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
                activeAssignments: 3
            }
        };
        this.listeners = [];
    }

    getState() {
        return this.state;
    }

    setState(newState) {
        const nextState = { ...this.state };
        for (const key in newState) {
            if (newState[key] && typeof newState[key] === 'object' && !Array.isArray(newState[key]) && this.state[key]) {
                nextState[key] = { ...this.state[key], ...newState[key] };
            } else {
                nextState[key] = newState[key];
            }
        }
        this.state = nextState;
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
