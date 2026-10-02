import { firebaseAdmin } from '../config/firebase.js';
import { getVehicleById, queueNotification, store } from '../data/store.js';
import { buildReminderMessage } from './reminders.js';

let cronTimer = null;

/**
 * Revisa todos los servicios activos y envía recordatorios para aquellos
 * que tengan entre 1 y 5 días restantes antes de su vencimiento, evitando
 * duplicados en el mismo día.
 */
export async function checkAndDispatchReminders() {
  const now = new Date();
  const todayPrefix = now.toISOString().slice(0, 10);
  const activeServices = store.services.filter((service) => service.status === 'ACTIVE');

  let checkedCount = 0;
  let dispatchedCount = 0;
  let skippedCount = 0;
  const dispatchedDetails = [];

  for (const service of activeServices) {
    checkedCount += 1;
    const endDate = new Date(service.date_end);
    const diffDays = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // Regla de negocio: recordatorio diario cuando faltan 5 días o menos
    if (diffDays > 0 && diffDays <= 5) {
      const vehicle = getVehicleById(service.vehicle_id);
      const plate = vehicle ? vehicle.plate : service.vehicle_id;

      // Evitar envíos duplicados en la misma jornada para el mismo vehículo
      const alreadySentToday = store.notifications.some(
        (notification) =>
          notification.user_id === service.user_id &&
          notification.type === 'REMINDER' &&
          notification.message.includes(plate) &&
          String(notification.created_at || '').startsWith(todayPrefix),
      );

      if (alreadySentToday) {
        skippedCount += 1;
        continue;
      }

      const message = buildReminderMessage({ daysRemaining: diffDays }, vehicle);

      await queueNotification({
        userId: service.user_id,
        type: 'REMINDER',
        message,
      });

      const tokens = store.deviceTokens
        .filter((entry) => entry.user_id === service.user_id)
        .map((entry) => entry.token);

      let pushStatus = 'skipped_no_tokens';
      if (firebaseAdmin && tokens.length > 0) {
        try {
          const fcmResponse = await firebaseAdmin.messaging().sendEachForMulticast({
            tokens,
            notification: {
              title: `Recordatorio: ${plate}`,
              body: message,
            },
          });
          pushStatus = `sent_${fcmResponse.successCount}_of_${tokens.length}`;
        } catch (fcmError) {
          pushStatus = `error: ${fcmError.message}`;
          console.error(`FCM reminder dispatch error for ${plate}:`, fcmError);
        }
      }

      dispatchedCount += 1;
      dispatchedDetails.push({
        vehicleId: service.vehicle_id,
        plate,
        daysRemaining: diffDays,
        pushStatus,
      });
    }
  }

  return {
    timestamp: now.toISOString(),
    checkedCount,
    dispatchedCount,
    skippedCount,
    details: dispatchedDetails,
  };
}

/**
 * Inicia el cron en memoria para revisión automática recurrente.
 */
export function startReminderCron(intervalMs = 60 * 60 * 1000) {
  if (cronTimer) {
    clearInterval(cronTimer);
  }

  console.log(`[ReminderWorker] Programado para ejecutarse cada ${Math.round(intervalMs / 1000 / 60)} minutos.`);

  // Ejecución inicial después de un breve tiempo de calentamiento (5 segundos)
  setTimeout(() => {
    checkAndDispatchReminders().then((result) => {
      if (result.dispatchedCount > 0) {
        console.log(`[ReminderWorker] Ejecución inicial: ${result.dispatchedCount} recordatorios emitidos.`);
      }
    }).catch((err) => {
      console.error('[ReminderWorker] Error en ejecución inicial:', err);
    });
  }, 5000);

  // Intervalo regular
  cronTimer = setInterval(() => {
    checkAndDispatchReminders().then((result) => {
      if (result.dispatchedCount > 0) {
        console.log(`[ReminderWorker] ${result.dispatchedCount} recordatorios emitidos.`);
      }
    }).catch((err) => {
      console.error('[ReminderWorker] Error en ciclo:', err);
    });
  }, intervalMs);

  return cronTimer;
}

export function stopReminderCron() {
  if (cronTimer) {
    clearInterval(cronTimer);
    cronTimer = null;
  }
}
