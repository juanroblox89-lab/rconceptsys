"use client";

import { Casilla } from "@/components/ui/Casilla";
import { Selector, opcionesSelector } from "@/components/ui/Selector";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, ImagePlus, Monitor, Moon, Sun, Trash2 } from "lucide-react";
import { aparienciaInicial, aplicarApariencia, preferenciasApariencia, primerFotograma, type Apariencia } from "@/lib/apariencia";
import { Boton } from "@/components/ui/Boton";
import styles from "./personalizacion.module.css";

const modos = [{ id: 'sistema', nombre: 'Sistema', Icon: Monitor }, { id: 'claro', nombre: 'Claro', Icon: Sun }, { id: 'oscuro', nombre: 'Oscuro', Icon: Moon }] as const;
const temas = [{ id: 'rconcept', nombre: 'RConcept' }, { id: 'rconcept-dark', nombre: 'RConcept Dark' }, { id: 'glass', nombre: 'Glass' }] as const;
const colores = [{ id: 'fondo', nombre: 'Fondo' }, { id: 'texto', nombre: 'Texto' }, { id: 'acento', nombre: 'Acento' }] as const;
type Color = typeof colores[number]['id'];
const hex = /^#[0-9a-f]{6}$/i;
const paletas = {
  fondo: ['#eff5ff','#e6edf7','#dbe6f2','#e5e2f2','#d8e7e9','#182639','#213347','#232d40','#28243a'],
  texto: ['#151e32','#29394f','#243d4b','#433750','#263f38','#f2f6ff','#d3dbea','#e7deff','#c7ece7'],
  acento: ['#175bb4','#235d91','#4059a8','#673da0','#166863','#a2ceff','#acc0ff','#d1b6ff','#9cdbd1'],
};
const tipos = 'image/png,image/jpeg,image/webp,video/mp4,video/webm';
const peso = (n: number) => n < 1024 ? `${n} B` : `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(n / (n < 1048576 ? 1024 : 1048576))} ${n < 1048576 ? 'kB' : 'MB'}`;

