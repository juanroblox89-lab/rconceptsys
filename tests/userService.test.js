import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
    delete: vi.fn(),
    getAll: vi.fn(),
    update: vi.fn()
}));

vi.mock('../supabase/service.js', () => ({
    dbService: dbMocks
}));

import { store } from '../js/store.js';
import { userService } from '../services/userService.js';

describe('userService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.stubGlobal('alert', vi.fn());
        store.setState({ user: null });
    });

    it('adds the current user when the database list omits them', async () => {
        const currentUser = { uid: 'current', nombre: 'Actual', approved: true };
        store.setState({ user: currentUser });
        dbMocks.getAll.mockResolvedValue([{ uid: 'other', nombre: 'Otra' }]);

        await expect(userService.getAllUsers()).resolves.toEqual([
            { uid: 'other', nombre: 'Otra' },
            currentUser
        ]);
    });

    it('does not duplicate the current user and handles empty results', async () => {
        const currentUser = { uid: 'current', approved: true };
        store.setState({ user: currentUser });
        dbMocks.getAll.mockResolvedValueOnce([currentUser]);

        await expect(userService.getAllUsers()).resolves.toEqual([currentUser]);

        store.setState({ user: null });
        dbMocks.getAll.mockResolvedValueOnce(null);
        await expect(userService.getAllUsers()).resolves.toEqual([]);
    });

    it('falls back to the current user when the database is unavailable', async () => {
        const currentUser = { uid: 'current', approved: true };
        store.setState({ user: currentUser });
        dbMocks.getAll.mockRejectedValue(new Error('offline'));

        await expect(userService.getAllUsers()).resolves.toEqual([currentUser]);
        expect(console.warn).toHaveBeenCalledWith(
            'Using local store user fallback:',
            expect.any(Error)
        );
    });

    it('filters pending users', async () => {
        dbMocks.getAll.mockResolvedValue([
            { uid: 'pending', approved: false },
            { uid: 'active', approved: true }
        ]);

        await expect(userService.getPendingUsers()).resolves.toEqual([
            { uid: 'pending', approved: false }
        ]);
    });

    it('approves users with an explicit or default editor role', async () => {
        await userService.approveUser('user-1', 'admin');
        await userService.approveUser('user-2');

        expect(dbMocks.update).toHaveBeenNthCalledWith(1, 'users', 'user-1', {
            approved: true,
            role: 'admin'
        });
        expect(dbMocks.update).toHaveBeenNthCalledWith(2, 'users', 'user-2', {
            approved: true,
            role: 'editor'
        });
    });

    it('hands over admin access and updates the local current user', async () => {
        store.setState({
            user: { uid: 'current-admin', role: 'admin', approved: true }
        });

        await userService.delegateAdminRole('next-admin', 'current-admin');

        expect(dbMocks.update).toHaveBeenNthCalledWith(1, 'users', 'next-admin', {
            approved: true,
            role: 'admin'
        });
        expect(dbMocks.update).toHaveBeenNthCalledWith(2, 'users', 'current-admin', {
            role: 'editor'
        });
        expect(store.getState().user.role).toBe('editor');
        expect(alert).toHaveBeenCalledWith(
            '¡Título de Administrador cedido exitosamente! Has sido reasignado como Editor.'
        );
    });

    it('does not demote the protected master admin account', async () => {
        await userService.delegateAdminRole('next-admin', 'master-admin');

        expect(dbMocks.update).toHaveBeenCalledOnce();
        expect(alert).toHaveBeenCalledOnce();
    });

    it('uses offline fallbacks for failed mutations', async () => {
        dbMocks.update.mockRejectedValue(new Error('offline'));
        await expect(userService.approveUser('user-1')).resolves.toBeUndefined();
        await expect(userService.delegateAdminRole('user-2', 'user-1')).resolves.toBeUndefined();

        dbMocks.delete.mockRejectedValue(new Error('offline'));
        await expect(userService.rejectUser('user-3')).resolves.toBeUndefined();

        expect(console.warn).toHaveBeenCalledTimes(3);
        expect(alert).toHaveBeenCalledWith('Simulación offline: Título cedido.');
    });

    it('deletes rejected users', async () => {
        await userService.rejectUser('user-4');
        expect(dbMocks.delete).toHaveBeenCalledWith('users', 'user-4');
    });
});
