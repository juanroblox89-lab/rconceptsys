/**
 * Assets Page - Creative Production OS
 * Notion Light UI presenting video production deliveries, thumbnails, and cloud storage controls.
 */
import { h, icon } from '../utils/dom.js';
import { dbService, storageService } from '../firebase/service.js';
import { store } from '../js/store.js';

let localAssetsCache = [];

export const render = () => {
    const { user } = store.getState();
    const isAdmin = user?.role === 'admin';
    const container = h('div', { className: 'fade-in flex-column gap-4' });

    const loadAssets = async () => {
        container.innerHTML = '<div class="loader mb-4"></div>';
        
        let assetsList = [];
        try {
            assetsList = await dbService.getAll('assets');
        } catch (err) {
            console.warn("Error fetching assets:", err);
            assetsList = [];
        }

        container.innerHTML = '';

        const header = h('div', { className: 'content-header flex justify-between items-center w-full mb-4', style: { paddingBottom: '1rem' } }, [
            h('div', {}, [
                h('h1', {}, 'Librería de Producción y Assets en Storage'),
                h('p', { className: 'text-xs text-muted mt-1' }, 'Materiales audiovisuales curados, miniaturas de alta retención y recursos compartidos.')
            ]),
            h('div', { className: 'flex gap-2' }, [
                isAdmin ? h('button', { 
                    className: 'btn btn-primary text-xs',
                    onClick: () => openAssetUploadModal() 
                }, [icon('upload', 14), h('span', {}, 'Subir Asset a Storage')]) : null
            ])
        ]);

        const handleDelete = async (asset) => {
            if (!confirm(`¿Estás seguro de que deseas eliminar permanentemente el archivo "${asset.title}" de Firebase Storage y de la base de datos?`)) return;

            container.innerHTML = '<div class="loader mb-4"></div>';

            try {
                // 1. Delete from Firebase Storage if it has storagePath
                const storagePath = asset.storagePath || `assets/${asset.client}/${asset.title}`;
                await storageService.deleteFile(storagePath);

                // 2. Delete from Firestore Database
                if (asset.id && !asset.id.startsWith('AST-mock-')) {
                    await dbService.delete('assets', asset.id);
                }

                // 3. Remove from local cache
                localAssetsCache = localAssetsCache.filter(a => a.id !== asset.id);

                alert("¡Asset eliminado exitosamente de Storage y Firestore!");
            } catch (err) {
                console.error("Error deleting asset:", err);
                alert(`Error al eliminar asset: ${err.message}`);
            }

            loadAssets();
        };

        const grid = h('div', {
            className: 'grid gap-4',
            style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }
        }, assetsList.map(asset => createAssetCard(asset, isAdmin, handleDelete)));

        container.appendChild(header);
        container.appendChild(grid);
        if (window.lucide) window.lucide.createIcons();
    };

    const openAssetUploadModal = () => {
        const overlay = h('div', { className: 'modal-overlay' });
        
        const saveAssetFlow = async (e) => {
            e.preventDefault();
            const clientVal = form.querySelector('#as-client').value;
            const formatVal = form.querySelector('#as-format').value;
            const fileInput = form.querySelector('#as-file');

            if (!fileInput.files[0]) {
                alert("Selecciona un archivo multimedia válido.");
                return;
            }

            alert(`Subiendo archivo a Firebase Storage: assets/${clientVal}/${fileInput.files[0].name}...`);
            const dlUrl = await storageService.uploadFile(`assets/${clientVal}/${fileInput.files[0].name}`, fileInput.files[0]);

            const newObj = {
                id: `AST-${Date.now().toString().slice(-3)}`,
                title: fileInput.files[0].name,
                type: fileInput.files[0].type.includes('video') ? 'video' : 'thumbnail',
                client: clientVal,
                format: formatVal,
                thumbnail: dlUrl,
                status: 'ready',
                url: dlUrl,
                storagePath: `assets/${clientVal}/${fileInput.files[0].name}`
            };

            try {
                await dbService.add('assets', newObj);
            } catch (err) {
                console.warn("Simulated asset append local:", err);
            }
            localAssetsCache.push(newObj);

            document.body.removeChild(overlay);
            loadAssets();
        };

        const form = h('form', { className: 'modal-container', onSubmit: saveAssetFlow }, [
            h('div', { className: 'modal-header' }, [
                h('span', { className: 'modal-title text-sm' }, 'Subir Nuevo Asset a Firebase Storage'),
                h('button', { type: 'button', onClick: () => document.body.removeChild(overlay), style: { fontWeight: 'bold' } }, '×')
            ]),
            h('div', { className: 'modal-body flex-column gap-3' }, [
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Cliente Asignado'),
                    h('input', { id: 'as-client', className: 'form-input', placeholder: 'Ej. Gimnasio Elite', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Formato Narrativo Relacionado'),
                    h('input', { id: 'as-format', className: 'form-input', placeholder: 'Ej. RC-01', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Seleccionar Archivo Multimedia (Se almacenará en Storage)'),
                    h('input', { id: 'as-file', type: 'file', className: 'form-input text-xs', accept: 'video/*,image/*', required: true })
                ])
            ]),
            h('div', { className: 'modal-footer' }, [
                h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => document.body.removeChild(overlay) }, 'Cancelar'),
                h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, 'Subir y Almacenar')
            ])
        ]);

        overlay.appendChild(form);
        document.body.appendChild(overlay);
    };

    loadAssets();
    
    // Auto-refresh icons observer since assets are dynamic
    setTimeout(() => {
        if (window.lucide) window.lucide.createIcons();
    }, 100);
    
    return container;
};

