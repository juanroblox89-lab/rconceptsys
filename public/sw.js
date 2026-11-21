/* Service worker de rconceptsys: avisos push (F5).
   La web y la APK usan el mismo endpoint: solo cambia quién registra el token. */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(self.clients.claim());
});

self.addEventListener("push", (evento) => {
  let datos = { titulo: "rconceptsys", cuerpo: "", url: "/", etiqueta: "aviso" };
  try {
    if (evento.data) datos = Object.assign(datos, evento.data.json());
  } catch {
    if (evento.data) datos.cuerpo = evento.data.text();
  }

  evento.waitUntil(
    self.registration.showNotification(datos.titulo, {
      body: datos.cuerpo,
      tag: datos.etiqueta,
      badge: "/favicon.ico",
      icon: "/favicon.ico",
      data: { url: datos.url || "/" },
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  let destino = new URL("/", self.location.origin);
  try {
    const url = new URL(evento.notification.data?.url || "/", self.location.origin);
    if (url.origin === self.location.origin) destino = url;
  } catch { /* Un aviso inválido abre el inicio. */ }
  const id = /^aviso-(\d+)$/.exec(evento.notification.tag)?.[1];
  evento.waitUntil((async () => {
    if (id) await fetch(`/api/notificaciones/${id}/leida`, { method: "POST", credentials: "same-origin" }).catch(() => {});
    const lista = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const actual = lista.find((c) => new URL(c.url).origin === self.location.origin);
    if (actual) {
      const ventana = await actual.navigate(destino.href).catch(() => null);
      if (ventana) return ventana.focus();
    }
    return self.clients.openWindow(destino.href);
  })());
});
