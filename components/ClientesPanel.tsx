"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Plus, Search } from "lucide-react";
import { api } from "@/lib/api";
import type { Cliente } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { Boton } from "@/components/ui/Boton";
import { Esqueleto } from "@/components/ui/Esqueleto";
import styles from "./FlujoTrabajo.module.css";

export function FotoCliente({ cliente, grande = false }: { cliente: Cliente; grande?: boolean }) {
  const [fallo, setFallo] = useState("");
  const src = cliente.foto_url ?? "";
  const segura = /^https:\/\//i.test(src) || /^\/api\/admin\/clientes\/\d+\/foto\/[a-f0-9]{32}\.(jpg|png|webp)$/.test(src);
  const iniciales = cliente.nombre.trim().split(/\s+/).slice(0, 2).map(n => n[0]).join("").toLocaleUpperCase("es");
  return <Avatar src={segura && src !== fallo ? src : undefined} iniciales={iniciales} alt="" tamano={40}
    className={grande ? styles.fotoGrande : undefined} onError={() => setFallo(src)} />;
}

function normalizar(s: string) { return s.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es").trim(); }

export function ClientesPanel({ integrado = false }: { integrado?: boolean }) {
  const [datos, setDatos] = useState<Cliente[] | null>(null);
  const [error, setError] = useState("");
  const [intento, setIntento] = useState(0);
  const [filtro, setFiltro] = useState("");
  const origen = integrado ? "?desde=admin" : "";
  useEffect(() => {
    let vigente = true;
    api.adminGetClientes().then(clientes => { if (vigente) setDatos(clientes ?? []); })
      .catch((e: Error) => { if (vigente) setError(e.message || "No se pudieron cargar los clientes."); });
    return () => { vigente = false; };
  }, [intento]);
  const clientes = datos?.filter(c => normalizar(c.nombre).includes(normalizar(filtro))) ?? [];
  return <section className={integrado ? styles.clientes : `${styles.pagina} ${styles.clientes}`}>
    <header className={styles.cabeceraClientes}>
      <div><p className={styles.sobreTitulo}>Producción</p>{integrado ? <h2>Clientes</h2> : <h1>Clientes</h1>}<p>Consulta sus fichas, trabajos y referencias de Drive.</p></div>
      <Link className={styles.abrir} href={`/clientes/nuevo${origen}`}><Plus size={16} aria-hidden="true" /> Nuevo cliente</Link>
    </header>
    {!datos ? (error ? <><p className={styles.error} role="alert">{error}</p><Boton variante="secundario" onClick={() => { setError(""); setIntento(n => n + 1); }}>Reintentar</Boton></> : <Esqueleto filas={4} />) : <>
      <div className={styles.buscarCliente}><Search size={16} aria-hidden="true" /><input type="search" aria-label="Buscar clientes" placeholder="Buscar clientes" value={filtro} onChange={e => setFiltro(e.target.value)} /></div>
      <p className={styles.ayuda} role="status">{clientes.length} {clientes.length === 1 ? "cliente" : "clientes"}</p>
      {!clientes.length ? <div className={styles.panel}><p>{filtro ? "No encontramos clientes con ese nombre." : "Aún no hay clientes. Crea el primero para empezar a asignar trabajos."}</p></div> :
        <ul className={styles.listaTrabajos}>{clientes.map(c => <li className={styles.filaCliente} key={c.id}>
          <FotoCliente cliente={c} /><div><strong title={c.nombre}>{c.nombre}</strong><small>{c.activo ? "Activo" : "Inactivo"}</small></div>
          <Link className={styles.abrir} aria-label={`Ver cliente: ${c.nombre}`} href={`/clientes/${c.id}${origen}`}>Ver <ArrowUpRight size={14} aria-hidden="true" /></Link>
        </li>)}</ul>}
    </>}
  </section>;
}
