"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Tarea } from "@/lib/types";
import { Boton } from "@/components/ui/Boton";
import { Campo } from "@/components/ui/Campo";
import { Modal } from "@/components/ui/Modal";
import styles from "./FlujoTrabajo.module.css";

export function BotonPedirDeNuevo({ id, origen, persona, onClick }: {
  id: number; origen?: string; persona?: string; onClick?: () => void;
}) {
  const router = useRouter();
  return <Boton tamano="sm" variante="secundario" className={styles.botonPedirDeNuevo} onClick={onClick ?? (() => {
    const params = new URLSearchParams({ desde: origen ?? "tareas", pedir: "1" });
    if (persona) params.set("persona", persona);
    router.push(`/trabajos/${id}?${params}`);
  })}>Pedir de nuevo</Boton>;
}

export function ModalPedirDeNuevo({ tarea, onCerrar, onGuardado }: {
  tarea: Tarea; onCerrar(): void; onGuardado(actual: Tarea): void;
}) {
  const formId = useId();
  const ayudaId = useId();
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const pendiente = useRef(false);
  const longitud = Array.from(motivo).length;
  const excedido = longitud > 500;
  const cerrar = () => { if (!pendiente.current) onCerrar(); };

  return <Modal className={styles.dialogo} titulo="¿Pedir de nuevo este trabajo?"
    descripcion="El trabajo vuelve a pendiente y sale del corte si aún no se pagó."
    onCerrar={cerrar}
    accionSecundaria={<Boton variante="secundario" disabled={guardando} onClick={cerrar}>Volver</Boton>}
    accionPrimaria={<Boton variante="primario" type="submit" form={formId} cargando={guardando} disabled={excedido} aria-label="Confirmar pedido">Pedir de nuevo</Boton>}>
    <form id={formId} className={styles.formPedirDeNuevo} aria-busy={guardando} onSubmit={async (e) => {
      e.preventDefault();
      if (pendiente.current || excedido) return;
      pendiente.current = true;
      setGuardando(true);
      setError("");
      let actual: Tarea;
      try {
        actual = await api.adminPedirDeNuevoTarea(tarea.id, motivo.trim());
      } catch (e) {
        setError(e instanceof Error ? e.message : "No pudimos volver a pedir el trabajo.");
        return;
      } finally {
        pendiente.current = false;
        setGuardando(false);
      }
      onGuardado(actual);
    }}>
      <Campo etiqueta="Motivo (opcional)" como="textarea" filas={4} value={motivo} disabled={guardando}
        aria-invalid={excedido || undefined} aria-describedby={ayudaId}
        onChange={e => { setMotivo(e.target.value); setError(""); }} />
      <span id={ayudaId} className={excedido ? styles.error : styles.ayuda}>
        {excedido ? "Escribe un motivo de hasta 500 caracteres." : `${longitud}/500 caracteres`}
      </span>
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </form>
  </Modal>;
}
