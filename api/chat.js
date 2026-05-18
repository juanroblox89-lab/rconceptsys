/**
 * Serverless Vercel Function: Claude API Proxy
 * Handles dynamic marketing copywriting prompts by integrating agency-wide customer metrics and script styles.
 * Tailored with a 4-tier model fallback pipeline and helpful error translator.
 */

const DEFAULT_API_KEY = process.env.ANTHROPIC_API_KEY || "";

export default async function handler(req, res) {
    // Add CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { messages, contextPrompt, apiKey } = req.body;

        const anthropicKey = apiKey?.trim() || process.env.ANTHROPIC_API_KEY || DEFAULT_API_KEY;

        if (!anthropicKey) {
            return res.status(400).json({ error: 'Falta la clave API de Anthropic. Agrégala en las Variables de Entorno de Vercel o en el engranaje de configuración.' });
        }

        // Defensive validation: Ensure the key is ASCII-only and starts with 'sk-'
        const isAscii = (str) => /^[\x00-\x7F]*$/.test(str);
        if (!isAscii(anthropicKey) || !anthropicKey.startsWith("sk-")) {
            return res.status(400).json({ 
                error: "La clave API de Anthropic configurada no es válida. Asegúrate de haber copiado la clave correcta (debe empezar con 'sk-' y no contener emojis, textos de error ni espacios)." 
            });
        }

        // 1. Anthropic Compliance: Filter and slice messages so it starts STRICTLY with a 'user' role
        let apiMessages = messages.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content
        }));

        const firstUserIdx = apiMessages.findIndex(m => m.role === 'user');
        if (firstUserIdx === -1) {
            return res.status(400).json({ error: 'La conversación debe contener al menos un mensaje del usuario.' });
        }
        apiMessages = apiMessages.slice(firstUserIdx);

        // Custom system prompt driven by marketing expertise
        const systemPrompt = `Eres "RConcept AI Studio", un asistente de Inteligencia Artificial de nivel elite, experto en Marketing Digital de Alto Rendimiento, Estrategia de Contenidos Virales, Copywriting persuasivo (estilos como Alex Hormozi, GaryVee, MrBeast), y Guiones de Corto Formato de alta retención.

Tu objetivo principal es asistir a la agencia de producción creativa RConcept en la estructuración de ideas operativas, creación de guiones (scripts), redacción de hooks o ganchos de retención y análisis estratégico.

---
CONTEXTO DE NEGOCIO Y OPERACIONES DE LA AGENCIA:
${contextPrompt || 'No hay contexto cargado actualmente.'}
---

DIRECTRICES OPERATIVAS PARA TUS RESPUESTAS:
1. **Conocimiento de Marketing**: Domina la psicología del consumidor, sesgos cognitivos, y la retención del espectador en los primeros 3 segundos.
2. **Creación de Guiones**: Cuando te pidan un guión, estructúralo de forma ultra-limpia:
   - **Hook (0-3 segundos)**: Texto exacto verbal y recomendación visual en pantalla.
   - **Cuerpo / Formato**: Puntos concisos, ritmo rápido, indicaciones de efectos de sonido (SFX) y visuales (VFX) sugeridos.
   - **Llamado a la Acción (CTA)**: Alineado con el objetivo comercial del cliente.
3. **Favores y Redacción**: Sé sumamente directo, práctico y creativo. Evita introducciones genéricas aburridas ("¡Hola! Estoy listo para ayudarte..."). Ve directo a la carne y al valor de lo que se te solicita.
4. **Respeto de Marcas**: Adapta tu tono y estilo verbal dependiendo de cuál sea el cliente seleccionado o referenciado en el contexto (por ejemplo, si es un gimnasio mantén un tono enérgico; si es un servicio médico o B2B mantén un tono profesional pero altamente magnético).

Habla con un tono de alta costura creativa, seguro de ti mismo, práctico y enfocado al 100% en optimizar la producción.`;

        // ==========================================
        // 3-TIER MODEL FALLBACK PIPELINE
        // ==========================================
        let response;
        let lastErrorText = "";

        const isModelError = (status, errorText) => {
            const msg = errorText?.toLowerCase() || "";
            return status === 404 || msg.includes("model") || msg.includes("not_found") || msg.includes("unsupported");
        };

        const extractErrorText = async (res) => {
            try {
                const clone = res.clone();
                const errData = await clone.json();
                return errData.error?.message || "";
            } catch (e) {
                try {
                    const text = await res.clone().text();
                    return text || res.statusText || "";
                } catch (err) {
                    return res.statusText || "";
                }
            }
        };

        // Tier 1: Claude 3.5 Sonnet v2 (Ideal)
        console.log("Attempting Tier 1: Claude 3.5 Sonnet v2...");
        response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "x-api-key": anthropicKey,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            },
            body: JSON.stringify({
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 3000,
                system: systemPrompt,
                messages: apiMessages
            })
        });

        // Tier 2: Claude 3.5 Sonnet v1
        if (!response.ok) {
            lastErrorText = await extractErrorText(response);
            console.warn("Tier 1 (Sonnet v2) failed. Reason:", lastErrorText);

            if (isModelError(response.status, lastErrorText)) {
                console.log("Attempting Tier 2: Claude 3.5 Sonnet v1...");
                response = await fetch("https://api.anthropic.com/v1/messages", {
                    method: "POST",
                    headers: {
                        "x-api-key": anthropicKey,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json"
                    },
                    body: JSON.stringify({
                        model: "claude-3-5-sonnet-20240620",
                        max_tokens: 3000,
                        system: systemPrompt,
                        messages: apiMessages
                    })
                });
            }
        }

        // Tier 3: Claude 3.5 Haiku (Affordable and highly active)
        if (!response.ok) {
            lastErrorText = await extractErrorText(response);
            console.warn("Previous tier failed. Reason:", lastErrorText);

            if (isModelError(response.status, lastErrorText)) {
                console.log("Attempting Tier 3: Claude 3.5 Haiku...");
                response = await fetch("https://api.anthropic.com/v1/messages", {
                    method: "POST",
                    headers: {
                        "x-api-key": anthropicKey,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json"
                    },
                    body: JSON.stringify({
                        model: "claude-3-5-haiku-20241022",
                        max_tokens: 3000,
                        system: systemPrompt,
                        messages: apiMessages
                    })
                });
            }
        }

        // Final response handling with error translator
        if (!response.ok) {
            lastErrorText = await extractErrorText(response);
            console.error("Anthropic API Pipeline Final Failure:", lastErrorText);
            
            let errMsg = lastErrorText || 'Error al comunicarse con la API de Claude.';

            // User-friendly credit balance check
            if (errMsg.includes("credit_balance_zero") || errMsg.includes("billing") || errMsg.includes("credit") || errMsg.includes("balance")) {
                errMsg = "Tu cuenta de Anthropic no tiene saldo de créditos disponible. Para activar tu API Key, por favor inicia sesión en tu consola de Anthropic (https://console.anthropic.com/settings/billing) y añade un saldo inicial mínimo (ej. $5 USD) en la sección de facturación.";
            } else if (errMsg.includes("rate_limit")) {
                errMsg = "Límite de velocidad superado. Espera unos segundos e intenta nuevamente.";
            } else if (errMsg.includes("invalid") && (errMsg.includes("key") || errMsg.includes("auth"))) {
                errMsg = "La API Key ingresada no es válida o ha sido revocada. Por favor, verifica que la hayas copiado completa y correctamente desde tu consola de Anthropic.";
            }

            return res.status(response.status).json({ error: errMsg });
        }

        const data = await response.json();
        const text = data.content?.[0]?.text || '';
        
        return res.status(200).json({ text });

    } catch (err) {
        console.error("Serverless Claude Proxy error:", err);
        return res.status(500).json({ error: 'Error interno del servidor proxy: ' + err.message });
    }
}
