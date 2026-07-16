import { beforeEach, describe, expect, it, vi } from 'vitest';

const serviceMocks = vi.hoisted(() => ({
    add: vi.fn(),
    getByQuery: vi.fn(),
    uploadFile: vi.fn()
}));

vi.mock('../supabase/service.js', () => ({
    dbService: {
        add: serviceMocks.add,
        getByQuery: serviceMocks.getByQuery
    },
    storageService: {
        uploadFile: serviceMocks.uploadFile
    }
}));

import { assetService } from '../services/assetService.js';

describe('assetService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('returns client assets from the database', async () => {
        const assets = [{ id: 'asset-1' }];
        serviceMocks.getByQuery.mockResolvedValue(assets);

        await expect(assetService.getAssetsByClient('client-1')).resolves.toEqual(assets);
        expect(serviceMocks.getByQuery).toHaveBeenCalledWith(
            'assets',
            'clientId',
            '==',
            'client-1'
        );
    });

    it('returns an empty array when the query is empty or fails', async () => {
        serviceMocks.getByQuery.mockResolvedValueOnce(null);
        await expect(assetService.getAssetsByClient('client-1')).resolves.toEqual([]);

        serviceMocks.getByQuery.mockRejectedValueOnce(new Error('offline'));
        await expect(assetService.getAssetsByClient('client-2')).resolves.toEqual([]);
        expect(console.warn).toHaveBeenCalledWith(
            'Error fetching assets for client client-2:',
            expect.any(Error)
        );
    });

    it('uploads the file and persists its public URL', async () => {
        const file = new File(['image'], 'cover.png', { type: 'image/png' });
        const metadata = { clientId: 'client-3', category: 'cover' };
        serviceMocks.uploadFile.mockResolvedValue('https://cdn.example/cover.png');
        serviceMocks.add.mockResolvedValue('asset-9');

        await expect(assetService.uploadAsset(file, metadata)).resolves.toBe('asset-9');
        expect(serviceMocks.uploadFile).toHaveBeenCalledWith(
            'assets/client-3/cover.png',
            file
        );
        expect(serviceMocks.add).toHaveBeenCalledWith('assets', {
            ...metadata,
            url: 'https://cdn.example/cover.png'
        });
    });
});
