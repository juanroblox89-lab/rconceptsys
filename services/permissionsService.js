/**
 * Permissions Service - Creative Production OS
 * Centralized permission logic for router and sidebar.
 */
import { store } from '../js/store.js';

const ADMIN_MODULES = [
    'dashboard', 'assignments', 'formats', 'scripts', 'hooks', 'references',
    'aiAssistant', 'admin', 'workers', 'clients', 'billing', 'assets',
    'clientDetail', 'marketing', 'profile'
];

const DEFAULT_MODULES = ['dashboard', 'assignments', 'aiAssistant', 'profile'];

export function hasPermission(moduleId) {
    const { user, roles } = store.getState();
    if (!user) return false;

    if (user.role === 'admin') {
        return ADMIN_MODULES.includes(moduleId);
    }

    const currentRole = (roles || []).find(r => r.id === user.role);
    const allowedModules = currentRole?.allowedModules || DEFAULT_MODULES;
    return allowedModules.includes(moduleId) || moduleId === 'profile';
}

export function isAdmin() {
    const { user } = store.getState();
    return user?.role === 'admin';
}

export function canManageAdmins() {
    return isAdmin();
}
