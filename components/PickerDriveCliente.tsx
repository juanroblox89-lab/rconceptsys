"use client";

import { useEffect, useRef, useState } from "react";
import { FolderOpen } from "lucide-react";
import { api } from "@/lib/api";
import { Boton } from "@/components/ui/Boton";
import styles from "./FlujoTrabajo.module.css";

export type ReferenciaDrive = { id: string; nombre: string };
type Vista = { setIncludeFolders(v: boolean): Vista; setSelectFolderEnabled(v: boolean): Vista };
type Dialogo = { setVisible(v: boolean): void; dispose?(): void };
type Respuesta = { action: string; docs?: Array<{id: string; name: string}> };
type ConstructorPicker = {
  setOAuthToken(t: string): ConstructorPicker; setDeveloperKey(k: string): ConstructorPicker;
  setAppId(id: string): ConstructorPicker; setOrigin(o: string): ConstructorPicker; setLocale(l: string): ConstructorPicker;
  addView(v: Vista): ConstructorPicker; setCallback(fn: (r: Respuesta) => void): ConstructorPicker; build(): Dialogo;
};
type OAuth = { requestAccessToken(): void };
type Google = Window & {
  gapi?: { load(n: string, opts: { callback(): void; onerror(): void; timeout: number; ontimeout(): void }): void };
  google?: {
    accounts?: { oauth2: { initTokenClient(opts: { client_id: string; scope: string; include_granted_scopes: boolean;
      callback(r: { access_token?: string }): void; error_callback(): void }): OAuth } };
    picker?: { DocsView: new () => Vista; PickerBuilder: new () => ConstructorPicker; Action: { PICKED: string; CANCEL: string } };
  };
};

const scripts = new Map<string, Promise<void>>();
function cargarScript(src: string) {
  const anterior = scripts.get(src);
  if (anterior) return anterior;
  const promesa = new Promise<void>((ok, error) => {
    const el = document.createElement("script");
    const fallo = () => { window.clearTimeout(timeout); el.remove(); error(new Error("No pudimos cargar el selector de Google. Intenta otra vez.")); };
    const timeout = window.setTimeout(fallo, 10_000);
    el.src = src; el.async = true;
    el.onload = () => { window.clearTimeout(timeout); ok(); };
    el.onerror = fallo;
    document.head.append(el);
  }).catch(err => { scripts.delete(src); throw err; });
  scripts.set(src, promesa);
  return promesa;
}

export function PickerDriveCliente({ valor, onChange, disabled }: { valor: ReferenciaDrive | null; onChange(r: ReferenciaDrive | null): void; disabled: boolean }) {
  const [estado, setEstado] = useState<"listo" | "cargando" | "autorizar">("listo");
  const [error, setError] = useState("");
  const token = useRef<OAuth | null>(null);
  const dialogo = useRef<Dialogo | null>(null);
  const vigente = useRef(false);
  useEffect(() => {
    vigente.current = true;
    return () => { vigente.current = false; dialogo.current?.setVisible(false); dialogo.current?.dispose?.(); };
  }, []);

  async function abrir() {
    setError("");
    // Solicitar el token directamente desde el clic evita el bloqueo de ventanas de OAuth.
    if (token.current) { try { setEstado("cargando"); token.current.requestAccessToken(); } catch { setEstado("autorizar"); setError("No pudimos abrir Google. Intenta otra vez."); } return; }
    setEstado("cargando");
    try {
      const conf = await api.adminGetDrivePicker();
      await Promise.all([cargarScript("https://apis.google.com/js/api.js"), cargarScript("https://accounts.google.com/gsi/client")]);
      const w = window as Google;
      if (!w.gapi || !w.google?.accounts) throw new Error("Google no pudo iniciar el selector.");
      const gapi = w.gapi;
      if (!w.google.picker) await new Promise<void>((resolve, reject) => {
        const fallo = () => reject(new Error("No pudimos iniciar el selector de Google."));
        gapi.load("picker", { callback: resolve, onerror: fallo, timeout: 10_000, ontimeout: fallo });
      });
      const picker = w.google.picker;
      if (!picker || !vigente.current) return;
      token.current = w.google.accounts.oauth2.initTokenClient({
        client_id: conf.cliente_id, scope: "https://www.googleapis.com/auth/drive.file", include_granted_scopes: false,
        error_callback: () => { if (vigente.current) { setEstado("autorizar"); setError("No se autorizó Google Drive. Permite la ventana de Google e inténtalo de nuevo."); } },
        callback: ({ access_token }) => {
          if (!vigente.current) return;
          setEstado("autorizar");
          if (!access_token) { setError("No se autorizó el acceso a Google Drive."); return; }
          try {
            dialogo.current?.dispose?.();
            const vista = new picker.DocsView().setIncludeFolders(true).setSelectFolderEnabled(true);
            dialogo.current = new picker.PickerBuilder().addView(vista).setOAuthToken(access_token)
              .setOrigin(window.location.origin).setDeveloperKey(conf.clave).setAppId(conf.proyecto_id).setLocale("es")
              .setCallback(r => {
                if (!vigente.current) return;
                if (r.action === picker.Action.PICKED) {
                  const seleccionado = r.docs?.[0];
                  if (seleccionado?.id && seleccionado.name) onChange({ id: seleccionado.id, nombre: seleccionado.name });
                }
              }).build();
            dialogo.current.setVisible(true);
          } catch { setError("No pudimos abrir el selector de Google Drive."); }
        },
      });
      setEstado("autorizar");
    } catch (e) {
      if (vigente.current) { setEstado("listo"); setError(e instanceof Error ? e.message : "No pudimos abrir Google Drive."); }
    }
  }
  return <div className={styles.lista}>
    <strong>Referencia de Drive</strong>
    <p className={styles.ayuda}>{valor?.nombre ?? "Sin referencia"}</p>
    <div className={styles.acciones}>
      <Boton variante="secundario" disabled={disabled} cargando={estado === "cargando"} onClick={() => void abrir()}><FolderOpen size={16} aria-hidden="true" />{estado === "autorizar" ? "Abrir Google Picker" : "Seleccionar en Drive"}</Boton>
      {valor && <Boton variante="fantasma" disabled={disabled} onClick={() => onChange(null)}>Quitar referencia</Boton>}
    </div>
    {estado === "autorizar" && !error && <p className={styles.ayuda}>Elige una carpeta o archivo con tu cuenta de Google. La cuenta de Drive del equipo debe poder abrirlo.</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </div>;
}
