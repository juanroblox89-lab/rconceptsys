"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { api } from "@/lib/api";
import { Boton } from "@/components/ui/Boton";
import styles from "./AvisosPush.module.css";

// Clave pública VAPID (base64url) → ArrayBuffer para pushManager.subscribe.
function claveAArray(base64: string): ArrayBuffer {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const normal = (base64 + relleno).replace(/-/g, "+").replace(/_/g, "/");
  const crudo = atob(normal);
  const salida = new Uint8Array(new ArrayBuffer(crudo.length));
  for (let i = 0; i < crudo.length; i += 1) salida[i] = crudo.charCodeAt(i);
  return salida.buffer;
}

type Estado = "cargando" | "soportado" | "sin_soporte" | "sin_claves" | "activo";

// Avisos push: tarea nueva, vence mañana y entrega aprobada (F5).
export function AvisosPush() {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [suscrito, setSuscrito] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const revisar = useCallback(async () => {
    if (typeof window === "undefined") return;
    const soportado = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!soportado) {
      setEstado("sin_soporte");
      return;
    }
    try {
      const clave = await api.getPushClave();
      if (!clave.configurado) {
        setEstado("sin_claves");
        return;
      }
      const registro = await navigator.serviceWorker.getRegistration("/sw.js");
      const suscripcion = registro ? await registro.pushManager.getSubscription() : null;
      setSuscrito(Boolean(suscripcion));
      setEstado(suscripcion ? "activo" : "soportado");
    } catch {
      setEstado("soportado");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void revisar();
  }, [revisar]);

  const activar = async () => {
    setTrabajando(true);
    setError(null);
    setMensaje(null);
    try {
      const clave = await api.getPushClave();
      if (!clave.configurado || !clave.clave) {
        setError("El servidor no tiene las claves VAPID. Pídele a Juan que las configure.");
        return;
      }
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setError("El navegador no dio permiso para mostrar avisos.");
        return;
      }
      const registro = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const suscripcion = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: claveAArray(clave.clave),
      });
      const json = suscripcion.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setError("El navegador no entregó una suscripción válida.");
        return;
      }
      await api.postPushSuscribir({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      });
      setSuscrito(true);
      setEstado("activo");
      setMensaje("Avisos activados en este dispositivo.");
    } catch {
      setError("No se pudieron activar los avisos en este dispositivo.");
    } finally {
      setTrabajando(false);
    }
  };

  const desactivar = async () => {
    setTrabajando(true);
    setError(null);
    setMensaje(null);
    try {
      const registro = await navigator.serviceWorker.getRegistration("/sw.js");
      const suscripcion = registro ? await registro.pushManager.getSubscription() : null;
      if (suscripcion) {
        const endpoint = suscripcion.endpoint;
        await suscripcion.unsubscribe();
        await api.deletePushSuscribir(endpoint);
      }
      setSuscrito(false);
      setEstado("soportado");
      setMensaje("Avisos desactivados en este dispositivo.");
    } catch {
      setError("No se pudieron desactivar los avisos.");
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <section className={styles.caja} aria-label="Avisos push">
      <div className={styles.cabecera}>
        <span className={styles.icono} aria-hidden="true">
          {suscrito ? <BellRing size={16} strokeWidth={1.85} /> : <Bell size={16} strokeWidth={1.85} />}
        </span>
        <div className={styles.textos}>
          <h2 className={styles.titulo}>Avisos en este dispositivo</h2>
          <p className={styles.descripcion}>
            Tarea nueva, tarea que vence mañana y entrega aprobada. En la APK se conecta igual.
          </p>
        </div>
      </div>

      {estado === "cargando" ? (
        <p className={styles.nota}>Revisando el estado de los avisos…</p>
      ) : estado === "sin_soporte" ? (
        <p className={styles.nota}>Este navegador no permite avisos push.</p>
      ) : estado === "sin_claves" ? (
        <p className={styles.nota}>
          Faltan las claves VAPID en el servidor (<code>VAPID_CLAVE_PUBLICA</code> y <code>VAPID_CLAVE_PRIVADA</code>).
        </p>
      ) : (
        <div className={styles.acciones}>
          {suscrito ? (
            <>
              <span className={styles.estadoActivo}>
                <BellRing size={12} strokeWidth={2} aria-hidden="true" />
                Activados
              </span>
              <Boton variante="secundario" tamano="sm" onClick={desactivar} cargando={trabajando} disabled={trabajando}>
                <BellOff size={13} style={{ marginRight: 4 }} />
                Desactivar
              </Boton>
            </>
          ) : (
            <Boton variante="primario" tamano="sm" onClick={activar} cargando={trabajando} disabled={trabajando}>
              <Bell size={13} style={{ marginRight: 4 }} />
              Activar avisos
            </Boton>
          )}
        </div>
      )}

      {mensaje && <p className={styles.exito}>{mensaje}</p>}
      {error && <p className={styles.error}>{error}</p>}
    </section>
  );
}
