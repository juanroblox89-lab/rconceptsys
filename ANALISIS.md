# RConcept Systems v2 — Análisis de uso, roles y casos

> Complementa `PLAN.md`. Aquí se decide **quién hace qué** y **qué pasa en cada situación**, antes de escribir código.
> Basado en cómo se usaba de verdad el sistema viejo (tag `legacy-v1`) y en lo que falló ahí.
> Las decisiones marcadas **[Juan]** esperan tu confirmación; el resto es la propuesta por defecto.

---

## 1. Para qué se usa (el trabajo real de la agencia)

Rohlfing produce contenido para negocios (restaurantes, droguerías, marcas locales): graba, edita, diseña, publica y administra redes, y vende paquetes (TV, Digital, Mixtos). El sistema sirve para cinco cosas, en este orden de importancia:

1. **Que cada persona sepa qué tiene que hacer hoy** y lo marque cuando lo hace.
2. **Que el admin vea el estado de cada cliente y cada pieza** sin preguntar por WhatsApp.
3. **Que cada trabajo hecho se pague correctamente**, sin que nadie invente montos ni se pierda nada.
4. **Que las ventas no se pierdan** (leads, visitas en la calle, seguimiento).
5. **Que el conocimiento del equipo quede escrito** (formatos, hooks, SOPs, referencias).

Lo que **no** es: no es una app para clientes (los clientes no entran), no es contabilidad formal ni facturación electrónica DIAN, no es un editor de video.

---

## 2. Lo que falló en el sistema viejo (y no se repite)

| Problema en legacy-v1 | Por qué confundía | Cómo se resuelve en v2 |
|---|---|---|
| **Un solo rol por usuario** (`editor`, `camarógrafo`, `creador 360`…) | Alguien que graba y edita no cabía; se inventó "creador 360" como comodín y un botón "asignar creador 360 a los perdidos" | Roles separados en **acceso** (qué puede ver/hacer) y **oficios** (qué trabajos puede recibir). Una persona tiene 1 acceso y N oficios. |
| **Admin por lista de correos en el código** + rol `admin` en la base | Dos fuentes de verdad; cualquiera con acceso al repo sabía quién era dueño | Un solo campo `acceso = dueño/admin` en la base, cambiable solo por un dueño. |
| **Factura = un documento vivo por empleado** que el empleado editaba (filas, montos libres) | El empleado podía escribir cualquier monto; el admin tenía "su propia versión" de la misma factura | **Cobros = líneas inmutables** generadas por el sistema desde un trabajo aprobado, con tarifa congelada. Los ajustes son líneas nuevas con motivo, nunca edición. |
| **Botón "purgar todas las facturas"** para empezar periodo | Se borraba el historial de pagos | **Corte de pago**: se cierra el periodo, queda archivado para siempre. Nada se borra. |
| **Limpieza automática** que borraba tareas completadas 2 días después al abrir la página | Historial perdido sin aviso | Nada se borra solo. Las tareas viejas se archivan (se ocultan), no se eliminan. |
| **IDs `ASG-1234`** con 4 dígitos del reloj | Dos tareas creadas a la vez se pisaban | UUID en todo. |
| **Visibilidad por cliente** (`allowedClients`) mezclada con el rol | Difícil saber por qué alguien no veía algo | Regla única: un trabajador ve solo los clientes donde **tiene o tuvo tareas**, más los que el admin le asigne explícitamente. |
| Claves en el repo público | Filtración | Solo variables de entorno. |

---

## 3. Modelo de roles (lo más importante)

### 3.1 Tres ideas distintas que antes se mezclaban

1. **Acceso** — qué tanto poder tiene en el sistema. Uno por persona:
   | Acceso | Para quién | Resumen |
   |---|---|---|
   | `dueno` | Samuel (y Juan si aplica) | Todo, incluido gestionar admins, tarifas y cortes de pago. No se puede quitar el último dueño. |
   | `admin` | Coordinación | Clientes, piezas, asignar, aprobar trabajos y cobros, CRM completo. **No** cambia tarifas ni cierra cortes ni nombra admins. **[Juan]** |
   | `equipo` | Trabajadores | Solo su trabajo: sus tareas, sus cobros, los clientes donde trabaja, la biblioteca. |
   | `pendiente` | Recién registrado | Solo ve "esperando aprobación". |
   | `desactivado` | Ex-trabajador | No entra. Su historial y cobros se conservan. |

