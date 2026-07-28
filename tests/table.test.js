import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Table } from '../components/ui/Table.js';
import { h } from '../utils/dom.js';

describe('Table', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('renders headers and delegates each data row', () => {
        const renderRow = vi.fn(({ name }) => h('tr', {}, [
            h('td', {}, name)
        ]));

        const table = Table({
            headers: ['Nombre'],
            data: [{ name: 'Ana' }, { name: 'Luis' }],
            renderRow
        });

        expect(table.className).toBe('table-container');
        expect([...table.querySelectorAll('th')].map(cell => cell.textContent)).toEqual(['Nombre']);
        expect([...table.querySelectorAll('tbody td')].map(cell => cell.textContent)).toEqual(['Ana', 'Luis']);
        expect(renderRow).toHaveBeenCalledTimes(2);
    });

    it('renders an empty state spanning all columns', () => {
        const table = Table({
            headers: ['Nombre', 'Rol', 'Estado'],
            data: [],
            renderRow: vi.fn()
        });

        const emptyCell = table.querySelector('tbody td');
        expect(emptyCell.colSpan).toBe(3);
        expect(emptyCell.textContent).toBe('No hay datos disponibles');
    });
});
