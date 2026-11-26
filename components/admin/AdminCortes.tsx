"use client";

import { CampoFecha } from "@/components/ui/CamposEspeciales";
import { useCallback, useEffect, useState } from "react";
import { Check, Download, FileText, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import Link from "next/link";
import { Corte } from "@/lib/types";
import { useAviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/Boton";
import { useCambiosSinGuardar } from "@/components/CambiosSinGuardar";
import styles from "./admin-paneles.module.css";

function fmtCOP(valor: number): string {
  return `$${new Intl.NumberFormat("es-CO").format(Math.round(valor))}`;
}

function fmtFecha(iso: string): string {
  const fecha = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  return fecha.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

// Gestión → Cortes: cerrar quincena o mes, total por persona sobre lo aprobado,
// marcar pagado y exportar PDF/CSV.
export function AdminCortes() {
  const { mostrarAviso } = useAviso();
  const [cortes, setCortes] = useState<Corte[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(false);
  const [creando, setCreando] = useState<"quincena" | "mes" | null>(null);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [desdeManual, setDesdeManual] = useState("");
  const [hastaManual, setHastaManual] = useState("");

  useCambiosSinGuardar(Boolean(desdeManual || hastaManual));

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(false);
    try {
      const lista = await api.adminGetCortes();
      setCortes(lista);
      setAbierto((prev) => lista.some((c) => c.id === prev) ? prev : (lista[0]?.id ?? null));
    } catch {
      setErrorCarga(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  const cerrar = async (periodo: "quincena" | "mes") => {
    setCreando(periodo);
    try {
      const nuevo = await api.adminPostCorte({ periodo });
      setCortes((prev) => [nuevo, ...prev]);
      setAbierto(nuevo.id);
      mostrarAviso({
        tipo: "exito",
        titulo: "Corte cerrado",
        texto: `${nuevo.lineas.length} ${nuevo.lineas.length === 1 ? "persona" : "personas"} · ${fmtCOP(nuevo.total)}`,
      });
    } catch (err) {
      mostrarAviso({
        tipo: "error",
        titulo: "No se pudo cerrar",
        texto: err instanceof Error ? err.message : "Inténtalo de nuevo.",
      });
    } finally {
      setCreando(null);
    }
  };

  const cerrarManual = async () => {
    if (!desdeManual || !hastaManual) return;
    setCreando("mes");
    try {
      const nuevo = await api.adminPostCorte({ desde: desdeManual, hasta: hastaManual });
      setCortes((prev) => [nuevo, ...prev]);
      setAbierto(nuevo.id);
      setDesdeManual("");
      setHastaManual("");
      mostrarAviso({ tipo: "exito", titulo: "Corte cerrado", texto: `${fmtCOP(nuevo.total)} en total.` });
    } catch (err) {
      mostrarAviso({
        tipo: "error",
        titulo: "No se pudo cerrar",
        texto: err instanceof Error ? err.message : "Revisa las fechas.",
      });
    } finally {
      setCreando(null);
    }
  };

  const pagarLinea = async (corteID: number, perfilID: string, nombre: string) => {
    try {
      const actualizado = await api.adminPagarCorteLinea(corteID, perfilID);
      setCortes((prev) => prev.map((c) => (c.id === corteID ? actualizado : c)));
      mostrarAviso({ tipo: "exito", titulo: "Marcado como pagado", texto: nombre });
    } catch {
      mostrarAviso({ tipo: "error", titulo: "No se pudo marcar", texto: "Inténtalo de nuevo." });
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.bloqueCabecera}>
        <div>
          <h2 className={styles.bloqueTitulo}>Cortes de pago</h2>
          <p className={styles.bloqueAyuda}>
            Marca el corte como pagado después de transferir.
          </p>
        </div>
        <div className={styles.botonesGrupo}>
          <Link className="rc-btn rc-btn--secundario" href="/admin?pestana=facturas">Ver facturas abiertas</Link>
          <Boton variante="primario" onClick={() => cerrar("quincena")} cargando={creando === "quincena"} disabled={creando !== null}>
            Cerrar quincena
          </Boton>
          <Boton variante="secundario" onClick={() => cerrar("mes")} cargando={creando === "mes"} disabled={creando !== null}>
            Cerrar mes
          </Boton>
        </div>
      </div>

      <section className={styles.bloque}>
        <h3 className={styles.bloqueSubtitulo}>Rango a la medida</h3>
        <div className={styles.filaCampos}>
          <div className={styles.campo}><CampoFecha etiqueta="Desde" valor={desdeManual} onCambio={setDesdeManual} /></div>
          <div className={styles.campo}><CampoFecha etiqueta="Hasta" valor={hastaManual} onCambio={setHastaManual} /></div>
          <Boton
            variante="secundario"
            onClick={cerrarManual}
            disabled={!desdeManual || !hastaManual || creando !== null}
            cargando={creando === "mes"}
          >
            Cerrar rango
          </Boton>
        </div>
      </section>

      {cargando ? (
        <p className={styles.cargando}>Cargando cortes…</p>
      ) : errorCarga ? (
        <div className={styles.bloque} role="alert">
          <p>No se pudieron cargar los cortes.</p>
          <Boton variante="secundario" tamano="sm" onClick={() => void cargar()}>Reintentar</Boton>
        </div>
      ) : cortes.length === 0 ? (
        <p className={styles.vacio}>
          Sin cortes.
        </p>
      ) : (
        <ul className={styles.cortes}>
          {cortes.map((corte) => {
            const pagado = corte.lineas.filter((l) => l.pagada_en).length;
            const expandido = abierto === corte.id;
            return (
              <li key={corte.id} className={styles.corte}>
                <button
                  type="button"
                  className={styles.corteCabecera}
                  onClick={() => setAbierto(expandido ? null : corte.id)}
                  aria-expanded={expandido}
                >
                  <span className={styles.corteTitulo}>
                    {corte.periodo === "quincena" ? "Quincena" : corte.periodo === "mes" ? "Mes" : "Rango"}
                    <em className={styles.corteRango}>
                      {fmtFecha(corte.desde)} → {fmtFecha(corte.hasta)}
                    </em>
                  </span>
                  <span className={styles.corteTotal}>
                    <Wallet size={13} strokeWidth={1.75} aria-hidden="true" />
                    {fmtCOP(corte.total)}
                  </span>
                  <span className={styles.cortePagado}>
                    {pagado} de {corte.lineas.length} pagadas
                  </span>
                </button>

                {expandido && (
                  <div className={styles.corteCuerpo}>
                    <div className={styles.corteExportar}>
                      <a href={api.urlCorteCSV(corte.id)} className={styles.exportar} download>
                        <Download size={13} strokeWidth={1.9} aria-hidden="true" />
                        CSV
                      </a>
                      <a href={api.urlCortePDF(corte.id)} className={styles.exportar} download>
                        <FileText size={13} strokeWidth={1.9} aria-hidden="true" />
                        PDF
                      </a>
                    </div>

                    <ul className={styles.lineas}>
                      {corte.lineas.map((linea) => (
                        <li key={linea.perfil_id} className={styles.linea}>
                          <div className={styles.lineaDatos}>
                            <span className={styles.lineaNombre}>{linea.perfil?.nombre ?? "Sin perfil"}</span>
                            <span className={styles.lineaMeta}>
                              {linea.tareas} {linea.tareas === 1 ? "tarea" : "tareas"}
                              {linea.perfil?.roles && linea.perfil.roles.length > 0
                                ? ` · ${linea.perfil.roles.map((r) => r.nombre).join(" y ")}`
                                : ""}
                            </span>
                          </div>
                          <span className={styles.lineaTotal}>{fmtCOP(linea.total)}</span>
                          {linea.pagada_en ? (
                            <span className={styles.lineaPagada}>
                              <Check size={12} strokeWidth={2.5} aria-hidden="true" />
                              Pagado
                            </span>
                          ) : (
                            <Boton
                              variante="secundario"
                              tamano="sm"
                              onClick={() => pagarLinea(corte.id, linea.perfil_id, linea.perfil?.nombre ?? "")}
                            >
                              Marcar pagado
                            </Boton>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
