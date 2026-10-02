import { createHash, randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { firebaseFirestore } from '../config/firebase.js';
import { hashPassword, isPasswordHash, verifyPassword } from '../services/password.js';
import { calculateDaysRemaining, getServiceStatus, validatePurchaseInput } from '../services/parking.service.js';

const db = firebaseFirestore;
if (!db) throw new Error('Firestore is required when STORAGE_DRIVER=firestore.');

const collectionNames = {
  users: 'users',
  vehicles: 'vehicles',
  services: 'services',
  notifications: 'notifications',
  deviceTokens: 'deviceTokens',
};
const now = () => new Date();
const deterministicDocumentId = (value) => createHash('sha256').update(value).digest('hex');
const toLegacyShape = (id, data, collection) => {
  const item = { id, ...data };
  // Documents written by the former optional mirror used camelCase. Normalize
  // those documents on read so deployment can transition without data loss.
  if (collection === 'users') {
    const { password, password_hash, passwordHash, ...profile } = item;
    const storedHash = [password_hash, passwordHash, password]
      .find((candidate) => isPasswordHash(candidate));
    return {
      ...profile,
      ...(storedHash ? { password_hash: storedHash } : {}),
      created_at: profile.created_at ?? profile.createdAt,
    };
  }
  if (collection === 'vehicles') return {
    ...item, user_id: item.user_id ?? item.ownerId, owner_name: item.owner_name ?? item.ownerName,
    owner_email: item.owner_email ?? item.ownerEmail, created_at: item.created_at ?? item.createdAt,
  };
  if (collection === 'services') return {
    ...item, user_id: item.user_id ?? item.ownerId, vehicle_id: item.vehicle_id ?? item.vehicleId,
    vehicle_type: item.vehicle_type ?? item.vehicleType, plan_id: item.plan_id ?? item.planId,
    payment_method: item.payment_method ?? item.paymentMethod, date_start: item.date_start ?? item.dateStart,
    date_end: item.date_end ?? item.dateEnd, created_at: item.created_at ?? item.createdAt,
  };
  if (collection === 'notifications') return {
    ...item, user_id: item.user_id ?? item.ownerId, created_at: item.created_at ?? item.createdAt,
  };
  return { ...item, user_id: item.user_id ?? item.ownerId, created_at: item.created_at ?? item.createdAt };
};
const serialize = (item) => Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined));
async function readAll(collection) {
  const snapshot = await db.collection(collectionNames[collection]).get();
  return snapshot.docs.map((doc) => toLegacyShape(doc.id, doc.data(), collection));
}
async function readDoc(collection, id) {
  const snapshot = await db.collection(collectionNames[collection]).doc(String(id)).get();
  return snapshot.exists ? toLegacyShape(snapshot.id, snapshot.data(), collection) : null;
}
const byCreated = (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0);
const byDateStart = (a, b) => new Date(b.date_start || 0) - new Date(a.date_start || 0);

export const store = {
  users: [], vehicles: [], services: [], notifications: [], deviceTokens: [],
};

export async function initializeStore() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || password.length < 16 || password.length > 128) {
    throw new Error('Valid ADMIN_EMAIL and ADMIN_PASSWORD (16–128 characters) are required.');
  }
  const users = await db.collection('users').where('email', '==', email).limit(1).get();
  const caseInsensitiveMatch = users.empty
    ? (await db.collection('users').get()).docs.find((doc) =>
      String(doc.data().email || '').trim().toLowerCase() === email)
    : users.docs[0];
  const existingHash = caseInsensitiveMatch
    ? toLegacyShape(caseInsensitiveMatch.id, caseInsensitiveMatch.data(), 'users').password_hash
    : null;
  const adminPasswordHash = isPasswordHash(existingHash)
    && await verifyPassword(password, existingHash)
    ? existingHash
    : await hashPassword(password);
  // A deterministic bootstrap ID avoids duplicate admin profiles if multiple
  // Vercel cold starts initialize at the same time. Imported legacy IDs win.
  const id = !caseInsensitiveMatch
    ? `admin_${createHash('sha256').update(email).digest('hex').slice(0, 32)}`
    : caseInsensitiveMatch.id;
  const profile = {
    id, name: process.env.ADMIN_NAME?.trim() || 'Parking Administrator',
    email, role: 'ADMIN', created_at: !caseInsensitiveMatch ? now().toISOString()
      : (caseInsensitiveMatch.data().created_at || caseInsensitiveMatch.data().createdAt || now().toISOString()),
    password_hash: adminPasswordHash,
  };
  // Only a validated scrypt hash is stored. Admin SDK calls stay server-side;
  // Firestore Security Rules deny every client read/write.
  await db.collection('users').doc(id).set({
    ...serialize(profile),
    password: FieldValue.delete(),
    passwordHash: FieldValue.delete(),
  }, { merge: true });
}

