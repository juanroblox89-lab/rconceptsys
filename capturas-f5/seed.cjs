/* eslint-disable */
// Semilla para las capturas de F5 (no es código de la app).
const zlib = require('zlib');

const API = 'http://127.0.0.1:8311';

// PNG válido y pequeño (cuadrado de dos colores) para la miniatura del chat.
function png(ancho = 96, alto = 96) {
  const tabla = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  const crc = (buf) => {
    let c = -1;
    for (let i = 0; i < buf.length; i += 1) c = tabla[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const bloque = (tipo, datos) => {
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(datos.length);
    const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
    const suma = Buffer.alloc(4);
    suma.writeUInt32BE(crc(cuerpo));
    return Buffer.concat([largo, cuerpo, suma]);
  };
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(ancho, 0);
  cabecera.writeUInt32BE(alto, 4);
  cabecera[8] = 8;
  cabecera[9] = 2;
  const filas = [];
  for (let y = 0; y < alto; y += 1) {
    const fila = Buffer.alloc(1 + ancho * 3);
    for (let x = 0; x < ancho; x += 1) {
      const dentro = x > ancho * 0.25 && x < ancho * 0.75 && y > alto * 0.25 && y < alto * 0.75;
      const base = 1 + x * 3;
      fila[base] = dentro ? 255 : 32;
      fila[base + 1] = dentro ? 138 : 36;
      fila[base + 2] = dentro ? 76 : 48;
    }
    filas.push(fila);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque('IHDR', cabecera),
    bloque('IDAT', zlib.deflateSync(Buffer.concat(filas))),
    bloque('IEND', Buffer.alloc(0)),
  ]);
}

const PNG = png();

// WAV de 2 s en silencio (8 kHz, 8 bits, mono).
function wav(segundos = 2) {
  const frecuencia = 8000;
  const muestras = frecuencia * segundos;
  const buffer = Buffer.alloc(44 + muestras);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + muestras, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(frecuencia, 24);
  buffer.writeUInt32LE(frecuencia, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(muestras, 40);
  for (let i = 0; i < muestras; i += 1) {
    buffer[44 + i] = 128 + Math.round(30 * Math.sin((i / frecuencia) * 2 * Math.PI * 220));
  }
  return buffer;
}

async function api(ruta, { metodo = 'GET', usuario, cuerpo, formulario } = {}) {
  const headers = {};
  if (usuario) headers['X-Demo-User'] = usuario;
  if (cuerpo) headers['Content-Type'] = 'application/json';
  const res = await fetch(API + ruta, {
    method: metodo,
    headers,
    body: formulario ?? (cuerpo ? JSON.stringify(cuerpo) : undefined),
  });
  const texto = await res.text();
  let datos = null;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    datos = texto;
  }
  if (!res.ok) console.error(`  ! ${metodo} ${ruta} → ${res.status}`, texto.slice(0, 200));
  return datos;
}

function manana() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

(async () => {
  const admin = 'admin-1';
  const cam = 'cam-1';

  await api('/api/admin/equipo', {
    metodo: 'PATCH',
    usuario: admin,
    cuerpo: {
      nombre: 'Rohlfing Concept',
      descripcion: 'Grabación, edición y publicación para clientes. Un solo Drive para todo el equipo.',
    },
  });
  for (const [nombre, url] of [
    ['Drive del equipo', 'https://drive.google.com/drive/folders/1equipoDemo'],
    ['Materiales', 'https://drive.google.com/drive/folders/1materialesDemo'],
    ['Entregas', 'https://drive.google.com/drive/folders/1entregasDemo'],
  ]) {
    await api('/api/admin/equipo/enlaces', { metodo: 'POST', usuario: admin, cuerpo: { nombre, url } });
  }

  const cliente = await api('/api/admin/clientes', {
    metodo: 'POST',
    usuario: admin,
    cuerpo: { nombre: 'El Tizón Dorado' },
  });
  if (cliente?.id) {
    await api(`/api/admin/clientes/${cliente.id}`, {
      metodo: 'PATCH',
      usuario: admin,
      cuerpo: {
        paquete: 'Mixtos',
        drive_url: 'https://drive.google.com/drive/folders/1tizonDemo',
        notas: 'Trato de tú. Colores del logo: negro y naranja. Falta teléfono.',
      },
    });
  }

  const pieza = await api('/api/admin/piezas', {
    metodo: 'POST',
    usuario: admin,
    cuerpo: { cliente_id: cliente?.id ?? null, nombre: 'Reel Día del Padre', formato: 'Reel' },
  });

  const tarea1 = await api('/api/admin/tareas', {
    metodo: 'POST',
    usuario: admin,
    cuerpo: {
      tipo_id: 2,
      cliente_id: cliente?.id ?? null,
      pieza_id: pieza?.id ?? null,
      asignado_a: cam,
      titulo: 'Editar reel del Día del Padre',
      fecha_limite: manana(),
      forzar: true,
    },
  });
  const tarea2 = await api('/api/admin/tareas', {
    metodo: 'POST',
    usuario: admin,
    cuerpo: {
      tipo_id: 1,
      cliente_id: cliente?.id ?? null,
      pieza_id: pieza?.id ?? null,
      asignado_a: cam,
      titulo: 'Grabar tomas del local',
    },
  });

  // Ciclo completo de una tarea hasta aprobada (para el corte)
  if (tarea1?.id) {
    await api(`/api/tareas/${tarea1.id}/hecha`, {
      metodo: 'POST',
      usuario: cam,
      cuerpo: { nota: 'Versión 2 lista', enlace_medios: 'https://drive.google.com/file/d/1videoDemo/view' },
    });
    await api(`/api/admin/tareas/${tarea1.id}/aceptar`, { metodo: 'POST', usuario: admin });
  }

  await api('/api/admin/cortes', { metodo: 'POST', usuario: admin, cuerpo: { periodo: 'mes' } });

  if (pieza?.id) {
    await api(`/api/admin/piezas/${pieza.id}`, { metodo: 'PATCH', usuario: admin, cuerpo: { etapa: 'edicion' } });
  }

  // Chat: mensajes con imagen, audio y carpeta de Drive
  await api('/api/chat', {
    metodo: 'POST',
    usuario: admin,
    cuerpo: { cuerpo: 'Buen día. El reel del Tizón va en edición; dejo la carpeta con el material.' },
  });

  const carpeta = await api('/api/chat/adjuntos', {
    metodo: 'POST',
    usuario: admin,
    cuerpo: { nombre: 'Material Tizón', url: 'https://drive.google.com/drive/folders/1materialTizon' },
  });

  const formImagen = new FormData();
  formImagen.append('archivo', new Blob([PNG], { type: 'image/png' }), 'logo-tizon.png');
  const imagen = await api('/api/chat/adjuntos', { metodo: 'POST', usuario: admin, formulario: formImagen });

  const formAudio = new FormData();
  formAudio.append('archivo', new Blob([wav(2)], { type: 'audio/wav' }), 'nota-voz.wav');
  formAudio.append('duracion_seg', '2');
  const audio = await api('/api/chat/adjuntos', { metodo: 'POST', usuario: cam, formulario: formAudio });

  const ids = [imagen?.id, carpeta?.id].filter(Boolean);
  if (ids.length > 0) {
    await api('/api/chat', { metodo: 'POST', usuario: admin, cuerpo: { cuerpo: 'Así va la pieza:', adjuntos: ids } });
  }
  if (audio?.id) {
    await api('/api/chat', { metodo: 'POST', usuario: cam, cuerpo: { cuerpo: 'Te dejo la nota de voz.', adjuntos: [audio.id] } });
  }

  console.log('Semilla F5 lista:', {
    cliente: cliente?.id,
    pieza: pieza?.id,
    tarea1: tarea1?.id,
    tarea2: tarea2?.id,
    imagen: imagen?.id,
    audio: audio?.id,
    carpeta: carpeta?.id,
  });
})().catch((e) => {
  console.error('ERROR', e);
  process.exit(1);
});
