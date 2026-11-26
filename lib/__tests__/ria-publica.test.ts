import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  combinarMensajesChat,
  esComposicionIME,
  guardarSolicitudRIAPublica,
  leerComandoRIAPublico,
  recuperarSolicitudRIAPublica,
  transmitirRIAPublica,
} from '../ria';
import type { ChatMensaje, SolicitudRIAPublica } from '../types';

const usuario = 'persona-a';
const solicitud: SolicitudRIAPublica = {
  solicitud_id: '8f8f35cf-a41f-49a8-9b96-30992201d4d9',
  comando: '/ria ¿Cómo entrego un trabajo?',
};
const consulta: ChatMensaje = { id: 4, autor_id: usuario, cuerpo: solicitud.comando, creado_en: '2026-11-26T12:15:00Z' };
const fin: ChatMensaje = { id: 6, autor_id: 'ria', es_ria: true, cuerpo: 'Abre la tarea. 🗂️', creado_en: '2026-11-26T12:15:01Z' };
const signal = new AbortController().signal;
const trama = (evento: string, dato: unknown) => `event: ${evento}\r\ndata: ${JSON.stringify(dato)}\r\n\r\n`;

function sse(texto: string): Response {
  const bytes = new TextEncoder().encode(texto);
  return new Response(new ReadableStream<Uint8Array>({
    start(controlador) {
      for (const byte of bytes) controlador.enqueue(Uint8Array.of(byte));
      controlador.close();
    },
  }), { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
}

test('solo un /ria explícito es comando; @ria, URLs y otras rutas son texto', () => {
  assert.equal(leerComandoRIAPublico(' /RIA   ¿Qué hago?\nOtra línea  '), '/ria ¿Qué hago?\nOtra línea');
  assert.equal(leerComandoRIAPublico(' /ria \n  '), '');
  for (const texto of ['Hola @RIA', '/ria123', '/ria/demo', 'di /ria hola', 'https://example.com/ria']) {
    assert.equal(leerComandoRIAPublico(texto), null, texto);
  }
});

test('no envía Enter para las dos señales de composición IME', () => {
  assert.equal(esComposicionIME({ isComposing: true, keyCode: 13 }), true);
  assert.equal(esComposicionIME({ isComposing: false, keyCode: 229 }), true);
  assert.equal(esComposicionIME({ isComposing: false, keyCode: 13 }), false);
});

test('sessionStorage conserva el POST exacto tras reload y descarta datos de otra cuenta', () => {
  const datos = new Map<string, string>();
  const storage: Storage = {
    get length() { return datos.size; },
    key: (i) => [...datos.keys()][i] ?? null,
    clear: () => datos.clear(),
    setItem: (k, v) => { datos.set(k, v); },
    getItem: (k) => datos.get(k) ?? null,
    removeItem: (k) => { datos.delete(k); },
  };
  guardarSolicitudRIAPublica(storage, usuario, solicitud);
  assert.deepEqual(recuperarSolicitudRIAPublica(storage, usuario), solicitud);
  assert.equal(recuperarSolicitudRIAPublica(storage, 'persona-b'), null);
  assert.equal(storage.length, 0);
  assert.equal(recuperarSolicitudRIAPublica(storage, usuario), null);
  guardarSolicitudRIAPublica(storage, usuario, solicitud);
  guardarSolicitudRIAPublica(storage, usuario, null);
  assert.equal(storage.length, 0);
});

test('polling y SSE comparten IDs y conservan la versión prioritaria', () => {
  const editada = { ...consulta, cuerpo: 'Actualizada en el servidor' };
  assert.deepEqual(combinarMensajesChat([editada], [fin, consulta, fin]), [editada, fin]);
  assert.deepEqual(combinarMensajesChat([fin, editada], [consulta, fin]), [editada, fin]);
});

test('consulta y fin autorizados; SSE fragmentado, UTF-8 y sin delta público; reintento exacto', async (t) => {
  const mensajes: ChatMensaje[] = [];
  const cuerpos: (BodyInit | null | undefined)[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    assert.equal(url, '/api/chat/ria');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.signal, signal);
    cuerpos.push(init?.body);
    if (cuerpos.length === 1) return sse(trama('consulta', consulta));
    return sse(': saludo\r\n\r\nevent: inicio\r\n\r\nevent: delta\r\ndata: no se muestra\r\n\r\n' +
      trama('consulta', consulta) + trama('consulta', consulta) + trama('fin', fin));
  });
  await assert.rejects(transmitirRIAPublica(solicitud, usuario, (m) => mensajes.push(m), signal), /interrumpió/);
  assert.deepEqual(mensajes, [consulta]);
  const respuesta = await transmitirRIAPublica(solicitud, usuario, (m) => mensajes.push(m), signal);
  assert.deepEqual(mensajes, [consulta, consulta]);
  assert.deepEqual(respuesta, { ...fin, autor: null });
  assert.deepEqual(cuerpos, [JSON.stringify(solicitud), JSON.stringify(solicitud)]);
});

test('ningún HTTP 400, 403, 409, 429 o 503 publica una consulta', async (t) => {
  let estado = 400;
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: estado }));
  for (const [codigo, esperado] of [[400, /Revisa/], [403, /permiso/], [409, /curso/], [429, /límite/], [503, /disponible/]] as const) {
    estado = codigo;
    await assert.rejects(transmitirRIAPublica(solicitud, usuario, () => assert.fail('Publicó un error HTTP'), signal), esperado);
  }
});

test('propaga el error SSE después de la consulta y rechaza autores no autorizados', async (t) => {
  let texto = trama('consulta', consulta) + trama('error', { mensaje: 'RIA no pudo responder.' });
  const mensajes: ChatMensaje[] = [];
  t.mock.method(globalThis, 'fetch', async () => sse(texto));
  const enviar = () => transmitirRIAPublica(solicitud, usuario, (m) => mensajes.push(m), signal);
  await assert.rejects(enviar(), /no pudo responder/);
  assert.deepEqual(mensajes, [consulta]);
  texto = trama('consulta', { ...consulta, autor_id: 'persona-b' }) + trama('fin', fin);
  await assert.rejects(enviar(), /interrumpió/);
  assert.deepEqual(mensajes, [consulta]);
  texto = trama('consulta', consulta) + trama('fin', { ...fin, autor: { id: usuario } });
  await assert.rejects(enviar(), /interrumpió/);
});
