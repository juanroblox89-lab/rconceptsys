/**
 * Asset Service - Creative Production OS
 */
import { dbService, storageService } from '../supabase/service.js';

export const assetService = {
    async getAssetsByClient(clientId) {
        return dbService.getByQuerySafe('assets', 'clientId', '==', clientId);
    },

    async uploadAsset(file, metadata) {
        const url = await storageService.uploadFile(`assets/${metadata.clientId}/${file.name}`, file);
        return await dbService.add('assets', { ...metadata, url });
    }
};
