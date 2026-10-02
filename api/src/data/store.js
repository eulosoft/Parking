import { randomUUID } from 'node:crypto';
import { all, db, get, run } from '../database/db.js';
import { calculateDaysRemaining, getServiceStatus, validatePurchaseInput } from '../services/parking.service.js';
import { mirrorDocument, mirrorStore } from '../services/firebase-sync.js';

const now = () => new Date();

export const store = {
  users: [],
  vehicles: [],
  services: [],
  notifications: [],
  deviceTokens: [],
};

export async function initializeStore() {
  const users = await all('SELECT * FROM users ORDER BY created_at DESC');
  const vehicles = await all('SELECT * FROM vehicles ORDER BY created_at DESC');
  const services = await all('SELECT * FROM services ORDER BY created_at DESC');
  const notifications = await all('SELECT * FROM notifications ORDER BY created_at DESC');
  const deviceTokens = await all('SELECT * FROM device_tokens ORDER BY created_at DESC');

  store.users = users;
  store.vehicles = vehicles;
  store.services = services;
  store.notifications = notifications;
  store.deviceTokens = deviceTokens;
  await mirrorStore(store);
}

export function getUserByEmail(email) {
  return store.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
}

export function getUserById(userId) {
  return store.users.find((user) => user.id === userId) || null;
}

export async function createUser({ id, name, email, password }) {
  const createdAt = new Date().toISOString();
  await run('INSERT INTO users (id, name, email, password, created_at) VALUES (?, ?, ?, ?, ?)', [id, name, email, password, createdAt]);
  const user = { id, name, email, password, created_at: createdAt };
  store.users.push(user);
  await mirrorDocument('users', user.id, { name, email, createdAt });
  return user;
}

export function getVehicleById(vehicleId) {
  return store.vehicles.find((vehicle) => vehicle.id === vehicleId);
}

export function listVehiclesForAdmin() {
  return store.vehicles
    .map((vehicle) => {
      const owner = getUserById(vehicle.user_id);
      const latestService = store.services
        .filter((service) => service.vehicle_id === vehicle.id)
        .sort((left, right) => new Date(right.date_start) - new Date(left.date_start))[0];
      const isActive = latestService?.status === 'ACTIVE'
        && new Date(latestService.date_end) > now();

      return {
        ...vehicle,
        userId: vehicle.user_id,
        createdAt: vehicle.created_at,
        owner: vehicle.owner_name || vehicle.owner_email
          ? {
              id: owner?.id || null,
              name: vehicle.owner_name || owner?.name || '',
              email: vehicle.owner_email || owner?.email || '',
            }
          : null,
        service: latestService
          ? {
              id: latestService.id,
              status: isActive ? getServiceStatus(calculateDaysRemaining(latestService.date_end, now())) : latestService.status,
              isActive,
              dateStart: latestService.date_start,
              dateEnd: latestService.date_end,
              daysRemaining: calculateDaysRemaining(latestService.date_end, now()),
            }
          : null,
      };
    })
    .sort((left, right) => left.plate.localeCompare(right.plate));
}

export function listAdminServiceHistory() {
  return store.services
    .map((service) => {
      const vehicle = getVehicleById(service.vehicle_id);
      const owner = getUserById(service.user_id);
      return {
        ...service,
        userId: service.user_id,
        vehicleId: service.vehicle_id,
        vehiclePlate: vehicle?.plate || 'Vehículo eliminado',
        vehicleType: service.vehicle_type,
        planId: service.plan_id,
        paymentMethod: service.payment_method,
        dateStart: service.date_start,
        dateEnd: service.date_end,
        owner: vehicle
          ? {
              name: vehicle.owner_name || owner?.name || '',
              email: vehicle.owner_email || owner?.email || '',
            }
          : null,
        daysRemaining: calculateDaysRemaining(service.date_end, now()),
      };
    })
    .sort((left, right) => new Date(right.dateStart) - new Date(left.dateStart));
}