const userForAuthentication = (user) => {
  if (!user || user.role !== 'ADMIN'
    || user.email?.trim().toLowerCase() !== process.env.ADMIN_EMAIL?.trim().toLowerCase()
    || !isPasswordHash(user.password_hash)) return null;
  const { password_hash: passwordHash, ...profile } = user;
  return { ...profile, password: passwordHash };
};

export async function getUserByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const result = await db.collection('users').where('email', '==', normalized).limit(1).get();
  const match = result.empty
    ? (await db.collection('users').get()).docs.find((doc) =>
      String(doc.data().email || '').trim().toLowerCase() === normalized)
    : result.docs[0];
  return match ? userForAuthentication(toLegacyShape(match.id, match.data(), 'users')) : null;
}
export async function getUserById(id) {
  const user = await readDoc('users', id);
  if (!user) return null;
  const { password_hash, ...profile } = user;
  return profile;
}
export async function createUser({ id, name, email, password }) {
  if (!id || !name || !email || typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new Error('Missing or invalid required user fields');
  }
  const user = {
    id, name, email: email.toLowerCase(), role: 'USER',
    created_at: now().toISOString(), password_hash: await hashPassword(password),
  };
  if (!isPasswordHash(user.password_hash)) throw new Error('Password hashing failed.');
  await db.collection('users').doc(String(id)).create(serialize(user));
  const { password_hash, ...publicUser } = user;
  return publicUser;
}
export async function getVehicleById(id) { return readDoc('vehicles', id); }

async function recordsForOwner(collection, ownerId, legacyOwnerField = 'ownerId') {
  const [canonical, legacy] = await Promise.all([
    db.collection(collectionNames[collection]).where('user_id', '==', ownerId).get(),
    db.collection(collectionNames[collection]).where(legacyOwnerField, '==', ownerId).get(),
  ]);
  const docs = new Map();
  for (const doc of [...canonical.docs, ...legacy.docs]) docs.set(doc.id, doc);
  return [...docs.values()].map((doc) => toLegacyShape(doc.id, doc.data(), collection));
}
const activeForVehicle = (services, vehicleId) => services.filter((service) =>
  service.vehicle_id === vehicleId && service.status === 'ACTIVE').sort(byDateStart)[0] || null;

export async function listVehiclesForAdmin() {
  const [vehicles, users, services] = await Promise.all([
    readAll('vehicles'), readAll('users'), readAll('services'),
  ]);
  const owners = new Map(users.map((user) => [user.id, user]));
  return vehicles.map((vehicle) => {
    const owner = owners.get(vehicle.user_id);
    const latest = services.filter((s) => s.vehicle_id === vehicle.id).sort(byDateStart)[0];
    const isActive = latest?.status === 'ACTIVE' && new Date(latest.date_end) > now();
    const days = latest ? calculateDaysRemaining(latest.date_end, now()) : 0;
    return {
      ...vehicle, userId: vehicle.user_id, createdAt: vehicle.created_at,
      owner: vehicle.owner_name || vehicle.owner_email ? {
        id: owner?.id || null, name: vehicle.owner_name || owner?.name || '',
        email: vehicle.owner_email || owner?.email || '',
      } : null,
      service: latest ? {
        id: latest.id, status: isActive ? getServiceStatus(days) : latest.status,
        isActive, dateStart: latest.date_start, dateEnd: latest.date_end, daysRemaining: days,
      } : null,
    };
  }).sort((a, b) => a.plate.localeCompare(b.plate));
}
export async function listAdminServiceHistory() {
  const [services, vehicles, users] = await Promise.all([readAll('services'), readAll('vehicles'), readAll('users')]);
  const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
  const userMap = new Map(users.map((u) => [u.id, u]));
  return services.map((service) => {
    const vehicle = vehicleMap.get(service.vehicle_id);
    const owner = userMap.get(service.user_id);
    return {
      ...service, userId: service.user_id, vehicleId: service.vehicle_id,
      vehiclePlate: vehicle?.plate || 'Vehículo eliminado', vehicleType: service.vehicle_type,
      planId: service.plan_id, paymentMethod: service.payment_method, dateStart: service.date_start,
      dateEnd: service.date_end, owner: vehicle ? {
        name: vehicle.owner_name || owner?.name || '', email: vehicle.owner_email || owner?.email || '',
      } : null, daysRemaining: calculateDaysRemaining(service.date_end, now()),
    };
  }).sort(byDateStart);
}

