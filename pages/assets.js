/**
 * Assets Page - Creative Production OS
 * Google Drive-style file manager for video production deliveries, thumbnails, and cloud storage controls.
 */
import { h, icon, openLightbox } from '../utils/dom.js';
import { dbService, storageService } from '../firebase/service.js';
import { store } from '../js/store.js';

let selectedAsset = null;
let filterClient = '';
let filterType = 'all';
let filterFormat = '';

export const render = () => {
    const { user } = store.getState();
    const isAdmin = user?.role === 'admin';
    const container = h('div', { className: 'fade-in flex-column gap-4 w-full', style: { position: 'relative' } });

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

        // 1. Header
        const header = h('div', { className: 'content-header flex justify-between items-center w-full mb-3' }, [
            h('div', {}, [
                h('h1', {}, 'Librería de Assets'),
                h('p', { className: 'text-xs text-muted mt-1' }, 'Almacén de entregables, miniaturas y material crudo en Firebase Storage.')
            ]),
            h('div', { className: 'flex gap-2' }, [
                isAdmin ? h('button', { 
                    className: 'btn btn-primary text-xs',
                    onClick: () => openAssetUploadModal() 
                }, [icon('upload', 14), h('span', {}, 'Subir Asset')]) : null
            ])
        ]);
        container.appendChild(header);

        // 2. Filters Row
        const filtersRow = h('div', {
            className: 'card p-3 flex gap-3 items-center flex-wrap w-full mb-2',
            style: { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px' }
        }, [
            h('div', { className: 'flex-column gap-1', style: { flex: '1', minWidth: '150px' } }, [
                h('label', { className: 'text-xs font-semibold text-muted' }, 'Cliente'),
                h('input', {
                    type: 'text',
                    className: 'form-input text-xs',
                    placeholder: 'Filtrar cliente...',
                    value: filterClient,
                    onInput: (e) => { filterClient = e.target.value; applyFiltersAndRender(); }
                })
            ]),
            h('div', { className: 'flex-column gap-1', style: { width: '120px' } }, [
                h('label', { className: 'text-xs font-semibold text-muted' }, 'Tipo'),
                h('select', {
                    className: 'form-select text-xs',
                    onChange: (e) => { filterType = e.target.value; applyFiltersAndRender(); }
                }, [
                    h('option', { value: 'all', selected: filterType === 'all' }, 'Todos'),
                    h('option', { value: 'video', selected: filterType === 'video' }, 'Video'),
                    h('option', { value: 'thumbnail', selected: filterType === 'thumbnail' }, 'Miniatura')
                ])
            ]),
            h('div', { className: 'flex-column gap-1', style: { flex: '1', minWidth: '150px' } }, [
                h('label', { className: 'text-xs font-semibold text-muted' }, 'Formato'),
                h('input', {
                    type: 'text',
                    className: 'form-input text-xs',
                    placeholder: 'Ej: RC-01...',
                    value: filterFormat,
                    onInput: (e) => { filterFormat = e.target.value; applyFiltersAndRender(); }
                })
            ]),
            h('button', {
                className: 'btn btn-outline text-xs',
                style: { alignSelf: 'flex-end', height: '32px' },
                onClick: () => { filterClient = ''; filterType = 'all'; filterFormat = ''; loadAssets(); }
            }, 'Limpiar')
        ]);
        container.appendChild(filtersRow);

        // Apply filters
        const filteredAssets = assetsList.filter(asset => {
            if (filterClient && !asset.client?.toLowerCase().includes(filterClient.toLowerCase())) return false;
            if (filterType !== 'all' && asset.type !== filterType) return false;
            if (filterFormat && !asset.format?.toLowerCase().includes(filterFormat.toLowerCase())) return false;
            return true;
        });

        // 3. Grid of files
        const grid = h('div', { className: 'assets-drive-grid w-full' });
        filteredAssets.forEach(asset => {
            grid.appendChild(createDriveCard(asset, () => {
                selectedAsset = asset;
                openSideDrawer(asset, assetsList, loadAssets, isAdmin);
            }));
        });

        if (filteredAssets.length === 0) {
            container.appendChild(h('div', { className: 'card p-10 text-center text-xs text-muted w-full' }, 'No se encontraron assets con los filtros aplicados.'));
        } else {
            container.appendChild(grid);
        }

        // 4. Slide Drawer Backdrop & Container (rendered hidden initially)
        const backdrop = h('div', { className: 'drawer-backdrop', onClick: () => closeSideDrawer() });
        const drawer = h('div', { className: 'drawer-container', id: 'asset-side-drawer' });
        
        container.appendChild(backdrop);
        container.appendChild(drawer);

        if (window.lucide) window.lucide.createIcons();
    };

    const applyFiltersAndRender = () => {
        loadAssets();
    };

    const openAssetUploadModal = () => {
        const overlay = h('div', { className: 'modal-overlay' });
        
        const saveAssetFlow = async (e) => {
            e.preventDefault();
            const clientVal = form.querySelector('#as-client').value;
            const formatVal = form.querySelector('#as-format').value;
            const fileInput = form.querySelector('#as-file');
            const submitBtn = form.querySelector('button[type="submit"]');

            if (!fileInput.files[0]) {
                alert("Selecciona un archivo multimedia válido.");
                return;
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = 'Subiendo...';
            
            try {
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
                    size: `${Math.round(fileInput.files[0].size / (1024 * 1024) * 10) / 10} MB`,
                    description: '',
                    storagePath: `assets/${clientVal}/${fileInput.files[0].name}`,
                    createdAt: new Date().toISOString()
                };

                await dbService.add('assets', newObj);
                document.body.removeChild(overlay);
                loadAssets();
            } catch (err) {
                console.error("Upload error", err);
                alert("Error al subir archivo: " + err.message);
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Subir y Almacenar';
            }
        };

        const form = h('form', { className: 'modal-container', onSubmit: saveAssetFlow }, [
            h('div', { className: 'modal-header' }, [
                h('span', { className: 'modal-title text-sm' }, 'Subir Nuevo Asset a Storage'),
                h('button', { type: 'button', onClick: () => document.body.removeChild(overlay), style: { fontWeight: 'bold' } }, '×')
            ]),
            h('div', { className: 'modal-body flex-column gap-3' }, [
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Cliente Asignado'),
                    h('input', { id: 'as-client', className: 'form-input', placeholder: 'Ej. Villa Grande', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Formato Narrativo Relacionado'),
                    h('input', { id: 'as-format', className: 'form-input', placeholder: 'Ej. RC-01', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Seleccionar Archivo (Video o Imagen)'),
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
    return container;
};

// Create a drive-style card
const createDriveCard = (asset, onClick) => {
    let mediaElement;
    if (asset.type === 'video') {
        mediaElement = h('video', { 
            src: asset.thumbnail || asset.url,
            style: { width: '100%', height: '100%', objectFit: 'cover' },
            muted: true,
            playsinline: true,
            preload: 'metadata'
        });
        mediaElement.onmouseenter = () => mediaElement.play().catch(()=>{});
        mediaElement.onmouseleave = () => {
            mediaElement.pause();
            mediaElement.currentTime = 0;
        };
    } else {
        mediaElement = h('img', {
            src: asset.thumbnail || asset.url,
            style: { width: '100%', height: '100%', objectFit: 'cover' }
        });
    }

    return h('div', { className: 'asset-card-drive', onClick }, [
        h('div', { className: 'asset-thumbnail-container' }, [
            mediaElement,
            h('span', { 
                className: 'badge text-xs', 
                style: { position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.6)', color: 'var(--text-primary)' } 
            }, asset.type === 'video' ? 'VIDEO' : 'IMG'),
            h('span', {
                className: 'badge text-xs',
                style: { position: 'absolute', bottom: '8px', left: '8px', background: 'var(--bg-primary)' }
            }, asset.format || 'GEN')
        ]),
        h('div', { className: 'p-3 flex-column gap-1' }, [
            h('div', { className: 'font-bold text-xs text-primary truncate' }, asset.title),
            h('div', { className: 'flex justify-between items-center text-xs text-muted' }, [
                h('span', {}, asset.client || 'General'),
                h('span', { style: { fontSize: '0.65rem' } }, asset.size || 'N/A')
            ])
        ])
    ]);
};

// Open the collapsible Side Drawer
function openSideDrawer(asset, allAssets, reload, isAdmin) {
    const drawer = document.getElementById('asset-side-drawer');
    const backdrop = document.querySelector('.drawer-backdrop');
    if (!drawer || !backdrop) return;

    drawer.innerHTML = '';

    // Close Button
    const header = h('div', { className: 'flex justify-between items-center pb-2 border-bottom' }, [
        h('h3', { className: 'text-sm font-bold text-primary truncate', style: { maxWidth: '280px' } }, asset.title),
        h('button', { 
            className: 'btn-icon text-muted text-sm font-bold', 
            style: { border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer' },
            onClick: () => closeSideDrawer() 
        }, '×')
    ]);
    drawer.appendChild(header);

    // Media Preview
    let previewEl;
    if (asset.type === 'video') {
        previewEl = h('video', {
            src: asset.url,
            controls: true,
            style: { width: '100%', borderRadius: '6px', maxHeight: '180px', background: '#000' }
        });
    } else {
        previewEl = h('img', {
            src: asset.url,
            style: { width: '100%', borderRadius: '6px', cursor: 'pointer', maxHeight: '180px', objectFit: 'contain' },
            onClick: () => openLightbox(asset.url)
        });
    }
    drawer.appendChild(previewEl);

    // Details Grid
    const details = h('div', { className: 'flex-column gap-2 text-xs', style: { borderBottom: '1px solid var(--border)', paddingBottom: '16px' } }, [
        h('div', { className: 'flex justify-between' }, [h('span', { className: 'text-muted' }, 'Cliente:'), h('span', { className: 'font-semibold' }, asset.client || 'General')]),
        h('div', { className: 'flex justify-between' }, [h('span', { className: 'text-muted' }, 'Formato:'), h('span', { className: 'font-semibold text-accent' }, asset.format || 'N/A')]),
        h('div', { className: 'flex justify-between' }, [h('span', { className: 'text-muted' }, 'Peso:'), h('span', { className: 'font-semibold' }, asset.size || 'N/A')]),
        h('div', { className: 'flex justify-between' }, [h('span', { className: 'text-muted' }, 'Tipo:'), h('span', { className: 'font-semibold uppercase' }, asset.type)]),
        h('div', { className: 'flex justify-between' }, [h('span', { className: 'text-muted' }, 'Fecha:'), h('span', { className: 'font-semibold' }, asset.createdAt ? new Date(asset.createdAt).toLocaleDateString('es-ES') : 'N/A')])
    ]);
    drawer.appendChild(details);

    // Editable Description Block
    const descTextarea = h('textarea', {
        className: 'form-textarea text-xs',
        rows: 3,
        placeholder: 'Añadir una descripción...',
        value: asset.description || ''
    });
    const saveDescBtn = h('button', {
        className: 'btn btn-primary text-xs w-full justify-center',
        onClick: async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.textContent = 'Guardando...';
            try {
                await dbService.update('assets', asset.id, { description: descTextarea.value });
                asset.description = descTextarea.value;
                alert('Descripción guardada.');
            } catch (err) {
                alert('Error al guardar descripción: ' + err.message);
            } finally {
                btn.disabled = false;
                btn.textContent = 'Guardar Descripción';
            }
        }
    }, 'Guardar Descripción');

    drawer.appendChild(h('div', { className: 'flex-column gap-2' }, [
        h('label', { className: 'text-xs font-semibold text-primary' }, 'Descripción / Uso de Asset'),
        descTextarea,
        saveDescBtn
    ]));

    // Related Assets
    const relatedList = allAssets.filter(a => a.client === asset.client && a.id !== asset.id).slice(0, 3);
    const relatedContainer = h('div', { className: 'flex-column gap-2 mt-2' }, [
        h('label', { className: 'text-xs font-semibold text-primary' }, 'Videos / Assets Relacionados'),
        relatedList.length === 0
            ? h('span', { className: 'text-xs text-muted italic' }, 'No hay otros videos relacionados.')
            : h('div', { className: 'flex-column gap-1.5' }, relatedList.map(ra => {
                return h('div', { 
                    className: 'p-2 rounded bg-tertiary flex items-center justify-between text-xs cursor-pointer hover-bg-secondary',
                    style: { border: '1px solid var(--border)' },
                    onClick: () => { openSideDrawer(ra, allAssets, reload, isAdmin); }
                }, [
                    h('span', { className: 'truncate font-medium text-secondary', style: { maxWidth: '180px' } }, ra.title),
                    h('span', { className: 'text-muted', style: { fontSize: '0.65rem' } }, ra.size || 'N/A')
                ]);
            }))
    ]);
    drawer.appendChild(relatedContainer);

    // Footer Actions (Download and delete)
    const deleteBtn = isAdmin ? h('button', {
        className: 'btn btn-outline text-xs text-error w-full justify-center',
        style: { borderColor: 'var(--error)', color: 'var(--error)', background: 'transparent' },
        onClick: async () => {
            if (!confirm(`¿Eliminar definitivamente "${asset.title}"?`)) return;
            try {
                // Try deleting from storage but don't fail the database deletion if it fails
                try {
                    await storageService.deleteFile(asset.storagePath || `assets/${asset.client}/${asset.title}`);
                } catch (storageErr) {
                    console.warn("Could not delete file from storage (it might not exist), proceeding to delete database document:", storageErr);
                }
                await dbService.delete('assets', asset.id);
                alert("¡Asset eliminado exitosamente!");
                closeSideDrawer();
                reload();
            } catch (err) {
                alert('Error al eliminar: ' + err.message);
            }
        }
    }, [icon('trash-2', 12), h('span', { className: 'ml-1' }, 'Eliminar de Storage')]) : null;

    const downloadBtn = h('a', {
        href: asset.url,
        target: '_blank',
        download: asset.title,
        className: 'btn btn-primary text-xs w-full justify-center items-center gap-1',
        style: { textDecoration: 'none' }
    }, [icon('download', 12), h('span', {}, 'Descargar Original')]);

    drawer.appendChild(h('div', { className: 'flex-column gap-2 mt-auto pt-4 border-top' }, [
        downloadBtn,
        deleteBtn
    ].filter(Boolean)));

    // Open animations
    drawer.classList.add('open');
    backdrop.classList.add('open');

    if (window.lucide) window.lucide.createIcons();
}

function closeSideDrawer() {
    const drawer = document.getElementById('asset-side-drawer');
    const backdrop = document.querySelector('.drawer-backdrop');
    if (drawer) drawer.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    selectedAsset = null;
}
