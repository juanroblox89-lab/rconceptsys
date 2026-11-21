// Servidor de modelo aislado para QA: no llama a ningún proveedor real.
import { createServer } from 'node:http';
import { setTimeout } from 'node:timers/promises';
const partes = ['Para empezar, abre Tareas.', ' Allí puedes ver tus trabajos y su fecha de entrega.', ' Abre la carpeta asociada y usa Entregar para enviar el trabajo a revisión.'];
createServer(async (req, res) => {
  if (req.url !== '/v1/chat/completions' || req.method !== 'POST') { res.writeHead(404).end(); return; }
  req.resume();
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  res.flushHeaders();
  for (const content of partes) {
    await setTimeout(1150);
    if (res.destroyed) return;
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
  }
  await setTimeout(800);
  res.end('data: [DONE]\n\n');
}).listen(8313, '127.0.0.1');
