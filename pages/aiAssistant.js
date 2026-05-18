/**
 * AI Assistant Page - Creative Production OS
 * High-fidelity, highly interactive marketing and copy assistant driven by Anthropic Claude 3.5 Sonnet.
 */
import { h, icon } from '../utils/dom.js';
import { dbService } from '../firebase/service.js';
import { assignmentService } from '../services/assignmentService.js';
import { store } from '../js/store.js';

let activeConversation = [
    { role: 'assistant', content: '¡Hola! Soy tu Copiloto Creativo AI. Tengo acceso en tiempo real a tus formatos, hooks, clientes y tareas de la agencia. ¿En qué marca o guión trabajamos hoy?' }
];

export const render = () => {
    const { user } = store.getState();
    const container = h('div', { className: 'fade-in flex flex-column gap-4 w-full', style: { minHeight: '80vh' } });

    const loadAssistant = async () => {
        container.innerHTML = '<div class="loader mb-4"></div>';

        try {
            // Load dynamic system context from Firestore
            const [formats, hooks, clients, assignments] = await Promise.all([
                dbService.getAll('formats'),
                dbService.getAll('hooks'),
                dbService.getAll('clients'),
                assignmentService.getAllAssignments()
            ]);

            container.innerHTML = '';

            // Retrieve saved Anthropic API Key from local storage if overridden
            let localApiKey = localStorage.getItem('rconcept_anthropic_key') || '';

            // Header Controls
            const header = h('div', { 
                className: 'content-header flex justify-between items-center w-full mb-3 flex-wrap gap-3',
                style: { borderBottom: '1px solid var(--border)', paddingBottom: '1rem' } 
            }, [
                h('div', {}, [
                    h('h1', {}, 'AI Creative Assistant'),
                    h('p', { className: 'text-xs text-muted mt-1' }, 'Copiloto estratégico de marketing integrado en tiempo real con las marcas, ganchos y flujos de producción de tu agencia.')
                ]),
                h('div', { className: 'flex gap-2 items-center' }, [
                    // Dynamic Client Context Dropdown Focus Selector
                    h('label', { className: 'text-xs font-semibold text-secondary mr-1' }, 'Foco de Marca:'),
                    h('select', { 
                        id: 'ai-client-focus', 
                        className: 'form-select text-xs font-medium', 
                        style: { width: '180px', padding: '6px 12px' } 
                    }, [
                        h('option', { value: 'all' }, '🌍 Todo el Sistema'),
                        ...clients.map(c => h('option', { value: c.id }, `💼 ${c.nombre || c.name}`))
                    ]),
                    // API Key Settings Icon Cog
                    h('button', {
                        className: 'btn btn-outline text-xs flex items-center justify-center p-2',
                        title: 'Configurar API Key de Anthropic',
                        onClick: () => openApiKeyConfigModal()
                    }, [icon('settings', 14)])
                ])
            ]);

            // Sidebar Copywriting Favor Pills
            const sidePanel = h('div', { 
                className: 'flex-column gap-3 card p-4', 
                style: { flex: '1', minWidth: '240px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' } 
            }, [
                h('span', { className: 'text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-1 border-bottom pb-2' }, [
                    icon('zap', 14, 'text-warning'),
                    h('span', {}, 'Atajos de Redacción')
                ]),
                h('p', { className: 'text-muted mt-1', style: { fontSize: '0.65rem', lineHeight: 'normal' } }, 'Haz clic en cualquier atajo para inyectar una orden de marketing inmediata basada en la marca enfocada.'),
                
                h('button', { 
                    className: 'btn btn-outline text-xs justify-start w-full gap-2 text-left py-2 hover-bg-tertiary',
                    onClick: () => triggerPresetPrompt('Escribir Hook Viral')
                }, [icon('sparkles', 12, 'text-accent'), h('span', {}, 'Escribir Hook Viral')]),
                
                h('button', { 
                    className: 'btn btn-outline text-xs justify-start w-full gap-2 text-left py-2 hover-bg-tertiary',
                    onClick: () => triggerPresetPrompt('Redactar Guión Completo')
                }, [icon('file-text', 12, 'text-accent'), h('span', {}, 'Redactar Guión Completo')]),

                h('button', { 
                    className: 'btn btn-outline text-xs justify-start w-full gap-2 text-left py-2 hover-bg-tertiary',
                    onClick: () => triggerPresetPrompt('Auditar Marca y Estrategia')
                }, [icon('shield-alert', 12, 'text-accent'), h('span', {}, 'Auditar Estrategia Creativa')]),

                h('div', { className: 'mt-3 pt-3 border-top text-xs text-muted flex-column gap-2' }, [
                    h('span', { className: 'font-semibold text-primary' }, 'Datos en Contexto de IA:'),
                    h('div', { className: 'flex justify-between items-center' }, [
                        h('span', {}, 'Formatos Activos:'),
                        h('span', { className: 'font-bold text-primary' }, `${formats.length}`)
                    ]),
                    h('div', { className: 'flex justify-between items-center' }, [
                        h('span', {}, 'Hooks Guardados:'),
                        h('span', { className: 'font-bold text-primary' }, `${hooks.length}`)
                    ]),
                    h('div', { className: 'flex justify-between items-center' }, [
                        h('span', {}, 'Clientes Registrados:'),
                        h('span', { className: 'font-bold text-primary' }, `${clients.length}`)
                    ]),
                    h('div', { className: 'flex justify-between items-center' }, [
                        h('span', {}, 'Tareas de Producción:'),
                        h('span', { className: 'font-bold text-primary' }, `${assignments.filter(a => a.status !== 'Completado').length}`)
                    ])
                ])
            ]);

            // Dynamic Chat Messaging Feed View
            const chatFeed = h('div', { 
                className: 'flex-column gap-3 p-4 overflow-y-auto mb-2 border-radius-md',
                style: { 
                    flex: '1', 
                    maxHeight: '520px', 
                    minHeight: '400px', 
                    background: 'var(--bg-tertiary)', 
                    border: '1px solid var(--border)',
                    borderRadius: '8px'
                } 
            });

            const renderChatFeed = () => {
                chatFeed.innerHTML = '';
                
                activeConversation.forEach((msg) => {
                    const isAI = msg.role === 'assistant';
                    
                    const avatar = h('div', { 
                        className: 'flex items-center justify-center font-bold text-xs',
                        style: { 
                            width: '28px', 
                            height: '28px', 
                            borderRadius: '50%', 
                            flexShrink: 0,
                            background: isAI ? 'linear-gradient(135deg, var(--accent) 0%, #a855f7 100%)' : 'var(--bg-secondary)',
                            color: isAI ? 'white' : 'var(--text-primary)',
                            border: isAI ? 'none' : '1px solid var(--border)'
                        } 
                    }, [
                        isAI ? icon('sparkles', 12) : h('span', {}, user?.nombre?.[0]?.toUpperCase() || 'U')
                    ]);

                    const bubble = h('div', { 
                        className: 'p-3 text-xs leading-relaxed max-w-xl',
                        style: { 
                            borderRadius: isAI ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
                            background: isAI ? 'var(--bg-secondary)' : 'var(--bg-secondary)',
                            border: '1px solid var(--border)',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.01)'
                        }
                    });

                    // Parse custom regex markdown helper
                    bubble.innerHTML = formatMarkdown(msg.content);

                    const row = h('div', { 
                        className: `flex gap-3 w-full my-1 items-start ${isAI ? 'justify-start' : 'justify-end flex-row-reverse'}`
                    }, [avatar, bubble]);

                    chatFeed.appendChild(row);
                });

                // Auto-scroll anchor to bottom
                setTimeout(() => {
                    chatFeed.scrollTop = chatFeed.scrollHeight;
                }, 50);
            };

            // Typing Indicator Loader
            const typingIndicator = h('div', { 
                className: 'flex items-center gap-1 p-3 bg-secondary rounded text-xs text-muted mb-2 border hidden',
                style: { width: 'fit-content', borderRadius: '4px 16px 16px 16px' }
            }, [
                h('div', { className: 'dot-flashing', style: { width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text-muted)', animation: 'dotFlashing 1s infinite alternate' } }),
                h('span', { className: 'ml-2' }, 'Claude está analizando y escribiendo guiones...')
            ]);

            // Form message controls
            const inputArea = h('form', {
                className: 'flex gap-2 w-full',
                onSubmit: async (e) => {
                    e.preventDefault();
                    const textInput = inputArea.querySelector('#ai-user-message');
                    const messageText = textInput.value.trim();

                    if (!messageText) return;

                    textInput.value = '';
                    activeConversation.push({ role: 'user', content: messageText });
                    renderChatFeed();

                    // Trigger request to Claude API proxy
                    await callClaudeProxy();
                }
            }, [
                h('textarea', { 
                    id: 'ai-user-message', 
                    className: 'form-textarea text-xs flex-1', 
                    placeholder: 'Escribe tu pregunta de marketing, pide ganchos o solicita redactar un guión para este cliente...', 
                    rows: 2, 
                    style: { resize: 'none', borderRadius: '8px', minHeight: '44px', maxHeight: '100px' },
                    required: true,
                    onKeydown: (e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            inputArea.requestSubmit();
                        }
                    }
                }),
                h('div', { className: 'flex flex-column gap-1 justify-between' }, [
                    h('button', { type: 'submit', className: 'btn btn-primary text-xs px-4 flex-1 justify-center' }, [icon('send', 12)]),
                    h('button', { 
                        type: 'button', 
                        className: 'btn btn-outline text-xs text-muted px-2',
                        title: 'Limpiar Conversación',
                        onClick: () => {
                            activeConversation = [
                                { role: 'assistant', content: 'Conversación reiniciada. Inyecta un foco de marca o una orden y comenzaremos a escribir guiones.' }
                            ];
                            renderChatFeed();
                        }
                    }, [icon('trash-2', 12)])
                ])
            ]);

            // Core fetch trigger to serverless Claude proxy
            const callClaudeProxy = async () => {
                typingIndicator.classList.remove('hidden');
                
                // 1. Gather dynamic focus context
                const focusClientId = container.querySelector('#ai-client-focus').value;
                let activeClientFocus = null;

                if (focusClientId !== 'all') {
                    activeClientFocus = clients.find(c => c.id === focusClientId);
                }

                // 2. Build structured Operational System prompt
                let contextPrompt = "";
                if (activeClientFocus) {
                    contextPrompt += `=== MARCA EN FOCO ACTIVO ===
Nombre de la Marca/Cliente: ${activeClientFocus.nombre || activeClientFocus.name}
Giro del Negocio: ${activeClientFocus.business || 'Marketing Creativo'}
Directrices Estilo Visual: ${activeClientFocus.visualStyle || 'Retención moderna en Reels/TikTok'}
Objetivo Estratégico: ${activeClientFocus.objective || 'Conversión orgánica e impacto de marca'}
Guiones e Ideas Recomendados: ${JSON.stringify(activeClientFocus.recommendedScripts || [])}

`;
                } else {
                    contextPrompt += `=== RESUMEN GLOBAL DE LA AGENCIA ===
Lista de Clientes Registrados: ${clients.map(c => `${c.nombre} (${c.business || 'General'})`).join(', ')}
`;
                }

                contextPrompt += `=== FORMATOS AUTORIZADOS ===
${formats.map(f => `- ${f.name} (Estructura: ${f.structure || 'Hook + Storytelling + CTA'})`).join('\n')}

=== HOOKS DE RETENCIÓN DISPONIBLES ===
${hooks.map(h => `- "${h.title}" (Categoría: ${h.category || 'Problema'} | Psicología: ${h.psychology || 'Curiosidad'})`).join('\n')}

=== LISTA DE TAREAS EN CURSO ===
${assignments.filter(a => a.status !== 'Completado').map(a => `- Cliente: ${a.client} | Tarea: ${a.title} | Responsable: ${a.employeeName || '@equipo'}`).join('\n')}
`;

                try {
                    const response = await fetch("/api/chat", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            messages: activeConversation,
                            contextPrompt,
                            apiKey: localApiKey
                        })
                    });

                    typingIndicator.classList.add('hidden');

                    if (!response.ok) {
                        const err = await response.json();
                        throw new Error(err.error || 'Fallo de API al consultar a Claude proxy.');
                    }

                    const data = await response.json();
                    activeConversation.push({ role: 'assistant', content: data.text });
                    renderChatFeed();

                } catch (err) {
                    typingIndicator.classList.add('hidden');
                    console.error("Assistant prompt relay error:", err);
                    activeConversation.push({ 
                        role: 'assistant', 
                        content: `⚠️ **Error de Conectividad con Claude:** ${err.message || 'No se pudo recibir respuesta del proxy Vercel API.'}\n\n*Por favor, verifica que tu Vercel Serverless Function esté en producción o que hayas ingresado una clave válida en la configuración (icono de engranaje).*` 
                    });
                    renderChatFeed();
                }
            };

            const triggerPresetPrompt = (type) => {
                const clientSelect = container.querySelector('#ai-client-focus');
                const clientName = clientSelect.options[clientSelect.selectedIndex].text;
                let promptText = "";

                if (type === 'Escribir Hook Viral') {
                    promptText = `Genera 3 ganchos (hooks) verbales de alto impacto diseñados especialmente para ${clientName}. Añade para cada uno la directriz de edición visual exacta y el efecto de sonido sugerido en los primeros 3 segundos.`;
                } else if (type === 'Redactar Guión Completo') {
                    promptText = `Redacta un guión completo de 45 segundos para Reels/TikTok enfocado en ${clientName}. Divide la estructura explícitamente en:
1. Hook de Detención (0-3s)
2. Cuerpo de Retención (ritmo rápido y valor real)
3. CTA exacto orientado a conversión.
Incluye notas de SFX/VFX en negrita para el editor.`;
                } else if (type === 'Auditar Marca y Estrategia') {
                    promptText = `Haz una auditoría rápida de la estrategia creativa y la identidad de contenido para ${clientName}. Dame 3 ideas de contenido totalmente disruptivas que detengan el scroll de la audiencia y se diferencien de su competencia.`;
                }

                const textInput = container.querySelector('#ai-user-message');
                if (textInput) {
                    textInput.value = promptText;
                    textInput.focus();
                }
            };

            // API Key modal manager
            const openApiKeyConfigModal = () => {
                const modalOverlay = h('div', { className: 'modal-overlay' });
                const modalForm = h('form', {
                    className: 'modal-container',
                    onSubmit: (e) => {
                        e.preventDefault();
                        const keyVal = modalForm.querySelector('#api-key-input').value.trim();
                        if (keyVal) {
                            localStorage.setItem('rconcept_anthropic_key', keyVal);
                            localApiKey = keyVal;
                            alert("API Key personalizada guardada con éxito de forma local.");
                        } else {
                            localStorage.removeItem('rconcept_anthropic_key');
                            localApiKey = '';
                            alert("Clave personalizada eliminada. Se usará la clave por defecto.");
                        }
                        document.body.removeChild(modalOverlay);
                    }
                }, [
                    h('div', { className: 'modal-header' }, [
                        h('span', { className: 'modal-title' }, 'Clave API de Anthropic Claude'),
                        h('button', { type: 'button', onClick: () => document.body.removeChild(modalOverlay) }, '×')
                    ]),
                    h('div', { className: 'modal-body flex-column gap-3' }, [
                        h('p', { className: 'text-xs text-secondary leading-relaxed' }, 
                            'Por defecto, la agencia utiliza su propia API Key de Anthropic. Si deseas anularla y usar tu propia clave de Claude para un mayor límite de tokens, ingrésala a continuación. Se guardará de manera 100% segura en tu almacenamiento local.'
                        ),
                        h('div', { className: 'form-group' }, [
                            h('label', { className: 'form-label' }, 'API Key de Claude (sk-ant-...)'),
                            h('input', { 
                                id: 'api-key-input', 
                                type: 'password', 
                                className: 'form-input text-xs font-mono', 
                                placeholder: 'sk-ant-api03-...',
                                value: localApiKey 
                            })
                        ])
                    ]),
                    h('div', { className: 'modal-footer' }, [
                        h('button', { 
                            type: 'button', 
                            className: 'btn btn-outline text-xs text-error', 
                            onClick: () => {
                                localStorage.removeItem('rconcept_anthropic_key');
                                localApiKey = '';
                                modalForm.querySelector('#api-key-input').value = '';
                                alert("Clave restablecida al valor por defecto.");
                            }
                        }, 'Restablecer Clave'),
                        h('button', { type: 'submit', className: 'btn btn-primary text-xs' }, 'Guardar Configuración')
                    ])
                ]);

                modalOverlay.appendChild(modalForm);
                document.body.appendChild(modalOverlay);
            };

            // Assemble main grid layout
            const chatMainView = h('div', { 
                className: 'flex gap-4 w-full flex-wrap', 
                style: { display: 'flex', flexDirection: 'row', alignItems: 'stretch' } 
            }, [
                h('div', { className: 'flex-column', style: { flex: '3', minWidth: '320px' } }, [
                    chatFeed,
                    typingIndicator,
                    inputArea
                ]),
                sidePanel
            ]);

            container.appendChild(header);
            container.appendChild(chatMainView);

            // Initial render of chat thread
            renderChatFeed();

            if (window.lucide) window.lucide.createIcons();

        } catch (err) {
            console.error("AI Assistant load failed:", err);
            container.innerHTML = `<div class="error-state text-sm p-10">${err.message}</div>`;
        }
    };

    // Helper: Regex-based high-performance markdown parser
    const formatMarkdown = (text) => {
        if (!text) return '';
        let html = text;
        
        // Escape HTML tags to prevent custom execution
        html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        
        // Code blocks
        html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
            return `<pre class="bg-tertiary p-3 rounded text-xs overflow-x-auto mt-2 mb-2 font-mono leading-normal border" style="border: 1px solid var(--border); max-width: 100%; white-space: pre-wrap; word-break: break-all;">${code.trim()}</pre>`;
        });
        
        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code class="bg-tertiary px-1 rounded font-mono text-xs text-accent">$1</code>');
        
        // Bold
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        
        // Headers (###, ##, #)
        html = html.replace(/^### (.*$)/gim, '<h4 class="font-bold text-xs text-primary mt-3 mb-1">$1</h4>');
        html = html.replace(/^## (.*$)/gim, '<h3 class="font-bold text-sm text-primary mt-4 mb-2 border-bottom pb-1">$1</h3>');
        html = html.replace(/^# (.*$)/gim, '<h2 class="font-bold text-md text-primary mt-4 mb-2">$1</h2>');
        
        // Lists
        html = html.replace(/^\s*-\s+(.*$)/gim, '<li class="text-xs text-secondary list-disc ml-4 my-1">$1</li>');
        html = html.replace(/^\s*\*\s+(.*$)/gim, '<li class="text-xs text-secondary list-disc ml-4 my-1">$1</li>');
        html = html.replace(/^\s*\d+\.\s+(.*$)/gim, '<li class="text-xs text-secondary list-decimal ml-4 my-1">$1</li>');
        
        // Line breaks (graceful paragraph breaks)
        html = html.split('\n').map(line => {
            if (line.trim().startsWith('<h') || line.trim().startsWith('<pre') || line.trim().startsWith('<li') || line.trim().startsWith('</pre>')) {
                return line;
            }
            return line + '<br>';
        }).join('\n');

        return html;
    };

    loadAssistant();
    return container;
};
