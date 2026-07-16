/**
 * Shared helpers for Assignments module
 */
import { h } from '../../utils/dom.js';

// Regex constants
export const RE_BRACKET_PREFIX = /\[.*?\]\s*/g;
export const RE_NON_NUMERIC = /[^0-9]/g;
export const RE_UNICODE_ACCENT = /[\u0300-\u036f]/g;
export const RE_WHITESPACE = /\s+/g;
export const RE_SAFE_FILENAME = /[^a-zA-Z0-9.\-_]/g;
export const RE_SAFE_ID = /[^a-z0-9-]/g;
export const RE_QUOTE = /"/g;

/**
 * Returns role-specific onboarding guide steps
 */
export function getRoleSpecificGuide(roleName) {
    const r = (roleName || '').toLowerCase();
    if (r.includes('marketing') || r.includes('venta')) {
        return [
            h('li', {}, [h('span', { className: 'font-bold' }, '1. Prospectar: '), 'Sal a buscar clientes. Por cada 10 prospectos visitados, recibes un bono.']),
            h('li', {}, [h('span', { className: 'font-bold' }, '2. Registrar Visitas: '), 'Entra a la pestaña "Ventas y Marketing" y registra cada visita para llevar la cuenta.']),
            h('li', {}, [h('span', { className: 'font-bold' }, '3. Cerrar Clientes: '), 'Cuando consigas un cliente, márcalo como "Cerrado" en la misma pestaña para cobrar tu gran comisión.']),
            h('li', {}, [h('span', { className: 'font-bold' }, '4. Cobrar: '), 'Ve a "Pagos Pendientes" para ver cómo se acumulan tus bonos y comisiones.'])
        ];
    } else if (r.includes('camarógrafo') || r.includes('grabador')) {
        return [
            h('li', {}, [h('span', { className: 'font-bold' }, '1. Preparación: '), 'Revisa tus tareas pendientes. Verifica el cliente, el día y lee el Guion asignado.']),
            h('li', {}, [h('span', { className: 'font-bold' }, '2. Confirmación: '), 'Recuerda confirmar la asistencia con el cliente el día antes por el grupo de WhatsApp.']),
            h('li', {}, [h('span', { className: 'font-bold' }, '3. Grabación y Subida: '), 'Ve al lugar, sácate el guion del cerebro y graba. Al terminar, sube los archivos crudos al Drive.']),
            h('li', {}, [h('span', { className: 'font-bold' }, '4. Completar y Cobrar: '), 'Dale a "Completar". El sistema te pedirá el monto a cobrar y cerrará la tarea.'])
        ];
    } else if (r.includes('editor')) {
        return [
            h('li', {}, [h('span', { className: 'font-bold' }, '1. Recepción: '), 'Revisa tu tarea. El líder te habrá notificado que los crudos están en Drive junto al Guion.']),
            h('li', {}, [h('span', { className: 'font-bold' }, '2. Edición: '), 'Descarga los crudos, edita el video aplicando formatos virales y exporta el archivo final.']),
            h('li', {}, [h('span', { className: 'font-bold' }, '3. Entrega: '), 'Sube el video final al Drive y manda el link por WhatsApp para revisión.']),
            h('li', {}, [h('span', { className: 'font-bold' }, '4. Completar y Cobrar: '), 'Dale a "Completar" para añadir tu pago a la factura automáticamente.'])
        ];
    } else if (r.includes('estratega') || r.includes('lider') || r.includes('admin')) {
        return [
            h('li', {}, [h('span', { className: 'font-bold' }, '1. Creación de Cliente: '), 'Anota el nuevo cliente en la pestaña "Clientes" y asígnale su paquete de videos (4, 6 u 8).']),
            h('li', {}, [h('span', { className: 'font-bold' }, '2. Estrategia: '), 'Redacta los guiones utilizando la pestaña de Formatos y Hooks.']),
            h('li', {}, [h('span', { className: 'font-bold' }, '3. Asignar Grabación: '), 'Crea una tarea para el Camarógrafo adjuntando el guion y el cliente.']),
            h('li', {}, [h('span', { className: 'font-bold' }, '4. Asignar Edición: '), 'Cuando los crudos estén en Drive, asígnale la tarea de edición al Editor, y revisa el progreso del paquete.'])
        ];
    } else {
        return [
            h('li', {}, [h('span', { className: 'font-bold' }, '1. Revisa tu Tarea: '), 'Abre tu tarea pendiente y revisa las instrucciones, el Guion y el Asset de muestra.']),
            h('li', {}, [h('span', { className: 'font-bold' }, '2. Ejecuta: '), 'Ejecuta la tarea asignada.']),
            h('li', {}, [h('span', { className: 'font-bold' }, '3. Completar: '), 'Al terminar, la tarea se marcará como Completada automáticamente.']),
            h('li', {}, [h('span', { className: 'font-bold' }, '4. Auto-Cobro: '), 'Al hacer clic en "Completar", el sistema lanzará tu factura para asegurar tu pago.'])
        ];
    }
}
