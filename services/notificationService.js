/**
 * Notification Service - Creative Production OS
 * Handles push notifications (FCM) and local notifications for the Capacitor Android app.
 *
 * Capabilities:
 * - Request notification permissions
 * - Register FCM token and save it to Supabase (users.fcmToken)
 * - Listen for incoming push notifications
 * - Schedule local notifications (deadlines, reminders)
 * - Show in-app notification badges
 */
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { dbService } from '../supabase/service.js';
import { store } from '../js/store.js';

const isNative = () => {
  return typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform();
};

export const notificationService = {
  /**
   * Initialize the notification system.
   * Call this once after the user is authenticated.
   */
  async init() {
    if (!isNative()) {
      console.log('[Notifications] Running in web mode - skipping native init');
      return;
    }

    try {
      await this.requestPermissions();
      await this.registerPush();
      await this.setupLocalChannels();
      this.listenForPushEvents();
      console.log('[Notifications] Initialized successfully');
    } catch (err) {
      console.warn('[Notifications] Init error:', err);
    }
  },

  /**
   * Request notification permissions from the user.
   */
  async requestPermissions() {
    if (!isNative()) return false;

    try {
      const pushPerm = await PushNotifications.requestPermissions();
      const localPerm = await LocalNotifications.requestPermissions();

      console.log('[Notifications] Permissions:', { push: pushPerm.receive, local: localPerm.display });
      return pushPerm.receive === 'granted';
    } catch (err) {
      console.warn('[Notifications] Permission request error:', err);
      return false;
    }
  },

  /**
   * Register for push notifications and capture the FCM token.
   */
  async registerPush() {
    if (!isNative()) return;

    try {
      await PushNotifications.register();
    } catch (err) {
      console.warn('[Notifications] Register error:', err);
    }
  },

  /**
   * Setup local notification channels (Android 8+).
   */
  async setupLocalChannels() {
    if (!isNative()) return;

    try {
      await LocalNotifications.createChannel({
        id: 'creativeos-default',
        name: 'CreativeOS Notificaciones',
        description: 'Notificaciones generales del sistema',
        importance: 4, // HIGH
        visibility: 1, // PUBLIC
        sound: 'default',
        vibration: true,
        lights: true,
      });

      await LocalNotifications.createChannel({
        id: 'creativeos-deadlines',
        name: 'Fechas Límite',
        description: 'Recordatorios de fechas límite de asignaciones',
        importance: 5, // MAX
        visibility: 1,
        sound: 'default',
        vibration: true,
        lights: true,
      });

      await LocalNotifications.createChannel({
        id: 'creativeos-billing',
        name: 'Pagos y Facturas',
        description: 'Notificaciones de pagos pendientes y facturas',
        importance: 4,
        visibility: 1,
        sound: 'default',
      });

      console.log('[Notifications] Channels created');
    } catch (err) {
      console.warn('[Notifications] Channel setup error:', err);
    }
  },

  /**
   * Listen for push events (registration, received, action).
   */
  listenForPushEvents() {
    if (!isNative()) return;

    // On registration success -> save FCM token to Supabase
    PushNotifications.addListener('registration', async (token) => {
      console.log('[Notifications] FCM Token:', token.value);
      const { user } = store.getState();
      if (user) {
        try {
          await dbService.update('users', user.uid || user.id, {
            fcmToken: token.value,
            fcmTokenUpdatedAt: new Date().toISOString(),
            platform: 'android',
          });
          console.log('[Notifications] Token saved to user profile');
        } catch (err) {
          console.warn('[Notifications] Failed to save FCM token:', err);
        }
      }
    });

    // On registration error
    PushNotifications.addListener('registrationError', (error) => {
      console.warn('[Notifications] Registration error:', error);
    });

    // When a push notification is received (foreground)
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[Notifications] Push received:', notification);
      this.showLocal({
        title: notification.title || 'CreativeOS',
        body: notification.body || '',
        data: notification.data,
        channelId: 'creativeos-default',
      });
    });

    // When user taps a push notification
    PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      console.log('[Notifications] Push action:', notification);
      this.handleNotificationTap(notification.notification?.data);
    });
  },

  /**
   * Handle notification tap - navigate to relevant page.
   */
  handleNotificationTap(data) {
    if (!data || !data.type) return;

    const { type, targetId } = data;
    let hash = '#dashboard';

    switch (type) {
      case 'assignment':
        hash = '#assignments';
        break;
      case 'assignment_deadline':
        hash = '#assignments';
        break;
      case 'billing':
        hash = '#billing';
        break;
      case 'client':
        hash = targetId ? `#client/${targetId}` : '#clients';
        break;
      case 'approval':
        hash = '#admin';
        break;
      case 'message':
        hash = '#aiAssistant';
        break;
    }

    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
  },

  /**
   * Show a local notification immediately.
   */
  async showLocal({ title, body, id, data, channelId = 'creativeos-default' }) {
    if (!isNative()) {
      // Web fallback: use browser Notification API
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/logo-icon.svg' });
      }
      return;
    }

    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: id || Math.floor(Math.random() * 100000),
            title,
            body,
            data: data || {},
            channelId,
            smallIcon: 'ic_stat_notification',
            iconColor: '#3b82f6',
            autoCancel: true,
          },
        ],
      });
    } catch (err) {
      console.warn('[Notifications] Show local error:', err);
    }
  },

  /**
   * Schedule a deadline reminder for an assignment.
   */
  async scheduleDeadlineReminder(assignment) {
    if (!assignment.dueDate) return;

    const dueDate = new Date(assignment.dueDate);
    const now = new Date();

    // Schedule 1 day before deadline
    const oneDayBefore = new Date(dueDate.getTime() - 24 * 60 * 60 * 1000);
    // Schedule 1 hour before deadline
    const oneHourBefore = new Date(dueDate.getTime() - 60 * 60 * 1000);

    const reminders = [];

    if (oneDayBefore > now) {
      reminders.push({
        id: this.generateNotifId(assignment.id, '1d'),
        title: '⏰ Fecha límite mañana',
        body: `${assignment.title || 'Asignación'} vence mañana`,
        schedule: { at: oneDayBefore },
        channelId: 'creativeos-deadlines',
        data: { type: 'assignment_deadline', targetId: assignment.id },
      });
    }

    if (oneHourBefore > now) {
      reminders.push({
        id: this.generateNotifId(assignment.id, '1h'),
        title: '🚨 Fecha límite en 1 hora',
        body: `${assignment.title || 'Asignación'} vence pronto`,
        schedule: { at: oneHourBefore },
        channelId: 'creativeos-deadlines',
        data: { type: 'assignment_deadline', targetId: assignment.id },
      });
    }

    if (reminders.length === 0) return;

    try {
      await LocalNotifications.schedule({ notifications: reminders });
      console.log(`[Notifications] Scheduled ${reminders.length} reminders for ${assignment.id}`);
    } catch (err) {
      console.warn('[Notifications] Schedule error:', err);
    }
  },

  /**
   * Cancel a previously scheduled reminder.
   */
  async cancelDeadlineReminders(assignmentId) {
    if (!isNative()) return;

    try {
      await LocalNotifications.cancel({
        notifications: [
          { id: this.generateNotifId(assignmentId, '1d') },
          { id: this.generateNotifId(assignmentId, '1h') },
        ],
      });
    } catch (err) {
      console.warn('[Notifications] Cancel error:', err);
    }
  },

  /**
   * Show a notification when a new chat message arrives.
   */
  async notifyNewChatMessage(senderName, preview) {
    await this.showLocal({
      title: `💬 ${senderName}`,
      body: preview,
      channelId: 'creativeos-default',
      data: { type: 'message' },
    });
  },

  /**
   * Show a notification for a new billing event.
   */
  async notifyBillingEvent(type, amount, clientName) {
    const titles = {
      new_invoice: '💰 Nueva factura registrada',
      invoice_approved: '✅ Factura aprobada',
      invoice_paid: '💸 Pago recibido',
    };

    await this.showLocal({
      title: titles[type] || '📋 Actualización de facturación',
      body: `$${amount.toLocaleString('es-CO')} - ${clientName}`,
      channelId: 'creativeos-billing',
      data: { type: 'billing' },
    });
  },

  /**
   * Show a notification when a user is approved by admin.
   */
  async notifyUserApproved(userName) {
    await this.showLocal({
      title: '🎉 Cuenta aprobada',
      body: `${userName} ya puede acceder a CreativeOS`,
      channelId: 'creativeos-default',
      data: { type: 'approval' },
    });
  },

  /**
   * Generate a deterministic notification ID from assignment ID + suffix.
   */
  generateNotifId(assignmentId, suffix) {
    const hash = (assignmentId + suffix).split('').reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0);
      return a & a;
    }, 0);
    return Math.abs(hash) % 100000;
  },

  /**
   * Get pending notifications (for badge counter).
   */
  async getPendingCount() {
    if (!isNative()) return 0;

    try {
      const pending = await LocalNotifications.getPending();
      return pending.notifications.length;
    } catch {
      return 0;
    }
  },

  /**
   * Clear all delivered notifications.
   */
  async clearAll() {
    if (!isNative()) return;
    try {
      await LocalNotifications.clear({ notifications: [] });
    } catch (err) {
      console.warn('[Notifications] Clear error:', err);
    }
  },
};

export default notificationService;
