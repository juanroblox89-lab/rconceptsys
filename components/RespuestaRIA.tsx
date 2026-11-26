import Link from "next/link";
import { cloneElement, isValidElement, type ReactNode, type ReactElement } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { EnlaceExterno } from "@/components/ui/EnlaceExterno";
import { destinoRIA, type RutaRIA } from "@/lib/rutas-ria";
import { cercaVisualizacionCerrada, leerVisualizacionRIA } from "@/lib/visualizacion-ria";
import { VisualizacionRIA } from "./VisualizacionRIA";
import styles from "./RespuestaRIA.module.css";

export function RespuestaRIA({ texto, rutas = [], grupo = false, transmitiendo = false }: {
  texto: string;
  rutas?: RutaRIA[];
  grupo?: boolean;
  transmitiendo?: boolean;
}) {
  function enlazar(nodo: ReactNode): ReactNode {
    if (grupo || !rutas.length) return nodo;
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

  const componentes: Components = {
    p: ({ children }) => <p>{enlazar(children)}</p>,
    li: ({ children, className }) => <li className={className}>{enlazar(children)}</li>,
    h1: ({ children }) => <h2>{enlazar(children)}</h2>,
    h2: ({ children }) => <h3>{enlazar(children)}</h3>,
    img: ({ alt }) => alt ? <span>{alt}</span> : null,
    a: ({ href = "", children, node }) => {
      const inicio = node?.position?.start.offset;
      // GFM detecta URLs sueltas; en privado solo se activan los enlaces que ya admitía Markdown.
      if (grupo || inicio === undefined || !"[<".includes(texto[inicio])) return <span>{children}</span>;
      const ruta = destinoRIA(rutas, href);
      if (ruta) return <Link href={ruta}>{children}</Link>;
      return /^https?:\/\//i.test(href) ? <EnlaceExterno href={href}>{children}</EnlaceExterno> : <span>{children}</span>;
    },
    table: ({ children }) => <div className={styles.tabla} role="region" aria-label="Tabla de la respuesta de RIA" tabIndex={0}>
      <table>{children}</table>
    </div>,
    pre: ({ children, node }) => {
      const codigo = node?.children[0];
      if (codigo?.type !== "element" || !Array.isArray(codigo.properties.className) || !codigo.properties.className.includes("language-ria-viz")) {
        return <pre>{children}</pre>;
      }
      const posicion = codigo.position ?? node?.position;
      const fragmento = texto.slice(posicion?.start.offset, posicion?.end.offset);
      const cerrado = cercaVisualizacionCerrada(fragmento);
      const contenido = codigo.children[0];
      const viz = cerrado && contenido?.type === "text" && leerVisualizacionRIA(contenido.value);
      if (viz) return <VisualizacionRIA viz={viz} />;
      return <div className={styles.figura}>
        <p>{!cerrado && transmitiendo ? "Visualización en curso…" : "Visualización no disponible. Datos recibidos:"}</p>
        <pre>{children}</pre>
      </div>;
    },
  };
  return <div className={styles.cuerpo} data-rc-cuerpo-ria>
    <Markdown skipHtml remarkPlugins={[remarkGfm]} components={componentes}>{texto}</Markdown>
  </div>;
}