export async function setVehicleServiceState(vehicleId, isActive, days = 30) {
  if (typeof isActive !== 'boolean') throw new Error('Service state must be active or inactive.');
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('Service duration must be between 1 and 365 days.');
  const vehicleRef = db.collection('vehicles').doc(String(vehicleId));
  const servicesRef = db.collection('services');
  const stateRef = db.collection('serviceState').doc(String(vehicleId));
  return db.runTransaction(async (transaction) => {
    const [vehicleDoc, stateDoc] = await Promise.all([
      transaction.get(vehicleRef), transaction.get(stateRef),
    ]);
    const saveState = (data) => {
      if (stateDoc.exists) transaction.set(stateRef, data, { merge: true });
      else transaction.create(stateRef, data);
    };
    if (!vehicleDoc.exists) throw new Error('Vehicle not found.');
    const vehicle = toLegacyShape(vehicleDoc.id, vehicleDoc.data(), 'vehicles');
    let active = null;
    let latest = null;
    if (stateDoc.exists) {
      const state = stateDoc.data();
      const ids = [...new Set([state.activeServiceId, state.latestServiceId].filter(Boolean))];
      const docs = await Promise.all(ids.map((id) => transaction.get(servicesRef.doc(String(id)))));
      const byId = new Map(docs.filter((doc) => doc.exists)
        .map((doc) => [doc.id, toLegacyShape(doc.id, doc.data(), 'services')]));
      active = state.activeServiceId ? byId.get(state.activeServiceId) || null : null;
      latest = state.latestServiceId ? byId.get(state.latestServiceId) || null : null;
      if (active?.status !== 'ACTIVE') active = null;
    } else {
      // One-time compatibility read for records migrated before the transactional
      // per-vehicle state index existed. Every writer creates that index.
      const [canonical, legacy] = await Promise.all([
        transaction.get(servicesRef.where('vehicle_id', '==', vehicleId)),
        transaction.get(servicesRef.where('vehicleId', '==', vehicleId)),
      ]);
      const docs = new Map([...canonical.docs, ...legacy.docs].map((doc) => [doc.id, doc]));
      const services = [...docs.values()].map((doc) => toLegacyShape(doc.id, doc.data(), 'services')).sort(byDateStart);
      active = services.find((service) => service.status === 'ACTIVE') || null;
      latest = services[0] || null;
    }
    const stamp = now();
    if (!isActive) {
      if (!active || new Date(active.date_end) <= stamp) {
        saveState({
          vehicleId: String(vehicleId),
          activeServiceId: null,
          latestServiceId: latest?.id || null,
          updatedAt: stamp.toISOString(),
        });
        return {
          id: latest?.id || null, vehicleId, status: latest?.status === 'ACTIVE' ? 'EXPIRED' : latest?.status || 'INACTIVE',
          isActive: false, dateStart: latest?.date_start || null, dateEnd: latest?.date_end || null, daysRemaining: 0,
        };
      }
      transaction.update(servicesRef.doc(active.id), { status: 'INACTIVE' });
      saveState({
        vehicleId: String(vehicleId), activeServiceId: null, latestServiceId: active.id,
        updatedAt: stamp.toISOString(),
      });
      return { id: active.id, vehicleId, status: 'INACTIVE', isActive: false,
        dateStart: active.date_start, dateEnd: active.date_end, daysRemaining: 0 };
    }
    if (active && new Date(active.date_end) > stamp) {
      const remaining = calculateDaysRemaining(active.date_end, stamp);
      saveState({
        vehicleId: String(vehicleId), activeServiceId: active.id, latestServiceId: active.id,
        updatedAt: stamp.toISOString(),
      });
      return { id: active.id, vehicleId, status: getServiceStatus(remaining), isActive: true,
        dateStart: active.date_start, dateEnd: active.date_end, daysRemaining: remaining };
    }
    const serviceId = `service_${randomUUID()}`;
    const dateStart = stamp.toISOString();
    const dateEnd = new Date(stamp.getTime() + days * 86400000).toISOString();
    const service = {
      id: serviceId, user_id: vehicle.user_id ?? vehicle.ownerId, vehicle_id: vehicle.id,
      vehicle_type: vehicle.type, plan_id: 'manual_admin', payment_method: 'ADMIN',
      amount: 0, status: 'ACTIVE', date_start: dateStart, date_end: dateEnd,
    };
    const expiredService = active || (latest?.status === 'ACTIVE' && new Date(latest.date_end) <= stamp
      ? latest
      : null);
    if (expiredService) transaction.update(servicesRef.doc(expiredService.id), { status: 'EXPIRED' });
    transaction.create(servicesRef.doc(serviceId), service);
    saveState({
      vehicleId: String(vehicleId), activeServiceId: serviceId, latestServiceId: serviceId,
      updatedAt: stamp.toISOString(),
    });
    return { id: serviceId, vehicleId, status: 'ACTIVE', isActive: true, dateStart, dateEnd, daysRemaining: days };
  });
}

