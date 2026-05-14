/**
 * Metrics Page - Creative Production OS
 * Minimalist Notion Light UI displaying video production analytics and operational chart helpers.
 */
import { h, icon } from '../utils/dom.js';

export const render = () => {
    const header = h('div', { className: 'content-header flex justify-between items-center w-full mb-4', style: { paddingBottom: '1rem' } }, [
        h('div', {}, [
            h('h1', {}, 'Análisis Operativo y Rendimiento Narrativo'),
            h('p', { className: 'text-xs text-muted mt-1' }, 'Métricas de retención por segundo, desempeño de hooks y ritmo de montaje de la agencia.')
        ]),
        h('button', { 
            className: 'btn btn-outline text-xs',
            onClick: () => alert("Métricas operativas actualizadas en tiempo real desde Firestore.") 
        }, [icon('refresh-cw', 12), h('span', { className: 'ml-1' }, 'Sincronizar')])
    ]);

    // Simulated Retention chart layout
    const chartBars = h('div', { className: 'flex items-end gap-4 w-full pt-4 border-bottom pb-4', style: { height: '180px' } }, [
        createBarItem('92%', 'HK-Problema', '92%', 'var(--success)'),
        createBarItem('78%', 'HK-Curiosidad', '78%', 'var(--info)'),
        createBarItem('64%', 'HK-SabíasQue', '64%', 'var(--warning)'),
        createBarItem('88%', 'HK-ErrorComún', '88%', 'var(--accent)')
    ]);

    const chartCard = h('div', { className: 'card flex-column justify-between p-5', style: { flex: '2', minWidth: '320px' } }, [
        h('div', {}, [
            h('h3', { className: 'text-xs font-bold uppercase tracking-wider text-secondary mb-1' }, 'Top Retención Est. por Gancho (Primeros 3s)'),
            chartBars
        ]),
        h('span', { className: 'text-xs text-muted mt-2 block text-center' }, 'Eje Y: Porcentaje de usuarios retenidos al segundo 3')
    ]);

    // Learnings List
    const learningsCard = h('div', { className: 'card flex-column gap-3 p-5 bg-secondary', style: { flex: '1', minWidth: '260px' } }, [
        h('h3', { className: 'text-xs font-bold uppercase tracking-wider text-primary' }, 'Aprendizajes Operativos Recientes'),
        
        h('div', { className: 'p-3 bg-primary border-radius-sm flex-column gap-1', style: { border: '1px solid var(--border)', borderRadius: '4px' } }, [
            h('span', { className: 'text-xs font-bold text-info' }, 'RITMO DE VIDEO'),
            h('p', { className: 'text-xs text-muted' }, 'Los primeros 1.5s definen la retención. Aplicar zoom digital suave +10% progresivo.')
        ]),

        h('div', { className: 'p-3 bg-primary border-radius-sm flex-column gap-1', style: { border: '1px solid var(--border)', borderRadius: '4px' } }, [
            h('span', { className: 'text-xs font-bold text-success' }, 'SELECCIÓN MUSICAL'),
            h('p', { className: 'text-xs text-muted' }, 'Tonos cinemáticos sobrios generan +20% de compartidos en cuentas B2B frente a audios virales estridentes.')
        ])
    ]);

    const grid = h('div', { className: 'grid gap-4 flex-wrap', style: { display: 'flex', alignItems: 'stretch' } }, [
        chartCard,
        learningsCard
    ]);

    return h('div', { className: 'fade-in flex-column gap-4' }, [header, grid]);
};

const createBarItem = (heightPct, label, pctText, color) => {
    return h('div', { className: 'flex-1 flex-column items-center justify-end h-full gap-1 relative' }, [
        h('span', { className: 'text-xs font-bold text-primary', style: { fontSize: '0.65rem' } }, pctText),
        h('div', { className: 'w-full border-radius-sm transition hover-bg-tertiary', style: { height: heightPct, background: color, borderRadius: '4px 4px 0 0', opacity: '0.85' } }),
        h('span', { className: 'text-muted text-center truncate w-full', style: { fontSize: '0.6rem', marginTop: '4px' } }, label)
    ]);
};
