/**
 * Invoice Service - Creative Production OS
 * Handles single invoice operational tracking: Employee Invoice (emp-inv-{userId}) and Admin Invoice (adm-inv-{userId}).
 */
import { dbService } from '../firebase/service.js';

export const invoiceService = {
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
        const filtered = typeFilter ? invoices.filter(i => i.type.includes(typeFilter)) : invoices;
        if (!filtered.length) {
            alert("No hay facturas de este tipo para exportar.");
            return;
        }

        const headers = ['ID', 'Empleado', 'Tipo', 'Cliente', 'Monto (COP)', 'Fecha', 'Estado', 'Observaciones'];
        const rows = filtered.map(i => [
            i.id,
            `"${i.employeeName || i.employeeId}"`,
            `"${i.type}"`,
            `"${i.client}"`,
            i.amount,
            `"${new Date(i.createdAt).toLocaleDateString()}"`,
            `"${i.status}"`,
            `"${(i.observations || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Facturas_${typeFilter || 'Todas'}_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};