2. **Oficios** — qué tipo de trabajo puede recibir. Varios por persona:
   `grabación` · `edición` · `diseño` · `estrategia/guion` · `publicación (community)` · `ventas`.
   Sirven para: a quién le puedo asignar una tarea de edición, qué SOPs le aparecen, qué tarifa aplica. **No dan poder**: un editor no puede aprobar nada por ser editor.

3. **Relación con el cliente** — no es un rol, es un hecho: la persona tiene tareas de ese cliente. De ahí sale qué clientes ve.

> Ejemplo: Breiner = acceso `equipo`, oficios `grabación + edición`. Ve sus tareas, los clientes donde graba o edita, sus cobros. No ve cobros de otros, no ve el CRM, no puede aprobar.

### 3.2 Matriz de permisos

| Acción | dueño | admin | equipo | pendiente |
|---|:-:|:-:|:-:|:-:|
| Ver panel general (todas las métricas) | ✅ | ✅ | ❌ (solo el suyo) | ❌ |
| Crear/editar clientes | ✅ | ✅ | ❌ | ❌ |
| Ver ficha de cliente | ✅ | ✅ | solo los suyos | ❌ |
| Crear piezas y asignar tareas | ✅ | ✅ | ❌ | ❌ |
| Ver tareas | todas | todas | las suyas | ❌ |
| Cambiar estado de una tarea | ✅ | ✅ | solo la suya (empezar / entregar) | ❌ |
| **Aprobar** una entrega | ✅ | ✅ | ❌ | ❌ |
| Ver cobros | todos | todos | solo los suyos | ❌ |
| Aprobar / devolver cobros | ✅ | ✅ | ❌ | ❌ |
| Ajuste manual de cobro (bono, descuento) | ✅ | ✅ con motivo | ❌ | ❌ |
| Editar tarifas | ✅ | ❌ **[Juan]** | ❌ | ❌ |
| Cerrar corte de pago / marcar pagado | ✅ | ❌ **[Juan]** | ❌ | ❌ |
| CRM (leads, visitas) | ✅ | ✅ | solo si tiene oficio `ventas`, y solo sus leads | ❌ |
| Biblioteca: leer | ✅ | ✅ | ✅ | ❌ |
| Biblioteca: crear/editar | ✅ | ✅ | proponer (queda como borrador hasta que admin publique) | ❌ |
| Aprobar usuarios / cambiar acceso u oficios | ✅ | aprobar y oficios sí; acceso admin/dueño no | ❌ | ❌ |
| Asistente IA | ✅ | ✅ | ✅ (solo sobre lo que ya puede ver) | ❌ |

Regla técnica: la matriz vive en **un solo lugar** en Go (`puede(usuario, acción, recurso)`). La interfaz esconde botones según la matriz, pero **la seguridad la da Go**, no la interfaz. RLS en Supabase como segunda capa.

---

## 4. Ciclos de vida (estados y quién los mueve)

### 4.1 Pieza de contenido
```
Borrador ──► En producción ──► En revisión ──► Aprobada ──► Publicada
                  ▲                 │
                  └──── Cambios ◄───┘            (Cancelada: desde cualquier estado, solo admin, con motivo)
```

### 4.2 Tarea (una etapa de una pieza, asignada a una persona)
```
Bloqueada ──► Pendiente ──► En curso ──► Entregada ──► Aprobada
(espera la      (asignada)   (empezó)    (subió link/   (admin la acepta → genera cobro)
 etapa anterior)                          minutos)          │
                                              ▲             ▼
                                              └── Devuelta ◄┘ (admin pide cambios, con comentario)
```
- Tipos de tarea: **Grabación principal** (sube el material), **Grabación de apoyo** (solo registra minutos, no bloquea el flujo), **Edición**, **Diseño**, **Publicación**.
- La tarea siguiente se desbloquea cuando la anterior pasa a **Aprobada** (no con "Entregada"). La **publicación** siempre necesita la pieza aprobada por admin (como en el sistema viejo).

