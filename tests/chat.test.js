import { beforeEach, describe, expect, it, vi } from 'vitest';

import handler from '../api/chat.js';

const createResponse = () => ({
    end: vi.fn(),
    json: vi.fn(function json(payload) {
        this.payload = payload;
        return this;
    }),
    setHeader: vi.fn(),
    status: vi.fn(function status(code) {
        this.statusCode = code;
        return this;
    })
});

const apiResponse = (payload, status = 200) => new Response(
    JSON.stringify(payload),
    {
        headers: { 'Content-Type': 'application/json' },
        status
    }
);

describe('chat API handler', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.stubGlobal('fetch', vi.fn());
    });

    it('answers CORS preflight requests without calling Anthropic', async () => {
        const res = createResponse();

        await handler({ method: 'OPTIONS' }, res);

        expect(res.setHeader).toHaveBeenCalledTimes(4);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.end).toHaveBeenCalledOnce();
        expect(fetch).not.toHaveBeenCalled();
    });

    it('rejects unsupported HTTP methods', async () => {
        const res = createResponse();

        await handler({ method: 'GET' }, res);

        expect(res.statusCode).toBe(405);
        expect(res.payload).toEqual({ error: 'Method not allowed' });
    });

    it('rejects missing and malformed API keys before making a request', async () => {
        const missingKeyResponse = createResponse();
        await handler({
            method: 'POST',
            body: { messages: [{ role: 'user', content: 'Hola' }] }
        }, missingKeyResponse);

        expect(missingKeyResponse.statusCode).toBe(400);
        expect(missingKeyResponse.payload.error).toContain('Falta la clave API');

        const malformedKeyResponse = createResponse();
        await handler({
            method: 'POST',
            body: {
                apiKey: 'invalid-key',
                messages: [{ role: 'user', content: 'Hola' }]
            }
        }, malformedKeyResponse);

        expect(malformedKeyResponse.statusCode).toBe(400);
        expect(malformedKeyResponse.payload.error).toContain('no es válida');
        expect(fetch).not.toHaveBeenCalled();
    });

    it('requires at least one user message', async () => {
        const res = createResponse();

        await handler({
            method: 'POST',
            body: {
                apiKey: 'sk-valid',
                messages: [{ role: 'assistant', content: 'Hola' }]
            }
        }, res);

        expect(res.statusCode).toBe(400);
        expect(res.payload.error).toContain('al menos un mensaje del usuario');
    });

    it('normalizes the conversation and returns the model text', async () => {
        fetch.mockResolvedValue(apiResponse({
            content: [{ text: 'Respuesta generada' }]
        }));
        const res = createResponse();

        await handler({
            method: 'POST',
            body: {
                apiKey: '  sk-valid  ',
                contextPrompt: 'Cliente de fitness',
                messages: [
                    { role: 'assistant', content: 'Prefacio descartado' },
                    { role: 'user', content: 'Escribe un hook' },
                    { role: 'system', content: 'Tratado como usuario' },
                    { role: 'assistant', content: 'Respuesta anterior' }
                ]
            }
        }, res);

        expect(res.statusCode).toBe(200);
        expect(res.payload).toEqual({ text: 'Respuesta generada' });
        expect(fetch).toHaveBeenCalledOnce();

        const request = fetch.mock.calls[0][1];
        expect(request.headers['x-api-key']).toBe('sk-valid');
        expect(JSON.parse(request.body)).toMatchObject({
            model: 'claude-sonnet-4-20250514',
            messages: [
                { role: 'user', content: 'Escribe un hook' },
                { role: 'user', content: 'Tratado como usuario' },
                { role: 'assistant', content: 'Respuesta anterior' }
            ]
        });
        expect(JSON.parse(request.body).system).toContain('Cliente de fitness');
    });

    it('falls back to Claude 3.5 when the primary model is unavailable', async () => {
        fetch
            .mockResolvedValueOnce(apiResponse({
                error: { message: 'model not_found' }
            }, 404))
            .mockResolvedValueOnce(apiResponse({
                content: [{ text: 'Respuesta de respaldo' }]
            }));
        const res = createResponse();

        await handler({
            method: 'POST',
            body: {
                apiKey: 'sk-valid',
                messages: [{ role: 'user', content: 'Hola' }]
            }
        }, res);

        expect(fetch).toHaveBeenCalledTimes(2);
        expect(JSON.parse(fetch.mock.calls[1][1].body).model).toBe(
            'claude-3-5-sonnet-20241022'
        );
        expect(res.payload).toEqual({ text: 'Respuesta de respaldo' });
    });

    it('translates upstream rate-limit errors without retrying another model', async () => {
        fetch.mockResolvedValue(apiResponse({
            error: { message: 'rate_limit exceeded' }
        }, 429));
        const res = createResponse();

        await handler({
            method: 'POST',
            body: {
                apiKey: 'sk-valid',
                messages: [{ role: 'user', content: 'Hola' }]
            }
        }, res);

        expect(fetch).toHaveBeenCalledOnce();
        expect(res.statusCode).toBe(429);
        expect(res.payload.error).toContain('Límite de velocidad');
    });

    it('returns an internal error when the upstream request throws', async () => {
        fetch.mockRejectedValue(new Error('network unavailable'));
        const res = createResponse();

        await handler({
            method: 'POST',
            body: {
                apiKey: 'sk-valid',
                messages: [{ role: 'user', content: 'Hola' }]
            }
        }, res);

        expect(res.statusCode).toBe(500);
        expect(res.payload.error).toContain('network unavailable');
    });
});
