"use client";

import { useId, useRef } from "react";
import { CalendarDays } from "lucide-react";
import { Selector } from "./Selector";
import styles from "./controles.module.css";

export function CampoFecha({ etiqueta, id, valor, onCambio, requerido, disabled }: { etiqueta: string; id?: string; valor: string; onCambio: (v: string) => void; requerido?: boolean; disabled?: boolean }) {
  const generado = useId();
  const ref = useRef<HTMLInputElement>(null);
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(valor) ? new Date(`${valor}T12:00:00Z`) : null;
  const texto = fecha && !Number.isNaN(fecha.getTime()) ? new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).formatToParts(fecha).filter(p => p.type !== 'literal').map(p => p.value.replace(/\.$/, '')).join(' ') : 'Elegir fecha';
  return <span className={styles.fecha}>
    <span className={styles.etiqueta} aria-hidden="true">{etiqueta}</span>
    <span className={styles.control}><CalendarDays size={15} aria-hidden="true" /><span aria-hidden="true">{texto}</span>
      <input ref={ref} id={id ?? generado} aria-label={etiqueta} className={styles.fechaNativa} type="date" required={requerido} disabled={disabled} value={valor} onChange={e => onCambio(e.target.value)} onClick={() => { try { ref.current?.showPicker?.(); } catch { /* el navegador conserva su calendario */ } }} />
    </span>
  </span>;
}

const serie = (n: number) => Array.from({ length: n }, (_, i) => String(i).padStart(2, '0')).map(valor => ({ valor, etiqueta: valor }));
const horas = [{ valor: '', etiqueta: 'Hora' }, ...serie(24)];
const minutos = serie(60);
export function CampoHora({ etiqueta, valor, onCambio, disabled }: { etiqueta: string; valor: string; onCambio: (v: string) => void; disabled?: boolean }) {
  const [hh = '', mm = '00'] = valor.split(':');
  return <div className={styles.hora} role="group" aria-label={etiqueta}><span className={styles.etiqueta}>{etiqueta}</span>
    <div className={styles.horaCampos}><Selector etiqueta={`${etiqueta}: hora`} valor={hh} opciones={horas} disabled={disabled} onCambio={h => onCambio(h ? `${h}:${mm}` : '')} />
    <span aria-hidden="true">:</span><Selector etiqueta={`${etiqueta}: minutos`} valor={mm} opciones={minutos} disabled={disabled || !hh} onCambio={m => onCambio(`${hh}:${m}`)} /></div>
  </div>;
}

const moneda = (valor: number) => String(valor).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export function CampoCOP({ etiqueta, valor, onCambio, onBlur, disabled }: { etiqueta: string; valor: number; onCambio: (n: number) => void; onBlur?: () => void; disabled?: boolean }) {
  return <span className={`${styles.control} ${styles.moneda}`}><span aria-hidden="true">$</span>
    <input aria-label={etiqueta} type="text" inputMode="numeric" value={moneda(valor)} disabled={disabled} onBlur={onBlur}
      onChange={e => onCambio(Math.min(100000000, Number(e.target.value.replace(/\D/g, '')) || 0))} /><span aria-hidden="true">COP</span>
  </span>;
}
