"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FileText, FolderOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { cargarGooglePicker, type DialogoPicker } from "@/lib/google-picker";
import { enlaceReferenciaDrive, MAX_REFERENCIAS_TRABAJO, nombreReferenciaVisible } from "@/lib/referencias-trabajo";
import type { ReferenciaDriveTrabajo } from "@/lib/types";
import { Boton } from "@/components/ui/Boton";
import { resolverReferenciaDriveSeleccionada } from "@/components/PickerDriveCliente";
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
      dialogo.current?.setVisible(false);
      dialogo.current?.dispose?.();
      dialogo.current = null;
    };
  }, []);

  async function abrir(indice?: number) {
    if (deshabilitado || abriendo !== null || (indice === undefined && valor.length >= MAX_REFERENCIAS_TRABAJO)) return;
    const boton = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setError("");
    setConfirmar(null);
    setAbriendo(indice ?? "nueva");
    try {
      const conf = await api.adminGetDrivePickerToken(clienteId);
      if (!vigente.current) return;
      const picker = await cargarGooglePicker();
      if (!vigente.current) return;
      const vista = new picker.DocsView().setIncludeFolders(true).setSelectFolderEnabled(true).setParent(conf.carpeta_id);
      const cerrar = () => {
        dialogo.current?.setVisible(false);
        dialogo.current?.dispose?.();
        dialogo.current = null;
        setAbriendo(null);
        requestAnimationFrame(() => boton?.focus());
      };
      dialogo.current = new picker.PickerBuilder().addView(vista).setOAuthToken(conf.access_token)
        .setMaxItems(1).setOrigin(window.location.origin).setDeveloperKey(conf.clave).setAppId(conf.proyecto_id).setLocale("es")
        .setCallback((r) => {
          if (!vigente.current) return;
          if (r.action === picker.Action.CANCEL) { cerrar(); return; }
          if (r.action !== picker.Action.PICKED) return;
          const doc = r.docs?.[0];
          const listaActual = valorRef.current;
          if (!doc || !/^[\w-]{3,160}$/.test(doc.id) || !doc.name?.trim()) {
            setError("No pudimos leer ese archivo o carpeta. Elige otra referencia.");
            cerrar();
            return;
          }
          if (listaActual.some((ref, i) => ref.id === doc.id && i !== indice)) {
            setError("Esa referencia ya está en la lista.");
            cerrar();
            return;
          }
          const carpeta = doc.mimeType === "application/vnd.google-apps.folder" || doc.type === "folder" || !!doc.url?.includes("/folders/");
          const base: ReferenciaDriveTrabajo = {
            id: doc.id,
            nombre: doc.name.trim(),
            tipo: carpeta ? "carpeta" : "archivo",
            url: enlaceReferenciaDrive(doc.url)
              ? doc.url
              : (carpeta ? `https://drive.google.com/drive/folders/${doc.id}` : `https://drive.google.com/open?id=${doc.id}`),
          };
          dialogo.current?.setVisible(false);
          dialogo.current?.dispose?.();
          dialogo.current = null;
          void (async () => {
            const resuelto = await resolverReferenciaDriveSeleccionada(base);
            if (!vigente.current) return;
            const refFinal: ReferenciaDriveTrabajo = {
              id: resuelto.id,
              nombre: resuelto.nombre,
              tipo: resuelto.tipo,
              url: resuelto.url,
              ...(resuelto.ruta ? { ruta: resuelto.ruta } : {}),
            };
            const actual = valorRef.current;
            onChange(indice === undefined ? [...actual, refFinal] : actual.map((anterior, i) => i === indice ? refFinal : anterior), indice);
            setAbriendo(null);
            requestAnimationFrame(() => boton?.focus());
          })();
        }).build();
      dialogo.current.setVisible(true);
    } catch (e) {
      if (!vigente.current) return;
      setError(e instanceof Error ? e.message : "No pudimos abrir Google Drive.");
      setAbriendo(null);
      requestAnimationFrame(() => boton?.focus());
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
              <Boton variante="secundario" tamano="sm" className={styles.botonReferenciaTrabajo} disabled={bloqueado} cargando={abriendo === i} onClick={() => void abrir(i)} aria-label={`Cambiar ${nombre}`}>
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
    <div><Boton variante="secundario" tamano="sm" className={styles.botonReferenciaTrabajo}
      disabled={bloqueado || valor.length >= MAX_REFERENCIAS_TRABAJO} cargando={abriendo === "nueva"} onClick={() => void abrir()}>
      <Plus size={16} strokeWidth={1.75} aria-hidden="true" /> Añadir carpeta
    </Boton></div>
    {error && <p className={styles.error} role="alert">{error}</p>}
  </section>;
}
