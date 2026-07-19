import { dbService, storageService } from '../supabase/service.js';
import { supabase } from '../supabase/client.js';

// Base64 helper for offline image uploads
function dataURLtoFile(dataurl, filename) {
    try {
        const arr = dataurl.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new File([u8arr], filename, { type: mime });
    } catch (e) {
        console.error('[CRM] Error parsing base64 image:', e);
        return null;
    }
}

export const crmService = {
    async getAllLeads() {
        try {
            // First fetch offline leads to merge them with database leads
            const offlineLeads = this.getOfflineLeads();
            
            const { data, error } = await supabase
                .from('crm_leads')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            
            const dbLeads = data || [];
            // Merge both, with offline leads on top
            return [...offlineLeads, ...dbLeads];
        } catch (err) {
            console.error('Error fetching leads:', err);
            // Fallback: return offline leads + mock data if database is not available
            const offlineLeads = this.getOfflineLeads();
            if (err.message?.includes('does not exist')) {
                return [...offlineLeads, ...this.getMockLeads()];
            }
            return offlineLeads;
        }
    },

    async getLeadById(id) {
        // Check offline first
        const offlineLeads = this.getOfflineLeads();
        const foundOffline = offlineLeads.find(l => l.id === id);
        if (foundOffline) return foundOffline;

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
        // Enforce ID generation for tracking and offline queuing
        if (!leadData.id) {
            leadData.id = 'lead_' + Math.random().toString(36).substr(2, 9);
        }
        if (!leadData.created_at) {
            leadData.created_at = new Date().toISOString();
        }

        // If explicitly offline or fetch fails, save offline
        if (!navigator.onLine) {
            this.saveOfflineLead(leadData);
            return { ...leadData, is_offline: true };
        }

        try {
            // Check if there is an offline base64 photo to upload
            if (leadData.client_strategy?.photo_offline_base64) {
                const imgUrl = await this.uploadOfflinePhoto(leadData.id, leadData.client_strategy.photo_offline_base64);
                if (imgUrl) {
                    leadData.client_strategy.photo_url = imgUrl;
                    delete leadData.client_strategy.photo_offline_base64;
                }
            }

            const { data, error } = await supabase
                .from('crm_leads')
                .insert([leadData])
                .select();
            if (error) throw error;
            return data[0];
        } catch (err) {
            console.error('Error creating lead in Supabase, falling back to offline storage:', err);
            // Fallback for network timeouts or fetch rejections
            this.saveOfflineLead(leadData);
            return { ...leadData, is_offline: true };
        }
    },

    async updateLead(id, leadData) {
        // Update in offline queue if it is an offline lead
        const offlineLeads = this.getOfflineLeads();
        if (offlineLeads.some(l => l.id === id)) {
            const updated = offlineLeads.map(l => l.id === id ? { ...l, ...leadData } : l);
            localStorage.setItem('pending_leads', JSON.stringify(updated));
            return { id, ...leadData };
        }

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
        // Delete from offline queue if present
        const offlineLeads = this.getOfflineLeads();
        if (offlineLeads.some(l => l.id === id)) {
            const remaining = offlineLeads.filter(l => l.id !== id);
            localStorage.setItem('pending_leads', JSON.stringify(remaining));
            return true;
        }

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
                logo: lead.client_strategy?.photo_url || '',
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

    // --- Offline storage helpers ---
    getOfflineLeads() {
        try {
            return JSON.parse(localStorage.getItem('pending_leads') || '[]');
        } catch (e) {
            return [];
        }
    },

    saveOfflineLead(leadData) {
        try {
            const pending = this.getOfflineLeads();
            if (!pending.some(l => l.id === leadData.id)) {
                pending.push(leadData);
                localStorage.setItem('pending_leads', JSON.stringify(pending));
                console.log('[CRM] Lead saved offline successfully:', leadData);
            }
        } catch (e) {
            console.error('[CRM] Error saving offline lead:', e);
        }
    },

    async uploadOfflinePhoto(leadId, base64Data) {
        try {
            const fileObj = dataURLtoFile(base64Data, `lead_photo_${leadId}.jpg`);
            if (!fileObj) return null;

            const filePath = `lead_${leadId}_${Date.now()}.jpg`;
            const { data, error } = await supabase.storage
                .from('logos')
                .upload(filePath, fileObj, { upsert: true });

            if (error) throw error;

            const { data: urlData } = supabase.storage
                .from('logos')
                .getPublicUrl(data.path);

            return urlData?.publicUrl || null;
        } catch (err) {
            console.error('[CRM] Offline photo upload failed:', err);
            return null;
        }
    },

    async syncOfflineLeads() {
        if (!navigator.onLine) return;
        try {
            const pending = this.getOfflineLeads();
            if (pending.length === 0) return;

            console.log(`[CRM] Found ${pending.length} pending offline leads. Syncing...`);
            const syncedIds = [];

            for (const lead of pending) {
                try {
                    // Create a copy of the lead object to avoid mutating the original
                    const leadToUpload = JSON.parse(JSON.stringify(lead));
                    
                    // Upload photo first if it has one pending upload
                    if (leadToUpload.client_strategy?.photo_offline_base64) {
                        const imgUrl = await this.uploadOfflinePhoto(leadToUpload.id, leadToUpload.client_strategy.photo_offline_base64);
                        if (imgUrl) {
                            leadToUpload.client_strategy.photo_url = imgUrl;
                            delete leadToUpload.client_strategy.photo_offline_base64;
                        }
                    }

                    // Insert to database
                    const { error } = await supabase
                        .from('crm_leads')
                        .insert([leadToUpload]);

                    // If successfully inserted or duplicate row, consider synced
                    if (!error || error.code === '23505') {
                        syncedIds.push(leadToUpload.id);
                        console.log(`[CRM] Synced lead successfully: ${leadToUpload.name}`);
                    } else {
                        console.error(`[CRM] Database error syncing lead ${leadToUpload.name}:`, error);
                    }
                } catch (e) {
                    console.error(`[CRM] Network/system error syncing lead ${lead.name}:`, e);
                }
            }

            // Clean local queue
            const remaining = pending.filter(l => !syncedIds.includes(l.id));
            if (remaining.length > 0) {
                localStorage.setItem('pending_leads', JSON.stringify(remaining));
            } else {
                localStorage.removeItem('pending_leads');
                console.log('[CRM] All offline leads synced successfully!');
            }

            // Trigger route refresh if viewing CRM dashboard
            if (window.location.hash === '#marketing' && typeof window.router?.handleRoute === 'function') {
                window.router.handleRoute();
            }
        } catch (err) {
            console.error('[CRM] Sync process failed:', err);
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
            }
        ];
    }
};

// Automatic sync registration on network events
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        crmService.syncOfflineLeads();
    });
    // Fallback sync attempt on load
    window.addEventListener('DOMContentLoaded', () => {
        crmService.syncOfflineLeads();
    });
    setTimeout(() => {
        crmService.syncOfflineLeads();
    }, 2000);
}
