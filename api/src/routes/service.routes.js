import { Router } from 'express';
import {
  getActiveServiceForUser,
  getActiveServiceForVehicle,
  getServiceSummaryForUser,
  getServiceSummaryForVehicle,
  getVehicleById,
  listServiceHistory,
  searchParkingRecords,
} from '../data/store.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireAdmin } from '../middleware/require-admin.middleware.js';
import { buildReminderMessage, getReminderStatus } from '../services/reminders.js';

const router = Router();

router.use(authenticateToken, requireAdmin);

router.get('/search', asyncHandler(async (req, res) => {
  const result = await searchParkingRecords(req.user.id, req.query.q || '');
  return res.status(200).json(result);
}));

router.get('/active', (req, res) => {
  const { vehicleId } = req.query;
  const service = vehicleId
    ? getActiveServiceForVehicle(req.user.id, vehicleId)
    : getActiveServiceForUser(req.user.id);

  if (!service) {
    return res.status(404).json({ message: 'No active service found' });
  }

  return res.status(200).json({
    service: {
      id: service.id,
      vehicleId: service.vehicleId,
      vehicleType: service.vehicleType,
      status: service.status,
      dateStart: service.dateStart,
      dateEnd: service.dateEnd,
      daysRemaining: service.daysRemaining,
    },
  });
});

router.get('/summary', (req, res) => {
  const { vehicleId } = req.query;
  const summary = vehicleId
    ? getServiceSummaryForVehicle(req.user.id, vehicleId)
    : getServiceSummaryForUser(req.user.id);
  const targetVehicleId = vehicleId || summary.vehicleId;
  const candidateVehicle = targetVehicleId ? getVehicleById(targetVehicleId) : null;
  const vehicle = candidateVehicle?.user_id === req.user.id ? candidateVehicle : null;
  const reminderStatus = summary.hasActiveService
    ? getReminderStatus(summary.dateEnd)
    : 'INACTIVE';

  return res.status(200).json({
    ...summary,
    reminderStatus,
    reminderMessage: summary.hasActiveService
      ? buildReminderMessage({ daysRemaining: summary.daysRemaining }, vehicle)
      : (vehicle ? `Sin servicio activo para ${vehicle.plate}` : 'Sin servicio activo'),
  });
});

router.post('/purchase', (req, res) => {
  return res.status(503).json({
    code: 'PAYMENTS_NOT_CONFIGURED',
    message: 'Las compras están deshabilitadas hasta integrar y verificar una pasarela de pago.',
  });
});

router.get('/history', asyncHandler(async (req, res) => {
  const services = await listServiceHistory(req.user.id);
  return res.status(200).json({ services });
}));

router.get('/reminder', (req, res) => {
  const service = getActiveServiceForUser(req.user.id);

  if (!service) {
    return res.status(404).json({ message: 'No active service found' });
  }

  const reminderStatus = getReminderStatus(service.dateEnd);
  return res.status(200).json({
    reminderStatus,
    message: buildReminderMessage({ daysRemaining: service.daysRemaining }),
    service: {
      id: service.id,
      daysRemaining: service.daysRemaining,
      dateEnd: service.dateEnd,
    },
  });
});

export default router;