### 4.3 Línea de cobro
```
(tarea aprobada) ──► Por confirmar ──► Confirmada ──► Aprobada ──► En corte ──► Pagada
                      (el trabajador     (admin)      (cerrado)   (dueño marca pagado)
                       revisa y confirma)
                            │
                            └──► Reclamada (el trabajador dice "esto no cuadra", con motivo) ──► admin resuelve con un ajuste
```

### 4.4 Lead (CRM)
`Prospecto → En contacto → Propuesta enviada → Negociación → Ganado | Perdido` (los mismos del sistema viejo). **Ganado → se crea el cliente** con el paquete elegido.

---

## 5. ¿Qué pasa si…? (casos límite)

### Personas y acceso
1. **Alguien se registra con Google y nadie lo aprueba.** Queda `pendiente` indefinidamente, no ve nada. Los admins reciben aviso push "nueva persona esperando". Si en 7 días nadie lo aprueba, se recuerda otra vez.
2. **Un trabajador se va de la agencia.** Admin lo pasa a `desactivado`. Sus tareas `Pendiente`/`En curso` quedan **sin asignar** y le avisan al admin para reasignarlas. Sus cobros aprobados no pagados **siguen en el corte** y se le pagan. Su historial queda.
3. **Una persona hace dos oficios (graba y edita).** Tiene los dos oficios; puede recibir ambas tareas de la misma pieza. Cada tarea genera su propio cobro con su tarifa.
4. **Se intenta quitar el acceso al único dueño.** Bloqueado: siempre debe existir al menos un dueño.
5. **Un admin intenta subirse a dueño o nombrar otro admin.** No puede; solo un dueño cambia accesos de admin/dueño.
6. **Cambian a alguien de `equipo` a `admin` a mitad de periodo.** Sus cobros como trabajador siguen igual; desde ese momento ve todo. Queda registrado quién hizo el cambio y cuándo.
7. **Entra desde el celular y desde el PC a la vez.** Es la misma sesión de usuario; los cambios se ven en ambos en segundos (tiempo real).

### Tareas y producción
8. **Asignan una tarea a alguien sin el oficio correcto** (edición a un vendedor). La interfaz solo ofrece personas con ese oficio; Go lo rechaza si llega igual.
9. **El trabajador marca "Entregada" sin subir el link / minutos.** No se puede: la entrega exige el dato de esa etapa (link de Drive para edición, minutos para grabación, link publicado para publicación).
10. **Se pasa la fecha límite.** La tarea queda marcada **vencida** (roja) en su lista y en el panel del admin. Push al trabajador el día antes y el día que vence; al admin cuando vence. No cambia el cobro. **[Juan: ¿descuento por entrega tarde? por defecto no]**
11. **El admin devuelve una edición 3 veces.** Cada devolución queda con su comentario en el historial de la tarea. **Se cobra una sola vez**, cuando por fin se aprueba.
12. **Se cancela una pieza a mitad de camino** (el cliente la canceló). Admin la cancela con motivo. Tareas no empezadas: se cancelan sin cobro. Tareas **ya aprobadas**: su cobro se mantiene (el trabajo se hizo). Tareas **en curso**: el admin decide en ese momento: pagar o no. **[Juan]**
13. **Se reasigna una tarea en curso a otra persona.** La primera persona no cobra nada automáticamente; si trabajó parcialmente, el admin puede agregarle un ajuste con motivo.
14. **Dos admins editan la misma pieza al mismo tiempo.** Gana el último guardado, pero el segundo ve un aviso "esto cambió mientras editabas" antes de sobrescribir.
15. **Una grabación la hacen dos personas** (principal + apoyo). La principal sube el material y desbloquea la edición; la de apoyo solo registra sus minutos y cobra aparte, sin bloquear nada (como en el sistema viejo).
16. **Se borra por error un cliente con piezas y cobros.** No se borra: los clientes se **archivan**. Un cliente con historial nunca se puede eliminar de verdad.

