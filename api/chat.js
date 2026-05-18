/**
 * Serverless Vercel Function: Claude API Proxy
 * Handles dynamic marketing copywriting prompts by integrating agency-wide customer metrics and script styles.
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
            return res.status(400).json({ error: 'Missing Anthropic API Key. Please add it to your Vercel Environment Variables.' });
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
            return res.status(400).json({ error: 'Conversation must contain at least one user message.' });
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

        // 2. Primary request with Claude 3.5 Sonnet v2
        let response = await fetch("https://api.anthropic.com/v1/messages", {
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

        // 3. Fallback check: If Sonnet v2 fails, retry with the highly compatible Claude 3.5 Sonnet v1
        if (!response.ok) {
            const errClone = response.clone();
            try {
                const errData = await errClone.json();
                const errMsg = errData.error?.message || '';
                
                // If it is a model availability or request tier limitation error, run fallback
                if (errMsg.includes("model") || response.status === 404 || response.status === 400) {
                    console.warn("Sonnet v2 failed or restricted. Retrying with fallback model claude-3-5-sonnet-20240620...");
                    
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
            } catch (jsonErr) {
                console.error("Failed to parse initial error response:", jsonErr);
            }
        }

        if (!response.ok) {
            const errData = await response.json();
            console.error("Anthropic API Final Error Details:", errData);
            return res.status(response.status).json({ 
                error: errData.error?.message || 'Error communicating with Anthropic Claude API.' 
            });
        }

        const data = await response.json();
        const text = data.content?.[0]?.text || '';
        
        return res.status(200).json({ text });

    } catch (err) {
        console.error("Serverless Claude Proxy error:", err);
        return res.status(500).json({ error: 'Internal server error: ' + err.message });
    }
}
