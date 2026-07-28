import { beforeEach, describe, expect, it } from 'vitest';

import { store } from '../js/store.js';
import { router, routes } from '../js/router.js';

describe('router', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        window.location.hash = '';
        store.setState({
            user: null,
            roles: [],
            params: {},
            currentView: 'dashboard'
        });
    });

    it('matches static routes', () => {
        const result = router.findMatch('dashboard');

        expect(result).toEqual({
            route: routes.find(route => route.path === 'dashboard'),
            params: {}
        });
    });

    it('extracts dynamic and query-string parameters', () => {
        const result = router.findMatch(
            'client/client-7?context=campaign&tab=assets'
        );

        expect(result.route.module).toBe('clientDetail');
        expect(result.params).toEqual({
            id: 'client-7',
            context: 'campaign',
            tab: 'assets'
        });
    });

    it('returns null for unknown paths', () => {
        expect(router.findMatch('not-a-route')).toBeNull();
    });

    it('updates active navigation links for the current section', () => {
        document.body.innerHTML = `
            <a class="nav-item" href="#clients">Clients</a>
            <a class="nav-item active" href="#billing">Billing</a>
            <a class="nav-item" href="">Empty</a>
        `;

        router.updateActiveLinks('clients/client-7');

        const links = document.querySelectorAll('.nav-item');
        expect(links[0].classList.contains('active')).toBe(true);
        expect(links[1].classList.contains('active')).toBe(false);
        expect(links[2].classList.contains('active')).toBe(false);
    });

    it('renders an authentication loader when there is no current user', async () => {
        document.body.innerHTML = '<main id="router-view"></main>';
        window.location.hash = '#dashboard';

        await router.handleRoute();

        expect(document.querySelector('#router-view .loader')).not.toBeNull();
    });

    it('renders access denied for roles without permission', async () => {
        document.body.innerHTML = `
            <h1 id="page-title"></h1>
            <p id="page-subtitle"></p>
            <main id="router-view"></main>
        `;
        store.setState({
            user: { uid: 'viewer', role: 'viewer' },
            roles: [{ id: 'viewer', allowedModules: ['dashboard'] }]
        });
        window.location.hash = '#clients';

        await router.handleRoute();

        expect(document.getElementById('router-view').textContent).toContain('Acceso Denegado');
        expect(document.getElementById('page-title').textContent).toBe('Acceso Restringido');
        expect(document.getElementById('page-subtitle').textContent).toBe('');
    });
});
