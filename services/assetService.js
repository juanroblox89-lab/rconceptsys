/**
 * Asset Service - Creative Production OS
 */
import { dbService, storageService } from '../firebase/service.js';

export const assetService = {
    async getAssetsByClient(clientId) {
        try {
            return await dbService.getByQuery('assets', 'clientId', '==', clientId) || [];
        } catch (err) {
            console.warn(`Error fetching assets for client ${clientId}:`, err);
            return [];
        }
    },

    async uploadAsset(file, metadata) {
        const url = await storageService.uploadFile(`assets/${metadata.clientId}/${file.name}`, file);
        return await dbService.add('assets', { ...metadata, url });
    }
};
