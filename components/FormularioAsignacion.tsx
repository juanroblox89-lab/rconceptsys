"use client";

import { Casilla } from "@/components/ui/Casilla";
import { CampoFecha } from "@/components/ui/CamposEspeciales";
import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
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
import { MAX_CARACTERES_GUION, cambiosDeGuion, medirGuion, normalizarGuion } from "@/lib/guion-trabajo";
import styles from "./FlujoTrabajo.module.css";

const formatoGuion = new Intl.NumberFormat("es-CO", { useGrouping: "always" });
const limiteGuion = formatoGuion.format(MAX_CARACTERES_GUION);

function ajustarAlturaGuion(campo: HTMLTextAreaElement) {
  if (CSS.supports("field-sizing", "content")) return;
  campo.style.height = "0px";
  const borde = campo.offsetHeight - campo.clientHeight;
  campo.style.height = `${campo.scrollHeight + borde}px`;
}

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
  const [guion, setGuion] = useState(tarea?.guion ?? "");
  const [guionAbierto, setGuionAbierto] = useState(() => Boolean(normalizarGuion(tarea?.guion)));
  const guionId = useId();
  const campoGuion = useRef<HTMLTextAreaElement>(null);
  const cantidadGuion = medirGuion(normalizarGuion(guion));
  const errorGuion = cantidadGuion > MAX_CARACTERES_GUION
    ? `El guion no puede superar los ${limiteGuion} caracteres.`
    : guion.includes("\0") ? "El guion contiene un carácter no válido. Pégalo como texto plano." : "";
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
  const [trabajoGuardado, setTrabajoGuardado] = useState<Tarea>();
  const [grabando, setGrabando] = useState(false);
  const solicitudRefCliente = useRef(0);
  const vigenteRef = useRef(true);
  const trabajoActual = trabajoGuardado ?? tarea;
  const trabajoCreado = !tarea ? trabajoGuardado : undefined;
  const cambioGuion = cambiosDeGuion(guion, trabajoActual?.guion);

  useLayoutEffect(() => {
    if (!campoGuion.current || CSS.supports("field-sizing", "content")) return;
    ajustarAlturaGuion(campoGuion.current);
  }, [guion, guionAbierto, alta, catalogo]);

  useEffect(() => {
    if (CSS.supports("field-sizing", "content")) return;
    const redimensionar = () => { if (campoGuion.current) ajustarAlturaGuion(campoGuion.current); };
    window.addEventListener("resize", redimensionar);
    return () => window.removeEventListener("resize", redimensionar);
  }, []);

  useEffect(() => {
    vigenteRef.current = true;
    return () => { vigenteRef.current = false; };
  }, []);

  const baseSucio = Boolean(catalogo) && (trabajoActual
    ? persona !== trabajoActual.asignado_a ||
      tipo !== String(trabajoActual.tipo_id) ||
      fecha !== (trabajoActual.fecha_limite ?? "") ||
      descripcion.trim() !== (trabajoActual.descripcion ?? trabajoActual.titulo).trim() ||
      cambioGuion.guion !== undefined ||
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
      cambioGuion.guion !== undefined ||
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
      if (errorGuion) {
        setGuionAbierto(true);
        requestAnimationFrame(() => campoGuion.current?.focus());
        return;
      }
      if (!persona || !tipo) { setError("Elige una persona y un tipo de trabajo."); return; }
      const texto = descripcion.trim();
      if ((texto.match(/[\p{L}\p{N}]/gu) ?? []).length < 3) {
        setError("Escribe las especificaciones con al menos tres letras o números.");
        return;
      }
      const datos = { asignado_a: persona, tipo_id: Number(tipo), fecha_limite: fecha, descripcion: texto, ...cambioGuion };
      const esCreacion = !trabajoActual;
      let actual: Tarea;
      if (trabajoActual) {
        const { asignado_a, tipo_id, fecha_limite, descripcion } = datos;
        const cambios = {
          ...(referenciasEditadas ? { drive_referencias: referencias } : {}),
          ...(trabajoActual.asignado_a !== asignado_a ? { asignado_a } : {}),
          ...(trabajoActual.tipo_id !== tipo_id ? { tipo_id } : {}),
          ...((trabajoActual.fecha_limite ?? "") !== fecha_limite ? { fecha_limite } : {}),
          ...((trabajoActual.descripcion ?? trabajoActual.titulo).trim() !== descripcion ? { descripcion } : {}),
          ...cambioGuion,
        };
        actual = Object.keys(cambios).length
          ? await api.adminPatchTarea(trabajoActual.id, { ...cambios, forzar })
          : trabajoActual;
      } else {
        actual = await api.adminPostTarea({ ...datos, forzar, drive_referencias: referencias, cliente_id: cliente ? Number(cliente) : null, pieza_id: pieza ? Number(pieza) : null, titulo: [...texto].slice(0, 100).join("") });
      }
      // Los adjuntos se guardan aparte. Si fallan, reintentar contra la versión persistida.
      setTrabajoGuardado(actual);
      setReferenciasEditadas(false);
      setForzar(false);
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
      setLocales([]);
      if (tarea) setTrabajoGuardado(undefined);
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
        {trabajoActual ? <p className={styles.ayuda}>Cliente: {clienteActual?.nombre ?? "Sin cliente"}</p> : <>
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
        <div className={styles.guionEditor}>
          <Boton variante="secundario" tamano="sm" className={styles.guionAccion} aria-expanded={guionAbierto}
            aria-controls={`${guionId}-editor`} onClick={() => setGuionAbierto(!guionAbierto)}>
            {guionAbierto ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
            {guionAbierto ? "Ocultar guion" : guion ? "Mostrar guion" : "Agregar guion (opcional)"}
          </Boton>
          <div id={`${guionId}-editor`} hidden={!guionAbierto}>
            {guionAbierto && <>
              <Campo id={guionId} ref={campoGuion} como="textarea" filas={6} etiqueta="Guion" className={styles.guionCampo}
                placeholder="Escenas, locución o textos en pantalla…" value={guion} readOnly={ocupado}
                onChange={e => setGuion(e.target.value)} error={errorGuion}
                aria-describedby={`${guionId}-contador${errorGuion ? ` ${guionId}-error` : ""}`} />
              <p id={`${guionId}-contador`} className={styles.guionContador} data-testid="guion-contador">
                {formatoGuion.format(cantidadGuion)} de {limiteGuion} caracteres
              </p>
            </>}
          </div>
        </div>
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
        else confirmarSalida(() => {
          if (trabajoCreado) onGuardar(trabajoCreado);
          else onCerrar();
        });
      }}>{alta ? "Volver al trabajo" : trabajoCreado ? "Ver trabajo guardado" : "Volver sin guardar"}</Boton>
      <Boton type="submit" variante={!alta && trabajoActual ? "guardar" : "primario"} disabled={grabando} cargando={ocupado}>{alta ? "Crear y seleccionar" : trabajoActual ? "Guardar cambios" : "Asignar trabajo"}</Boton>
    </div>}
  </form>;
}
