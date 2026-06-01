/**
 * AI Assistant Page - Creative Production OS
 * High-fidelity, highly interactive marketing and copy assistant driven by Anthropic Claude.
 * Updated: Supports agentic execution, ChatGPT-style multi-thread chat history, personal name context, global rate limits,
 * inline typing indicator, living Firestore-based System Rules (system_rules), brand focus summary profiles,
 * and deeply integrated client-format-hook relational logic.
 */
import { h, icon } from '../utils/dom.js';
import { dbService } from '../firebase/service.js';
import { assignmentService } from '../services/assignmentService.js';
import { store } from '../js/store.js';

let activeConversation = [];
let currentThreadId = null;
let chatThreadsList = [];
let isAssistantLoading = false;

export const render = () => {
    const { user } = store.getState();
    const container = h('div', { className: 'fade-in flex flex-column gap-4 w-full', style: { minHeight: '80vh' } });

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
            let metricsList = [];
            let userChats = await dbService.getByQuery('chats', 'userId', '==', user?.uid).catch(() => []);
            let systemRules = await dbService.getAll('system_rules').catch(() => []);

            // MIGRATION: Purge legacy formats (ed-02 and pv-03) from Firestore to prevent polluting the context
            if (formats.some(f => f.id === 'ed-02' || f.id === 'pv-03')) {
                console.log("[Migration] Purging legacy formats ed-02 and pv-03 from Firestore...");
                await dbService.delete('formats', 'ed-02').catch(() => {});
                await dbService.delete('formats', 'pv-03').catch(() => {});
                // Reload formats list
                formats = await dbService.getAll('formats').catch(() => []);
            }

            // AUTO-SEEDING LIVING SYSTEM CONFIGURATION RULES (Dynamic context memory)
            if (systemRules.length < 3 && user?.role === 'admin') {
                const defaultRules = [
                    {
                        id: 'manifesto',
                        title: 'Filosofía Central y Directrices de Operación de la Agencia',
                        content: `=== FILOSOFÍA CENTRAL DEL SISTEMA ===
El objetivo NO es crear contenido aleatorio. El objetivo es DETECTAR PATRONES REUTILIZABLES BASADOS EN EVIDENCIA REAL.
Priorizar siempre: formatos probados, hooks reales, métricas reales, contexto operativo y documentación estructurada.
Debes actuar como un estratega operacional, arquitecto de patrones y auditor de estructura, convirtiendo la experiencia creativa en conocimiento escalable.

=== PRIORIDAD ACTUAL DEL SISTEMA ===
1. Consolidar formatos reales (RC-01, PL-01, FE-01, UB-01)
2. Consolidar hooks reales
3. Relacionar métricas
4. Profundizar contexto estratégico por cliente
5. Construir memoria operacional reutilizable

=== PROTOCOLO PARA CLIENTES SIN DESCRIPCIÓN ESTRATÉGICA ===
Cuando un cliente sin descripción estratégica registrada (Jerez el Caballero, Kantel, Ricos Pandeyucas o Villa Grande) esté enfocado o sea mencionado, debes:
- Tomar la iniciativa y proponer de inmediato una descripción estratégica concreta para esa marca (asumiendo su nicho/giro de negocio lógico).
- Pedirle una única confirmación breve al usuario para guardarla en Firestore utilizando tu acción "update_client". ¡Poblemos activamente los perfiles de la agencia!

=== COMPORTAMIENTO ANTE AMBIGÜEDAD ===
Cuando el usuario haga solicitudes ambiguas:
- NO hagas múltiples preguntas.
- NO bloques el flujo creativo.
- Debes obligatoriamente:
  1. Asumir la dirección más lógica según el contexto.
  2. Proponer una solución concreta.
  3. Terminar con UNA sola confirmación breve.
Ejemplo: "Para Tizón Dorado propondría un RC-01 enfocado en abundancia y cocina criolla. ¿Quieres que lo estructure hacia descubrimiento o familiar?"`,
                        updatedAt: new Date().toISOString()
                    },
                    {
                        id: 'format_rules',
                        title: 'Reglas de Formatos y Diferenciación de Acciones',
                        content: `=== REGLA: CREATE_FORMAT vs CREATE_SOP ===
- "create_format": Usar cuando exista estructura narrativa reutilizable, patrón creativo repetible, formato de contenido o lógica audiovisual. Ejemplos: recorrido comercial, top productos, comparación, POV, storytelling.
- "create_sop": Usar cuando sea un procedimiento operativo de checklist, flujo técnico, proceso interno o ejecución física. Ejemplos: cómo exportar, cómo grabar, naming, revisión de calidad, workflow de edición.

=== DEFINICIÓN DE FORMATOS OPERATIVOS PRINCIPALES ===
1. RC-01 — Recorrido Comercial Narrado
   - Objetivo: Presentar negocio físico mediante recorrido narrado.
   - Estructura: hook + presentación + productos/servicios + experiencia + ambiente + ubicación + cierre.
   - Industria: restaurantes y locales físicos.
2. PL-01 — Presentación/Listado de Productos
   - Objetivo: Mostrar múltiples productos/platos rápidamente.
   - Estructura: producto 1 + producto 2 + producto 3 + CTA ligero.
   - Ideal para: restaurantes, combos, catálogos, promociones.
3. FE-01 — Formato Evento/Fecha Especial
   - Objetivo: Aprovechar contexto temporal/social (fechas especiales, fines de semana, celebraciones).
   - Nota: Es una variación contextual de RC-01.
4. UB-01 — Descubrimiento por Ubicación
   - Objetivo: Activar descubrimiento local y proximidad.
   - Hooks típicos: "Si estás en...", "A 5 minutos de...".
   - Útil para: carretera, turismo local, negocios físicos.`,
                        updatedAt: new Date().toISOString()
                    },
                    {
                        id: 'assignment_script_rules',
                        title: 'Reglas de Vinculación de Guiones y Plan de Producción',
                        content: `=== REGLA DE VINCULACIÓN EN TAREAS ===
Al crear o editar asignaciones ("create_assignment"), los administradores pueden vincular un guión recomendado de la biblioteca ('linkedScript') o un asset de la galería ('linkedAsset'). Esto genera un bloque interactivo con un botón de copia rápida y una referencia visual directa para los empleados en su tablero.

=== VISTA DE GUIONES Y PLAN MENSUAL ===
En la sección de Guiones, todo se organiza de forma Notion-style agrupado por Cliente:
1. "Biblioteca de Guiones Recomendados" (copies ganadores listos para copiar).
2. "Plan de Producción (Este Mes)" (tareas operativas activas del mes corriente programadas para ese cliente).
Los administradores pueden pulsar "+ Añadir a Biblioteca" en el bloque del cliente para agregar nuevos guiones específicos.

=== CÓMO OPERAR CUANDO HAY MUCHA INFORMACIÓN ===
Cuando el usuario te entregue mucha información o copies de marcas:
- Agrupa la información de inmediato por Cliente/Marca.
- Identifica si el copy corresponde a un formato de video (ej. RC-01, PL-01) o es una sugerencia general.
- Usa la acción "create_assignment" para registrar las tareas correspondientes en el plan de producción del mes actual.
- Usa la acción "update_client" para nutrir las directrices estratégicas de cada cliente y asociarle los formatos y hooks indicados.`,
                        updatedAt: new Date().toISOString()
                    }
                ];
                for (const rule of defaultRules) {
                    await dbService.set('system_rules', rule.id, rule);
                }
                systemRules = defaultRules;
            }

            // Ensure our default clients have formatted IDs & initial formats/hooks setup if they don't have them
            clients.forEach(c => {
                if (!c.assignedFormats) c.assignedFormats = [];
                if (!c.usedHooks) c.usedHooks = [];
            });

            // Load daily chat message limits
            let dailyCount = 0;
            let lastDate = "";
            const todayStr = new Date().toISOString().split('T')[0];
            try {
                const limitDoc = await dbService.getById('chats_limit', user?.uid);
                if (limitDoc) {
                    dailyCount = limitDoc.dailyCount || 0;
                    lastDate = limitDoc.lastMessageDate || "";
                }
            } catch (err) {
                console.warn("Could not check rate limit from db:", err);
            }

            const isAdmin = user?.role === 'admin';
            const maxAllowed = isAdmin ? 10 : 5;
            const currentTodayCount = (lastDate === todayStr) ? dailyCount : 0;
            const remainingMessages = Math.max(0, maxAllowed - currentTodayCount);

            // Save threads list sorted by latest updated
            chatThreadsList = userChats.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

            // Select active thread
            if (chatThreadsList.length > 0) {
                currentThreadId = chatThreadsList[0].id;
                activeConversation = chatThreadsList[0].messages || [];
            } else {
                currentThreadId = null;
                activeConversation = [
                    { role: 'assistant', content: `¡Hola, ${user?.nombre || 'Usuario'}! Soy tu Copiloto Creativo AI. Ahora soy un **Agente Activo** con acceso en tiempo real a toda tu agencia. Pídeme crear SOPs, registrar nuevos Formatos Creativos, asignar tareas o actualizar métricas vinculadas directamente. ¿Qué marca o guión trabajamos hoy?` }
                ];
            }

            container.innerHTML = '';

            // Header Controls
            const header = h('div', { 
                className: 'content-header flex justify-between items-center w-full mb-3 flex-wrap gap-3',
                style: { borderBottom: '1px solid var(--border)', paddingBottom: '1rem' } 
            }, [
                h('div', {}, [
                    h('div', { className: 'flex items-center gap-2 flex-wrap' }, [
                        h('h1', {}, 'AI Creative Assistant & Agent'),
                        // Beautiful remaining message pill badge
                        h('span', {
                            id: 'ai-remaining-badge',
                            className: 'badge text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1.5',
                            style: {
                                background: remainingMessages > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                color: remainingMessages > 0 ? '#10b981' : '#ef4444',
                                border: remainingMessages > 0 ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
                                display: 'inline-flex'
                            }
                        }, [
                            icon('message-square', 10),
                            h('span', {}, `Quedan ${remainingMessages} mensajes hoy`)
                        ])
                    ]),
                    h('p', { className: 'text-xs text-muted mt-1' }, 'Copiloto y agente de ejecución integrado en tiempo real con las marcas, métricas, ganchos y flujos de producción de tu agencia.')
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
                    ])
                ])
            ]);

            // Left Column: ChatGPT-style Sidebar Panel for Chat History
            const chatHistorySidebar = h('div', {
                className: 'flex-column gap-3 card p-3',
                style: { width: '220px', minWidth: '200px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }
            }, [
                h('button', {
                    className: 'btn w-full flex items-center justify-center gap-2 py-2 text-xs font-bold',
                    style: { background: 'var(--text-primary)', color: 'var(--bg-primary)' },
                    onClick: () => {
                        if (isAssistantLoading) return;
                        openScriptReviewModal();
                    }
                }, [icon('search', 12), h('span', {}, 'Auditar Guión')]),
                h('button', {
                    className: 'btn btn-primary w-full flex items-center justify-center gap-2 py-2 text-xs font-bold',
                    onClick: async () => {
                        if (isAssistantLoading) return;
                        currentThreadId = null;
                        activeConversation = [
                            { role: 'assistant', content: `¡Hola de nuevo, ${user?.nombre || 'Usuario'}! He iniciado un nuevo chat para ti. ¿En qué marca o guión trabajamos en esta sesión?` }
                        ];
                        renderChatFeed();
                        renderThreadsList();
                    }
                }, [icon('plus', 12), h('span', {}, 'Nuevo Chat')]),
                
                h('span', { className: 'text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-1 border-bottom pb-2 mt-2' }, [
                    icon('message-square', 14, 'text-muted'),
                    h('span', {}, 'Historial de Chats')
                ]),

                // Container for threads list
                h('div', { 
                    id: 'threads-list-container',
                    className: 'flex-column gap-1 overflow-y-auto mt-2',
                    style: { maxHeight: '350px' }
                })
            ]);

            const renderThreadsList = () => {
                const threadsContainer = chatHistorySidebar.querySelector('#threads-list-container');
                if (!threadsContainer) return;
                threadsContainer.innerHTML = '';

                if (chatThreadsList.length === 0) {
                    threadsContainer.appendChild(h('span', { className: 'text-xs text-muted text-center py-4 font-medium' }, 'Sin chats anteriores'));
                    return;
                }

                chatThreadsList.forEach((thread) => {
                    const isActive = thread.id === currentThreadId;
                    
                    const threadBtn = h('div', {
                        className: `flex items-center justify-between p-2 rounded text-xs w-full gap-1 cursor-pointer transition-all hover-bg-tertiary ${isActive ? 'bg-secondary font-bold border-left-active' : 'text-secondary'}`,
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
                            style: { maxWidth: '130px', color: isActive ? 'var(--accent)' : 'var(--text-secondary)' } 
                        }, thread.title || 'Conversación sin título'),
                        h('div', { className: 'flex items-center gap-1' }, [
                            h('button', {
                                className: 'btn btn-icon p-1 text-muted hover-text-danger',
                                style: { background: 'none', border: 'none', padding: 0 },
                                title: 'Eliminar Chat',
                                disabled: isAssistantLoading,
                                onClick: async (e) => {
                                    e.stopPropagation();
                                    if (isAssistantLoading) return;
                                    if (confirm('¿Estás seguro de que deseas eliminar esta conversación?')) {
                                        try {
                                            await dbService.delete('chats', thread.id);
                                            chatThreadsList = chatThreadsList.filter(t => t.id !== thread.id);
                                            if (currentThreadId === thread.id) {
                                                if (chatThreadsList.length > 0) {
                                                    currentThreadId = chatThreadsList[0].id;
                                                    activeConversation = chatThreadsList[0].messages || [];
                                                } else {
                                                    currentThreadId = null;
                                                    activeConversation = [
                                                        { role: 'assistant', content: `¡Hola, ${user?.nombre || 'Usuario'}! He iniciado una nueva sesión para ti. Pídeme lo que necesites.` }
                                                    ];
                                                }
                                            }
                                            renderChatFeed();
                                            renderThreadsList();
                                        } catch (err) {
                                            console.error("Error deleting chat:", err);
                                        }
                                    }
                                }
                            }, [icon('trash-2', 11)])
                        ])
                    ]);

                    threadsContainer.appendChild(threadBtn);
                });
                
                if (window.lucide) window.lucide.createIcons();
            };

            // Right Column: Operational stats and quick templates
            const sidePanel = h('div', { 
                className: 'flex-column gap-3 card p-4', 
                style: { width: '220px', minWidth: '200px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' } 
            }, [
                // Admin Feedback/Metrics registration block
                isAdmin ? h('div', { className: 'flex-column gap-2 mb-2 pb-2 border-bottom' }, [
                    h('span', { className: 'text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-1' }, [
                        icon('lightbulb', 14, 'text-warning'),
                        h('span', {}, 'Registrar Éxito (IA)')
                    ]),
                    h('p', { className: 'text-muted mt-1', style: { fontSize: '0.62rem', lineHeight: 'normal' } }, 'Cuéntale a la IA sobre el rendimiento de un video o qué causó su éxito para guardarlo en la base de datos.'),
                    h('textarea', {
                        id: 'ai-success-feedback',
                        className: 'form-textarea text-xs',
                        placeholder: 'Ej: El video de Kantel con PL-01 y hook "Sabías que..." tuvo 150k vistas y 78% retención en Mayo 2026 porque mostramos el queso derretido en los primeros 2s...',
                        rows: 3,
                        style: { fontSize: '0.65rem', resize: 'none', background: 'var(--bg-tertiary)' }
                    }),
                    h('button', {
                        type: 'button',
                        className: 'btn btn-primary text-xs w-full py-1.5 justify-center gap-1 font-bold',
                        disabled: isAssistantLoading,
                        onClick: () => {
                            const feedbackText = sidePanel.querySelector('#ai-success-feedback').value.trim();
                            if (!feedbackText) {
                                alert("Por favor ingresa los detalles del rendimiento antes de procesar.");
                                return;
                            }
                            
                            const promptText = `[OPERACIÓN: REGISTRAR APRENDIZAJE Y MÉTRICAS DE ÉXITO]
Analiza la siguiente información provista por el Administrador acerca del éxito de un video.
Tu objetivo es:
1. Identificar el cliente (ej: Kantel, Tizón Dorado, etc.) y extraer las métricas de rendimiento mencionadas (periodo, vistas, retención, hooks, formatos, etc.).
2. Registrar/actualizar esta métrica en la base de datos llamando a la acción "update_metric" con source: "real".
3. Identificar el patrón de éxito (por qué funcionó mejor) y agregarlo/actualizarlo en el perfil estratégico del cliente llamando a la acción "update_client".
4. Confirmar de manera muy ejecutiva qué métricas e insights se guardaron en Firestore.

Información del Administrador:
"${feedbackText}"`;
                            
                            const textInput = container.querySelector('#ai-user-message');
                            if (textInput) {
                                textInput.value = promptText;
                                textInput.focus();
                                // Click the submit button or call inputArea submit handler
                                inputArea.requestSubmit();
                                sidePanel.querySelector('#ai-success-feedback').value = '';
                            }
                        }
                    }, [icon('sparkles', 10), h('span', {}, 'Procesar con IA')])
                ]) : null,

                h('span', { className: 'text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-1 border-bottom pb-2' }, [
                    icon('zap', 14, 'text-warning'),
                    h('span', {}, 'Atajos de Redacción')
                ]),
                h('p', { className: 'text-muted mt-1', style: { fontSize: '0.65rem', lineHeight: 'normal' } }, 'Haz clic en cualquier atajo para inyectar una orden de marketing inmediata basada en la marca enfocada.'),
                
                h('button', { 
                    className: 'btn btn-outline text-xs justify-start w-full gap-2 text-left py-2 hover-bg-tertiary',
                    disabled: isAssistantLoading,
                    onClick: () => triggerPresetPrompt('Escribir Hook Viral')
                }, [icon('sparkles', 12, 'text-accent'), h('span', {}, 'Escribir Hook Viral')]),
                
                h('button', { 
                    className: 'btn btn-outline text-xs justify-start w-full gap-2 text-left py-2 hover-bg-tertiary',
                    disabled: isAssistantLoading,
                    onClick: () => triggerPresetPrompt('Redactar Guión Completo')
                }, [icon('file-text', 12, 'text-accent'), h('span', {}, 'Redactar Guión Completo')]),

                h('button', { 
                    className: 'btn btn-outline text-xs justify-start w-full gap-2 text-left py-2 hover-bg-tertiary',
                    disabled: isAssistantLoading,
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
                    ]),
                    h('div', { className: 'flex justify-between items-center' }, [
                        h('span', {}, 'Guías SOPs Activas:'),
                        h('span', { className: 'font-bold text-primary' }, `${sopsList.length}`)
                    ]),
                    h('div', { className: 'flex justify-between items-center' }, [
                        h('span', {}, 'Guiones en Sistema:'),
                        h('span', { className: 'font-bold text-primary' }, `${scripts.length}`)
                    ])
                ])
            ]);

            // Middle Column: Dynamic Brand Profile Summary Card
            const brandSummaryContainer = h('div', { 
                id: 'ai-brand-focus-summary', 
                className: 'mb-3',
                style: { display: 'none' }
            });

            const renderBrandFocusSummary = () => {
                brandSummaryContainer.innerHTML = '';
                const selectedId = clientSelect.value;
                if (selectedId === 'all') {
                    brandSummaryContainer.style.display = 'none';
                    return;
                }
                
                const client = clients.find(c => c.id === selectedId);
                if (!client) {
                    brandSummaryContainer.style.display = 'none';
                    return;
                }
                
                brandSummaryContainer.style.display = 'block';
                brandSummaryContainer.appendChild(h('div', { 
                    className: 'card p-3 flex-column gap-2 bg-secondary border',
                    style: { borderLeft: '4px solid var(--accent)' }
                }, [
                    h('div', { className: 'flex justify-between items-center' }, [
                        h('div', { className: 'flex items-center gap-2' }, [
                            icon('users', 14, 'text-accent'),
                            h('span', { className: 'text-xs font-bold text-primary' }, `Perfil Estratégico: ${client.nombre || client.name}`)
                        ]),
                        h('span', { className: 'badge badge-secondary text-xs' }, client.businessType || 'General')
                    ]),
                    h('p', { className: 'text-xs text-muted leading-relaxed' }, client.description || 'Sin descripción estratégica disponible. Pídele al Copiloto crear una.'),
                    h('div', { className: 'flex gap-4 flex-wrap mt-1 border-top pt-2' }, [
                        h('div', { className: 'flex-column gap-1' }, [
                            h('span', { className: 'text-xs font-semibold text-secondary' }, 'Formatos Asignados:'),
                            h('div', { className: 'flex gap-1 flex-wrap mt-1' }, 
                                (client.assignedFormats || []).length === 0 ? [h('span', { className: 'text-xs text-muted italic' }, 'Ninguno')] :
                                (client.assignedFormats || []).map(f => h('span', { className: 'badge badge-info text-xs font-normal' }, f))
                            )
                        ]),
                        h('div', { className: 'flex-column gap-1' }, [
                            h('span', { className: 'text-xs font-semibold text-secondary' }, 'Hooks Utilizados:'),
                            h('div', { className: 'flex gap-1 flex-wrap mt-1' }, 
                                (client.usedHooks || []).length === 0 ? [h('span', { className: 'text-xs text-muted italic' }, 'Ninguno')] :
                                (client.usedHooks || []).map(hk => h('span', { className: 'badge badge-secondary text-xs font-normal' }, hk))
                            )
                        ])
                    ])
                ]));
                
                if (window.lucide) window.lucide.createIcons();
            };

            // Middle Column: Dynamic Chat Messaging Feed View
            const chatFeed = h('div', { 
                className: 'flex-column gap-3 p-4 mb-2 border-radius-md',
                style: { 
                    height: '440px', 
                    overflowY: 'auto',
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

                    // Parse custom markdown and visually elegant action cards
                    bubble.innerHTML = formatMarkdown(msg.content);

                    const row = h('div', { 
                        className: `flex gap-3 w-full my-1 items-start ${isAI ? 'justify-start' : 'justify-end flex-row-reverse'}`
                    }, [avatar, bubble]);

                    chatFeed.appendChild(row);
                });

                // Render dynamic inline typing indicator bubble inside feed
                if (isAssistantLoading) {
                    const avatar = h('div', { 
                        className: 'flex items-center justify-center font-bold text-xs',
                        style: { 
                            width: '28px', 
                            height: '28px', 
                            borderRadius: '50%', 
                            flexShrink: 0,
                            background: 'linear-gradient(135deg, var(--accent) 0%, #a855f7 100%)',
                            color: 'white'
                        } 
                    }, [icon('sparkles', 12)]);

                    const bubble = h('div', { 
                        className: 'p-3 text-xs leading-relaxed max-w-xl flex items-center gap-2',
                        style: { 
                            borderRadius: '4px 16px 16px 16px',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border)',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.01)'
                        }
                    }, [
                        h('div', { className: 'dot-flashing', style: { width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text-muted)', animation: 'dotFlashing 1s infinite alternate' } }),
                        h('span', { className: 'text-muted' }, 'Copiloto está analizando la solicitud y ejecutando acciones...')
                    ]);

                    const row = h('div', { 
                        className: 'flex gap-3 w-full my-1 items-start justify-start'
                    }, [avatar, bubble]);

                    chatFeed.appendChild(row);
                }

                // Auto-scroll anchor to bottom
                setTimeout(() => {
                    chatFeed.scrollTop = chatFeed.scrollHeight;
                }, 50);
            };

            const initialPrompt = localStorage.getItem('ria_prefill') || '';
            if (initialPrompt) localStorage.removeItem('ria_prefill');

            // Form message controls
            const inputArea = h('form', {
                className: 'flex gap-2 w-full',
                onSubmit: async (e) => {
                    e.preventDefault();
                    if (isAssistantLoading) return;
                    const textInput = inputArea.querySelector('#ai-user-message');
                    const messageText = textInput.value.trim();

                    if (!messageText) return;

                    // Enforce strict message limit: 10 per day for admins, 5 per day for collaborators/viewers
                    const isAdmin = user?.role === 'admin';
                    const maxDailyLimit = isAdmin ? 10 : 5;
                    const todayStr = new Date().toISOString().split('T')[0];
                    let dailyCount = 0;
                    let lastDate = "";
                    
                    try {
                        const limitDoc = await dbService.getById('chats_limit', user?.uid);
                        if (limitDoc) {
                            dailyCount = limitDoc.dailyCount || 0;
                            lastDate = limitDoc.lastMessageDate || "";
                        }
                    } catch (err) {
                        console.warn("Could not check rate limit from db, using safety checks:", err);
                    }

                    if (lastDate === todayStr && dailyCount >= maxDailyLimit) {
                        activeConversation.push({ role: 'user', content: messageText });
                        activeConversation.push({
                            role: 'assistant',
                            content: `⚠️ **Límite diario alcanzado**: Has alcanzado tu límite de **${maxDailyLimit} mensajes diarios** para tu cuenta (${isAdmin ? 'Administrador' : 'Colaborador'}). Este límite se restablecerá mañana.`
                        });
                        textInput.value = '';
                        renderChatFeed();
                        return;
                    }

                    textInput.value = '';
                    activeConversation.push({ role: 'user', content: messageText });
                    renderChatFeed();

                    // If it is a new chat session, generate currentThreadId immediately and persist user's initial message
                    if (currentThreadId === null) {
                        currentThreadId = `${user?.uid}_${Date.now()}`;
                        const cleanTitle = messageText.slice(0, 24) + (messageText.length > 24 ? '...' : '');
                        
                        const newThreadObj = {
                            id: currentThreadId,
                            userId: user?.uid,
                            title: cleanTitle || 'Conversación Creativa',
                            messages: activeConversation,
                            updatedAt: new Date().toISOString()
                        };

                        try {
                            await dbService.set('chats', currentThreadId, newThreadObj);
                            chatThreadsList.unshift(newThreadObj);
                            renderThreadsList();
                        } catch (err) {
                            console.warn("Could not save initial chat message thread to Firestore:", err);
                        }
                    } else {
                        // Persist user's message in the current thread immediately to prevent losing history on reload
                        try {
                            await dbService.set('chats', currentThreadId, {
                                messages: activeConversation,
                                userId: user?.uid,
                                updatedAt: new Date().toISOString()
                            });
                        } catch (err) {
                            console.warn("Could not persist message to existing thread:", err);
                        }
                    }

                    // Trigger request to Claude API proxy
                    await callClaudeProxy(messageText);
                }
            }, [
                h('textarea', { 
                    id: 'ai-user-message', 
                    className: 'form-textarea text-xs flex-1', 
                    placeholder: 'Pídeme crear un Formato Creativo, asignar tareas, vincular un hook a una marca o actualizar métricas vinculadas...', 
                    rows: 2, 
                    value: initialPrompt,
                    style: { resize: 'none', borderRadius: '8px', minHeight: '44px', maxHeight: '100px' },
                    required: true,
                    onKeydown: (e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            const isMobile = window.innerWidth <= 768 || ('ontouchstart' in window);
                            if (!isMobile) {
                                e.preventDefault();
                                if (!isAssistantLoading) inputArea.requestSubmit();
                            }
                        }
                    }
                }),
                h('div', { className: 'flex flex-column gap-1 justify-between' }, [
                    h('button', { type: 'submit', className: 'btn btn-primary text-xs px-4 flex-1 justify-center' }, [icon('send', 12)]),
                    h('button', { 
                        type: 'button', 
                        className: 'btn btn-outline text-xs text-muted px-2',
                        title: 'Limpiar Chat Actual',
                        onClick: async () => {
                            if (isAssistantLoading) return;
                            activeConversation = [
                                { role: 'assistant', content: 'Conversación reiniciada. Inyecta una orden o pídemelo de manera directa y comenzaremos.' }
                            ];
                            renderChatFeed();
                            
                            if (currentThreadId) {
                                try {
                                    await dbService.set('chats', currentThreadId, {
                                        messages: activeConversation,
                                        userId: user?.uid,
                                        updatedAt: new Date().toISOString()
                                    });
                                } catch(e) {
                                    console.warn("Failed to clear current thread in Firestore:", e);
                                }
                            }
                        }
                    }, [icon('trash-2', 12)])
                ])
            ]);

            // Helper to toggle inputs and buttons disabled state while loading
            const toggleFormState = (disabled) => {
                const textarea = inputArea.querySelector('#ai-user-message');
                const submitBtn = inputArea.querySelector('button[type="submit"]');
                const clearBtn = inputArea.querySelector('button[type="button"]');
                if (textarea) textarea.disabled = disabled;
                if (submitBtn) submitBtn.disabled = disabled;
                if (clearBtn) clearBtn.disabled = disabled;
            };

            // Helper to execute agent actions directly on Firestore in real-time
            const executeAgentAction = async (action) => {
                console.log("[Agent] Executing Action:", action);
                try {
                    // Check admin role for delicate actions (SOP, Format, Client updates, Metric updates)
                    if (action.type === 'create_sop' || action.type === 'create_format' || action.type === 'create_client' || action.type === 'update_client') {
                        if (user?.role !== 'admin') {
                            console.warn("[Agent] Permission Denied: User is not an admin.");
                            activeConversation.push({
                                role: 'assistant',
                                content: `⚠️ **Permiso Denegado**: Lo siento, pero no tienes permisos de administrador para realizar modificaciones estratégicas en clientes, formatos o procedimientos (SOPs). Solo los administradores pueden realizar estas operaciones.`
                            });
                            renderChatFeed();
                            return;
                        }
                    }

                    if (action.type === 'create_sop') {
                        const id = `SOP-${Date.now().toString().slice(-4)}`;
                        const stepsArr = (action.payload.steps || []).map(text => ({ text, done: false }));
                        const newSop = {
                            id,
                            title: action.payload.title,
                            iconName: action.payload.iconName || 'check-square',
                            steps: stepsArr.length ? stepsArr : [{ text: 'Punto de verificación inicial', done: false }]
                        };
                        await dbService.set('sops', id, newSop);
                        console.log("[Agent] SOP created successfully:", id);
                    } 
                    else if (action.type === 'create_format') {
                        const id = action.payload.id || action.payload.name.toLowerCase().replace(/\s+/g, '-');
                        const newFormat = {
                            id,
                            name: action.payload.name,
                            structure: action.payload.structure || 'Hook + Storytelling + CTA',
                            usedFor: action.payload.usedFor || 'General',
                            exampleHooks: action.payload.exampleHooks || [],
                            clients: action.payload.clients || [],
                            createdAt: new Date().toISOString()
                        };
                        await dbService.set('formats', id, newFormat);
                        console.log("[Agent] Format created successfully:", id);
                        
                        // Force refresh main formats list in local state
                        formats = await dbService.getAll('formats').catch(() => []);
                    }
                    else if (action.type === 'create_assignment') {
                        let resolvedClientName = action.payload.client || 'General';
                        const foundC = clients.find(c => c.id === resolvedClientName || c.nombre === resolvedClientName || c.name === resolvedClientName);
                        if (foundC) resolvedClientName = foundC.nombre || foundC.name;

                        const newAsg = {
                            title: action.payload.title,
                            client: resolvedClientName,
                            employeeName: action.payload.employeeName || '@equipo',
                            status: action.payload.status || 'Pendiente',
                            description: action.payload.description || 'Creado automáticamente por el Copiloto de IA',
                            createdAt: new Date().toISOString()
                        };
                        await dbService.add('assignments', newAsg);
                        console.log("[Agent] Assignment created successfully.");
                    }                    else if (action.type === 'create_hook') {
                        const newHook = {
                            title: action.payload.title,
                            category: action.payload.category || 'General',
                            psychology: action.payload.psychology || 'Curiosidad',
                            timesUsed: action.payload.timesUsed || 0,
                            avgRetention: action.payload.avgRetention || '0%',
                            topClient: action.payload.topClient || 'N/A',
                            source: 'real', // Tagged as real production hook
                            createdAt: new Date().toISOString()
                        };
                        await dbService.add('hooks', newHook);
                        console.log("[Agent] Hook saved successfully with metrics.");
                    }
                    else if (action.type === 'create_script') {
                        let resolvedClientName = action.payload.client || 'General';
                        const foundC = clients.find(c => c.id === resolvedClientName || c.nombre === resolvedClientName || c.name === resolvedClientName);
                        if (foundC) resolvedClientName = foundC.nombre || foundC.name;

                        const newScript = {
                            title: action.payload.title || 'Nuevo Guión',
                            client: resolvedClientName,
                            content: action.payload.content || 'Sin contenido',
                            recommendedFormat: action.payload.recommendedFormat || '',
                            recommendedHook: action.payload.recommendedHook || '',
                            createdAt: new Date().toISOString()
                        };
                        const id = `script-${Date.now().toString().slice(-6)}`;
                        await dbService.set('scripts', id, newScript);
                        console.log("[Agent] Script created successfully.");
                        
                        // Force refresh main scripts list
                        scripts = await dbService.getAll('scripts').catch(() => []);
                    }
                    else if (action.type === 'update_script') {
                        if (!action.payload.scriptId) throw new Error("Falta el ID del guión (scriptId) para actualizar.");
                        const updates = {};
                        if (action.payload.title) updates.title = action.payload.title;
                        if (action.payload.content) updates.content = action.payload.content;
                        if (action.payload.recommendedFormat) updates.recommendedFormat = action.payload.recommendedFormat;
                        if (action.payload.recommendedHook) updates.recommendedHook = action.payload.recommendedHook;
                        
                        await dbService.update('scripts', action.payload.scriptId, updates);
                        console.log("[Agent] Script updated successfully.");
                    }
                    else if (action.type === 'update_client') {
                        const clientDoc = await dbService.getById('clients', action.payload.clientId);
                        if (clientDoc) {
                            const updatedDescription = action.payload.description || clientDoc.description || '';
                            
                            // Merge formats & hooks safely, preventing overrides with empty payloads
                            let mergedFormats = clientDoc.assignedFormats || [];
                            if (action.payload.assignedFormats && action.payload.assignedFormats.length > 0) {
                                mergedFormats = Array.from(new Set([...mergedFormats, ...action.payload.assignedFormats]));
                            }

                            let mergedHooks = clientDoc.usedHooks || [];
                            if (action.payload.usedHooks && action.payload.usedHooks.length > 0) {
                                mergedHooks = Array.from(new Set([...mergedHooks, ...action.payload.usedHooks]));
                            }

                            const updatedClient = {
                                ...clientDoc,
                                description: updatedDescription,
                                assignedFormats: mergedFormats,
                                usedHooks: mergedHooks,
                                updatedAt: new Date().toISOString()
                            };
                            await dbService.set('clients', action.payload.clientId, updatedClient);
                            console.log("[Agent] Client updated successfully (merged formats and hooks safely):", action.payload.clientId);
                            
                            // Force refresh main clients list in local state
                            clients = await dbService.getAll('clients').catch(() => []);
                            if (user?.role !== 'admin' && user?.allowedClients) {
                                clients = clients.filter(c => user.allowedClients.includes(c.id));
                            }
                            renderBrandFocusSummary();
                        } else {
                            throw new Error(`Client with ID ${action.payload.clientId} not found`);
                        }
                    }
                    else if (action.type === 'create_client') {
                        const id = action.payload.id || action.payload.name.toLowerCase().replace(/\s+/g, '-');
                        const newClient = {
                            id,
                            name: action.payload.name,
                            businessType: action.payload.businessType || 'General',
                            description: action.payload.description || 'Creado automáticamente por el Copiloto de IA',
                            assignedFormats: action.payload.assignedFormats || [],
                            usedHooks: action.payload.usedHooks || [],
                            logo: action.payload.logo || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&q=80',
                            viralVideos: [],
                            assets: [],
                            createdAt: new Date().toISOString()
                        };
                        await dbService.set('clients', id, newClient);
                        console.log("[Agent] Client created successfully:", id);
                        
                        // Force refresh main clients list in local state
                        clients = await dbService.getAll('clients').catch(() => []);
                        if (user?.role !== 'admin' && user?.allowedClients) {
                            clients = clients.filter(c => user.allowedClients.includes(c.id));
                        }
                    }
                } catch (err) {
                    console.error("[Agent] Error executing database operation:", err);
                    throw err;
                }
            };

            // Silent Sidebar context counters refresh to avoid rendering loaders
            const refreshSidebarCounters = async () => {
                try {
                    let [f, hks, c, a, s, m, scrs] = await Promise.all([
                        dbService.getAll('formats'),
                        dbService.getAll('hooks'),
                        dbService.getAll('clients'),
                        assignmentService.getAllAssignments(),
                        dbService.getAll('sops').catch(() => []),
                        dbService.getAll('metrics').catch(() => []),
                        dbService.getAll('scripts').catch(() => [])
                    ]);
                    
                    if (user?.role !== 'admin' && user?.allowedClients) {
                        c = c.filter(client => user.allowedClients.includes(client.id));
                        scrs = scrs.filter(scr => {
                            const match = c.find(cl => cl.nombre === scr.client || cl.name === scr.client);
                            return !!match;
                        });
                    }
                    
                    scripts = scrs;
                    const countBlock = sidePanel.querySelector('.mt-3');
                    if (countBlock) {
                        countBlock.innerHTML = `
                            <span class="font-semibold text-primary">Datos en Contexto de IA:</span>
                            <div class="flex justify-between items-center">
                                <span>Formatos Activos:</span>
                                <span class="font-bold text-primary">${f.length}</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span>Hooks Guardados:</span>
                                <span class="font-bold text-primary">${hks.length}</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span>Clientes Registrados:</span>
                                <span class="font-bold text-primary">${c.length}</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span>Tareas de Producción:</span>
                                <span class="font-bold text-primary">${a.filter(item => item.status !== 'Completado').length}</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span>Guías SOPs Activas:</span>
                                <span class="font-bold text-primary">${s.length}</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span>Métricas Operativas:</span>
                                <span class="font-bold text-primary">${m.length}</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span>Guiones en Sistema:</span>
                                <span class="font-bold text-primary">${scrs.length}</span>
                            </div>
                        `;
                    }
                } catch (err) {
                    console.warn("[Agent] Silent refresh failed:", err);
                }
            };

            // Listen to client focus changes and draw the strategic connection profile card immediately
            const clientSelect = header.querySelector('#ai-client-focus');
            clientSelect.addEventListener('change', () => {
                renderBrandFocusSummary();
            });

            // Core fetch trigger to serverless Claude proxy
            const callClaudeProxy = async (firstMessageText = '') => {
                isAssistantLoading = true;
                toggleFormState(true);
                renderChatFeed();
                
                // 1. Gather dynamic focus context
                const focusClientId = container.querySelector('#ai-client-focus').value;
                let activeClientFocus = null;

                if (focusClientId !== 'all') {
                    activeClientFocus = clients.find(c => c.id === focusClientId);
                }

                // 2. Build structured Operational System prompt with complete project architecture
                let contextPrompt = `=== TONALIDAD Y DIRECTRICES DE COMUNICACIÓN ===
1. Sé extremadamente profesional, directo y conciso. Ve directo al grano sin rodeos, introducciones largas ni saludos repetitivos.
2. Reduce al mínimo absoluto el uso de emojis. Usa un máximo de 1 emoji por respuesta completa. No decores cada viñeta o frase con emojis.
3. No saludes al inicio de cada mensaje si ya estamos conversando.
4. MUY IMPORTANTE: Dirígete al usuario por su nombre (${user?.nombre || 'Usuario'}) de forma natural y profesional en tu respuesta para que sepa que lo reconoces individualmente.
5. Toda actualización estratégica que hagas a un cliente o formato se almacena inmediatamente en Firestore, lo que significa que el sistema te la inyectará automáticamente en tu contexto en futuros chats. ¡Tienes memoria viva permanente!
6. NUNCA muestres procesos internos, JSONs crudos ni detalles técnicos al usuario. Tu respuesta visible debe ser solo el resultado profesional y limpio. Los bloques agency-action van al final de tu respuesta y el sistema los oculta visualmente para el usuario.
7. Puedes incluir MÚLTIPLES bloques agency-action en una sola respuesta. El sistema los ejecutará todos secuencialmente.
8. POLÍTICA DE SOPs (CERO BUROCRACIA): Cuando el usuario te pida crear o estructurar un SOP (Standard Operating Procedure) para cualquier rol (Camarógrafo, Editor, Ventas, etc.), actúa como un experto implacable con décadas de experiencia. Tu filosofía es "Cero Burocracia". Los SOPs deben ser ultracortos, directos y contener ÚNICAMENTE puntos de control de "Vida o Muerte". Si un paso no previene directamente un desastre de producción o ventas, omítelo. Habla con autoridad y evita procesos corporativos largos.

=== INFORMACIÓN DEL USUARIO ACTIVO ===
Nombre del Usuario: ${user?.nombre || 'Usuario'}
Correo del Usuario: ${user?.email || 'General'}
Rol en la Agencia: ${user?.role || 'viewer'}

=== ARQUITECTURA COMPLETA DEL SISTEMA CREATIVEOS ===
Este es un sistema operativo de producción creativa para la agencia RConcept. Los datos se guardan en Firebase Firestore.
Las páginas del sistema y sus colecciones de Firestore son:

1. **Dashboard** (#dashboard) — Vista general con métricas rápidas y accesos directos. Lee de: clients, assignments.
2. **Asignaciones** (#assignments) — Tablero Kanban de tareas de producción. Colección: "assignments". Campos: title, client, employeeName, employeeId, status ("Pendiente"|"En Producción"|"Revisión"|"Completado"), type, description, dueDate, linkedScript, createdAt.
3. **Clientes** (#clients) — Directorio de marcas/clientes. Colección: "clients". Campos: id (slug), name, businessType, description, logo (URL), assignedFormats (array), usedHooks (array), viralVideos (array de {platform, title, url}), assets (array), recommendedLinks (array de {title, url}).
4. **Detalle de Cliente** (#clients/:id) — Perfil completo de un cliente. Lee de: clients, assignments. "Guiones Recomendados" redirige a #scripts.
5. **Pagos/Facturación** (#billing) — Hojas de cobro estilo Excel. Colecciones: "invoices" (reportes del empleado) y "admin_invoices" (liquidación oficial del admin). Campos: employeeId, employeeName, type, client, amount, observations, items (array de líneas), status, createdAt.
6. **Assets** (#assets) — Librería multimedia en Firebase Storage. Colección: "assets". Campos: id, title, type (video|thumbnail), client, format, thumbnail (URL), url (URL de descarga), storagePath, status (ready|editing|review), createdAt.
7. **Formatos** (#formats) — Plantillas de estructura narrativa de video. Colección: "formats". Campos: id (código como "rc-01"), name, objective, structure, exampleScript, hooks (array), usedFor, createdAt.
8. **Guiones** (#scripts) — Guiones de contenido recomendados agrupados por cliente. Colección: "scripts". Campos: id, title, client (nombre exacto del cliente), content (texto completo del guión), recommendedFormat, recommendedHook, createdAt.
9. **Hooks** (#hooks) — Ganchos de retención verbal/visual. Colección: "hooks". Campos: id, title, category, psychology, examples (array de {label, url}), createdAt.
10. **SOPs** (#sops) — Procedimientos estándar de calidad. Colección: "sops". Campos: id, title, iconName, steps (array de {text, done}).
11. **Referencias** (#references) — Biblioteca visual de benchmarks. Colección: "references". Campos: id, title, url, style, category, createdAt.
12. **Workers** (#admin) — Panel de gestión de equipo (solo admin). Colección: "users". Campos: uid, email, nombre, role (admin|collaborator|viewer), approved (boolean), allowedClients (array de IDs de cliente).
13. **AI Assistant** (#ai-assistant) — Este chat. Colección: "chats" (hilos de conversación), "chats_limit" (límite diario), "system_rules" (reglas operativas vivas).

=== REGLAS DE NOMENCLATURA Y VINCULACIÓN ===
- El campo "client" en scripts y assignments DEBE ser el NOMBRE exacto del cliente (ej: "Tizón Dorado"), NO el ID (ej: "tizon-dorado"). El sistema resolverá automáticamente si pasas el ID.
- El campo "employeeName" en assignments es el nombre visible de la persona asignada (ej: "Juan Esteban"). Si no se sabe, usar "@equipo".
- Los IDs de formatos usan el patrón: "rc-01", "pl-01", "fe-01", "ub-01".
- Los IDs de hooks usan el patrón: "hk-01", "hk-02".
- Los IDs de scripts se generan automáticamente.

=== CAPACIDADES DEL AGENTE CREATIVEOS (ACCIONES DIRECTAS) ===
Tú no eres un simple chatbot pasivo; eres un AGENTE activo de la agencia. Tienes el poder de modificar la base de datos de Firestore directamente respondiendo con un bloque estructurado en formato JSON.
Cuando el usuario te pida crear o editar cualquier recurso, debes escribir una respuesta profesional describiendo lo que hiciste, y al final de tu respuesta DEBES incluir el/los bloques agency-action correspondientes. Puedes incluir MÚLTIPLES bloques en una sola respuesta.

\`\`\`agency-action
{
  "type": "create_sop" | "create_format" | "create_assignment" | "create_hook" | "create_client" | "update_client" | "create_script" | "update_script",
  "payload": { ... }
}
\`\`\`

Detalles del Payload según el type:
1. "create_sop":
   - "title": string (Título del procedimiento)
   - "iconName": "check-square" | "video" | "scissors" | "mic" | "sparkles"
   - "steps": array de strings (pasos del checklist)
2. "create_format":
   - "name": string (Nombre completo del formato, ej: "RC-01: Recorrido Comercial Narrado")
   - "structure": string (Estructura paso a paso)
   - "usedFor": string (Propósito del formato)
   - "exampleHooks": array de strings (IDs de hooks relacionados)
   - "clients": array de strings (IDs de clientes que lo usan)
3. "create_assignment":
   - "title": string (Título de la tarea de producción)
   - "client": string (Nombre exacto del cliente)
   - "employeeName": string (Nombre de la persona asignada, o "@equipo")
   - "status": "Pendiente" | "En Producción" | "Revisión" | "Completado"
   - "description": string (Instrucciones breves, NO el guión completo)
   - "dueDate": string (Fecha límite ISO, ej: "2026-05-31")
4. "create_hook":
   - "title": string (Frase literal del gancho)
   - "category": string (ej: "Problema", "Curiosidad", "Deseo", "Descubrimiento")
   - "psychology": string (Por qué funciona psicológicamente)
   - "examples": array de {label, url} (opcional, enlaces a videos de referencia)
5. "create_client":
   - "name": string (Nombre del cliente/marca)
   - "businessType": string (Industria)
   - "description": string (Descripción estratégica)
6. "update_client":
   - "clientId": string (ID slug del cliente, ej: "jerez-el-caballero")
   - "description": string (Nueva descripción estratégica)
   - "assignedFormats": array de strings (se fusionan sin sobrescribir)
   - "usedHooks": array de strings (se fusionan sin sobrescribir)
7. "create_script":
   - "title": string (Título del guión, ej: "RC-01 Tour Apertura")
   - "client": string (ID o nombre del cliente)
   - "content": string (Texto COMPLETO del guión: Hook + Cuerpo + CTA)
   - "sceneDirections": string (OBLIGATORIO - Puesta en escena detallada paso a paso, ej: "• [0-3s] Plano cerrado de los platos, cámara a 45°\n• [3-8s] El dueño habla a cámara diciendo el hook\n• [8-15s] Recorrido POV del local")
   - "recommendedFormat": string (ID del formato, ej: "rc-01")
   - "recommendedHook": string (ID del hook, ej: "hk-03")
8. "update_script":
   - "scriptId": string (ID del guión existente)
   - "title": string (Opcional)
   - "content": string (Opcional - nuevo contenido completo)
   - "sceneDirections": string (Opcional - nuevas indicaciones de puesta en escena)
   - "recommendedFormat": string (Opcional)
   - "recommendedHook": string (Opcional)

=== GUÍA DE CREACIÓN Y ASIGNACIÓN DE GUIONES (OBLIGATORIO) ===
1. CREACIÓN DEL GUIÓN: Usa SIEMPRE "create_script" para guardar el guión con todo su texto. NUNCA pongas el texto completo dentro de una asignación.
2. PUESTA EN ESCENA: SIEMPRE incluye "sceneDirections" con indicaciones visuales detalladas segundo a segundo: qué grabar, cómo enfocar, quién habla, qué plano usar. Esto es FUNDAMENTAL para el equipo de grabación.
3. CREACIÓN DE LA TAREA: Después de "create_script", usa "create_assignment" para la tarea del Kanban. En description, solo instrucciones breves.
4. SEPARACIÓN ESTRICTA: Los guiones son recursos intelectuales (create_script). Las asignaciones son tareas del equipo (create_assignment). Sepáralos siempre.
5. EDICIÓN: Para corregir un guión, usa "update_script" con el scriptId que aparece en tu contexto.

=== LISTA DE GUIONES ACTUALES EN EL SISTEMA ===
${scripts.length > 0 ? scripts.map(s => `- Guión: "${s.title}" (ID: "${s.id}" | Cliente: "${s.client}")`).join('\n') : 'No hay guiones registrados aún.'}

`;

                // Append living Firestore guidelines dynamically (Direct dynamic reference memory)
                if (systemRules && systemRules.length > 0) {
                    contextPrompt += `=== REGLAS OPERATIVAS VIVAS DE LA AGENCIA (Firestore system_rules) ===\n`;
                    systemRules.forEach(rule => {
                        contextPrompt += `--- ${rule.title} ---\n${rule.content}\n\n`;
                    });
                }

                if (activeClientFocus) {
                    contextPrompt += `=== MARCA EN FOCO ACTIVO ===
Nombre de la Marca/Cliente: ${activeClientFocus.nombre || activeClientFocus.name}
ID de la Marca: ${activeClientFocus.id}
Giro del Negocio / Tipo: ${activeClientFocus.businessType || 'Marketing Creativo'}
Descripción Estratégica General: ${activeClientFocus.description || 'Sin descripción estratégica registrada'}
Formatos Asignados a esta Marca: ${(activeClientFocus.assignedFormats || []).join(', ')}
Hooks Utilizados por esta Marca: ${(activeClientFocus.usedHooks || []).join(', ')}

`;
                } else {
                    contextPrompt += `=== RESUMEN GLOBAL DE LA AGENCIA ===
Lista de Clientes Registrados:
${clients.map(c => `- Cliente: "${c.nombre || c.name}" | ID: "${c.id}" | Industria: "${c.businessType || 'General'}" | Descripción: "${c.description || 'Sin descripción'}" | Formatos: [${(c.assignedFormats || []).join(', ')}]`).join('\n')}
`;
                }

                contextPrompt += `=== FORMATOS AUTORIZADOS ===
${formats.map(f => `- Formato: ${f.name} (ID: "${f.id}" | Estructura: ${f.structure || 'Hook + Storytelling + CTA'} | Objetivo: ${f.usedFor || 'General'})`).join('\n')}

=== HOOKS DISPONIBLES ===
${hooks.map(h => `- Hook: "${h.title}" (ID: "${h.id}" | Categoría: ${h.category || 'General'} | Psicología: ${h.psychology || 'N/A'})`).join('\n')}

=== LISTA DE TAREAS EN CURSO ===
${assignments.filter(a => a.status !== 'Completado').map(a => `- Cliente: ${a.client} | Tarea: ${a.title} | Responsable: ${a.employeeName || '@equipo'} | Estado: ${a.status}`).join('\n')}

=== PROCEDIMIENTOS ESTÁNDAR (SOPs) ACTIVOS ===
${sopsList.map(s => `- SOP: "${s.title}" (${(s.steps || []).length} pasos)`).join('\n')}
`;

                try {
                    const response = await fetch("/api/chat", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            messages: activeConversation,
                            contextPrompt
                        })
                    });

                    if (!response.ok) {
                        const err = await response.json();
                        throw new Error(err.error || 'Fallo de API al consultar al Agente proxy.');
                    }

                    const data = await response.json();
                    const text = data.text || "";

                    // Action parser detector (support multiple actions in one response)
                    const actionRegex = /```agency-action([\s\S]*?)```/gi;
                    const matches = [...text.matchAll(actionRegex)];
                    if (matches.length > 0) {
                        for (const match of matches) {
                            try {
                                const actionObj = JSON.parse(match[1].trim());
                                await executeAgentAction(actionObj);
                            } catch (e) {
                                console.error("[Agent] Action parse/execution failure:", e);
                            }
                        }
                        await refreshSidebarCounters();
                    }

                    activeConversation.push({ role: 'assistant', content: text });

                    // Persist thread updates in Firestore
                    if (currentThreadId) {
                        await dbService.set('chats', currentThreadId, {
                            messages: activeConversation,
                            userId: user?.uid,
                            updatedAt: new Date().toISOString()
                        });
                        
                        // Update lists local state reference and sort again
                        const localIndex = chatThreadsList.findIndex(t => t.id === currentThreadId);
                        if (localIndex !== -1) {
                            chatThreadsList[localIndex].messages = activeConversation;
                            chatThreadsList[localIndex].updatedAt = new Date().toISOString();
                            chatThreadsList = chatThreadsList.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
                            renderThreadsList();
                        }
                    }

                    // Increment global rate limit count in Firestore chats_limit collection
                    const todayStr = new Date().toISOString().split('T')[0];
                    let currentCount = 1;
                    try {
                        const limitDoc = await dbService.getById('chats_limit', user?.uid);
                        if (limitDoc && limitDoc.lastMessageDate === todayStr) {
                            currentCount = (limitDoc.dailyCount || 0) + 1;
                        }
                    } catch(e) {}

                    try {
                        await dbService.set('chats_limit', user?.uid, {
                            dailyCount: currentCount,
                            lastMessageDate: todayStr,
                            updatedAt: new Date().toISOString()
                        });
                    } catch (e) {
                        console.warn("Could not save global rate limit count:", e);
                    }

                    // Dynamically update the remaining messages badge in the DOM immediately!
                    const badge = container.querySelector('#ai-remaining-badge');
                    if (badge) {
                        const isAdmin = user?.role === 'admin';
                        const maxAllowed = isAdmin ? 10 : 5;
                        const newRemaining = Math.max(0, maxAllowed - currentCount);
                        badge.style.background = newRemaining > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';
                        badge.style.color = newRemaining > 0 ? '#10b981' : '#ef4444';
                        badge.style.border = newRemaining > 0 ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)';
                        badge.innerHTML = `<i data-lucide="message-square" style="width: 10px; height: 10px;"></i><span>Quedan ${newRemaining} mensajes hoy</span>`;
                        if (window.lucide) window.lucide.createIcons();
                    }

                } catch (err) {
                    console.error("Assistant prompt relay error:", err);
                    activeConversation.push({ 
                        role: 'assistant', 
                        content: `⚠️ **Error de Conectividad:** ${err.message || 'No se pudo recibir respuesta del proxy Vercel API.'}\n\n*Por favor, verifica que tu Vercel Serverless Function esté en producción.*` 
                    });
                } finally {
                    isAssistantLoading = false;
                    toggleFormState(false);
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

            // Assemble main ChatGPT three-column grid layout (No static typing indicator below feed!)
            const chatMainView = h('div', { 
                className: 'flex gap-4 w-full flex-wrap', 
                style: { display: 'flex', flexDirection: 'row', alignItems: 'stretch' } 
            }, [
                chatHistorySidebar, // ChatGPT-style left sidebar
                h('div', { className: 'flex-column', style: { flex: '3', minWidth: '320px' } }, [
                    brandSummaryContainer, // Dynamic Focus Profile summary card!
                    chatFeed,
                    inputArea
                ]),
                sidePanel // Quick shortcuts right sidebar
            ]);

            container.appendChild(header);
            container.appendChild(chatMainView);

            // Initial render of feed and threads list
            renderChatFeed();
            renderThreadsList();
            renderBrandFocusSummary();

            if (window.lucide) window.lucide.createIcons();

        } catch (err) {
            container.innerHTML = `<div class="error-state text-sm p-10">${err.message}</div>`;
        }
    };

    // Helper: Regex-based high-performance markdown and visual action card parser
    const formatMarkdown = (text) => {
        if (!text) return '';
        let html = text;
        
        // Escape HTML tags to prevent custom execution
        html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        
        // Ensure unclosed agency-action blocks at the end are closed to prevent rendering issues
        if (html.includes('```agency-action') && html.lastIndexOf('```') === html.lastIndexOf('```agency-action')) {
            html += '\n```';
        }

        // Parse agency action code blocks as a beautiful, premium visual card instead of a raw JSON code block!
        html = html.replace(/```agency-action([\s\S]*?)```/g, (match, jsonText) => {
            try {
                const action = JSON.parse(jsonText.trim());
                let title = "";
                let details = "";
                let colorClass = "var(--accent)";
                let iconName = "sparkles";

                if (action.type === 'create_sop') {
                    title = "Acción: Crear SOP/Procedimiento";
                    details = `**Título**: ${action.payload.title}<br>**Pasos**: ${(action.payload.steps || []).join(', ')}`;
                    iconName = "check-square";
                    colorClass = "#10b981"; // Success Green
                } else if (action.type === 'create_format') {
                    title = "Acción: Registrar Nuevo Formato Creativo";
                    details = `**Nombre**: ${action.payload.name}<br>**Estructura**: ${action.payload.structure}<br>**Uso**: ${action.payload.usedFor || 'General'}`;
                    iconName = "file-text";
                    colorClass = "#ec4899"; // Pink
                } else if (action.type === 'create_assignment') {
                    title = "Acción: Asignar Tarea";
                    details = `**Tarea**: ${action.payload.title}<br>**Cliente**: ${action.payload.client}<br>**Responsable**: ${action.payload.employeeName || '@equipo'}`;
                    iconName = "clipboard-list";
                    colorClass = "#3b82f6"; // Info Blue
                } else if (action.type === 'update_metric') {
                    title = "Acción: Actualizar Métrica de Rendimiento";
                    details = `**Cliente ID**: ${action.payload.clientId}<br>**Formato ID**: ${action.payload.formatId}<br>**Hook ID**: ${action.payload.hookId || 'N/A'}<br>**Período**: ${action.payload.period}<br>**Retención**: ${action.payload.retention || '0%'}<br>**Vistas**: ${action.payload.views || '0'}<br>**Saves**: ${action.payload.saves || '0'}`;
                    iconName = "bar-chart-2";
                    colorClass = "#f59e0b"; // Warning Orange
                } else if (action.type === 'create_hook') {
                    title = "Acción: Guardar Hook";
                    details = `**Hook**: "${action.payload.title}"<br>**Psicología**: ${action.payload.psychology}<br>**Retención Promedio**: ${action.payload.avgRetention || '0%'}`;
                    iconName = "zap";
                    colorClass = "#a855f7"; // Accent Purple
                } else if (action.type === 'update_client') {
                    title = "Acción: Actualizar Estrategia de Cliente";
                    details = `**Cliente ID**: ${action.payload.clientId}<br>**Descripción**: ${action.payload.description || 'Sin cambios'}<br>**Formatos**: ${(action.payload.assignedFormats || []).join(', ')}`;
                    iconName = "users";
                    colorClass = "#3b82f6"; // Info Blue
                } else if (action.type === 'create_client') {
                    title = "Acción: Registrar Nuevo Cliente";
                    details = `**Nombre**: ${action.payload.name}<br>**Industria**: ${action.payload.businessType}<br>**Descripción**: ${action.payload.description}`;
                    iconName = "users";
                    colorClass = "#10b981"; // Success Green
                } else if (action.type === 'create_script') {
                    title = "Acción: Crear Guión";
                    details = `**Título**: ${action.payload.title}<br>**Cliente**: ${action.payload.client}`;
                    iconName = "file-text";
                    colorClass = "#10b981"; // Success Green
                } else if (action.type === 'update_script') {
                    title = "Acción: Actualizar Guión";
                    details = `**Guión ID**: ${action.payload.scriptId}`;
                    iconName = "edit-3";
                    colorClass = "#3b82f6"; // Info Blue
                }

                return `
                <div class="card p-3 my-2 border-radius-sm border flex-column gap-1 bg-secondary" style="border-left: 4px solid ${colorClass}; max-width: 100%; border-radius: 4px;">
                    <div class="flex items-center gap-2 font-bold text-xs" style="color: ${colorClass};">
                        ${icon(iconName, 12).outerHTML}
                        <span>${title}</span>
                        <span class="text-success text-xs font-semibold ml-auto flex items-center gap-1" style="color: #10b981;">
                            ✓ Ejecutado en Firestore
                        </span>
                    </div>
                    <p class="text-xs text-secondary mt-1 leading-normal" style="color: var(--text-secondary);">${details}</p>
                </div>
                `;
            } catch (e) {
                return `<pre class="bg-tertiary p-3 rounded text-xs font-mono border" style="border: 1px solid var(--border); max-width: 100%; white-space: pre-wrap; word-break: break-all;">${jsonText.trim()}</pre>`;
            }
        });

        // Code blocks
        html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
            return `<pre class="bg-tertiary p-3 rounded text-xs overflow-x-auto mt-2 mb-2 font-mono leading-normal border" style="border: 1px solid var(--border); max-width: 100%; white-space: pre-wrap; word-break: break-all;">${code.trim()}</pre>`;
        });
        
        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code class="bg-tertiary px-1 rounded font-mono text-xs text-accent">$1</code>');
        
        // Bold
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        
        // Headers (###, ##, #)
        html = html.replace(/### (.*$)/gim, '<h4 class="font-bold text-xs text-primary mt-3 mb-1">$1</h4>');
        html = html.replace(/## (.*$)/gim, '<h3 class="font-bold text-sm text-primary mt-4 mb-2 border-bottom pb-1">$1</h3>');
        html = html.replace(/# (.*$)/gim, '<h2 class="font-bold text-md text-primary mt-4 mb-2">$1</h2>');
        
        // Lists — convert to <li> first, then wrap groups in <ul>/<ol>
        html = html.replace(/^\s*-\s+(.*$)/gim, '<li class="text-xs text-secondary ml-4 my-1" data-list="ul">$1</li>');
        html = html.replace(/^\s*\*\s+(.*$)/gim, '<li class="text-xs text-secondary ml-4 my-1" data-list="ul">$1</li>');
        html = html.replace(/^\s*\d+\.\s+(.*$)/gim, '<li class="text-xs text-secondary ml-4 my-1" data-list="ol">$1</li>');
        
        // Wrap consecutive <li> elements in proper <ul> or <ol> containers
        html = html.replace(/((?:<li[^>]*data-list="ul">[^]*?<\/li>\s*)+)/gi, '<ul class="list-disc pl-4 my-2">$1</ul>');
        html = html.replace(/((?:<li[^>]*data-list="ol">[^]*?<\/li>\s*)+)/gi, '<ol class="list-decimal pl-4 my-2">$1</ol>');
        html = html.replace(/ data-list="(?:ul|ol)"/g, '');

        // Line breaks (graceful paragraph breaks)
        html = html.split('\n').map(line => {
            if (line.trim().startsWith('<h') || line.trim().startsWith('<pre') || line.trim().startsWith('<li') || line.trim().startsWith('<ul') || line.trim().startsWith('<ol') || line.trim().startsWith('</ul') || line.trim().startsWith('</ol') || line.trim().startsWith('<div') || line.trim().startsWith('</div') || line.trim().startsWith('</pre>')) {
                return line;
            }
            return line + '<br>';
        }).join('\n');

        return html;
    };

    loadAssistant();
    return container;
};
