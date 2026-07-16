import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadStore = async (innerWidth = 1280) => {
    vi.resetModules();
    Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: innerWidth
    });
    return (await import('../js/store.js')).store;
};

describe('store', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('initializes responsive UI state from the viewport width', async () => {
        const desktopStore = await loadStore(1440);
        expect(desktopStore.getState().ui.sidebarOpen).toBe(true);

        const mobileStore = await loadStore(768);
        expect(mobileStore.getState().ui.sidebarOpen).toBe(false);
    });

    it('returns a clone that cannot mutate the stored state', async () => {
        const store = await loadStore();
        const snapshot = store.getState();

        snapshot.ui.activeTab = 'billing';
        snapshot.metrics.activeClients = 999;

        expect(store.getState().ui.activeTab).toBe('dashboard');
        expect(store.getState().metrics.activeClients).toBe(8);
    });

    it('merges nested objects while replacing route params completely', async () => {
        const store = await loadStore();

        store.setState({
            ui: { activeTab: 'clients' },
            params: { clientId: 'client-1', stale: true }
        });
        store.setState({
            metrics: { activeClients: 12 },
            params: { assignmentId: 'assignment-2' }
        });

        const state = store.getState();
        expect(state.ui).toMatchObject({
            sidebarOpen: true,
            currentTheme: 'dark',
            activeTab: 'clients'
        });
        expect(state.metrics).toMatchObject({
            activeFormats: 12,
            activeClients: 12
        });
        expect(state.params).toEqual({ assignmentId: 'assignment-2' });
    });

    it('notifies subscribers and stops after unsubscribe', async () => {
        const store = await loadStore();
        const listener = vi.fn();
        const unsubscribe = store.subscribe(listener);

        store.setState({ currentView: 'clients' });
        unsubscribe();
        store.setState({ currentView: 'billing' });

        expect(listener).toHaveBeenCalledOnce();
        expect(listener.mock.calls[0][0].currentView).toBe('clients');
    });
});
