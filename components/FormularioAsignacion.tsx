"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import type { Cliente, Perfil, Pieza, Tarea, TipoTrabajo } from "@/lib/types";
import { Boton } from "@/components/ui/Boton";
import { Campo } from "@/components/ui/Campo";
import { Modal } from "@/components/ui/Modal";
import { SelectorCarpetaTrabajo, type EleccionCarpeta } from "./SelectorCarpetaTrabajo";
import styles from "./FlujoTrabajo.module.css";

export function FormularioAsignacion({ tarea, personaInicial = "", onCerrar, onGuardar }: {
  tarea?: Tarea; personaInicial?: string; onCerrar: () => void; onGuardar: (t: Tarea) => void;
}) {
  const formId = useId();
  const [catalogo, setCatalogo] = useState<{ clientes: Cliente[]; personas: Perfil[]; tipos: TipoTrabajo[]; piezas: Pieza[] } | null>(null);
  const [cliente, setCliente] = useState(String(tarea?.cliente_id ?? ""));
  const [persona, setPersona] = useState(tarea?.asignado_a ?? personaInicial);
  const [tipo, setTipo] = useState(String(tarea?.tipo_id ?? ""));
  const [pieza, setPieza] = useState("");
  const [fecha, setFecha] = useState(tarea?.fecha_limite ?? "");
  const [descripcion, setDescripcion] = useState(tarea?.descripcion ?? tarea?.titulo ?? "");
  const [carpeta, setCarpeta] = useState<EleccionCarpeta>({ id: tarea?.drive_carpeta_id ?? "", nombre: "" });
  const [alta, setAlta] = useState(false);
  const [nombre, setNombre] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [intento, setIntento] = useState(0);
  const [forzar, setForzar] = useState(false);

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
  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (ocupado || !catalogo) return;
    setOcupado(true);
    setError("");
    try {
      if (alta) {
        const nuevo = await api.adminPostCliente(nombre.trim());
        setCatalogo({ ...catalogo, clientes: [...catalogo.clientes, nuevo] });
        setCliente(String(nuevo.id));
        setPieza("");
        setCarpeta({ id: "", nombre: "" });
        setAlta(false);
        setNombre("");
        return;
      }
      const texto = descripcion.trim();
      if ((texto.match(/[\p{L}\p{N}]/gu) ?? []).length < 3) {
        setError("Describe el trabajo con al menos tres letras o números.");
        return;
      }
      const datos = { asignado_a: persona, tipo_id: Number(tipo), fecha_limite: fecha, descripcion: texto, forzar,
        ...(carpeta.nombre.trim() ? { drive_crear: carpeta.nombre.trim() } : carpeta.id && carpeta.id !== tarea?.drive_carpeta_id ? { drive_carpeta_id: carpeta.id } : {}) };
      if (tarea) onGuardar(await api.adminPatchTarea(tarea.id, datos));
      else onGuardar(await api.adminPostTarea({ ...datos, cliente_id: Number(cliente), pieza_id: pieza ? Number(pieza) : null, titulo: [...texto].slice(0, 100).join("") }));
    } catch (e) {
      const fallo = e as { message?: string; codigo?: string };
      setError(fallo.codigo === "rol_no_coincide" ? "La persona no tiene el rol de este trabajo. Si es intencional, confirma para continuar." : fallo.message || "No se pudieron guardar los cambios.");
    } finally { setOcupado(false); }
  }

  return <Modal className={styles.dialogo} titulo={alta ? "Crear cliente" : tarea ? "Editar trabajo" : "Asignar trabajo"}
    onCerrar={() => { if (ocupado) return; if (alta) setAlta(false); else onCerrar(); }}
    accionSecundaria={<Boton variante="secundario" disabled={ocupado} onClick={() => alta ? setAlta(false) : onCerrar()}>{alta ? "Volver al trabajo" : "Cancelar"}</Boton>}
    accionPrimaria={catalogo && <Boton type="submit" form={formId} cargando={ocupado}>{alta ? "Crear y seleccionar" : tarea ? "Guardar cambios" : "Asignar trabajo"}</Boton>}>
    <form id={formId} onSubmit={guardar} className={styles.form}>
      {!catalogo ? <p className={styles.ayuda}>{error ? <Boton variante="secundario" onClick={() => { setError(""); setIntento(intento + 1); }}>Reintentar</Boton> : "Cargando datos…"}</p> : alta ? <>
        <Campo etiqueta="Nombre del cliente" required maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <p className={styles.ayuda}>Tu asignación se conserva. Puedes completar la ficha y vincular Drive desde Clientes.</p>
      </> : <>
        {tarea ? <p className={styles.ayuda}>Cliente: {clienteActual?.nombre ?? "Sin cliente (trabajo anterior)"}</p> : <>
          <Campo como="select" etiqueta="Cliente" required value={cliente} onChange={(e) => { setCliente(e.target.value); setPieza(""); setCarpeta({ id: "", nombre: "" }); }}>
            <option value="">Selecciona un cliente</option>
            {catalogo.clientes.filter((c) => c.activo).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Campo>
          <div><Boton variante="fantasma" onClick={() => { setError(""); setAlta(true); }}>Crear cliente</Boton></div>
        </>}
        <Campo como="select" etiqueta="Persona" required value={persona} onChange={(e) => { setPersona(e.target.value); setForzar(false); }}>
          <option value="">Selecciona a una persona</option>
          {catalogo.personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </Campo>
        <Campo como="select" etiqueta="Tipo de trabajo" required value={tipo} onChange={(e) => { setTipo(e.target.value); setForzar(false); }}>
          <option value="">Selecciona un tipo</option>
          {catalogo.tipos.filter((t) => t.activo || t.id === tarea?.tipo_id).map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </Campo>
        <Campo type="date" etiqueta="Fecha de entrega" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
        <SelectorCarpetaTrabajo key={cliente} padre={clienteActual?.drive_carpeta_id ?? ""} actual={tarea?.drive_carpeta_id} valor={carpeta} onChange={setCarpeta} />
        <Campo como="textarea" filas={3} etiqueta="Descripción" required maxLength={1000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        {!tarea && catalogo.piezas.some((p) => String(p.cliente_id) === cliente) && <Campo como="select" etiqueta="Pieza (opcional)" value={pieza} onChange={(e) => setPieza(e.target.value)}>
          <option value="">Sin pieza</option>
          {catalogo.piezas.filter((p) => String(p.cliente_id) === cliente).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </Campo>}
        {!!catalogo.tipos.find((t) => String(t.id) === tipo)?.rol_id && !!persona &&
          !catalogo.personas.find((p) => p.id === persona)?.roles?.some((r) => r.id === catalogo.tipos.find((t) => String(t.id) === tipo)?.rol_id) &&
          <label><input type="checkbox" checked={forzar} onChange={(e) => setForzar(e.target.checked)} /> Asignar aunque el rol no coincida</label>}
      </>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </form>
  </Modal>;
}