export default function Personalizacion() {
  const [v, setV] = useState(aparienciaInicial);
  const [color, setColor] = useState<Color>('acento');
  const [listo, setListo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [estado, setEstado] = useState('');
  const [error, setError] = useState('');
  const [pesoAnterior, setPesoAnterior] = useState<{ archivo: string; bytes: number }>();
  const archivoInput = useRef<HTMLInputElement>(null);
  const archivo = v.video || v.imagen;
  const invalido = (id: Color) => Boolean(v[id] && !hex.test(v[id]!));
  const errorHex = colores.some(({ id }) => invalido(id));
  const cambiar = (parcial: Partial<Apariencia>) => {
    const p = { ...v, ...parcial };
    setV(p); aplicarApariencia(p); setEstado(''); setError('');
  };
  useEffect(() => {
    let activo = true;
    preferenciasApariencia().then(p => { if (activo) { setV(p); setListo(true); } }).catch((e: Error) => { if (activo) setError(e.message); });
    return () => { activo = false; };
  }, []);
  useEffect(() => () => {
    try { const p = localStorage.getItem('rc-apariencia'); aplicarApariencia(p ? JSON.parse(p) : aparienciaInicial); } catch { /* solo vista previa */ }
  }, []);
  useEffect(() => {
    if (!archivo || v.fondo_bytes) return;
    const control = new AbortController();
    fetch(`/api/yo/apariencia/fondo/${encodeURIComponent(archivo)}`, { method: 'HEAD', signal: control.signal, cache: 'no-store' })
      .then(r => { const n = Number(r.headers.get('Content-Length')); if (r.ok && n > 0) setPesoAnterior({ archivo, bytes: n }); }).catch(() => {});
    return () => control.abort();
  }, [archivo, v.fondo_bytes]);
  const tarea = async (f: () => Promise<void>) => {
    if (ocupado || !listo) return;
    setOcupado(true); setEstado(''); setError('');
    try { await f(); } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos guardar la apariencia.'); }
    finally { setOcupado(false); }
  };
  const guardar = () => tarea(async () => {
    const p = await preferenciasApariencia('PUT', v);
    setV(p); aplicarApariencia(p, true); setEstado('Apariencia guardada.');
  });
  const subir = (f: File) => tarea(async () => {
    if (f.size > 2500000) throw new Error('El fondo no debe superar 2,5 MB.');
    if (!tipos.split(',').includes(f.type)) throw new Error('Elige una imagen PNG, JPEG o WebP, o un video MP4 o WebM.');
    const datos = new FormData(); datos.append('fondo', f);
    if (f.type.startsWith('video/')) datos.append('fotograma', await primerFotograma(f), 'fotograma.jpg');
    const p = await preferenciasApariencia('POST', datos);
    aplicarApariencia(p, true);
    cambiar({ imagen: p.imagen, video: p.video, fondo_nombre: p.fondo_nombre, fondo_bytes: p.fondo_bytes });
    setEstado('Fondo guardado.');
  });
  const temaBase = { fondo: 'light-dark(#eceef3,#171c25)', texto: 'light-dark(#1f2430,#eef1f8)', acento: 'light-dark(#2166ba,#89bfff)' };
  const valorColor = (id: Color) => hex.test(v[id] ?? '') ? v[id] : v.tema === 'glass'
    ? { fondo: 'light-dark(#eff5ff,#182639)', texto: 'light-dark(#151e32,#f2f6ff)', acento: 'light-dark(#00376f,#cceaff)' }[id] : temaBase[id];
  const muestra = (id: Color) => ({ '--muestra': valorColor(id) } as CSSProperties);
  const bytes = v.fondo_bytes || (pesoAnterior?.archivo === archivo ? pesoAnterior?.bytes : undefined);

  return <div className={styles.pagina}>
    <header className={styles.cabecera}><h1>Personalización</h1></header>
    <fieldset disabled={!listo || ocupado} className={styles.contenido}>
      <section className={styles.panel} data-rc-panel>
        <h2>Apariencia</h2>
        <div className={styles.opciones} role="group" aria-label="Modo de color">{modos.map(({ id, nombre, Icon }) => <button type="button" aria-pressed={v.modo === id} onClick={() => cambiar({ modo: id })} key={id}><span className={`${styles.muestra} ${styles[id]}`}><Icon size={20} strokeWidth={1.65} aria-hidden="true" /></span>{nombre}</button>)}</div>
        <h3>Tema</h3>
        <div className={styles.opciones} role="group" aria-label="Tema">{temas.map(({ id, nombre }) => <button type="button" aria-pressed={v.tema === id} onClick={() => cambiar({ tema: id, modo: id === 'rconcept-dark' ? 'oscuro' : v.modo })} key={id}><span className={`${styles.muestra} ${styles[id]}`} aria-hidden="true"><i /><i /></span>{nombre}</button>)}</div>
      </section>
      {v.tema === 'glass' && <section className={styles.panel} data-rc-panel>
        <h2>Fondo Glass</h2><p>Imagen o video de hasta 2,5 MB. En celular, se muestra el primer fotograma.</p>
        <input hidden ref={archivoInput} aria-label="Subir fondo Glass" type="file" accept={tipos} onChange={e => { const f = e.currentTarget.files?.[0]; if (f) void subir(f); e.currentTarget.value = ''; }} />
        <button type="button" className={styles.zonaArchivo} data-arrastrando={arrastrando}
          onClick={() => archivoInput.current?.click()}
          onDragOver={e => { e.preventDefault(); setArrastrando(true); }} onDragLeave={() => setArrastrando(false)}
          onDrop={e => { e.preventDefault(); setArrastrando(false); const f = e.dataTransfer.files[0]; if (f) void subir(f); }}>
          {v.imagen ? /* eslint-disable-next-line @next/next/no-img-element */
            <img src={`/api/yo/apariencia/fondo/${encodeURIComponent(v.imagen)}`} alt="" className={styles.miniatura} /> : <ImagePlus size={23} strokeWidth={1.65} aria-hidden="true" />}
          <span><strong>{archivo ? (v.fondo_nombre || (v.video ? 'Video de fondo' : 'Imagen de fondo')) : 'Elegir un fondo'}</strong><small>{archivo && bytes ? `${peso(bytes)} · ` : ''}Arrastra un archivo o toca para {archivo ? 'cambiarlo' : 'elegirlo'}</small></span>
        </button>
        {archivo && (confirmar ? <div className={styles.confirmar} role="group" aria-label="Confirmar quitar fondo" onKeyDown={e => { if (e.key === 'Escape') setConfirmar(false); }}>
          <span>¿Quitar el fondo? El cambio se aplica al guardar.</span>
          <Boton variante="secundario" tamano="sm" onClick={() => setConfirmar(false)}>Cancelar</Boton>
          <Boton variante="peligro" tamano="sm" onClick={() => { cambiar({ imagen: undefined, video: undefined, fondo_nombre: undefined, fondo_bytes: undefined }); setConfirmar(false); }}>Sí, quitar fondo</Boton>
        </div> : <Boton variante="secundario" tamano="sm" className={styles.quitar} onClick={() => setConfirmar(true)}><Trash2 size={15} aria-hidden="true" /> Quitar fondo</Boton>)}
        <label className={styles.deslizador}><span>Oscurecido</span><output>{v.oscurecido}%</output><input type="range" aria-label="Oscurecido" min={0} max={85} value={v.oscurecido} style={{ '--progreso': `${v.oscurecido / 85 * 100}%` } as CSSProperties} onChange={e => cambiar({ oscurecido: e.currentTarget.valueAsNumber })} /></label>
      </section>}
      <section className={styles.panel} data-rc-panel>
        <h2>Colores</h2><p>Personaliza cada color o conserva el original del tema.</p>
        <div className={styles.categorias} role="group" aria-label="Color a editar">{colores.map(({ id, nombre }) => <Boton key={id} variante="secundario" tamano="sm" onClick={() => setColor(id)} aria-pressed={color === id}>
          <span aria-hidden="true" className={styles.punto} style={muestra(id)} />{nombre}{invalido(id) && <span aria-label="Código inválido">!</span>}</Boton>)}</div>
        <div className={styles.editorColor}>
          <div className={styles.muestraGrande} style={muestra(color)} aria-hidden="true" />
          <div>
            <div className={styles.paleta} role="group" aria-label="Colores sugeridos">{paletas[color].map(c => <button key={c} type="button" aria-label={`Usar ${c}`} aria-pressed={v[color]?.toLowerCase() === c} className={styles.baldosa} style={{ '--muestra': c } as CSSProperties} onClick={() => cambiar({ [color]: c })} />)}</div>
            <div className={styles.hex}><label>Código hex<input autoComplete="off" spellCheck={false} maxLength={7} placeholder="Del tema" value={v[color] ?? ''} aria-invalid={invalido(color)} aria-describedby={invalido(color) ? 'error-hex' : undefined} onChange={e => cambiar({ [color]: e.currentTarget.value })} /></label>
            <Boton variante="secundario" tamano="sm" onClick={() => cambiar({ [color]: undefined })}>Usar el del tema</Boton></div>
            {invalido(color) && <p className={styles.error} id="error-hex">Usa el formato #RRGGBB, por ejemplo #235D91.</p>}
          </div>
        </div>
        <div className={styles.previa} style={{ '--previa-fondo': valorColor('fondo'), '--previa-texto': valorColor('texto'), '--previa-acento': valorColor('acento') } as CSSProperties}>
          <div><strong>Vista previa</strong><p>Así se combinan el fondo, el texto y el acento.</p></div><span>Botón de ejemplo</span>
        </div>
      </section>
      <details className={styles.panel} data-rc-panel>
        <summary>Avanzado <ChevronDown size={18} strokeWidth={1.8} aria-hidden="true" /></summary>
        <div className={styles.avanzado}>
          <label>Tamaño de la interfaz (px)<input type="number" min={12} max={28} value={v.interfaz ?? ''} placeholder="Predeterminado" onChange={e => cambiar({ interfaz: e.currentTarget.valueAsNumber || undefined })} /></label>
          <label>Tamaño del contenido (px)<input type="number" min={12} max={28} value={v.contenido ?? ''} placeholder="Predeterminado" onChange={e => cambiar({ contenido: e.currentTarget.valueAsNumber || undefined })} /></label>
          <label>Reducir movimiento<Selector etiqueta="Reducir movimiento" valor={v.movimiento} onCambio={seleccion => cambiar({ movimiento: seleccion as Apariencia['movimiento'] })}  opciones={opcionesSelector(<><option value="sistema">Sistema</option><option value="activado">Activado</option><option value="desactivado">Desactivado</option></>)} /></label>
          <Casilla etiqueta="Aumentar contraste" checked={v.contraste} onChange={e => cambiar({ contraste: e.currentTarget.checked })} />
        </div>
      </details>
      <div className={styles.acciones}><Boton variante="secundario" onClick={() => { setV(aparienciaInicial); aplicarApariencia(aparienciaInicial); setConfirmar(false); setEstado(''); setError(''); }}>Restablecer</Boton><Boton variante="primario" disabled={errorHex} onClick={() => void guardar()}>Guardar apariencia</Boton></div>
    </fieldset>
    {estado && <p role="status">{estado}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </div>;
}
