# Sistema de Diseño RC-Kit — Guía de Diseño y Referencia

Documentación de referencia del sistema de diseño neumórfico con Liquid Glass (**RC-Kit**). Todos los estilos y componentes están construidos con CSS puro (variables `:root`, sin frameworks externos, fuente Inter de Google Fonts).

---

## 1. Tabla de Tokens de Diseño (`css/tokens.css`)

### 1.1 Superficie Neumórfica y Luces
| Token | Valor | Descripción |
|---|---|---|
| `--rc-superficie` | `#ECEEF3` | Fondo base neumórfico |
| `--rc-superficie-clara` | `#F2F4F8` | Resalte de superficie elevado |
| `--rc-superficie-hundida` | `#E5E8F0` | Fondo de rieles y hendiduras |
| `--rc-luz` | `#FFFFFF` | Blanco puro de luz directa |
| `--rc-sombra` | `#A3ACBE` | Tono base de sombras neumórficas |
| `--rc-sombra-suave` | `rgba(163, 172, 190, 0.42)` | Sombra difusa exterior |
| `--rc-sombra-fuerte` | `rgba(163, 172, 190, 0.62)` | Sombra intensa para contraste |
| `--rc-luz-suave` | `rgba(255, 255, 255, 0.88)` | Luz difusa en bisel superior |
| `--rc-luz-fuerte` | `rgba(255, 255, 255, 0.96)` | Luz nítida en bisel superior |

### 1.2 Escala de Grises y Textos
| Token | Valor | Descripción |
|---|---|---|
| `--rc-gris-50` | `#F4F5F8` | Gris ultra claro para fondos tenues |
| `--rc-gris-100` | `#E3E7EE` | Borde y divisor sutil |
| `--rc-gris-300` | `#C7CDD8` | Rieles inactivos y bordes |
| `--rc-gris-500` | `#8A93A5` | Etiquetas mayúsculas y textos tenues |
| `--rc-gris-700` | `#4A5262` | Gris neutro estándar para iconos y texto secundario |
| `--rc-gris-900` | `#1F2430` | Grafito oscuro para títulos y texto principal |
| `--rc-texto` | `#1F2430` | Color base de lectura |
| `--rc-texto-secundario` | `#6B7385` | Subtítulos y descripciones |
| `--rc-texto-tenue` | `#8A93A5` | Separadores y metadatos |

### 1.3 Iconos
| Token | Valor | Descripción |
|---|---|---|
| `--rc-icono` | `var(--rc-gris-700)` | Gris neutro estándar para todos los iconos neutros |
| `--rc-icono-activo` | `var(--rc-azul-texto)` | Azul texto para iconos activos / seleccionados |

### 1.4 Colores Semánticos y de Acento
| Token | Valor | Descripción |
|---|---|---|
| `--rc-azul` | `#5AA9FF` | Azul acento principal |
| `--rc-azul-suave` | `#EAF3FF` | Fondo azul tenue para estados activos |
| `--rc-azul-texto` | `#2F7FE0` | Azul de alto contraste para textos y enlaces (mínimo 4.5:1) |
| `--rc-azul-oscuro` | `#134E9B` | Azul oscuro de alto contraste (6.5:1 sobre liquid glass) para botones liquid glass y pestañas activas |
| `--rc-azul-halo` | `rgba(90, 169, 255, 0.28)` | Halo de foco azul |
| `--rc-azul-tinte` | `rgba(90, 169, 255, 0.14)` | Tinte transparente para hover |
| `--rc-rojo` | `#E5484D` | Rojo para peligro y errores |
| `--rc-rojo-suave` | `#FDECEC` | Fondo rojo tenue |
| `--rc-rojo-texto` | `#C2383D` | Texto rojo accesible |
| `--rc-rojo-halo` | `rgba(229, 72, 77, 0.24)` | Halo de foco en error |
| `--rc-rojo-tinte` | `rgba(229, 72, 77, 0.14)` | Tinte de hover para peligro |
| `--rc-verde` | `#2FA66A` | Verde para éxito y estado activo |
| `--rc-verde-suave` | `#E7F6EE` | Fondo verde tenue |
| `--rc-verde-texto` | `#238252` | Texto verde accesible |
| `--rc-verde-tinte` | `rgba(47, 166, 106, 0.13)` | Tinte de hover verde |
| `--rc-ambar` | `#E8A33D` | Ámbar para advertencias y pendientes |
| `--rc-ambar-suave` | `#FDF3E4` | Fondo ámbar tenue |
| `--rc-ambar-texto` | `#B9781A` | Texto ámbar accesible |
| `--rc-ambar-tinte` | `rgba(232, 163, 61, 0.14)` | Tinte ámbar |
| `--rc-morado` | `#9B6BFF` | Púrpura para roles y acentos |

