"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, FileText, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { Boton } from "@/components/ui/Boton";
import styles from "./FlujoTrabajo.module.css";

export type ReferenciaDrive = { id: string; nombre: string; url?: string };
export const MAX_REFERENCIAS = 10;
type Vista = { setIncludeFolders(v: boolean): Vista; setSelectFolderEnabled(v: boolean): Vista };
type Dialogo = { setVisible(v: boolean): void; dispose?(): void };
type Respuesta = { action: string; docs?: Array<{ id: string; name: string; url?: string }> };
type ConstructorPicker = {
  setOAuthToken(t: string): ConstructorPicker; setDeveloperKey(k: string): ConstructorPicker;
  setAppId(id: string): ConstructorPicker; setOrigin(o: string): ConstructorPicker; setLocale(l: string): ConstructorPicker;
  setMaxItems(n: number): ConstructorPicker; enableFeature(f: string): ConstructorPicker;
  addView(v: Vista): ConstructorPicker; setCallback(fn: (r: Respuesta) => void): ConstructorPicker; build(): Dialogo;
};
type OAuth = { requestAccessToken(): void };
type Google = Window & {
  gapi?: { load(n: string, opts: { callback(): void; onerror(): void; timeout: number; ontimeout(): void }): void };
  google?: {
    accounts?: { oauth2: { initTokenClient(opts: { client_id: string; scope: string; include_granted_scopes: boolean;
      callback(r: { access_token?: string }): void; error_callback(): void }): OAuth } };
    picker?: { DocsView: new () => Vista; PickerBuilder: new () => ConstructorPicker; Action: { PICKED: string; CANCEL: string }; Feature: { MULTISELECT_ENABLED: string } };
  };
};

const scripts = new Map<string, Promise<void>>();
function cargarScript(src: string) {
  const anterior = scripts.get(src);
  if (anterior) return anterior;
  const promesa = new Promise<void>((ok, error) => {
    const el = document.createElement("script");
    const fallo = () => { window.clearTimeout(timeout); el.remove(); error(new Error("No pudimos cargar Google Drive. Intenta otra vez.")); };
    const timeout = window.setTimeout(fallo, 10_000);
    el.src = src; el.async = true;
    el.onload = () => { window.clearTimeout(timeout); ok(); };
    el.onerror = fallo;
    document.head.append(el);
  }).catch(err => { scripts.delete(src); throw err; });
  scripts.set(src, promesa);
  return promesa;
}

