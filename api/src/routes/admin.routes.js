import { Router } from 'express';
import {
  createVehicle,
  listAdminServiceHistory,
  listVehiclesForAdmin,
  renewVehicleService,
  setVehicleServiceState,
  updateAdminService,
} from '../data/store.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireAdmin } from '../middleware/require-admin.middleware.js';

const router = Router();

router.use(authenticateToken, requireAdmin);

router.get('/vehicles', asyncHandler(async (req, res) => {
  return res.status(200).json({ vehicles: await listVehiclesForAdmin() });
}));

router.post('/vehicles', asyncHandler(async (req, res) => {
  const {
    type,
    plate,
    brand = '',
    model = '',
    ownerName,
    ownerEmail,
  } = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const normalizedType = typeof type === 'string' ? type.toUpperCase() : '';
  const cleanPlate = typeof plate === 'string' ? plate.trim() : '';
  const cleanOwnerName = typeof ownerName === 'string' ? ownerName.trim() : '';
  const cleanOwnerEmail = typeof ownerEmail === 'string' ? ownerEmail.trim() : '';
  const cleanBrand = typeof brand === 'string' ? brand.trim() : null;
  const cleanModel = typeof model === 'string' ? model.trim() : null;
  if (
    !['CAR', 'MOTORCYCLE'].includes(normalizedType) ||
    !/^[A-Z0-9-]{2,12}$/i.test(cleanPlate) ||
    cleanPlate.startsWith('-') || cleanPlate.endsWith('-') ||
    cleanOwnerName.length < 1 || cleanOwnerName.length > 120 || /[\u0000-\u001f\u007f]/.test(cleanOwnerName) ||
    cleanOwnerEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanOwnerEmail) ||
    cleanBrand === null || cleanModel === null || cleanBrand.length > 100 || cleanModel.length > 100
  ) {
    return res.status(400).json({
      message: 'A valid vehicle type, plate, owner name and owner email are required.',
    });
  }

  try {
    const vehicle = await createVehicle({
      userId: req.user.id,
      type: normalizedType,
      plate: cleanPlate.toUpperCase(),
      brand: cleanBrand,
      model: cleanModel,
      ownerName: cleanOwnerName,
      ownerEmail: cleanOwnerEmail.toLowerCase(),
    });
    return res.status(201).json({ vehicle });
  } catch (error) {
    if (error.errcode === 2067 || error.code === 6) {
      return res.status(409).json({ message: 'This plate is already registered.' });
    }
    throw error;
  }
}));

router.get('/services/history', asyncHandler(async (req, res) => {
  return res.status(200).json({ services: await listAdminServiceHistory() });
}));

router.patch('/services/:serviceId', asyncHandler(async (req, res) => {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(req.params.serviceId)) {
    return res.status(400).json({ message: 'A valid service ID is required.' });
  }
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body
    : {};
  const { vehicleId, status, dateStart, dateEnd, planId, amount } = body;
  if (
    typeof vehicleId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(vehicleId) ||
    !['ACTIVE', 'INACTIVE'].includes(status) ||
    typeof dateStart !== 'string' || Number.isNaN(Date.parse(dateStart)) ||
    typeof dateEnd !== 'string' || Number.isNaN(Date.parse(dateEnd)) ||
    Date.parse(dateEnd) <= Date.parse(dateStart) ||
    (status === 'ACTIVE' &&
      (Date.parse(dateStart) > Date.now() || Date.parse(dateEnd) <= Date.now())) ||
    typeof planId !== 'string' || !planId.trim() || planId.trim().length > 100 ||
    typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 1000000000
  ) {
    return res.status(400).json({ message: 'Valid vehicle, status, dates, plan and amount are required.' });
  }

  try {
    const service = await updateAdminService(req.params.serviceId, {
      vehicleId,
      status,
      dateStart: new Date(dateStart).toISOString(),
      dateEnd: new Date(dateEnd).toISOString(),
      planId: planId.trim(),
      amount,
    });
    return res.status(200).json({ service });
  } catch (error) {
    if (error.message === 'Service not found.' || error.message === 'Vehicle not found.') {
      return res.status(404).json({ message: error.message });
    }
    if (error.message === 'Vehicle already has an active service.') {
      return res.status(409).json({ message: error.message });
    }
    if (error.code === 'aborted' || error.code === 10) {
      return res.status(409).json({ message: 'Service state changed concurrently; retry the request.' });
    }
    throw error;
  }
}));

router.post('/vehicles/:vehicleId/service/renew', asyncHandler(async (req, res) => {
  const { days = 30 } =
    req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(req.params.vehicleId)) {
    return res.status(400).json({ message: 'A valid vehicle ID is required.' });
  }
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    return res.status(400).json({ message: 'The service duration must be between 1 and 365 days.' });
  }

  try {
    const service = await renewVehicleService(req.params.vehicleId, days);
    return res.status(200).json({ service });
  } catch (error) {
    if (error.message === 'Vehicle not found.') {
      return res.status(404).json({ message: error.message });
    }
    if (error.code === 'aborted' || error.code === 10) {
      return res.status(409).json({ message: 'Service state changed concurrently; retry the request.' });
    }
    throw error;
  }
}));

router.put('/vehicles/:vehicleId/service', asyncHandler(async (req, res) => {
  const { active, days = 30 } =
    req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(req.params.vehicleId)) {
    return res.status(400).json({ message: 'A valid vehicle ID is required.' });
  }
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
    if (error.message === 'Vehicle not found.') {
      return res.status(404).json({ message: error.message });
    }
    if (error.code === 'aborted' || error.code === 10) {
      return res.status(409).json({ message: 'Service state changed concurrently; retry the request.' });
    }
    throw error;
  }
}));

export default router;
