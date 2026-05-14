/**
 * Asset Service - Creative Production OS
 */
import { dbService, storageService } from '../firebase/service.js';

export const assetService = {
    async getAssetsByClient(clientId) {
        // Placeholder for real Firestore query
        // return await dbService.getWhere('assets', 'clientId', '==', clientId);
        return [
            { id: '1', title: 'Reel Gancho A', type: 'video', url: '#', thumbnail: 'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=400&q=80', status: 'ready' },
            { id: '2', title: 'POV Recorrido', type: 'video', url: '#', thumbnail: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=400&q=80', status: 'ready' },
        ];
    },

    async uploadAsset(file, metadata) {
        const url = await storageService.uploadFile(`assets/${metadata.clientId}/${file.name}`, file);
        return await dbService.add('assets', { ...metadata, url });
    }
};