export async function setVehicleServiceState(vehicleId, isActive, days = 30) {
  if (typeof isActive !== 'boolean') {
    throw new Error('Service state must be active or inactive.');
  }
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new Error('Service duration must be between 1 and 365 days.');
  }

  const vehicle = getVehicleById(vehicleId);
  if (!vehicle) {
    throw new Error('Vehicle not found.');
  }

  const timestamp = now();
  const existingActiveService = store.services
    .filter((service) => service.vehicle_id === vehicleId && service.status === 'ACTIVE')
    .sort((left, right) => new Date(right.date_start) - new Date(left.date_start))[0];

  if (!isActive) {
    if (!existingActiveService || new Date(existingActiveService.date_end) <= timestamp) {
      const latestService = store.services
        .filter((service) => service.vehicle_id === vehicleId)
        .sort((left, right) => new Date(right.date_start) - new Date(left.date_start))[0];
      const status = latestService?.status === 'ACTIVE'
        ? 'EXPIRED'
        : latestService?.status || 'INACTIVE';
      return {
        id: latestService?.id || null,
        vehicleId,
        status,
        isActive: false,
        dateStart: latestService?.date_start || null,
        dateEnd: latestService?.date_end || null,
        daysRemaining: 0,
      };
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      run('UPDATE services SET status = ? WHERE id = ?', ['INACTIVE', existingActiveService.id]);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    existingActiveService.status = 'INACTIVE';
    await mirrorDocument('services', existingActiveService.id, { status: 'INACTIVE' });

    return {
      id: existingActiveService.id,
      vehicleId,
      status: 'INACTIVE',
      isActive: false,
      dateStart: existingActiveService.date_start,
      dateEnd: existingActiveService.date_end,
      daysRemaining: 0,
    };
  }

  if (existingActiveService && new Date(existingActiveService.date_end) > timestamp) {
    return {
      id: existingActiveService.id,
      vehicleId,
      status: getServiceStatus(calculateDaysRemaining(existingActiveService.date_end, timestamp)),
      isActive: true,
      dateStart: existingActiveService.date_start,
      dateEnd: existingActiveService.date_end,
      daysRemaining: calculateDaysRemaining(existingActiveService.date_end, timestamp),
    };
  }

  const serviceId = `service_${randomUUID()}`;
  const dateStart = timestamp.toISOString();
  const dateEnd = new Date(timestamp.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  const service = {
    id: serviceId,
    user_id: vehicle.user_id,
    vehicle_id: vehicle.id,
    vehicle_type: vehicle.type,
    plan_id: 'manual_admin',
    payment_method: 'ADMIN',
    amount: 0,
    status: 'ACTIVE',
    date_start: dateStart,
    date_end: dateEnd,
  };

  db.exec('BEGIN IMMEDIATE');
  try {
    if (existingActiveService) {
      run('UPDATE services SET status = ? WHERE id = ?', ['EXPIRED', existingActiveService.id]);
    }
    run(
      'INSERT INTO services (id, user_id, vehicle_id, vehicle_type, plan_id, payment_method, amount, status, date_start, date_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        serviceId,
        vehicle.user_id,
        vehicle.id,
        vehicle.type,
        'manual_admin',
        'ADMIN',
        0,
        'ACTIVE',
        dateStart,
        dateEnd,
      ],
    );
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  if (existingActiveService) {
    existingActiveService.status = 'EXPIRED';
    await mirrorDocument('services', existingActiveService.id, { status: 'EXPIRED' });
  }
  store.services.unshift(service);
  await mirrorDocument('services', service.id, {
    ownerId: service.user_id,
    vehicleId: service.vehicle_id,
    vehicleType: service.vehicle_type,
    planId: service.plan_id,
    paymentMethod: service.payment_method,
    amount: service.amount,
    status: service.status,
    dateStart: service.date_start,
    dateEnd: service.date_end,
  });

  return {
    id: service.id,
    vehicleId: service.vehicle_id,
    status: 'ACTIVE',
    isActive: true,
    dateStart,
    dateEnd,
    daysRemaining: days,
  };
}

export async function createVehicle({
  userId,
  type,
  plate,
  brand = '',
  model = '',
  ownerName,
  ownerEmail,
}) {
  if (!userId || !type || !plate || !ownerName?.trim() || !ownerEmail?.trim()) {
    throw new Error('Missing required vehicle fields');
  }

  const normalizedType = String(type).toUpperCase();
  const vehicleId = `veh_${randomUUID()}`;
  const createdAt = new Date().toISOString();

  await run(
    'INSERT INTO vehicles (id, user_id, type, plate, brand, model, owner_name, owner_email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [vehicleId, userId, normalizedType, plate, brand, model, ownerName.trim(), ownerEmail.trim().toLowerCase(), createdAt],
  );

  const vehicle = {
    id: vehicleId,
    user_id: userId,
    type: normalizedType,
    plate,
    brand,
    model,
    owner_name: ownerName.trim(),
    owner_email: ownerEmail.trim().toLowerCase(),
    created_at: createdAt,
  };

  store.vehicles.unshift(vehicle);
  await mirrorDocument('vehicles', vehicle.id, {
    ownerId: vehicle.user_id,
    type: vehicle.type,
    plate: vehicle.plate,
    brand: vehicle.brand,
    model: vehicle.model,
    ownerName: vehicle.owner_name,
    ownerEmail: vehicle.owner_email,
    createdAt: vehicle.created_at,
  });
  return vehicle;
}

export async function updateVehicle(
  vehicleId,
  userId,
  { type, plate, brand = '', model = '', ownerName, ownerEmail },
  allowAnyOwner = false,
) {
  const vehicle = getVehicleById(vehicleId);
  if (!vehicle || (!allowAnyOwner && vehicle.user_id !== userId)) {
    throw new Error('Vehicle not found');
  }
  if (!type || !plate?.trim() || !ownerName?.trim() || !ownerEmail?.trim()) {
    throw new Error('Vehicle type, plate and owner details are required');
  }

  if (allowAnyOwner) {
    await run(
      'UPDATE vehicles SET type = ?, plate = ?, brand = ?, model = ?, owner_name = ?, owner_email = ? WHERE id = ?',
      [String(type).toUpperCase(), plate.trim(), brand.trim(), model.trim(), ownerName.trim(), ownerEmail.trim().toLowerCase(), vehicleId],
    );
  } else {
    await run(
      'UPDATE vehicles SET type = ?, plate = ?, brand = ?, model = ?, owner_name = ?, owner_email = ? WHERE id = ? AND user_id = ?',
      [String(type).toUpperCase(), plate.trim(), brand.trim(), model.trim(), ownerName.trim(), ownerEmail.trim().toLowerCase(), vehicleId, userId],
    );
  }
  Object.assign(vehicle, {
    type: String(type).toUpperCase(),
    plate: plate.trim(),
    brand: brand.trim(),
    model: model.trim(),
    owner_name: ownerName.trim(),
    owner_email: ownerEmail.trim().toLowerCase(),
  });
  await mirrorDocument('vehicles', vehicle.id, {
    ownerId: vehicle.user_id,
    type: vehicle.type,
    plate: vehicle.plate,
    brand: vehicle.brand,
    model: vehicle.model,
    ownerName: vehicle.owner_name,
    ownerEmail: vehicle.owner_email,
  });
  return { ...vehicle, userId: vehicle.user_id, createdAt: vehicle.created_at };
}

export function listVehiclesForUser(userId = 'user_1') {
  return store.vehicles
    .filter((vehicle) => vehicle.user_id === userId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((vehicle) => ({
      ...vehicle,
      userId: vehicle.user_id,
      createdAt: vehicle.created_at,
    }));
}

export async function searchParkingRecords(userId = 'user_1', query = '') {
  const term = String(query).trim().toLowerCase();
  const user = getUserById(userId);
  const vehicles = listVehiclesForUser(userId);
  const services = await listServiceHistory(userId);

  if (!term) {
    return { owner: user ? { id: user.id, name: user.name, email: user.email } : null, vehicles, services };
  }

  const matches = (values) => values.some((value) => String(value ?? '').toLowerCase().includes(term));
  const matchedVehicles = vehicles.filter((vehicle) => matches([
    vehicle.plate,
    vehicle.type,
    vehicle.brand,
    vehicle.model,
    vehicle.id,
  ]));
  const matchedServices = services.filter((service) => matches([
    service.id,
    service.vehicleId,
    service.vehicleType,
    service.planId,
    service.paymentMethod,
    service.status,
    service.dateStart,
    service.dateEnd,
    service.amount,
  ]));
  const ownerMatches = user && matches([user.name, user.email, user.id]);
  const vehicleIds = new Set(matchedVehicles.map((vehicle) => vehicle.id));
  const serviceVehicleIds = new Set(matchedServices.map((service) => service.vehicleId));

  return {
    owner: ownerMatches ? { id: user.id, name: user.name, email: user.email } : null,
    vehicles: ownerMatches ? vehicles : matchedVehicles,
    services: ownerMatches ? services : matchedServices.filter((service) => serviceVehicleIds.has(service.vehicleId) || vehicleIds.has(service.vehicleId)),
  };
}

export function getActiveServiceForUser(userId = 'user_1') {
  const active = store.services
    .filter((service) => service.user_id === userId && service.status === 'ACTIVE')
    .sort((a, b) => new Date(b.date_start) - new Date(a.date_start))[0];

  if (!active) {
    return null;
  }

  const daysRemaining = calculateDaysRemaining(active.date_end, now());

  return {
    ...active,
    userId: active.user_id,
    vehicleId: active.vehicle_id,
    vehicleType: active.vehicle_type,
    dateStart: active.date_start,
    dateEnd: active.date_end,
    daysRemaining,
    status: getServiceStatus(daysRemaining),
  };
}

export function getActiveServiceForVehicle(userId = 'user_1', vehicleId) {
  const active = store.services
    .filter((service) => service.user_id === userId && service.vehicle_id === vehicleId && service.status === 'ACTIVE')
    .sort((a, b) => new Date(b.date_start) - new Date(a.date_start))[0];

  if (!active) {
    return null;
  }

  const daysRemaining = calculateDaysRemaining(active.date_end, now());

  return {
    ...active,
    userId: active.user_id,
    vehicleId: active.vehicle_id,
    vehicleType: active.vehicle_type,
    dateStart: active.date_start,
    dateEnd: active.date_end,
    daysRemaining,
    status: getServiceStatus(daysRemaining),
  };
}

export async function createServicePurchase({ userId, vehicleId, planId, paymentMethod, amount }) {
  const validated = validatePurchaseInput({ userId, vehicleId, planId, paymentMethod, amount });
  const vehicle = getVehicleById(validated.vehicleId);
  if (!vehicle || vehicle.user_id !== validated.userId) {
    throw new Error('Vehicle not found');
  }

  const nowTime = now();
  const activeService = store.services.find(
    (service) =>
      service.user_id === validated.userId &&
      service.vehicle_id === validated.vehicleId &&
      service.status === 'ACTIVE' &&
      new Date(service.date_end) > nowTime,
  );

  const isRenewal = !!activeService || store.services.some(
    (service) => service.user_id === validated.userId && service.vehicle_id === validated.vehicleId,
  );

  let dateStart;
  let dateEnd;

  if (activeService) {
    // Renovación acumulativa: conserva días restantes sumando 30 días a la fecha fin vigente
    const currentEndDate = new Date(activeService.date_end);
    dateStart = nowTime;
    dateEnd = new Date(currentEndDate.getTime() + 1000 * 60 * 60 * 24 * 30);

    // Marcar el servicio previo como RENEWED para mantener un único servicio ACTIVE por vehículo
    await run('UPDATE services SET status = ? WHERE id = ?', ['RENEWED', activeService.id]);
    activeService.status = 'RENEWED';
    await mirrorDocument('services', activeService.id, {
      status: 'RENEWED',
    });
  } else {
    dateStart = nowTime;
    dateEnd = new Date(nowTime.getTime() + 1000 * 60 * 60 * 24 * 30);
  }

  const serviceId = `service_${randomUUID()}`;

  await run(
    'INSERT INTO services (id, user_id, vehicle_id, vehicle_type, plan_id, payment_method, amount, status, date_start, date_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [serviceId, validated.userId, validated.vehicleId, vehicle.type, validated.planId, validated.paymentMethod, validated.amount, 'ACTIVE', dateStart.toISOString(), dateEnd.toISOString()],
  );

  const service = {
    id: serviceId,
    user_id: validated.userId,
    vehicle_id: validated.vehicleId,
    vehicle_type: vehicle.type,
    plan_id: validated.planId,
    payment_method: validated.paymentMethod,
    amount: validated.amount,
    status: 'ACTIVE',
    date_start: dateStart.toISOString(),
    date_end: dateEnd.toISOString(),
  };

  const existingIndex = store.services.findIndex((item) => item.id === serviceId);
  if (existingIndex >= 0) {
    store.services.splice(existingIndex, 1, service);
  } else {
    store.services.unshift(service);
  }
  await mirrorDocument('services', service.id, {
    ownerId: service.user_id,
    vehicleId: service.vehicle_id,
    vehicleType: service.vehicle_type,
    planId: service.plan_id,
    paymentMethod: service.payment_method,
    amount: service.amount,
    status: service.status,
    dateStart: service.date_start,
    dateEnd: service.date_end,
  });

  const daysRemaining = Math.max(0, Math.ceil((dateEnd.getTime() - nowTime.getTime()) / (1000 * 60 * 60 * 24)));

  return {
    ...service,
    userId: validated.userId,
    vehicleId: validated.vehicleId,
    vehicleType: vehicle.type,
    daysRemaining,
    isRenewal,
    message: isRenewal
      ? `Servicio renovado con éxito para ${vehicle.plate}. Vigencia extendida por 30 días adicionales.`
      : `Servicio activado con éxito para ${vehicle.plate}.`,
  };
}

export async function listServiceHistory(userId = 'user_1') {
  const rows = store.services.filter((service) => service.user_id === userId);
  return rows
    .map((service) => ({
      ...service,
      userId: service.user_id,
      vehicleId: service.vehicle_id,
      vehicleType: service.vehicle_type,
      planId: service.plan_id,
      paymentMethod: service.payment_method,
      dateStart: service.date_start,
      dateEnd: service.date_end,
      daysRemaining: Math.max(0, Math.ceil((new Date(service.date_end) - now()) / (1000 * 60 * 60 * 24))),
    }))
    .sort((a, b) => new Date(b.dateStart) - new Date(a.dateStart));
}

export function getServiceSummaryForUser(userId = 'user_1') {
  const service = getActiveServiceForUser(userId);

  if (!service) {
    return {
      hasActiveService: false,
      status: 'INACTIVE',
      daysRemaining: 0,
      message: 'No active service found',
    };
  }

  return {
    hasActiveService: true,
    status: service.status,
    daysRemaining: service.daysRemaining,
    vehicleId: service.vehicleId,
    vehicleType: service.vehicleType,
    dateStart: service.dateStart,
    dateEnd: service.dateEnd,
    message: service.status === 'PENDING'
      ? 'Servicio próximo a vencer'
      : 'Servicio activo y vigente',
  };
}

export function getServiceSummaryForVehicle(userId = 'user_1', vehicleId) {
  const vehicle = getVehicleById(vehicleId);
  const service = getActiveServiceForVehicle(userId, vehicleId);
  const ownedVehicle = vehicle?.user_id === userId ? vehicle : null;

  if (!service) {
    return {
      hasActiveService: false,
      status: 'INACTIVE',
      daysRemaining: 0,
      vehicleId,
      vehiclePlate: ownedVehicle ? ownedVehicle.plate : null,
      vehicleType: ownedVehicle ? ownedVehicle.type : null,
      message: ownedVehicle ? `Sin servicio activo para ${ownedVehicle.plate}` : 'No active service found',
    };
  }

  return {
    hasActiveService: true,
    status: service.status,
    daysRemaining: service.daysRemaining,
    vehicleId: service.vehicleId,
    vehiclePlate: ownedVehicle ? ownedVehicle.plate : null,
    vehicleType: service.vehicleType,
    dateStart: service.dateStart,
    dateEnd: service.dateEnd,
    message: service.status === 'PENDING'
      ? `Servicio próximo a vencer para ${ownedVehicle ? ownedVehicle.plate : service.vehicleId}`
      : `Servicio activo y vigente para ${ownedVehicle ? ownedVehicle.plate : service.vehicleId}`,
  };
}

export async function listNotificationsForUser(userId = 'user_1') {
  return store.notifications
    .filter((entry) => entry.user_id === userId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((entry) => ({
      ...entry,
      userId: entry.user_id,
      createdAt: entry.created_at,
    }));
}

export async function registerNotificationToken(userId, token) {
  const exists = store.deviceTokens.some((entry) => entry.user_id === userId && entry.token === token);
  if (!exists) {
    const insert = await run('INSERT INTO device_tokens (user_id, token) VALUES (?, ?)', [userId, token]);
    store.deviceTokens.push({
      id: insert.id,
      user_id: userId,
      token,
      created_at: new Date().toISOString(),
    });
    await mirrorDocument('deviceTokens', insert.id, {
      ownerId: userId,
      token,
      createdAt: new Date().toISOString(),
    });
  }
  return { message: 'Device token registered successfully' };
}

export async function queueNotification({ userId, type, message }) {
  const notificationId = `notif_${randomUUID()}`;
  const createdAt = new Date().toISOString();

  await run('INSERT INTO notifications (id, user_id, type, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
    notificationId,
    userId,
    type,
    message,
    'QUEUED',
    createdAt,
  ]);

  const entry = {
    id: notificationId,
    user_id: userId,
    type,
    message,
    status: 'QUEUED',
    created_at: createdAt,
  };

  store.notifications.unshift(entry);
  await mirrorDocument('notifications', entry.id, {
    ownerId: entry.user_id,
    type: entry.type,
    message: entry.message,
    status: entry.status,
    createdAt: entry.created_at,
  });
  return { ...entry, userId, createdAt };
}
