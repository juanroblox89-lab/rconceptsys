/**
 * Assignment Service - Creative Production OS
 * Handles operational task assignments for recordings and edits.
 * Includes auto-deletion logic for tasks 2 days past their deadline.
 */
import { dbService } from '../firebase/service.js';

// Pre-populated demo data
let localAssignments = [
    {
        id: 'ASG-001',
        employeeId: 'qa-editor1',
        type: 'Edición',
        client: 'Gimnasio Elite',
        title: 'Reel Recorrido Pesas',
        description: 'Edición de video dinámico con música tendencia y subtítulos.',
        assignedDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 86400000 * 2).toISOString(), // 2 days from now
        status: 'Pendiente',
        createdBy: 'admin'
    }
];

export const assignmentService = {
    async getAllAssignments() {
        try {
            const list = await dbService.getAll('assignments');
            return list.length ? list : localAssignments;
        } catch (err) {
            console.warn("Using offline assignments cache:", err);
            return localAssignments;
        }
    },

    async getAssignmentsByEmployee(employeeId) {
        try {
            const list = await dbService.getByQuery('assignments', 'employeeId', '==', employeeId);
            return list.length ? list : localAssignments.filter(a => a.employeeId === employeeId);
        } catch (err) {
            return localAssignments.filter(a => a.employeeId === employeeId);
        }
    },

    async getAssignmentsByClient(clientName) {
        try {
            const list = await dbService.getByQuery('assignments', 'client', '==', clientName);
            return list.length ? list : localAssignments.filter(a => a.client === clientName);
        } catch (err) {
            return localAssignments.filter(a => a.client === clientName);
        }
    },

    async saveAssignment(data) {
        const newAsg = {
            id: data.id || `ASG-${Date.now().toString().slice(-4)}`,
            employeeId: data.employeeId,
            type: data.type || 'Edición', // 'Grabación' | 'Edición'
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
            console.warn("Offline assignment persistence simulated:", err);
        }

        const idx = localAssignments.findIndex(a => a.id === newAsg.id);
        if (idx >= 0) localAssignments[idx] = newAsg;
        else localAssignments.push(newAsg);

        return newAsg;
    },

    async deleteAssignment(id) {
        try {
            await dbService.delete('assignments', id);
        } catch (err) {
            console.warn("Offline assignment deletion simulated:", err);
        }
        localAssignments = localAssignments.filter(a => a.id !== id);
    },

    /**
     * Cleanup logic: Delete assignments 2 days after deadline.
     */
    async cleanupAssignments() {
        const now = new Date();
        const twoDaysMs = 86400000 * 2;
        
        const all = await this.getAllAssignments();
        const toDelete = all.filter(asg => {
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
