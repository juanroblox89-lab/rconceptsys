# API F3: Grabación por Minuto, Clientes y Estadísticas

Documentación completa de la API extendida en la **PARTE A** de la Fase F3 de RConcept Systems.
Diseñada para que el frontend (`app/`, `components/`) consuma los servicios sin adivinar formatos, códigos de respuesta ni errores.

---

## 1. Generalidades de Autenticación, Formato y Zona Horaria

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
- **Zona horaria:** Todos los cálculos de fechas, inicios de mes, semanas y agrupaciones diarias se calculan en zona **America/Bogota** (UTC-5, sin horario de verano).
- **Moneda y precisión:** Precios y acumulados se manejan como enteros en pesos colombianos (COP). Los totales y precios congelados soportan números enteros de 64 bits (`bigint`/`int64`, tope razonable 100.000.000.000 COP).

---

## 2. Tipos de Trabajo (Unidad de Cobro)

Cada tipo de trabajo posee una unidad de cobro:
- `"trabajo"`: Cobro por trabajo realizado (edición, subida, etc.). Cantidad implícita: 1.
- `"minuto"`: Cobro por minuto grabado (`precio_por_minuto × minutos_grabados`).

### 2.1 Listar Trabajos
- **Rutas:**
  - `GET /api/trabajos` (miembros aprobados: solo activos)
  - `GET /api/admin/trabajos` (admin: todos)
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
      "precio": 1500,
      "unidad": "minuto",
      "activo": true,
      "orden": 1,
      "creado_en": "2026-10-26T03:00:00Z"
    }
  ]
  ```

### 2.2 Crear Tipo de Trabajo (Admin)
- **Ruta:** `POST /api/admin/trabajos`
- **Cuerpo:**
  ```json
  {
    "clave": "grabacion_podcast",
    "nombre": "Grabación de podcast",
    "rol_id": 1,
    "precio": 2000,
    "unidad": "minuto",
    "activo": true,
    "orden": 4
  }
  ```
- **Nota:** `unidad` es opcional, por defecto `"trabajo"`. Valores aceptados: `"trabajo"` o `"minuto"`.
- **Respuesta:** `201 Created` con el objeto `TipoTrabajo`.

### 2.3 Editar Tipo de Trabajo (Admin)
- **Ruta:** `PATCH /api/admin/trabajos/{id}`
- **Cuerpo (parcial):**
  ```json
  {
    "unidad": "minuto",
    "precio": 1800
  }
  ```
- **Nota:** Cambiar la unidad o el precio de un tipo de trabajo NO altera las tareas ya aceptadas ni sus facturas asociadas.

---

## 3. Clientes

Tabla para asociar tareas a clientes específicos.

### 3.1 Listar Clientes
- **Rutas:**
  - `GET /api/clientes` (miembros aprobados: solo activos, ordenados por nombre alfabéticamente)
  - `GET /api/admin/clientes` (admin: todos, activos e inactivos)
- **Respuesta (200 OK):**
  ```json
  [
    {
      "id": 1,
      "nombre": "Alcaldía de Bucaramanga",
      "activo": true,
      "creado_en": "2026-10-26T10:00:00Z"
    }
  ]
  ```

### 3.2 Crear Cliente (Admin)
- **Ruta:** `POST /api/admin/clientes`
- **Cuerpo:**
  ```json
  {
    "nombre": "Restaurante La Casona"
  }
  ```
- **Validaciones:**
  - `nombre`: 1 a 80 caracteres.
  - Nombre único insensible a mayúsculas.
- **Respuesta:** `201 Created` con el objeto `Cliente` (`activo: true`).
- **Errores:**
  - `400 Bad Request` (`nombre_invalido`): Nombre vacío o mayor a 80 caracteres.
  - `409 Conflict` (`cliente_duplicado`): Ya existe un cliente con ese nombre.

### 3.3 Editar Cliente (Admin)
- **Ruta:** `PATCH /api/admin/clientes/{id}`
- **Cuerpo (parcial):**
  ```json
  {
    "nombre": "Restaurante La Casona Gourmet",
    "activo": false
  }
  ```
- **Respuesta:** `200 OK` con el objeto `Cliente` actualizado.
- **Errores:**
  - `404 Not Found` (`cliente_no_encontrado`)
  - `409 Conflict` (`cliente_duplicado`)

---

## 4. Tareas (Cliente, Minutos y Congelación)

### 4.1 Crear Tarea con Cliente Opcional (Admin)
- **Ruta:** `POST /api/admin/tareas`
- **Cuerpo:**
  ```json
  {
    "tipo_id": 1,
    "cliente_id": 1,
    "asignado_a": "uuid-miembro",
    "titulo": "Grabación video institucional",
    "descripcion": "2 horas de rodaje en instalaciones",
    "fecha_limite": "2026-11-05",
    "forzar": false
  }
  ```
- **Validación:** Si se envía `cliente_id`, el cliente debe existir y tener `activo: true`. De lo contrario retorna `400 Bad Request` (`cliente_invalido`).

### 4.2 Marcar Tarea como Hecha (Miembro Asignado)
- **Ruta:** `POST /api/tareas/{id}/hecha`
- **Cuerpo:**
  ```json
  {
    "nota": "Grabación finalizada con éxito",
    "cantidad": 120
  }
  ```
- **Validaciones según tipo de trabajo:**
  - Si el tipo es `"minuto"`: `cantidad` es **obligatorio** y debe ser un entero entre 1 y 1440. Si falta o está fuera de rango retorna `400 Bad Request` (`cantidad_invalida`).
  - Si el tipo es `"trabajo"`: `cantidad` es ignorado (se guarda `null`).

### 4.3 Aceptar Tarea con Corrección Opcional de Cantidad (Admin)
- **Ruta:** `POST /api/admin/tareas/{id}/aceptar`
- **Cuerpo (opcional):**
  ```json
  {
    "cantidad": 115
  }
  ```
- **Comportamiento:**
  - Si el tipo es `"minuto"`: Toma `body.cantidad` si se especifica; si no, toma la cantidad reportada por el usuario en la tarea. Verifica que esté entre 1 y 1440. Total = `precio_unitario × cantidad`.
  - Si el tipo es `"trabajo"`: Cantidad aceptada se fija en 1. Total = `precio_unitario`.
  - Congela en la tarea:
    - `precio_unitario_congelado`
    - `cantidad_aceptada`
    - `precio_congelado` (total)
    - `factura_id`
  - Respuestas incluyen `cliente`, `cantidad`, `cantidad_aceptada`, `precio_unitario_congelado`, `precio_congelado` y el tipo con su `unidad`.

---

## 5. Facturas

- `GET /api/facturas/mia` (miembro autenticado)
- `GET /api/admin/facturas` (admin: resumen de todas las personas)
- `GET /api/admin/facturas/{id}` (admin: detalle con líneas)

Cada línea de factura (`Tarea`) incluye:
```json
{
  "id": 10,
  "tipo_id": 1,
  "tipo": {
    "id": 1,
    "nombre": "Grabación de video",
    "unidad": "minuto",
    "precio": 1500
  },
  "cliente_id": 1,
  "cliente": {
    "id": 1,
    "nombre": "Alcaldía de Bucaramanga"
  },
  "titulo": "Grabación video institucional",
  "estado": "aceptada",
  "cantidad": 120,
  "cantidad_aceptada": 120,
  "precio_unitario_congelado": 1500,
  "precio_congelado": 180000,
  "factura_id": 5
}
```
Fórmula visible en factura: `"120 min × $ 1.500 = $ 180.000"`.

---

## 6. Estadísticas

### 6.1 Mis Estadísticas
- **Ruta:** `GET /api/yo/estadisticas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`
- **Permisos:** Cualquier miembro aprobado.
- **Comportamiento:**
  - Sin parámetros: Consulta TODO el tiempo.
  - Siempre incluye `este_mes` y `total` ya calculados para mostrar tarjetas resumen sin llamadas adicionales.
  - Solo cuenta tareas con `estado == 'aceptada'` del usuario autenticado.
- **Respuesta (200 OK):**
  ```json
  {
    "trabajos": 12,
    "minutos": 450,
    "valor": 1250000,
    "por_tipo": [
      {
        "tipo_id": 1,
        "nombre": "Grabación de video",
        "unidad": "minuto",
        "trabajos": 5,
        "minutos": 450,
        "valor": 675000
      },
      {
        "tipo_id": 2,
        "nombre": "Edición de video",
        "unidad": "trabajo",
        "trabajos": 7,
        "minutos": 0,
        "valor": 575000
      }
    ],
    "rango": {
      "desde": "2026-10-01",
      "hasta": "2026-10-31"
    },
    "este_mes": {
      "trabajos": 8,
      "minutos": 300,
      "valor": 900000
    },
    "total": {
      "trabajos": 20,
      "minutos": 750,
      "valor": 2100000
    }
  }
  ```

### 6.2 Estadísticas de Administración
- **Ruta:** `GET /api/admin/estadisticas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&agrupar=dia|semana|mes&persona_id=&cliente_id=&tipo_id=`
- **Permisos:** Solo administradores (`403 Forbidden` para miembros).
- **Parámetros Query opcionales:**
  - `desde`: Fecha de inicio `YYYY-MM-DD` (por defecto 30 días atrás).
  - `hasta`: Fecha fin `YYYY-MM-DD` (por defecto hoy en hora de Bogotá; incluye el día completo).
  - `agrupar`: `"dia"`, `"semana"` o `"mes"`.
    - Si no se especifica:
      - Rango <= 92 días: usa `"dia"`.
      - Rango > 92 días y < 365 días: usa `"semana"`.
      - Rango >= 365 días: usa `"mes"`.
  - `persona_id`: Filtra por UUID del miembro asignado.
  - `cliente_id`: Filtra por ID de cliente, o `"sin_cliente"` / `"0"` / `"null"` para tareas sin cliente.
  - `tipo_id`: Filtra por ID de tipo de trabajo.
- **Respuesta (200 OK):**
  ```json
  {
    "rango": {
      "desde": "2026-10-01",
      "hasta": "2026-10-26",
      "agrupar": "dia"
    },
    "totales": {
      "trabajos": 15,
      "minutos": 600,
      "valor": 1500000,
      "personas": 3,
      "clientes": 2
    },
    "serie": [
      {
        "fecha": "2026-10-01",
        "trabajos": 0,
        "minutos": 0,
        "valor": 0
      },
      {
        "fecha": "2026-10-02",
        "trabajos": 3,
        "minutos": 120,
        "valor": 250000
      }
    ],
    "por_persona": [
      {
        "perfil_id": "uuid-1",
        "nombre": "Carlos Gómez",
        "foto": null,
        "trabajos": 8,
        "minutos": 350,
        "valor": 800000
      }
    ],
    "por_cliente": [
      {
        "cliente_id": 1,
        "nombre": "Alcaldía de Bucaramanga",
        "trabajos": 10,
        "minutos": 400,
        "valor": 1000000
      },
      {
        "cliente_id": null,
        "nombre": "Sin cliente",
        "trabajos": 5,
        "minutos": 200,
        "valor": 500000
      }
    ],
    "por_tipo": [
      {
        "tipo_id": 1,
        "nombre": "Grabación de video",
        "unidad": "minuto",
        "trabajos": 7,
        "minutos": 600,
        "valor": 900000
      }
    ],
    "hay_mas": {
      "por_persona": false,
      "por_cliente": false,
      "por_tipo": false
    },
    "este_mes": {
      "trabajos": 8,
      "minutos": 350,
      "valor": 800000
    },
    "total": {
      "trabajos": 20,
      "minutos": 750,
      "valor": 2100000
    }
  }
  ```
- **Detalles:**
  - `serie`: Rellena huecos en 0 para cada intervalo (`dia`, `semana`, `mes`).
  - Listas `por_persona`, `por_cliente` y `por_tipo` ordenadas de mayor a menor por trabajos (empate por valor), limitadas a 20 filas cada una, con indicador en `hay_mas`.
  - Tareas sin cliente agrupadas bajo `cliente_id: null` y nombre `"Sin cliente"`.
  - Validación de rango: `desde <= hasta`, rango máximo 5 años (`400 Bad Request`).
  - **F3C:** Cuando se provee `persona_id`, la respuesta incluye opcionalmente `este_mes` y `total` (`{ trabajos, minutos, valor }`) calculados sobre el histórico de dicha persona en hora de Bogotá, lo que permite alimentar directamente componentes de estadísticas individuales (`TrabajosHechos`) sin consultas adicionales. Si no se provee `persona_id`, estos campos se omiten.
