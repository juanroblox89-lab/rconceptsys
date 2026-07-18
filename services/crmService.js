import { dbService } from '../supabase/service.js';
import { supabase } from '../supabase/client.js';

export const crmService = {
    async getAllLeads() {
        try {
            const { data, error } = await supabase
                .from('crm_leads')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('Error fetching leads:', err);
            // Fallback: return mock data for development if table does not exist yet
            if (err.message?.includes('does not exist')) {
                return this.getMockLeads();
            }
            throw err;
        }
    },

    async getLeadById(id) {
        try {
            const { data, error } = await supabase
                .from('crm_leads')
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;
            return data;
        } catch (err) {
            console.error(`Error fetching lead ${id}:`, err);
            throw err;
        }
    },

    async createLead(leadData) {
        try {
            const { data, error } = await supabase
                .from('crm_leads')
                .insert([leadData])
                .select();
            if (error) throw error;
            return data[0];
        } catch (err) {
            console.error('Error creating lead:', err);
            throw err;
        }
    },

    async updateLead(id, leadData) {
        try {
            const { data, error } = await supabase
                .from('crm_leads')
                .update(leadData)
                .eq('id', id)
                .select();
            if (error) throw error;
            return data[0];
        } catch (err) {
            console.error(`Error updating lead ${id}:`, err);
            throw err;
        }
    },

    async deleteLead(id) {
        try {
            const { error } = await supabase
                .from('crm_leads')
                .delete()
                .eq('id', id);
            if (error) throw error;
            return true;
        } catch (err) {
            console.error(`Error deleting lead ${id}:`, err);
            throw err;
        }
    },

    async convertToClient(lead) {
        try {
            // 1. Create client entry in "clients" table
            const clientId = 'cli_' + Date.now();
            const clientObj = {
                id: clientId,
                name: lead.name,
                logo: '',
                package: lead.package_name || 'Personalizado',
                status: 'Activo',
                strategy: lead.client_strategy || {},
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            const { data: clientData, error: clientErr } = await supabase
                .from('clients')
                .insert([clientObj])
                .select();
            if (clientErr) throw clientErr;

            // 2. Update lead status to Cerrado-Ganado and link client reference
            await this.updateLead(lead.id, {
                status: 'Cerrado-Ganado',
                last_interaction_date: new Date().toISOString()
            });

            return clientData[0];
        } catch (err) {
            console.error('Error converting lead to client:', err);
            throw err;
        }
    },

    getMockLeads() {
        return [
            {
                id: 'lead-1',
                name: 'Restaurante Villa Grande',
                email: 'contacto@villagrande.com',
                phone: '573001234567',
                source: 'referencia',
                status: 'Negociación',
                estimated_value: 1200000,
                notes: 'Interesados en un plan mensual de 8 Reels con producción presencial.',
                first_contact_date: '2026-07-01T10:00:00Z',
                last_interaction_date: '2026-07-15T15:30:00Z',
                client_strategy: {
                    colors: '#ff5722, #3f51b5',
                    hooks: '¿Sabías que el 80% de las personas...?, El secreto mejor guardado de...',
                    formats: 'Trend dinámico, Detrás de cámaras'
                }
            },
            {
                id: 'lead-2',
                name: 'Gimnasio Ripped & Fit',
                email: 'info@ripped.com',
                phone: '573129876543',
                source: 'fisica',
                status: 'En contacto',
                estimated_value: 800000,
                notes: 'Contacto en frío en visita física. Se mostraron interesados en videos testimoniales.',
                first_contact_date: '2026-07-10T12:00:00Z',
                last_interaction_date: '2026-07-12T09:00:00Z'
            },
            {
                id: 'lead-3',
                name: 'Estética Dental Premium',
                email: 'citas@esteticadental.com',
                phone: '573214567890',
                source: 'virtual',
                status: 'Prospecto',
                estimated_value: 1500000,
                notes: 'Llegó por publicidad en Instagram. Buscan posicionamiento local.',
                first_contact_date: '2026-07-17T18:00:00Z',
                last_interaction_date: '2026-07-17T18:00:00Z'
            }
        ];
    }
};
