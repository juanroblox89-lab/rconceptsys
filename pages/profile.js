/**
 * Profile Page - Creative Production OS
 * Enhanced profile with metrics: completed tasks, total billed, payment history.
 */
import { h, icon } from '../utils/dom.js';
import { store } from '../js/store.js';
import { dbService, storageService } from '../firebase/service.js';
import { invoiceService } from '../services/invoiceService.js';
import { assignmentService } from '../services/assignmentService.js';
import { router } from '../js/router.js';

export const render = () => {
    const { user, roles } = store.getState();
    const container = h('div', { className: 'fade-in flex-column gap-4' });

    const loadAndRenderProfile = async () => {
        container.innerHTML = '<div class="loader mb-4"></div>';
        
        let currentUserData = null;
        try {
            currentUserData = await dbService.getById('users', user.id || user.uid);
        } catch (err) {
            console.error(err);
            currentUserData = user;
        }

        // Load assignments and invoice in parallel
        let completedAssignments = [];
        let invoice = null;
        try {
            const [allAsgs, inv] = await Promise.all([
                assignmentService.getAllAssignments(),
                invoiceService.getEmployeeInvoice(user.uid || user.id)
            ]);
            completedAssignments = allAsgs.filter(a => a.employeeId === (user.uid || user.id) && a.status === 'Completado');
            invoice = inv;
        } catch(e) { console.warn('Could not load stats:', e); }

        const totalBilled = invoice?.items?.reduce((s, i) => s + (Number(i.amount) || 0), 0) || 0;
        const recentItems = (invoice?.items || []).slice(-5).reverse();

        container.innerHTML = '';

        // 1. Header
        const userRoleObj = roles?.find(r => r.id === currentUserData?.role) || { id: currentUserData?.role, label: currentUserData?.role || 'Miembro' };
        const avatarEl = currentUserData?.photoURL
            ? h('img', { src: currentUserData.photoURL, style: { width: '64px', height: '64px', objectFit: 'cover', borderRadius: '50%', border: '3px solid var(--accent)' } })
            : h('div', { style: { width: '64px', height: '64px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '1.4rem', color: '#fff', flexShrink: '0', border: '3px solid var(--accent)' } }, (currentUserData?.nombre || currentUserData?.email || 'US').slice(0, 2).toUpperCase());

        const header = h('div', { className: 'content-header flex items-center gap-4 w-full mb-1' }, [
            avatarEl,
            h('div', { className: 'flex-column' }, [
                h('h1', { className: 'text-xl font-bold' }, currentUserData?.nombre || 'Mi Perfil'),
                h('span', { className: 'badge badge-info text-xs mt-1' }, userRoleObj?.label || 'Miembro'),
                h('span', { className: 'text-xs text-muted mt-1' }, currentUserData?.email || '')
            ])
        ]);
        container.appendChild(header);

        // 2. Stats cards
        const statsGrid = h('div', { className: 'grid gap-3', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' } }, [
            h('div', { className: 'card p-4 flex-column items-center gap-1 text-center' }, [
                icon('briefcase', 24, 'text-accent'),
                h('span', { className: 'text-2xl font-bold text-primary mt-1' }, String(completedAssignments.length)),
                h('span', { className: 'text-xs text-muted' }, 'Trabajos Completados')
            ]),
            h('div', { className: 'card p-4 flex-column items-center gap-1 text-center' }, [
                icon('dollar-sign', 24, 'text-success'),
                h('span', { className: 'text-2xl font-bold text-success mt-1' }, `$${totalBilled.toLocaleString('es-CO')}`),
                h('span', { className: 'text-xs text-muted' }, 'Total Facturado COP')
            ]),
            h('div', { className: 'card p-4 flex-column items-center gap-1 text-center' }, [
                icon('clock', 24, 'text-warning'),
                h('span', { className: 'text-2xl font-bold text-warning mt-1' }, String(invoice?.items?.length || 0)),
                h('span', { className: 'text-xs text-muted' }, 'Items de Pago Totales')
            ])
        ]);
        container.appendChild(statsGrid);

        // 3. Main grid: form + history
        const grid = h('div', { className: 'grid gap-4', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' } });

        // Form card
        const formCard = h('div', { className: 'card p-4 flex-column gap-3' }, [
            h('h3', { className: 'text-sm font-bold flex items-center gap-2 mb-2 border-bottom pb-2' }, [icon('user', 14), h('span', {}, 'Información Personal')]),
            h('form', {
                className: 'flex-column gap-3',
                onSubmit: async (e) => {
                    e.preventDefault();
                    const submitBtn = e.target.querySelector('button[type="submit"]');
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Guardando...';

                    const nombre = e.target.querySelector('#prof-name').value;
                    const phone = e.target.querySelector('#prof-phone').value;
                    const photoFile = e.target.querySelector('#prof-photo').files[0];
                    let photoURL = currentUserData?.photoURL || '';

                    if (photoFile) {
                        try {
                            photoURL = await storageService.uploadFile(`profiles/${currentUserData?.id || currentUserData?.uid}`, photoFile);
                        } catch (err) {
                            console.error(err);
                            alert('Error subiendo foto de perfil');
                        }
                    }

                    try {
                        await dbService.update('users', currentUserData?.id || currentUserData?.uid, { nombre, phone, photoURL });
                        // Update store
                        store.setState({ user: { ...store.getState().user, nombre, phone, photoURL } });
                        alert('¡Perfil actualizado con éxito!');
                        loadAndRenderProfile();
                    } catch (err) {
                        console.error(err);
                        alert('Error al actualizar el perfil.');
                        submitBtn.disabled = false;
                        submitBtn.textContent = 'Guardar Cambios';
                    }
                }
            }, [
                h('div', { className: 'flex items-center gap-3 mb-2' }, [
                    currentUserData?.photoURL 
                        ? h('img', { src: currentUserData.photoURL, className: 'rounded-full', style: { width: '56px', height: '56px', objectFit: 'cover', borderRadius: '50%', border: '2px solid var(--border)' } })
                        : h('div', { style: { width: '56px', height: '56px', borderRadius: '50%', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '1.1rem', border: '2px solid var(--border)' } }, (currentUserData?.nombre || currentUserData?.email || 'US').slice(0, 2).toUpperCase()),
                    h('div', { className: 'form-group flex-1' }, [
                        h('label', { className: 'form-label' }, 'Cambiar Foto (Opcional)'),
                        h('input', { id: 'prof-photo', type: 'file', className: 'form-input', accept: 'image/*' })
                    ])
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Nombre de Visualización'),
                    h('input', { id: 'prof-name', type: 'text', className: 'form-input', value: currentUserData?.nombre || '', required: true })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Número de Teléfono / WhatsApp'),
                    h('input', { id: 'prof-phone', type: 'tel', className: 'form-input', value: currentUserData?.phone || '', placeholder: 'Ej. +57 300 000 0000' })
                ]),
                h('div', { className: 'form-group' }, [
                    h('label', { className: 'form-label' }, 'Correo Electrónico (No modificable)'),
                    h('input', { type: 'email', className: 'form-input bg-tertiary text-muted', value: currentUserData?.email, disabled: true })
                ]),
                h('button', { type: 'submit', className: 'btn btn-primary text-xs w-full mt-2' }, 'Guardar Cambios')
            ])
        ]);

        // Payment history card
        const historyCard = h('div', { className: 'card p-4 flex-column gap-3' }, [
            h('h3', { className: 'text-sm font-bold flex items-center gap-2 mb-2 border-bottom pb-2' }, [
                icon('receipt', 14),
                h('span', {}, 'Historial de Pagos Recientes')
            ]),
            recentItems.length === 0
                ? h('p', { className: 'text-xs text-muted italic text-center p-4' }, 'No hay registros de pagos aún. Completa tareas para generar cobros automáticos.')
                : h('div', { className: 'flex-column gap-2' }, recentItems.map(item => 
                    h('div', { className: 'flex justify-between items-center p-3 rounded', style: { background: 'var(--bg-tertiary)', border: '1px solid var(--border)' } }, [
                        h('div', { className: 'flex-column gap-0.5' }, [
                            h('span', { className: 'text-xs font-bold text-primary' }, item.title || item.type || 'Pago'),
                            h('span', { className: 'text-xs text-muted' }, item.client ? `Cliente: ${item.client}` : (item.observations || '')),
                            h('span', { className: 'text-xs text-muted', style: { fontSize: '0.65rem' } }, item.date ? new Date(item.date).toLocaleDateString('es-CO') : (item.createdAt ? new Date(item.createdAt).toLocaleDateString('es-CO') : ''))
                        ]),
                        h('span', { className: 'font-bold text-success text-sm', style: { whiteSpace: 'nowrap' } }, `$${(Number(item.amount) || 0).toLocaleString('es-CO')}`)
                    ])
                )),
            h('a', { 
                href: '#billing', 
                className: 'btn btn-outline text-xs w-full justify-center flex items-center gap-1 mt-2' 
            }, [icon('external-link', 13), h('span', {}, 'Ver Factura Completa')])
        ]);

        grid.appendChild(formCard);
        grid.appendChild(historyCard);
        container.appendChild(grid);

        if (window.lucide) window.lucide.createIcons();
    };

    loadAndRenderProfile();
    return container;
};
