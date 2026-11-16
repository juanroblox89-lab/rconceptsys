const API = 'http://127.0.0.1:8311';
const A = { 'X-Demo-User': 'admin-1', 'Content-Type': 'application/json' };
const C = { 'X-Demo-User': 'cam-1', 'Content-Type': 'application/json' };
async function pedir(metodo, ruta, usuario, cuerpo) {
  const res = await fetch(API + ruta, { method: metodo, headers: usuario === 'cam' ? C : A, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const txt = await res.text();
  let breve = txt.replace(/\s+/g, ' ').slice(0, 90);
  return `${metodo} ${ruta} -> ${res.status} ${breve}`;
}
(async () => {
  const lineas = [];
  lineas.push(await pedir('GET', '/api/equipo/resumen', 'admin'));
  lineas.push(await pedir('GET', '/api/admin/asignaciones/recientes', 'admin'));
  lineas.push(await pedir('POST', '/api/admin/asignaciones/vistas', 'admin', {}));
  lineas.push(await pedir('GET', '/api/admin/asignaciones?estado=aceptada', 'admin'));
  lineas.push(await pedir('GET', '/api/admin/piezas', 'admin'));
  lineas.push(await pedir('GET', '/api/admin/cortes', 'admin'));
  lines = null;
  lineas.push(await pedir('POST', '/api/admin/cortes', 'admin', { periodo: 'quincena' }));
  lineas.push(await pedir('GET', '/api/admin/drive', 'admin'));
  lineas.push(await pedir('POST', '/api/admin/drive/conectar', 'admin', {}));
  lineas.push(await pedir('GET', '/api/push/clave', 'cam'));
  lineas.push(await pedir('GET', '/api/push/estado', 'cam'));
  lineas.push(await pedir('POST', '/api/push/suscribir', 'cam', { endpoint: 'https://fcm.googleapis.com/fcm/send/demo-abc', p256dh: 'BOrEU4mZ1nEjemploDeClaveLarga', auth: 'auth-de-ejemplo-1' }));
  lineas.push(await pedir('DELETE', '/api/push/suscribir', 'cam', { endpoint: 'https://fcm.googleapis.com/fcm/send/demo-abc' }));
  lineas.push(await pedir('GET', '/api/admin/cortes/1/csv', 'admin'));
  lineas.push(await pedir('POST', '/api/admin/tareas/2/drive-carpeta', 'admin', { carpeta_id: '1carpetaDemo', enlace: 'https://drive.google.com/drive/folders/1carpetaDemo' }));
  lineas.push(await pedir('GET', '/api/admin/tareas', 'cam'));
  console.log(lineas.join('\n'));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
