import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireAdmin } from '../middleware/require-admin.middleware.js';
import { listVehiclesForAdmin, updateVehicle } from '../data/store.js';

const router = Router();

router.use(authenticateToken, requireAdmin);

router.get('/', (req, res) => {
  const vehicles = listVehiclesForAdmin();
  return res.status(200).json({ vehicles });
});

router.patch('/:vehicleId', asyncHandler(async (req, res) => {
  const { ownerName, ownerEmail } = req.body || {};
  if (
    typeof ownerName !== 'string' ||
    !ownerName.trim() ||
    typeof ownerEmail !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail.trim())
  ) {
    return res.status(400).json({ message: 'A valid owner name and email are required.' });
  }

  try {
    const vehicle = await updateVehicle(
      req.params.vehicleId,
      req.user.id,
      req.body,
      req.user.role === 'ADMIN',
    );
    return res.status(200).json({ message: 'Vehicle updated successfully', vehicle });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to update vehicle' });
  }
}));

export default router;
