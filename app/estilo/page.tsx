"use client";

import React, { useState } from "react";
import {
  Boton,
  Campo,
  Interruptor,
  Casilla,
  Radio,
  Chip,
  Estado,
  Tarjeta,
  Avatar,
  Pestanas,
  Aviso,
  Modal,
  Menu,
  Tooltip,
  Esqueleto,
  Tabla,
  TablaFila,
} from "@/components/ui";

export default function EstiloPage() {
  // Estado para slider
  const [sliderVal, setSliderVal] = useState(48);

  // Estado para contador de notificaciones
  const [contador, setContador] = useState(3);

  // Estado para fila de tabla seleccionada
  const [filaSeleccionada, setFilaSeleccionada] = useState(2); // Sofía López por defecto

  // Estado para pestaña activa
  const [pestanaActiva, setPestanaActiva] = useState("general");

  // Estado para página activa en paginación
  const [paginaActiva, setPaginaActiva] = useState(1);

  // Estado para nav activa
  const [navActiva, setNavActiva] = useState("inicio");

  // Estado para chat demo
  const [mensajesChat, setMensajesChat] = useState([
    {
      id: "1",
      propio: false,
      autor: "Laura Gómez",
      rol: "Diseñadora",
      hora: "10:24",
      texto: "Perfecto, ya subo las versiones finales del video.",
      avatar: "#rc-ava-mujer-1",
    },
    {
      id: "2",
      propio: true,
      texto: "Listo, gracias!",
      hora: "10:26 ✓✓",
    },
  ]);
  const [inputChat, setInputChat] = useState("");

  const handleEnviarChat = (e: React.FormEvent) => {
    e.preventDefault();
    const texto = inputChat.trim();
    if (!texto) return;
    setMensajesChat((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        propio: true,
        texto,
        hora: "10:28 ✓✓",
      },
    ]);
    setInputChat("");
  };

  return (
    <main className="rc-tablero">
      {/* CABECERA */}
      <header className="rc-cabecera">
        <div className="rc-cabecera__marca">
          <h1 className="rc-cabecera__titulo">Sistema de Diseño</h1>
          <p className="rc-cabecera__subtitulo">Equipo de Producción de Contenido</p>
        </div>
        <p className="rc-cabecera__descripcion">
          Componentes, estilos y patrones para una experiencia interna consistente, rápida y enfocada en la productividad.
        </p>
        <div>
          <span className="rc-cabecera__insignia">UI KIT / DESIGN SYSTEM</span>
        </div>
        <div className="rc-cabecera__meta">
          <span className="rc-cabecera__meta-titulo">Neumorfismo + Liquid Glass</span>
          <div className="rc-cabecera__meta-lista">
            <span>Simple</span>
            <span>·</span>
            <span>Compacto</span>
            <span>·</span>
            <span>Consistente</span>
          </div>
        </div>
      </header>

      {/* FILA 1: MODULOS 1 A 4 */}
      <div className="rc-fila-1">
        {/* 1. BOTONES */}
        <section className="rc-modulo" aria-labelledby="mod-1">
          <h2 id="mod-1" className="rc-modulo__titulo">1. BOTONES</h2>

          <div className="rc-botones-rejilla">
            <div className="rc-campo-item">
              <span className="rc-subtitulo">Primario</span>
              <Boton variante="primario">Crear</Boton>
            </div>

            <div className="rc-campo-item">
              <span className="rc-subtitulo">Primario (liquid glass)</span>
              <Boton variante="vidrio">Crear</Boton>
            </div>

            <div className="rc-campo-item">
              <span className="rc-subtitulo">Secundario</span>
              <Boton variante="secundario">Cancelar</Boton>
            </div>

            <div className="rc-campo-item">
              <span className="rc-subtitulo">Fantasma</span>
              <Boton variante="fantasma">Ver más</Boton>
            </div>

            <div className="rc-campo-item">
              <span className="rc-subtitulo">Peligro</span>
              <Boton variante="peligro">
                <svg className="rc-icono rc-icono--rojo" aria-hidden="true">
                  <use href="#rc-ico-papelera" />
                </svg>
                <span>Eliminar</span>
              </Boton>
            </div>

            <div className="rc-campo-item">
              <span className="rc-subtitulo">Peligro (liquid glass)</span>
              <Boton variante="peligro-vidrio">
                <svg className="rc-icono rc-icono--rojo" aria-hidden="true">
                  <use href="#rc-ico-papelera" />
                </svg>
                <span>Eliminar</span>
              </Boton>
            </div>

            <div className="rc-campo-item">
              <span className="rc-subtitulo">Píldora</span>
              <Boton variante="pildora">
                <svg className="rc-icono" aria-hidden="true">
                  <use href="#rc-ico-cuadricula" />
                </svg>
                <span>Filtros</span>
                <svg className="rc-icono rc-icono--sm" aria-hidden="true">
                  <use href="#rc-ico-chevron-der" />
                </svg>
              </Boton>
            </div>

            <div className="rc-campo-item">
              <span className="rc-subtitulo">Solo icono</span>
              <Boton variante="icono" aria-label="Ajustes">
                <svg className="rc-icono" aria-hidden="true">
                  <use href="#rc-ico-ajustes" />
                </svg>
              </Boton>
            </div>
          </div>

          <div className="rc-botones-estados">
            <div className="rc-campo-item">
              <span className="rc-subtitulo">Estados</span>
              <Boton tamano="sm">Normal</Boton>
            </div>
            <div className="rc-campo-item">
              <span className="rc-subtitulo">&nbsp;</span>
              <Boton tamano="sm" estadoVisual="hover">Hover</Boton>
            </div>
            <div className="rc-campo-item">
              <span className="rc-subtitulo">&nbsp;</span>
              <Boton tamano="sm" estadoVisual="activo">Pressed</Boton>
            </div>
            <div className="rc-campo-item">
              <span className="rc-subtitulo">&nbsp;</span>
              <Boton tamano="sm" disabled>Disabled</Boton>
            </div>
            <div className="rc-campo-item">
              <span className="rc-subtitulo">Cargando</span>
              <Boton tamano="sm" cargando aria-label="Cargando" />
            </div>
          </div>
        </section>

        {/* 2. CAMPOS */}
        <section className="rc-modulo" aria-labelledby="mod-2">
          <h2 id="mod-2" className="rc-modulo__titulo">2. CAMPOS</h2>

          <div className="rc-campos-rejilla">
            <div className="rc-campos-col">
              <Campo
                etiqueta="Input"
                icono="#rc-ico-buscar"
                placeholder="Buscar..."
              />

              <Campo
                etiqueta="Con icono"
                type="email"
                icono="#rc-ico-correo"
                placeholder="Correo..."
              />

              <Campo
                etiqueta="Con error"
                type="email"
                icono="#rc-ico-correo"
                placeholder="Correo..."
                error="Este campo es obligatorio"
              />

              <div className="rc-campo-item">
                <span className="rc-subtitulo">Checkbox</span>
                <Casilla defaultChecked etiqueta="Recordarme" />
              </div>

              <div className="rc-campo-item">
                <span className="rc-subtitulo">Interruptor</span>
                <Interruptor defaultChecked etiqueta="Interruptor" />
              </div>
            </div>

            <div className="rc-campos-col">
              <Campo como="select" etiqueta="Select" aria-label="Categoría">
                <option>Categoría</option>
                <option>Producción</option>
                <option>Diseño</option>
                <option>Editorial</option>
              </Campo>

              <Campo
                como="textarea"
                etiqueta="Textarea"
                placeholder="Descripción..."
              />

              <Campo
                etiqueta="Búsqueda"
                type="search"
                icono="#rc-ico-buscar"
                placeholder="Buscar contenido..."
              />

              <div className="rc-campo-item">
                <span className="rc-subtitulo">Radio</span>
                <div className="rc-radio-grupo" role="radiogroup" aria-label="Opciones">
                  <Radio name="rc-opcion" defaultChecked etiqueta="Opción 1" />
                  <Radio name="rc-opcion" etiqueta="Opción 2" />
                </div>
              </div>

              <div className="rc-campo-item">
                <span className="rc-subtitulo">Control deslizante</span>
                <div className="rc-slider">
                  <div className="rc-slider__riel">
                    <div
                      className="rc-slider__progreso"
                      style={{ width: `${sliderVal}%` }}
                    />
                  </div>
                  <span
                    className="rc-slider__perilla"
                    style={{ left: `${sliderVal}%` }}
                  />
                  <input
                    type="range"
                    className="rc-slider__input"
                    min="0"
                    max="100"
                    value={sliderVal}
                    onChange={(e) => setSliderVal(Number(e.target.value))}
                    aria-label="Control deslizante"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. CHIPS Y ETIQUETAS */}
        <section className="rc-modulo" aria-labelledby="mod-3">
          <h2 id="mod-3" className="rc-modulo__titulo">3. CHIPS Y ETIQUETAS</h2>

          <div className="rc-campo-item">
            <span className="rc-subtitulo">Roles</span>
            <div className="rc-chips-grupo">
              <Chip punto="azul">Editor</Chip>
              <Chip punto="morado">Diseñador</Chip>
              <Chip punto="verde">Productor</Chip>
              <Chip punto="ambar">Community</Chip>
              <Chip punto="gris">Invitado</Chip>
            </div>
          </div>

          <div className="rc-campo-item">
            <span className="rc-subtitulo">Insignias de estado</span>
            <div className="rc-estados-rejilla">
              <Estado variante="pendiente">Pendiente</Estado>
              <Estado variante="aprobado">Aprobado</Estado>
              <Estado variante="suspendido">Suspendido</Estado>
              <Estado variante="error">Error</Estado>
            </div>
          </div>

          <div className="rc-chips-inferior">
            <div className="rc-campo-item">
              <span className="rc-subtitulo">Contador de notificaciones</span>
              <div className="rc-escena-vidrio">
                <span className="rc-mancha rc-mancha--azul" aria-hidden="true" />
                <div
                  className="rc-notificacion-demo"
                  title="Haz clic para incrementar"
                  onClick={() => setContador((prev) => (prev % 9) + 1)}
                  style={{ cursor: "pointer" }}
                >
                  <div className="rc-notificacion-base rc-vidrio">
                    <svg className="rc-icono" aria-hidden="true">
                      <use href="#rc-ico-campana" />
                    </svg>
                  </div>
                  <span className="rc-contador rc-vidrio rc-vidrio--azul">
                    {contador}
                  </span>
                </div>
              </div>
            </div>

            <div className="rc-campo-item">
              <span className="rc-subtitulo">Punto de estado</span>
              <div className="rc-estado-linea">
                <span className="rc-punto rc-punto--verde" aria-hidden="true" />
                <span>En línea</span>
              </div>
            </div>
          </div>
        </section>

        {/* 4. TARJETAS Y PANELES */}
        <section className="rc-modulo" aria-labelledby="mod-4">
          <h2 id="mod-4" className="rc-modulo__titulo">4. TARJETAS Y PANELES</h2>

          <div className="rc-tarjetas-superior">
            <div className="rc-campo-item">
              <span className="rc-subtitulo">Tarjeta simple</span>
              <Tarjeta>
                <div className="rc-card__top">
                  <div className="rc-card__miniatura">
                    <svg className="rc-icono" aria-hidden="true">
                      <use href="#rc-ico-imagen" />
                    </svg>
                  </div>
                  <button type="button" className="rc-btn--fantasma" aria-label="Opciones de tarjeta">
                    <svg className="rc-icono rc-icono--sm" aria-hidden="true">
                      <use href="#rc-ico-mas-vert" />
                    </svg>
                  </button>
                </div>
                <h3 className="rc-card__titulo">Proyecto de campaña</h3>
                <p className="rc-card__texto">Contenido para redes sociales y blog.</p>
              </Tarjeta>
            </div>

            <div className="rc-campo-item">
              <span className="rc-subtitulo">Tarjeta con encabezado</span>
              <Tarjeta>
                <div className="rc-card__encabezado">
                  <div className="rc-card__autor">
                    <div className="rc-card__icono-circular">
                      <svg className="rc-icono" aria-hidden="true">
                        <use href="#rc-ico-usuario" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="rc-card__titulo">Equipo de contenido</h3>
                      <p className="rc-card__texto">12 miembros</p>
                    </div>
                  </div>
                  <div className="rc-card__acciones">
                    <button type="button" className="rc-btn-mini" aria-label="Añadir miembro">
                      <svg className="rc-icono rc-icono--sm" aria-hidden="true">
                        <use href="#rc-ico-mas" />
                      </svg>
                    </button>
                    <button type="button" className="rc-btn-mini" aria-label="Más acciones">
                      <svg className="rc-icono rc-icono--sm" aria-hidden="true">
                        <use href="#rc-ico-mas" />
                      </svg>
                    </button>
                  </div>
                </div>
                <p className="rc-card__texto">Planificación, producción y edición de contenido.</p>
                <button type="button" className="rc-btn rc-btn--sm rc-card__cta">
                  Ver detalles
                </button>
              </Tarjeta>
            </div>
          </div>

          <div className="rc-tarjetas-inferior">
            <div className="rc-campo-item">
              <span className="rc-subtitulo">Panel lateral</span>
              <nav className="rc-nav-lateral" aria-label="Panel lateral de muestra">
                {[
                  { id: "inicio", label: "Inicio", icon: "#rc-ico-inicio" },
                  { id: "proyectos", label: "Proyectos", icon: "#rc-ico-carpeta" },
                  { id: "tareas", label: "Tareas", icon: "#rc-ico-tareas" },
                  { id: "calendario", label: "Calendario", icon: "#rc-ico-calendario" },
                  { id: "archivos", label: "Archivos", icon: "#rc-ico-archivo" },
                  { id: "configuracion", label: "Configuración", icon: "#rc-ico-ajustes" },
                ].map((item) => {
                  const activo = navActiva === item.id;
                  return (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      className={`rc-nav-item ${activo ? "rc-nav-item--activo" : ""}`}
                      onClick={(e) => {
                        e.preventDefault();
                        setNavActiva(item.id);
                      }}
                    >
                      <svg
                        className={`rc-icono rc-icono--sm ${activo ? "rc-icono--azul" : ""}`}
                        aria-hidden="true"
                      >
                        <use href={item.icon} />
                      </svg>
                      <span>{item.label}</span>
                    </a>
                  );
                })}
              </nav>
            </div>

            <div className="rc-campo-item">
              <span className="rc-subtitulo">Estadística destacada</span>
              <Tarjeta variante="estadistica">
                <p className="rc-estadistica__etiqueta">
                  <span>Contenido</span> publicado
                </p>
                <div className="rc-estadistica__valor-fila">
                  <span className="rc-estadistica__numero">248</span>
                  <span className="rc-estadistica__delta">↑ 12%</span>
                </div>
                <svg className="rc-estadistica__grafico" viewBox="0 0 110 34" fill="none" aria-hidden="true">
                  <path
                    d="M2 24C12 22 18 28 28 24C38 20 44 29 54 22C64 15 72 24 82 14C92 4 100 16 108 6"
                    stroke="#2F7FE0"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </Tarjeta>
            </div>

            <div className="rc-campo-item">
              <span className="rc-subtitulo">Tarjeta vacía</span>
              <Tarjeta variante="vacia" />
            </div>
          </div>
        </section>
      </div>

      {/* FILA 2: MODULOS 5 A 8 */}
      <div className="rc-fila-2">
        {/* 5. NAVEGACIÓN */}
        <section className="rc-modulo rc-modulo--nav" aria-labelledby="mod-5">
          <h2 id="mod-5" className="rc-modulo__titulo">5. NAVEGACIÓN</h2>

          <div className="rc-nav-rejilla">
            {/* Columna A: Barra lateral (compacta) */}
            <div className="rc-nav-bloque rc-nav-bloque--lateral">
              <span className="rc-subtitulo">Barra lateral (compacta)</span>
              <nav className="rc-nav-lateral rc-nav-lateral--amplia" aria-label="Navegación principal">
                {[
                  { id: "nav-inicio", label: "Inicio", icon: "#rc-ico-inicio" },
                  { id: "nav-proyectos", label: "Proyectos", icon: "#rc-ico-carpeta" },
                  { id: "nav-tareas", label: "Tareas", icon: "#rc-ico-tareas" },
                  { id: "nav-calendario", label: "Calendario", icon: "#rc-ico-calendario" },
                  { id: "nav-archivos", label: "Archivos", icon: "#rc-ico-archivo" },
                  { id: "nav-ajustes", label: "Ajustes", icon: "#rc-ico-ajustes" },
                ].map((item, idx) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className={`rc-nav-item ${idx === 0 ? "rc-nav-item--activo" : ""}`}
                  >
                    <svg
                      className={`rc-icono ${idx === 0 ? "rc-icono--azul" : ""}`}
                      aria-hidden="true"
                    >
                      <use href={item.icon} />
                    </svg>
                    <span>{item.label}</span>
                  </a>
                ))}
              </nav>
            </div>

            {/* Columna B: Barra colapsada */}
            <div className="rc-nav-bloque rc-nav-bloque--colapsada">
              <span className="rc-subtitulo">Colapsada</span>
              <nav className="rc-nav-lateral rc-nav-lateral--colapsada" aria-label="Navegación colapsada">
                {[
                  { id: "col-inicio", label: "Inicio", icon: "#rc-ico-inicio" },
                  { id: "col-proyectos", label: "Proyectos", icon: "#rc-ico-carpeta" },
                  { id: "col-tareas", label: "Tareas", icon: "#rc-ico-tareas" },
                  { id: "col-calendario", label: "Calendario", icon: "#rc-ico-calendario" },
                  { id: "col-archivos", label: "Archivos", icon: "#rc-ico-archivo" },
                  { id: "col-ajustes", label: "Ajustes", icon: "#rc-ico-ajustes" },
                ].map((item, idx) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className={`rc-nav-item ${idx === 0 ? "rc-nav-item--activo" : ""}`}
                    aria-label={item.label}
                  >
                    <svg
                      className={`rc-icono ${idx === 0 ? "rc-icono--azul" : ""}`}
                      aria-hidden="true"
                    >
                      <use href={item.icon} />
                    </svg>
                  </a>
                ))}
              </nav>
            </div>

            {/* Columna C: A la derecha apilados */}
            <div className="rc-nav-col-derecha">
              <div className="rc-nav-bloque">
                <span className="rc-subtitulo">Barra superior</span>
                <div className="rc-barra-superior">
                  <div className="rc-input-contenedor rc-barra-superior__buscar">
                    <svg className="rc-icono" aria-hidden="true">
                      <use href="#rc-ico-buscar" />
                    </svg>
                    <input type="search" className="rc-input" placeholder="Buscar..." />
                  </div>
                  <button
                    type="button"
                    className="rc-btn rc-btn--icono rc-barra-superior__campana"
                    aria-label="Notificaciones"
                  >
                    <svg className="rc-icono" aria-hidden="true">
                      <use href="#rc-ico-campana" />
                    </svg>
                  </button>
                  <Avatar tamano={32} iconoSimbolo="#rc-ava-hombre-1" presencia />
                </div>
              </div>

              <div className="rc-nav-bloque">
                <span className="rc-subtitulo">Pestañas flotantes</span>
                <Pestanas
                  activaId={pestanaActiva}
                  onCambio={setPestanaActiva}
                  etiquetaAria="Secciones de producción"
                  pestanas={[
                    { id: "general", etiqueta: "General" },
                    { id: "produccion", etiqueta: "Producción" },
                    { id: "edicion", etiqueta: "Edición" },
                    { id: "reportes", etiqueta: "Reportes" },
                  ]}
                />
              </div>

              <div className="rc-nav-fila-inferior">
                <div className="rc-nav-bloque rc-nav-bloque--migas">
                  <span className="rc-subtitulo">Migas de pan</span>
                  <nav className="rc-migas" aria-label="Migas de pan">
                    <svg className="rc-icono rc-icono--sm" aria-hidden="true">
                      <use href="#rc-ico-inicio" />
                    </svg>
                    <span className="rc-migas__sep">›</span>
                    <span className="rc-migas__link">Proyectos</span>
                    <span className="rc-migas__sep">›</span>
                    <span className="rc-migas__actual">Campaña verano</span>
                  </nav>
                </div>

                <div className="rc-nav-bloque rc-nav-bloque--paginacion">
                  <span className="rc-subtitulo">Paginación</span>
                  <nav className="rc-paginacion" aria-label="Paginación">
                    <button
                      type="button"
                      className="rc-pagina-btn"
                      aria-label="Página anterior"
                      onClick={() => setPaginaActiva((p) => Math.max(1, p - 1))}
                    >
                      ‹
                    </button>
                    {[1, 2, 3, 4, 5].map((num) => (
                      <button
                        key={num}
                        type="button"
                        className={`rc-pagina-btn ${paginaActiva === num ? "rc-pagina-btn--activa" : ""}`}
                        aria-current={paginaActiva === num ? "page" : undefined}
                        onClick={() => setPaginaActiva(num)}
                      >
                        {num}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="rc-pagina-btn"
                      aria-label="Página siguiente"
                      onClick={() => setPaginaActiva((p) => Math.min(5, p + 1))}
                    >
                      ›
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 6. DATOS */}
        <section className="rc-modulo" aria-labelledby="mod-6">
          <h2 id="mod-6" className="rc-modulo__titulo">6. DATOS</h2>

          <div className="rc-campo-item">
            <span className="rc-subtitulo">Tabla</span>
            <Tabla>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    id: 0,
                    nombre: "Ana Torres",
                    avatar: "#rc-ava-mujer-1",
                    rol: "Editor",
                    estado: "aprobado",
                    estadoTxt: "Activo",
                    fecha: "12 abr",
                  },
                  {
                    id: 1,
                    nombre: "Carlos Ruiz",
                    avatar: "#rc-ava-hombre-1",
                    rol: "Diseñador",
                    estado: "pendiente",
                    estadoTxt: "Pendiente",
                    fecha: "11 abr",
                  },
                  {
                    id: 2,
                    nombre: "Sofía López",
                    avatar: "#rc-ava-mujer-2",
                    rol: "Productor",
                    estado: "aprobado",
                    estadoTxt: "Activo",
                    fecha: "10 abr",
                  },
                  {
                    id: 3,
                    nombre: "Diego Ramírez",
                    avatar: "#rc-ava-hombre-1",
                    rol: "Editor",
                    estado: "error",
                    estadoTxt: "Suspendido",
                    fecha: "8 abr",
                  },
                ].map((row) => (
                  <TablaFila
                    key={row.id}
                    seleccionada={filaSeleccionada === row.id}
                    onClick={() => setFilaSeleccionada(row.id)}
                    style={{ cursor: "pointer" }}
                  >
                    <td>
                      <div className="rc-tabla__usuario">
                        <Avatar tamano={24} iconoSimbolo={row.avatar} />
                        <span>{row.nombre}</span>
                      </div>
                    </td>
                    <td>{row.rol}</td>
                    <td>
                      <Estado
                        variante={
                          row.estado as
                            | "aprobado"
                            | "pendiente"
                            | "suspendido"
                            | "error"
                        }
                        enTabla
                      >
                        {row.estadoTxt}
                      </Estado>
                    </td>
                    <td>{row.fecha}</td>
                  </TablaFila>
                ))}
              </tbody>
            </Tabla>
          </div>

          <div className="rc-datos-inferior">
            <div className="rc-campo-item">
              <span className="rc-subtitulo">Lista con avatar</span>
              <div className="rc-lista-avatar">
                {[
                  {
                    nombre: "Laura Gómez",
                    rol: "Diseñadora",
                    hora: "Hoy, 10:24",
                    avatar: "#rc-ava-mujer-1",
                  },
                  {
                    nombre: "Andrés Peña",
                    rol: "Editor",
                    hora: "Ayer, 16:32",
                    avatar: "#rc-ava-hombre-1",
                  },
                  {
                    nombre: "Valentina Rojas",
                    rol: "Productora",
                    hora: "Ayer, 11:02",
                    avatar: "#rc-ava-mujer-2",
                  },
                ].map((item, idx) => (
                  <div key={idx} className="rc-lista-item">
                    <div className="rc-lista-item__info">
                      <Avatar tamano={24} iconoSimbolo={item.avatar} />
                      <div>
                        <div className="rc-lista-item__nombre">{item.nombre}</div>
                        <div className="rc-lista-item__rol">{item.rol}</div>
                      </div>
                    </div>
                    <span className="rc-lista-item__hora">{item.hora}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rc-campo-item">
              <span className="rc-subtitulo">Skeleton de carga</span>
              <Esqueleto filas={3} />
            </div>
          </div>
        </section>

        {/* 7. MENSAJERIA */}
        <section className="rc-modulo" aria-labelledby="mod-7">
          <h2 id="mod-7" className="rc-modulo__titulo">7. MENSAJERÍA</h2>

          <div className="rc-chat">
            {mensajesChat.map((m) =>
              m.propio ? (
                <div key={m.id} className="rc-mensaje rc-mensaje--propio">
                  <div className="rc-burbuja rc-burbuja--propia">
                    <span className="rc-burbuja__texto">{m.texto}</span>
                    <span className="rc-burbuja__hora">{m.hora}</span>
                  </div>
                </div>
              ) : (
                <div key={m.id} className="rc-mensaje">
                  <Avatar tamano={24} iconoSimbolo={m.avatar} />
                  <div className="rc-burbuja">
                    <div className="rc-burbuja__cabecera">
                      <span className="rc-burbuja__autor">{m.autor}</span>
                      <span className="rc-burbuja__rol">{m.rol}</span>
                      <span className="rc-burbuja__hora">{m.hora}</span>
                    </div>
                    <p className="rc-burbuja__texto">{m.texto}</p>
                  </div>
                </div>
              )
            )}

            <div className="rc-separador-dia">
              <span>Ayer</span>
            </div>

            <div className="rc-mensaje">
              <Avatar tamano={24} iconoSimbolo="#rc-ava-hombre-1" />
              <div className="rc-burbuja">
                <div className="rc-burbuja__cabecera">
                  <span className="rc-burbuja__autor">Andrés Peña</span>
                  <span className="rc-burbuja__rol">Editor</span>
                  <span className="rc-burbuja__hora">09:12</span>
                </div>
                <p className="rc-burbuja__texto">¿Puedes revisar el copy del carrusel?</p>
              </div>
            </div>

            <form className="rc-chat-escritura" onSubmit={handleEnviarChat}>
              <div className="rc-chat-caja">
                <svg className="rc-icono rc-icono--sm" aria-hidden="true">
                  <use href="#rc-ico-clip" />
                </svg>
                <input
                  type="text"
                  className="rc-input"
                  placeholder="Escribe un mensaje..."
                  value={inputChat}
                  onChange={(e) => setInputChat(e.target.value)}
                />
              </div>
              <div className="rc-escena-vidrio">
                <span className="rc-mancha rc-mancha--azul" aria-hidden="true" />
                <button
                  type="submit"
                  className="rc-btn-enviar rc-vidrio rc-vidrio--azul"
                  aria-label="Enviar mensaje"
                >
                  <svg className="rc-icono rc-icono--sm rc-icono--azul" aria-hidden="true">
                    <use href="#rc-ico-enviar" />
                  </svg>
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* 8. AVISOS */}
        <section className="rc-modulo" aria-labelledby="mod-8">
          <h2 id="mod-8" className="rc-modulo__titulo">8. AVISOS</h2>

          <div className="rc-toasts-lista">
            <Aviso
              tipo="exito"
              titulo="Cambios guardados"
              texto="Correctamente."
              onCerrar={() => {}}
            />
            <Aviso
              tipo="info"
              titulo="Información"
              texto="Revisa los datos antes de continuar."
              onCerrar={() => {}}
            />
            <Aviso
              tipo="advertencia"
              titulo="Advertencia"
              texto="Esta acción no se puede deshacer."
              onCerrar={() => {}}
            />
            <Aviso
              tipo="error"
              titulo="Error"
              texto="Ocurrió un problema. Intenta de nuevo."
              onCerrar={() => {}}
            />
          </div>

          <div className="rc-avisos-inferior">
            <div className="rc-avisos-izq">
              <div className="rc-campo-item">
                <span className="rc-subtitulo">Alerta en línea</span>
                <div className="rc-alerta-linea">
                  <span className="rc-punto rc-punto--verde" aria-hidden="true" />
                  <span>Sistema operativo</span>
                </div>
              </div>

              <div className="rc-campo-item">
                <span className="rc-subtitulo">Tooltip</span>
                <Tooltip texto="Editar" mostrarCursorDemo>
                  <Boton variante="icono" aria-label="Editar">
                    <svg className="rc-icono rc-icono--sm" aria-hidden="true">
                      <use href="#rc-ico-editar-v2" />
                    </svg>
                  </Boton>
                </Tooltip>
              </div>
            </div>

            <div className="rc-avisos-der">
              <div className="rc-campo-item">
                <span className="rc-subtitulo">Modal de confirmación</span>
                <Modal
                  enLinea
                  titulo="¿Eliminar proyecto?"
                  descripcion="Esta acción no se puede deshacer."
                  accionSecundaria={
                    <button type="button" className="rc-btn--modal-sec">
                      Cancelar
                    </button>
                  }
                  accionPrimaria={
                    <button type="button" className="rc-btn--peligro-solido">
                      Eliminar
                    </button>
                  }
                  onCerrar={() => {}}
                />
              </div>

              <div className="rc-campo-item">
                <span className="rc-subtitulo">Menú desplegable</span>
                <Menu
                  items={[
                    {
                      id: "1",
                      etiqueta: "Ordenar por",
                      icono: "#rc-ico-ordenar-v2",
                      iconoDerecha: "#rc-ico-chevron-der-v2",
                    },
                    {
                      id: "2",
                      etiqueta: "Más opciones",
                      icono: "#rc-ico-mas-vert-v2",
                    },
                    {
                      id: "3",
                      etiqueta: "Configuración",
                      icono: "#rc-ico-ajustes-v2",
                    },
                  ]}
                />
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* FILA 3: MODULOS 9, 10, PALETA DE COLORES Y TIPOGRAFIA */}
      <div className="rc-fila-3">
        {/* 9. AVATARES */}
        <section className="rc-modulo" aria-labelledby="mod-9">
          <h2 id="mod-9" className="rc-modulo__titulo">9. AVATARES</h2>

          <div className="rc-avatares-contenedor">
            <div className="rc-avatares-grupo">
              <div className="rc-avatar-item">
                <Avatar tamano={24} iconoSimbolo="#rc-ava-mujer-1" presencia />
                <span className="rc-avatar-medida">24 px</span>
              </div>

              <div className="rc-avatar-item">
                <Avatar tamano={32} iniciales="JD" fondoAzul presencia />
                <span className="rc-avatar-medida">32 px</span>
              </div>

              <div className="rc-avatar-item">
                <Avatar tamano={40} iconoSimbolo="#rc-ava-hombre-1" presencia />
                <span className="rc-avatar-medida">40 px</span>
              </div>
            </div>

            <div className="rc-divisor-vertical" aria-hidden="true" />

            <div className="rc-campo-item">
              <span className="rc-subtitulo">Iniciales</span>
              <div className="rc-avatares-grupo">
                <div className="rc-avatar-item">
                  <Avatar tamano={24} iniciales="AB" />
                  <span className="rc-avatar-medida">24 px</span>
                </div>

                <div className="rc-avatar-item">
                  <Avatar tamano={32} iniciales="CM" />
                  <span className="rc-avatar-medida">32 px</span>
                </div>

                <div className="rc-avatar-item">
                  <Avatar tamano={40} iniciales="RT" />
                  <span className="rc-avatar-medida">40 px</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 10. ESCALAS */}
        <section className="rc-modulo" aria-labelledby="mod-10">
          <h2 id="mod-10" className="rc-modulo__titulo">10. ESCALAS</h2>

          <div className="rc-escalas-contenedor">
            <div className="rc-escalas-izq">
              <div className="rc-campo-item">
                <span className="rc-subtitulo">Espaciado</span>
                <div className="rc-escala-chips">
                  <span className="rc-escala-pastilla">4</span>
                  <span className="rc-escala-pastilla">8</span>
                  <span className="rc-escala-pastilla">12</span>
                  <span className="rc-escala-pastilla">16</span>
                  <span className="rc-escala-pastilla">24</span>
                  <span className="rc-elevacion-valor">(px)</span>
                </div>
              </div>

              <div className="rc-campo-item">
                <span className="rc-subtitulo">Radios</span>
                <div className="rc-escala-chips">
                  <span className="rc-escala-pastilla rc-escala-pastilla--r8">8</span>
                  <span className="rc-escala-pastilla rc-escala-pastilla--r12">12</span>
                  <span className="rc-escala-pastilla rc-escala-pastilla--r16">16</span>
                  <span className="rc-escala-pastilla rc-escala-pastilla--r20">20</span>
                  <span className="rc-elevacion-valor">(px)</span>
                </div>
              </div>
            </div>

            <div className="rc-divisor-vertical" aria-hidden="true" />

            <div className="rc-campo-item">
              <span className="rc-subtitulo">Niveles de elevación</span>
              <div className="rc-elevaciones-lista">
                <div className="rc-elevacion-item">
                  <span className="rc-elevacion-muestra rc-elevacion-muestra--plano" />
                  <span className="rc-elevacion-nombre">Plano</span>
                  <span className="rc-elevacion-valor">(0)</span>
                </div>
                <div className="rc-elevacion-item">
                  <span className="rc-elevacion-muestra rc-elevacion-muestra--suave" />
                  <span className="rc-elevacion-nombre">Relieve suave</span>
                  <span className="rc-elevacion-valor">(4)</span>
                </div>
                <div className="rc-elevacion-item">
                  <span className="rc-elevacion-muestra rc-elevacion-muestra--fuerte" />
                  <span className="rc-elevacion-nombre">Relieve fuerte</span>
                  <span className="rc-elevacion-valor">(12)</span>
                </div>
                <div className="rc-elevacion-item">
                  <span className="rc-elevacion-muestra rc-elevacion-muestra--hundido" />
                  <span className="rc-elevacion-nombre">Hundido</span>
                  <span className="rc-elevacion-valor">(-6)</span>
                </div>
                <div className="rc-elevacion-item">
                  <div className="rc-escena-vidrio">
                    <span className="rc-mancha rc-mancha--azul" aria-hidden="true" />
                    <span className="rc-elevacion-muestra rc-vidrio" />
                  </div>
                  <span className="rc-elevacion-nombre">Liquid glass</span>
                  <span className="rc-elevacion-valor">(transparente)</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PALETA DE COLORES */}
        <section className="rc-modulo" aria-labelledby="mod-paleta">
          <h2 id="mod-paleta" className="rc-modulo__titulo">PALETA DE COLORES</h2>

          <div className="rc-paleta-rejilla">
            <div className="rc-paleta-fila">
              <div className="rc-muestra-par">
                <span className="rc-swatch-cuadro rc-bg-superficie" />
                <div>
                  <div className="rc-elevacion-nombre">Superficie</div>
                  <div className="rc-swatch-hex">#ECEEF3</div>
                </div>
              </div>

              <div className="rc-muestra-par">
                <span className="rc-swatch-cuadro rc-bg-luz" />
                <span className="rc-swatch-cuadro rc-bg-sombra" />
                <div>
                  <div className="rc-elevacion-nombre">Sombra</div>
                  <div className="rc-swatch-hex">#A3ACBE</div>
                </div>
              </div>

              <div className="rc-campo-item">
                <span className="rc-subtitulo">Grises</span>
                <div className="rc-swatch-circulos">
                  <div className="rc-swatch-item"><span className="rc-swatch-circulo rc-bg-gris-50" /><span className="rc-swatch-hex">#F4F5F8</span></div>
                  <div className="rc-swatch-item"><span className="rc-swatch-circulo rc-bg-gris-100" /><span className="rc-swatch-hex">#E3E7EE</span></div>
                  <div className="rc-swatch-item"><span className="rc-swatch-circulo rc-bg-gris-300" /><span className="rc-swatch-hex">#C7CDD8</span></div>
                  <div className="rc-swatch-item"><span className="rc-swatch-circulo rc-bg-gris-500" /><span className="rc-swatch-hex">#8A93A5</span></div>
                  <div className="rc-swatch-item"><span className="rc-swatch-circulo rc-bg-gris-700" /><span className="rc-swatch-hex">#4A5262</span></div>
                  <div className="rc-swatch-item"><span className="rc-swatch-circulo rc-bg-gris-900" /><span className="rc-swatch-hex">#1F2430</span></div>
                </div>
              </div>
            </div>

            <div className="rc-paleta-fila">
              <div className="rc-campo-item">
                <span className="rc-subtitulo">Acento azul</span>
                <div className="rc-swatch-circulos">
                  <div className="rc-swatch-item"><span className="rc-swatch-circulo rc-bg-azul-suave" /><span className="rc-swatch-hex">#EAF3FF</span></div>
                  <div className="rc-swatch-item"><span className="rc-swatch-circulo rc-bg-azul" /><span className="rc-swatch-hex">#5AA9FF</span></div>
                  <div className="rc-swatch-item"><span className="rc-swatch-circulo rc-bg-azul-texto" /><span className="rc-swatch-hex">#2F7FE0</span></div>
                </div>
              </div>

              <div className="rc-campo-item">
                <span className="rc-subtitulo">Acento rojo</span>
                <div className="rc-swatch-circulos">
                  <div className="rc-swatch-item"><span className="rc-swatch-circulo rc-bg-rojo-suave" /><span className="rc-swatch-hex">#FDECEC</span></div>
                  <div className="rc-swatch-item"><span className="rc-swatch-circulo rc-bg-rojo" /><span className="rc-swatch-hex">#E5484D</span></div>
                  <div className="rc-swatch-item"><span className="rc-swatch-circulo rc-bg-rojo-texto" /><span className="rc-swatch-hex">#C2383D</span></div>
                </div>
              </div>

              <div className="rc-campo-item">
                <span className="rc-subtitulo">Verde</span>
                <div className="rc-swatch-item"><span className="rc-swatch-circulo rc-bg-verde" /><span className="rc-swatch-hex">#2FA66A</span></div>
              </div>

              <div className="rc-campo-item">
                <span className="rc-subtitulo">Ámbar</span>
                <div className="rc-swatch-item"><span className="rc-swatch-circulo rc-bg-ambar" /><span className="rc-swatch-hex">#E8A33D</span></div>
              </div>
            </div>
          </div>
        </section>

        {/* TIPOGRAFÍA */}
        <section className="rc-modulo" aria-labelledby="mod-tipografia">
          <h2 id="mod-tipografia" className="rc-modulo__titulo">TIPOGRAFÍA</h2>

          <div className="rc-tipografia-lista">
            <div className="rc-tipografia-fila">
              <span className="rc-tipografia-nombre">Título de página</span>
              <span className="rc-tipografia-espec">20/28 · Semibold</span>
            </div>
            <div className="rc-tipografia-fila">
              <span className="rc-tipografia-nombre">Título de sección</span>
              <span className="rc-tipografia-espec">15/22 · Semibold</span>
            </div>
            <div className="rc-tipografia-fila">
              <span className="rc-tipografia-nombre">Cuerpo</span>
              <span className="rc-tipografia-espec">13/20 · Regular</span>
            </div>
            <div className="rc-tipografia-fila">
              <span className="rc-tipografia-nombre">Secundario</span>
              <span className="rc-tipografia-espec">12/18 · Regular</span>
            </div>
            <div className="rc-tipografia-fila">
              <span className="rc-tipografia-nombre">Etiqueta</span>
              <span className="rc-tipografia-espec">11/16 · Mayúsculas + espaciado</span>
            </div>
            <div className="rc-tipografia-fila">
              <span className="rc-tipografia-nombre">Número grande</span>
              <span className="rc-tipografia-espec">24/30 · Semibold</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
