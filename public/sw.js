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
  const destino = (evento.notification.data && evento.notification.data.url) || "/";
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      for (const cliente of lista) {
        if ("focus" in cliente) {
          cliente.navigate(destino);
          return cliente.focus();
        }
      }
      return self.clients.openWindow(destino);
    }),
  );
});
