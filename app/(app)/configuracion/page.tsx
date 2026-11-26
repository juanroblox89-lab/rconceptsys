"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import type { PreferenciasNotificaciones } from "@/lib/types";
import { FormularioCelular } from "@/components/Celular";
import { AvisosPush } from "@/components/AvisosPush";
import { CampoHora } from "@/components/ui/CamposEspeciales";
import { CabeceraPagina } from "@/components/ui/CabeceraPagina";
import { Casilla } from "@/components/ui/Casilla";
import { Boton } from "@/components/ui/Boton";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { useCambiosSinGuardar } from "@/components/CambiosSinGuardar";
import styles from "@/components/FlujoTrabajo.module.css";
import conf from "./configuracion.module.css";

const tipos: Array<[string, string]> = [
  ["tarea-nueva", "Trabajo asignado"], ["tarea-editada", "Trabajo actualizado"], ["chat", "Mensajes del equipo"], ["drive", "Cambios en Drive"], ["ria", "Respuesta de RIA"],
  ["entrega-hecha", "Entrega por revisar"], ["entrega-aprobada", "Entrega aprobada"], ["entrega-devuelta", "Entrega devuelta"], ["vence-manana", "Vence mañana"], ["vencio", "Trabajo vencido"],
  ["corte-listo", "Corte listo"], ["corte-pagado", "Corte pagado"], ["solicitud", "Solicitud para unirse"],
];

export default function ConfiguracionPage() {
  const [prefs, setPrefs] = useState<PreferenciasNotificaciones | null>(null);
  const [prefsGuardadas, setPrefsGuardadas] = useState<PreferenciasNotificaciones | null>(null);
  const [admin, setAdmin] = useState(false);
  const [estado, setEstado] = useState({ texto: "", error: false });
  const [ocupado, setOcupado] = useState(false);
  const [intento, setIntento] = useState(0);
  useCambiosSinGuardar(
    Boolean(prefs && prefsGuardadas) && JSON.stringify(prefs) !== JSON.stringify(prefsGuardadas),
  );
  useEffect(() => {
    let vigente = true;
    Promise.all([api.getYo(), api.getPreferenciasNotificaciones()]).then(([p, datos]) => {
      if (vigente) { setAdmin(p.es_admin); setPrefs(datos); setPrefsGuardadas(datos); }
    }).catch(() => { if (vigente) setEstado({ texto: "No pudimos cargar tus preferencias.", error: true }); });
    return () => { vigente = false; };
  }, [intento]);
  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!prefs || ocupado) return;
    setOcupado(true); setEstado({ texto: "", error: false });
    try {
      const actualizadas = await api.guardarPreferenciasNotificaciones(prefs);
      setPrefs(actualizadas);
      setPrefsGuardadas(actualizadas);
      setEstado({ texto: "Preferencias guardadas.", error: false });
    }
    catch (e) { setEstado({ texto: e instanceof Error ? e.message : "No se pudieron guardar.", error: true }); }
    finally { setOcupado(false); }
  }
  return <div className={`${styles.pagina} ${conf.pagina}`}>
    <CabeceraPagina titulo="Configuración" />
    {!prefs ? (estado.error ? <><p role="alert">{estado.texto}</p><Boton onClick={() => { setEstado({ texto: "", error: false }); setIntento(intento + 1); }}>Reintentar</Boton></> : <Esqueleto filas={5} />) :
      <form id="preferencias-avisos" className={styles.form} onSubmit={guardar}>
        <fieldset className={conf.tarjeta} disabled={ocupado} data-rc-panel>
        <legend>Notificaciones</legend>
        <p className={styles.ayuda}>Las menciones siempre llegan. El horario de silencio solo aplaza los avisos al dispositivo.</p>
        <Casilla contenedorClassName={conf.opcion} etiqueta="Silenciar chat del equipo" checked={prefs.silenciar_chat} onChange={e => setPrefs({ ...prefs, silenciar_chat: e.target.checked })} />
        </fieldset>
        <fieldset className={conf.tarjeta} disabled={ocupado} data-rc-panel>
          <legend>Tipos de aviso</legend>
          <div className={conf.opciones}>{tipos.filter(([k]) => admin || !["entrega-hecha", "solicitud"].includes(k)).map(([k, texto]) => <Casilla key={k} contenedorClassName={conf.opcion} etiqueta={texto} checked={!prefs.tipos_silenciados.includes(k)} onChange={(e) => setPrefs({ ...prefs, tipos_silenciados: e.target.checked ? prefs.tipos_silenciados.filter((t) => t !== k) : [...prefs.tipos_silenciados, k] })} />)}</div>
        </fieldset>
        <fieldset className={conf.tarjeta} disabled={ocupado} data-rc-panel>
          <legend>Horario de silencio (hora de Bogotá)</legend>
          <div className={conf.horario}><CampoHora etiqueta="Desde" valor={prefs.silencio_desde} onCambio={valor => setPrefs({ ...prefs, silencio_desde: valor })} disabled={ocupado} />
          <CampoHora etiqueta="Hasta" valor={prefs.silencio_hasta} onCambio={valor => setPrefs({ ...prefs, silencio_hasta: valor })} disabled={ocupado} /></div>
          <div><Boton variante="peligro" onClick={() => setPrefs({ ...prefs, silencio_desde: "", silencio_hasta: "" })}>Quitar horario</Boton></div>
        </fieldset>
      </form>}
    <FormularioCelular />
    <AvisosPush />
    {prefs && <footer className={conf.acciones}>
      {estado.texto && <p role={estado.error ? "alert" : "status"}>{estado.texto}</p>}
      <Boton type="submit" variante="guardar" form="preferencias-avisos" cargando={ocupado}>Guardar preferencias</Boton>
    </footer>}
  </div>;
}
