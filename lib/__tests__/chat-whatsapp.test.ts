import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accionesConservacion, agruparMensajes, citaVisible, escalaOnda, formatoTiempoAudio } from '../chat-utils';
import type { ChatAdjunto } from '../types';

const fecha = '2026-11-26T15:00:00Z';
const audio: ChatAdjunto = { id: 1, autor_id: 'eva', tipo: 'audio', nombre: 'voz.webm', mime: 'audio/webm', tamano: 10, creado_en: fecha, storage_path: 'eva/1-voz.webm' };

test('conservación solo ofrece medios vivos y nunca enlaces de Drive', () => {
  const esperado = accionesConservacion([
    audio,
    { ...audio, id: 2, tipo: 'drive', url_externa: 'https://drive.google.com/drive/folders/demo' },
    { ...audio, id: 3, purgado_en: fecha },
    { ...audio, id: 4, tipo: 'archivo' },
    { ...audio, id: 5, url_externa: 'https://drive.google.com/drive/folders/otro' },
    { ...audio, id: 6, storage_path: undefined },
  ], { id: 'lina', es_admin: false });
  assert.deepEqual(esperado, [{ id: 1, nombre: 'voz.webm', conservar: true, etiqueta: 'Conservar / No purgar' }]);
});

test('solo autor o admin quita protección del chat', () => {
  const protegido = [{ ...audio, conservar: true }];
  assert.deepEqual(accionesConservacion(protegido, { id: 'lina', es_admin: false }), []);
  assert.equal(accionesConservacion(protegido, { id: 'eva', es_admin: false })[0]?.conservar, false);
  assert.equal(accionesConservacion(protegido, { id: 'admin', es_admin: true })[0]?.conservar, false);
});

test('citas y hora perviven en agrupación sucesiva sin revelar originales no disponibles', () => {
  const grupos = agruparMensajes(['00', '04', '08'].map((min, i) => ({
    id: i + 10, autor_id: 'eva', cuerpo: 'Respuesta', creado_en: `2026-11-26T15:${min}:00Z`,
    respuesta_a_id: 2, cita: i ? undefined : { autor: 'Lina', extracto: 'Hagamos el corte' },
  })), 'eva');
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].lineas.length, 3);
  assert.equal(grupos[0].lineas[0].creado_en, fecha);
  assert.equal(grupos[0].lineas[0].respuesta_a_id, 2);
  assert.equal(citaVisible(grupos[0].lineas[0])?.extracto, 'Hagamos el corte');
  assert.equal(citaVisible(grupos[0].lineas[1])?.autor, 'Mensaje citado');
  assert.equal(citaVisible({}), null);
});

test('la onda normaliza picos e incluye la última muestra y el tiempo no redondea hacia adelante', () => {
  assert.deepEqual(escalaOnda(new Float32Array([0.12, 0.5, 0.2, 0.3, -1]), 2), [0.5, 1]);
  assert.deepEqual(escalaOnda(new Float32Array(3), 2), [0.13, 0.13]);
  assert.equal(formatoTiempoAudio(67.9), '1:07');
  assert.equal(formatoTiempoAudio(Infinity), '0:00');
});
