"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import type { PreferenciasNotificaciones } from "@/lib/types";
import { FormularioCelular } from "@/components/Celular";
import { AvisosPush } from "@/components/AvisosPush";
import { Campo } from "@/components/ui/Campo";
import { Boton } from "@/components/ui/Boton";
import { Esqueleto } from "@/components/ui/Esqueleto";
import styles from "@/components/FlujoTrabajo.module.css";
import conf from "./configuracion.module.css";

const tipos: Array<[string, string]> = [
  ["tarea-nueva", "Trabajo asignado"], ["tarea-editada", "Trabajo actualizado"], ["chat", "Mensajes del equipo"], ["drive", "Cambios en Drive"], ["ria", "Respuesta de RIA"],
  ["entrega-hecha", "Entrega por revisar"], ["entrega-aprobada", "Entrega aprobada"], ["entrega-devuelta", "Entrega devuelta"], ["vence-manana", "Vence mañana"], ["vencio", "Trabajo vencido"],
  ["corte-listo", "Corte listo"], ["corte-pagado", "Corte pagado"], ["solicitud", "Solicitud para unirse"],
];

export default function ConfiguracionPage() {
  const [prefs, setPrefs] = useState<PreferenciasNotificaciones | null>(null);
  const [admin, setAdmin] = useState(false);
  const [estado, setEstado] = useState({ texto: "", error: false });
  const [ocupado, setOcupado] = useState(false);
  const [intento, setIntento] = useState(0);
  useEffect(() => {
    let vigente = true;
    Promise.all([api.getYo(), api.getPreferenciasNotificaciones()]).then(([p, datos]) => {
      if (vigente) { setAdmin(p.es_admin); setPrefs(datos); }
    }).catch(() => { if (vigente) setEstado({ texto: "No pudimos cargar tus preferencias.", error: true }); });
    return () => { vigente = false; };
  }, [intento]);
  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!prefs || ocupado) return;
    setOcupado(true); setEstado({ texto: "", error: false });
    try { setPrefs(await api.guardarPreferenciasNotificaciones(prefs)); setEstado({ texto: "Preferencias guardadas.", error: false }); }
    catch (e) { setEstado({ texto: e instanceof Error ? e.message : "No se pudieron guardar.", error: true }); }
    finally { setOcupado(false); }
  }
  return <div className={styles.pagina}>
    <header className={styles.cabecera}><div><h1>Configuración</h1><p>Personaliza cómo recibes los avisos.</p></div></header>
    {!prefs ? (estado.error ? <><p role="alert">{estado.texto}</p><Boton onClick={() => { setEstado({ texto: "", error: false }); setIntento(intento + 1); }}>Reintentar</Boton></> : <Esqueleto filas={5} />) :
      <form className={styles.form} onSubmit={guardar}>
        <h2>Notificaciones</h2>
        <p className={styles.ayuda}>Las menciones siempre llegan. El horario de silencio solo aplaza los avisos al dispositivo.</p>
        <label className={conf.opcion}><input type="checkbox" checked={prefs.silenciar_chat} onChange={(e) => setPrefs({ ...prefs, silenciar_chat: e.target.checked })} /> Silenciar chat del equipo</label>
        <fieldset className={conf.tarjeta} disabled={ocupado}>
          <legend>Tipos de aviso</legend>
          <div className={conf.opciones}>{tipos.filter(([k]) => admin || !["entrega-hecha", "solicitud"].includes(k)).map(([k, texto]) => <label key={k} className={conf.opcion}><input type="checkbox" checked={!prefs.tipos_silenciados.includes(k)} onChange={(e) => setPrefs({ ...prefs, tipos_silenciados: e.target.checked ? prefs.tipos_silenciados.filter((t) => t !== k) : [...prefs.tipos_silenciados, k] })} /> {texto}</label>)}</div>
        </fieldset>
        <fieldset className={conf.tarjeta} disabled={ocupado}>
          <legend>Horario de silencio (hora de Bogotá)</legend>
          <div className={conf.horario}><Campo etiqueta="Desde" type="time" value={prefs.silencio_desde} onChange={(e) => setPrefs({ ...prefs, silencio_desde: e.target.value })} />
          <Campo etiqueta="Hasta" type="time" value={prefs.silencio_hasta} onChange={(e) => setPrefs({ ...prefs, silencio_hasta: e.target.value })} /></div>
          <div><Boton variante="fantasma" onClick={() => setPrefs({ ...prefs, silencio_desde: "", silencio_hasta: "" })}>Quitar horario</Boton></div>
        </fieldset>
        <div><Boton type="submit" cargando={ocupado}>Guardar preferencias</Boton></div>
        {estado.texto && <p role={estado.error ? "alert" : "status"}>{estado.texto}</p>}
      </form>}
    <FormularioCelular />
      <AvisosPush />
  </div>;
}
