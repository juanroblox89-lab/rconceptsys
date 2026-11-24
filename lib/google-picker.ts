type Vista = { setParent(id: string): Vista; setIncludeFolders(v: boolean): Vista; setSelectFolderEnabled(v: boolean): Vista };
export type DialogoPicker = { setVisible(v: boolean): void; dispose?(): void };
type Respuesta = { action: string; docs?: Array<{ id: string; name: string; url?: string; mimeType?: string; type?: string }> };
type ConstructorPicker = {
  setOAuthToken(t: string): ConstructorPicker; setDeveloperKey(k: string): ConstructorPicker;
  setAppId(id: string): ConstructorPicker; setOrigin(o: string): ConstructorPicker; setLocale(l: string): ConstructorPicker;
  setMaxItems(n: number): ConstructorPicker; enableFeature(f: string): ConstructorPicker;
  addView(v: Vista): ConstructorPicker; setCallback(fn: (r: Respuesta) => void): ConstructorPicker; build(): DialogoPicker;
};
type Google = Window & {
  gapi?: { load(n: string, opts: { callback(): void; onerror(): void; timeout: number; ontimeout(): void }): void };
  google?: {
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

export async function cargarGooglePicker() {
  await cargarScript("https://apis.google.com/js/api.js");
  const w = window as Google;
  const gapi = w.gapi;
  if (!gapi) throw new Error("Google Drive no está disponible ahora.");
  if (!w.google?.picker) await new Promise<void>((resolve, reject) => {
    const fallo = () => reject(new Error("No pudimos preparar Google Drive."));
    gapi.load("picker", { callback: resolve, onerror: fallo, timeout: 10_000, ontimeout: fallo });
  });
  if (!w.google?.picker) throw new Error("No pudimos abrir Google Drive.");
  return w.google.picker;
}
