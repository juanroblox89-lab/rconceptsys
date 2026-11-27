"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FileText, FolderOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { type ApiError } from "@/lib/api";
import { type DialogoPicker, traducirErrorGooglePicker } from "@/lib/google-picker";
import { MAX_REFERENCIAS_TRABAJO, nombreReferenciaVisible } from "@/lib/referencias-trabajo";
import type { ReferenciaDriveTrabajo } from "@/lib/types";
import { AvisoCuentaDrive } from "@/components/ui/AvisoCuentaDrive";
import { Boton } from "@/components/ui/Boton";
import { abrirSelectorGoogleDrive, resolverReferenciaDriveSeleccionada } from "@/components/PickerDriveCliente";
import { AbrirReferenciaTrabajo } from "@/components/ui/ReferenciasDriveTrabajo";
import styles from "./FlujoTrabajo.module.css";

export function SelectorCarpetaTrabajo({ clienteId, valor, onChange, deshabilitado }: {
  clienteId?: number;
  valor: ReferenciaDriveTrabajo[];
  onChange: (valor: ReferenciaDriveTrabajo[], indice?: number) => void;
  deshabilitado: boolean;
}) {
  const titulo = useId();
  const [confirmar, setConfirmar] = useState<number | null>(null);
  const [avisoPara, setAvisoPara] = useState<number | "nueva" | null>(null);
  const [abriendo, setAbriendo] = useState<number | "nueva" | null>(null);
  const [error, setError] = useState("");
  const dialogo = useRef<DialogoPicker | null>(null);
  const vigente = useRef(false);
  const valorRef = useRef(valor);
  useEffect(() => {
    valorRef.current = valor;
  }, [valor]);

  useEffect(() => {
    vigente.current = true;
    return () => {
      vigente.current = false;
      try {
        dialogo.current?.setVisible(false);
        dialogo.current?.dispose?.();
      } catch {
        // Ignorar limpieza
      }
      dialogo.current = null;
    };
  }, []);

  async function abrir(indice?: number) {
    if (deshabilitado || abriendo !== null || (indice === undefined && valor.length >= MAX_REFERENCIAS_TRABAJO)) return;
    const boton = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setError("");
    setConfirmar(null);
    setAbriendo(indice ?? "nueva");
    const restaurar = () => {
      if (!vigente.current) return;
      setAbriendo(null);
      requestAnimationFrame(() => boton?.focus());
    };
    try {
      await abrirSelectorGoogleDrive({
        clienteId,
        multiselect: false,
        maxItems: 1,
        dialogoRef: dialogo,
        vigenteRef: vigente,
        onCancelar: restaurar,
        onError: (msg) => {
          if (!vigente.current) return;
          setError(msg);
          restaurar();
        },
        onSeleccion: async (elementos) => {
          if (!vigente.current) return;
          const doc = elementos[0];
          const listaActual = valorRef.current;
          if (!doc) {
            setError("No pudimos leer ese archivo o carpeta. Elige otra referencia.");
            restaurar();
            return;
          }
          if (listaActual.some((ref, i) => ref.id === doc.id && i !== indice)) {
            setError("Esa referencia ya está en la lista.");
            restaurar();
            return;
          }
          const resuelto = await resolverReferenciaDriveSeleccionada(doc);
          if (!vigente.current) return;
          const refFinal: ReferenciaDriveTrabajo = {
            id: resuelto.id,
            nombre: resuelto.nombre,
            tipo: resuelto.tipo,
            url: resuelto.url,
            ...(resuelto.ruta ? { ruta: resuelto.ruta } : {}),
          };
          const actual = valorRef.current;
          onChange(
            indice === undefined
              ? [...actual, refFinal]
              : actual.map((anterior, i) => (i === indice ? refFinal : anterior)),
            indice,
          );
          restaurar();
        },
      });
    } catch (e) {
      if (!vigente.current) return;
      const apiErr = e as ApiError;
      if (apiErr.codigo === "drive_no_conectado") {
        setError("Conecta el Drive del equipo en Gestión → Equipo.");
      } else if (apiErr.codigo === "drive_sin_organizar") {
        setError("Organiza el Drive del equipo en Gestión → Equipo.");
      } else {
        setError(traducirErrorGooglePicker(e));
      }
      restaurar();
    }
  }

  const bloqueado = deshabilitado || abriendo !== null;
  return <section className={styles.referenciasTrabajo} aria-labelledby={titulo}>
    <div className={styles.referenciasCabecera}>
      <strong id={titulo}>Referencias de Drive</strong>
      <span className={styles.ayuda} aria-live="polite">{valor.length} de {MAX_REFERENCIAS_TRABAJO}</span>
    </div>
    {valor.length ? <ul className={styles.referencias}>
      {valor.map((ref, i) => {
        const Icono = ref.tipo === "carpeta" ? FolderOpen : FileText;
        const nombre = nombreReferenciaVisible(ref);
        return <li className={styles.referenciaTrabajo} key={`${ref.id}-${i}`}>
          {confirmar === i ? <div className={styles.confirmarQuitar} role="group" aria-label={`Quitar ${nombre}`}>
            <span>¿Quitar «{nombre}»?</span>
            <Boton variante="peligro" tamano="sm" disabled={bloqueado} onClick={() => { onChange(valor.filter((_, j) => i !== j), i); setConfirmar(null); }}>Sí</Boton>
            <Boton variante="secundario" tamano="sm" disabled={bloqueado} onClick={() => setConfirmar(null)}>No</Boton>
          </div> : <>
            <Icono size={17} strokeWidth={1.75} aria-hidden="true" />
            <div className={styles.referenciaTexto}>
              {ref.ruta && <span className={styles.rutaReferenciaTrabajo} title={ref.ruta}>{ref.ruta}</span>}
              <span className={styles.nombreReferenciaTrabajo} title={nombre}>{nombre}</span>
            </div>
            <div className={styles.accionesReferenciaTrabajo}>
              <AbrirReferenciaTrabajo referencia={{ ...ref, nombre }} />
              <Boton variante="secundario" tamano="sm" className={styles.botonReferenciaTrabajo} disabled={bloqueado} cargando={abriendo === i} onClick={() => { setError(""); setConfirmar(null); setAvisoPara(i); }} aria-label={`Cambiar ${nombre}`}>
                <Pencil size={14} strokeWidth={1.75} aria-hidden="true" /><span>Cambiar</span>
              </Boton>
              <Boton variante="peligro" tamano="sm" className={styles.botonReferenciaTrabajo} disabled={bloqueado} onClick={() => setConfirmar(i)} aria-label={`Quitar ${nombre}`}>
                <Trash2 size={15} strokeWidth={1.75} aria-hidden="true" /><span>Quitar</span>
              </Boton>
            </div>
          </>}
        </li>;
      })}
    </ul> : <p className={styles.ayuda}>Sin referencias.</p>}
    {avisoPara !== null ? (
      <AvisoCuentaDrive
        abriendo={abriendo !== null}
        onCancelar={() => setAvisoPara(null)}
        onContinuar={() => {
          const destino = avisoPara === "nueva" ? undefined : avisoPara;
          setAvisoPara(null);
          void abrir(destino);
        }}
      />
    ) : (
      <div><Boton variante="secundario" tamano="sm" className={styles.botonReferenciaTrabajo}
        disabled={bloqueado || valor.length >= MAX_REFERENCIAS_TRABAJO} cargando={abriendo === "nueva"} onClick={() => { setError(""); setConfirmar(null); setAvisoPara("nueva"); }}>
        <Plus size={16} strokeWidth={1.75} aria-hidden="true" /> Añadir carpeta
      </Boton></div>
    )}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </section>;
}
