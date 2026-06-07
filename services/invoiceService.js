/**
 * Invoice Service - Creative Production OS
 * Handles single invoice operational tracking: Employee Invoice (emp-inv-{userId}) and Admin Invoice (adm-inv-{userId}).
 */
import { dbService, db } from '../firebase/service.js';
import { doc, updateDoc, arrayUnion, increment, setDoc } from "firebase/firestore";
export const invoiceService = {
    // --- Rate Cards Methods ---
    async getRateCards() {
        try {
            return await dbService.getAll('rate_cards') || [];
        } catch (err) {
            console.warn("Error fetching rate cards:", err);
            return [];
        }
    },
    async saveRateCard(data) {
        const id = data.id || `rate-${crypto.randomUUID().split('-')[0]}`;
        await dbService.set('rate_cards', id, { id, ...data });
        return id;
    },
    async deleteRateCard(id) {
        await dbService.delete('rate_cards', id);
    },

    // --- Auto-Billing Engine ---
    async autoBilledItem(userId, isAdminInvoice, invoiceItem) {
        const collectionName = isAdminInvoice ? 'admin_invoices' : 'invoices';
        const docPrefix = isAdminInvoice ? 'adm-inv-' : 'emp-inv-';
        const docId = `${docPrefix}${userId}`;
        
        // Anti-Fraud: Math constraints
        const amount = Math.max(0, Math.round(Number(invoiceItem.amount) || 0));
        invoiceItem.amount = amount;
        invoiceItem.autoBilled = true;
        invoiceItem.timestamp = new Date().toISOString();

        try {
            await setDoc(doc(db, collectionName, docId), {
                id: docId,
                employeeId: userId,
                employeeName: invoiceItem.employeeName || 'Empleado',
                type: isAdminInvoice ? 'Factura Consolidada' : 'Factura por Servicios',
                amount: increment(amount),
                items: arrayUnion(invoiceItem),
                status: 'Pendiente'
                // Omitimos createdAt para no sobreescribir si ya existe. En un mundo ideal usaríamos serverTimestamp(), pero esto resuelve el race condition principal.
            }, { merge: true });
        } catch (err) {
            console.error("Auto-billing failed:", err);
            throw err;
        }
    },
    // Get an employee's reported invoice
    async getEmployeeInvoice(userId) {
        try {
            return await dbService.getById('invoices', `emp-inv-${userId}`);
        } catch (err) {
            console.warn(`Error fetching employee invoice for user ${userId}:`, err);
            return null;
        }
    },

    // Delete an employee's reported invoice
    async deleteEmployeeInvoice(userId) {
        try {
            await dbService.delete('invoices', `emp-inv-${userId}`);
        } catch (err) {
            console.warn(`Error deleting employee invoice for user ${userId}:`, err);
            throw err;
        }
    },

    // Save/update an employee's reported invoice
    async saveEmployeeInvoice(userId, data) {
        const docId = `emp-inv-${userId}`;
        const newInv = {
            id: docId,
            employeeId: userId,
            employeeName: data.employeeName || 'Empleado',
            type: data.type || 'Factura de Edición de Video', // 'Factura de Edición de Video' | 'Factura de Grabación de Video' | 'Factura Consolidada'
            client: data.client || '',
            amount: Math.max(0, Number(data.amount) || 0),
            observations: data.observations || '',
            items: data.items || [],
            createdAt: data.createdAt || new Date().toISOString(),
            status: data.status || 'Pendiente'
        };

        try {
            await dbService.set('invoices', docId, newInv);
        } catch (err) {
            console.warn(`Error saving employee invoice ${docId}:`, err);
            throw err;
        }

        return newInv;
    },

    // Get the admin's consolidated invoice for a specific employee
    async getAdminInvoice(userId) {
        try {
            return await dbService.getById('admin_invoices', `adm-inv-${userId}`);
        } catch (err) {
            console.warn(`Error fetching admin invoice for user ${userId}:`, err);
            return null;
        }
    },

    // Delete the admin's consolidated invoice for a specific employee
    async deleteAdminInvoice(userId) {
        try {
            await dbService.delete('admin_invoices', `adm-inv-${userId}`);
        } catch (err) {
            console.warn(`Error deleting admin invoice for user ${userId}:`, err);
            throw err;
        }
    },

    // Save/update the admin's consolidated invoice for a specific employee
    async saveAdminInvoice(userId, data) {
        const docId = `adm-inv-${userId}`;
        const newAdmInv = {
            id: docId,
            employeeId: userId,
            employeeName: data.employeeName || 'Empleado',
            type: data.type || 'Factura Consolidada',
            client: data.client || '',
            amount: Math.max(0, Number(data.amount) || 0),
            observations: data.observations || '',
            items: data.items || [],
            createdAt: data.createdAt || new Date().toISOString(),
            status: data.status || 'Pendiente'
        };

        try {
            await dbService.set('admin_invoices', docId, newAdmInv);
        } catch (err) {
            console.warn(`Error saving admin invoice ${docId}:`, err);
            throw err;
        }

        return newAdmInv;
    },

    // Get all invoices in a collection
    async getAllInvoices(collectionName) {
        try {
            const list = await dbService.getAll(collectionName);
            return list || [];
        } catch (err) {
            console.warn(`Error fetching all from ${collectionName}:`, err);
            return [];
        }
    },

    exportToCsv(invoices, typeFilter) {
        const filtered = typeFilter ? invoices.filter(i => i.type?.includes(typeFilter)) : invoices;
        if (!filtered.length) {
            alert("No hay facturas de este tipo para exportar.");
            return;
        }

        const sep = ';'; // Excel default separator for Spanish locales
        const headers = ['Empleado', 'Tipo de Servicio', 'Cliente', 'Monto (COP)', 'Fecha', 'Estado', 'Observaciones'];
        const rows = [];

        filtered.forEach(inv => {
            if (inv.items && inv.items.length > 0) {
                inv.items.forEach(item => {
                    rows.push([
                        `"${inv.employeeName || inv.employeeId || ''}"`,
                        `"${item.type || inv.type || ''}"`,
                        `"${item.client || inv.client || ''}"`,
                        `"${String(item.amount || 0).replace('.', ',')}"`,
                        `"${item.createdAt ? new Date(item.createdAt).toLocaleDateString('es-CO') : ''}"`,
                        `"${inv.status || ''}"`,
                        `"${(item.observations || '').replace(/"/g, '""')}"`
                    ]);
                });
            } else {
                rows.push([
                    `"${inv.employeeName || inv.employeeId || ''}"`,
                    `"${inv.type || ''}"`,
                    `"${inv.client || ''}"`,
                    `"${String(inv.amount || 0).replace('.', ',')}"`,
                    `"${inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('es-CO') : ''}"`,
                    `"${inv.status || ''}"`,
                    `"${(inv.observations || '').replace(/"/g, '""')}"`
                ]);
            }
        });

        // BOM for UTF-8 Excel compatibility
        const BOM = '\uFEFF';
        const csvContent = BOM + [headers.join(sep), ...rows.map(r => r.join(sep))].join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Liquidacion_${typeFilter || 'Todas'}_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },

    // Delete all invoices for monthly reset
    async resetAllInvoices() {
        try {
            const [empInvoices, admInvoices] = await Promise.all([
                dbService.getAll('invoices').catch(() => []),
                dbService.getAll('admin_invoices').catch(() => [])
            ]);

            const allDocs = [
                ...empInvoices.map(inv => ({ col: 'invoices', id: inv.id })),
                ...admInvoices.map(inv => ({ col: 'admin_invoices', id: inv.id }))
            ];

            const batchSize = 400; // conservative batch limit (Firestore max is 500)
            for (let i = 0; i < allDocs.length; i += batchSize) {
                const batch = dbService.batch();
                const chunk = allDocs.slice(i, i + batchSize);
                chunk.forEach(item => {
                    batch.delete(doc(db, item.col, item.id));
                });
                await batch.commit();
            }

            return { deleted: allDocs.length };
        } catch (err) {
            console.error("Error resetting invoices:", err);
            throw err;
        }
    },

    // Remove specific items related to a deleted assignment
    async removeInvoiceItemsByAssignment(assignmentId, assignmentTitle) {
        try {
            const [empInvoices, admInvoices] = await Promise.all([
                dbService.getAll('invoices').catch(() => []),
                dbService.getAll('admin_invoices').catch(() => [])
            ]);

            const processInvoice = async (collectionName, inv) => {
                if (!inv.items || !inv.items.length) return;
                const originalLength = inv.items.length;
                
                // Filter out items that match assignmentId or (legacy items) title
                inv.items = inv.items.filter(item => {
                    const matchId = item.assignmentId === assignmentId;
                    const matchTitle = !item.assignmentId && (item.title === assignmentTitle || item.description?.includes(assignmentTitle));
                    return !(matchId || matchTitle);
                });
                
                if (inv.items.length < originalLength) {
                    // Recalculate amount
                    inv.amount = inv.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
                    await dbService.update(collectionName, inv.id, { items: inv.items, amount: inv.amount });
                }
            };

            const promises = [
                ...empInvoices.map(inv => processInvoice('invoices', inv)),
                ...admInvoices.map(inv => processInvoice('admin_invoices', inv))
            ];

            await Promise.all(promises);
        } catch (err) {
            console.error("Error cleaning up invoice items:", err);
        }
    }
};
