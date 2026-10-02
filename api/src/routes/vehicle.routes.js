import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireAdmin } from '../middleware/require-admin.middleware.js';
import { listVehiclesForAdmin, updateVehicle } from '../data/store.js';

const router = Router();

router.use(authenticateToken, requireAdmin);

router.get('/', asyncHandler(async (req, res) => {
  const vehicles = await listVehiclesForAdmin();
  return res.status(200).json({ vehicles });
}));

router.patch('/:vehicleId', asyncHandler(async (req, res) => {
  const { ownerName, ownerEmail, type, plate, brand = '', model = '' } =
    req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const normalizedType = typeof type === 'string' ? type.toUpperCase() : '';
  const cleanPlate = typeof plate === 'string' ? plate.trim() : '';
  if (
    !/^[A-Za-z0-9_-]{1,128}$/.test(req.params.vehicleId) ||
    typeof ownerName !== 'string' ||
    !ownerName.trim() || ownerName.trim().length > 120 ||
    typeof ownerEmail !== 'string' ||
    ownerEmail.trim().length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail.trim()) ||
    !['CAR', 'MOTORCYCLE'].includes(normalizedType) ||
    !/^[A-Z0-9-]{2,12}$/i.test(cleanPlate) || cleanPlate.startsWith('-') || cleanPlate.endsWith('-') ||
    typeof brand !== 'string' || brand.trim().length > 100 ||
    typeof model !== 'string' || model.trim().length > 100
  ) {
    return res.status(400).json({ message: 'A valid owner name and email are required.' });
  }

  try {
    const vehicle = await updateVehicle(
      req.params.vehicleId,
      req.user.id,
      { type: normalizedType, plate: cleanPlate.toUpperCase(), brand, model, ownerName, ownerEmail },
      req.user.role === 'ADMIN',
    );
    return res.status(200).json({ message: 'Vehicle updated successfully', vehicle });
  } catch (error) {
    if (error.errcode === 2067 || error.code === 6) {
      return res.status(409).json({ message: 'This plate is already registered.' });
    }
    if (error.message === 'Vehicle not found') {
      return res.status(404).json({ message: 'Vehicle not found.' });
    }
    throw error;
  }
}));

export default router;
