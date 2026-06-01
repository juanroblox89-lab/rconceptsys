/**
 * Invoice Service - Creative Production OS
 * Handles single invoice operational tracking: Employee Invoice (emp-inv-{userId}) and Admin Invoice (adm-inv-{userId}).
 */
import { dbService, db, doc, updateDoc, arrayUnion, increment } from '../firebase/service.js';

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

    // --- Auto-Billing Atomic Engine ---
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
            const docRef = doc(db, collectionName, docId);
            await updateDoc(docRef, {
                items: arrayUnion(invoiceItem),
                amount: increment(amount),
                updatedAt: new Date().toISOString()
            });
        } catch (err) {
            // If doc doesn't exist, create it first
            if (err.code === 'not-found') {
                console.log(`Invoice ${docId} not found, creating baseline...`);
                const baseline = {
                    id: docId,
                    employeeId: userId,
                    employeeName: invoiceItem.employeeName || 'Empleado',
                    type: isAdminInvoice ? 'Factura Consolidada' : 'Factura por Servicios',
                    client: '',
                    amount: amount,
                    observations: '',
                    items: [invoiceItem],
                    createdAt: new Date().toISOString(),
                    status: 'Pendiente'
                };
                await dbService.set(collectionName, docId, baseline);
            } else {
                console.error("Atomic auto-billing failed:", err);
                throw err;
            }
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

    // Save/update an employee's reported invoice
    async saveEmployeeInvoice(userId, data) {
        const docId = `emp-inv-${userId}`;
        const newInv = {
            id: docId,
            employeeId: userId,
            employeeName: data.employeeName || 'Empleado',
            type: data.type || 'Factura de Edición de Video', // 'Factura de Edición de Video' | 'Factura de Grabación de Video' | 'Factura Consolidada'
            client: data.client || '',
            amount: Number(data.amount) || 0,
            observations: data.observations || '',
            items: data.items || [],
            createdAt: data.createdAt || new Date().toISOString(),
            status: data.status || 'Pendiente'
        };

        try {
            await dbService.set('invoices', docId, newInv);
        } catch (err) {
            console.warn(`Error saving employee invoice ${docId}:`, err);
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

    // Save/update the admin's consolidated invoice for a specific employee
    async saveAdminInvoice(userId, data) {
        const docId = `adm-inv-${userId}`;
        const newAdmInv = {
            id: docId,
            employeeId: userId,
            employeeName: data.employeeName || 'Empleado',
            type: data.type || 'Factura Consolidada',
            client: data.client || '',
            amount: Number(data.amount) || 0,
            observations: data.observations || '',
            items: data.items || [],
            createdAt: data.createdAt || new Date().toISOString(),
            status: data.status || 'Pendiente'
        };

        try {
            await dbService.set('admin_invoices', docId, newAdmInv);
        } catch (err) {
            console.warn(`Error saving admin invoice ${docId}:`, err);
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
                        item.amount || 0,
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
                    inv.amount || 0,
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

            const deletePromises = [
                ...empInvoices.map(inv => dbService.delete('invoices', inv.id)),
                ...admInvoices.map(inv => dbService.delete('admin_invoices', inv.id))
            ];

            await Promise.all(deletePromises);
            return { deleted: empInvoices.length + admInvoices.length };
        } catch (err) {
            console.error("Error resetting invoices:", err);
            throw err;
        }
    }
};
