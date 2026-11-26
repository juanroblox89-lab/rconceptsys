// lib/__tests__/chat-utils.test.ts
import { test } from 'node:test';
import assert from 'node:assert';
import { agruparMensajes, obtenerSeparadorDia } from '../chat-utils';
import type { ChatMensaje } from '../types';

test('obtenerSeparadorDia devuelve Hoy para la fecha actual', () => {
  const hoy = new Date().toISOString();
  assert.strictEqual(obtenerSeparadorDia(hoy), 'Hoy');
});

test('agruparMensajes agrupa mensajes consecutivos del mismo autor', () => {
  const ahora = new Date();
  const t1 = new Date(ahora.getTime() - 10000).toISOString();
  const t2 = new Date(ahora.getTime() - 5000).toISOString();
  const t3 = new Date(ahora.getTime()).toISOString();

  const mensajes: ChatMensaje[] = [
    {
      id: 1,
      autor_id: 'user-1',
      cuerpo: 'Primer mensaje',
      creado_en: t1,
      autor: {
        id: 'user-1',
        correo: 'u1@test.com',
        nombre: 'Usuario Uno',
        foto_path: null,
        estado: 'aprobado',
        es_admin: false,
        creado_en: t1,
      },
    },
    {
      id: 2,
      autor_id: 'user-1',
      cuerpo: 'Segundo mensaje',
      creado_en: t2,
      autor: {
        id: 'user-1',
        correo: 'u1@test.com',
        nombre: 'Usuario Uno',
        foto_path: null,
        estado: 'aprobado',
        es_admin: false,
        creado_en: t1,
      },
    },
    {
      id: 3,
      autor_id: 'user-2',
      cuerpo: 'Respuesta de otro usuario',
      creado_en: t3,
      autor: {
        id: 'user-2',
        correo: 'u2@test.com',
        nombre: 'Usuario Dos',
        foto_path: null,
        estado: 'aprobado',
        es_admin: false,
        creado_en: t3,
      },
    },
  ];

  const grupos = agruparMensajes(mensajes, 'user-1');

  assert.strictEqual(grupos.length, 2);
  assert.strictEqual(grupos[0].autor_id, 'user-1');
  assert.strictEqual(grupos[0].lineas.length, 2);
  assert.strictEqual(grupos[0].es_mio, true);

  assert.strictEqual(grupos[1].autor_id, 'user-2');
  assert.strictEqual(grupos[1].lineas.length, 1);
  assert.strictEqual(grupos[1].es_mio, false);
});

test('agruparMensajes conserva editado_en y es_ria', () => {
  const ahora = new Date().toISOString();
  const grupos = agruparMensajes([
    {
      id: 10,
      autor_id: 'user-1',
      cuerpo: 'Editado',
      creado_en: ahora,
      editado_en: ahora,
    },
    {
      id: 11,
      autor_id: 'ria',
      es_ria: true,
      cuerpo: 'Hola desde RIA',
      creado_en: ahora,
    },
  ], 'user-1');

  assert.strictEqual(grupos.length, 2);
  assert.strictEqual(grupos[0].lineas[0].editado_en, ahora);
  assert.strictEqual(grupos[1].lineas[0].es_ria, true);
  assert.strictEqual(grupos[1].es_mio, false);
});