export async function createVehicle({ userId, type, plate, brand = '', model = '', ownerName, ownerEmail }) {
  if (!userId || !['CAR', 'MOTORCYCLE'].includes(String(type).toUpperCase())
    || !/^[A-Z0-9-]{2,12}$/i.test(plate || '') || !ownerName?.trim() || ownerName.trim().length > 120
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail || '') || ownerEmail.length > 254
    || String(brand).length > 100 || String(model).length > 100) {
    throw new Error('Missing required vehicle fields');
  }
  const normalizedPlate = plate.trim().toUpperCase();
  const userRef = db.collection('users').doc(String(userId));
  const id = `veh_${randomUUID()}`;
  const plateLockId = deterministicDocumentId(`${userId}\u0000${normalizedPlate}`);
  const plateLockRef = db.collection('vehiclePlateLocks').doc(plateLockId);
  const vehicle = {
    id, user_id: userId, type: String(type).toUpperCase(), plate: normalizedPlate,
    brand: String(brand).trim(), model: String(model).trim(), owner_name: ownerName.trim(),
    owner_email: ownerEmail.trim().toLowerCase(), created_at: now().toISOString(),
  };
  await db.runTransaction(async (transaction) => {
    const user = await transaction.get(userRef);
    if (!user.exists || user.data().role !== 'ADMIN') throw new Error('Administrator not found.');
    const [lock, sameOwnerPlate, legacyOwnerPlate] = await Promise.all([
      transaction.get(plateLockRef),
      transaction.get(db.collection('vehicles').where('user_id', '==', userId)),
      transaction.get(db.collection('vehicles').where('ownerId', '==', userId)),
    ]);
    const duplicate = [...new Map([...sameOwnerPlate.docs, ...legacyOwnerPlate.docs].map((doc) => [doc.id, doc])).values()]
      .some((doc) => String(doc.data().plate || '').trim().toUpperCase() === normalizedPlate);
    if (lock.exists || duplicate) {
      const error = new Error('This plate is already registered.');
      error.code = 6;
      error.errcode = 2067;
      throw error;
    }
    transaction.create(plateLockRef, { vehicleId: id, ownerId: userId, plate: normalizedPlate });
    transaction.create(db.collection('vehicles').doc(id), vehicle);
  });
  return vehicle;
}
export async function updateVehicle(vehicleId, userId, { type, plate, brand = '', model = '', ownerName, ownerEmail }, allowAnyOwner = false) {
  const ref = db.collection('vehicles').doc(String(vehicleId));
  const cleanPlate = typeof plate === 'string' ? plate.trim().toUpperCase() : '';
  if (!['CAR', 'MOTORCYCLE'].includes(String(type).toUpperCase())
    || !/^[A-Z0-9-]{2,12}$/i.test(cleanPlate) || !ownerName?.trim() || ownerName.trim().length > 120
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail || '') || ownerEmail.length > 254
    || String(brand).length > 100 || String(model).length > 100) {
    throw new Error('Vehicle type, plate and owner details are required');
  }
  return db.runTransaction(async (transaction) => {
    const doc = await transaction.get(ref);
    if (!doc.exists) throw new Error('Vehicle not found');
    const vehicle = toLegacyShape(doc.id, doc.data(), 'vehicles');
    if (!allowAnyOwner && vehicle.user_id !== userId) throw new Error('Vehicle not found');
    const ownerId = vehicle.user_id;
    const oldLock = db.collection('vehiclePlateLocks').doc(
      deterministicDocumentId(`${ownerId}\u0000${vehicle.plate}`),
    );
    const newLock = db.collection('vehiclePlateLocks').doc(
      deterministicDocumentId(`${ownerId}\u0000${cleanPlate}`),
    );
    const [oldLockDoc, newLockDoc, ownedVehicles, legacyOwnedVehicles] = await Promise.all([
      transaction.get(oldLock), transaction.get(newLock),
      transaction.get(db.collection('vehicles').where('user_id', '==', ownerId)),
      transaction.get(db.collection('vehicles').where('ownerId', '==', ownerId)),
    ]);
    const duplicatePlate = [...new Map([...ownedVehicles.docs, ...legacyOwnedVehicles.docs]
      .map((item) => [item.id, item])).values()]
      .some((other) => other.id !== doc.id
        && String(other.data().plate || '').trim().toUpperCase() === cleanPlate);
    if (duplicatePlate) {
      const error = new Error('This plate is already registered.');
      error.code = 6;
      error.errcode = 2067;
      throw error;
    }
    const changes = {
      type: String(type).toUpperCase(), plate: cleanPlate, brand: String(brand).trim(),
      model: String(model).trim(), owner_name: ownerName.trim(), owner_email: ownerEmail.trim().toLowerCase(),
    };
    if (cleanPlate !== vehicle.plate) {
      if (newLockDoc.exists && newLockDoc.data().vehicleId !== doc.id) {
        const error = new Error('This plate is already registered.');
        error.code = 6;
        error.errcode = 2067;
        throw error;
      }
      if (oldLockDoc.exists && oldLockDoc.data().vehicleId === doc.id) transaction.delete(oldLock);
    }
    if (!newLockDoc.exists) {
      transaction.create(newLock, { vehicleId: doc.id, ownerId, plate: cleanPlate });
    }
    transaction.update(ref, changes);
    return { ...vehicle, ...changes, userId: vehicle.user_id, createdAt: vehicle.created_at };
  });
}
export async function listVehiclesForUser(userId) {
  return (await recordsForOwner('vehicles', userId)).sort(byCreated)
    .map((v) => ({ ...v, userId: v.user_id, createdAt: v.created_at }));
}
export async function searchParkingRecords(userId, query = '') {
  const [user, vehicles, services] = await Promise.all([
    getUserById(userId), listVehiclesForUser(userId), listServiceHistory(userId),
  ]);
  const term = String(query).trim().toLowerCase();
  if (!term) return { owner: user ? { id: user.id, name: user.name, email: user.email } : null, vehicles, services };
  const matches = (values) => values.some((value) => String(value ?? '').toLowerCase().includes(term));
  const matchedVehicles = vehicles.filter((v) => matches([v.plate, v.type, v.brand, v.model, v.id]));
  const matchedServices = services.filter((s) => matches([s.id, s.vehicleId, s.vehicleType, s.planId, s.paymentMethod, s.status, s.dateStart, s.dateEnd, s.amount]));
  const ownerMatches = user && matches([user.name, user.email, user.id]);
  const vehicleIds = new Set(matchedVehicles.map((v) => v.id));
  return {
    owner: ownerMatches ? { id: user.id, name: user.name, email: user.email } : null,
    vehicles: ownerMatches ? vehicles : matchedVehicles,
    services: ownerMatches ? services : matchedServices.filter((s) => vehicleIds.has(s.vehicleId)),
  };
}
async function activeServicesForOwner(userId) {
  return (await recordsForOwner('services', userId)).filter((s) => s.status === 'ACTIVE').sort(byDateStart);
}
export async function getActiveServiceForUser(userId) {
  const service = (await activeServicesForOwner(userId))[0];
  if (!service) return null;
  const daysRemaining = calculateDaysRemaining(service.date_end, now());
  return { ...service, userId: service.user_id, vehicleId: service.vehicle_id, vehicleType: service.vehicle_type,
    dateStart: service.date_start, dateEnd: service.date_end, daysRemaining, status: getServiceStatus(daysRemaining) };
}
export async function getActiveServiceForVehicle(userId, vehicleId) {
  const service = activeForVehicle(await activeServicesForOwner(userId), vehicleId);
  if (!service) return null;
  const daysRemaining = calculateDaysRemaining(service.date_end, now());
  return { ...service, userId: service.user_id, vehicleId: service.vehicle_id, vehicleType: service.vehicle_type,
    dateStart: service.date_start, dateEnd: service.date_end, daysRemaining, status: getServiceStatus(daysRemaining) };
}
export async function createServicePurchase({ userId, vehicleId, planId, paymentMethod, amount }) {
  const validated = validatePurchaseInput({ userId, vehicleId, planId, paymentMethod, amount });
  const result = await db.runTransaction(async (transaction) => {
    const vehicleRef = db.collection('vehicles').doc(String(vehicleId));
    const vehicleDoc = await transaction.get(vehicleRef);
    if (!vehicleDoc.exists) throw new Error('Vehicle not found');
    const vehicle = toLegacyShape(vehicleDoc.id, vehicleDoc.data(), 'vehicles');
    if (vehicle.user_id !== userId) throw new Error('Vehicle not found');
    const [canonical, legacy] = await Promise.all([
      transaction.get(db.collection('services').where('vehicle_id', '==', vehicleId)),
      transaction.get(db.collection('services').where('vehicleId', '==', vehicleId)),
    ]);
    const all = [...new Map([...canonical.docs, ...legacy.docs].map((doc) => [doc.id, doc])).values()]
      .map((doc) => toLegacyShape(doc.id, doc.data(), 'services'));
    const current = all.find((s) => s.status === 'ACTIVE' && new Date(s.date_end) > now());
    const renewal = !!current || all.length > 0;
    const start = now();
    const end = new Date((current ? new Date(current.date_end) : start).getTime() + 30 * 86400000);
    const serviceId = `service_${randomUUID()}`;
    const service = {
      id: serviceId, user_id: userId, vehicle_id: vehicleId, vehicle_type: vehicle.type,
      plan_id: validated.planId, payment_method: validated.paymentMethod, amount: validated.amount,
      status: 'ACTIVE', date_start: start.toISOString(), date_end: end.toISOString(),
    };
    if (current) transaction.update(db.collection('services').doc(current.id), { status: 'RENEWED' });
    transaction.create(db.collection('services').doc(serviceId), service);
    return { service, renewal, plate: vehicle.plate };
  });
  const daysRemaining = calculateDaysRemaining(result.service.date_end, now());
  return { ...result.service, userId, vehicleId, vehicleType: result.service.vehicle_type, daysRemaining,
    isRenewal: result.renewal, message: result.renewal
      ? `Servicio renovado con éxito para ${result.plate}. Vigencia extendida por 30 días adicionales.`
      : `Servicio activado con éxito para ${result.plate}.` };
}
export async function listServiceHistory(userId) {
  return (await recordsForOwner('services', userId)).map((s) => ({
    ...s, userId: s.user_id, vehicleId: s.vehicle_id, vehicleType: s.vehicle_type, planId: s.plan_id,
    paymentMethod: s.payment_method, dateStart: s.date_start, dateEnd: s.date_end,
    daysRemaining: calculateDaysRemaining(s.date_end, now()),
  })).sort((a, b) => new Date(b.dateStart) - new Date(a.dateStart));
}
export async function getServiceSummaryForUser(userId) {
  const service = await getActiveServiceForUser(userId);
  if (!service) return { hasActiveService: false, status: 'INACTIVE', daysRemaining: 0, message: 'No active service found' };
  return { hasActiveService: true, status: service.status, daysRemaining: service.daysRemaining,
    vehicleId: service.vehicleId, vehicleType: service.vehicleType, dateStart: service.dateStart,
    dateEnd: service.dateEnd, message: service.status === 'PENDING' ? 'Servicio próximo a vencer' : 'Servicio activo y vigente' };
}
export async function getServiceSummaryForVehicle(userId, vehicleId) {
  const [vehicle, service] = await Promise.all([getVehicleById(vehicleId), getActiveServiceForVehicle(userId, vehicleId)]);
  const owned = vehicle?.user_id === userId ? vehicle : null;
  if (!service) return { hasActiveService: false, status: 'INACTIVE', daysRemaining: 0, vehicleId,
    vehiclePlate: owned?.plate || null, vehicleType: owned?.type || null,
    message: owned ? `Sin servicio activo para ${owned.plate}` : 'No active service found' };
  return { hasActiveService: true, status: service.status, daysRemaining: service.daysRemaining, vehicleId,
    vehiclePlate: owned?.plate || null, vehicleType: service.vehicleType, dateStart: service.dateStart, dateEnd: service.dateEnd,
    message: service.status === 'PENDING' ? `Servicio próximo a vencer para ${owned?.plate || vehicleId}`
      : `Servicio activo y vigente para ${owned?.plate || vehicleId}` };
}
export async function listNotificationsForUser(userId) {
  return (await recordsForOwner('notifications', userId)).sort(byCreated)
    .map((n) => ({ ...n, userId: n.user_id, createdAt: n.created_at }));
}
export async function listDeviceTokensForUser(userId) {
  return (await recordsForOwner('deviceTokens', userId)).map((item) => item.token);
}
export async function registerNotificationToken(userId, token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096 || /[\r\n]/.test(token)) {
    throw new Error('A valid device token is required.');
  }
  const id = `token_${randomUUID()}`;
  const entry = { id, user_id: userId, token, created_at: now().toISOString() };
  await db.runTransaction(async (transaction) => {
    const matching = await transaction.get(db.collection('deviceTokens').where('token', '==', token).limit(1));
    if (!matching.empty) {
      const existing = matching.docs[0];
      if ((existing.data().user_id ?? existing.data().ownerId) !== userId) {
        transaction.update(existing.ref, { user_id: userId, ownerId: FieldValue.delete() });
      }
      return;
    }
    transaction.create(db.collection('deviceTokens').doc(id), entry);
  });
  return { message: 'Device token registered successfully' };
}
export async function queueNotification({ userId, type, message, idempotencyKey }) {
  if (typeof type !== 'string' || !/^[A-Z_]{2,32}$/.test(type)
    || typeof message !== 'string' || !message.trim() || message.length > 1000) {
    throw new Error('A valid notification type and message are required.');
  }
  const id = idempotencyKey ? `reminder_${idempotencyKey}` : `notif_${randomUUID()}`;
  const createdAt = now().toISOString();
  const entry = { id, user_id: userId, type, message: message.trim(), status: 'QUEUED', created_at: createdAt };
  const ref = db.collection('notifications').doc(id);
  const created = await db.runTransaction(async (transaction) => {
    const prior = await transaction.get(ref);
    if (prior.exists) return false;
    transaction.create(ref, entry);
    return true;
  });
  const response = { ...entry, userId, createdAt };
  Object.defineProperty(response, 'created', { value: created, enumerable: false });
  return response;
}
export async function listActiveServices() {
  const snapshot = await db.collection('services').where('status', '==', 'ACTIVE').get();
  return snapshot.docs.map((doc) => toLegacyShape(doc.id, doc.data(), 'services'));
}

export async function checkStorageHealth() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) return false;
  const snapshot = await db.collection('users').where('email', '==', email).limit(1).get();
  return !snapshot.empty;
}
