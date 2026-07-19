/**
 * Serverless Vercel Function: NVIDIA NIM API Proxy
 * Handles fast and cost-effective copywriting and CRM task recommendation requests
 * using the OpenAI-compatible NVIDIA NIM endpoint and Llama 3.1 405B.
 */

const DEFAULT_NVIDIA_KEY = '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';

export default async function handler(req, res) {
    const origin = req.headers.origin || '';
    const allowedOrigins = [
        'https://rconcept.vercel.app',
        'https://rconceptsys.vercel.app',
        'http://localhost:5173',
        'http://localhost:3000'
    ];
    const isAllowedOrigin = allowedOrigins.some(o => origin.startsWith(o)) || !origin;
    const corsOrigin = isAllowedOrigin ? (origin || '*') : allowedOrigins[0];

    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { prompt, systemInstruction } = req.body;
        const apiKey = process.env.NVIDIA_NIM_API_KEY || DEFAULT_NVIDIA_KEY;

        if (!apiKey) {
            return res.status(400).json({ error: 'Falta la clave API de NVIDIA NIM. Agrégala como NVIDIA_NIM_API_KEY.' });
        }

        const url = 'https://integrate.api.nvidia.com/v1/chat/completions';
        const model = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning';

        const messages = [];
        if (systemInstruction) {
            messages.push({ role: 'system', content: systemInstruction });
        }
        messages.push({ role: 'user', content: prompt });

        const requestBody = {
            model: model,
            messages: messages,
            temperature: 0.2,
            top_p: 0.7,
            max_tokens: 1500
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`NVIDIA NIM API Error: ${errText}`);
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || '';

        return res.status(200).json({ text });

    } catch (err) {
        console.error("NVIDIA NIM Proxy error:", err);
        return res.status(500).json({ error: 'Error en el servidor proxy de NVIDIA NIM: ' + err.message });
    }
}
