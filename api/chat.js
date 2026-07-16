/**
 * Serverless Vercel Function: Claude API Proxy
 * Handles dynamic marketing copywriting prompts by integrating agency-wide customer metrics and script styles.
 * Tailored with a 2-tier model fallback pipeline and helpful error translator.
 *
 * Security:
 * - Requires a valid Supabase session (Bearer access token) so the proxy cannot be
 *   abused anonymously to drain the agency's Anthropic credits.
 * - CORS is restricted to an explicit allowlist (ALLOWED_ORIGINS) instead of "*".
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

// Comma-separated list of origins allowed to call this endpoint via CORS.
// Same-origin browser calls (the app itself) do not require any of these.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

const MAX_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 8_000;
const MAX_TOTAL_MESSAGE_LENGTH = 40_000;
const MAX_CONTEXT_LENGTH = 30_000;

const applyCorsHeaders = (req, res) => {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Cache-Control", "no-store");
};

const getAuthenticatedUser = async (req) => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return null;

    try {
        const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: {
                apikey: SUPABASE_ANON_KEY,
                Authorization: `Bearer ${token}`,
            },
        });
        if (!resp.ok) return null;
        return await resp.json();
    } catch {
        return null;
    }
};

const isApprovedUser = async (userId, token) => {
    try {
        const params = new URLSearchParams({
            id: `eq.${userId}`,
            select: "approved",
        });
        const response = await fetch(`${SUPABASE_URL}/rest/v1/users?${params}`, {
            headers: {
                apikey: SUPABASE_ANON_KEY,
                Authorization: `Bearer ${token}`,
            },
        });
        if (!response.ok) return false;
        const profiles = await response.json();
        return profiles.length === 1 && profiles[0].approved === true;
    } catch {
        return false;
    }
};

const validateRequest = (body) => {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return { error: "Cuerpo de solicitud inválido." };
    }

    const { messages, contextPrompt = "" } = body;
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
        return { error: `Envía entre 1 y ${MAX_MESSAGES} mensajes.` };
    }
    if (typeof contextPrompt !== "string" || contextPrompt.length > MAX_CONTEXT_LENGTH) {
        return { error: "El contexto enviado es demasiado largo." };
    }

    let totalLength = 0;
    const normalizedMessages = [];
    for (const message of messages) {
        if (!message || typeof message !== "object" || Array.isArray(message)) {
            return { error: "Formato de mensajes inválido." };
        }
        if (!["user", "assistant"].includes(message.role)) {
            return { error: "Rol de mensaje inválido." };
        }
        if (typeof message.content !== "string" || message.content.trim().length === 0) {
            return { error: "Cada mensaje debe contener texto." };
        }
        if (message.content.length > MAX_MESSAGE_LENGTH) {
            return { error: "Uno de los mensajes es demasiado largo." };
        }
        totalLength += message.content.length;
        if (totalLength > MAX_TOTAL_MESSAGE_LENGTH) {
            return { error: "La conversación enviada es demasiado larga." };
        }
        normalizedMessages.push({
            role: message.role,
            content: message.content,
        });
    }

    const firstUserIndex = normalizedMessages.findIndex((message) => message.role === "user");
    if (firstUserIndex === -1) {
        return { error: "La conversación debe contener al menos un mensaje del usuario." };
    }

    return {
        messages: normalizedMessages.slice(firstUserIndex),
        contextPrompt,
    };
};

export default async function handler(req, res) {
    applyCorsHeaders(req, res);

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Fail closed: reject if the Supabase auth backend is not configured.
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.error("Auth not configured: missing SUPABASE_URL / SUPABASE_ANON_KEY.");
        return res.status(500).json({ error: 'El servidor no está configurado para autenticar solicitudes.' });
    }

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const user = await getAuthenticatedUser(req);
    if (!user) {
        return res.status(401).json({ error: 'No autorizado. Inicia sesión para usar el asistente.' });
    }
    if (!(await isApprovedUser(user.id, token))) {
        return res.status(403).json({ error: 'Tu cuenta aún no está aprobada para usar el asistente.' });
    }

    try {
        const anthropicKey = process.env.ANTHROPIC_API_KEY || "";

        if (!anthropicKey) {
            return res.status(500).json({ error: 'Falta la clave API de Anthropic. Agrégala en las Variables de Entorno de Vercel.' });
        }

        const isAscii = (value) => /^[\x00-\x7F]*$/.test(value);
        if (!isAscii(anthropicKey) || !anthropicKey.startsWith("sk-")) {
            return res.status(500).json({ error: "La clave API de Anthropic configurada no es válida." });
        }

        const validated = validateRequest(req.body);
        if (validated.error) {
            return res.status(400).json({ error: validated.error });
        }
        const { messages, contextPrompt } = validated;

        const rateLimitKey = user.id;
        const now = Date.now();
        if (!globalThis._rateLimitMap) globalThis._rateLimitMap = {};
        const hits = (globalThis._rateLimitMap[rateLimitKey] || []).filter(t => now - t < 60_000);
        if (hits.length >= 20) {
            return res.status(429).json({ error: 'Límite de solicitudes alcanzado. Intenta de nuevo en un minuto.' });
        }
        hits.push(now);
        globalThis._rateLimitMap[rateLimitKey] = hits;

        const apiMessages = messages;

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
        // 2-TIER MODEL FALLBACK (Optimized for Vercel 10s limit)
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

        // Tier 1: Claude 4 Sonnet (Latest stable 2025 flagship)
        console.log("Attempting Tier 1: Claude 4 Sonnet...");
        response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "x-api-key": anthropicKey,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            },
            body: JSON.stringify({
                model: "claude-sonnet-4-20250514",
                max_tokens: 4096,
                system: systemPrompt,
                messages: apiMessages
            })
        });

        // Tier 2: Claude 3.5 Sonnet v2 (Proven fallback)
        if (!response.ok) {
            lastErrorText = await extractErrorText(response);
            console.warn("Tier 1 failed. Reason:", lastErrorText);

            if (isModelError(response.status, lastErrorText)) {
                console.log("Attempting Tier 2: Claude 3.5 Sonnet v2...");
                response = await fetch("https://api.anthropic.com/v1/messages", {
                    method: "POST",
                    headers: {
                        "x-api-key": anthropicKey,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json"
                    },
                    body: JSON.stringify({
                        model: "claude-3-5-sonnet-20241022",
                        max_tokens: 4096,
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

            const lowerError = lastErrorText.toLowerCase();
            let errMsg = 'No se pudo obtener una respuesta del proveedor de IA.';

            if (lowerError.includes("credit_balance_zero") || lowerError.includes("billing") || lowerError.includes("credit") || lowerError.includes("balance")) {
                errMsg = "La cuenta de Anthropic no tiene créditos disponibles.";
            } else if (lowerError.includes("rate_limit")) {
                errMsg = "Límite de velocidad superado. Espera unos segundos e intenta nuevamente.";
            } else if (lowerError.includes("invalid") && (lowerError.includes("key") || lowerError.includes("auth"))) {
                errMsg = "La API Key configurada en el servidor no es válida o ha sido revocada.";
            }

            const status = response.status >= 400 && response.status < 500 ? response.status : 502;
            return res.status(status).json({ error: errMsg });
        }

        const data = await response.json();
        const text = data.content?.[0]?.text || '';

        return res.status(200).json({ text });

    } catch (err) {
        console.error("Serverless Claude Proxy error:", err);
        return res.status(500).json({ error: 'Error interno del servidor proxy.' });
    }
}