### Cobros
17. **Cambian una tarifa a mitad de mes.** Las líneas ya generadas **no cambian** (la tarifa se congela al aprobar la tarea). Las tareas aprobadas desde ese momento usan la nueva.
18. **El trabajador dice que le pagaron menos.** Usa "Reclamar" en esa línea con motivo; el admin ve el reclamo y responde con un ajuste (positivo o negativo) que queda registrado. Nunca se edita la línea original.
19. **Un bono** (ej. el bono de visitas de ventas que existía: $50.000). Es una **regla automática** configurable (ej. "cada N visitas registradas = bono X") o un **ajuste manual** con motivo. **[Juan: ¿cómo funciona hoy el bono de visitas?]**
20. **Se cierra el corte y después aparece una tarea vieja sin aprobar.** Su cobro entra en el **siguiente** corte. Un corte cerrado no se reabre; si hubo un error, se corrige con un ajuste en el corte actual.
21. **Se marca un corte como pagado por error.** Solo el dueño puede revertir "pagado" y queda registrado. **[Juan]**
22. **El trabajador ve su total en tiempo real.** Sí: "llevas $X aprobado este periodo, $Y por confirmar".

### Ventas (CRM)
23. **Registran una visita sin señal en la calle.** Se guarda en el celular con foto y hora; se sube sola al volver la señal. Si se cierra la app antes, no se pierde (queda en el teléfono).
24. **Dos vendedores registran el mismo negocio.** Al crear un lead se buscan duplicados por nombre/teléfono y se avisa "este negocio ya lo tiene Fulano". El admin decide a quién queda.
25. **Un lead ganado ya era cliente antes** (volvió). Se enlaza al cliente archivado y se reactiva, en vez de crear uno nuevo.
26. **Un vendedor se va.** Sus leads abiertos pasan al admin para reasignar.

### Cliente y contenido
27. **Un cliente cambia de paquete** (de Digital a Mixto). Se registra el cambio con fecha; las piezas ya creadas no cambian.
28. **Un cliente pausa el servicio.** Estado `pausado`: no se le pueden crear piezas nuevas; lo pendiente queda visible para decidir.
29. **Un trabajador intenta abrir un cliente donde no trabaja** (por URL directa). Go responde "no autorizado" y no se ve ningún dato.

### Técnico
30. **Se cae internet mientras alguien entrega una tarea.** El envío se reintenta; si falla, el botón muestra "no se pudo guardar, reintentar" y **no** cambia el estado en pantalla hasta confirmar.
31. **Se cae la IA.** El sistema funciona igual; solo el asistente muestra "no disponible". La IA nunca es necesaria para operar.
32. **Doble clic en "Aprobar" o "Entregar".** El botón se bloquea mientras guarda y Go ignora acciones repetidas (idempotencia): no se crean dos cobros.
33. **La app Android sin actualizar.** Como carga la web desplegada, siempre ve la versión nueva; solo los cambios nativos (push, cámara) requieren APK nuevo.

---

## 6. Registro de actividad (para responder "¿quién hizo esto?")

Todo cambio de estado, aprobación, ajuste de cobro, cambio de acceso y archivo queda en un historial: **quién, qué, cuándo, antes → después, motivo**. Visible para admin/dueño en cada ficha. No se puede editar ni borrar.

---

## 7. Decisiones que necesito de Juan

1. **Admin vs dueño:** ¿el admin (coordinación) puede editar tarifas y cerrar cortes, o solo el dueño? *(propuesta: solo dueño)*
2. **Quiénes son y qué hacen:** lista de personas con su acceso y oficios (para cargar al inicio).
3. **Tarifas reales:** cuánto se paga por grabación (¿por hora, por minuto, por salida?), por edición (¿según duración, como la tabla del sitio?), diseño, publicación.
4. **Corte de pago:** ¿quincenal o mensual? ¿qué día?
5. **Bono de visitas de ventas:** ¿cómo funciona hoy exactamente?
6. **Pieza cancelada con trabajo en curso:** ¿se paga lo avanzado? *(propuesta: el admin decide en el momento)*
7. **Entregas tarde:** ¿tienen alguna consecuencia en el pago? *(propuesta: no, solo se marcan)*
8. **Datos del sistema viejo:** ¿base vacía o migramos usuarios/clientes/cobros?
9. **¿Los clientes deberían ver algo algún día** (ej. aprobar su pieza)? *(propuesta: no en v2, pero se deja preparado)*
