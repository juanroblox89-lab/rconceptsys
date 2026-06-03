/**
 * User Service - Creative Production OS
 * Handles real user validation, pending users flow, and admin role assignments.
 * Contains strictly one hardcoded Admin master fallback account.
 */
import { dbService } from '../firebase/service.js';
import { store } from '../js/store.js';

export const userService = {
    async getAllUsers() {
        try {
            const list = await dbService.getAll('users');
            const currentUser = store.getState().user;
            
            let result = list || [];
            
            // Ensure the current user is in the list for administrative visibility
            if (currentUser && !result.some(u => (u.uid || u.id) === currentUser.uid)) {
                result.push(currentUser);
            }
            
            return result;
        } catch (err) {
            console.warn("Using local store user fallback:", err);
            const currentUser = store.getState().user;
            return currentUser ? [currentUser] : [];
        }
    },

    async getPendingUsers() {
        const all = await this.getAllUsers();
        return all.filter(u => u.approved === false);
    },

    async approveUser(uid, assignedRole) {
        try {
            await dbService.update('users', uid, {
                approved: true,
                role: assignedRole || 'editor'
            });
        } catch (err) {
            console.warn("Simulated user approval offline:", err);
        }
    },

    async delegateAdminRole(targetUid, currentUid) {
        // Full Admin Handover: Promote target, demote current
        try {
            // 1. Promote target
            await dbService.update('users', targetUid, {
                approved: true,
                role: 'admin'
            });
            // 2. Demote current
            if (currentUid && currentUid !== 'master-admin') {
                await dbService.update('users', currentUid, {
                    role: 'editor'
                });
                const currentUser = store.getState().user;
                if (currentUser) {
                    store.setState({ user: { ...currentUser, role: 'editor' } });
                }
            }
            alert("¡Título de Administrador cedido exitosamente! Has sido reasignado como Editor.");
        } catch (err) {
            console.warn("Offline admin handover simulation:", err);
            alert("Simulación offline: Título cedido.");
        }
    },

    async rejectUser(uid) {
        try {
            await dbService.delete('users', uid);
        } catch (err) {
            console.warn("Simulated user rejection offline:", err);
        }
    }
};