/** Referencias de Drive del cliente: abrir, quitar (con confirmación) y añadir con el selector de Google. */
export function PickerDriveCliente({ valor, onChange, disabled }: { valor: ReferenciaDrive[]; onChange(r: ReferenciaDrive[]): void; disabled: boolean }) {
  const [estado, setEstado] = useState<"preparando" | "listo" | "abriendo" | "sin_drive">("preparando");
  const [error, setError] = useState("");
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const token = useRef<OAuth | null>(null);
  const dialogo = useRef<Dialogo | null>(null);
  const vigente = useRef(false);
  const actual = useRef(valor);
  useEffect(() => { actual.current = valor; }, [valor]);

  // Se prepara Google al abrir la página: así el clic abre la ventana de Google sin que el navegador la bloquee.
  useEffect(() => {
    vigente.current = true;
    (async () => {
      try {
        const conf = await api.adminGetDrivePicker();
        await Promise.all([cargarScript("https://apis.google.com/js/api.js"), cargarScript("https://accounts.google.com/gsi/client")]);
        const w = window as Google;
        if (!w.gapi || !w.google?.accounts) throw new Error("Google Drive no está disponible ahora.");
        const gapi = w.gapi;
        if (!w.google.picker) await new Promise<void>((resolve, reject) => {
          const fallo = () => reject(new Error("No pudimos preparar Google Drive."));
          gapi.load("picker", { callback: resolve, onerror: fallo, timeout: 10_000, ontimeout: fallo });
        });
        const picker = w.google.picker;
        if (!picker || !vigente.current) return;
        token.current = w.google.accounts.oauth2.initTokenClient({
          client_id: conf.cliente_id, scope: "https://www.googleapis.com/auth/drive.file", include_granted_scopes: false,
          error_callback: () => { if (vigente.current) { setEstado("listo"); setError("Google no dio permiso. Acepta la ventana de Google e inténtalo de nuevo."); } },
          callback: ({ access_token }) => {
            if (!vigente.current) return;
            setEstado("listo");
            if (!access_token) { setError("Google no dio permiso para abrir Drive."); return; }
            try {
              dialogo.current?.dispose?.();
              const libres = Math.max(1, MAX_REFERENCIAS - actual.current.length);
              const vista = new picker.DocsView().setIncludeFolders(true).setSelectFolderEnabled(true);
              dialogo.current = new picker.PickerBuilder().addView(vista).setOAuthToken(access_token)
                .enableFeature(picker.Feature.MULTISELECT_ENABLED).setMaxItems(libres)
                .setOrigin(window.location.origin).setDeveloperKey(conf.clave).setAppId(conf.proyecto_id).setLocale("es")
                .setCallback(r => {
                  if (!vigente.current || r.action !== picker.Action.PICKED) return;
                  const nuevos = (r.docs ?? []).filter(d => d.id && d.name).map(d => ({ id: d.id, nombre: d.name, url: d.url }));
                  const ids = new Set(actual.current.map(x => x.id));
                  onChange([...actual.current, ...nuevos.filter(n => !ids.has(n.id))].slice(0, MAX_REFERENCIAS));
                }).build();
              dialogo.current.setVisible(true);
            } catch { setError("No pudimos abrir Google Drive."); }
          },
        });
        setEstado("listo");
      } catch (e) {
        if (vigente.current) { setEstado("sin_drive"); setError(e instanceof Error ? e.message : "Google Drive no está disponible ahora."); }
      }
    })();
    return () => { vigente.current = false; dialogo.current?.setVisible(false); dialogo.current?.dispose?.(); };
  }, [onChange]);

  function abrir() {
    setError("");
    if (!token.current) return;
    try { setEstado("abriendo"); token.current.requestAccessToken(); }
    catch { setEstado("listo"); setError("No pudimos abrir Google. Intenta otra vez."); }
  }

  const lleno = valor.length >= MAX_REFERENCIAS;
  const bloqueado = disabled || estado === "preparando" || estado === "sin_drive";
  return <div className={styles.lista}>
    <strong>Referencias de Drive</strong>
    {valor.length === 0 ? <p className={styles.ayuda}>Archivos o carpetas con el material del cliente.</p> :
      <ul className={styles.referencias}>
        {valor.map(r => <li key={r.id} className={styles.referencia}>
          {confirmar === r.id ? <div className={styles.confirmarQuitar} role="group" aria-label={`Quitar ${r.nombre}`}>
            <span>¿Quitar «{r.nombre}»?</span>
            <Boton variante="secundario" tamano="sm" onClick={() => { onChange(valor.filter(x => x.id !== r.id)); setConfirmar(null); }}>Sí</Boton>
            <Boton variante="fantasma" tamano="sm" onClick={() => setConfirmar(null)}>No</Boton>
          </div> : <>
            <FileText size={16} aria-hidden="true" className={styles.referenciaIcono} />
            <span className={styles.referenciaNombre} title={r.nombre}>{r.nombre}</span>
            {r.url && /^https:\/\/(drive|docs)\.google\.com\//.test(r.url) && <a className={styles.referenciaAccion} href={r.url} target="_blank" rel="noreferrer" aria-label={`Abrir ${r.nombre} en Google Drive`}><ExternalLink size={15} aria-hidden="true" /><span>Abrir</span></a>}
            <button type="button" className={styles.referenciaAccion} disabled={disabled} onClick={() => setConfirmar(r.id)} aria-label={`Quitar ${r.nombre}`}><Trash2 size={15} aria-hidden="true" /><span>Quitar</span></button>
          </>}
        </li>)}
      </ul>}
    <div className={styles.acciones}>
      {valor.length === 0
        ? <Boton variante="secundario" disabled={bloqueado} cargando={estado === "preparando" || estado === "abriendo"} onClick={abrir}>Seleccionar en Google Drive</Boton>
        : !lleno && <Boton variante="secundario" tamano="sm" disabled={bloqueado} cargando={estado === "abriendo"} onClick={abrir} aria-label="Añadir otra referencia de Google Drive"><Plus size={16} aria-hidden="true" /> Añadir</Boton>}
    </div>
    {lleno && <p className={styles.ayuda}>Puedes tener hasta {MAX_REFERENCIAS} referencias.</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </div>;
}