const statusMap = {
    ready: { label: 'Listo', cls: 'badge-success' },
    editing: { label: 'En Edición', cls: 'badge-warning' },
    review: { label: 'En Revisión', cls: 'badge-error' }
};

const createAssetCard = (asset, isAdmin, onDelete) => {
    const status = statusMap[asset.status] || { label: asset.status, cls: 'badge-secondary' };

    return h('div', { className: 'card interactive-card flex-column justify-between', style: { padding: '0', overflow: 'hidden' } }, [
        h('div', {
            style: {
                height: '150px',
                background: `url(${asset.thumbnail}) center/cover no-repeat`,
                position: 'relative',
                backgroundColor: 'var(--bg-tertiary)',
                borderBottom: '1px solid var(--border)'
            }
        }, [
            h('div', {
                style: {
                    position: 'absolute', top: '8px', right: '8px',
                    display: 'flex', gap: '4px'
                }
            }, [
                h('span', { className: `badge ${status.cls} text-xs`, style: { fontSize: '0.6rem' } }, status.label)
            ]),
            h('div', {
                style: {
                    position: 'absolute', bottom: '8px', left: '12px',
                }
            }, [
                h('span', { className: 'badge badge-secondary text-xs', style: { fontSize: '0.6rem', background: 'rgba(255,255,255,0.9)' } }, asset.format || 'GEN')
            ])
        ]),
        h('div', { className: 'p-4 flex-column gap-2' }, [
            h('div', { className: 'font-bold text-xs text-primary truncate' }, asset.title),
            h('div', { className: 'text-xs text-muted font-medium' }, asset.client || 'General'),
            h('div', { className: 'flex justify-between items-center mt-2 pt-2 border-top flex-wrap gap-2' }, [
                h('a', { 
                    href: asset.url !== '#' ? asset.url : asset.thumbnail, 
                    target: '_blank', 
                    className: 'btn btn-outline text-xs', 
                    style: { padding: '4px 8px', textDecoration: 'none' } 
                }, [icon('external-link', 12), h('span', { className: 'ml-1' }, 'Abrir Media')]),
                
                h('div', { className: 'flex items-center gap-1' }, [
                    h('button', { 
                        className: 'btn-icon text-xs', 
                        style: { width: '26px', height: '26px' }, 
                        title: 'Descargar Original',
                        onClick: () => {
                            const link = document.createElement('a');
                            link.href = asset.url !== '#' ? asset.url : asset.thumbnail;
                            link.target = '_blank';
                            link.download = asset.title || 'asset';
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                        }
                    }, [icon('download', 12)]),
                    
                    isAdmin ? h('button', { 
                        className: 'btn-icon text-error text-xs hover-bg-tertiary', 
                        style: { width: '26px', height: '26px', color: 'var(--error)' }, 
                        title: 'Eliminar de Storage',
                        onClick: () => onDelete(asset)
                    }, [icon('trash-2', 12)]) : null
                ])
            ])
        ])
    ]);
};
