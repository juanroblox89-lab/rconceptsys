/**
 * Invoice Service - Creative Production OS
 * Handles double invoice operational tracking: Employee vs Admin side-by-side comparison.
 */
import { dbService } from '../firebase/service.js';

// Base mock storage ensuring flawless UI presentation offline/pre-populated
let localEmployeeInvoices = [
    {
        id: 'EMP-INV-001',
        employeeId: 'qa-editor1',
        employeeName: 'QA Editor Uno',
        type: 'Factura de Edición de Video',
        client: 'Gimnasio Elite',
        amount: 150000,
        observations: 'Edición de 5 Reels formato RC-01 con subtítulos dinámicos.',
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        editedAt: null,
        status: 'Pendiente'
    },
    {
        id: 'EMP-INV-002',
        employeeId: 'qa-camara1',
        employeeName: 'QA Cámara Uno',
        type: 'Factura de Grabación de Video',
        client: 'Barbería Classic',
        amount: 250000,
        observations: 'Jornada de grabación con equipo Sony FX3 e iluminación led.',
        createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
        editedAt: null,
        status: 'Aprobado'
    }
];

let localAdminInvoices = [
    {
        id: 'ADM-INV-001',
        relatedEmployeeInvoice: 'EMP-INV-001',
        adminObservations: 'Los tiempos de entrega y retención validan el pago. Excelente hook.',
        verificationStatus: 'Coherente',
        internalNotes: 'Costo por reel unitario dentro del margen operativo de la agencia.',
        validatedAt: new Date().toISOString()
    }
];

export const invoiceService = {
    async getEmployeeInvoices(userId, role) {
        try {
            // Firestore call if available
            if (role === 'admin') {
                const list = await dbService.getAll('invoices');
                return list.length ? list : localEmployeeInvoices;
            } else {
                const list = await dbService.getByQuery('invoices', 'employeeId', '==', userId);
                return list.length ? list : localEmployeeInvoices.filter(i => i.employeeId === userId);
            }
        } catch (err) {
            console.warn("Using offline employee invoices cache:", err);
            return role === 'admin' ? localEmployeeInvoices : localEmployeeInvoices.filter(i => i.employeeId === userId);
        }
    },

    async getAdminInvoiceForEmployeeInvoice(employeeInvoiceId) {
        try {
            const list = await dbService.getByQuery('admin_invoices', 'relatedEmployeeInvoice', '==', employeeInvoiceId);
            if (list && list.length > 0) return list[0];
            return localAdminInvoices.find(a => a.relatedEmployeeInvoice === employeeInvoiceId) || null;
        } catch (err) {
            return localAdminInvoices.find(a => a.relatedEmployeeInvoice === employeeInvoiceId) || null;
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
            console.warn("Offline persistence simulation for employee invoice:", err);
        }

        // Update local cache
        const idx = localEmployeeInvoices.findIndex(i => i.id === newInv.id);
        if (idx >= 0) localEmployeeInvoices[idx] = newInv;
        else localEmployeeInvoices.push(newInv);

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
            console.warn("Offline persistence simulation for admin invoice:", err);
        }

        const idx = localAdminInvoices.findIndex(a => a.relatedEmployeeInvoice === newAdmInv.relatedEmployeeInvoice);
        if (idx >= 0) localAdminInvoices[idx] = newAdmInv;
        else localAdminInvoices.push(newAdmInv);

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
