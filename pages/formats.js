/**
 * Formats Page - Creative Production OS
 * Notion Light UI presenting video production structures and operational objectives.
 */
import { h, icon } from '../utils/dom.js';
import { formats as initialFormats } from '../data/mockData.js';
import { dbService } from '../firebase/service.js';
import { store } from '../js/store.js';

export const render = () => {
    const { user } = store.getState();
    const isAdmin = user?.role === 'admin';
    const container = h('div', { className: 'fade-in flex-column gap-4' });

    const loadFormats = async () => {
        container.innerHTML = '<div class="loader mb-4"></div>';
        
        let formatsList = [];
        try {
            const list = await dbService.getAll('formats');
            formatsList = list.length ? list : initialFormats;
        } catch (err) {
            formatsList = initialFormats;
        }

        container.innerHTML = '';

        // Header
        const header = h('div', { className: 'content-header flex justify-between items-center w-full mb-4', style: { paddingBottom: '1rem' } }, [
            h('div', {}, [
                h('h1', {}, 'Librería Operativa de Formatos de Video'),
                h('p', { className: 'text-xs text-muted mt-1' }, 'Estructuras narrativas estandarizadas para maximizar la retención y conversión en pauta o contenido orgánico.')
            ]),
            isAdmin ? h('button', { 
                className: 'btn btn-primary text-xs',
                onClick: () => {
                    const btn = document.getElementById('new-action-btn');
                    if (btn) btn.click();
                }
            }, [icon('plus', 14), h('span', {}, 'Crear Formato')]) : null
        ]);

        // Grid
        const grid = h('div', { className: 'grid gap-4', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' } }, 
            formatsList.map(f => h('div', { key: f.id || f.name, className: 'card flex-column gap-3 p-5 relative' }, [
                h('div', { className: 'flex justify-between items-start' }, [
                    h('span', { className: 'badge badge-info text-xs font-bold' }, f.id || 'NUEVO'),
                    h('span', { className: 'text-xs text-muted font-semibold' }, f.kpis || 'Retención > 45%')
                ]),
                h('h3', { className: 'text-sm font-bold text-primary mt-1' }, f.name || f.title),
                h('p', { className: 'text-xs text-muted leading-relaxed' }, f.objective || f.description),
                
                h('div', { className: 'p-3 bg-secondary border-radius-sm mt-1', style: { border: '1px solid var(--border)', borderRadius: '4px' } }, [
                    h('div', { className: 'text-xs font-bold text-muted uppercase tracking-wider mb-1', style: { fontSize: '0.65rem' } }, 'Secuencia de Estructura'),
                    h('div', { className: 'text-xs font-medium text-primary' }, f.structure || 'Intro Gancho > Desarrollo > CTA')
                ]),

                h('div', { className: 'flex-column gap-1 mt-1 pt-2 border-top' }, [
                    h('span', { className: 'text-xs font-semibold text-secondary' }, 'Hooks Relacionados:'),
                    h('div', { className: 'flex gap-1 flex-wrap mt-1' }, 
                        (f.hooks || ['Problema-Solución']).map((hk, i) => h('span', { key: i, className: 'badge badge-secondary text-xs font-normal' }, hk))
                    )
                ])
            ]))
        );

        container.appendChild(header);
        container.appendChild(grid);
    };

    loadFormats();
    return container;
};