### 1.5 Material Liquid Glass (`.rc-vidrio`)
| Token | Valor | Descripción |
|---|---|---|
| `--rc-vidrio-bg` | `linear-gradient(...)` | Fondo de vidrio neutro |
| `--rc-vidrio-azul-bg` | `linear-gradient(...)` | Fondo de vidrio con tinte azul |
| `--rc-vidrio-rojo-bg` | `linear-gradient(...)` | Fondo de vidrio con tinte rojo |
| `--rc-vidrio-verde-bg` | `linear-gradient(...)` | Fondo de vidrio con tinte verde |
| `--rc-vidrio-ambar-bg` | `linear-gradient(...)` | Fondo de vidrio con tinte ámbar |
| `--rc-vidrio-oscuro-bg` | `linear-gradient(...)` | Fondo de vidrio oscuro para tooltips |
| `--rc-vidrio-borde` | `linear-gradient(...)` | Borde biselado de vidrio |
| `--rc-vidrio-borde-azul` | `linear-gradient(...)` | Borde biselado azul |
| `--rc-vidrio-borde-rojo` | `linear-gradient(...)` | Borde biselado rojo |
| `--rc-vidrio-brillo-esquina` | `radial-gradient(...)` | Brillo especular en esquina |
| `--rc-vidrio-filtro` | `blur(14px) saturate(1.6) brightness(1.05)` | Desenfoque y saturación de fondo |
| `--rc-vidrio-filtro-svg` | `url(#rc-refraccion) ...` | Refracción SVG con turbulencia |
| `--rc-mancha-blur` | `blur(16px)` | Difuminado de manchas orgánicas |

