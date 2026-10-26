# API F2: Trabajos, Tareas y Facturas por Persona

Documentación completa de la API construida en la **PARTE A** de la Fase F2 de RConcept Systems.
Diseñada para que el frontend (`app/`, `components/`) consuma los servicios sin adivinar formatos, códigos de respuesta ni errores.

---

## 1. Generalidades de Autenticación y Formato

- **Autenticación:** Las rutas protegidas aceptan la cookie `httpOnly` llamada `rc_access_token` o el encabezado `Authorization: Bearer <token>`.
- **Formato:** Todas las peticiones con cuerpo envían `Content-Type: application/json`. Las respuestas son `application/json; charset=utf-8`.
- **Formato de errores estándar:**
  ```json
  {
    "error": {
      "codigo": "codigo_del_error",
      "mensaje": "Mensaje en español neutro legible por humanos."
    }
  }
  ```
- **Moneda:** Los precios están expresados en números enteros en **pesos colombianos (COP)** sin decimales (rango: 0 a 100.000.000).

---

## 2. Endpoints para Miembros Aprobados

### 2.1 Listar Trabajos Activos
- **Ruta:** `GET /api/trabajos`
- **Permisos:** Miembro aprobado (`es_miembro()`).
- **Respuesta (200 OK):**
  ```json
  [
    {
      "id": 1,
      "clave": "grabacion_video",
      "nombre": "Grabación de video",
      "rol_id": 1,
      "rol": {
        "id": 1,
        "clave": "camarografo",
        "nombre": "Camarógrafo",
        "color": "#2563EB",
        "orden": 1,
        "activo": true
      },
      "precio": 50000,
      "activo": true,
      "orden": 1,
      "creado_en": "2026-10-26T03:00:00Z"
    }
  ]
  ```

---

### 2.2 Listar Mis Tareas
- **Ruta:** `GET /api/tareas`
- **Filtros Query opcionales:** `?estado=pendiente|hecha|aceptada|rechazada|cancelada`
- **Permisos:** Miembro aprobado. Solo retorna las tareas asignadas al usuario autenticado.
- **Respuesta (200 OK):**
  ```json
  [
    {
      "id": 10,
      "tipo_id": 2,
      "tipo": {
        "id": 2,
        "clave": "edicion_video",
        "nombre": "Edición de video",
        "precio": 75000
      },
      "titulo": "Editar video promocional TikTok",
      "descripcion": "Cortes dinámicos y transiciones rápidas",
      "asignado_a": "uuid-miembro",
      "creado_por": "uuid-admin",
      "estado": "pendiente",
      "fecha_limite": "2026-10-30",
      "nota_persona": null,
      "motivo_rechazo": null,
      "precio_congelado": null,
      "factura_id": null,
      "creada_en": "2026-10-26T03:30:00Z",
      "hecha_en": null,
      "resuelta_en": null
    }
  ]
  ```

---

### 2.3 Marcar Tarea como Hecha
- **Ruta:** `POST /api/tareas/{id}/hecha`
- **Permisos:** Solo la persona asignada a la tarea. La tarea debe estar en estado `pendiente` o `rechazada`.
- **Cuerpo (opcional):**
  ```json
  {
    "nota": "Listo, video renderizado y subido a la carpeta compartida."
  }
  ```
- **Respuesta (200 OK):** Retorna la tarea con `estado: "hecha"`, `hecha_en` actualizado y el `motivo_rechazo` limpiado.
- **Errores:**
  - `404 Not Found` (`tarea_no_encontrada`): Si la tarea no existe o no pertenece al usuario autenticado (ocultamiento seguro).
  - `400 Bad Request` (`estado_invalido`): Si la tarea no está en estado `pendiente` ni `rechazada`.
  - `400 Bad Request` (`nota_demasiado_larga`): Si la nota supera los 500 caracteres.

---

### 2.4 Ver Mi Factura (Abierta e Historial)
- **Ruta:** `GET /api/facturas/mia`
- **Permisos:** Miembro aprobado. Solo consulta las facturas del usuario autenticado.
- **Respuesta (200 OK):**
  ```json
  {
    "abierta": {
      "id": 5,
      "perfil_id": "uuid-miembro",
      "estado": "abierta",
      "creada_en": "2026-10-26T03:35:00Z",
      "pagada_en": null,
      "pagada_por": null,
      "total": 125000,
      "lineas": [
        {
          "id": 10,
          "tipo_id": 2,
          "titulo": "Editar video promocional TikTok",
          "estado": "aceptada",
          "precio_congelado": 75000,
          "factura_id": 5
        },
        {
          "id": 11,
          "tipo_id": 1,
          "titulo": "Grabación en locación centro",
          "estado": "aceptada",
          "precio_congelado": 50000,
          "factura_id": 5
        }
      ]
    },
    "total_pendiente": 125000,
    "pagadas": [
      {
        "id": 2,
        "perfil_id": "uuid-miembro",
        "estado": "pagada",
        "creada_en": "2026-10-15T00:00:00Z",
        "pagada_en": "2026-10-20T18:00:00Z",
        "pagada_por": "uuid-admin",
        "total": 200000,
        "lineas": []
      }
    ],
    "total_pagado": 200000
  }
  ```

---

## 3. Endpoints de Administración (Solo Administrador)

Todos requieren `es_admin: true`. Cualquier usuario no administrador recibe `403 Forbidden` (`solo_admin`).

### 3.1 Listar Trabajos (Admin)
- **Ruta:** `GET /api/admin/trabajos`
- **Respuesta (200 OK):** Lista completa de trabajos, incluidos aquellos con `activo: false`.

