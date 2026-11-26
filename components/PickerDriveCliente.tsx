"use client";

import { EnlaceExterno } from "@/components/ui/EnlaceExterno";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { ExternalLink, FileText, FolderOpen, Plus, Trash2 } from "lucide-react";
import { api, type ApiError } from "@/lib/api";
import { cargarGooglePicker, type DialogoPicker } from "@/lib/google-picker";
import { enlaceReferenciaDrive, nombreReferenciaVisible } from "@/lib/referencias-trabajo";
import { Boton } from "@/components/ui/Boton";
import styles from "./FlujoTrabajo.module.css";

export type ReferenciaDrive = { id: string; nombre: string; url?: string; ruta?: string };
export const MAX_REFERENCIAS = 10;

export interface TokenPickerDrive {
  access_token: string;
  expires_in: number;
  carpeta_id: string;
  clave: string;
  proyecto_id: string;
  correo?: string;
  cuenta_equipo?: string;
}

export interface ElementoDriveSeleccionado {
  id: string;
  nombre: string;
  url: string;
  tipo: "carpeta" | "archivo";
  ruta?: string;
}

export async function resolverReferenciaDriveSeleccionada(
  base: ElementoDriveSeleccionado,
): Promise<ElementoDriveSeleccionado> {
  try {
    const res = await api.adminGetDriveReferencia(base.id);
    if (
      res &&
      typeof res === "object" &&
      !Array.isArray(res) &&
      typeof res.nombre === "string" &&
      res.nombre.trim()
    ) {
      return {
        id: base.id,
        nombre: res.nombre.trim(),
        url: enlaceReferenciaDrive(res.url) ? res.url : base.url,
        tipo: res.tipo === "carpeta" || res.tipo === "archivo" ? res.tipo : base.tipo,
        ruta: typeof res.ruta === "string" && res.ruta.trim() ? res.ruta.trim() : undefined,
      };
    }
  } catch {
    // Fallback limpio si Drive no está disponible o el entorno no soporta la resolución.
  }
  return base;
}

export interface OpcionesSelectorDrive {
  clienteId?: number;
  multiselect?: boolean;
  maxItems?: number;
  dialogoRef?: MutableRefObject<DialogoPicker | null>;
  vigenteRef?: MutableRefObject<boolean>;
  onAbrir?: (token: TokenPickerDrive) => void;
  onSeleccion: (
    elementos: ElementoDriveSeleccionado[],
    token: TokenPickerDrive,
    correoPicker?: string,
  ) => void | Promise<void>;
  onCancelar?: () => void;
}

