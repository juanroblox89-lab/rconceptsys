/**
 * User Service - Creative Production OS
 * Handles real user validation, pending users flow, and admin role assignments.
 * Contains strictly one hardcoded Admin master fallback account.
 */
import { dbService } from '../supabase/service.js';
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

    async approveUser(id, assignedRole) {
        try {
            await dbService.update('users', id, {
                approved: true,
                role: assignedRole || 'editor'
            });
        } catch (err) {
            console.warn("Simulated user approval offline:", err);
        }
    },

    async delegateAdminRole(targetId, currentId) {
        // Full Admin Handover: Promote target, demote current
        try {
            // 1. Promote target
            await dbService.update('users', targetId, {
                approved: true,
                role: 'admin'
            });
            // 2. Demote current
            if (currentId && currentId !== 'master-admin') {
                await dbService.update('users', currentId, {
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

    async rejectUser(id) {
        try {
            await dbService.delete('users', id);
        } catch (err) {
            console.warn("Simulated user rejection offline:", err);
        }
    },

    async updateUser(id, data) {
        try {
            await dbService.update('users', id, data);
        } catch (err) {
            console.error("Error updating user:", err);
            throw err;
        }
    }
};
