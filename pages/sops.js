/**
 * SOPs Page - Creative Production OS
 * Standard Operating Procedures presented in clean Notion Light UI with functional procedural viewing flows.
 */
import { h, icon } from '../utils/dom.js';
import { dbService } from '../firebase/service.js';
import { store } from '../js/store.js';

let localSopsCache = [
    {
        id: 'SOP-001',
        title: 'Grabación en Set',
        iconName: 'video',
        steps: [
            { text: 'Limpieza de lentes y sensores', done: true },
            { text: 'Ajuste de Shutter Speed (Regla de los 180°)', done: true },
            { text: 'Chequeo de niveles de audio (-12db)', done: false },
            { text: 'Backup de tarjetas SD al terminar', done: false }
        ]
    },
    {
        id: 'SOP-002',
        title: 'Post-Producción',
        iconName: 'scissors',
        steps: [
            { text: 'Naming de archivos (YYYYMMDD_Client_Project)', done: true },
            { text: 'Primer corte (Rough Cut) - Sin música', done: false },
            { text: 'Color Grading (Rec.709 base)', done: false },
            { text: 'Exportación para Reels (1080x1920)', done: false }
        ]
    }
];

export const render = () => {
    const { user } = store.getState();
    const isAdmin = user?.role === 'admin';
    const container = h('div', { className: 'fade-in flex-column gap-4' });

    const loadSops = async () => {
        container.innerHTML = '<div class="loader mb-4"></div>';
        
        let sopsList = [];
        try {
            const list = await dbService.getAll('sops');
            sopsList = list.length ? list : localSopsCache;
        } catch (err) {
            sopsList = localSopsCache;
        }

        container.innerHTML = '';

        const header = h('div', { className: 'content-header flex justify-between items-center w-full mb-4', style: { paddingBottom: '1rem' } }, [
            h('div', {}, [
                h('h1', {}, 'Procedimientos Operativos Estándar (SOPs)'),
                h('p', { className: 'text-xs text-muted mt-1' }, 'Listas de verificación de cumplimiento de calidad para estandarizar entregas en rodaje y edición.')
            ]),
            isAdmin ? h('button', { 
                className: 'btn btn-primary text-xs',
                onClick: () => {
                    const btn = document.getElementById('new-action-btn');
                    if (btn) btn.click();
                } 
            }, [icon('plus', 14), h('span', {}, 'Nueva Guía')]) : null
        ]);

        const grid = h('div', { className: 'grid gap-4', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' } }, 
            sopsList.map(sop => h('div', { key: sop.id || sop.title, className: 'card flex-column justify-between p-5' }, [
                h('div', {}, [
                    h('div', { className: 'flex items-center gap-3 mb-3 border-bottom pb-3' }, [
                        h('div', { className: 'btn-icon flex items-center justify-center font-bold text-accent', style: { width: '36px', height: '36px', borderRadius: '6px', background: 'var(--bg-tertiary)' } }, [
                            icon(sop.iconName || 'check-square', 18)
                        ]),
                        h('h4', { className: 'font-bold text-sm text-primary' }, sop.title || sop.name)
                    ]),
                    
                    h('ul', { className: 'flex-column gap-2 mt-2', style: { listStyle: 'none' } }, 
                        (sop.steps || [{ text: sop.objective || 'Cumplir lineamiento', done: true }]).map((st, i) => h('li', { key: i, className: 'flex items-center gap-2 text-xs text-secondary' }, [
                            icon(st.done ? 'check-circle-2' : 'circle', 14, st.done ? 'text-success' : 'text-muted'),
                            h('span', { className: st.done ? 'font-medium text-primary' : '' }, st.text)
                        ]))
                    )
                ]),

                h('button', { 
                    className: 'btn btn-outline text-xs w-full justify-center mt-4',
                    onClick: () => openSopDetailModal(sop) 
                }, 'Auditar / Ver Detalle Completo')
            ]))
        );

        container.appendChild(header);
        container.appendChild(grid);
    };

    const openSopDetailModal = (sopItem) => {
        const overlay = h('div', { className: 'modal-overlay' });
        const panel = h('div', { className: 'modal-container p-6 flex-column gap-3' }, [
            h('div', { className: 'flex justify-between items-center border-bottom pb-2' }, [
                h('h3', { className: 'font-bold text-sm text-primary flex items-center gap-2' }, [
                    icon(sopItem.iconName || 'check-square', 18),
                    h('span', {}, `SOP: ${sopItem.title || sopItem.name}`)
                ]),
                h('button', { className: 'btn-icon text-xs', style: { width: '24px', height: '24px' }, onClick: () => document.body.removeChild(overlay) }, '×')
            ]),
            h('p', { className: 'text-xs text-muted' }, 'Guía procedimental y validación paso a paso de producción. Todos los miembros del equipo deben verificar el cumplimiento de cada punto antes de la renderización final.'),
            
            h('div', { className: 'flex-column gap-2 mt-2 p-3 bg-secondary border-radius-sm' }, 
                (sopItem.steps || [{ text: sopItem.objective || 'Verificación en curso', done: true }]).map((st, idx) => h('div', { key: idx, className: 'flex items-center gap-2 text-xs' }, [
                    h('input', { type: 'checkbox', checked: st.done, disabled: true }),
                    h('span', { className: st.done ? 'text-primary font-medium' : 'text-muted' }, st.text)
                ]))
            ),

            h('div', { className: 'flex justify-end mt-2 pt-2 border-top' }, [
                h('button', { className: 'btn btn-primary text-xs', onClick: () => document.body.removeChild(overlay) }, 'Entendido y Validado')
            ])
        ]);

        overlay.appendChild(panel);
        document.body.appendChild(overlay);
    };

    loadSops();
    return container;
};
