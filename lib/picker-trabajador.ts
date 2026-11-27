import type { MutableRefObject } from "react";
import { api } from "@/lib/api";
import {
  cargarGooglePicker,
  observarErroresPicker,
  traducirErrorGooglePicker,
  type DialogoPicker,
} from "@/lib/google-picker";
import type { TipoElementoEntrega, WorkerPickerConfig } from "@/lib/types";

export interface ElementoDriveTrabajador {
  id: string;
  nombre: string;
  url: string;
  tipo: TipoElementoEntrega;
}

export interface OpcionesPickerTrabajador {
  tareaId: number;
  multiselect?: boolean;
  maxItems?: number;
  dialogoRef?: MutableRefObject<DialogoPicker | null>;
  vigenteRef?: MutableRefObject<boolean>;
  onAbrir?: (conf: WorkerPickerConfig) => void;
  onSeleccion: (elementos: ElementoDriveTrabajador[], accessToken: string) => void;
  onCancelar?: () => void;
  onError?: (mensaje: string) => void;
}

type GISWindow = Window & {
  google?: {
    accounts?: {
      oauth2?: {
        initTokenClient(cfg: {
          client_id: string;
          scope: string;
          prompt?: string;
          callback: (res: { access_token?: string; expires_in?: number; error?: string; error_description?: string }) => void;
          error_callback?: (err: { type?: string; message?: string }) => void;
        }): { requestAccessToken(over?: { prompt?: string }): void };
      };
    };
  };
};

const gisScripts = new Map<string, Promise<void>>();
const tokenCache = new Map<string, { token: string; expira: number }>();

function cargarGIS(): Promise<void> {
  const w = window as GISWindow;
  if (w.google?.accounts?.oauth2) return Promise.resolve();
  const src = "https://accounts.google.com/gsi/client";
  const previo = gisScripts.get(src);
  if (previo) return previo;
  const promesa = new Promise<void>((ok, fallo) => {
    const el = document.createElement("script");
    const abortar = () => {
      window.clearTimeout(timer);
      el.remove();
      fallo(new Error("No pudimos cargar el acceso de Google Drive. Intenta otra vez."));
    };
    const timer = window.setTimeout(abortar, 10_000);
    el.src = src;
    el.async = true;
    el.onload = () => {
      window.clearTimeout(timer);
      ok();
    };
    el.onerror = abortar;
    document.head.append(el);
  }).catch((err) => {
    gisScripts.delete(src);
    throw err;
  });
  gisScripts.set(src, promesa);
  return promesa;
}

async function solicitarTokenTrabajadorGIS(clientId: string, scope: string): Promise<string> {
  const cacheKey = `${clientId}::${scope}`;
  const guardado = tokenCache.get(cacheKey);
  if (guardado && guardado.expira > Date.now() + 30_000) {
    return guardado.token;
  }
  await cargarGIS();
  const oauth2 = (window as GISWindow).google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error("El acceso con Google Drive no está disponible en este navegador.");
  }

  return new Promise<string>((resolve, reject) => {
    let resuelto = false;
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope,
      prompt: "",
      callback: (res) => {
        if (resuelto) return;
        resuelto = true;
        if (res.error || !res.access_token) {
          if (res.error === "access_denied" || res.error === "popup_closed_by_user") {
            reject(new Error("__CANCELADO__"));
            return;
          }
          reject(new Error(traducirErrorGooglePicker(`${res.error ?? ""} ${res.error_description ?? ""}`)));
          return;
        }
        const ttl = Math.max(60, Number(res.expires_in ?? 3000));
        tokenCache.set(cacheKey, {
          token: res.access_token,
          expira: Date.now() + ttl * 1000,
        });
        resolve(res.access_token);
      },
      error_callback: (err) => {
        if (resuelto) return;
        resuelto = true;
        if (err?.type === "popup_closed") {
          reject(new Error("__CANCELADO__"));
          return;
        }
        reject(new Error(traducirErrorGooglePicker(`${err?.type ?? ""} ${err?.message ?? ""}`)));
      },
    });
    client.requestAccessToken();
  });
}

function limpiarDialogo(ref?: MutableRefObject<DialogoPicker | null>) {
  const actual = ref?.current;
  if (!actual) return;
  try {
    actual.setVisible(false);
    actual.dispose?.();
  } catch {
    // Ignorar limpieza de diálogo ya cerrado
  }
  ref.current = null;
}

