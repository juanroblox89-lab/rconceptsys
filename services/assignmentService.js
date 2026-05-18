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
            id: data.id || `ASG-${Date.now().toString().slice(-4)}`,
            employeeId: data.employeeId,
            type: data.type || 'Edición', // 'Grabación' | 'Edición' | 'Creador 360°'
            client: data.client || 'General',
            title: data.title || 'Nueva Asignación',
            description: data.description || '',
            assignedDate: data.assignedDate || new Date().toISOString(),
            dueDate: data.dueDate,
            status: data.status || 'Pendiente',
            createdBy: data.createdBy || 'admin'
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
     * Cleanup logic: Delete assignments 2 days after deadline.
     */
    async cleanupAssignments() {
        const now = new Date();
        const twoDaysMs = 86400000 * 2;
        
        const all = await this.getAllAssignments();
        const toDelete = all.filter(asg => {
            if (!asg.dueDate) return false;
            const deadline = new Date(asg.dueDate);
            return (now - deadline) > twoDaysMs;
        });

        for (const asg of toDelete) {
            console.log(`[Cleanup] Deleting expired assignment: ${asg.id}`);
            await this.deleteAssignment(asg.id);
        }
        
        return toDelete.length;
    }
};
