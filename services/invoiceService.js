/**
 * Invoice Service - Creative Production OS
 * Handles double invoice operational tracking: Employee vs Admin side-by-side comparison.
 */
import { dbService } from '../firebase/service.js';

export const invoiceService = {
    async getEmployeeInvoices(userId, role) {
        try {
            if (role === 'admin') {
                const list = await dbService.getAll('invoices');
                return list || [];
            } else {
                const list = await dbService.getByQuery('invoices', 'employeeId', '==', userId);
                return list || [];
            }
        } catch (err) {
            console.warn("Error fetching employee invoices from DB:", err);
            return [];
        }
    },

    async getAdminInvoiceForEmployeeInvoice(employeeInvoiceId) {
        try {
            const list = await dbService.getByQuery('admin_invoices', 'relatedEmployeeInvoice', '==', employeeInvoiceId);
            if (list && list.length > 0) return list[0];
            return null;
        } catch (err) {
            console.warn(`Error fetching admin invoice comparison for ${employeeInvoiceId}:`, err);
            return null;
        }
    },

    async saveEmployeeInvoice(data) {
        const newInv = {
            id: data.id || `EMP-INV-${Date.now().toString().slice(-4)}`,
            employeeId: data.employeeId,
            employeeName: data.employeeName || 'Empleado',
            type: data.type, // 'Factura de Edición de Video' | 'Factura de Grabación de Video'
            client: data.client,
            amount: Number(data.amount) || 0,
            observations: data.observations || '',
            createdAt: data.createdAt || new Date().toISOString(),
            editedAt: data.id ? new Date().toISOString() : null,
            status: data.status || 'Pendiente'
        };

        try {
            await dbService.set('invoices', newInv.id, newInv);
        } catch (err) {
            console.warn("Error saving employee invoice to DB:", err);
        }

        return newInv;
    },

    async saveAdminInvoice(data) {
        const newAdmInv = {
            id: data.id || `ADM-INV-${Date.now().toString().slice(-4)}`,
            relatedEmployeeInvoice: data.relatedEmployeeInvoice,
            adminObservations: data.adminObservations || '',
            verificationStatus: data.verificationStatus || 'Pendiente', // 'Coherente' | 'Inconsistencia Detectada'
            internalNotes: data.internalNotes || '',
            validatedAt: new Date().toISOString()
        };

        try {
            await dbService.set('admin_invoices', newAdmInv.id, newAdmInv);
        } catch (err) {
            console.warn("Error saving admin validation invoice to DB:", err);
        }

        return newAdmInv;
    },

    async getAllComparisonData() {
        const employeesInvoices = await this.getEmployeeInvoices(null, 'admin');
        const comparisonData = await Promise.all(employeesInvoices.map(async (ei) => {
            const ai = await this.getAdminInvoiceForEmployeeInvoice(ei.id);
            return {
                employeeInvoice: ei,
                adminInvoice: ai
            };
        }));
        return comparisonData;
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