/** Abre el Google Picker oficial usando el token temporal del Drive del equipo (/api/admin/drive/picker-token). */
export async function abrirSelectorGoogleDrive(opts: OpcionesSelectorDrive): Promise<{
  conf: TokenPickerDrive;
  dialogo: DialogoPicker;
} | null> {
  const conf = await api.adminGetDrivePickerToken(opts.clienteId);
  if (opts.vigenteRef && !opts.vigenteRef.current) return null;
  const picker = await cargarGooglePicker();
  if (opts.vigenteRef && !opts.vigenteRef.current) return null;

  if (opts.dialogoRef?.current) {
    try {
      opts.dialogoRef.current.setVisible(false);
      opts.dialogoRef.current.dispose?.();
    } catch {
      // Ignorar limpieza previa de diálogo cerrado
    }
    opts.dialogoRef.current = null;
  }

  const vista = new picker.DocsView()
    .setIncludeFolders(true)
    .setSelectFolderEnabled(true)
    .setParent(conf.carpeta_id);

  let builder = new picker.PickerBuilder()
    .addView(vista)
    .setOAuthToken(conf.access_token);

  if (opts.multiselect && picker.Feature?.MULTISELECT_ENABLED) {
    builder = builder.enableFeature(picker.Feature.MULTISELECT_ENABLED);
  }

  const dialogo = builder
    .setMaxItems(Math.max(1, opts.maxItems ?? 1))
    .setOrigin(window.location.origin)
    .setDeveloperKey(conf.clave)
    .setAppId(conf.proyecto_id)
    .setLocale("es")
    .setCallback((r) => {
      if (opts.vigenteRef && !opts.vigenteRef.current) return;
      if (r.action === picker.Action.CANCEL) {
        if (opts.dialogoRef?.current) {
          try {
            opts.dialogoRef.current.setVisible(false);
            opts.dialogoRef.current.dispose?.();
          } catch {
            // Ignorar cierre
          }
          opts.dialogoRef.current = null;
        }
        opts.onCancelar?.();
        return;
      }
      if (r.action !== picker.Action.PICKED) return;

      const extra = r as unknown as { userEmail?: string; email?: string };
      const correoPicker =
        typeof extra.userEmail === "string"
          ? extra.userEmail
          : typeof extra.email === "string"
            ? extra.email
            : undefined;

      const elementos: ElementoDriveSeleccionado[] = [];
      for (const d of r.docs ?? []) {
        if (!d || !/^[\w-]{3,160}$/.test(d.id) || !d.name?.trim()) continue;
        const esCarpeta =
          d.mimeType === "application/vnd.google-apps.folder" ||
          d.type === "folder" ||
          Boolean(d.url?.includes("/folders/"));
        const urlValida =
          d.url && /^https:\/\/(drive|docs|drive\.usercontent)\.google\.com\//i.test(d.url)
            ? d.url
            : undefined;
        const url =
          urlValida ??
          (esCarpeta
            ? `https://drive.google.com/drive/folders/${d.id}`
            : `https://drive.google.com/open?id=${d.id}`);
        elementos.push({
          id: d.id,
          nombre: d.name.trim(),
          url,
          tipo: esCarpeta ? "carpeta" : "archivo",
        });
      }

      if (opts.dialogoRef?.current) {
        try {
          opts.dialogoRef.current.setVisible(false);
          opts.dialogoRef.current.dispose?.();
        } catch {
          // Ignorar cierre
        }
        opts.dialogoRef.current = null;
      }

      void opts.onSeleccion(elementos, conf, correoPicker);
    })
    .build();

  if (opts.dialogoRef) {
    opts.dialogoRef.current = dialogo;
  }
  dialogo.setVisible(true);
  opts.onAbrir?.(conf);
  return { conf, dialogo };
}

function limpiarDialogoPicker(ref: MutableRefObject<DialogoPicker | null>) {
  const actual = ref.current;
  if (!actual) return;
  try {
    actual.setVisible(false);
    actual.dispose?.();
  } catch {
    // Ignorar limpieza de diálogo ya cerrado
  }
  ref.current = null;
}

