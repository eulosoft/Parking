import { firebaseAdmin } from '../config/firebase.js';
import { getVehicleById, listActiveServices, listDeviceTokensForUser, queueNotification } from '../data/store.js';
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
  const activeServices = await listActiveServices();

  let checkedCount = 0;
  let dispatchedCount = 0;
  let skippedCount = 0;

  for (const service of activeServices) {
    checkedCount += 1;
    const endDate = new Date(service.date_end);
    const diffDays = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // Regla de negocio: recordatorio diario cuando faltan 5 días o menos
    if (diffDays > 0 && diffDays <= 5) {
      const vehicle = await getVehicleById(service.vehicle_id);
      const plate = vehicle ? vehicle.plate : service.vehicle_id;

      // Evitar envíos duplicados en la misma jornada para el mismo vehículo
      const message = buildReminderMessage({ daysRemaining: diffDays }, vehicle);

      const queued = await queueNotification({
        userId: service.user_id,
        type: 'REMINDER',
        message,
        idempotencyKey: `${service.id}_${todayPrefix}`,
      });
      if (queued.created === false) {
        skippedCount += 1;
        continue;
      }

      const tokens = await listDeviceTokensForUser(service.user_id);

      if (firebaseAdmin && tokens.length > 0) {
        try {
          await firebaseAdmin.messaging().sendEachForMulticast({
            tokens,
            notification: {
              title: `Recordatorio: ${plate}`,
              body: message,
            },
          });
        } catch {
          console.error('FCM reminder dispatch failed.');
        }
      }

      dispatchedCount += 1;
    }
  }

  return {
    timestamp: now.toISOString(),
    checkedCount,
    dispatchedCount,
    skippedCount,
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
      console.error('[ReminderWorker] Initial execution failed:', err?.name || 'Error');
    });
  }, 5000);

  // Intervalo regular
  cronTimer = setInterval(() => {
    checkAndDispatchReminders().then((result) => {
      if (result.dispatchedCount > 0) {
        console.log(`[ReminderWorker] ${result.dispatchedCount} recordatorios emitidos.`);
      }
    }).catch((err) => {
      console.error('[ReminderWorker] Cycle failed:', err?.name || 'Error');
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