### 3.2 Crear Tipo de Trabajo
- **Ruta:** `POST /api/admin/trabajos`
- **Cuerpo:**
  ```json
  {
    "clave": "animacion_motion",
    "nombre": "Animación Motion Graphics",
    "rol_id": 2,
    "precio": 90000,
    "activo": true,
    "orden": 4
  }
  ```
- **Respuesta (201 Created):** Retorna el tipo de trabajo creado.
- **Errores:**
  - `400 Bad Request` (`campos_requeridos` / `precio_invalido`).
  - `409 Conflict` (`trabajo_duplicado`): Si la clave ya existe.

### 3.3 Editar Tipo de Trabajo
- **Ruta:** `PATCH /api/admin/trabajos/{id}`
- **Cuerpo (campos parciales):**
  ```json
  {
    "nombre": "Edición y montaje de video",
    "precio": 85000,
    "activo": true,
    "rol_id": 2,
    "orden": 2
  }
  ```
- **Respuesta (200 OK):** Retorna el tipo de trabajo actualizado.
- **Nota:** Cambiar el precio de un trabajo **no altera** los precios congelados de tareas ya aceptadas.

---

### 3.4 Listar Tareas (Admin)
- **Ruta:** `GET /api/admin/tareas`
- **Filtros Query opcionales:** `?estado=hecha` y/o `?persona=uuid-perfil`
- **Respuesta (200 OK):**
  ```json
  {
    "tareas": [ ... ],
    "por_revisar": 3
  }
  ```
- **Nota:** `por_revisar` contiene el contador total de tareas en estado `hecha` para alimentar el indicador numérico del panel.

### 3.5 Crear Tarea
- **Ruta:** `POST /api/admin/tareas`
- **Cuerpo:**
  ```json
  {
    "tipo_id": 2,
    "asignado_a": "uuid-perfil-editor",
    "titulo": "Edición video canal principal",
    "descripcion": "Incluir intro y música aprobada",
    "fecha_limite": "2026-10-31",
    "forzar": false
  }
  ```
- **Validación de Rol y Forzado:**
  - Si el trabajo tiene un `rol_id` y la persona asignada **no** cuenta con ese rol:
    - Con `forzar: false` (por defecto): Responde `422 Unprocessable Entity` con mensaje explicativo indicando que la persona no tiene el rol correspondiente.
    - Con `forzar: true`: Permite la creación y responde `201 Created`.
- **Errores:**
  - `400 Bad Request` (`asignado_no_aprobado`): Si la persona está suspendida o pendiente.
  - `404 Not Found` (`tipo_no_encontrado` / `asignado_no_encontrado`).

### 3.6 Aceptar Tarea (Atómico)
- **Ruta:** `POST /api/admin/tareas/{id}/aceptar`
- **Comportamiento:**
  1. Comprueba que la tarea esté en estado `hecha`.
  2. Obtiene el precio vigente del tipo de trabajo.
  3. Busca o abre la factura `abierta` de la persona asignada.
  4. Congela el precio (`precio_congelado`), asocia el `factura_id`, marca `estado: "aceptada"`, registra `resuelta_en` y `resuelta_por`.
- **Concurrencia:** Protegido contra condiciones de carrera. Dos administradores aceptando a la vez no generan doble línea ni doble cobro.
- **Respuesta (200 OK):** Tarea aceptada.

### 3.7 Rechazar Tarea
- **Ruta:** `POST /api/admin/tareas/{id}/rechazar`
- **Cuerpo (obligatorio):**
  ```json
  {
    "motivo": "Faltaron las cortinillas finales requeridas por el cliente."
  }
  ```
- **Respuesta (200 OK):** Retorna la tarea con `estado: "rechazada"` y `motivo_rechazo`. La persona asignada podrá volver a corregirla y marcarla hecha.

### 3.8 Cancelar Tarea
- **Ruta:** `POST /api/admin/tareas/{id}/cancelar`
- **Permisos:** Solo admin. Solo permite cancelar tareas en estado `pendiente` o `rechazada`.
- **Respuesta (200 OK):** Retorna la tarea en estado `cancelada`.

---

### 3.9 Resumen de Facturas por Persona
- **Ruta:** `GET /api/admin/facturas`
- **Respuesta (200 OK):**
  ```json
  [
    {
      "perfil_id": "uuid-miembro-1",
      "perfil": {
        "id": "uuid-miembro-1",
        "nombre": "Eduardo Editor",
        "correo": "editor@rconcept.com"
      },
      "factura_abierta": {
        "id": 5,
        "total": 150000,
        "lineas": [ ... ]
      },
      "total_pendiente": 150000,
      "pagadas": [
        {
          "id": 1,
          "total": 220000,
          "pagada_en": "2026-10-15T10:00:00Z"
        }
      ],
      "total_pagado": 220000
    }
  ]
  ```

### 3.10 Detalle de Factura
- **Ruta:** `GET /api/admin/facturas/{id}`
- **Respuesta (200 OK):** Datos de la factura con sus líneas aceptadas y total.

### 3.11 Marcar Factura como Pagada
- **Ruta:** `POST /api/admin/facturas/{id}/pagar`
- **Comportamiento:** Pasa el estado de `abierta` a `pagada`, fija `pagada_en` al instante actual y `pagada_por` con el UUID del administrador. La siguiente tarea aceptada para esta persona abrirá una nueva factura abierta.
- **Errores:**
  - `400 Bad Request` (`factura_ya_pagada`): Si la factura ya no está abierta.
  - `404 Not Found` (`factura_no_encontrada`).
