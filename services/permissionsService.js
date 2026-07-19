/**
 * Permissions Service - Creative Production OS
 * Centralized permission logic for router and sidebar.
 */
import { store } from '../js/store.js';
import { MASTER_ADMIN_EMAILS } from '../supabase/client.js';

const ADMIN_MODULES = [
    'dashboard', 'assignments', 'formats', 'scripts', 'hooks', 'references',
    'aiAssistant', 'admin', 'workers', 'clients', 'billing', 'assets',
    'clientDetail', 'marketing', 'profile'
];

const DEFAULT_MODULES = ['dashboard', 'assignments', 'aiAssistant', 'profile'];

export function hasPermission(moduleId) {
    const { user, roles } = store.getState();
    if (!user) return false;

    // Normalize: remove Hash prefix and map clientDetail check to clients permission
    let cleanId = (moduleId || '').replace('#', '');
    if (cleanId === 'clientDetail') cleanId = 'clients';

    if (user.role === 'admin') {
        return ADMIN_MODULES.includes(cleanId);
    }

    const currentRole = (roles || []).find(r => r.id === user.role);
    const allowedModules = currentRole?.allowedModules || DEFAULT_MODULES;
    return allowedModules.includes(cleanId) || cleanId === 'profile';
}

export function isAdmin() {
    const { user } = store.getState();
    return user?.role === 'admin';
}

export function isMasterAdmin() {
    const { user } = store.getState();
    if (!user?.email) return false;
    return MASTER_ADMIN_EMAILS.includes(user.email.toLowerCase());
}