/**
 * Abre Google Picker para el trabajador usando token de solo selección (drive.file)
 * de su propia sesión Google (o un token explícito de solo lectura si el servidor lo entrega),
 * sin recibir nunca el refresh_token ni el token con permisos de escritura del equipo.
 */
export async function abrirPickerTrabajador(opts: OpcionesPickerTrabajador): Promise<void> {
  const conf = await api.getTareaDrivePickerToken(opts.tareaId);
  if (opts.vigenteRef && !opts.vigenteRef.current) return;

  let accessToken = (conf.access_token ?? "").trim();
  if (!accessToken) {
    if (!conf.client_id) {
      throw new Error("Falta la configuración del selector de Google Drive.");
    }
    try {
      accessToken = await solicitarTokenTrabajadorGIS(
        conf.client_id,
        conf.scope || "https://www.googleapis.com/auth/drive.file",
      );
    } catch (e) {
      if (e instanceof Error && e.message === "__CANCELADO__") {
        opts.onCancelar?.();
        return;
      }
      throw e;
    }
  }
  if (opts.vigenteRef && !opts.vigenteRef.current) return;

  const picker = await cargarGooglePicker();
  if (opts.vigenteRef && !opts.vigenteRef.current) return;

  limpiarDialogo(opts.dialogoRef);

  const vistaPropia = new picker.DocsView()
    .setIncludeFolders(true)
    .setSelectFolderEnabled(true);
  vistaPropia.setEnableDrives?.(true);

  const vistaCompartidos = new picker.DocsView()
    .setIncludeFolders(true)
    .setSelectFolderEnabled(true);
  const tieneCompartidos = typeof vistaCompartidos.setOwnedByMe === "function";
  if (tieneCompartidos) {
    vistaCompartidos.setOwnedByMe?.(false);
    vistaCompartidos.setEnableDrives?.(true);
    vistaCompartidos.setLabel?.("Compartidos conmigo");
  }

  let builder = new picker.PickerBuilder().addView(vistaPropia);
  if (tieneCompartidos) {
    builder = builder.addView(vistaCompartidos);
  }
  if (picker.Feature?.SUPPORT_DRIVES) {
    builder = builder.enableFeature(picker.Feature.SUPPORT_DRIVES);
  }
  const limite = Math.max(1, Math.min(4, opts.maxItems ?? 1));
  if (opts.multiselect && limite > 1 && picker.Feature?.MULTISELECT_ENABLED) {
    builder = builder.enableFeature(picker.Feature.MULTISELECT_ENABLED);
  }

  let dejarObservar: (() => void) | null = null;
  const cerrarYLimpiar = () => {
    dejarObservar?.();
    dejarObservar = null;
    limpiarDialogo(opts.dialogoRef);
  };

  try {
    dejarObservar = observarErroresPicker((msg) => {
      if (opts.vigenteRef && !opts.vigenteRef.current) return;
      cerrarYLimpiar();
      opts.onError?.(msg);
    });

    const dialogo = builder
      .setOAuthToken(accessToken)
      .setMaxItems(limite)
      .setOrigin(window.location.origin)
      .setDeveloperKey(conf.clave)
      .setAppId(conf.proyecto_id)
      .setLocale("es")
      .setCallback((r) => {
        if (opts.vigenteRef && !opts.vigenteRef.current) return;
        if (r.action === picker.Action.CANCEL) {
          cerrarYLimpiar();
          opts.onCancelar?.();
          return;
        }
        if (r.action === picker.Action.ERROR || r.action === "error" || r.error) {
          cerrarYLimpiar();
          opts.onError?.(traducirErrorGooglePicker(r.error ?? r.message ?? "Error al abrir Google Picker."));
          return;
        }
        if (r.action !== picker.Action.PICKED) return;

        const elementos: ElementoDriveTrabajador[] = [];
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
        cerrarYLimpiar();
        if (elementos.length > 0) {
          opts.onSeleccion(elementos, accessToken);
        }
      })
      .build();

    if (opts.dialogoRef) {
      opts.dialogoRef.current = dialogo;
    }
    dialogo.setVisible(true);
    opts.onAbrir?.(conf);
  } catch (e) {
    cerrarYLimpiar();
    throw new Error(traducirErrorGooglePicker(e));
  }
}
