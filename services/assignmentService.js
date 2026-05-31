/**
 * Assignment Service - Creative Production OS
 * Handles operational task assignments for recordings and edits.
 * Includes auto-deletion logic for tasks 2 days past their deadline.
 */
import { dbService } from '../firebase/service.js';

export const assignmentService = {
    async getAllAssignments() {
        try {
            const list = await dbService.getAll('assignments');
            return list || [];
        } catch (err) {
            console.warn("Error fetching live assignments from DB:", err);
            return [];
        }
    },

    async getAssignmentsByEmployee(employeeId) {
        try {
            const list = await dbService.getByQuery('assignments', 'employeeId', '==', employeeId);
            return list || [];
        } catch (err) {
            console.warn(`Error fetching assignments for employee ${employeeId}:`, err);
            return [];
        }
    },

    async getAssignmentsByClient(clientName) {
        try {
            const list = await dbService.getByQuery('assignments', 'client', '==', clientName);
            return list || [];
        } catch (err) {
            console.warn(`Error fetching assignments for client ${clientName}:`, err);
            return [];
        }
    },

    async saveAssignment(data) {
        const newAsg = {
            id: data.id || `ASG-${crypto.randomUUID().split('-')[0]}`,
            employeeId: data.employeeId,
            type: data.type || 'Edición', // 'Grabación' | 'Edición' | 'Creador 360°'
            client: data.client || 'General',
            title: data.title || 'Nueva Asignación',
            description: data.description || '',
            assignedDate: data.assignedDate || new Date().toISOString(),
            dueDate: data.dueDate,
            status: data.status || 'Pendiente',
            createdBy: data.createdBy || 'admin',
            linkedScript: data.linkedScript || '',
            linkedAsset: data.linkedAsset || ''
        };

        try {
            await dbService.set('assignments', newAsg.id, newAsg);
        } catch (err) {
            console.warn("Error saving assignment to DB:", err);
        }

        return newAsg;
    },

    async deleteAssignment(id) {
        try {
            await dbService.delete('assignments', id);
        } catch (err) {
            console.warn("Error deleting assignment from DB:", err);
        }
    },

    /**
     * Cleanup logic: Disabled to preserve history.
     */
    async cleanupAssignments() {
        console.log("[Cleanup] Auto-cleanup disabled to preserve completed assignments history.");
        return 0;
    }
};
