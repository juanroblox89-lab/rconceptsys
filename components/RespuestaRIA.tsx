import Link from "next/link";
import { cloneElement, isValidElement, type ReactNode, type ReactElement } from "react";
import Markdown from "react-markdown";
import { EnlaceExterno } from "@/components/ui/EnlaceExterno";
import { destinoRIA, type RutaRIA } from "@/lib/rutas-ria";

export function RespuestaRIA({ texto, rutas }: { texto: string; rutas: RutaRIA[] }) {
  function enlazar(nodo: ReactNode): ReactNode {
    if (typeof nodo === "string") {
      // Un token completo: no convertir prefijos de rutas no válidas ni de URLs.
      return nodo.split(/(?<![\p{L}\p{N}:/.@_-])(\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?)(?![\p{L}\p{N}/_?&#=-]|\.[\p{L}\p{N}])/giu).map((parte, i) => {
        const href = i % 2 === 1 && destinoRIA(rutas, parte);
        return href ? <Link key={i} href={href}>{parte}</Link> : parte;
      });
    }
    if (Array.isArray(nodo)) return nodo.map(enlazar);
    if (!isValidElement(nodo) || nodo.type === "a" || nodo.type === Link || nodo.type === EnlaceExterno || nodo.type === "pre") return nodo;
    const el = nodo as ReactElement<{ children?: ReactNode }>;
    return el.props.children ? cloneElement(el, {}, enlazar(el.props.children)) : nodo;
  }
  return <Markdown skipHtml components={{
    p: ({ children }) => <p>{enlazar(children)}</p>,
    li: ({ children }) => <li>{enlazar(children)}</li>,
    h1: ({ children }) => <h2>{enlazar(children)}</h2>,
    h2: ({ children }) => <h3>{enlazar(children)}</h3>,
    a: ({ href = "", children }) => {
      const ruta = destinoRIA(rutas, href);
      if (ruta) return <Link href={ruta}>{children}</Link>;
      return /^https?:\/\//i.test(href) ? <EnlaceExterno href={href}>{children}</EnlaceExterno> : <span>{children}</span>;
    },
  }}>{texto}</Markdown>;
}
