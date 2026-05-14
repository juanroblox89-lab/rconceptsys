/**
 * UI Table Component - Creative Production OS
 */
import { h } from '../../utils/dom.js';

export const Table = ({ headers, data, renderRow }) => {
    return h('div', { className: 'table-container' }, [
        h('table', {}, [
            h('thead', {}, [
                h('tr', {}, headers.map(header => h('th', {}, header)))
            ]),
            h('tbody', {}, data.length > 0 ? data.map(renderRow) : [
                h('tr', {}, [
                    h('td', { colSpan: headers.length, className: 'text-center p-8 text-muted' }, 'No hay datos disponibles')
                ])
            ])
        ])
    ]);
};
