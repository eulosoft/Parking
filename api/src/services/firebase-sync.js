import { firebaseFirestore } from '../config/firebase.js';
import { isPasswordHash } from './password.js';

const collections = {
  users: 'users',
  vehicles: 'vehicles',
  services: 'services',
  notifications: 'notifications',
  deviceTokens: 'deviceTokens',
};

const clean = (value) => Object.fromEntries(
  Object.entries(value).filter(([, entry]) => entry !== undefined),
);

export async function mirrorDocument(collection, id, data) {
  if (!firebaseFirestore || !id) {
    return { synced: false, reason: 'Firebase Firestore not configured' };
  }

  try {
    await firebaseFirestore.collection(collections[collection] || collection).doc(String(id)).set(clean(data), { merge: true });
    return { synced: true };
  } catch (error) {
    console.error('Firestore mirror failed.');
    return { synced: false, reason: 'Firestore write failed' };
  }
}

export async function mirrorStore(store) {
  if (!firebaseFirestore) {
    return { synced: 0, skipped: true };
  }

  const entries = [
    ...store.users.map((item) => mirrorDocument('users', item.id, {
      name: item.name,
      email: item.email,
      ...(isPasswordHash(item.password) ? { password_hash: item.password } : {}),
      createdAt: item.created_at,
    })),
    ...store.vehicles.map((item) => mirrorDocument('vehicles', item.id, {
      ownerId: item.user_id,
      type: item.type,
      plate: item.plate,
      brand: item.brand,
      model: item.model,
      ownerName: item.owner_name,
      ownerEmail: item.owner_email,
      createdAt: item.created_at,
    })),
    ...store.services.map((item) => mirrorDocument('services', item.id, {
      ownerId: item.user_id,
      vehicleId: item.vehicle_id,
      vehicleType: item.vehicle_type,
      planId: item.plan_id,
      paymentMethod: item.payment_method,
      amount: item.amount,
      status: item.status,
      dateStart: item.date_start,
      dateEnd: item.date_end,
      createdAt: item.created_at,
    })),
    ...store.notifications.map((item) => mirrorDocument('notifications', item.id, {
      ownerId: item.user_id,
      type: item.type,
      message: item.message,
      status: item.status,
      createdAt: item.created_at,
    })),
    ...store.deviceTokens.map((item) => mirrorDocument('deviceTokens', item.id, {
      ownerId: item.user_id,
      token: item.token,
      createdAt: item.created_at,
    })),
  ];

  const results = await Promise.all(entries);
  return { synced: results.filter((result) => result.synced).length, skipped: false };
}