/** Referencias de Drive del cliente: abrir, quitar (con confirmación) y añadir con el selector de Google. */
export function PickerDriveCliente({ clienteId, valor, onChange, disabled }: {
  clienteId?: number; valor: ReferenciaDrive[]; onChange(r: ReferenciaDrive[]): void; disabled: boolean;
}) {
  const [estado, setEstado] = useState<"preparando" | "listo" | "abriendo" | "sin_drive" | "sin_organizar">("preparando");
  const [error, setError] = useState("");
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const dialogo = useRef<DialogoPicker | null>(null);
  const vigente = useRef(false);
  const actual = useRef(valor);
  useEffect(() => { actual.current = valor; }, [valor]);

  useEffect(() => {
    let activo = true;
    vigente.current = true;
    api.adminGetDrive().then(drive => {
      if (activo) setEstado(!drive.conectado ? "sin_drive" : !drive.organizado ? "sin_organizar" : "listo");
    }).catch(() => { if (activo) setEstado("listo"); }); // El clic vuelve a consultar si falló la red.
    return () => {
      activo = false;
      vigente.current = false;
      limpiarDialogoPicker(dialogo);
    };
  }, []);

  async function abrir() {
    setError(""); setEstado("abriendo");
    try {
      await abrirSelectorGoogleDrive({
        clienteId,
        multiselect: true,
        maxItems: Math.max(1, MAX_REFERENCIAS - actual.current.length),
        dialogoRef: dialogo,
        vigenteRef: vigente,
        onAbrir: () => setEstado("listo"),
        onSeleccion: async (elementos) => {
          const resueltos = await Promise.all(
            elementos.map((el) => resolverReferenciaDriveSeleccionada(el)),
          );
          if (!vigente.current) return;
          const nuevos: ReferenciaDrive[] = resueltos.map((d) => ({
            id: d.id,
            nombre: d.nombre,
            url: d.url,
            ...(d.ruta ? { ruta: d.ruta } : {}),
          }));
          const ids = new Set(actual.current.map(x => x.id));
          onChange([
            ...actual.current,
            ...nuevos.filter(n => {
              if (ids.has(n.id)) return false;
              ids.add(n.id);
              return true;
            }),
          ].slice(0, MAX_REFERENCIAS));
        },
      });
    } catch (e) {
      if (!vigente.current) return;
      const codigo = (e as ApiError).codigo;
      setEstado(codigo === "drive_no_conectado" ? "sin_drive" : codigo === "drive_sin_organizar" ? "sin_organizar" : "listo");
      if (codigo !== "drive_no_conectado" && codigo !== "drive_sin_organizar") setError(e instanceof Error ? e.message : "No pudimos abrir Google Drive.");
    }
  }

  const lleno = valor.length >= MAX_REFERENCIAS;
  const bloqueado = disabled || estado === "preparando" || estado === "sin_drive" || estado === "sin_organizar";
  return <div className={styles.lista}>
    <strong>Referencias de Drive</strong>
    {valor.length > 0 &&
      <ul className={styles.referencias}>
        {valor.map(r => {
          const esCarpeta = Boolean(r.url?.includes("/folders/"));
          const Icono = esCarpeta ? FolderOpen : FileText;
          const nombre = nombreReferenciaVisible({ nombre: r.nombre, tipo: esCarpeta ? "carpeta" : "archivo" });
          return <li key={r.id} className={styles.referencia}>
          {confirmar === r.id ? <div className={styles.confirmarQuitar} role="group" aria-label={`Quitar ${nombre}`}>
            <span>¿Quitar «{nombre}»?</span>
            <Boton variante="peligro" tamano="sm" onClick={() => { onChange(valor.filter(x => x.id !== r.id)); setConfirmar(null); }}>Sí</Boton>
            <Boton variante="secundario" tamano="sm" onClick={() => setConfirmar(null)}>No</Boton>
          </div> : <>
            <Icono size={16} aria-hidden="true" className={styles.referenciaIcono} />
            <div className={styles.referenciaTexto}>
              {r.ruta && <span className={styles.rutaReferenciaTrabajo} title={r.ruta}>{r.ruta}</span>}
              <span className={styles.referenciaNombre} title={nombre}>{nombre}</span>
            </div>
            {r.url && /^https:\/\/(drive|docs)\.google\.com\//.test(r.url) && <EnlaceExterno className={`rc-btn rc-btn--secundario rc-btn--sm ${styles.referenciaAccion}`} href={r.url} aria-label={`Abrir ${nombre} en Google Drive`}><ExternalLink size={15} aria-hidden="true" /><span>Abrir</span></EnlaceExterno>}
            <Boton variante="peligro" tamano="sm" className={styles.referenciaAccion} disabled={disabled} onClick={() => setConfirmar(r.id)} aria-label={`Quitar ${nombre}`}><Trash2 size={15} aria-hidden="true" /><span>Quitar</span></Boton>
          </>}
        </li>;
        })}
      </ul>}
    <div className={styles.acciones}>
      {valor.length === 0
        ? <Boton variante="secundario" disabled={bloqueado} cargando={estado === "preparando" || estado === "abriendo"} onClick={abrir}>Seleccionar en Google Drive</Boton>
        : !lleno && <Boton variante="secundario" tamano="sm" disabled={bloqueado} cargando={estado === "abriendo"} onClick={abrir} aria-label="Añadir otra referencia de Google Drive"><Plus size={16} aria-hidden="true" /> Añadir</Boton>}
    </div>
    {estado === "sin_drive" && <p className={styles.ayuda} role="status">Conecta el Drive del equipo en Gestión → Equipo</p>}
    {estado === "sin_organizar" && <p className={styles.ayuda} role="status">Organiza el Drive del equipo en Gestión → Equipo</p>}
    {lleno && <p className={styles.ayuda}>Máximo: {MAX_REFERENCIAS} referencias.</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </div>;
}
