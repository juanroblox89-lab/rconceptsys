import { h, icon } from '../../utils/dom.js';
import { store } from '../../js/store.js';
import { dbService } from '../../firebase/service.js';

export const CommandPalette = () => {
    let isOpen = false;
    let query = '';
    let results = [];
    let selectedIndex = 0;
    
    const overlay = h('div', { 
        id: 'command-palette-overlay',
        className: 'modal-overlay',
        style: { display: 'none', zIndex: 9999, alignItems: 'flex-start', paddingTop: '10vh' },
        onClick: (e) => { if (e.target === overlay) close(); }
    });

    const container = h('div', { 
        className: 'command-palette-container',
        style: {
            width: '100%',
            maxWidth: '640px',
            background: '#ffffff',
            borderRadius: '12px',
            boxShadow: '0 20px 70px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
        }
    });

    const input = h('input', {
        type: 'text',
        placeholder: 'Busca clientes, acciones, facturas...',
        className: 'w-full p-5 text-lg outline-none border-bottom',
        style: { border: 'none', borderBottom: '1px solid var(--border)' },
        onInput: (e) => {
            query = e.target.value;
            updateResults();
        },
        onKeyDown: (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIndex = (selectedIndex + 1) % results.length;
                renderResults();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIndex = (selectedIndex - 1 + results.length) % results.length;
                renderResults();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (results[selectedIndex]) executeAction(results[selectedIndex]);
            } else if (e.key === 'Escape') {
                close();
            }
        }
    });

    const resultsList = h('div', { 
        className: 'results-list',
        style: { maxHeight: '400px', overflowY: 'auto', padding: '8px' }
    });

    const footer = h('div', {
        className: 'p-3 bg-secondary text-xs text-muted flex items-center justify-between border-top',
        style: { fontSize: '0.65rem', padding: '8px 16px' }
    }, [
        h('div', { className: 'flex gap-3' }, [
            h('span', {}, [h('kbd', { className: 'kbd' }, '↑↓'), ' Navegar']),
            h('span', {}, [h('kbd', { className: 'kbd' }, 'Enter'), ' Seleccionar']),
            h('span', {}, [h('kbd', { className: 'kbd' }, 'Esc'), ' Cerrar'])
        ]),
        h('span', { className: 'font-bold' }, 'ROHLFING OPERATIONAL OS')
    ]);

    container.appendChild(input);
    container.appendChild(resultsList);
    container.appendChild(footer);
    overlay.appendChild(container);

    const open = () => {
        isOpen = true;
        overlay.style.display = 'flex';
        input.value = '';
        query = '';
        updateResults();
        setTimeout(() => input.focus(), 10);
    };

    const close = () => {
        isOpen = false;
        overlay.style.display = 'none';
    };

    const updateResults = async () => {
        const staticActions = [
            { type: 'action', id: 'new-asg', title: 'Crear Nueva Asignación', icon: 'plus-circle', shortcut: 'A', action: () => window.location.hash = '#assignments' },
            { type: 'action', id: 'new-inv', title: 'Reportar Nuevo Trabajo', icon: 'file-plus', shortcut: 'F', action: () => window.location.hash = '#billing' },
            { type: 'action', id: 'go-dashboard', title: 'Ir al Dashboard', icon: 'layout-dashboard', action: () => window.location.hash = '#dashboard' },
            { type: 'action', id: 'go-clients', title: 'Ver Directorio de Clientes', icon: 'users', action: () => window.location.hash = '#clients' },
        ];

        let dynamicResults = [];
        if (query.length > 1) {
            // In a real app, we'd fetch or filter a global search index
            // For now, let's filter from what we might have or common paths
            const clients = await dbService.getAll('clients');
            dynamicResults = clients
                .filter(c => c.name.toLowerCase().includes(query.toLowerCase()))
                .map(c => ({ type: 'client', id: c.id, title: `Cliente: ${c.name}`, icon: 'briefcase', action: () => window.location.hash = `#client/${c.id}` }));
        }

        results = query.length > 0 
            ? [...staticActions.filter(a => a.title.toLowerCase().includes(query.toLowerCase())), ...dynamicResults]
            : staticActions;
            
        selectedIndex = 0;
        renderResults();
    };

    const renderResults = () => {
        resultsList.innerHTML = '';
        if (results.length === 0) {
            resultsList.appendChild(h('div', { className: 'p-8 text-center text-muted text-sm' }, 'No se encontraron resultados.'));
            return;
        }

        results.forEach((item, index) => {
            const itemEl = h('div', {
                className: `result-item flex items-center justify-between p-3 border-radius-md cursor-pointer transition ${index === selectedIndex ? 'bg-accent text-white active' : 'hover-bg-secondary'}`,
                style: { borderRadius: '8px', marginBottom: '2px' },
                onClick: () => executeAction(item)
            }, [
                h('div', { className: 'flex items-center gap-3' }, [
                    icon(item.icon || 'hash', 18, index === selectedIndex ? 'text-white' : 'text-muted'),
                    h('span', { className: 'text-sm font-medium' }, item.title)
                ]),
                item.shortcut ? h('span', { className: 'text-xs opacity-50' }, item.shortcut) : null
            ]);
            resultsList.appendChild(itemEl);
        });
    };

    const executeAction = (item) => {
        item.action();
        close();
    };

    // Listen for global shortcut
    window.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            if (isOpen) close(); else open();
        }
    });

    return overlay;
};
