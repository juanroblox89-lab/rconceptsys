/**
 * Serverless Vercel Function: Gemini API Proxy
 * Handles fast and cost-effective copywriting and CRM task recommendation requests.
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

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
        const apiKey = process.env.GEMINI_API_KEY || GEMINI_API_KEY;

        if (!apiKey) {
            return res.status(400).json({ error: 'Falta la clave API de Gemini. Agrégala como GEMINI_API_KEY en las Variables de Entorno.' });
        }

        const model = 'gemini-1.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const requestBody = {
            contents: [{ parts: [{ text: prompt }] }]
        };

        if (systemInstruction) {
            requestBody.systemInstruction = {
                parts: [{ text: systemInstruction }]
            };
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Gemini API Error: ${errText}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        return res.status(200).json({ text });

    } catch (err) {
        console.error("Gemini Proxy error:", err);
        return res.status(500).json({ error: 'Error en el servidor proxy de Gemini: ' + err.message });
    }
}
