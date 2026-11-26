const etiquetas = new Set("p h1 h2 h3 h4 h5 h6 strong em del blockquote pre code ul ol li hr br table thead tbody tfoot tr th td figure figcaption".split(" "));
const omitir = new Set("script style svg img picture video audio iframe object embed form button input textarea select template link meta".split(" "));

// El portapapeles no transporta destinos (ni siquiera en enlaces privados permitidos en pantalla).
// También se retiran URLs y credenciales reconocibles que el modelo haya escrito como texto.
const enlaces = /\b(?:mailto|tel):[^\s<>"']+|\b[a-z][a-z\d+.-]*:(?:\/\/|(?:%2f){2})[^\s<>"']+|(?:\/\/|(?:%2f){2}|\bwww\.)[^\s<>"']+|[\p{L}\p{N}._%+-]+@(?:\[[^\s\]]+\]|[\p{L}\p{N}._%+-]+)|\b(?:[\w-]+\.)+[a-z]{2,63}(?=[:/\s?#]|$|[.,;)\]])(?::\d+)?(?:[/?#][^\s<>"']*)?|\b(?:localhost|(?:\d{1,3}\.){3}\d{1,3})(?=[:/?#])[^\s<>"']*|(?:\/|%2f)[^\s<>"']*(?:\?|%3f)[^\s<>"']*/giu;
const credenciales = /[^\s<>"']*(?:x-amz-(?:signature|credential)|x-goog-signature|(?:token|signature|sig|access_token|api[_-]?key)(?:=|%3d))[^\s<>"']*/giu;
const enLinea = new Set(["strong", "em", "del", "code"]);

function ocultarDatos(raiz: Element) {
  // Un enlace o correo puede atravesar varios nodos si tiene negritas o código dentro.
  let segmento: { nodo: Node; inicio: number; valor: string }[] = [];
  let texto = "";
  function filtrar() {
    for (const [patron, reemplazo] of [[enlaces, "[enlace omitido]"], [credenciales, "[dato omitido]"]] as const) {
      for (const match of Array.from(texto.matchAll(patron)).reverse()) {
        const inicio = match.index;
        const fin = inicio + match[0].length;
        for (const { nodo, inicio: base, valor } of segmento) {
          if (base >= fin) break;
          if (base + valor.length <= inicio) continue;
          const actual = nodo.nodeValue ?? "";
          nodo.nodeValue = actual.slice(0, Math.max(0, inicio - base)) +
            (base <= inicio ? reemplazo : "") + actual.slice(fin - base);
        }
      }
      // La segunda pasada usa offsets del texto ya filtrado.
      texto = "";
      segmento = segmento.map(({ nodo }) => {
        const valor = nodo.nodeValue ?? "";
        const inicio = texto.length;
        texto += valor;
        return { nodo, inicio, valor };
      }).filter(({ valor }) => valor.length > 0);
    }
    segmento = [];
    texto = "";
  }
  function recorrer(nodo: Node) {
    if (nodo.nodeType === 3) {
      const valor = nodo.nodeValue ?? "";
      if (valor) segmento.push({ nodo, inicio: texto.length, valor });
      texto += valor;
    } else if (nodo.nodeType === 1) {
      const bloque = !enLinea.has((nodo as Element).localName);
      if (bloque && segmento.length) filtrar();
      for (const hijo of nodo.childNodes) recorrer(hijo);
      if (bloque && segmento.length) filtrar();
    }
  }
  recorrer(raiz);
}

function textoPlano(nodo: Node): string {
  if (nodo.nodeType === 3) return nodo.nodeValue ?? "";
  if (nodo.nodeType !== 1) return "";
  const el = nodo as Element;
  const hijos = () => Array.from(el.childNodes).map(textoPlano).join("");
  switch (el.localName) {
    case "pre": return `${el.textContent?.replace(/\n$/, "") ?? ""}\n\n`;
    case "br": return "\n";
    case "hr": return "---\n\n";
    case "tr": return Array.from(el.children).map(c => textoPlano(c).trim().replace(/\s+/g, " ")).join("\t") + "\n";
    case "blockquote": return hijos().trim().split("\n").map(linea => `> ${linea}`).join("\n") + "\n\n";
    case "ol":
    case "ul": {
      const ordenada = el.localName === "ol";
      return Array.from(el.children).filter(c => c.localName === "li").map((li, i) => {
        const marca = ordenada ? `${Number(el.getAttribute("start") ?? 1) + i}. ` : "- ";
        return marca + textoPlano(li).trim().replace(/\n/g, "\n" + " ".repeat(marca.length));
      }).join("\n") + "\n\n";
    }
    case "figure": case "figcaption": case "table": case "p":
    case "h1": case "h2": case "h3": case "h4": case "h5": case "h6":
      return hijos().trim() + "\n\n";
    default: return hijos();
  }
}

export function formatosCuerpoRIA(cuerpo: HTMLElement): { html: string; texto: string } {
  const doc = cuerpo.ownerDocument;
  const limpio = doc.createElement("div");
  function agregar(nodo: Node, padre: HTMLElement) {
    if (nodo.nodeType === 3) {
      padre.append(doc.createTextNode((nodo.nodeValue ?? "").replace(/\p{Cf}/gu, "")));
      return;
    }
    if (nodo.nodeType !== 1) return;
    const el = nodo as Element;
    const nombre = el.localName;
    if (omitir.has(nombre) || el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true") return;
    const salida = etiquetas.has(nombre) ? doc.createElement(nombre) : padre;
    if (salida !== padre) {
      const inicio = el.getAttribute("start");
      if (nombre === "ol" && inicio && /^\d{1,9}$/.test(inicio)) salida.setAttribute("start", inicio);
      padre.append(salida);
    }
    for (const hijo of el.childNodes) agregar(hijo, salida);
  }
  for (const hijo of cuerpo.childNodes) agregar(hijo, limpio);
  // Markdown genera saltos entre elementos de bloque; no se añaden al texto del portapapeles.
  for (const el of [limpio, ...Array.from(limpio.querySelectorAll("figure, blockquote, ul, ol, li, table, thead, tbody, tr"))]) {
    for (const nodo of Array.from(el.childNodes)) {
      if (nodo.nodeType === 3 && /^\s*\n\s*$/.test(nodo.nodeValue ?? "")) el.removeChild(nodo);
    }
  }
  ocultarDatos(limpio);
  return { html: limpio.innerHTML, texto: textoPlano(limpio).trim() };
}

export async function copiarCuerpoRIA(cuerpo: HTMLElement | null, copiarTexto: (texto: string) => Promise<boolean>): Promise<boolean> {
  if (!cuerpo) return false;
  const { html, texto } = formatosCuerpoRIA(cuerpo);
  if (!texto) return false;
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([texto], { type: "text/plain" }),
      })]);
      return true;
    }
  } catch {
    // Navegadores sin escritura enriquecida: reutilizar el respaldo de texto.
  }
  return copiarTexto(texto);
}
