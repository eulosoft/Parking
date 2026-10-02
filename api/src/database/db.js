import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'url';
import path from 'path';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { hashPassword, isPasswordHash, verifyPassword } from '../services/password.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configuredDatabasePath = process.env.DATABASE_PATH?.trim();
if (process.env.NODE_ENV === 'production' && !configuredDatabasePath) {
  throw new Error('DATABASE_PATH must point to persistent storage in production.');
}
const dbPath = configuredDatabasePath
  ? path.resolve(configuredDatabasePath)
  : path.resolve(__dirname, '../../parking.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON;');

export const run = (sql, params = []) => {
  const statement = db.prepare(sql);
  const result = statement.run(...params);
  return { id: result.lastInsertRowid ?? null, changes: result.changes ?? 0 };
};

export const get = (sql, params = []) => {
  const statement = db.prepare(sql);
  return statement.get(...params) ?? null;
};

export const all = (sql, params = []) => {
  const statement = db.prepare(sql);
  return statement.all(...params);
};

export async function initializeDatabase() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('ADMIN', 'USER')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const userColumns = await all('PRAGMA table_info(users)');
  if (!userColumns.some((column) => column.name === 'role')) {
    await run("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'USER'");
  }

  await run(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      plate TEXT NOT NULL,
      brand TEXT,
      model TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);
  const vehicleColumns = await all('PRAGMA table_info(vehicles)');
  if (!vehicleColumns.some((column) => column.name === 'owner_name')) {
    await run('ALTER TABLE vehicles ADD COLUMN owner_name TEXT');
  }
  if (!vehicleColumns.some((column) => column.name === 'owner_email')) {
    await run('ALTER TABLE vehicles ADD COLUMN owner_email TEXT');
  }
  await run(`
    UPDATE vehicles
    SET owner_name = (SELECT name FROM users WHERE users.id = vehicles.user_id),
        owner_email = (SELECT email FROM users WHERE users.id = vehicles.user_id)
    WHERE owner_name IS NULL OR owner_email IS NULL
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      vehicle_id TEXT NOT NULL,
      vehicle_type TEXT NOT NULL,
      plan_id TEXT,
      payment_method TEXT,
      amount REAL,
      status TEXT DEFAULT 'ACTIVE',
      date_start TEXT NOT NULL,
      date_end TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id)
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'QUEUED',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS device_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      token TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, token),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  await run('CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_user_plate ON vehicles(user_id, plate);');

  const demoUser = await get('SELECT id, password FROM users WHERE email = ?', ['user@demo.com']);
  if (demoUser?.password === 'demo123') {
    await run('DELETE FROM device_tokens WHERE user_id = ?', [demoUser.id]);
    await run('DELETE FROM notifications WHERE user_id = ?', [demoUser.id]);
    await run('DELETE FROM services WHERE user_id = ?', [demoUser.id]);
    await run('DELETE FROM vehicles WHERE user_id = ?', [demoUser.id]);
    await run('DELETE FROM users WHERE id = ?', [demoUser.id]);
  }

  const users = await all('SELECT id, password FROM users');
  for (const user of users) {
    if (!isPasswordHash(user.password)) {
      await run('UPDATE users SET password = ? WHERE id = ?', [
        await hashPassword(user.password),
        user.id,
      ]);
    }
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (Boolean(adminEmail) !== Boolean(adminPassword)) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must both be configured.');
  }

  if (adminEmail && adminPassword) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
      throw new Error('ADMIN_EMAIL must be a valid email address.');
    }
    if (adminPassword.length < 16 || adminPassword.length > 128) {
      throw new Error('ADMIN_PASSWORD must contain between 16 and 128 characters.');
    }

    const existingAdmin = await get(
      'SELECT id, password, role FROM users WHERE email = ?',
      [adminEmail],
    );
    if (existingAdmin) {
      const updates = [];
      const values = [];
      const adminName = process.env.ADMIN_NAME?.trim() || 'Parking Administrator';
      if (existingAdmin.role !== 'ADMIN') {
        updates.push("role = 'ADMIN'");
      }
      if (existingAdmin.password && !(await verifyPassword(adminPassword, existingAdmin.password))) {
        updates.push('password = ?');
        values.push(await hashPassword(adminPassword));
      }
      if ((await get('SELECT name FROM users WHERE id = ?', [existingAdmin.id])).name !== adminName) {
        updates.push('name = ?');
        values.push(adminName);
      }
      if (updates.length > 0) {
        values.push(existingAdmin.id);
        await run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
      }
    } else {
      await run(
        "INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, 'ADMIN')",
        [
          `admin_${randomUUID()}`,
          process.env.ADMIN_NAME?.trim() || 'Parking Administrator',
          adminEmail,
          await hashPassword(adminPassword),
        ],
      );
    }
  }
}