### 1.6 Elevaciones y Sombras
| Token | Valor | Descripción |
|---|---|---|
| `--rc-elev-plano` | `0 0 0 rgba(0, 0, 0, 0), inset 0 0 0 1px rgba(199, 205, 216, 0.55)` | Borde plano tenue |
| `--rc-elev-relieve-sm` | `-3px -3px 6px var(--rc-luz-suave), 3px 3px 7px var(--rc-sombra-suave)` | Relieve neumórfico pequeño |
| `--rc-elev-relieve-md` | `-5px -5px 10px var(--rc-luz-fuerte), 5px 5px 11px var(--rc-sombra-suave)` | Relieve neumórfico medio (tarjetas) |
| `--rc-elev-relieve-lg` | `-8px -8px 16px var(--rc-luz-fuerte), 8px 8px 18px var(--rc-sombra-fuerte)` | Relieve neumórfico grande |
| `--rc-elev-hundido-sm` | `inset 2px 2px 5px rgba(163, 172, 190, 0.52), inset -2px -2px 5px var(--rc-luz-suave)` | Hendidura neumórfica pequeña (inputs) |
| `--rc-elev-hundido-md` | `inset 3px 3px 7px rgba(163, 172, 190, 0.62), inset -3px -3px 7px var(--rc-luz-fuerte)` | Hendidura profunda |
| `--rc-elev-vidrio` | `inset 1px 1px 1px ..., 0 8px 24px rgba(30, 40, 60, 0.10)` | Sombra flotante de vidrio |
| `--rc-elev-vidrio-azul` | `inset 1px 1px 1px ..., 0 8px 20px rgba(47, 127, 224, 0.22)` | Sombra flotante de vidrio azul |
| `--rc-elev-vidrio-rojo` | `inset 1px 1px 1px ..., 0 8px 20px rgba(229, 72, 77, 0.20)` | Sombra flotante de vidrio rojo |
| `--rc-elev-foco-azul` | `inset 2px ..., 0 0 0 1.5px var(--rc-azul), 0 0 10px var(--rc-azul-halo)` | Anillo de foco accesible |
| `--rc-elev-radio-activo` | `0 0 0 1.5px var(--rc-azul-texto)` | Anillo de radio activo |
| `--rc-elev-presencia` | `0 0 0 1.5px var(--rc-superficie)` | Anillo de corte para badges |
| `--rc-elev-error-rojo` | `inset 2px ..., 0 0 0 1px var(--rc-rojo), 0 0 8px var(--rc-rojo-halo)` | Anillo de foco con error |
| `--rc-elev-perilla` | `0 2px 4px rgba(31, 36, 48, 0.22), 0 1px 2px rgba(163, 172, 190, 0.50)` | Sombra nítida para perillas blancas |
| `--rc-borde-perilla` | `rgba(163, 172, 190, 0.70)` | Borde de contraste para perillas blancas sobre rieles |

### 1.7 Radios de Borde
| Token | Valor | Uso |
|---|---|---|
| `--rc-radio-xs` | `6px` | Botones mini, tags internos |
| `--rc-radio-sm` | `8px` | Badges, ítems de navegación |
| `--rc-radio-md` | `12px` | Paneles secundarios, barras |
| `--rc-radio-lg` | `16px` | Módulos del tablero |
| `--rc-radio-xl` | `20px` | Tarjetas grandes, modales |
| `--rc-radio-pildora` | `999px` | Botones píldora, chips, perillas |

### 1.8 Tipografía y Espaciado
| Token | Valor | Uso |
|---|---|---|
| `--rc-fuente` | `'Inter', system-ui...` | Familia tipográfica única |
| `--rc-fs-titulo-pagina` / `--rc-lh-titulo-pagina` | `20px` / `28px` | Encabezado principal del dashboard |
| `--rc-fs-titulo-seccion` / `--rc-lh-titulo-seccion` | `15px` / `22px` | Título de módulo |
| `--rc-fs-cuerpo` / `--rc-lh-cuerpo` | `13px` / `20px` | Texto general de lectura |
| `--rc-fs-secundario` / `--rc-lh-secundario` | `12px` / `18px` | Texto secundario y metadatos |
| `--rc-fs-etiqueta` / `--rc-lh-etiqueta` | `11px` / `16px` | Rótulos de campos y botones |
| `--rc-fs-micro` / `--rc-lh-micro` | `10px` / `14px` | Ítems de navegación y tags |
| `--rc-fs-xs` / `--rc-lh-xs` | `9.5px` / `13px` | Subtítulos de bloque (`.rc-subtitulo`) |
| `--rc-fw-regular` / `--rc-fw-medio` / `--rc-fw-semibold` / `--rc-fw-bold` | `400` / `500` / `600` / `700` | Pesos de fuente |
| `--rc-transicion-rapida` / `--rc-transicion` / `--rc-transicion-lenta` | `120ms` / `160ms` / `200ms` | Curvas de animación unificadas |

---

## 2. Catálogo de Componentes (`css/componentes.css`)

### 1. Botones (`.rc-btn`)
Botones táctiles con bisel neumórfico suave o acabado liquid glass.

