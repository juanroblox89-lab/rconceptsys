/**
 * Hooks Page - Creative Production OS
 * Notion Light UI presenting video retention hooks and operational psychology guidelines.
 */
import { h, icon } from '../utils/dom.js';
import { hooks as initialHooks } from '../data/mockData.js';
import { Table } from '../components/ui/Table.js';
import { dbService } from '../firebase/service.js';
import { store } from '../js/store.js';

export const render = () => {
    const { user } = store.getState();
    const isAdmin = user?.role === 'admin';
    const container = h('div', { className: 'fade-in flex-column gap-4' });

    const loadHooks = async () => {
        container.innerHTML = '<div class="loader mb-4"></div>';
        
        let hooksList = [];
        try {
            const list = await dbService.getAll('hooks');
            hooksList = list.length ? list : initialHooks;
        } catch (err) {
            hooksList = initialHooks;
        }

        container.innerHTML = '';

        // Header
        const header = h('div', { className: 'content-header flex justify-between items-center w-full mb-4', style: { paddingBottom: '1rem' } }, [
            h('div', {}, [
                h('h1', {}, 'Biblioteca de Hooks de Retención'),
                h('p', { className: 'text-xs text-muted mt-1' }, 'Estructuras verbales y visuales iniciales diseñadas para detener el scroll y activar el sistema de curiosidad.')
            ]),
            isAdmin ? h('button', { 
                className: 'btn btn-primary text-xs',
                onClick: () => openCreateHookModal()
            }, [icon('plus', 14), h('span', {}, 'Añadir Hook')]) : null
        ]);

        // Table
        const hooksTable = Table({
            headers: ['Categoría', 'Patrón de Hook / Gancho', 'Psicología Aplicada', 'Ejemplos / Refs', 'Acción'],
            data: hooksList,
            renderRow: (hk) => h('tr', { key: hk.id || hk.title }, [
                h('td', {}, h('span', { className: 'badge badge-secondary text-xs font-semibold' }, hk.category || 'General')),
                h('td', { className: 'font-bold text-xs text-primary' }, `"${hk.title}"`),
                h('td', { className: 'text-xs text-muted leading-normal', style: { maxWidth: '250px' } }, hk.psychology || hk.description),
                h('td', {}, [
                    h('div', { className: 'flex-column gap-1' }, 
                        (!hk.examples || !hk.examples.length) ? [h('span', { className: 'text-xs text-muted italic' }, 'Sin ejemplos')] :
                        hk.examples.map(ex => h('a', { 
                            href: ex.url, 
                            target: '_blank', 
                            className: 'text-xs text-info no-underline hover-underline flex items-center gap-1' 
                        }, [icon('external-link', 10), h('span', {}, ex.label || 'Ver Video')]))
                    ),
                    isAdmin ? h('button', { 
                        className: 'text-xs text-accent mt-2 font-bold',
                        onClick: () => openEditExamplesModal(hk)
                    }, '+ Gestionar') : null
                ]),
                h('td', {}, [
                    h('div', { className: 'flex gap-2' }, [
                        h('button', { 
                            className: 'btn-icon', 
                            title: 'Copiar Hook',
                            onClick: () => {
                                if (navigator.clipboard) {
                                    navigator.clipboard.writeText(hk.title);
                                    alert("¡Hook copiado al portapapeles!");
                                } else {
                                    alert("Copiado: " + hk.title);
                                }
                            }
                        }, [icon('copy', 14)]),
                        isAdmin ? h('button', { 
                            className: 'btn-icon text-error',
                            onClick: async () => {
                                if(confirm("¿Eliminar hook?")) {
                                    await dbService.delete('hooks', hk.id || hk.title);
                                    loadHooks();
                                }
                            }
                        }, [icon('trash-2', 14)]) : null
                    ])
                ])
            ])
        });

        // Tip container
        const tipBox = h('div', { className: 'p-4 bg-tertiary border-radius-md text-xs text-secondary mt-2 flex-column gap-1', style: { border: '1px solid var(--border)', borderRadius: '6px' } }, [
            h('span', { className: 'font-bold text-primary flex items-center gap-1' }, [icon('lightbulb', 14, 'text-warning'), h('span', {}, 'Directriz Operativa de Edición')]),
            h('p', { className: 'text-muted mt-1' }, 'Asegúrate de que los primeros 3 segundos en el timeline soporten visualmente el enunciado verbal del hook. Guarda una miniatura nativa o referencia en el directorio de Assets del cliente.')
        ]);

        container.appendChild(header);
        container.appendChild(h('div', { className: 'card p-0 w-full' }, [hooksTable]));
        container.appendChild(tipBox);
        if (window.lucide) window.lucide.createIcons();
    };

    const openCreateHookModal = () => {
        const overlay = h('div', { className: 'modal-overlay' });
        const form = h('form', {
            className: 'modal-container',
            onSubmit: async (e) => {
                e.preventDefault();
                const catVal = form.querySelector('#hk-cat').value.trim();
                const titleVal = form.querySelector('#hk-title').value.trim();
                const psychVal = form.querySelector('#hk-psych').value.trim();

                const id = `HK-${Date.now().toString().slice(-4)}`;
                const newHook = {
                    id,
                    category: catVal || 'General',
                    title: titleVal,
                    psychology: psychVal,
                    examples: []
                };

                try {
                    await dbService.set('hooks', id, newHook);
                } catch (err) {
                    console.warn("Offline hook saving simulated:", err);
                }

                document.body.removeChild(overlay);
                loadHooks();
            }
        }, [
            h('div', { className: 'modal-header' }, [
                h('span', { className: 'modal-title' }, 'Añadir Nuevo Hook Gancho'),
                h('button', { type: 'button', onClick: () => document.body.removeChild(overlay) }, '×')
            ]),
            h('div', { className: 'modal-body flex-column gap-3' }, [
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Categoría'),
                    h('select', { id: 'hk-cat', className: 'form-select text-xs', required: true }, [
                        h('option', { value: 'Problema / Dolor' }, 'Problema / Dolor'),
                        h('option', { value: 'Curiosidad / Misterio' }, 'Curiosidad / Misterio'),
                        h('option', { value: 'Contradicción / Contra-Intuitivo' }, 'Contradicción / Contra-Intuitivo'),
                        h('option', { value: 'Autoridad / Desafío' }, 'Autoridad / Desafío'),
                        h('option', { value: 'General' }, 'General')
                    ])
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Patrón de Gancho / Frase Verbal'),
                    h('input', { id: 'hk-title', className: 'form-input', placeholder: 'Ej. "Esta es la razón número uno por la que..."', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Psicología Aplicada'),
                    h('textarea', { id: 'hk-psych', className: 'form-textarea', placeholder: '¿Por qué funciona este hook y qué sesgo cognitivo activa?', required: true })
                ])
            ]),
            h('div', { className: 'modal-footer' }, [
                h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => document.body.removeChild(overlay) }, 'Cancelar'),
                h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, 'Crear Hook')
            ])
        ]);
        overlay.appendChild(form);
        document.body.appendChild(overlay);
        
        setTimeout(() => {
            if (window.lucide) window.lucide.createIcons();
        }, 50);
    };

    const openEditExamplesModal = (hk) => {
        const overlay = h('div', { className: 'modal-overlay' });
        
        const renderModalContent = () => {
            const container = h('div', { className: 'modal-container', style: { maxWidth: '500px' } });
            
            const renderModalContentBody = () => {
                const examplesList = h('div', { className: 'flex-column gap-2 mb-3 mt-1' }, 
                    (!hk.examples || !hk.examples.length) 
                        ? [h('span', { className: 'text-xs text-muted italic p-3 bg-secondary text-center border-radius-sm', style: { display: 'block', border: '1px dashed var(--border)' } }, 'Sin ejemplos guardados.')]
                        : hk.examples.map((ex, idx) => h('div', { key: idx, className: 'flex justify-between items-center p-2 bg-secondary border-radius-sm', style: { border: '1px solid var(--border)' } }, [
                            h('a', { href: ex.url, target: '_blank', className: 'text-xs text-info hover-underline font-medium flex items-center gap-1' }, [icon('external-link', 10), h('span', {}, ex.label || 'Ver Video')]),
                            h('button', {
                                type: 'button',
                                className: 'btn-icon text-error',
                                style: { padding: '2px', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
                                onClick: async () => {
                                    hk.examples.splice(idx, 1);
                                    try {
                                        await dbService.set('hooks', hk.id || hk.title, hk);
                                    } catch (err) {
                                        console.warn("Offline simulated edit:", err);
                                    }
                                    loadHooks();
                                    container.innerHTML = '';
                                    container.appendChild(renderModalContentBody());
                                    if (window.lucide) window.lucide.createIcons();
                                }
                            }, [icon('trash-2', 12)])
                        ]))
                );

                const addForm = h('form', {
                    onSubmit: async (e) => {
                        e.preventDefault();
                        const labelVal = addForm.querySelector('#ex-label').value.trim();
                        const urlVal = addForm.querySelector('#ex-url').value.trim();

                        if (!hk.examples) hk.examples = [];
                        hk.examples.push({ label: labelVal, url: urlVal });

                        try {
                            await dbService.set('hooks', hk.id || hk.title, hk);
                        } catch (err) {
                            console.warn("Offline simulated edit:", err);
                        }
                        loadHooks();
                        container.innerHTML = '';
                        container.appendChild(renderModalContentBody());
                        if (window.lucide) window.lucide.createIcons();
                    }
                }, [
                    h('div', { className: 'grid gap-2 mb-3', style: { display: 'grid', gridTemplateColumns: '1fr 1fr' } }, [
                        h('div', { className: 'form-group' }, [
                            h('label', { className: 'form-label' }, 'Etiqueta'),
                            h('input', { id: 'ex-label', className: 'form-input text-xs', placeholder: 'Referencia YouTube/TikTok', required: true })
                        ]),
                        h('div', { className: 'form-group' }, [
                            h('label', { className: 'form-label' }, 'URL del Video'),
                            h('input', { id: 'ex-url', className: 'form-input text-xs', placeholder: 'https://...', required: true })
                        ])
                    ]),
                    h('button', { type: 'submit', className: 'btn btn-primary text-xs w-full justify-center mb-2' }, [icon('plus', 12), h('span', {}, 'Añadir Nuevo Ejemplo')])
                ]);

                return h('div', { style: { display: 'contents' } }, [
                    h('div', { className: 'modal-header' }, [
                        h('span', { className: 'modal-title' }, 'Gestionar Ejemplos'),
                        h('button', { type: 'button', onClick: () => document.body.removeChild(overlay) }, '×')
                    ]),
                    h('div', { className: 'modal-body flex-column gap-2' }, [
                        h('span', { className: 'text-xs font-bold text-primary' }, 'Ejemplos Actuales:'),
                        examplesList,
                        h('span', { className: 'text-xs font-bold text-primary mt-2 border-top pt-2' }, 'Añadir Ejemplo:'),
                        addForm
                    ]),
                    h('div', { className: 'modal-footer' }, [
                        h('button', { type: 'button', className: 'btn btn-outline text-xs', onClick: () => document.body.removeChild(overlay) }, 'Cerrar')
                    ])
                ]);
            };

            container.appendChild(renderModalContentBody());
            return container;
        };

        overlay.appendChild(renderModalContent());
        document.body.appendChild(overlay);
        if (window.lucide) window.lucide.createIcons();
    };

    loadHooks();
    return container;
};
