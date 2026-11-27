export type Vista = {
  setParent(id: string): Vista;
  setIncludeFolders(v: boolean): Vista;
  setSelectFolderEnabled(v: boolean): Vista;
  setEnableDrives?(v: boolean): Vista;
  setLabel?(label: string): Vista;
  setOwnedByMe?(owned: boolean): Vista;
  setMode?(mode: string): Vista;
};

export type DialogoPicker = { setVisible(v: boolean): void; dispose?(): void };

export type Respuesta = {
  action: string;
  error?: string;
  message?: string;
  docs?: Array<{ id: string; name: string; url?: string; mimeType?: string; type?: string }>;
};

export type ConstructorPicker = {
  setOAuthToken(t: string): ConstructorPicker;
  setDeveloperKey(k: string): ConstructorPicker;
  setAppId(id: string): ConstructorPicker;
  setOrigin(o: string): ConstructorPicker;
  setLocale(l: string): ConstructorPicker;
  setMaxItems(n: number): ConstructorPicker;
  enableFeature(f: string): ConstructorPicker;
  addView(v: Vista): ConstructorPicker;
  setCallback(fn: (r: Respuesta) => void): ConstructorPicker;
  build(): DialogoPicker;
};

type Google = Window & {
  gapi?: { load(n: string, opts: { callback(): void; onerror(): void; timeout: number; ontimeout(): void }): void };
  google?: {
    picker?: {
      DocsView: new (viewId?: string) => Vista;
      PickerBuilder: new () => ConstructorPicker;
      ViewId?: { DOCS?: string; FOLDERS?: string; DOCS_VIDEOS?: string; DOCS_IMAGES?: string };
      DocsViewMode?: { LIST?: string; GRID?: string };
      Action: { PICKED: string; CANCEL: string; ERROR?: string };
      Feature: { MULTISELECT_ENABLED: string; SUPPORT_DRIVES?: string; NAV_HIDDEN?: string };
    };
  };
};

export function traducirErrorGooglePicker(err: unknown): string {
  const raw =
    typeof err === "string"
      ? err
      : err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null
          ? JSON.stringify(err)
          : "";
  const texto = raw.trim();
  const origin = typeof window !== "undefined" ? window.location.origin : "este dominio";

  if (/^(La clave de Google Picker|Este origen \(|El navegador bloqueó|Falta configurar|No se otorgó permiso)/.test(texto)) {
    return texto;
  }
  if (/developer\s*key|api[\s_-]*key|invalid[\s_-]*key|keynotvalid|clave.*inv[áa]lid/i.test(texto)) {
    return "La clave de Google Picker no es válida o no tiene permiso para Google Picker API. Pide a administración revisar GOOGLE_PICKER_KEY y las restricciones en Google Cloud.";
  }
  if (/origin|referer|referrer|mismatch|not[_\s-]*allowed|unauthorized|idpiframe|forbidden|dominio.*autorizado/i.test(texto)) {
    return `Este origen (${origin}) no está autorizado en Google Cloud para abrir Google Drive. Pide a administración agregarlo en credenciales OAuth y en la clave de Google Picker.`;
  }
  if (/popup_failed_to_open|bloque[óo] la ventana/i.test(texto)) {
    return "El navegador bloqueó la ventana de Google. Permite las ventanas emergentes para este sitio e inténtalo de nuevo.";
  }
  if (/invalid_client|deleted_client|client_id/i.test(texto)) {
    return "Falta configurar o corregir el cliente OAuth de Google Drive en este entorno.";
  }
  if (/access_denied|user_cancelled|consent_required/i.test(texto)) {
    return "No se otorgó permiso para abrir Google Drive. Inicia sesión con la cuenta del equipo e inténtalo otra vez.";
  }
  if (texto) return texto;
  return "No pudimos abrir Google Drive. Verifica tu sesión e inténtalo otra vez.";
}

export function observarErroresPicker(alFallar: (mensaje: string) => void): () => void {
  if (typeof window === "undefined") return () => {};
  let notificado = false;
  const disparar = (fuente: unknown) => {
    if (notificado) return;
    const raw =
      typeof fuente === "string"
        ? fuente
        : fuente instanceof Error
          ? fuente.message
          : typeof fuente === "object" && fuente !== null
            ? JSON.stringify(fuente)
            : "";
    if (!/developer\s*key|api[\s_-]*key|origin|referer|referrer|mismatch|idpiframe|google.*picker|picker.*error|invalid_client|unauthorized/i.test(raw)) {
      return;
    }
    notificado = true;
    alFallar(traducirErrorGooglePicker(raw));
  };

  const onError = (ev: ErrorEvent) => {
    const origen = ev.filename ?? "";
    if (/apis\.google\.com|docs\.google\.com|accounts\.google\.com/i.test(origen)) {
      notificado = true;
      alFallar(traducirErrorGooglePicker(ev.message || "Error al inicializar Google Picker (clave u origen)."));
      return;
    }
    disparar(ev.error ?? ev.message);
  };
  const onRejection = (ev: PromiseRejectionEvent) => {
    disparar(ev.reason);
  };
  const onMessage = (ev: MessageEvent) => {
    if (!/^https:\/\/(docs|drive|accounts)\.google\.com$/i.test(ev.origin)) return;
    disparar(ev.data);
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  window.addEventListener("message", onMessage);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("message", onMessage);
  };
}

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

export async function cargarGooglePicker() {
  await cargarScript("https://apis.google.com/js/api.js");
  const w = window as Google;
  const gapi = w.gapi;
  if (!gapi) throw new Error("Google Drive no está disponible ahora.");
  if (!w.google?.picker) await new Promise<void>((resolve, reject) => {
    const fallo = () => reject(new Error("No pudimos preparar Google Drive. Verifica tu conexión o los orígenes autorizados."));
    gapi.load("picker", { callback: resolve, onerror: fallo, timeout: 10_000, ontimeout: fallo });
  });
  if (!w.google?.picker) throw new Error("No pudimos abrir Google Drive.");
  return w.google.picker;
}