- **Clase base:** `.rc-btn`
- **Variantes:**
  - `.rc-btn--primario`: fondo neumórfico con resalte
  - `.rc-btn--vidrio.rc-vidrio--azul`: botón primario liquid glass con texto legible `--rc-azul-texto`
  - `.rc-btn--secundario`: fondo secundario con texto grafito
  - `.rc-btn--fantasma`: fondo transparente, texto azul con hover sutil
  - `.rc-btn--peligro`: fondo rojo tenue con texto e icono rojo
  - `.rc-btn--pildora`: botón con icono inicial y chevron final
  - `.rc-btn--icono`: botón cuadrado compacto para un solo icono
  - `.rc-btn--sm`: tamaño reducido para tablas o estados
- **Estados:** Normal, `:hover`, `:active` (hundido), `:disabled` (`opacity: 0.45`), Cargando (`.rc-spinner`)

```html
<!-- Ejemplo: Botón Primario Liquid Glass -->
<div class="rc-escena-vidrio">
  <span class="rc-mancha rc-mancha--azul" aria-hidden="true"></span>
  <button type="button" class="rc-btn rc-btn--vidrio rc-vidrio rc-vidrio--azul">Crear</button>
</div>

<!-- Ejemplo: Botón con Icono (Peligro) -->
<button type="button" class="rc-btn rc-btn--peligro">
  <svg class="rc-icono rc-icono--rojo"><use href="#rc-ico-papelera"/></svg>
  Eliminar
</button>
```

---

### 2. Campos de Entrada (`.rc-input`, `.rc-select`, `.rc-textarea`)
Campos con hendidura interior neumórfica y foco suave en azul acento.

- **Clases base:** `.rc-input-contenedor`, `.rc-input`, `.rc-select`, `.rc-textarea`
- **Variantes:**
  - `.rc-input-contenedor--pildora`: forma de píldora redondeada para búsqueda
  - `.rc-input-contenedor--error`: borde rojo e indicador de error obligatorio
  - `.rc-select-wrap`: contenedor con chevron dropdown integrado
- **Estados:** Normal, `:focus-within` (anillo de foco azul), error, `:disabled`

```html
<!-- Ejemplo: Campo con Icono de Búsqueda -->
<div class="rc-input-contenedor rc-input-contenedor--pildora">
  <svg class="rc-icono"><use href="#rc-ico-buscar"/></svg>
  <input type="search" class="rc-input" placeholder="Buscar contenido...">
</div>

<!-- Ejemplo: Campo con Error -->
<div class="rc-campo-item">
  <div class="rc-input-contenedor rc-input-contenedor--error">
    <svg class="rc-icono"><use href="#rc-ico-correo"/></svg>
    <input type="email" class="rc-input" placeholder="Correo..." aria-invalid="true">
  </div>
  <span class="rc-error-mensaje">Este campo es obligatorio</span>
</div>
```

---

### 3. Controles de Selección (`.rc-check`, `.rc-radio`, `.rc-switch`, `.rc-slider`)
Selectores binarios y continuos táctiles con perillas blancas visibles.

- **Clases:**
  - `.rc-check`: casilla accesible con icono check v1
  - `.rc-radio`: opción de radio redonda con punto interior
  - `.rc-switch`, `.rc-switch__perilla`: interruptor con perilla blanca sólida y sombra
  - `.rc-slider`, `.rc-slider__perilla`: riel deslizante con perilla blanca sólida

```html
<!-- Ejemplo: Switch Interactivo -->
<div class="rc-switch" role="switch" aria-checked="true" tabindex="0">
  <span class="rc-switch__perilla rc-vidrio"></span>
</div>

<!-- Ejemplo: Slider con Riel y Progreso -->
<div class="rc-slider">
  <div class="rc-slider__riel">
    <div class="rc-slider__progreso" style="width: 48%;"></div>
  </div>
  <span class="rc-slider__perilla" style="left: 48%;"></span>
  <input type="range" class="rc-slider__input" min="0" max="100" value="48">
</div>
```

