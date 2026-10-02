import { Router } from 'express';
import {
  createVehicle,
  listAdminServiceHistory,
  listVehiclesForAdmin,
  setVehicleServiceState,
} from '../data/store.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireAdmin } from '../middleware/require-admin.middleware.js';

const router = Router();

router.use(authenticateToken, requireAdmin);

router.get('/vehicles', (req, res) => {
  return res.status(200).json({ vehicles: listVehiclesForAdmin() });
});

router.post('/vehicles', asyncHandler(async (req, res) => {
  const {
    type,
    plate,
    brand = '',
    model = '',
    ownerName,
    ownerEmail,
  } = req.body || {};
  const normalizedType = typeof type === 'string' ? type.toUpperCase() : '';
  if (
    !['CAR', 'MOTORCYCLE'].includes(normalizedType) ||
    typeof plate !== 'string' ||
    !plate.trim() ||
    typeof ownerName !== 'string' ||
    !ownerName.trim() ||
    typeof ownerEmail !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail.trim())
  ) {
    return res.status(400).json({
      message: 'A valid vehicle type, plate, owner name and owner email are required.',
    });
  }

  try {
    const vehicle = await createVehicle({
      userId: req.user.id,
      type: normalizedType,
      plate: plate.trim().toUpperCase(),
      brand: typeof brand === 'string' ? brand.trim() : '',
      model: typeof model === 'string' ? model.trim() : '',
      ownerName: ownerName.trim(),
      ownerEmail: ownerEmail.trim().toLowerCase(),
    });
    return res.status(201).json({ vehicle });
  } catch (error) {
    if (error.errcode === 2067) {
      return res.status(409).json({ message: 'This plate is already registered.' });
    }
    throw error;
  }
}));

router.get('/services/history', (req, res) => {
  return res.status(200).json({ services: listAdminServiceHistory() });
});

router.put('/vehicles/:vehicleId/service', asyncHandler(async (req, res) => {
  const { active, days = 30 } = req.body || {};
  if (typeof active !== 'boolean') {
    return res.status(400).json({ message: 'The active field must be a boolean.' });
  }
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    return res.status(400).json({ message: 'The service duration must be between 1 and 365 days.' });
  }

  try {
    const service = await setVehicleServiceState(req.params.vehicleId, active, days);
    return res.status(200).json({ service });
  } catch (error) {
    const status = error.message === 'Vehicle not found.' ? 404 : 409;
    return res.status(status).json({ message: error.message });
  }
}));

export default router;
