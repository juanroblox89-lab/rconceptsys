"use client";

import { Casilla } from "@/components/ui/Casilla";
import { CampoFecha } from "@/components/ui/CamposEspeciales";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import type { Cliente, Perfil, Pieza, ReferenciaDriveTrabajo, Tarea, TipoTrabajo } from "@/lib/types";
import { Boton } from "@/components/ui/Boton";
import { Campo } from "@/components/ui/Campo";
import { SelectorCarpetaTrabajo } from "./SelectorCarpetaTrabajo";
import { AdjuntosGuardados, EditorAdjuntos } from "./AdjuntosAsignacion";
import { adjuntos, subirAdjunto, type AdjuntoLocal } from "@/lib/adjuntos-asignacion";
import { MAX_REFERENCIAS_TRABAJO, referenciaDelCliente, referenciasDelTrabajo } from "@/lib/referencias-trabajo";
import { resolverReferenciaDriveSeleccionada } from "./PickerDriveCliente";
import { useCambiosSinGuardar } from "./CambiosSinGuardar";
import styles from "./FlujoTrabajo.module.css";

export function FormularioAsignacion({ tarea, personaInicial = "", onCerrar, onGuardar }: {
  tarea?: Tarea; personaInicial?: string; onCerrar: () => void; onGuardar: (t: Tarea) => void;
}) {
  const [catalogo, setCatalogo] = useState<{ clientes: Cliente[]; personas: Perfil[]; tipos: TipoTrabajo[]; piezas: Pieza[] } | null>(null);
  const [cliente, setCliente] = useState(String(tarea?.cliente_id ?? ""));
  const [persona, setPersona] = useState(tarea?.asignado_a ?? personaInicial);
  const [tipo, setTipo] = useState(String(tarea?.tipo_id ?? ""));
  const [pieza, setPieza] = useState("");
  const [fecha, setFecha] = useState(tarea?.fecha_limite ?? "");
  const [descripcion, setDescripcion] = useState(tarea?.descripcion ?? tarea?.titulo ?? "");
  const [referencias, setReferencias] = useState<ReferenciaDriveTrabajo[]>(() => tarea ? referenciasDelTrabajo(tarea) : []);
  const [indiceAutomatico, setIndiceAutomatico] = useState<number | null>(null);
  const [referenciasEditadas, setReferenciasEditadas] = useState(false);
  const [alta, setAlta] = useState(false);
  const [nombre, setNombre] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [intento, setIntento] = useState(0);
  const [forzar, setForzar] = useState(false);
  const [locales, setLocales] = useState<AdjuntoLocal[]>([]);
  const [guardados, setGuardados] = useState(0);
  const [versionAdjuntos, setVersionAdjuntos] = useState(0);
  const [trabajoCreado, setTrabajoCreado] = useState<Tarea>();
  const [grabando, setGrabando] = useState(false);
  const solicitudRefCliente = useRef(0);
  const vigenteRef = useRef(true);
  const trabajoActual = trabajoCreado ?? tarea;

  useEffect(() => {
    vigenteRef.current = true;
    return () => { vigenteRef.current = false; };
  }, []);

  const baseSucio = Boolean(catalogo) && (trabajoActual
    ? persona !== trabajoActual.asignado_a ||
      tipo !== String(trabajoActual.tipo_id) ||
      fecha !== (trabajoActual.fecha_limite ?? "") ||
      descripcion !== (trabajoActual.descripcion ?? trabajoActual.titulo ?? "") ||
      forzar ||
      referenciasEditadas ||
      locales.length > 0 ||
      grabando
    : cliente !== "" ||
      persona !== personaInicial ||
      tipo !== "" ||
      pieza !== "" ||
      fecha !== "" ||
      descripcion !== "" ||
      forzar ||
      referenciasEditadas ||
      locales.length > 0 ||
      grabando);

  const sucio = Boolean(catalogo) && (alta ? nombre.trim().length > 0 || baseSucio : baseSucio);
  const { confirmarSalida, limpiarRegistro } = useCambiosSinGuardar(sucio);

  async function quitarLocal(a: AdjuntoLocal) {
    if (ocupado) return;
    setOcupado(true); setError("");
    try {
      if (trabajoActual && a.avance !== undefined) {
        try { await adjuntos.quitar(trabajoActual.id, a.id); }
        catch (e) { if ((e as { status?: number }).status !== 404) throw e; }
      }
      setLocales(lista => lista.filter(v => v.id !== a.id));
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo quitar el archivo."); }
    finally { setOcupado(false); }
  }

  useEffect(() => {
    let vigente = true;
    Promise.all([api.adminGetClientes(), api.adminGetMiembros("aprobado"), api.adminGetTrabajos(), api.adminGetPiezas().catch(() => [])])
      .then(([clientes, personas, tipos, piezas]) => {
        if (vigente) setCatalogo({ clientes: clientes ?? [], personas: (personas ?? []).filter((p) => !p.es_admin), tipos: tipos ?? [], piezas: piezas ?? [] });
      })
      .catch(() => { if (vigente) setError("No pudimos cargar los datos de asignación."); });
    return () => { vigente = false; };
  }, [intento]);

  const clienteActual = catalogo?.clientes.find((c) => String(c.id) === cliente) ?? tarea?.cliente;
  function elegirCliente(nuevo?: Cliente) {
    const automatica = referenciaDelCliente(nuevo);
    const personalizadas = referencias.filter((_, i) => i !== indiceAutomatico);
    const agregar = automatica && !personalizadas.some(ref => ref.id === automatica.id);
    if (agregar && personalizadas.length >= MAX_REFERENCIAS_TRABAJO) {
      setError("Quita una referencia para cambiar a un cliente con carpeta de Drive.");
      return false;
    }
    setError("");
    const nuevoClienteId = nuevo ? String(nuevo.id) : "";
    setCliente(nuevoClienteId);
    setPieza("");
    setReferencias(agregar ? [automatica, ...personalizadas] : personalizadas);
    setIndiceAutomatico(agregar ? 0 : null);
    const ticket = ++solicitudRefCliente.current;
    if (agregar && automatica) {
      void resolverReferenciaDriveSeleccionada(automatica).then((resuelta) => {
        if (!vigenteRef.current || solicitudRefCliente.current !== ticket) return;
        if (resuelta.nombre === automatica.nombre && !resuelta.ruta) return;
        setReferencias((actuales) =>
          actuales.map((r) =>
            r.id === automatica.id
              ? {
                  ...r,
                  nombre: resuelta.nombre,
                  url: resuelta.url,
                  tipo: resuelta.tipo,
                  ...(resuelta.ruta ? { ruta: resuelta.ruta } : {}),
                }
              : r,
          ),
        );
      });
    }
    return true;
  }

  function cambiarReferencias(lista: ReferenciaDriveTrabajo[], indice?: number) {
    if (indice !== undefined && indiceAutomatico !== null) {
      if (indice === indiceAutomatico) setIndiceAutomatico(null);
      else if (lista.length < referencias.length && indice < indiceAutomatico) setIndiceAutomatico(indiceAutomatico - 1);
    }
    setReferencias(lista);
    setReferenciasEditadas(true);
  }

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (ocupado || grabando || !catalogo) return;
    setOcupado(true);
    setError("");
    try {
      if (alta) {
        const nuevo = await api.adminPostCliente(nombre.trim());
        setCatalogo({ ...catalogo, clientes: [...catalogo.clientes, nuevo] });
        const elegido = elegirCliente(nuevo);
        setAlta(false);
        if (!elegido) return;
        setNombre("");
        return;
      }
      if (!persona || !tipo) { setError("Elige una persona y un tipo de trabajo."); return; }
      const texto = descripcion.trim();
      if ((texto.match(/[\p{L}\p{N}]/gu) ?? []).length < 3) {
        setError("Escribe las especificaciones con al menos tres letras o números.");
        return;
      }
      const datos = { asignado_a: persona, tipo_id: Number(tipo), fecha_limite: fecha, descripcion: texto, forzar,
        ...(!tarea || referenciasEditadas ? { drive_referencias: referencias } : {}) };
      const esCreacion = !trabajoActual;
      let actual: Tarea;
      if (trabajoActual) {
        const { asignado_a, tipo_id, fecha_limite, descripcion, ...otros } = datos;
        const cambios = { ...otros,
          ...(trabajoActual.asignado_a !== asignado_a ? { asignado_a } : {}),
          ...(trabajoActual.tipo_id !== tipo_id ? { tipo_id } : {}),
          ...((trabajoActual.fecha_limite ?? "") !== fecha_limite ? { fecha_limite } : {}),
          ...(trabajoActual.descripcion !== descripcion ? { descripcion } : {}),
        };
        actual = await api.adminPatchTarea(trabajoActual.id, cambios);
      } else {
        actual = await api.adminPostTarea({ ...datos, cliente_id: cliente ? Number(cliente) : null, pieza_id: pieza ? Number(pieza) : null, titulo: [...texto].slice(0, 100).join("") });
      }
      if (!tarea) setTrabajoCreado(actual);
      let fallos = 0;
      for (const a of locales) {
        const ajustar = (campos: Partial<AdjuntoLocal>) => setLocales(lista => lista.map(v => v.id === a.id ? { ...v, ...campos } : v));
        ajustar({ avance: 0, error: undefined });
        try {
          await subirAdjunto(actual.id, a, avance => ajustar({ avance }), esCreacion ? { inicial: true } : undefined);
          setLocales(lista => lista.filter(v => v.id !== a.id));
        } catch (e) {
          fallos++;
          ajustar({ error: e instanceof Error ? e.message : "No se pudo subir este archivo." });
        }
      }
      setVersionAdjuntos(v => v + 1);
      if (fallos) { setError("El trabajo quedó guardado. Reintenta los archivos pendientes o quítalos."); return; }
      setReferenciasEditadas(false);
      setForzar(false);
      setLocales([]);
      limpiarRegistro();
      onGuardar(actual);
    } catch (e) {
      const fallo = e as { message?: string; codigo?: string };
      setError(fallo.codigo === "rol_no_coincide" ? "La persona no tiene el rol de este trabajo. Marca «Asignar aunque el rol no coincida»." : fallo.message || "No se pudieron guardar los cambios.");
    } finally { setOcupado(false); }
  }

  return <form onSubmit={guardar} className={styles.form}>
      {!catalogo ? <p className={styles.ayuda}>{error ? <Boton variante="secundario" onClick={() => { setError(""); setIntento(intento + 1); }}>Reintentar</Boton> : "Cargando datos…"}</p> : alta ? <>
        <Campo etiqueta="Nombre del cliente" required maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <p className={styles.ayuda}>Tu asignación no se perderá.</p>
      </> : <>
        {tarea ? <p className={styles.ayuda}>Cliente: {clienteActual?.nombre ?? "Sin cliente"}</p> : <>
          <Campo como="select" etiqueta="Cliente" value={cliente} onChange={(e) => elegirCliente(catalogo.clientes.find(c => String(c.id) === e.target.value))}>
            <option value="">Sin cliente</option>
            {catalogo.clientes.filter((c) => c.activo).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Campo>
          <div><Boton variante="fantasma" onClick={() => { setError(""); setAlta(true); }}>Crear cliente</Boton></div>
        </>}
        <Campo como="select" etiqueta="Persona" required value={persona} onChange={(e) => { setPersona(e.target.value); setForzar(false); }}>
          <option value="">Selecciona a una persona</option>
          {tarea && !catalogo.personas.some(p => p.id === tarea.asignado_a) && <option value={tarea.asignado_a}>{tarea.asignado?.nombre ?? "Asignación anterior"}</option>}
          {catalogo.personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </Campo>
        <Campo como="select" etiqueta="Tipo de trabajo" required value={tipo} onChange={(e) => { setTipo(e.target.value); setForzar(false); }}>
          <option value="">Selecciona un tipo</option>
          {catalogo.tipos.filter((t) => t.activo || t.id === tarea?.tipo_id).map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </Campo>
        <CampoFecha etiqueta="Fecha de entrega" requerido={!tarea || !!tarea.fecha_limite} valor={fecha} onCambio={setFecha} />
        <SelectorCarpetaTrabajo key={cliente} clienteId={clienteActual?.id} valor={referencias} onChange={cambiarReferencias} deshabilitado={ocupado} />
        <Campo como="textarea" filas={5} etiqueta="Especificaciones" placeholder="En este video, coge los medios de..." required maxLength={1000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        <EditorAdjuntos locales={locales} cambiar={setLocales} quitar={a => void quitarLocal(a)} cantidad={guardados + locales.length} bloqueado={ocupado} onGrabando={setGrabando} />
        {trabajoActual && <AdjuntosGuardados key={`${trabajoActual.id}-${versionAdjuntos}`} tarea={trabajoActual.id} editable bloqueado={ocupado || grabando} cantidad={setGuardados} />}
        {!trabajoActual && catalogo.piezas.some((p) => String(p.cliente_id) === cliente) && <Campo como="select" etiqueta="Pieza (opcional)" value={pieza} onChange={(e) => setPieza(e.target.value)}>
          <option value="">Sin pieza</option>
          {catalogo.piezas.filter((p) => String(p.cliente_id) === cliente).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </Campo>}
        {!!catalogo.tipos.find((t) => String(t.id) === tipo)?.rol_id && !!persona &&
          !catalogo.personas.find((p) => p.id === persona)?.roles?.some((r) => r.id === catalogo.tipos.find((t) => String(t.id) === tipo)?.rol_id) &&
          <Casilla etiqueta="Asignar aunque el rol no coincida" checked={forzar} onChange={(e) => setForzar(e.target.checked)} />}
      </>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {catalogo && <div className={styles.accionesFormulario}>
      <Boton variante="secundario" disabled={ocupado || grabando} onClick={() => {
        if (alta) setAlta(false);
        else if (trabajoCreado) { limpiarRegistro(); onGuardar(trabajoCreado); }
        else confirmarSalida(onCerrar);
      }}>{alta ? "Volver al trabajo" : trabajoCreado ? "Ver trabajo guardado" : "Volver sin guardar"}</Boton>
      <Boton type="submit" variante={!alta && trabajoActual ? "guardar" : "primario"} disabled={grabando} cargando={ocupado}>{alta ? "Crear y seleccionar" : trabajoActual ? "Guardar cambios" : "Asignar trabajo"}</Boton>
    </div>}
  </form>;
}