---

### 4. Chips, Estados y Contador de Notificaciones
Insignias de rol, chips de presencia y burbujas de notificación.

- **Clases:**
  - `.rc-chip`: chip interactivo con punto de color (`.rc-punto--azul`, etc.)
  - `.rc-estado`: insignia redondeada de estado (`--aprobado`, `--pendiente`, `--suspendido`, `--error`)
  - `.rc-notificacion-demo`: caja contenedora de campana
  - `.rc-contador`: burbuja de vidrio con número en alto contraste

```html
<!-- Ejemplo: Chip de Rol -->
<span class="rc-chip">
  <span class="rc-punto rc-punto--azul"></span>
  Editor
</span>

<!-- Ejemplo: Contador de Notificaciones -->
<div class="rc-notificacion-demo" title="Notificaciones">
  <div class="rc-notificacion-base rc-vidrio">
    <svg class="rc-icono"><use href="#rc-ico-campana"/></svg>
  </div>
  <span class="rc-contador rc-vidrio rc-vidrio--azul">3</span>
</div>
```

---

### 5. Tarjetas y Paneles (`.rc-card`)
Superficies modulares para agrupar información.

- **Clase base:** `.rc-card`
- **Variantes:**
  - `.rc-card--simple`: tarjeta con miniatura cuadrada, título y botón de opciones
  - `.rc-card--encabezado`: avatar de equipo, contador de miembros y botón de acción
  - `.rc-card--estadistica`: número grande, porcentaje de incremento y gráfica sparkline
  - `.rc-card--vacia`: estado vacío con icono de documento y texto tenue

```html
<!-- Ejemplo: Tarjeta con Encabezado -->
<div class="rc-card">
  <div class="rc-card__encabezado">
    <div class="rc-card__autor">
      <div class="rc-card__icono-circular"><svg class="rc-icono rc-icono--azul"><use href="#rc-ico-usuario"/></svg></div>
      <div><div class="rc-card__titulo">Equipo de contenido</div><div class="rc-card__subtitulo">12 miembros</div></div>
    </div>
  </div>
  <p class="rc-card__texto">Planificación y producción editorial.</p>
  <button type="button" class="rc-btn rc-btn--sm">Ver detalles</button>
</div>
```

---

### 6. Navegación (`.rc-nav-*`)
Sistema de barras laterales, barra superior, pestañas flotantes y paginación.

- **Estructura en 3 columnas:**
  - Columna A: `.rc-nav-lateral--amplia` con ítems de 32px de altura
  - Columna B: `.rc-nav-lateral--colapsada` con iconos centrados de 32px
  - Columna C: `.rc-nav-col-derecha` con separación uniforme de 16px entre:
    - Barra superior (`.rc-barra-superior`)
    - Pestañas flotantes (`.rc-tabs`, `.rc-tab` con texto `--rc-azul-oscuro` al estar activa)
    - Fila inferior (`.rc-migas` y `.rc-paginacion`)

```html
<!-- Ejemplo: Pestañas Flotantes de Vidrio -->
<div class="rc-escena-vidrio rc-escena-vidrio--bloque">
  <span class="rc-mancha rc-mancha--azul" aria-hidden="true"></span>
  <div class="rc-tabs rc-vidrio" role="tablist">
    <button type="button" class="rc-tab" role="tab" aria-selected="true">General</button>
    <button type="button" class="rc-tab" role="tab" aria-selected="false">Producción</button>
  </div>
</div>

<!-- Ejemplo: Barra Lateral Compacta -->
<nav class="rc-nav-lateral rc-nav-lateral--amplia" aria-label="Navegación">
  <a href="#inicio" class="rc-nav-item rc-nav-item--activo">
    <svg class="rc-icono rc-icono--azul"><use href="#rc-ico-inicio"/></svg>
    <span>Inicio</span>
  </a>
</nav>
```

