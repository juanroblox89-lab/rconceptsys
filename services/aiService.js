export const aiService = {
    async callNvidia(prompt, systemInstruction = "") {
        try {
            const response = await fetch('/api/nvidia', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ prompt, systemInstruction })
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || 'Error al comunicarse con la IA');
            }

            const data = await response.json();
            return data.text || '';
        } catch (err) {
            console.error("aiService callNvidia failed:", err);
            // Fallback locally using prompt template in case environment key is missing
            return `[Simulado] Propuesta Creativa (NVIDIA Llama 3.1) para ${prompt.slice(0, 30)}...\n\nPor favor configura NVIDIA_NIM_API_KEY en Vercel para respuestas reales.`;
        }
    },

    async generateProposal(lead) {
        const systemInstruction = `Eres un redactor creativo sénior de Rohlfing Concept. Generas propuestas comerciales cortas, dinámicas y convincentes. Escribe en español de forma directa.`;
        const prompt = `Genera una propuesta comercial personalizada para el lead "${lead.name}". 
Detalles adicionales:
- Canal de contacto original: ${lead.source}
- Valor estimado: $${Number(lead.estimated_value || 0).toLocaleString('es-CO')} COP
- Notas/Interés: ${lead.notes || 'Ninguna especificada'}

La propuesta debe incluir:
1. Análisis de su marca y oportunidades.
2. Propuesta de contenido (formatos y ganchos psicológicos recomendados).
3. Plan comercial (inversión y entregables).
Estructúralo con formato markdown elegante.`;

        return this.callNvidia(prompt, systemInstruction);
    },

    async generateSocialCopy(lead, formatType) {
        const systemInstruction = `Eres redactor publicitario viral de Rohlfing Concept. Conoces técnicas de retención, hooks y ganchos psicológicos (estilo Alex Hormozi).`;
        const prompt = `Redacta 3 copies de redes sociales para el negocio "${lead.name}".
El formato de contenido elegido es: "${formatType}".
Estrategia actual del cliente: ${JSON.stringify(lead.client_strategy || {})}

Para cada copy:
- Diseña un Hook llamativo (primeros 3 segundos).
- Escribe el Cuerpo del copy rápido e interactivo.
- Agrega una Llamada a la Acción (CTA) de alto impacto.`;

        return this.callNvidia(prompt, systemInstruction);
    },

    async generateFollowUp(lead) {
        const systemInstruction = `Eres un asesor de ventas de Rohlfing Concept. Escribes mensajes de seguimiento persuasivos y profesionales por WhatsApp.`;
        const prompt = `Genera un mensaje de seguimiento de WhatsApp para "${lead.name}" (Teléfono: ${lead.phone || 'N/A'}).
Lleva en el estado "${lead.status}" varios días sin interacción.
Notas previas: ${lead.notes || 'Ninguna'}.
El mensaje debe ser corto, no sonar acosador y ofrecer valor o agendar una llamada rápida.`;

        return this.callNvidia(prompt, systemInstruction);
    }
};
