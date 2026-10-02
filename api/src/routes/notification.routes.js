import { Router } from 'express';
import { firebaseAdmin } from '../config/firebase.js';
import { getVehicleById, listDeviceTokensForUser, listNotificationsForUser, queueNotification, registerNotificationToken } from '../data/store.js';
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
  const { token } = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};

  if (typeof token !== 'string' || token.length < 20 || token.length > 4096 || /[\r\n]/.test(token)) {
    return res.status(400).json({ message: 'Device token is required' });
  }

  const result = await registerNotificationToken(req.user.id, token);
  return res.status(200).json(result);
}));

router.post('/send', asyncHandler(async (req, res) => {
  const { type, message, vehicleId } = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body
    : {};
  const userId = req.user.id;

  if (typeof type !== 'string' || !/^[A-Z_]{2,32}$/.test(type)
    || typeof message !== 'string' || !message.trim() || message.length > 1000) {
    return res.status(400).json({ message: 'Missing notification payload' });
  }
  if (typeof vehicleId !== 'undefined'
    && (typeof vehicleId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(vehicleId))) {
    return res.status(400).json({ message: 'A valid vehicle ID is required.' });
  }

  const notification = await queueNotification({ userId, type, message });
  const tokens = await listDeviceTokensForUser(userId);

  let firebaseMessage = null;
  if (firebaseAdmin) {
    if (tokens.length > 0) {
      const candidateVehicle = vehicleId ? await getVehicleById(vehicleId) : null;
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
    sentTo: tokens.length,
  });
}));

export default router;
