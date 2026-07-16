/**
 * AI Assistant Page - Creative Production OS
 * High-fidelity, highly interactive marketing and copy assistant driven by Anthropic Claude.
 * Updated: 3-column layout (History, Chat, Context), action proposal preview/confirm/execute pipeline.
 */
import { h, icon } from '../utils/dom.js';
import { dbService, supabase } from '../supabase/service.js';
import { assignmentService } from '../services/assignmentService.js';
import { store } from '../js/store.js';

let activeConversation = [];
let currentThreadId = null;
let chatThreadsList = [];
let isAssistantLoading = false;
const AGENT_ACTION_TYPES = new Set([
    'create_sop',
    'create_format',
    'create_assignment',
    'create_hook',
    'create_script',
]);

export const render = (params = {}) => {
    const { user } = store.getState();
    const container = h('div', { className: 'fade-in flex flex-column gap-3 w-full', style: { minHeight: '85vh' } });

    const loadAssistant = async () => {
        container.innerHTML = '<div class="loader mb-4"></div>';

        try {
            // Load complete dynamic agency context from Firestore
            let formats = await dbService.getAll('formats').catch(() => []);
            let hooks = await dbService.getAll('hooks').catch(() => []);
            let clients = await dbService.getAll('clients').catch(() => []);
            if (user?.role !== 'admin' && user?.allowedClients) {
                clients = clients.filter(c => user.allowedClients.includes(c.id));
            }
            let assignments = await assignmentService.getAllAssignments().catch(() => []);
            let sopsList = await dbService.getAll('sops').catch(() => []);
            let scripts = await dbService.getAll('scripts').catch(() => []);
            let userChats = await dbService.getByQuery('chats', 'userId', '==', user?.uid).catch(() => []);
            let systemRules = await dbService.getAll('system_rules').catch(() => []);

            const isAdmin = user?.role === 'admin';
            chatThreadsList = userChats.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

            // Select active thread
            if (chatThreadsList.length > 0 && !currentThreadId) {
                currentThreadId = chatThreadsList[0].id;
                activeConversation = chatThreadsList[0].messages || [];
            } else if (!currentThreadId) {
                activeConversation = [
                    { role: 'assistant', content: `¡Hola, ${user?.nombre || 'Usuario'}! Soy tu Copiloto Creativo AI. Ahora soy un **Agente Activo** con acceso en tiempo real a toda tu agencia. Pídeme crear SOPs, registrar nuevos Formatos Creativos, asignar tareas o actualizar métricas vinculadas directamente. ¿Qué marca o guión trabajamos hoy?` }
                ];
            }

            container.innerHTML = '';

            // Header
            const header = h('div', { className: 'content-header flex justify-between items-center w-full mb-2' }, [
                h('div', {}, [
                    h('h1', { className: 'text-xl font-bold' }, 'Copiloto AI (RIA)'),
                    h('p', { className: 'text-xs text-muted' }, 'Copiloto creativo y agente de ejecución integrado con la base de datos.')
                ])
            ]);
            container.appendChild(header);

            // Three-Column Layout Container
            const layoutGrid = h('div', { className: 'ria-layout-grid w-full' });
            container.appendChild(layoutGrid);

            // ── COLUMN 1: LEFT HISTORY ──────────────────────────────────
            const leftSidebar = h('div', { className: 'ria-sidebar-panel' }, [
                h('button', {
                    className: 'btn btn-primary w-full flex items-center justify-center gap-2 py-2 text-xs font-bold',
                    onClick: async () => {
                        if (isAssistantLoading) return;
                        currentThreadId = null;
                        activeConversation = [
                            { role: 'assistant', content: `¡Hola de nuevo! He iniciado un nuevo chat para ti. ¿En qué marca o guión trabajamos en esta sesión?` }
                        ];
                        renderChatFeed();
                        renderThreadsList();
                    }
                }, [icon('plus', 12), h('span', {}, 'Nuevo Chat')]),

                h('span', { className: 'text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-1 border-bottom pb-2 mt-2' }, [
                    icon('message-square', 14, 'text-muted'),
                    h('span', {}, 'Historial de Chats')
                ]),

                h('div', { 
                    id: 'threads-list-container',
                    className: 'flex-column gap-1 overflow-y-auto',
                    style: { maxHeight: '350px' }
                })
            ]);
            layoutGrid.appendChild(leftSidebar);

            const renderThreadsList = () => {
                const threadsContainer = leftSidebar.querySelector('#threads-list-container');
                if (!threadsContainer) return;
                threadsContainer.innerHTML = '';

                if (chatThreadsList.length === 0) {
                    threadsContainer.appendChild(h('span', { className: 'text-xs text-muted text-center py-4 font-medium' }, 'Sin chats anteriores'));
                    return;
                }

                chatThreadsList.forEach((thread) => {
                    const isActive = thread.id === currentThreadId;
                    
                    const threadBtn = h('div', {
                        className: `flex items-center justify-between p-2 rounded text-xs w-full gap-1 cursor-pointer transition-all hover-bg-tertiary`,
                        style: {
                            border: '1px solid var(--border)',
                            background: isActive ? 'var(--bg-tertiary)' : 'transparent',
                            marginBottom: '4px'
                        },
                        onClick: () => {
                            if (isActive || isAssistantLoading) return;
                            currentThreadId = thread.id;
                            activeConversation = thread.messages || [];
                            renderChatFeed();
                            renderThreadsList();
                        }
                    }, [
                        h('span', { 
                            className: 'truncate flex-1 pr-1', 
                            style: { maxWidth: '140px', color: isActive ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: isActive ? 'bold' : 'normal' } 
                        }, thread.title || 'Conversación sin título'),
                        h('button', {
                            className: 'btn-icon p-1 text-muted hover-text-danger',
                            style: { background: 'none', border: 'none', padding: 0 },
                            title: 'Eliminar Chat',
                            disabled: isAssistantLoading,
                            onClick: async (e) => {
                                e.stopPropagation();
                                if (isAssistantLoading) return;
                                if (confirm('¿Eliminar esta conversación?')) {
                                    try {
                                        await dbService.delete('chats', thread.id);
                                        chatThreadsList = chatThreadsList.filter(t => t.id !== thread.id);
                                        if (currentThreadId === thread.id) {
                                            currentThreadId = null;
                                            activeConversation = [{ role: 'assistant', content: 'Conversación eliminada. Inicia una nueva.' }];
                                        }
                                        renderChatFeed();
                                        renderThreadsList();
                                    } catch (err) {
                                        console.error("Error deleting chat:", err);
                                    }
                                }
                            }
                        }, [icon('trash-2', 11)])
                    ]);

                    threadsContainer.appendChild(threadBtn);
                });
                if (window.lucide) window.lucide.createIcons();
            };

            // ── COLUMN 2: CENTER CHAT ──────────────────────────────────
            const chatCenter = h('div', { className: 'flex-column gap-3', style: { height: '100%', display: 'flex', flexDirection: 'column' } });
            layoutGrid.appendChild(chatCenter);

            const chatFeed = h('div', { className: 'ria-chat-messages flex-1' });
            chatCenter.appendChild(chatFeed);

            // Input Form
            const textInput = h('textarea', {
                id: 'ai-user-message',
                className: 'form-textarea text-xs w-full',
                placeholder: 'Pregúntame algo o inyecta una orden (ej: "Propón un video tipo RC-01 para Villa Grande")...',
                rows: 2,
                style: { resize: 'none', borderRadius: '8px', minHeight: '44px' },
                required: true,
                onKeydown: (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (!isAssistantLoading) inputForm.requestSubmit();
                    }
                }
            });

            const inputForm = h('form', {
                className: 'flex gap-2 items-end mt-2',
                onSubmit: async (e) => {
                    e.preventDefault();
                    const promptVal = textInput.value.trim();
                    if (!promptVal || isAssistantLoading) return;

                    textInput.value = '';
                    activeConversation.push({ role: 'user', content: promptVal });
                    renderChatFeed();

                    isAssistantLoading = true;
                    toggleFormState(true);
                    renderChatFeed(); // Refresh to show typing indicator

                    // Build dynamic context prompt
                    let activeClientFocus = null;
                    const focusId = rightSidebar.querySelector('#ai-client-focus')?.value || 'all';
                    if (focusId !== 'all') {
                        activeClientFocus = clients.find(c => c.id === focusId);
                    }

                    let contextPrompt = `=== CONTEXTO OPERACIONAL DE CREATIVEOS ===
Tú eres RIA (CreativeOS Intelligence Assistant). Eres un copiloto activo de la agencia.
Cuando quieras crear, actualizar o modificar elementos en la base de datos de la agencia, debes proponer obligatoriamente una acción estructurada en formato JSON utilizando el bloque de código \`\`\`agency-action.
¡NO ejecutes la acción tú mismo ni digas que está ejecutada! El sistema presentará al usuario botones de "Confirmar y Ejecutar".

=== ACCIONES SOPORTADAS Y PAYLOADS ===
1. {"type": "create_sop", "payload": {"title": "Título", "steps": ["Paso 1", "Paso 2"]}}
2. {"type": "create_format", "payload": {"name": "Nombre", "structure": "Estructura", "usedFor": "Objetivo"}}
3. {"type": "create_assignment", "payload": {"title": "Título", "client": "Cliente", "employeeName": "Nombre", "status": "Pendiente", "description": "Detalles"}}
4. {"type": "create_hook", "payload": {"title": "Texto del Hook", "psychology": "Curiosidad/etc", "avgRetention": "85%"}}
5. {"type": "create_script", "payload": {"title": "Título", "client": "Cliente", "content": "Texto del guion"}}

`;
                    if (activeClientFocus) {
                        contextPrompt += `\n[Foco de Marca Activo: ${activeClientFocus.nombre || activeClientFocus.name}]\n`;
                    }

                    try {
                        const { data: { session } } = await supabase.auth.getSession();
                        const headers = { "Content-Type": "application/json" };
                        if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;

                        const response = await fetch("/api/chat", {
                            method: "POST",
                            headers,
                            body: JSON.stringify({
                                messages: activeConversation.slice(-6), // Send last few messages to prevent token limits
                                contextPrompt
                            })
                        });

                        if (!response.ok) throw new Error('Fallo al conectar con el proxy AI.');
                        const data = await response.json();
                        const text = data.text || "";
                        
                        activeConversation.push({ role: 'assistant', content: text });

                        // Save conversation in Firestore
                        if (!currentThreadId) {
                            currentThreadId = `chat-${Date.now()}`;
                            const newThread = {
                                id: currentThreadId,
                                title: promptVal.slice(0, 30),
                                messages: activeConversation,
                                userId: user?.uid,
                                updatedAt: new Date().toISOString()
                            };
                            await dbService.set('chats', currentThreadId, newThread);
                            chatThreadsList.unshift(newThread);
                        } else {
                            await dbService.set('chats', currentThreadId, {
                                messages: activeConversation,
                                userId: user?.uid,
                                updatedAt: new Date().toISOString()
                            });
                        }
                    } catch (err) {
                        console.error(err);
                        activeConversation.push({ role: 'assistant', content: `⚠️ **Error**: No se pudo obtener respuesta del proxy de AI. ${err.message}` });
                    } finally {
                        isAssistantLoading = false;
                        toggleFormState(false);
                        renderChatFeed();
                        renderThreadsList();
                        loadAssistant(); // Reload full counts & contexts
                    }
                }
            }, [
                textInput,
                h('button', { type: 'submit', className: 'btn btn-primary text-xs px-3', style: { height: '44px' } }, [icon('send', 13)])
            ]);
            chatCenter.appendChild(inputForm);

            const toggleFormState = (disabled) => {
                textInput.disabled = disabled;
                inputForm.querySelector('button[type="submit"]').disabled = disabled;
            };

            const executePendingAgentAction = async (btn, actionJsonEncoded) => {
                const action = JSON.parse(decodeURIComponent(actionJsonEncoded));
                btn.disabled = true;
                btn.textContent = "Ejecutando...";

                try {
                    await executeAgentAction(action);
                    btn.parentNode.replaceChildren(
                        h('span', { className: 'text-xs font-semibold flex items-center gap-1 text-success' }, [
                            icon('check-circle', 12),
                            'Propuesta ejecutada en Supabase',
                        ])
                    );
                    if (window.lucide) window.lucide.createIcons();
                } catch (err) {
                    alert("Error de permisos o conexión: " + err.message);
                    btn.disabled = false;
                    btn.textContent = "Confirmar y Ejecutar";
                }
            };

            const renderChatFeed = () => {
                chatFeed.innerHTML = '';
                
                activeConversation.forEach((msg) => {
                    const isAI = msg.role === 'assistant';
                    
                    const avatar = h('div', { 
                        className: 'flex items-center justify-center font-bold text-xs',
                        style: { 
                            width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                            background: isAI ? 'var(--accent)' : 'var(--bg-secondary)',
                            color: isAI ? 'var(--bg-primary)' : 'var(--text-primary)',
                            border: isAI ? 'none' : '1px solid var(--border)'
                        } 
                    }, [
                        isAI ? icon('sparkles', 12) : h('span', {}, user?.nombre?.[0]?.toUpperCase() || 'U')
                    ]);

                    const bubble = h('div', { 
                        className: 'p-3 text-xs leading-relaxed max-w-xl flex-column gap-2',
                        style: { 
                            borderRadius: isAI ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border)'
                        }
                    });

                    bubble.innerHTML = formatMarkdown(msg.content);
                    bubble.querySelectorAll('.js-agent-action').forEach((button) => {
                        button.addEventListener('click', () => {
                            executePendingAgentAction(button, button.dataset.action);
                        });
                    });

                    const row = h('div', { 
                        className: `flex gap-3 w-full my-1 items-start ${isAI ? 'justify-start' : 'justify-end flex-row-reverse'}`
                    }, [avatar, bubble]);

                    chatFeed.appendChild(row);
                });

                if (isAssistantLoading) {
                    const typingBubble = h('div', { 
                        className: 'p-3 text-xs leading-relaxed max-w-xl flex items-center gap-2',
                        style: { borderRadius: '4px 16px 16px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }
                    }, [
                        h('div', { className: 'loader', style: { width: '12px', height: '12px', borderWidth: '2px' } }),
                        h('span', { className: 'text-muted' }, 'RIA está procesando la solicitud...')
                    ]);
                    const row = h('div', { className: 'flex gap-3 w-full my-1 items-start' }, [
                        h('div', { 
                            className: 'flex items-center justify-center font-bold text-xs',
                            style: { width: '28px', height: '28px', borderRadius: '50%', background: 'var(--accent)', color: 'var(--bg-primary)' }
                        }, [icon('sparkles', 12)]),
                        typingBubble
                    ]);
                    chatFeed.appendChild(row);
                }

                chatFeed.scrollTop = chatFeed.scrollHeight;
                if (window.lucide) window.lucide.createIcons();
            };

            // ── COLUMN 3: RIGHT CONTEXT ──────────────────────────────────
            const rightSidebar = h('div', { className: 'ria-sidebar-panel' }, [
                h('div', { className: 'flex-column gap-1' }, [
                    h('label', { className: 'text-xs font-bold text-secondary' }, 'Foco de Marca:'),
                    h('select', { 
                        id: 'ai-client-focus', 
                        className: 'form-select text-xs',
                        onChange: () => renderActiveClientContext()
                    }, [
                        h('option', { value: 'all' }, '🌍 Todo el Sistema'),
                        ...clients.map(c => h('option', { value: c.id }, `💼 ${c.nombre || c.name}`))
                    ])
                ]),

                h('div', { id: 'active-client-context-panel', className: 'flex-column gap-3 border-top pt-3' })
            ]);
            layoutGrid.appendChild(rightSidebar);

            const renderActiveClientContext = () => {
                const panel = rightSidebar.querySelector('#active-client-context-panel');
                if (!panel) return;
                panel.innerHTML = '';

                const focusVal = rightSidebar.querySelector('#ai-client-focus').value;
                if (focusVal === 'all') {
                    panel.appendChild(h('div', { className: 'flex-column gap-2 text-xs text-muted' }, [
                        h('span', { className: 'font-semibold text-primary' }, 'Resumen de la Agencia:'),
                        h('div', { className: 'flex justify-between' }, [h('span', {}, 'Formatos:'), h('span', { className: 'font-bold' }, formats.length)]),
                        h('div', { className: 'flex justify-between' }, [h('span', {}, 'Hooks:'), h('span', { className: 'font-bold' }, hooks.length)]),
                        h('div', { className: 'flex justify-between' }, [h('span', {}, 'Clientes:'), h('span', { className: 'font-bold' }, clients.length)]),
                        h('div', { className: 'flex justify-between' }, [h('span', {}, 'Tareas activas:'), h('span', { className: 'font-bold text-accent' }, assignments.filter(a => a.status !== 'Completado').length)])
                    ]));
                } else {
                    const client = clients.find(c => c.id === focusVal);
                    if (client) {
                        panel.appendChild(h('div', { className: 'flex-column gap-2 text-xs' }, [
                            h('span', { className: 'font-bold text-primary' }, client.nombre || client.name),
                            h('p', { className: 'text-muted leading-relaxed', style: { fontSize: '0.7rem' } }, client.description || 'Sin descripción estratégica disponible.'),
                            h('div', { className: 'flex justify-between border-top pt-2' }, [h('span', { className: 'text-muted' }, 'Formatos Asignados:'), h('span', { className: 'font-bold' }, (client.assignedFormats || []).length)]),
                            h('div', { className: 'flex justify-between' }, [h('span', { className: 'text-muted' }, 'Hooks Utilizados:'), h('span', { className: 'font-bold' }, (client.usedHooks || []).length)])
                        ]));
                    }
                }
            };

            const executeAgentAction = async (action) => {
                if (user?.role !== 'admin') {
                    throw new Error("Se requieren permisos de Administrador para realizar esta operación.");
                }
                if (!AGENT_ACTION_TYPES.has(action?.type) || !action.payload || typeof action.payload !== 'object' || Array.isArray(action.payload)) {
                    throw new Error("La propuesta de acción no es válida.");
                }

                if (action.type === 'create_sop') {
                    const id = `SOP-${Date.now().toString().slice(-4)}`;
                    const stepsArr = (action.payload.steps || []).map(text => ({ text, done: false }));
                    await dbService.set('sops', id, {
                        id,
                        title: action.payload.title,
                        iconName: 'check-square',
                        steps: stepsArr.length ? stepsArr : [{ text: 'Punto de verificación inicial', done: false }],
                        createdAt: new Date().toISOString()
                    });
                }
                else if (action.type === 'create_format') {
                    const id = action.payload.id || action.payload.name.toLowerCase().replace(/\s+/g, '-');
                    await dbService.set('formats', id, {
                        id,
                        name: action.payload.name,
                        structure: action.payload.structure || 'Hook + Storytelling + CTA',
                        usedFor: action.payload.usedFor || 'General',
                        createdAt: new Date().toISOString()
                    });
                }
                else if (action.type === 'create_assignment') {
                    await dbService.add('assignments', {
                        title: action.payload.title,
                        client: action.payload.client,
                        employeeName: action.payload.employeeName || '@equipo',
                        status: action.payload.status || 'Pendiente',
                        description: action.payload.description || 'Creado por RIA',
                        createdAt: new Date().toISOString()
                    });
                }
                else if (action.type === 'create_hook') {
                    await dbService.add('hooks', {
                        title: action.payload.title,
                        psychology: action.payload.psychology || 'Curiosidad',
                        avgRetention: action.payload.avgRetention || '80%',
                        createdAt: new Date().toISOString()
                    });
                }
                else if (action.type === 'create_script') {
                    const scriptId = `script-${Date.now().toString().slice(-6)}`;
                    await dbService.set('scripts', scriptId, {
                        id: scriptId,
                        title: action.payload.title,
                        client: action.payload.client,
                        content: action.payload.content,
                        createdAt: new Date().toISOString()
                    });
                }
            };

            // Dynamic Action Proposal Card Parser
            const formatMarkdown = (text) => {
                if (!text) return '';
                let html = text;
                
                html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                
                if (html.includes('```agency-action') && html.lastIndexOf('```') === html.lastIndexOf('```agency-action')) {
                    html += '\n```';
                }

                // Render Action proposal preview/confirm block instead of autocompletion
                html = html.replace(/```agency-action([\s\S]*?)```/g, (match, jsonText) => {
                    try {
                        const action = JSON.parse(jsonText.trim());
                        if (!AGENT_ACTION_TYPES.has(action?.type) || !action.payload || typeof action.payload !== 'object' || Array.isArray(action.payload)) {
                            throw new Error("Invalid action");
                        }
                        const encoded = encodeURIComponent(JSON.stringify(action));
                        const esc = (v) => String(v ?? '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
                        const actionLabel = esc(String(action.type || '').toUpperCase().replace('_', ' '));

                        return `
                        <div class="action-proposal-card">
                            <span class="text-xs font-bold text-primary flex items-center gap-1">
                                ${icon('sparkles', 12).outerHTML} Propuesta de Acción: ${actionLabel}
                            </span>
                            <div class="action-payload-preview">${esc(JSON.stringify(action.payload, null, 2))}</div>
                            <div class="flex gap-2">
                                <button class="btn btn-primary text-xs flex-1 justify-center js-agent-action" data-action="${encoded}">
                                    Confirmar y Ejecutar
                                </button>
                            </div>
                        </div>`;
                    } catch (e) {
                        return `<pre class="bg-tertiary p-3 rounded text-xs font-mono">${jsonText.trim()}</pre>`;
                    }
                });

                // Bold and standard elements
                html = html.replace(/```([\s\S]*?)```/g, '<pre class="bg-tertiary p-2 rounded text-xs font-mono mt-1 mb-1">$1</pre>');
                html = html.replace(/`([^`]+)`/g, '<code class="bg-tertiary px-1 rounded font-mono text-xs text-accent">$1</code>');
                html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
                html = html.replace(/### (.*$)/gim, '<h4 class="font-bold text-xs text-primary mt-2 mb-1">$1</h4>');
                
                return html;
            };

            renderThreadsList();
            renderChatFeed();
            renderActiveClientContext();

        } catch (err) {
            console.error(err);
            container.innerHTML = `<div class="card p-8 text-center text-danger">Error: ${String(err.message || '').replace(/</g, "&lt;")}</div>`;
        }
    };

    loadAssistant();
    return container;
};
