package httpapi

import "strings"

const riaInstruccionPrivada = "Ya estás conversando en privado con la persona. Si pide ayuda, responde directamente con los pasos concretos de la sección pertinente; si no concreta una duda, pregunta qué quiere hacer y ofrece ejemplos. No le recomiendes el botón Ayuda ni le digas que abra o escriba en /ria. Usa Markdown sencillo y las rutas de las secciones que puede ver según su rol."

// Las fichas tienen respuestas estables: no dependen del proveedor ni de que el
// modelo interprete instrucciones de ayuda que pueden aparecer en el historial.
func respuestaAyudaRIA(pregunta string, admin bool) string {
	pregunta = strings.Trim(strings.ToLower(strings.TrimSpace(pregunta)), "¿?¡!.")
	switch pregunta {
	case "tengo una duda sobre cómo usar rconceptsys", "cómo uso rconceptsys", "ayuda", "cómo funciona la app":
		return "**¿Qué quieres saber de RConcept?** Puedo explicarte cómo entregar un trabajo en /tareas, cambiar el tema en /personalizacion o configurar tus avisos en /configuracion."
	case "cómo entrego un trabajo":
		if admin {
			return "En /tareas puedes **revisar entregas** pendientes y aprobarlas o devolverlas. Para entregar un trabajo que tienes asignado, abre la vista de tus tareas y pulsa **Entregar** en su tarjeta."
		}
		return "1. En /tareas, abre el trabajo asignado.\n2. Pulsa **Entregar** y añade la nota o el enlace correspondiente.\n3. Si el trabajo se cobra por minuto, indica los minutos reales antes de enviarlo a revisión."
	case "dónde veo mi corte", "cómo veo los cortes del equipo":
		if admin {
			return "Abre /admin y selecciona **Cortes**. Cada corte muestra el total y el detalle por persona."
		}
		return "Abre /factura. En **Mi corte** verás el rango, tu monto y el estado de pago. También puedes llegar desde el aviso de la campana."
	case "cómo cambio el tema":
		return "1. Abre /personalizacion y elige **Claro**, **Oscuro** o **Sistema**.\n2. En **Tema**, elige RConcept o Glass y revisa la vista previa.\n3. Pulsa **Guardar apariencia** para conservar tus cambios."
	case "cómo adjunto archivos":
		if admin {
			return "Abre /trabajos/nuevo o edita un trabajo pendiente desde /asignaciones. En **Adjuntos**, selecciona los archivos y guarda la asignación. En el chat del equipo puedes usar el botón de adjuntos junto al campo de texto."
		}
		return "En el chat del equipo, usa el botón de **adjuntos** junto al campo de texto y elige qué quieres compartir. Para consultar archivos de una asignación, ve a /tareas y abre **Ver trabajo → Adjuntos**."
	case "cómo configuro mis avisos":
		return "En /configuracion puedes elegir los tipos de avisos, silenciar el chat y configurar un horario de silencio. Las menciones siempre aparecen en tu bandeja."
	}
	return ""
}
