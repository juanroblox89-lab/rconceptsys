/**
 * Assignment Service - Creative Production OS
 * Handles operational task assignments for recordings and edits.
 * Includes auto-deletion logic for tasks 2 days past their deadline.
 */
import { dbService, db, onSnapshot, collection } from '../firebase/service.js';

export const assignmentService = {
    subscribeToAssignments(callback) {
        return onSnapshot(collection(db, 'assignments'), (snapshot) => {
            const assignments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(assignments);
        }, (error) => {
            console.warn("Error in real-time assignments subscription:", error);
            callback([]);
        });
    },

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
        const id = data.id || `ASG-${crypto.randomUUID().split('-')[0]}`;
        const newAsg = {
            type: 'Edición',
            client: 'General',
            title: 'Nueva Asignación',
            description: '',
            assignedDate: new Date().toISOString(),
            status: 'Pendiente',
            createdBy: 'admin',
            linkedScript: '',
            linkedAsset: '',
            ...data,
            id // Ensure ID is not overwritten
        };

        try {
            await dbService.set('assignments', id, newAsg);
            
            // Auto-advance pipeline if completed
            if (newAsg.status === 'Completado' && newAsg.projectId && typeof newAsg.stageIndex !== 'undefined') {
                await this._advancePipeline(newAsg.projectId, newAsg.stageIndex);
            }
        } catch (err) {
            console.warn("Error saving assignment to DB:", err);
        }

        return newAsg;
    },

    async createMasterPipeline(data) {
        const projectId = `PRJ-${crypto.randomUUID().split('-')[0]}`;
        
        // Fase 1: Grabación (Activa)
        const recId = `ASG-${crypto.randomUUID().split('-')[0]}`;
        const recAssignment = {
            id: recId,
            projectId,
            stageIndex: 0,
            employeeId: data.camarografoId,
            type: 'Grabación',
            client: data.client || 'General',
            title: `[Grabación] ${data.title}`,
            description: data.description || '',
            assignedDate: new Date().toISOString(),
            dueDate: data.dueDate,
            status: 'Pendiente',
            createdBy: data.createdBy || 'admin',
            linkedScript: data.linkedScript || '',
            linkedAsset: data.linkedAsset || '',
            sopId: data.sopCamarografoId || null
        };

        // Fase 2: Edición (Bloqueada/Oculta)
        const editId = `ASG-${crypto.randomUUID().split('-')[0]}`;
        const editAssignment = {
            id: editId,
            projectId,
            stageIndex: 1,
            employeeId: data.editorId,
            type: 'Edición',
            client: data.client || 'General',
            title: `[Edición] ${data.title}`,
            description: '', // Se llenará en la transición
            assignedDate: new Date().toISOString(),
            dueDate: data.dueDate,
            status: 'blocked',
            createdBy: 'system_automator',
            linkedScript: data.linkedScript || '',
            linkedAsset: data.linkedAsset || '',
            sopId: data.sopEditorId || null
        };

        // Fase 3: Subida (Bloqueada/Oculta)
        const uploadId = `ASG-${crypto.randomUUID().split('-')[0]}`;
        const uploadAssignment = {
            id: uploadId,
            projectId,
            stageIndex: 2,
            employeeId: data.uploaderId,
            type: 'Subida',
            client: data.client || 'General',
            title: `[Subida] ${data.title}`,
            description: '',
            assignedDate: new Date().toISOString(),
            dueDate: data.dueDate,
            status: 'blocked',
            createdBy: 'system_automator',
            linkedScript: data.linkedScript || '',
            linkedAsset: data.linkedAsset || '',
            sopId: data.sopUploaderId || null,
            uploadLink: data.uploadLink || ''
        };

        try {
            await dbService.set('assignments', recId, recAssignment);
            await dbService.set('assignments', editId, editAssignment);
            await dbService.set('assignments', uploadId, uploadAssignment);
        } catch (err) {
            console.warn("Error saving pipeline assignments to DB:", err);
        }

        return projectId;
    },

    async updateAssignmentStatus(id, newStatus) {
        try {
            await dbService.update('assignments', id, { status: newStatus });
            
            // Fetch the assignment to check if we need to advance pipeline
            if (newStatus === 'Completado') {
                const asg = await dbService.getById('assignments', id);
                if (asg && asg.projectId && typeof asg.stageIndex !== 'undefined') {
                    await this._advancePipeline(asg.projectId, asg.stageIndex);
                }
            }
        } catch (err) {
            console.warn(`Error updating status for assignment ${id}:`, err);
        }
    },

    async _advancePipeline(projectId, completedStageIndex) {
        try {
            console.log(`[Pipeline] Stage ${completedStageIndex} completed for project ${projectId}. Checking for next stage...`);
            const allAssignments = await this.getAllAssignments();
            const completedAsg = allAssignments.find(a => a.projectId === projectId && a.stageIndex === completedStageIndex);
            const nextStageAsg = allAssignments.find(a => a.projectId === projectId && a.stageIndex === completedStageIndex + 1);
            
            if (nextStageAsg && nextStageAsg.status === 'blocked') {
                console.log(`[Pipeline] Next assignment ${nextStageAsg.id} (Stage ${completedStageIndex + 1})`);
                
                // If it's the "Subida" phase, we don't automatically unlock it (needs Admin approval)
                if (nextStageAsg.title.toLowerCase().includes('subida')) {
                    console.log(`[Pipeline] Stage is Subida. Keeping it blocked for Admin approval.`);
                    const updates = {};
                    if (completedAsg && completedAsg.uploadLink) {
                        updates.linkedAsset = completedAsg.uploadLink;
                    }
                    if (Object.keys(updates).length > 0) {
                        await dbService.update('assignments', nextStageAsg.id, updates);
                    }
                } else {
                    console.log(`[Pipeline] Unlocking assignment ${nextStageAsg.id}`);
                    const updates = { status: 'Pendiente' };
                    if (completedAsg && completedAsg.uploadLink) {
                        updates.linkedAsset = completedAsg.uploadLink;
                    }
                    await dbService.update('assignments', nextStageAsg.id, updates);
                }
            }
        } catch (err) {
            console.error(`[Pipeline] Error advancing pipeline for project ${projectId}:`, err);
        }
    },

    async deleteAssignment(id) {
        try {
            // First fetch the assignment to get its title for invoice cleanup
            const asg = await dbService.getById('assignments', id);
            
            // Delete the assignment
            await dbService.delete('assignments', id);
            
            // Cascade cleanup: Invoices
            if (asg && asg.title) {
                const { invoiceService } = await import('./invoiceService.js');
                await invoiceService.removeInvoiceItemsByAssignment(id, asg.title);
            }
            
            // Cascade cleanup: SOP Submissions
            try {
                const allSubmissions = await dbService.getAll('sop_submissions') || [];
                const toDelete = allSubmissions.filter(sub => sub.assignmentId === id);
                for (const sub of toDelete) {
                    await dbService.delete('sop_submissions', sub.id);
                }
            } catch (e) {
                console.warn("Could not cleanup SOP submissions:", e);
            }
        } catch (err) {
            console.warn("Error deleting assignment from DB:", err);
        }
    },

    /**
     * Manual Cleanup logic: Deletes assignments older than 30 days.
     * Invoked from Admin panel.
     */
    async purgeOldAssignments() {
        try {
            console.log("[Cleanup] Starting manual purge of old assignments...");
            const all = await this.getAllAssignments();
            const now = new Date();
            let count = 0;
            
            for (const asg of all) {
                // Check if older than 30 days
                const createdAtDate = asg.createdAt ? new Date(asg.createdAt) : null;
                const dueDate = asg.dueDate ? new Date(asg.dueDate) : null;
                
                // Use createdAt or dueDate as reference
                const refDate = createdAtDate || dueDate;
                if (!refDate) continue;
                
                const diffTime = Math.abs(now - refDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                if (diffDays > 30) {
                    await this.deleteAssignment(asg.id);
                    count++;
                }
            }
            return count;
        } catch (err) {
            console.error("Purge error:", err);
            throw err;
        }
    }
};
