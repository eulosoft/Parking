import { isPasswordHash } from '../services/password.js';

const withoutUndefined = (value) => Object.fromEntries(
  Object.entries(value).filter(([, item]) => item !== undefined),
);

// Explicit allow-lists are intentional: users.password and any future secret
// columns can never leak to the Firestore migration payload.
export function toFirestoreDocument(table, row) {
  switch (table) {
    case 'users':
      if (!isPasswordHash(row.password_hash)) {
        throw new Error('User migration requires a valid scrypt password hash.');
      }
      return withoutUndefined({
        id: String(row.id), name: row.name, email: row.email, role: row.role || 'USER',
        created_at: row.created_at, password_hash: row.password_hash,
      });
    case 'vehicles':
      return withoutUndefined({
        id: String(row.id), user_id: row.user_id, type: row.type, plate: row.plate,
        brand: row.brand, model: row.model, owner_name: row.owner_name,
        owner_email: row.owner_email, created_at: row.created_at,
      });
    case 'services':
      return withoutUndefined({
        id: String(row.id), user_id: row.user_id, vehicle_id: row.vehicle_id,
        vehicle_type: row.vehicle_type, plan_id: row.plan_id, payment_method: row.payment_method,
        amount: row.amount, status: row.status, date_start: row.date_start,
        date_end: row.date_end, created_at: row.created_at,
      });
    case 'notifications':
      return withoutUndefined({
        id: String(row.id), user_id: row.user_id, type: row.type, message: row.message,
        status: row.status, created_at: row.created_at,
      });
    case 'device_tokens':
      return withoutUndefined({
        id: String(row.id), user_id: row.user_id, token: row.token, created_at: row.created_at,
      });
    default:
      throw new Error('Unsupported SQLite table.');
  }
}

export const FIRESTORE_COLLECTION_BY_TABLE = Object.freeze({
  users: 'users',
  vehicles: 'vehicles',
  services: 'services',
  notifications: 'notifications',
  device_tokens: 'deviceTokens',
});
