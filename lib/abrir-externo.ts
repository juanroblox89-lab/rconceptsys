export function urlExterna(valor: string): string | undefined {
  try {
    const url = new URL(valor);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return;
    return url.href;
  } catch {
    return undefined;
  }
}

/** Se invoca durante el clic para conservar la activación del usuario. */
export function abrirExterno(valor: string): void {
  const href = urlExterna(valor);
  if (!href) return;
  // Cordova InAppBrowser deriva _system al navegador del dispositivo. En una
  // PWA o navegador normal, el destino externo no sustituye la ventana actual.
  const webview = window as Window & { cordova?: { InAppBrowser?: { open(url: string, destino: '_system'): unknown } } };
  if (webview.cordova?.InAppBrowser) {
    webview.cordova.InAppBrowser.open(href, '_system');
    return;
  }
  window.open(href, '_blank', 'noopener,noreferrer');
}
