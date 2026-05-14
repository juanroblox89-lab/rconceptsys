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
                onClick: () => {
                    const btn = document.getElementById('new-action-btn');
                    if (btn) btn.click();
                }
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
                                navigator.clipboard?.writeText?.(hk.title);
                                alert("Copiado!");
                            }
                        }, [icon('copy', 14)]),
                        isAdmin ? h('button', { 
                            className: 'btn-icon text-error',
                            onClick: async () => {
                                if(confirm("¿Eliminar hook?")) {
                                    await dbService.delete('hooks', hk.id);
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
    };

    const openEditExamplesModal = (hk) => {
        const overlay = h('div', { className: 'modal-overlay' });
        
        const save = async (e) => {
            e.preventDefault();
            const label = form.querySelector('#ex-label').value;
            const url = form.querySelector('#ex-url').value;

            if (!hk.examples) hk.examples = [];
            hk.examples.push({ label, url });

            await dbService.set('hooks', hk.id || hk.title, hk);
            document.body.removeChild(overlay);
            loadHooks();
        };

        const form = h('form', { className: 'modal-container', onSubmit: save }, [
            h('div', { className: 'modal-header' }, [h('span', { className: 'modal-title' }, `Añadir Ejemplo: ${hk.title}`), h('button', { type: 'button', onClick: () => document.body.removeChild(overlay) }, '×')]),
            h('div', { className: 'modal-body flex-column gap-3' }, [
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Etiqueta (Ej: Referencia Viral)'),
                    h('input', { id: 'ex-label', className: 'form-input', placeholder: 'Referencia YouTube/TikTok', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'URL del Video'),
                    h('input', { id: 'ex-url', className: 'form-input', placeholder: 'https://...', required: true })
                ])
            ]),
            h('div', { className: 'modal-footer' }, [
                h('button', { type: 'button', className: 'btn btn-outline', onClick: () => document.body.removeChild(overlay) }, 'Cancelar'),
                h('button', { type: 'submit', className: 'btn btn-primary' }, 'Añadir Ejemplo')
            ])
        ]);
        overlay.appendChild(form);
        document.body.appendChild(overlay);
    };

    loadHooks();
    return container;
};
