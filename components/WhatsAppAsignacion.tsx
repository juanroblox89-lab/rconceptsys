"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { EnlaceExterno } from "@/components/ui/EnlaceExterno";
import { IconoWhatsApp } from "@/components/ui/IconoWhatsApp";
import styles from "./FlujoTrabajo.module.css";

export function WhatsAppAsignacion({ id }: { id: number }) {
  const [estado, setEstado] = useState<{ url: string } | "sinNumero" | "error">();
  const consulta = useRef<ReturnType<typeof api.getTareaWhatsApp> | null>(null);
  useEffect(() => {
    let vigente = true;
    consulta.current ??= api.getTareaWhatsApp(id, "asignacion");
    consulta.current.then(({ disponible, url }) => {
      if (vigente) setEstado(disponible && /^https:\/\/wa\.me\/[1-9]\d{6,14}(?:\?[^#]*)?$/.test(url) ? { url } : "sinNumero");
    }).catch(() => { if (vigente) setEstado("error"); });
    return () => { vigente = false; };
  }, [id]);

  return <div className={styles.whatsappAsignacion} data-testid="whatsapp-asignacion">
    {estado && typeof estado === "object" ? (
      <EnlaceExterno href={estado.url} className={`rc-btn rc-btn--secundario rc-btn--sm ${styles.guionAccion}`}>
        <IconoWhatsApp size={15} /> Avisar por WhatsApp
      </EnlaceExterno>
    ) : <p role="status" className={styles.ayuda}>
      {estado === "error" ? "No pudimos consultar WhatsApp." : estado === "sinNumero" ? "WhatsApp no disponible: la persona asignada no tiene un número válido." : "Consultando WhatsApp…"}
    </p>}
  </div>;
}