---

### 7. Tablas y Datos (`.rc-tabla`, `.rc-lista-avatar`, `.rc-skeleton-card`)
Visualización de tablas de datos, listas con usuario y esqueletos de carga.

- **Clases:**
  - `.rc-tabla-contenedor`, `.rc-tabla`, `.rc-tabla__fila`: tabla con filas seleccionables
  - `.rc-lista-avatar`, `.rc-lista-item`: lista compacta con avatar y hora
  - `.rc-skeleton-card`, `.rc-skeleton-fila`: animación pulsante de carga

```html
<!-- Ejemplo: Fila de Tabla de Datos -->
<tr class="rc-tabla__fila rc-tabla__fila--seleccionada">
  <td>
    <div class="rc-tabla__usuario">
      <div class="rc-avatar rc-avatar--24"><div class="rc-avatar__interior"><svg width="24" height="24"><use href="#rc-ava-mujer-1"/></svg></div></div>
      <span>Ana Torres</span>
    </div>
  </td>
  <td>Editor</td>
  <td><span class="rc-estado-tabla rc-estado--aprobado"><span class="rc-punto rc-punto--verde"></span>Activo</span></td>
  <td>12 abr</td>
</tr>
```

---

### 8. Avisos y Diálogos (`.rc-toast`, `.rc-modal`, `.rc-menu`)
Notificaciones temporales tipo toast, modal de confirmación y menú desplegable contextual.
En este módulo, los iconos utilizan los dibujos originales con sufijo `-v2` (`rc-ico-check-v2`, `rc-ico-cerrar-v2`, etc.).

- **Clases:**
  - `.rc-toast`: aviso tipo toast con mancha de color (`--exito`, `--info`, `--advertencia`, `--error`)
  - `.rc-modal`: ventana modal neumórfica con título, texto y acciones primarias/secundarias
  - `.rc-menu`: menú contextual flotante en liquid glass

```html
<!-- Ejemplo: Toast de Éxito Liquid Glass -->
<div class="rc-escena-vidrio rc-escena-vidrio--bloque">
  <span class="rc-mancha rc-mancha--verde" aria-hidden="true"></span>
  <div class="rc-toast rc-toast--exito rc-vidrio" role="status">
    <span class="rc-toast__icono"><svg class="rc-icono rc-icono--sm"><use href="#rc-ico-check-v2"/></svg></span>
    <div class="rc-toast__contenido"><span class="rc-toast__titulo">Cambios guardados</span></div>
    <button type="button" class="rc-toast__cerrar" aria-label="Cerrar"><svg class="rc-icono rc-icono--sm"><use href="#rc-ico-cerrar-v2"/></svg></button>
  </div>
</div>
```

---

### 9. Mensajería / Chat (`.rc-chat`, `.rc-burbuja`)
Burbujas de mensajería con soporte de autor propio y externo, campo de envío y clip de adjuntos.

```html
<!-- Ejemplo: Burbuja de Mensaje Propia -->
<div class="rc-burbuja rc-burbuja--propia">
  <div class="rc-burbuja__texto">El diseño del kit está listo para revisión.</div>
  <div class="rc-burbuja__hora">10:45</div>
</div>
```

---

### 10. Avatares e Iconos (`.rc-avatar`, `.rc-icono`)
Avatares ilustrados vectoriales y sistema de iconos SVG escalables.

```html
<!-- Ejemplo: Avatar Ilustrado 32px -->
<div class="rc-avatar rc-avatar--32">
  <div class="rc-avatar__interior"><svg width="30" height="30"><use href="#rc-ava-hombre-1"/></svg></div>
  <span class="rc-avatar__estado"></span>
</div>

<!-- Ejemplo: Icono Neutro SVG Reutilizable -->
<svg class="rc-icono"><use href="#rc-ico-ajustes"/></svg>
```
