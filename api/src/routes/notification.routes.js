import { Router } from 'express';
import { firebaseAdmin } from '../config/firebase.js';
import { getVehicleById, listNotificationsForUser, queueNotification, registerNotificationToken, store } from '../data/store.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireAdmin } from '../middleware/require-admin.middleware.js';

const router = Router();

router.use(authenticateToken, requireAdmin);

router.get('/pending', asyncHandler(async (req, res) => {
  const notifications = await listNotificationsForUser(req.user.id);
  return res.status(200).json({ notifications });
}));

router.post('/token', asyncHandler(async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ message: 'Device token is required' });
  }

  const result = await registerNotificationToken(req.user.id, token);
  return res.status(200).json(result);
}));

router.post('/send', asyncHandler(async (req, res) => {
  const { type, message, vehicleId } = req.body;
  const userId = req.user.id;

  if (!type || !message) {
    return res.status(400).json({ message: 'Missing notification payload' });
  }

  const notification = await queueNotification({ userId, type, message });

  let firebaseMessage = null;
  if (firebaseAdmin) {
    const tokens = store.deviceTokens.filter((entry) => entry.user_id === userId).map((entry) => entry.token);

    if (tokens.length > 0) {
      const candidateVehicle = vehicleId ? getVehicleById(vehicleId) : null;
      const vehicle = candidateVehicle?.user_id === userId ? candidateVehicle : null;
      const title = type === 'RENEWAL'
        ? (vehicle ? `Renovación: ${vehicle.plate}` : 'Renovación activada')
        : type === 'ACTIVATION'
        ? (vehicle ? `Servicio activado: ${vehicle.plate}` : 'Servicio activado')
        : (vehicle ? `Recordatorio: ${vehicle.plate}` : 'Recordatorio de parqueadero');

      firebaseMessage = await firebaseAdmin.messaging().sendEachForMulticast({
        tokens,
        notification: {
          title,
          body: message,
        },
      });
    }
  }

  return res.status(200).json({
    message: 'Notification queued successfully',
    notification,
    firebase: firebaseMessage ? {
      successCount: firebaseMessage.successCount,
      failureCount: firebaseMessage.failureCount,
    } : { status: 'skipped', reason: 'Firebase not configured' },
    sentTo: store.deviceTokens.filter((entry) => entry.user_id === userId).length,
  });
}));

export default router;
